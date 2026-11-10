/**
 * 标记指令桥：轮询主聊天里「角色最近一条回复」，解析 [[mp:play:歌名]] 这类标记并执行。
 *
 * 为什么要有它：宿主的 chat.tools 是「tool_call → 执行 → 再请求一次」两轮，
 * 每次点歌多花一次模型调用。让模型直接把指令写在正文里，插件解析，就只要一次。
 *
 * 拿不到会话消息（宿主没开放 memory）时自动降级为工具模式，不报错。
 */

import { parseCommands, dedupeKey, parseRecommendArg, isPlaceholderArg } from '../core/marker.js';
import { pickPendingCommands } from '../core/pendingCommands.js';
import { getBridge } from './bridge.js';
import { isOn } from './listenState.js';
import { addTrackForChar, saveComment, createCharPlaylist, RECOMMEND_PLAYLIST_NAME } from '../services/taStore.js';
import { createSources } from '../services/sources.js';
import { createNativeAudio } from '../services/nativeAudio.js';
import { readChatSettings } from '../services/chatSettings.js';
import { markRebuildNeeded, readQueueMirror } from '../services/queueSignals.js';
import { trackKey } from '../core/track.js';

var POLL_MS = 2500;
var MAX_EXECUTED = 200;

var runtime = {
  conversationId: '',
  characterId: '',
  characterName: '',
  // App 挂载时用的那份 roche 是完整的（含 chat），聊天回调里的 window.roche 常常没有 chat
  roche: null,
  mode: 'mark', // mark | tool
  degraded: false,
  // 读消息连续失败次数：到 5 次才降级，读到一次就清零
  readFailures: 0,
  // 执行失败的重试计数（同一个 key 最多重试 2 次）
  retries: Object.create(null),
  timer: null,
  executed: [],
  lastMessageId: ''
};

/** App 挂载时把完整的 roche（含 chat）交进来，标记通道发卡片要用 */
export function setRoche(raw) {
  if (raw && raw.chat) runtime.roche = raw;
}

function resolveRoche() {
  if (runtime.roche) return runtime.roche;
  if (typeof window === 'undefined') return null;
  // 宿主不同版本可能暴露成 Roche / roche，两个都认
  return window.Roche || window.roche || null;
}

function chatListenOn() {
  return isOn(runtime.conversationId, true);
}

/**
 * 从 ctx 里尽量把角色 ID 挖出来。
 * 宿主不同版本给的东西不一样：有的给 contact，有的只在 conversation 上挂 contactId / peerId；
 * 取不到就会让角色歌单/乐评挂在空 ID 上，TA 页按 ID 分组建不出块（整页空白）。
 */
function characterIdOf(ctx) {
  if (!ctx) return '';
  var contact = ctx.contact || ctx.character || ctx.characterInfo || null;
  if (contact && contact.id) return String(contact.id);

  var keys = ['contactId', 'characterId', 'targetId', 'peerId'];
  for (var i = 0; i < keys.length; i++) {
    if (ctx[keys[i]]) return String(ctx[keys[i]]);
  }

  var conv = ctx.conversation || null;
  if (conv) {
    for (var j = 0; j < keys.length; j++) {
      if (conv[keys[j]]) return String(conv[keys[j]]);
    }
  }
  return '';
}

function characterNameOf(ctx) {
  var contact = (ctx && (ctx.contact || ctx.character || ctx.characterInfo)) || null;
  if (contact) {
    var name = contact.name || contact.nickname || contact.handle || contact.displayName || '';
    if (name) return String(name);
  }
  var conv = ctx && ctx.conversation;
  return String((conv && (conv.title || conv.name)) || '');
}

/** contextProvider 每轮调用：记住当前会话与角色，供轮询使用 */
export function noteConversation(ctx) {
  if (!ctx) return;
  var cid = ctx.conversationId || (ctx.conversation && ctx.conversation.id) || '';
  if (cid) runtime.conversationId = cid;

  var id = characterIdOf(ctx);
  if (id) {
    runtime.characterId = id;
    var name = characterNameOf(ctx);
    if (name) runtime.characterName = name;
  }
}

