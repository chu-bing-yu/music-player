/**
 * 一起听 · 主聊天链路。
 *
 * 不靠解析模型输出的「特殊格式」，而是给主聊天注册工具（tools）：
 * 模型想切歌/点歌时会直接调用工具，宿主把参数交给我们执行，再把结果回填给模型。
 * 这比轮询聊天记录抓 [[标记]] 更准、更快，也不会被模型改格式搞挂。
 *
 * contextProvider 负责每轮注入「当前在听什么」；开关在设置里，关掉就返回 null。
 */

import { MESSAGE_TYPE } from './card.js';
import { getBridge } from './bridge.js';
import { isOn } from './listenState.js';
import { noteConversation } from './commandBridge.js';
import { addTrackForChar, saveComment, createCharPlaylist, RECOMMEND_PLAYLIST_NAME } from '../services/taStore.js';
import { DEFAULT_CHAT_PROMPT, TOOL_CHAT_PROMPT, HYBRID_CHAT_PROMPT, normalizeSettings } from '../core/settings.js';
import { createSources } from '../services/sources.js';
import { createNativeAudio } from '../services/nativeAudio.js';
import { trackKey } from '../core/track.js';

/** App 挂载时同步进来的运行时状态；没打开 App 时是默认值 */
var runtime = {
  chatListen: true,
  title: '',
  artist: '',
  isPlaying: false,
  queueSize: 0,
  chatAddToQueue: true,
  chatCommandMode: 'hybrid',
  chatPrompt: DEFAULT_CHAT_PROMPT,
  chatPromptTool: TOOL_CHAT_PROMPT,
  chatPromptHybrid: HYBRID_CHAT_PROMPT
};

export function setChatRuntime(patch) {
  if (!patch) return;
  Object.keys(patch).forEach(function (key) {
    runtime[key] = patch[key];
  });
}

function nativePlugin() {
  if (typeof window === 'undefined') return null;
  var cap = window.Capacitor;
  var plugin = cap && cap.Plugins ? cap.Plugins.BackgroundAudio : null;
  return plugin && typeof plugin.getStatus === 'function' ? plugin : null;
}

function playingLine() {
  if (!runtime.title) return '现在没有在放歌。';
  return '当前正在播放《' + runtime.title + '》' + (runtime.artist ? ' - ' + runtime.artist : '')
    + (runtime.isPlaying ? '' : '（已暂停）')
    + (runtime.queueSize ? '，队列 ' + runtime.queueSize + ' 首' : '') + '。';
}

/** 没打开 App 时也能控制原生播放器 */
async function nativeControl(action) {
  var plugin = nativePlugin();
  if (!plugin) return { ok: false, reason: '没有可控制的播放器' };
  try {
    var methods = { next: 'next', previous: 'previous', pause: 'pause', resume: 'play' };
    var method = methods[action];
    if (!method) return { ok: false, reason: '不支持的动作' };
    var res = await plugin[method]();
    var status = res && res.status;
    return {
      ok: true,
      isPlaying: status ? !!status.isPlaying : null,
      title: status ? status.title : '',
      artist: status ? status.artist : ''
    };
  } catch (err) {
    return { ok: false, reason: '播放器调用失败' };
  }
}

async function doControl(action) {
  var bridge = getBridge();
  if (bridge && bridge.ready()) {
    try {
      return await bridge.control(action);
    } catch (err) {
      return { ok: false, reason: 'App 内部执行失败' };
    }
  }
  return nativeControl(action);
}

/**
 * App 没打开时的「无界面播放」：直接搜索 + 解析地址 + 交给原生播放器，
 * 这样 AI 点歌不依赖用户先打开 App。
 */
