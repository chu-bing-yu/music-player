/**
 * 标记指令桥：轮询主聊天里「角色最近一条回复」，解析 [[mp:play:歌名]] 这类标记并执行。
 *
 * 为什么要有它：宿主的 chat.tools 是「tool_call → 执行 → 再请求一次」两轮，
 * 每次点歌多花一次模型调用。让模型直接把指令写在正文里，插件解析，就只要一次。
 *
 * 拿不到会话消息（宿主没开放 memory）时自动降级为工具模式，不报错。
 */

import { parseCommands, dedupeKey } from '../core/marker.js';
import { getBridge } from './bridge.js';
import { isOn } from './listenState.js';
import { addTrackForChar, saveComment, createCharPlaylist, RECOMMEND_PLAYLIST_NAME } from '../services/taStore.js';
import { createSources } from '../services/sources.js';
import { createNativeAudio } from '../services/nativeAudio.js';
import { readChatSettings } from '../services/chatSettings.js';
import { markRebuildNeeded } from '../services/queueSignals.js';
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

/** contextProvider 每轮调用：记住当前会话与角色，供轮询使用 */
export function noteConversation(ctx) {
  if (!ctx) return;
  var cid = ctx.conversationId || (ctx.conversation && ctx.conversation.id) || '';
  if (cid) runtime.conversationId = cid;

  var contact = ctx.contact || null;
  if (contact && contact.id) {
    runtime.characterId = String(contact.id);
    runtime.characterName = String(contact.name || contact.nickname || '');
  }
}

export function setCommandMode(mode) {
  runtime.mode = mode === 'mark' ? 'mark' : (mode === 'tool' ? 'tool' : 'hybrid');
  runtime.degraded = false;
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

async function doComment(text, roche) {
  var track = await currentTrack(roche);
  if (!track) return { ok: false, reason: '现在没有在放的歌' };

  var saved = await saveComment(roche, runtime.characterId, track, text);
  return saved.ok ? { ok: true, text: saved.text } : { ok: false, reason: saved.reason };
}

async function doRecommend(roche, settings, arg) {
  var sources = createSources();
  var raw = String(arg || '').trim();

  // 支持两种写法：`关键词` 或 `歌单名|关键词`
  var name = '';
  var keyword = raw;
  if (raw.indexOf('|') !== -1) {
    var parts = raw.split('|');
    name = parts[0].trim();
    keyword = parts.slice(1).join('|').trim();
  }

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

/** 执行一条指令 */
export async function runCommand(cmd, roche) {
  var settings = await readSettings(roche);
  try {
    switch (cmd.type) {
      case 'play': return await doPlay(cmd.arg, roche, settings);
      case 'next': return await doControl('next');
      case 'prev': return await doControl('prev');
      case 'pause': return await doControl('pause');
      case 'resume': return await doControl('resume');
      case 'add': return await doAdd(roche);
      case 'comment': return await doComment(cmd.arg, roche);
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

async function pollOnce() {
  // 工具通道不轮询；混合通道只执行非点歌指令（点歌交给工具，才有卡片）
  if (runtime.mode === 'tool') return;
  if (runtime.degraded) return;
  if (!runtime.conversationId) return;
  if (!chatListenOn()) return;

  var roche = resolveRoche();
  if (!roche || !roche.memory || typeof roche.memory.getShortTerm !== 'function') {
    runtime.degraded = true;
    return;
  }

  var raw = null;
  try {
    raw = await roche.memory.getShortTerm({ conversationId: runtime.conversationId, limit: 8 });
  } catch (err) {
    runtime.degraded = true;
    return;
  }

  var messages = pickMessages(raw);
  if (!messages.length) return;

  for (var i = messages.length - 1; i >= 0; i--) {
    var msg = messages[i];
    if (messageRole(msg) !== 'assistant') continue;

    var id = String(msg.id || msg.messageId || msg.createdAt || '');
    if (!id || id === runtime.lastMessageId) return;
    runtime.lastMessageId = id;

    var cmds = parseCommands(messageText(msg));
    if (runtime.mode === 'hybrid') {
      // 混合模式：点歌由工具负责，这里跳过 play，避免同一首歌被处理两次
      cmds = cmds.filter(function (c) { return c.type !== 'play'; });
    }
    if (!cmds.length) return;

    for (var j = 0; j < cmds.length; j++) {
      var key = dedupeKey(runtime.conversationId, id, cmds[j]);
      var contentKey = 'c|' + cmds[j].type + '|' + (cmds[j].arg || '');
      // 消息级 + 内容级（60 秒内）双重去重：编辑消息不会重复执行，过一会儿又能重新点
      if (alreadyDone(key) || alreadyDone(contentKey)) continue;
      markDone(key, cmds[j]);
      try {
        await runCommand(cmds[j], roche);
      } catch (err) { /* 单条失败不影响其它 */ }
    }
    return;
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