export function setCommandMode(mode) {
  runtime.mode = mode === 'mark' ? 'mark' : (mode === 'tool' ? 'tool' : 'hybrid');
  runtime.degraded = false;
  runtime.readFailures = 0;
  runtime.retries = Object.create(null);
}

export function commandStatus() {
  return {
    mode: runtime.mode,
    degraded: runtime.degraded,
    conversationId: runtime.conversationId,
    characterId: runtime.characterId
  };
}

/* ---------------- 执行动作 ---------------- */

function nativePlugin() {
  if (typeof window === 'undefined') return null;
  var cap = window.Capacitor;
  var plugin = cap && cap.Plugins ? cap.Plugins.BackgroundAudio : null;
  return plugin && typeof plugin.getStatus === 'function' ? plugin : null;
}

async function readSettings(roche) {
  try {
    return await readChatSettings(roche);
  } catch (err) {
    return await readChatSettings(null);
  }
}

/** 无 App 时也把歌播起来（只传这一首，避免状态栏队列被塞满） */
async function headlessPlay(keyword, roche, settings) {
  var native = nativePlugin();
  if (!native) return { ok: false, reason: '没有可用的原生播放器' };

  var sources = createSources();
  var found = await sources.search(keyword, settings, { limit: 6 });
  if (!found.tracks.length) return { ok: false, reason: '没搜到这首歌' };

  var track = found.tracks[0];
  var url = '';
  try {
    url = await sources.createResolver(track, settings)();
  } catch (err) {
    url = '';
  }
  if (!url) return { ok: false, reason: '拿不到播放地址' };

  await native.replaceQueue({
    tracks: [{
      id: trackKey(track),
      albumId: track.album || '',
      title: track.name,
      artist: track.artist || '',
      cover: track.cover || '',
      url: url
    }],
    startIndex: 0,
    mode: 'loop',
    autoplay: true
  });
  // 原生队列现在只有这一首：让 App（如果开着）尽快用完整队列重建窗口
  markRebuildNeeded();

  return { ok: true, track: track };
}

async function currentTrack(roche) {
  var bridge = getBridge();
  if (bridge && bridge.ready()) {
    var status = bridge.status();
    if (status && status.playing) return status.playing;
  }
  var native = nativePlugin();
  if (!native) return null;
  try {
    var res = await native.getStatus();
    var st = (res && res.status) || {};
    if (!st.title) return null;
    return { name: st.title, artist: st.artist || '', id: st.trackId || st.title, source: 'native' };
  } catch (err) {
    return null;
  }
}

/** 标记通道点歌成功后也发一张「一起听」卡片，和工具通道保持一致 */
async function pushListenCard(roche, track) {
  var host = runtime.roche && runtime.roche.chat ? runtime.roche : roche;
  if (!track || !host || !host.chat || typeof host.chat.createCard !== 'function') return;
  if (!runtime.conversationId) return;
  try {
    await host.chat.createCard({
      conversationId: runtime.conversationId,
      messageType: 'mp-listen',
      isMe: false,
      senderId: runtime.characterId || '',
      cardData: { track: track, status: 'listening', at: Date.now() },
      modelText: '我点开了《' + track.name + '》' + (track.artist ? ' - ' + track.artist : '') + '，和你一起听。'
    });
  } catch (err) { /* 卡片失败不影响播放 */ }
}

async function doPlay(keyword, roche, settings) {
  var bridge = getBridge();
  if (bridge && bridge.ready()) {
    var found = await bridge.search(keyword, 6);
    if (!found || !found.length) return { ok: false, reason: '没搜到这首歌' };

    if (settings.chatAddToQueue && typeof bridge.addAndPlay === 'function') {
      await bridge.addAndPlay([found[0]], 0);
    } else if (typeof bridge.playList === 'function') {
      await bridge.playList([found[0]], 0);
    }
    await pushListenCard(roche, found[0]);
    return { ok: true, track: found[0] };
  }

  var headless = await headlessPlay(keyword, roche, settings);
  if (headless.ok) await pushListenCard(roche, headless.track);
  return headless;
}