async function headlessPlay(keyword, roche) {
  var native = createNativeAudio();
  if (!native.available()) {
    return { ok: false, reason: '这台设备没有原生播放器，需要先打开音乐 App' };
  }

  var settings = normalizeSettings(roche && roche.storage ? await roche.storage.get('mp:settings', null) : null);
  var sources = createSources();
  var found = await sources.search(keyword, settings, { limit: 8 });
  if (!found.tracks.length) return { ok: false, reason: '没搜到这首歌' };

  // 只解析第一首：之前给 5 首，状态栏队列里会多出一串用户没点过的歌
  var list = found.tracks.slice(0, 1);
  var nativeTracks = [];
  for (var i = 0; i < list.length; i++) {
    try {
      var resolver = sources.createResolver(list[i], settings);
      var url = await resolver();
      if (!url) continue;
      nativeTracks.push({
        id: trackKey(list[i]),
        albumId: list[i].album || '',
        title: list[i].name,
        artist: list[i].artist || '',
        cover: list[i].cover || '',
        url: url
      });
    } catch (err) { /* 跳过这首 */ }
  }

  if (!nativeTracks.length) return { ok: false, reason: '拿不到播放地址' };

  await native.replaceQueue({ tracks: nativeTracks, startIndex: 0, mode: 'loop', autoplay: true });

  // App 没开着也要「追加」到播放列表末尾，而不是替换
  try {
    var raw = await roche.storage.get('mp:queue', null);
    var existing = (raw && Array.isArray(raw.tracks)) ? raw.tracks.slice() : [];

    // 去重：同一首不重复追加
    var key = trackKey(list[0]);
    var dup = existing.some(function (t) {
      return trackKey(t) === key;
    });
    var merged = dup ? existing : existing.concat(list.slice(0, nativeTracks.length));
    var order = merged.map(function (_, i) { return i; });

    var payload = {
      tracks: merged.slice(0, 200),
      order: order.slice(0, 200),
      pos: dup ? Math.max(0, existing.length - 1) : Math.max(0, existing.length),
      shuffle: false,
      repeat: 'off',
      at: Date.now()
    };

    // 关键：聊天侧拿到的 roche.storage 与 App 侧可能是两个作用域，
    // 这里同时写一份 localStorage 镜像，App 启动时读镜像才不会丢歌
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('mp:mirror:mp:queue', JSON.stringify(payload));
        // 标记：原生队列现在只有这一首，App 打开后要用完整队列重建（否则上一首/下一首被锁死）
        localStorage.setItem('mp:needRebuild', '1');
      }
    } catch (err) { /* 忽略 */ }

    await roche.storage.set('mp:queue', payload);
  } catch (err) { /* 写不进去也不影响播放 */ }

  return { ok: true, started: true, track: list[0], candidates: list.slice(0, 5).map(function (t) { return t.name + ' - ' + t.artist; }) };
}

/** 记住「最近一张一起听卡片」，播放变化时原地更新它 */
var lastCard = null;

export function rememberCard(message, roche) {
  if (!message || !message.id || !message.conversationId) return;
  lastCard = { conversationId: message.conversationId, messageId: message.id, roche: roche };
}

/** 播放的歌变了：把卡片上的歌名/歌手一起更新，避免卡片显示旧歌 */
export async function syncCardTrack(track) {
  if (!track || !lastCard || !lastCard.messageId) return;
  var roche = lastCard.roche;
  if (!roche || !roche.chat || typeof roche.chat.updateCard !== 'function') return;
  try {
    await roche.chat.updateCard({
      conversationId: lastCard.conversationId,
      messageId: lastCard.messageId,
      cardData: { track: track, status: 'listening', at: Date.now() },
      modelText: '正在和你一起听《' + track.name + '》' + (track.artist ? ' - ' + track.artist : '') + '。'
    });
  } catch (err) { /* 卡片更新失败不影响播放 */ }
}

async function pushCard(ctx, roche, track, status) {
  if (!roche || !roche.chat || typeof roche.chat.createCard !== 'function') return;
  if (!ctx || !ctx.conversationId || !ctx.contact || !ctx.contact.id) return;
  try {
    var created = await roche.chat.createCard({
      conversationId: ctx.conversationId,
      messageType: MESSAGE_TYPE,
      isMe: false,
      senderId: ctx.contact.id,
      cardData: { track: track, status: status || 'listening', at: Date.now() },
      modelText: '我点开了《' + track.name + '》' + (track.artist ? ' - ' + track.artist : '') + '，和你一起听。'
    });
    var id = created && (created.id || (created.message && created.message.id));
    if (id) lastCard = { conversationId: ctx.conversationId, messageId: id, roche: roche };
  } catch (err) { /* 卡片失败不影响主流程 */ }
}

/* ---------------- contextProvider ---------------- */

