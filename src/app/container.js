/** 装配层：宿主 + 存储 + 音源 + 播放器 + 状态 + 动作。视图只通过 ctx 调用这里 */

import { createHost } from '../services/host.js';
import { createStore } from '../services/store.js';
import { createSources } from '../services/sources.js';
import { createLyrics } from '../services/lyrics.js';
import { getPlayer } from '../services/player.js';
import { nativeAvailable } from '../services/nativeAudio.js';
import { createNativeEngine } from '../services/nativeEngine.js';
import { isRebuildNeeded, clearRebuildNeeded } from '../services/queueSignals.js';
import {
  createQueue, current, advance, back, setShuffle, setRepeat, nextRepeat, jumpTo, appendTracks, removeAt, REPEAT
} from '../core/queue.js';
import { trackKey, normalizeTrack } from '../core/track.js';
import { nextPlayMode, playModeLabel, resolveMediaMode } from '../core/settings.js';
import {
  toplists as neToplists,
  playlistTracks as nePlaylistTracks,
  isLoggedIn as neteaseLoggedIn,
  isReady as neteaseReady
} from '../services/netease.js';
import { addTrackForChar, saveComment, deleteComment as taDeleteComment } from '../services/taStore.js';
import { normalizePlaylists } from '../core/playlist.js';
import { defaultPrefs, normalizePrefs } from '../core/prefs.js';
import { generate as generateRecommend } from '../services/recommend.js';
import { toggleFavorite as toggleFav, pushRecent, MAX_RECENT } from '../core/favorites.js';
import {
  createPlaylist as makePlaylist, renamePlaylist as renamePl, deletePlaylist as removePl,
  addTracksToPlaylist, removeTrackFromPlaylist, moveTrackInPlaylist, findPlaylist,
  playlistDuration
} from '../core/playlist.js';
import { createShell } from './shell.js';
import { setBridge, clearBridge, saveSnapshot } from '../chat/bridge.js';
import { setChatRuntime } from '../chat/chatLink.js';
import { setCommandMode, setRoche } from '../chat/commandBridge.js';
import { hydrate as hydrateListen } from '../chat/listenState.js';

import { isValidRoute, DEFAULT_ROUTE, TABS } from '../core/routes.js';