async function doControl(action) {
  var bridge = getBridge();
  if (bridge && bridge.ready()) {
    await bridge.control(action);
    return { ok: true };
  }
  var native = nativePlugin();
  if (!native) return { ok: false, reason: '没有可用的播放器' };
  var methods = { next: 'next', prev: 'previous', pause: 'pause', resume: 'play' };
  var method = methods[action];
  if (!method) return { ok: false, reason: '不支持的操作' };
  await native[method]();
  return { ok: true };
}

async function doAdd(roche) {
  var track = await currentTrack(roche);
  if (!track) return { ok: false, reason: '现在没有在放的歌' };

  var added = await addTrackForChar(roche, runtime.characterId, track);
  return added.ok
    ? { ok: true, playlist: added.playlist, created: added.created, duplicate: added.duplicate }
    : { ok: false, reason: added.reason };
}

/**
 * 角色写乐评时如果 App 那边刚好没有在播的歌，就别静默失败：
 * 依次回退到 App 队列最后一首 → 队列镜像里的当前曲 → 最近播放第一首。
 */
async function fallbackTrack(roche) {
  var bridge = getBridge();
  if (bridge && bridge.ready() && typeof bridge.queue === 'function') {
    try {
      var live = bridge.queue() || [];
      if (live.length) {
        var last = live[live.length - 1];
        if (last && last.track) return last.track;
      }
    } catch (err) { /* 忽略 */ }
  }

  var mirror = readQueueMirror();
  if (mirror && mirror.tracks && mirror.tracks.length) {
    var pos = Number(mirror.pos);
    if (Number.isFinite(pos) && mirror.tracks[pos]) return mirror.tracks[pos];
    return mirror.tracks[mirror.tracks.length - 1];
  }

  try {
    var recent = roche && roche.storage ? await roche.storage.get('mp:recent', []) : [];
    if (Array.isArray(recent) && recent.length) return recent[0];
  } catch (err) { /* 忽略 */ }

  return null;
}

async function doComment(text, roche) {
  var track = await currentTrack(roche);
  if (!track) track = await fallbackTrack(roche);
  if (!track) return { ok: false, reason: '现在没有在放的歌' };

  var saved = await saveComment(roche, runtime.characterId, track, text);
  return saved.ok ? { ok: true, text: saved.text } : { ok: false, reason: saved.reason };
}

async function doRecommend(roche, settings, arg) {
  var sources = createSources();

  // 支持两种写法：`关键词` 或 `歌单名|关键词`
  var parsed = parseRecommendArg(arg);
  var name = parsed.name;
  var keyword = parsed.keyword;

  // 模型照抄示例（歌单名|搜索关键词1 搜索关键词2）时不能拿它去搜，否则建出一堆垃圾
  if (parsed.placeholder) return { ok: false, reason: '照抄了示例文字，这次不建歌单' };

  // 没有关键词就什么都不做：以前这里会随机抽「夜晚 / 通勤」去搜歌，
  // 表现就是「角色没写指令，却凭空多出一个塞满歌的歌单」。
  if (!keyword) return { ok: false, reason: '没给搜索关键词' };

  var seeds = [keyword];

  var want = Math.max(6, Math.min(50, Number(settings && settings.recCount) || 20));
  var seen = Object.create(null);
  var artistCount = Object.create(null);
  var picked = [];

  try {
    for (var i = 0; i < seeds.length && picked.length < want; i++) {
      var found = await sources.search(seeds[i], settings, { limit: want });
      (found.tracks || []).forEach(function (t) {
        if (picked.length >= want || !t) return;
        var key = trackKey(t);
        if (!key || seen[key]) return;
        if (Number(t.payplay) > 0) return;           // 要付费/无版权的不进歌单
        var artist = String(t.artist || '').split('/')[0].trim() || '未知';
        if ((artistCount[artist] || 0) >= 2) return; // 单歌手最多 2 首
        seen[key] = true;
        artistCount[artist] = (artistCount[artist] || 0) + 1;
        picked.push(t);
      });
    }

    if (!picked.length) return { ok: false, reason: '没找到可推荐的歌' };

    // 歌单名由角色给；没给就带日期，避免覆盖旧歌单看不出变化
    var date = new Date();
    var suffix = (date.getMonth() + 1) + '/' + date.getDate();
    var title = name || (RECOMMEND_PLAYLIST_NAME + ' · ' + suffix);

    var made = await createCharPlaylist(roche, runtime.characterId, title, picked);
    return made.ok ? { ok: true, playlist: made.playlist, added: made.added } : { ok: false, reason: made.reason };
  } catch (err) {
    return { ok: false, reason: String((err && err.message) || err) };
  }
}