/** 把设置里编辑过的提示词模板渲染成最终文本（占位符替换） */
export function renderChatPrompt(templateOverride) {
  var template = String(templateOverride || runtime.chatPrompt || DEFAULT_CHAT_PROMPT);
  var stateText = runtime.isPlaying ? '正在播放' : (runtime.title ? '已暂停' : '');
  return template
    .replace(/\{\{title\}\}/g, runtime.title || '（没在放歌）')
    .replace(/\{\{artist\}\}/g, runtime.artist || '')
    .replace(/\{\{state\}\}/g, stateText)
    .replace(/\{\{queue\}\}/g, String(runtime.queueSize || 0))
    .trim();
}

function conversationIdOf(ctx) {
  if (!ctx) return '';
  return ctx.conversationId || (ctx.conversation && ctx.conversation.id) || '';
}

export function chatContextProvider(ctx) {
  // 记住会话与角色：标记轮询要靠它知道去哪个会话读消息
  noteConversation(ctx);

  if (!isOn(conversationIdOf(ctx), runtime.chatListen)) return null;

  // 三种通道各有自己的提示词，设置页编辑哪份就注入哪份（默认混合）
  var mode = runtime.chatCommandMode || 'hybrid';
  var template;
  if (mode === 'mark') template = runtime.chatPrompt || DEFAULT_CHAT_PROMPT;
  else if (mode === 'tool') template = runtime.chatPromptTool || TOOL_CHAT_PROMPT;
  else template = runtime.chatPromptHybrid || HYBRID_CHAT_PROMPT;

  return renderChatPrompt(template) || null;
}

/* ---------------- tools ---------------- */

function tool(id, description, parameters, run) {
  return {
    id: id,
    description: description,
    parameters: parameters || {},
    async execute(args, ctx, roche) {
      if (!isOn(conversationIdOf(ctx), runtime.chatListen)) {
        return { ok: false, reason: '用户已经结束了这次一起听，不要再执行音乐操作' };
      }
      try {
        return await run(args || {}, ctx || {}, roche);
      } catch (err) {
        return { ok: false, reason: String((err && err.message) || err) };
      }
    }
  };
}