function uid() {
  return 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export async function createApp(opts) {
  var container = opts.container;
  var roche = opts.roche;
  var version = opts.version;

  var host = createHost(roche);
  var store = createStore(host);
  var sources = createSources();
  var lyrics = createLyrics();

  var state = {
    version: version,
    route: 'recommend',
    nowBack: 'recommend',
    playlistId: '',
    settings: null,
    playlists: [],
    favorites: [],
    recent: [],
    search: { keyword: '', busy: false, tracks: [], errors: [], counts: {}, at: 0 },
    searches: [],
    comments: {},
    prefs: [],      // 推荐偏好
    rec: null,      // 推荐缓存 { at, playlistName, tracks }
    queue: null,
    player: { status: 'idle', track: null, time: 0, duration: 0, error: '', volume: 0.8 },
    lyrics: { lines: [], loading: false, error: '' },
    covers: {}
  };

  var shell = null;
  var player = null;
  var engine = null; // 宿主原生播放引擎（有 BackgroundAudio 插件时启用）
  var searchToken = 0;

  /* ---------------- 基础动作 ---------------- */

  function toast(message) {
    host.ui.toast(message);
  }

  function coverOf(track) {
    if (!track) return '';
    return state.covers[trackKey(track)] || track.cover || '';
  }

  function isCurrent(track) {
    return !!track && !!state.player.track && trackKey(state.player.track) === trackKey(track);
  }

  async function ensureCover(track) {
    /* 现在的音源搜索时都直接带封面地址，不需要再异步解析 */
    return track;
  }

  var cardSyncKey = '';

  function refresh() {
    if (shell) {
      shell.renderPlayer();
      shell.renderDock();
      shell.refreshPage();
    }
    syncChatRuntime();
  }

  /* ---------------- 主聊天桥 ---------------- */

  function syncChatRuntime() {
    setChatRuntime({
      chatListen: !!state.settings.chatListen,
      title: state.player.track ? state.player.track.name : '',
      artist: state.player.track ? state.player.track.artist : '',
      isPlaying: state.player.status === 'playing',
      queueSize: state.queue ? state.queue.tracks.length : 0,
      chatAddToQueue: !!state.settings.chatAddToQueue,
      chatCommandMode: state.settings.chatCommandMode || 'tool',
      chatPrompt: state.settings.chatPrompt,
      chatPromptTool: state.settings.chatPromptTool,
      chatPromptHybrid: state.settings.chatPromptHybrid
    });

    // 标记通道才启动后台轮询；工具通道不需要（避免轮询干扰原生播放）
    var commandMode = state.settings.chatCommandMode || 'tool';
    setCommandMode(commandMode);
    // 把带 chat 的那份 roche 交给标记通道，它才能发一起听卡片
    setRoche(host.raw);
    // 混合 / 标记通道都要后台轮询（工具通道不需要）
    if (commandMode !== 'tool' && typeof window !== 'undefined'
      && typeof window.__mpStartCommandBridge === 'function') {
      window.__mpStartCommandBridge();
    }

    // App 不在前台时，聊天面板靠这份快照显示「在放什么、队列/收藏/歌单有哪些」
    // 宿主 storage 可能按作用域隔离（App 与聊天各一份），所以快照比读 storage 可靠
    saveSnapshot({
      track: state.player.track,
      isPlaying: state.player.status === 'playing',
      queue: state.queue,
      settings: state.settings,
      favorites: state.favorites,
      playlists: state.playlists
    });
  }

  function installBridge() {
    setBridge({
      ready: function () { return !!shell; },
      status: function () {
        return {
          playing: state.player.track
            ? { name: state.player.track.name, artist: state.player.track.artist }
            : null,
          isPlaying: state.player.status === 'playing',
          queueSize: state.queue ? state.queue.tracks.length : 0
        };
      },
      /** 聊天里点卡片时用：当前这首但停着 → 续播，不用重新解析地址 */
      resume: async function () {
        if (state.player.status !== 'playing') await togglePlay();
        return { ok: true };
      },
      search: async function (keyword, limit) {
        var res = await sources.search(keyword, state.settings, { limit: limit || 5 });
        return res.tracks;
      },
      playKeyword: async function (keyword) {
        var res = await sources.search(keyword, state.settings, { limit: 10 });
        if (!res.tracks.length) return { ok: false, reason: '没搜到这首歌' };
        var list = res.tracks.slice(0, 10);
        await playTracks(list, 0);
        return {
          ok: true,
          track: list[0],
          candidates: list.slice(0, 5).map(function (t) { return t.name + ' - ' + t.artist; })
        };
      },
      playList: async function (tracks, index) {
        var list = (tracks || []).filter(Boolean);
        if (!list.length) return { ok: false, reason: '没有可播放的歌' };
        await playTracks(list, index || 0);
        return { ok: true, track: list[index || 0] || list[0] };
      },
      /** 追加到队列末尾并立刻播其中第一首，原有列表不丢 */
      addAndPlay: async function (tracks, index) {
        var list = (tracks || []).filter(Boolean);
        if (!list.length) return { ok: false, reason: '没有可播放的歌' };
        var start = index || 0;
        var want = list[start] || list[0];

        // 列表里已经有这首 → 只跳过去播，不再重复追加
        // 先按 id 比，id 不同的（不同音源搜到同一首）再按「歌名 + 歌手」比
        var existIndex = -1;
        var wantKey = trackKey(want);
        var wantName = String(want.name || '').trim();
        var wantArtist = String(want.artist || '').trim();
        if (state.queue) {
          for (var i = 0; i < state.queue.tracks.length; i++) {
            var item = state.queue.tracks[i];
            if (!item) continue;
            if (trackKey(item) === wantKey) { existIndex = i; break; }
            if (wantName && String(item.name || '').trim() === wantName
              && String(item.artist || '').trim() === wantArtist) {
              existIndex = i;
              break;
            }
          }
        }
        if (existIndex >= 0) {
          await playQueueAt(existIndex);
          refresh();
          return { ok: true, track: want, duplicate: true };
        }

        state.queue = appendTracks(state.queue, list);
        saveQueue();
        if (engine) engine.setList(state.queue.tracks, state.settings);
        var target = state.queue.tracks.length - list.length + start;
        await playQueueAt(target);
        refresh();
        return { ok: true, track: want };
      },
      /** 追加到当前队列，不打断正在播的歌（模型点歌默认走这里） */
      addTracks: async function (tracks) {
        var list = (tracks || []).filter(Boolean);
        if (!list.length) return { ok: false, reason: '没有可加入的歌' };

        if (!state.player.track) {
          await playTracks(list, 0);
          return { ok: true, started: true, added: list.length };
        }

        state.queue = appendTracks(state.queue, list);
        saveQueue();
        if (engine) engine.setList(state.queue.tracks, state.settings);
        refresh();
        return {
          ok: true,
          started: false,
          added: list.length,
          nowPlaying: state.player.track ? state.player.track.name : ''
        };
      },
      playKey: async function (key) {
        var q = state.queue;
        if (!q) return { ok: false, reason: '队列为空' };
        for (var i = 0; i < q.tracks.length; i++) {
          if (trackKey(q.tracks[i]) === key) {
            await playQueueAt(i);
            return { ok: true, track: q.tracks[i] };
          }
        }
        return { ok: false, reason: '队列里没有这首' };
      },
      queue: function () {
        var q = state.queue;
        if (!q) return [];
        return q.tracks.slice(0, 60).map(function (track) {
          return {
            key: trackKey(track),
            name: track.name,
            artist: track.artist,
            cover: track.cover || '',
            current: isCurrent(track),
            track: track
          };
        });
      },
      control: async function (action) {
        if (action === 'next') {
          next(false);
          return { ok: true };
        }
        if (action === 'previous') {
          prev();
          return { ok: true };
        }
        if (action === 'pause') {
          if (state.player.status === 'playing') await togglePlay();
          return { ok: true };
        }
        if (action === 'resume') {
          if (state.player.status !== 'playing') await togglePlay();
          return { ok: true };
        }
        return { ok: false, reason: '不支持的动作' };
      },
      favoriteCurrent: async function () {
        if (!state.player.track) return { ok: false, reason: '没有正在播放的歌' };
        var name = state.player.track.name;
        await toggleFavorite(state.player.track);
        return { ok: true, favorite: name };
      }
    });
  }

  /* ---------------- 队列与歌词的持久化 / 副作用 ---------------- */

  async function saveQueue() {
    var q = state.queue;
    if (!q) return;
    await host.storage.set('mp:queue', {
      tracks: q.tracks.slice(0, 200),
      order: q.order,
      pos: q.pos,
      shuffle: q.shuffle,
      repeat: q.repeat,
      at: Date.now()
    });
  }

  async function loadQueue() {
    var rawHost = await host.storage.get('mp:queue', null);

    // 镜像里可能是「角色在 App 没开时」写的最新队列，按时间戳取更新的那份
    var rawMirror = null;
    try {
      rawMirror = JSON.parse(localStorage.getItem('mp:mirror:mp:queue') || 'null');
    } catch (err) {
      rawMirror = null;
    }

    var raw = rawHost;
    if (rawMirror && (!rawHost || (Number(rawMirror.at) || 0) > (Number(rawHost.at) || 0))) {
      raw = rawMirror;
    }

    if (!raw || !Array.isArray(raw.tracks) || !raw.tracks.length) return null;
    var tracks = raw.tracks.map(function (t) { return normalizeTrack(t, t && t.source); }).filter(Boolean);
    if (!tracks.length) return null;

    var natural = tracks.map(function (_, i) { return i; });
    var order = Array.isArray(raw.order) && raw.order.length === tracks.length ? raw.order : natural;
    var valid = order.every(function (n) { return Number.isInteger(n) && n >= 0 && n < tracks.length; });
    return {
      tracks: tracks,
      order: valid ? order : natural,
      pos: Math.min(Math.max(Number(raw.pos) || 0, 0), tracks.length - 1),
      shuffle: !!raw.shuffle,
      repeat: raw.repeat || state.settings.repeat
    };
  }

  async function loadLyrics(track) {
    var key = trackKey(track);
    state.lyrics = { lines: [], loading: true, error: '' };
    if (shell) shell.renderPlayer();
    var lines = await lyrics.get(track, state.settings);
    // 期间又换了歌就丢弃这次结果
    if (!state.player.track || trackKey(state.player.track) !== key) return;
    state.lyrics = { lines: lines, loading: false, error: lines.length ? '' : '暂无歌词' };
    if (shell) {
      shell.renderPlayer();
      if (state.route === 'now') shell.refreshPage();
    }
  }

  /* ---------------- 播放 ---------------- */

  /** 失败提示要说人话：被浏览器策略拦下 ≠ 没有版权 */
  function playFailText() {
    var fail = player && typeof player.lastFail === 'function' ? player.lastFail() : null;
    if (fail && fail.reason === 'blocked') return '浏览器拦了自动播放，点一下播放';
    if (fail && fail.reason === 'stolen') return '被 Roche 的「音乐保活」抢了，去 Roche 设置里关掉它';
    if (fail && fail.reason === 'interrupted') return '被系统打断，点一下重新加载';
    if (fail && fail.host) return '放不了（' + fail.host + ' 拒绝或超时），换一首试试';
    return '这首放不了（音源可能没版权），换一首试试';
  }

  async function playTrack(track) {
    if (!track) return false;
    state.player = Object.assign({}, state.player, { status: 'loading', track: track, error: '' });
    if (shell) shell.renderPlayer();

    if (engine) {
      state.queue = createQueue([track], { repeat: state.settings.repeat, shuffle: false });
      saveQueue();
      var started = await engine.playList(state.queue.tracks, 0, state.settings);
      if (!started) toast('这首放不了（音源可能没版权），换一首试试');
      refresh();
      return started;
    }

    var ok = await player.load(track, sources.createResolver(track, state.settings));
    if (ok) {
      state.recent = pushRecent(state.recent, track, MAX_RECENT);
      await store.saveRecent(state.recent);
      loadLyrics(track);
      if (state.route === 'now' && shell) shell.refreshPage();
    } else {
      toast(playFailText());
    }
    refresh();
    return ok;
  }

  async function playTracks(tracks, startIndex) {
    var list = (tracks || []).filter(Boolean);
    if (!list.length) {
      toast('这个列表还是空的');
      return;
    }
    state.queue = createQueue(list, {
      startIndex: startIndex || 0,
      // 原生模式下随机由原生播放器负责，JS 队列保持自然顺序，避免两套随机打架
      shuffle: engine ? false : state.settings.shuffle,
      repeat: state.settings.repeat
    });
    saveQueue();

    if (engine) {
      var started = await engine.playList(state.queue.tracks, startIndex || 0, state.settings);
      if (!started) toast('这首放不了（音源可能没版权），换一首试试');
      refresh();
      return;
    }

    await playTrack(current(state.queue));
    refresh();
  }

  /** auto=true 表示自然播完，用于单曲循环 */
  function next(auto) {
    if (engine) {
      engine.next().then(function () { refresh(); });
      return;
    }
    var res = advance(state.queue, { auto: !!auto });
    if (res.ended || !res.track) {
      state.queue = res.queue;
      toast('已经是最后一首了');
      return;
    }
    state.queue = res.queue;
    saveQueue();
    playTrack(res.track);
    refresh();
  }

  function prev() {
    if (engine) {
      engine.previous().then(function () { refresh(); });
      return;
    }
    var res = back(state.queue);
    if (!res.track) return;
    state.queue = res.queue;
    saveQueue();
    if (res.restart) {
      player.seek(0);
      return;
    }
    playTrack(res.track);
    refresh();
  }

  async function togglePlay() {
    var st = state.player;
    if (!st.track) {
      if (state.queue && state.queue.tracks.length) {
        await playTrack(current(state.queue));
      } else if (state.favorites.length) {
        await playTracks(state.favorites, 0);
      } else {
        toast('先搜一首歌吧');
      }
      return;
    }
    if (engine) {
      await engine.toggle();
      refresh();
      return;
    }

    var ok = await player.toggle();
    if (!ok) {
      // 被别的 App 抢走音频会话、或地址过期：整首重新解析一遍
      await playTrack(st.track);
    }
  }

  function seek(ms) {
    if (engine) {
      engine.seek(ms);
      return;
    }
    player.seek(ms);
  }

  async function setVolume(v) {
    var vol = engine ? engine.setVolume(v) : player.setVolume(v);
    state.settings = Object.assign({}, state.settings, { volume: vol });
    await store.saveSettings(state.settings);
    refresh();
  }

  /** 播放模式四选一：顺序 / 列表循环 / 单曲循环 / 随机（互斥） */
  async function setPlayMode(mode) {
    state.settings = Object.assign({}, state.settings, { playMode: mode });
    if (!engine) {
      state.queue = setRepeat(state.queue, state.settings.repeat);
      state.queue = setShuffle(state.queue, state.settings.shuffle);
    }
    await store.saveSettings(state.settings);
    saveQueue();
    if (engine) engine.setMode(state.settings);
    refresh();
    return mode;
  }

  async function cycleRepeat() {
    return setPlayMode(nextPlayMode(state.settings.playMode));
  }

  async function toggleShuffle() {
    return setPlayMode(state.settings.playMode === 'shuffle' ? 'sequence' : 'shuffle');
  }

  async function setRepeatMode(mode) {
    // 兼容老调用：REPEAT.OFF/ALL/ONE → 顺序/列表循环/单曲循环
    var next = mode === REPEAT.ONE ? 'one' : (mode === REPEAT.ALL ? 'loop' : 'sequence');
    return setPlayMode(next);
  }

  /* ---------------- 播放列表 / 播放模式弹层 ---------------- */

  async function playQueueAt(index) {
    var q = state.queue;
    if (!q) return;
    var track = q.tracks[index];
    if (!track) return;
    state.queue = jumpTo(q, trackKey(track));
    saveQueue();
    // 原生模式下直接跳，不要把队列缩成单曲（否则列表会被覆盖）
    if (engine) {
      engine.setList(state.queue.tracks, state.settings); // 队列可能刚追加过，先同步
      var started = await engine.playAt(index);
      // 跳过去没起来（地址过期 / 窗口里没这首）：退回单曲重播，保证能出声
      if (!started) await playTrack(track);
      refresh();
      return;
    }
    await playTrack(track);
    refresh();
  }

  /** 批量加入队列，不改变正在播的歌（搜索结果多选后走这里） */
  async function appendToQueue(tracks) {
    var list = (tracks || []).filter(Boolean);
    if (!list.length) return 0;
    state.queue = appendTracks(state.queue, list);
    saveQueue();
    if (engine) engine.setList(state.queue.tracks, state.settings);
    refresh();
    return list.length;
  }

  /** 只把这一首加进列表并播放（搜索结果点单曲走这里） */
  async function playOne(track) {
    if (!track) return false;
    state.queue = appendTracks(state.queue, [track]);
    saveQueue();
    var index = state.queue.tracks.length - 1;
    if (engine) engine.setList(state.queue.tracks, state.settings);
    await playQueueAt(index);
    return true;
  }

  var queueSheetClose = null;

  function openQueueSheet() {
    if (!shell) return;
    var q = state.queue;
    if (!q || !q.tracks.length) {
      toast('播放队列还是空的');
      return;
    }

    // items 传函数：删除一行后 openSheet 会重新取一次最新列表，原地刷新、不关弹层
    function buildItems() {
      var now = state.queue;
      if (!now) return [];
      return now.tracks.slice(0, 200).map(function (track, i) {
        return {
          label: track.name,
          hint: track.artist,
          icon: isCurrent(track) ? 'pause' : 'play',
          onClick: function () { playQueueAt(i); },
          onRemove: function () { removeFromQueue(i); }
        };
      });
    }

    queueSheetClose = shell.openSheet({
      title: function () {
        return '播放列表 · ' + (state.queue ? state.queue.tracks.length : 0) + ' 首';
      },
      items: buildItems
    });
  }

  /** 从播放列表移除一首；删的是当前歌就接着播下一首 */
  async function removeFromQueue(index) {
    var q = state.queue;
    if (!q || !q.tracks[index]) return;

    var wasCurrent = isCurrent(q.tracks[index]);
    state.queue = removeAt(q, index);
    saveQueue();
    if (engine) engine.setList(state.queue.tracks, state.settings);

    if (!state.queue.tracks.length) {
      if (engine) await engine.stop();
      else if (player) player.stop();
      refresh();
      return;
    }

    if (wasCurrent) {
      var target = state.queue.order[state.queue.pos];
      if (target >= 0) {
        if (engine) await engine.playAt(target);
        else await playTrack(state.queue.tracks[target]);
      }
    }
    refresh();
  }

  /** 网易云排行榜：拉榜单列表 → 点一个直接播该榜前 30 首 */
  async function openNeteaseToplist() {
    if (!shell) return;
    if (!state.settings.neteaseApi) {
      toast('先在设置里填网易云 API 地址');
      return;
    }
    toast('正在拉取榜单…');
    try {
      var list = await neToplists(state.settings);
      if (!list.length) {
        toast('没拿到榜单，检查 API 地址是否可访问');
        return;
      }
      shell.openSheet({
        title: '网易云排行榜',
        items: list.map(function (item) {
          return {
            label: item.name,
            hint: item.count ? item.count + ' 首' : '',
            icon: 'queue',
            onClick: function () { playNeteasePlaylist(item); }
          };
        })
      });
    } catch (err) {
      toast('拉取失败：' + ((err && err.message) || '网络错误'));
    }
  }

  async function playNeteasePlaylist(item) {
    try {
      var songs = await nePlaylistTracks(state.settings, item.id, 30);
      if (!songs.length) {
        toast('这个榜单没有歌');
        return;
      }
      var tracks = songs.map(function (s) { return normalizeTrack(s, 'netease'); }).filter(Boolean);
      await playTracks(tracks, 0);
      toast('正在播放：' + item.name);
    } catch (err) {
      toast('播放失败：' + ((err && err.message) || '网络错误'));
    }
  }

  function openPlayModeSheet() {
    if (!shell) return;
    var current = state.settings.playMode;

    shell.openSheet({
      title: '播放模式',
      items: [
        { id: 'sequence', label: '顺序播放', icon: 'music' },
        { id: 'loop', label: '列表循环', icon: 'repeat' },
        { id: 'one', label: '单曲循环', icon: 'repeatOne' },
        { id: 'shuffle', label: '随机播放', icon: 'shuffle' }
      ].map(function (item) {
        return {
          label: item.label,
          icon: current === item.id ? 'check' : item.icon,
          hint: current === item.id ? '当前' : '',
          onClick: function () { setPlayMode(item.id); }
        };
      })
    });
  }

  function exitApp() {
    host.ui.closeApp();
  }

  /** 彻底停止：停掉原生播放器、清空队列、通知栏也一起消失 */
  async function hardStop() {
    try {
      if (engine) await engine.stop();
      else if (player) player.stop();
    } catch (err) { /* 忽略 */ }

    state.queue = createQueue([]);
    try {
      await host.storage.delete('mp:queue');
    } catch (err) { /* 忽略 */ }
    state.player = {
      status: 'idle', track: null, time: 0, duration: 0, error: '',
      volume: state.settings.volume
    };
    state.lyrics = { lines: [], loading: false, error: '' };
    refresh();
    toast('已彻底停止，状态栏通知也会消失');
  }

  /** 重建原生播放会话：状态栏/通知卡片僵死时，重开一次服务通常能救回来 */
  async function rebuildSession() {
    if (!engine) {
      toast('当前没有原生播放器');
      return;
    }
    var q = state.queue;
    if (!q || !q.tracks.length) {
      toast('播放列表是空的');
      return;
    }
    var index = q.order[q.pos];
    if (!(index >= 0)) index = 0;
    var track = q.tracks[index];

    await engine.stop();
    var started = await engine.playList(q.tracks, index, state.settings);
    if (started && track) loadLyrics(track);
    toast(started ? '已重建播放会话' : '重建失败，换一首试试');
  }

  /* ---------------- 搜索 ---------------- */

  async function searchNow(keyword) {
    var kw = String(keyword == null ? state.search.keyword : keyword).trim();
    state.search = Object.assign({}, state.search, { keyword: kw });
    if (!kw) {
      state.search = Object.assign({}, state.search, { tracks: [], errors: [], counts: {}, busy: false, at: 0 });
      if (shell) shell.refreshPage();
      return;
    }
    var token = ++searchToken;
    state.search = Object.assign({}, state.search, { busy: true, errors: [] });
    if (shell) shell.refreshPage();

    var result = await sources.search(kw, state.settings);
    if (token !== searchToken) return; // 已有更新的搜索

    state.search = {
      keyword: kw,
      busy: false,
      tracks: result.tracks,
      errors: result.errors,
      counts: result.counts,
      at: Date.now()
    };
    if (!result.tracks.length) {
      if (result.errors.length) toast('搜索失败，检查网络或换音源');
      else toast('没有找到歌曲');
    } else {
      state.searches = await store.saveSearches([kw].concat(state.searches));
    }
    if (shell) shell.refreshPage();
  }

  async function clearSearches() {
    state.searches = await store.saveSearches([]);
    toast('已清空搜索历史');
    refresh();
  }

  /** 搜索页的推荐数据：历史搜索 + 从最近播放/收藏里推歌手 + 固定热门词 */
  function suggestions() {
    var counter = Object.create(null);
    (state.recent || []).forEach(function (t) {
      if (t && t.artist) counter[t.artist] = (counter[t.artist] || 0) + 1;
    });
    (state.favorites || []).forEach(function (t) {
      if (t && t.artist) counter[t.artist] = (counter[t.artist] || 0) + 2;
    });
    var artists = Object.keys(counter).sort(function (a, b) {
      return counter[b] - counter[a];
    }).slice(0, 6);

    return {
      searches: (state.searches || []).slice(0, 8),
      artists: artists,
      hot: ['古风', '华语流行', '粤语', '民谣', '钢琴', '说唱', '纯音乐', '动漫']
    };
  }

  /* ---------------- 收藏 / 歌单 ---------------- */

  async function toggleFavorite(track) {
    var res = toggleFav(state.favorites, track);
    if (res.full) {
      toast('收藏已满 ' + state.favorites.length + ' 首');
      return;
    }
    state.favorites = res.favorites;
    await store.saveFavorites(state.favorites);
    toast(res.added ? '已收藏' : '已取消收藏');
    refresh();
  }

  /** 把当前播放的歌收进某个角色的歌单（App 内也可以手动触发） */
  async function addCurrentToCharPlaylist(characterId) {
    var track = state.player.track;
    if (!track) return { ok: false, reason: '现在没有在放的歌' };

    var res = await addTrackForChar(host.raw, characterId || 'ta', track);
    if (res.ok) {
      state.playlists = await store.loadPlaylists();
      refresh();
    }
    return res;
  }

  /** 给当前歌写一条角色短评 */
  async function commentCurrent(characterId, text) {
    var track = state.player.track;
    if (!track) return { ok: false, reason: '现在没有在放的歌' };

    var res = await saveComment(host.raw, characterId || 'ta', track, text);
    if (res.ok) {
      state.comments = await store.loadComments();
      refresh();
    }
    return res;
  }

  /**
   * 从 storage 重新读一次短评（角色刚写完时用）；只更新数据，不重绘。
   * 和歌单一样必须合并 localStorage 镜像：宿主那份非空时，聊天侧写的新评价会被忽略。
   */
  async function reloadComments() {
    try {
      var fromHost = await store.loadComments();
      var mirror = null;
      try {
        mirror = JSON.parse(localStorage.getItem('mp:mirror:mp:comments') || 'null');
      } catch (err) {
        mirror = null;
      }

      if (mirror && typeof mirror === 'object' && !Array.isArray(mirror)) {
        var merged = Object.assign({}, fromHost);
        Object.keys(mirror).forEach(function (key) {
          var base = merged[key] && typeof merged[key] === 'object' ? merged[key] : {};
          merged[key] = Object.assign({}, base, mirror[key] || {});
        });
        state.comments = merged;
      } else {
        state.comments = fromHost;
      }
      return state.comments;
    } catch (err) {
      return state.comments;
    }
  }

  /**
   * 从 storage 重新读歌单：角色在聊天里建的歌单，打开 TA 页就能看到。
   * 宿主 storage 与聊天侧可能是两份，所以还要把 localStorage 镜像合并进来
   * （否则宿主那份非空时，镜像里的新歌单会被忽略）。
   */
  async function reloadPlaylists() {
    try {
      var fromHost = await store.loadPlaylists();
      var mirror = null;
      try {
        mirror = JSON.parse(localStorage.getItem('mp:mirror:mp:playlists') || 'null');
      } catch (err) {
        mirror = null;
      }

      if (Array.isArray(mirror) && mirror.length) {
        var byId = Object.create(null);
        fromHost.forEach(function (p) { byId[p.id] = p; });
        // 镜像里的更新优先（角色刚建的就是最新的）
        mirror.forEach(function (raw) {
          if (!raw || !raw.id) return;
          byId[raw.id] = raw;
        });
        state.playlists = normalizePlaylists(Object.keys(byId).map(function (id) { return byId[id]; }));
      } else {
        state.playlists = fromHost;
      }
      return state.playlists;
    } catch (err) {
      return state.playlists;
    }
  }

  async function createPlaylist(name, tracks) {
    var res = makePlaylist(state.playlists, name, uid(), Date.now());
    if (!res.playlist) {
      toast('歌单数量已达上限');
      return '';
    }
    state.playlists = res.list;
    var id = res.playlist.id;
    if (tracks && tracks.length) {
      var added = addTracksToPlaylist(state.playlists, id, tracks, Date.now());
      state.playlists = added.list;
    }
    await store.savePlaylists(state.playlists);
    refresh();
    return id;
  }

  async function renamePlaylist(id, name) {
    state.playlists = renamePl(state.playlists, id, name, Date.now());
    await store.savePlaylists(state.playlists);
    refresh();
  }

  async function deletePlaylist(id) {
    var ok = await host.ui.confirm({
      title: '删除歌单',
      message: '删除后不可恢复，歌曲本身不会被删除。'
    });
    if (!ok) return false;
    state.playlists = removePl(state.playlists, id);
    await store.savePlaylists(state.playlists);
    if (state.route === 'playlist') goto('playlists');
    refresh();
    return true;
  }

  async function addToPlaylist(playlistId, tracks) {
    var res = addTracksToPlaylist(state.playlists, playlistId, tracks, Date.now());
    state.playlists = res.list;
    await store.savePlaylists(state.playlists);
    if (res.full) toast('歌单已满，部分歌曲没加进去');
    else if (!res.added) toast(res.duplicate ? '这些歌已经在歌单里了' : '没有可添加的歌曲');
    else toast('已加入歌单');
    refresh();
    return res.added;
  }

  async function removeFromPlaylist(playlistId, key) {
    state.playlists = removeTrackFromPlaylist(state.playlists, playlistId, key, Date.now());
    await store.savePlaylists(state.playlists);
    refresh();
  }

  async function moveInPlaylist(playlistId, from, to) {
    state.playlists = moveTrackInPlaylist(state.playlists, playlistId, from, to, Date.now());
    await store.savePlaylists(state.playlists);
    refresh();
  }

  /* ---------------- 弹层 ---------------- */

  function openAddToPlaylist(track) {
    if (!shell) return;
    var items = state.playlists.map(function (p) {
      return {
        label: p.name,
        icon: 'folder',
        hint: p.tracks.length + ' 首',
        onClick: function () { addToPlaylist(p.id, [track]); }
      };
    });
    items.push({
      label: '新建歌单并加入',
      icon: 'plus',
      onClick: function () {
        shell.openPrompt({
          title: '新建歌单',
          placeholder: '给歌单起个名字',
          onSubmit: function (name) { createPlaylist(name, [track]); }
        });
      }
    });
    shell.openSheet({ title: '加入歌单', items: items, empty: '还没有歌单' });
  }

  function openSongSheet(track, options) {
    if (!shell || !track) return;
    var o = options || {};
    var fav = state.favorites.some(function (t) { return trackKey(t) === trackKey(track); });
    var items = [
      {
        label: '立即播放',
        icon: 'play',
        onClick: function () { playTracks(o.queueTracks && o.queueTracks.length ? o.queueTracks : [track], o.queueIndex || 0); }
      },
      {
        label: fav ? '取消收藏' : '收藏',
        icon: fav ? 'heartFull' : 'heart',
        onClick: function () { toggleFavorite(track); }
      },
      { label: '加入歌单', icon: 'plus', onClick: function () { openAddToPlaylist(track); } }
    ];

    if (o.playlistId) {
      items.push({
        label: '从歌单移除',
        icon: 'trash',
        danger: true,
        onClick: function () { removeFromPlaylist(o.playlistId, trackKey(track)); }
      });
      items.push({
        label: '上移',
        icon: 'up',
        onClick: function () { moveInPlaylist(o.playlistId, o.index, o.index - 1); }
      });
      items.push({
        label: '下移',
        icon: 'down',
        onClick: function () { moveInPlaylist(o.playlistId, o.index, o.index + 1); }
      });
    }

    shell.openSheet({ title: track.name, items: items });
  }

  /* ---------------- 路由 ---------------- */

  function goto(route, options) {
    var o = options || {};
    // 一级 tab + 明确的二级路由都放行；以后加页面只需在 routes.js 登记
    if (!isValidRoute(route)) return;
    if (route === 'playlist') {
      state.playlistId = o.playlistId || state.playlistId;
    }
    state.route = route;
    if (shell) shell.renderAll();
  }

  function openNow() {
    if (state.route === 'now') return;
    state.nowBack = TABS.indexOf(state.route) !== -1 ? state.route : DEFAULT_ROUTE;
    state.route = 'now';
    if (shell) shell.renderAll();
  }

  function closeNow() {
    state.route = state.nowBack || DEFAULT_ROUTE;
    if (shell) shell.renderAll();
  }

  /* ---------------- 设置 ---------------- */

  async function updateSettings(patch) {
    state.settings = Object.assign({}, state.settings, patch);
    state.settings = await store.saveSettings(state.settings);
    if (state.queue && !engine) {
      state.queue = setRepeat(state.queue, state.settings.repeat);
      state.queue = setShuffle(state.queue, state.settings.shuffle);
    }
    if (engine) {
      engine.setMode(state.settings);
      engine.setMinimal(!!state.settings.nativeMinimal);
    }
    if (typeof state.settings.volume === 'number') {
      if (engine) engine.setVolume(state.settings.volume);
      else if (player) player.setVolume(state.settings.volume);
    }
    // 系统媒体控件：网页引擎即时开关会话；「原生 ↔ 网页」的引擎切换要重建队列，
    // 留给下次挂载生效（设置页会提示重新打开 App）。
    if (player && typeof player.setMediaSessionEnabled === 'function') {
      player.setMediaSessionEnabled(resolveMediaMode(state.settings, nativeAvailable()).mediaSession);
    }
    refresh();
    if (shell) shell.applyAppearance();
  }

  async function clearData() {
    var ok = await host.ui.confirm({
      title: '清空数据',
      message: '歌单、收藏、最近播放与设置都会清空，不可恢复。'
    });
    if (!ok) return;
    await store.clearAll();
    state.playlists = [];
    state.favorites = [];
    state.recent = [];
    state.settings = await store.loadSettings();
    toast('已清空');
    refresh();
  }

  /* ---------------- ctx ---------------- */

  var ctx = {
    state: state,
    host: host,
    store: store,
    sources: sources,
    version: version,
    get player() { return player; },
    get shell() { return shell; },

    toast: toast,
    confirm: function (options) { return host.ui.confirm(options); },
    refresh: refresh,

    coverOf: coverOf,
    isCurrent: isCurrent,
    playlistOf: function (id) { return findPlaylist(state.playlists, id); },
    durationOf: playlistDuration,

    gotoTab: function (tab) { goto(tab); },
    goto: goto,
    openNow: openNow,
    closeNow: closeNow,

    playTracks: playTracks,
    playTrack: playTrack,
    playOne: playOne,
    appendToQueue: appendToQueue,
    togglePlay: togglePlay,
    next: next,
    prev: prev,
    seek: seek,
    setVolume: setVolume,
    cycleRepeat: cycleRepeat,
    toggleShuffle: toggleShuffle,
    queueTracks: function () { return state.queue ? state.queue.tracks : []; },

    openQueueSheet: openQueueSheet,
    openPlayModeSheet: openPlayModeSheet,
    openNeteaseToplist: openNeteaseToplist,
    removeFromQueue: removeFromQueue,
    setPlayMode: setPlayMode,
    playQueueAt: playQueueAt,
    setRepeatMode: setRepeatMode,

    searchNow: searchNow,
    suggestions: suggestions,
    clearSearches: clearSearches,
    exitApp: exitApp,
    toggleFavorite: toggleFavorite,
    createPlaylist: createPlaylist,
    renamePlaylist: renamePlaylist,
    deletePlaylist: deletePlaylist,
    addToPlaylist: addToPlaylist,
    removeFromPlaylist: removeFromPlaylist,
    moveInPlaylist: moveInPlaylist,
    openSongSheet: openSongSheet,
    openAddToPlaylist: openAddToPlaylist,
    openPrompt: function (options) { if (shell) shell.openPrompt(options); },
    openSheet: function (options) { if (shell) shell.openSheet(options); },
    openEditor: function (options) { if (shell) shell.openEditor(options); },

    updateSettings: updateSettings,
    clearData: clearData,

    lyricLines: function () { return state.lyrics.lines; },
    lyricLoading: function () { return state.lyrics.loading; },
    reloadLyrics: function () {
      if (state.player.track) loadLyrics(state.player.track);
    },
    canMinimize: function () { return !!host.caps.minimizeApp; },
    // 「悬浮播放」关掉时不缩成悬浮球，而是直接退出 App——音乐照样在后台放，但界面上没有悬浮窗
    minimizeApp: function () {
      if (state.settings.floating) host.ui.minimizeApp();
      else host.ui.closeApp();
    },
    minimizeLabel: function () { return state.settings.floating ? '最小化' : '退出并后台播放'; },

    /**
     * 一级页左上角的统一行为：
     * 悬浮窗开 → 缩成悬浮球（音乐继续）；关 → 直接退出 App（音乐同样继续）
     */
    exitOrMinimize: function () {
      try {
        if (state.settings.floating && host.caps.minimizeApp) host.ui.minimizeApp();
        else host.ui.closeApp();
      } catch (err) { /* 宿主能力缺失时静默 */ }
    },
    toast: function (text) { toast(text); },
    isNative: function () { return !!engine; },
    engineLabel: function () {
      if (!engine) {
        // 网页端：把「媒体会话开没开」也写上，方便一眼看出为什么状态栏没卡片
        var on = player && typeof player.mediaSessionOn === 'function' ? player.mediaSessionOn() : false;
        return '网页音频 · web' + (on ? ' · 媒体会话开' : '');
      }
      var size = state.queue ? state.queue.tracks.length : 0;
      var mode = state.settings.shuffle ? 'random' : (state.settings.repeat === REPEAT.ONE ? 'one' : 'loop');
      return '原生 · 队列 ' + size + ' 首 · ' + mode + (state.settings.nativeMinimal ? ' · 极简' : '');
    },
    rebuildSession: rebuildSession,
    hardStop: hardStop,
    // TA 页用：角色歌单 + 歌曲短评
    taPlaylists: function () {
      return (state.playlists || []).filter(function (p) { return p.owner === 'char'; });
    },
    /**
     * characterId 为空 = 返回**所有角色**的每条评价（一首歌可能被多个角色评过）；
     * 非空 = 只返回这个角色的，没有就跳过（不要回退到别的角色）。
     */
    /** TA 页左滑删除一条短评 */
    deleteTaComment: async function (item) {
      if (!item || !item.key) return { ok: false, reason: '没有这条短评' };
      var res = await taDeleteComment(window.Roche || null, item.characterId, item.key);
      if (res.ok) await reloadComments();
      return res;
    },

    taComments: function (characterId) {
      var map = state.comments || {};
      var want = String(characterId || '');
      var out = [];

      // 评价值只有歌名/歌手，封面从队列/收藏/最近里按 key 找一次
      var covers = Object.create(null);
      [state.queue ? state.queue.tracks : [], state.favorites || [], state.recent || []].forEach(function (list) {
        (list || []).forEach(function (t) {
          if (!t) return;
          var k = trackKey(t);
          if (k && t.cover) covers[k] = t.cover;
        });
      });

      Object.keys(map).forEach(function (key) {
        var entry = map[key] || {};
        Object.keys(entry).forEach(function (cid) {
          if (want && String(cid) !== want) return;
          var one = entry[cid] || {};
          out.push({
            key: key,
            characterId: String(cid),
            name: one.name || '',
            artist: one.artist || '',
            album: one.album || '',
            cover: one.cover || covers[key] || '',
            text: one.text || '',
            at: one.at || 0
          });
        });
      });

      return out.sort(function (a, b) { return b.at - a.at; });
    },

    /**
     * 评论缺封面时按需联网补一张（缓存 7 天）。
     * 评价值只存了歌名/歌手，很多歌不在队列/收藏里，所以必须能补。
     */
    resolveCommentCover: async function (item) {
      if (!item || !item.name) return '';
      var key = item.key || (item.name + '|' + (item.artist || ''));
      var CACHE_KEY = 'mp:commentCover';

      var cache = null;
      try {
        cache = await host.storage.get(CACHE_KEY, null);
      } catch (err) {
        cache = null;
      }
      if (cache && cache[key] && (Date.now() - (cache[key].at || 0) < 7 * 24 * 3600 * 1000)) {
        return cache[key].url || '';
      }

      try {
        var res = await sources.search((item.name + ' ' + (item.artist || '')).trim(), state.settings, { limit: 3 });
        var first = res && res.tracks && res.tracks[0];
        var url = first && first.cover ? String(first.cover).replace(/^http:/, 'https:') : '';
        if (!url) return '';

        var next = cache && typeof cache === 'object' ? cache : {};
        next[key] = { url: url, at: Date.now() };
        try { await host.storage.set(CACHE_KEY, next); } catch (err) { /* 忽略 */ }
        return url;
      } catch (err) {
        return '';
      }
    },

    /** 点乐评封面/唱片：优先在队列里跳，没有就按歌名搜一首播 */
    playComment: async function (item) {
      if (!item) return { ok: false, reason: '没有这首歌' };

      var q = state.queue;
      if (q && item.key) {
        for (var i = 0; i < q.tracks.length; i++) {
          if (trackKey(q.tracks[i]) === item.key) {
            await playQueueAt(i);
            return { ok: true };
          }
        }
      }

      var keyword = (item.name + ' ' + (item.artist || '')).trim();
      if (!keyword) return { ok: false, reason: '没有这首歌' };
      try {
        var res = await sources.search(keyword, state.settings, { limit: 5 });
        if (res && res.tracks && res.tracks.length) {
          await playTracks([res.tracks[0]], 0);
          return { ok: true };
        }
      } catch (err) { /* 忽略 */ }
      return { ok: false, reason: '没找到这首歌' };
    },
    reloadComments: reloadComments,
    reloadPlaylists: reloadPlaylists,

    /* ---------------- 推荐 ---------------- */

    prefs: function () { return state.prefs && state.prefs.length ? state.prefs : defaultPrefs(); },

    savePrefs: async function (list) {
      state.prefs = normalizePrefs(list);
      await host.storage.set('mp:prefs', state.prefs);
      return state.prefs;
    },

    recommendCache: function () { return state.rec; },

    /** 有没有登录网易云（决定推荐页要不要显示排行榜入口） */
    neteaseReady: function () {
      try {
        return neteaseLoggedIn(state.settings);
      } catch (err) {
        return false;
      }
    },

    /** 网易云服务是否可用（搜索页直接展示榜单只看这个，公开榜单不需要登录） */
    neteaseApiReady: function () {
      try {
        return neteaseReady(state.settings);
      } catch (err) {
        return false;
      }
    },

    /** 拉榜单列表；失败不弹 toast，交给页面显示重试 */
    fetchNeteaseToplists: async function () {
      try {
        var list = await neToplists(state.settings);
        return { ok: true, list: list || [] };
      } catch (err) {
        return { ok: false, list: [], reason: String((err && err.message) || err) };
      }
    },

    playNeteaseToplist: async function (id, name) {
      return playNeteasePlaylist({ id: id, name: name || '网易云榜单' });
    },

    /** 播一首网易云单曲（榜单卡里点歌名用） */
    playNeteaseSong: async function (track) {
      if (!track) return { ok: false, reason: '没有这首歌' };
      var one = normalizeTrack(track, 'netease');
      if (!one) return { ok: false, reason: '这首歌有问题' };
      await playTracks([one], 0);
      refresh();
      return { ok: true };
    },

    /** 榜单卡：榜单信息 + 每榜前 8 首，缓存 10 分钟 */
    fetchNeteaseRankCards: async function () {
      var CACHE_KEY = 'mp:rankCache';
      try {
        var cache = await host.storage.get(CACHE_KEY, null);
        if (cache && cache.at && cache.list && Date.now() - cache.at < 10 * 60 * 1000) {
          return { ok: true, list: cache.list, cached: true };
        }
      } catch (err) { /* 读不到就重新拉 */ }

      var tops = [];
      try {
        tops = await neToplists(state.settings);
      } catch (err) {
        return { ok: false, list: [], reason: String((err && err.message) || err) };
      }
      if (!tops || !tops.length) return { ok: false, list: [], reason: '没有榜单' };

      var picked = tops.slice(0, 6);
      var list = await Promise.all(picked.map(async function (item) {
        var tracks = [];
        try {
          var got = await nePlaylistTracks(state.settings, item.id, 8);
          tracks = (got || []).slice(0, 8);
        } catch (err) {
          tracks = [];
        }
        return {
          id: item.id,
          name: item.name,
          cover: item.cover,
          count: item.count,
          tracks: tracks
        };
      }));

      try {
        await host.storage.set(CACHE_KEY, { at: Date.now(), list: list });
      } catch (err) { /* 写不进去不影响显示 */ }

      return { ok: true, list: list };
    },

    openPrefsPanel: function () {
      if (shell) shell.openPrefsPanel();
    },

    /** force=true 表示用户点了「换一批」；否则 30 分钟内直接用缓存 */
    refreshRecommend: async function (force) {
      var cache = state.rec;
      var fresh = cache && cache.at && (Date.now() - cache.at < 30 * 60 * 1000);
      if (!force && fresh) return cache;

      var res = await generateRecommend({
        sources: sources,
        settings: state.settings,
        prefs: state.prefs && state.prefs.length ? state.prefs : defaultPrefs(),
        recent: state.recent,
        favorites: state.favorites
      });

      state.rec = Object.assign({ at: Date.now() }, res);
      await host.storage.set('mp:rec', state.rec);
      // 注意：这里不调 refresh()，否则会把当前页面（比如正在搜索的搜索页）整体重建
      return state.rec;
    },

    playRecommend: async function (tracks, index) {
      var list = (tracks || []).filter(Boolean);
      if (!list.length) return { ok: false, reason: '没有可播放的歌' };
      await playTracks(list, index || 0);
      refresh();
      return { ok: true };
    },
    addCurrentToCharPlaylist: addCurrentToCharPlaylist,
    commentCurrent: commentCurrent,
    engineStats: function () {
      if (!engine) return null;
      var stats = engine.stats();
      return {
        events: stats.events,
        queues: stats.queues,
        secondsAgo: stats.lastEventAt ? Math.round((Date.now() - stats.lastEventAt) / 1000) : -1
      };
    }
  };

  /* ---------------- 初始化 ---------------- */

  var loaded = await Promise.all([
    store.loadSettings(),
    store.loadFavorites(),
    store.loadRecent(),
    store.loadSearches()
  ]);

  state.settings = loaded[0];
  state.favorites = loaded[1];
  state.recent = loaded[2];
  state.searches = loaded[3];

  // 歌单 / 短评必须合并 localStorage 镜像：角色在聊天侧新建的歌单和乐评只写在镜像里
  // （聊天回调与 App 可能是两份宿主 storage），裸用 store.loadX() 会看不到它们。
  await reloadPlaylists();
  await reloadComments();
  state.prefs = normalizePrefs(await host.storage.get('mp:prefs', null));
  state.rec = await host.storage.get('mp:rec', null);
  state.player.volume = state.settings.volume;

  state.queue = (await loadQueue()) || createQueue([], {
    repeat: state.settings.repeat,
    shuffle: state.settings.shuffle
  });

  // 系统媒体控件（安卓通知栏 / 灵动胶囊、iOS 锁屏）：按设置决定用原生引擎还是网页引擎。
  // off = 不映射：两个都不注册媒体会话，系统里不会出现一个点不动的空卡片。
  var mediaMode = resolveMediaMode(state.settings, nativeAvailable());

  // 诊断：网页版「点了没声」时，F12 看这一行就知道走的是哪条链路
  try {
    console.info('[mp] audio env', {
      protocol: typeof location !== 'undefined' ? location.protocol : '',
      hasNativePlugin: nativeAvailable(),
      useNative: mediaMode.useNative,
      mediaSession: mediaMode.mediaSession,
      systemMedia: state.settings.systemMedia
    });
  } catch (err) { /* 忽略 */ }

  if (mediaMode.useNative) {
    engine = createNativeEngine({
      sources: sources,
      minimal: !!state.settings.nativeMinimal,
      onChange: function (snapshot) {
        state.player = snapshot;
        if (shell) shell.renderPlayer();
      },
      onTrackChange: function (track) {
        // 列表里没有就先补进去（角色在 App 没开时点的歌走这条路）
        var inList = state.queue && state.queue.tracks.some(function (t) {
          return trackKey(t) === trackKey(track);
        });
        if (!inList) {
          state.queue = appendTracks(state.queue, [track]);
          if (engine) engine.setList(state.queue.tracks, state.settings);
        }

        state.queue = jumpTo(state.queue, trackKey(track));
        state.recent = pushRecent(state.recent, track, MAX_RECENT);
        store.saveRecent(state.recent);
        saveQueue();
        loadLyrics(track);
        if (shell) shell.renderPlayer();
      }
    });
  }

  // 没有原生插件（或用户选了「不映射」）时退回 WebView 内的 <audio>，行为保持一致
  player = getPlayer({
    volume: state.settings.volume,
    mediaSession: mediaMode.mediaSession,
    onChange: function (snapshot) {
      state.player = snapshot;
      if (shell) shell.renderPlayer();
    },
    onEnded: function () { next(true); },
    onNext: function () { next(false); },
    onPrev: function () { prev(); }
  });
  state.player = player.getState();

  shell = createShell(container, ctx);
  shell.mount();
  installBridge();
  hydrateListen(await host.storage.get('mp:listen', null));
  syncChatRuntime();

  /**
   * 聊天里点歌时原生队列只拿到那一首（聊天侧解析不到整队地址），并留了 mp:needRebuild。
   * 以前只在 App 首次挂载时检查 —— App 开着的时候状态栏就永远锁在这一首上。
   * 现在做成可重复调用：attach 完、定时器都会走一遍，且**只有当前曲没变时才 seek**，
   * 否则重建后跳到新曲是从 0 开始（这正是「切回来放不出来」的原因）。
   */
  var rebuilding = false;

  function applyPendingRebuild() {
    if (!engine || !state.queue || rebuilding) return false;
    if (!isRebuildNeeded()) return false;
    if (state.queue.tracks.length < 2) return false; // 真只有一首，没什么可重建的

    var nativeTrack = engine.getState().track;
    var appTrack = state.player.track || current(state.queue);

    // 以「正在播的那首」为准找下标：队列 pos 可能还停在进行其它歌上
    var idx = -1;
    if (appTrack) {
      for (var i = 0; i < state.queue.tracks.length; i++) {
        if (trackKey(state.queue.tracks[i]) === trackKey(appTrack)) { idx = i; break; }
      }
    }
    if (!(idx >= 0)) {
      idx = state.queue.order[state.queue.pos];
      if (!(idx >= 0)) idx = 0;
    }

    var sameTrack = !!(nativeTrack && appTrack && trackKey(nativeTrack) === trackKey(appTrack));
    var resumeAt = sameTrack ? (state.player.time || 0) : 0;

    clearRebuildNeeded();
    rebuilding = true;

    return Promise.resolve(engine.playList(state.queue.tracks, idx, state.settings)).then(function () {
      if (sameTrack && resumeAt > 1500) engine.seek(resumeAt);
      rebuilding = false;
      if (shell) shell.renderPlayer();
      return true;
    }, function () {
      rebuilding = false;
      return false;
    });
  }

  // 原生播放器可能在别的插件里就开始播了：这里只接管状态，不重新起播
  // 注意：队列为空也要 attach，否则拿不到原生正在放的歌（列表会一直显示 0 首）
  if (engine) {
    engine.attach(state.queue.tracks, state.settings).then(function () {
      var nowPlaying = engine.getState().track;
      if (nowPlaying) {
        // 原生在播但 App 队列里没有（比如 App 没开时角色点的歌）→ 补进播放列表
        var exists = state.queue.tracks.some(function (t) {
          return trackKey(t) === trackKey(nowPlaying);
        });
        if (!exists) {
          state.queue = appendTracks(state.queue, [nowPlaying]);
          engine.setList(state.queue.tracks, state.settings);
          saveQueue();
        }

        state.player = engine.getState();
        var cachedLines = lyrics.getCached(nowPlaying);
        if (cachedLines && cachedLines.length) {
          state.lyrics = { lines: cachedLines, loading: false, error: '' };
        } else {
          loadLyrics(nowPlaying);
        }
        if (shell) shell.renderPlayer();
      }

      // 角色在 App 没开时点的歌：原生队列里只有一首，这里用完整队列重建一次，
      // 否则状态栏的上一首/下一首会一直锁在这一首上
      applyPendingRebuild();
    });
  }

  // App 一直开着的时候也要能收到聊天点歌的信号（以前只在挂载时看一次）
  var rebuildTimer = setInterval(function () {
    if (!engine) return;
    applyPendingRebuild();
  }, 1200);

  // 重新挂载时把正在播的歌的歌词补回来
  if (state.player.track) {
    var cached = lyrics.getCached(state.player.track);
    if (cached && cached.length) {
      state.lyrics = { lines: cached, loading: false, error: '' };
      shell.renderPlayer();
    } else {
      loadLyrics(state.player.track);
    }
  }

  // 角色在 App 没打开时点的歌，只到了原生播放器：
  // 这里定时把「正在播但列表里没有的歌」补回播放列表，保证 App 里能看到
  var queueSyncTimer = setInterval(function () {
    if (!engine || !shell || !state.queue) return;
    var now = engine.getState().track;
    if (!now) return;
    var exists = state.queue.tracks.some(function (t) {
      return trackKey(t) === trackKey(now);
    });
    if (exists) {
      // 已经在列表里：只要把当前位置挪到它上面，别让 UI 和真实播放错位
      var cur = current(state.queue);
      if (!cur || trackKey(cur) !== trackKey(now)) {
        state.queue = jumpTo(state.queue, trackKey(now));
        saveQueue();
        refresh();
      }
      return;
    }
    state.queue = appendTracks(state.queue, [now]);
    state.queue = jumpTo(state.queue, trackKey(now));
    engine.setList(state.queue.tracks, state.settings);
    saveQueue();
    refresh();
    // 补进队列后紧接着把原生窗口重建，状态栏才立刻有上一首/下一首
    applyPendingRebuild();
  }, 4000);

  // 从聊天卡片点进来时，storage 里带着要播的歌
  var pending = await host.storage.get('mp:pending', null);
  if (pending) {
    await host.storage.delete('mp:pending');
    var track = normalizeTrack(pending, 'local');
    if (track) {
      state.queue = createQueue([track], { repeat: state.settings.repeat, shuffle: false });
      saveQueue();
      playTrack(track);
    }
  }

  return {
    ctx: ctx,
    destroy: function () {
      searchToken += 1;
      if (queueSyncTimer) clearInterval(queueSyncTimer);
      queueSyncTimer = null;
      if (rebuildTimer) clearInterval(rebuildTimer);
      rebuildTimer = null;
      // 只解绑 UI 回调，不销毁播放：切到别的插件时音乐要继续
      if (player) player.setHandlers({});
      if (engine) engine.dispose();
      clearBridge();
      if (shell) shell.destroy();
      shell = null;
      saveQueue();
    }
  };
}