/**
 * 角色 ID 兜底：宿主没把 contact 传进来时，只看「唯一角色」。
 * 多角色绝不猜（会串号），宁可落成 ta 组让 TA 页兜底展示。
 */
async function ensureCharacterId(roche) {
  if (runtime.characterId) return runtime.characterId;

  var host = runtime.roche || roche || resolveRoche();
  try {
    var api = host && host.character;
    if (!api || typeof api.list !== 'function') return '';
    var list = await api.list();
    var items = (list || []).filter(function (c) {
      return c && (c.id || c.contactId);
    });
    if (items.length !== 1) return '';
    var one = items[0];
    runtime.characterId = String(one.id || one.contactId);
    runtime.characterName = String(one.handle || one.name || one.nickname || '');
    return runtime.characterId;
  } catch (err) {
    return '';
  }
}

/** 执行一条指令 */
export async function runCommand(cmd, roche) {
  var settings = await readSettings(roche);
  // 写库类指令（add / comment / recommend / new）都需要角色 ID
  if (cmd.type === 'add' || cmd.type === 'comment' || cmd.type === 'recommend' || cmd.type === 'new') {
    await ensureCharacterId(roche);
  }
  try {
    switch (cmd.type) {
      case 'play': return await doPlay(cmd.arg, roche, settings);
      case 'next': return await doControl('next');
      case 'prev': return await doControl('prev');
      case 'pause': return await doControl('pause');
      case 'resume': return await doControl('resume');
      case 'add': return await doAdd(roche);
      case 'comment': {
        var words = String(cmd.arg || '').trim();
        if (!words) return { ok: false, reason: '没有评价内容' };
        // 照抄示例（一句话评价）就别存了，TA 页会变成一页废话
        if (isPlaceholderArg(words)) return { ok: false, reason: '照抄了示例里的评价，这次不写乐评' };
        return await doComment(words.slice(0, 40), roche);
      }
      case 'recommend': return await doRecommend(roche, settings, cmd.arg);
      case 'new': {
        var made = await createCharPlaylist(roche, runtime.characterId, cmd.arg, []);
        return made.ok ? { ok: true, playlist: made.playlist } : { ok: false, reason: made.reason };
      }
      case 'status':
        return Object.assign({ ok: true }, commandStatus());
      default:
        return { ok: false, reason: '不支持的指令' };
    }
  } catch (err) {
    return { ok: false, reason: String((err && err.message) || err) };
  }
}

/* ---------------- 轮询 ---------------- */

function pickMessages(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.messages)) return raw.messages;
  if (raw && Array.isArray(raw.items)) return raw.items;
  return [];
}

function messageText(msg) {
  if (!msg) return '';
  return String(msg.content || msg.text || msg.body || '');
}

function messageRole(msg) {
  if (!msg) return '';
  return String(msg.role || msg.senderType || (msg.isMe ? 'user' : 'assistant'));
}

/**
 * 编辑消息会换 messageId，所以还要按内容去重。
 * 但窗口不能太长（否则同一首歌过一会儿想再听就被吞了），取 60 秒。
 */
var CONTENT_TTL = 60 * 1000;