export var chatTools = [
  tool('music_play', '用户说「放/加/来一首 某某」时必须调用：搜索这首歌，把第一首加入当前播放列表。不调用就等于没做。', { keyword: 'string' },
    async function (args, ctx, roche) {
      var keyword = String(args.keyword || '').trim();
      if (!keyword) return { ok: false, reason: '缺少 keyword' };

      var bridge = getBridge();
      if (!bridge || !bridge.ready()) {
        // App 没打开：直接走原生播放器，不用用户先开 App
        var headless = await headlessPlay(keyword, roche);
        if (!headless.ok) return headless;
        await pushCard(ctx, roche, headless.track, 'listening');
        return {
          ok: true,
          started: true,
          added: headless.track ? 1 : 0,
          playing: headless.track.name,
          artist: headless.track.artist,
          candidates: headless.candidates || []
        };
      }

      var found = await bridge.search(keyword, 8);
      if (!found || !found.length) return { ok: false, reason: '没搜到这首歌' };

      // 只动第一首：追加到列表末尾并立刻播放它（playQueueAt 内部有单曲兜底，不会卡死）
      var first = found[0];
      var result;
      if (runtime.chatAddToQueue) {
        result = await bridge.addAndPlay([first], 0);
      } else {
        result = await bridge.playList([first], 0);
        result = { ok: !!result, started: true };
      }
      if (!result || !result.ok) return { ok: false, reason: (result && result.reason) || '没找到歌' };

      await pushCard(ctx, roche, first, 'listening');

      return {
        ok: true,
        started: !!result.started,
        added: 1,
        playing: first.name,
        artist: first.artist,
        candidates: found.slice(0, 5).map(function (t) { return t.name + ' - ' + t.artist; })
      };
    }),

  tool('music_next', '切到下一首。', {}, async function () {
    var res = await doControl('next');
    return res.ok ? { ok: true, playing: res.title || '', artist: res.artist || '' } : res;
  }),

  tool('music_previous', '切到上一首。', {}, async function () {
    var res = await doControl('previous');
    return res.ok ? { ok: true, playing: res.title || '', artist: res.artist || '' } : res;
  }),

  tool('music_pause', '暂停播放。', {}, async function () {
    return doControl('pause');
  }),

  tool('music_resume', '继续播放。', {}, async function () {
    return doControl('resume');
  }),

  tool('music_status', '查看当前播放的歌和队列。', {}, async function () {
    var bridge = getBridge();
    if (bridge && bridge.ready()) {
      var status = bridge.status();
      return Object.assign({ ok: true }, status);
    }
    var plugin = nativePlugin();
    if (!plugin) return { ok: false, reason: '没有播放器' };
    var res = await plugin.getStatus();
    var st = (res && res.status) || {};
    return { ok: true, playing: st.title || '', artist: st.artist || '', isPlaying: !!st.isPlaying, queueSize: st.queueSize || 0 };
  }),

  tool('music_add_to_playlist', '把当前正在播放的这首收进你自己的歌单（没有歌单会自动建一个）。', {}, async function (args, ctx, roche) {
    var bridge = getBridge();
    var track = null;
    if (bridge && bridge.ready()) {
      var st = bridge.status();
      track = st && st.playing;
    }
    if (!track) {
      var native = nativePlugin();
      if (native) {
        var res = await native.getStatus();
        var raw = (res && res.status) || {};
        if (raw.title) track = { name: raw.title, artist: raw.artist || '', id: raw.trackId || raw.title, source: 'native' };
      }
    }
    if (!track) return { ok: false, reason: '现在没有在放的歌' };

    var characterId = ctx && ctx.contact ? ctx.contact.id : '';
    var added = await addTrackForChar(roche, characterId, track);
    return added.ok
      ? { ok: true, added: track.name, playlist: added.playlist ? added.playlist.name : '', created: !!added.created }
      : { ok: false, reason: added.reason };
  }),

  tool('music_comment', '给当前正在播放的歌写一句简短评价（不超过 30 字）。', { text: 'string' }, async function (args, ctx, roche) {
    var text = String(args.text || '').trim();
    if (!text) return { ok: false, reason: '缺少 text' };

    var bridge = getBridge();
    var track = null;
    if (bridge && bridge.ready()) {
      var st = bridge.status();
      track = st && st.playing;
    }
    if (!track) {
      var native = nativePlugin();
      if (native) {
        var res = await native.getStatus();
        var raw = (res && res.status) || {};
        if (raw.title) track = { name: raw.title, artist: raw.artist || '', id: raw.trackId || raw.title, source: 'native' };
      }
    }
    if (!track) return { ok: false, reason: '现在没有在放的歌' };

    var characterId = ctx && ctx.contact ? ctx.contact.id : '';
    var saved = await saveComment(roche, characterId, track, text);
    return saved.ok ? { ok: true, text: saved.text, track: track.name } : { ok: false, reason: saved.reason };
  }),

  tool('music_recommend', '按对方最近的喜好挑几首歌，放进名为「为你挑的」的歌单。keyword 由你根据对话决定（例如「城市夜晚」）。', { keyword: 'string' }, async function (args, ctx, roche) {
    var settings = normalizeSettings(roche && roche.storage ? await roche.storage.get('mp:settings', null) : null);
    var sources = createSources();
    // 关键词由角色给（工具参数 keyword），缺省用最近在听的歌手兜底
    var seed = String(args.keyword || '').trim()
      || (/^(华语流行)$/.test(String(args.keyword || '')) ? '' : '')
      || (function () {
        var recent = (runtime.recentNames || [])[0];
        return recent || '华语流行';
      })();

    var found = await sources.search(seed, settings, { limit: 8 });
    if (!found.tracks.length) return { ok: false, reason: '没找到可推荐的歌' };

    var characterId = ctx && ctx.contact ? ctx.contact.id : '';
    var made = await createCharPlaylist(roche, characterId, RECOMMEND_PLAYLIST_NAME, found.tracks.slice(0, 6));
    return made.ok
      ? { ok: true, playlist: RECOMMEND_PLAYLIST_NAME, added: made.added }
      : { ok: false, reason: made.reason };
  }),

  tool('music_favorite', '把当前播放的歌加入收藏。', {}, async function () {
    var bridge = getBridge();
    if (!bridge || !bridge.ready()) return { ok: false, reason: '音乐 App 没有打开' };
    var res = await bridge.favoriteCurrent();
    return res || { ok: false };
  })
];