function alreadyDone(key) {
  var now = Date.now();
  return runtime.executed.some(function (item) {
    if (typeof item === 'string') return item === key;
    return item && item.k === key && now - (item.at || 0) < CONTENT_TTL;
  });
}

function markDone(key, cmd) {
  var now = Date.now();
  runtime.executed.push({ k: key, at: now });
  if (cmd) {
    // 内容级：type + 参数相同，视为同一条指令
    runtime.executed.push({ k: 'c|' + cmd.type + '|' + (cmd.arg || ''), at: now });
  }
  if (runtime.executed.length > MAX_EXECUTED) runtime.executed.shift();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('mp:cmdLog', JSON.stringify(runtime.executed));
    }
  } catch (err) { /* 忽略 */ }
}

/** 读消息失败：连续失败到阈值才降级，避免一次网络抖动把功能永久关掉 */
function noteReadFailure() {
  runtime.readFailures = (runtime.readFailures || 0) + 1;
  if (runtime.readFailures >= 5) runtime.degraded = true;
}

/** 执行失败时撤销「已执行」标记，下一轮还能再试（但同一个 key 最多重试 2 次，别刷屏） */
function unmarkDone(key, contentKey) {
  var retryKey = 'r|' + key;
  var tried = runtime.retries[retryKey] || 0;
  if (tried >= 2) return;
  runtime.retries[retryKey] = tried + 1;

  runtime.executed = runtime.executed.filter(function (item) {
    if (typeof item === 'string') return item !== key && item !== contentKey;
    return !(item && (item.k === key || item.k === contentKey));
  });
}

async function pollOnce() {
  // 工具通道不轮询；混合通道只执行非点歌指令（点歌交给工具，才有卡片）
  if (runtime.mode === 'tool') return;
  if (runtime.degraded) return;
  if (!runtime.conversationId) return;
  if (!chatListenOn()) return;

  var roche = resolveRoche();
  if (!roche || !roche.memory || typeof roche.memory.getShortTerm !== 'function') {
    noteReadFailure();
    return;
  }

  var raw = null;
  try {
    raw = await roche.memory.getShortTerm({ conversationId: runtime.conversationId, limit: 8 });
  } catch (err) {
    noteReadFailure();
    return;
  }
  // 读成功就算恢复，别让一次异常永久停掉轮询
  runtime.readFailures = 0;
  runtime.degraded = false;

  var messages = pickMessages(raw);
  if (!messages.length) return;

  var convo = runtime.conversationId;
  var picked = pickPendingCommands(messages, {
    mode: runtime.mode,
    lastId: runtime.lastMessageId,
    done: function (cmd, id) {
      return alreadyDone(dedupeKey(convo, id, cmd))
        || alreadyDone('c|' + cmd.type + '|' + (cmd.arg || ''));
    }
  });
  if (!picked) return;

  // 只有真取到待执行消息才记 lastMessageId（以前是先记再看，导致漏读）
  runtime.lastMessageId = picked.id;

  for (var j = 0; j < picked.cmds.length; j++) {
    var cmd = picked.cmds[j];
    var key = dedupeKey(convo, picked.id, cmd);
    var contentKey = 'c|' + cmd.type + '|' + (cmd.arg || '');
    markDone(key, cmd);

    var res = null;
    try {
      res = await runCommand(cmd, roche);
    } catch (err) {
      res = { ok: false, reason: String((err && err.message) || err) };
    }
    if (res && res.ok === false) unmarkDone(key, contentKey);
  }
}

export function startCommandBridge() {
  if (runtime.timer) return;
  try {
    if (typeof localStorage !== 'undefined') {
      var saved = localStorage.getItem('mp:cmdLog');
      if (saved) runtime.executed = JSON.parse(saved) || [];
    }
  } catch (err) { /* 忽略 */ }

  runtime.timer = setInterval(function () {
    pollOnce().catch(function () { /* 静默 */ });
  }, POLL_MS);
}

export function stopCommandBridge() {
  if (runtime.timer) clearInterval(runtime.timer);
  runtime.timer = null;
}
