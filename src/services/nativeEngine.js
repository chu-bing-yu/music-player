/**
 * 原生播放引擎：把 JS 队列切成「窗口」交给宿主原生播放器，
 * 这样状态栏 / 锁屏 / 控制中心就能显示歌名封面并控制播放。
 *
 * 为什么是窗口：原生 replaceQueue 会从头开始放，不能追加，
 * 所以一次只给它 10 首；播到窗口最后一首时立刻用「当前这首 + 后面 9 首」重建，
 * 相当于无缝续上。
 */

import { trackKey } from '../core/track.js';
import { REPEAT } from '../core/queue.js';
import { createNativeAudio } from './nativeAudio.js';

var WINDOW = 10;
/**
 * 一次就把整窗解析好再交给原生，不做「先 3 首起播再扩充」。
 * 因为扩充 = 又调一次 replaceQueue，会重置原生队列；
 * 用户此时拉下控制中心按按钮就会像「按了没反应」。
 */
var WARM = WINDOW;
var CONCURRENCY = 4;
var POLL_MS = 900;
/** 距离播完多少秒开始准备下一窗，避免卡在窗口边界 */
var EDGE_BEFORE = 1.5;
/** QQ 直链的 vkey 有时效，缓存超过这个时间就重新解析（实测 5 分钟仍可用，这里留余量） */
var URL_TTL = 3 * 60 * 1000;
/** 起播后给原生播放器 6 秒准备时间（网络慢时 prepare 可能要几秒），超时还没声才判定失败 */
var PREPARE_GRACE = 6000;

export function createNativeEngine(options) {
  var opts = options || {};
  var sources = opts.sources;
  var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};
  var onTrackChange = typeof opts.onTrackChange === 'function' ? opts.onTrackChange : function () {};
  var onEnded = typeof opts.onEnded === 'function' ? opts.onEnded : function () {};

  var audio = createNativeAudio();
  var list = [];
  var windowTracks = [];
  var windowMap = [];      // 原生下标 → list 下标
  var resolved = Object.create(null);
  var settings = null;
  var timer = null;
  var listenerOff = null;
  var lastNativeIndex = -1;
  var rebuiltFor = '';
  var busy = false;
  var opToken = 0;
  var openedAt = 0;
  var retried = Object.create(null);
  var edgeFiredFor = '';
  // 连续自动跳过几次了（放不出来的歌直接跳下一首）；正常播放后清零
  var autoSkips = 0;
  // 诊断计数：控制栏按钮按下后，如果事件数一直不涨，说明命令根本没到原生（宿主问题）
  var stats = { events: 0, queues: 0, lastEventAt: 0 };
  var minimal = !!opts.minimal;

  var state = {
    status: 'idle',
    track: null,
    time: 0,
    duration: 0,
    error: '',
    volume: 0.8
  };

  function emit() {
    onChange(getState());
  }

  function getState() {
    return {
      status: state.status,
      track: state.track,
      time: state.time,
      duration: state.duration,
      error: state.error,
      volume: state.volume
    };
  }

  function modeOf(s) {
    if (!s) return 'loop';
    if (s.playMode === 'shuffle' || (s.playMode == null && s.shuffle)) return 'random';
    if (s.playMode === 'one' || (s.playMode == null && s.repeat === REPEAT.ONE)) return 'one';
    return 'loop';
  }

  /* ---------------- 解析播放地址 ---------------- */

  /** 取未过期的播放地址；过期就当没有，重新解析 */
  function urlOf(track) {
    var key = trackKey(track);
    var item = resolved[key];
    if (!item) return '';
    if (Date.now() - item.at > URL_TTL) {
      delete resolved[key];
      return '';
    }
    return item.url;
  }

  async function resolveOne(track) {
    var key = trackKey(track);
    try {
      var next = sources.createResolver(track, settings);
      var url = await next();
      if (url) resolved[key] = { url: url, at: Date.now() };
      else delete resolved[key];
    } catch (err) {
      delete resolved[key];
    }
  }

  async function resolveUrls(tracks) {
    var pending = (tracks || []).filter(function (t) { return t && !urlOf(t); });
    var cursor = 0;

    async function worker() {
      while (cursor < pending.length) {
        await resolveOne(pending[cursor++]);
      }
    }

    var workers = [];
    for (var i = 0; i < CONCURRENCY; i++) workers.push(worker());
    await Promise.all(workers);
  }

  /* ---------------- 开窗播放 ---------------- */

  async function openWindow(jsStart, autoplay) {
    if (!list.length) return false;
    var token = ++opToken;
    var total = list.length;
    var start = Math.min(Math.max(jsStart, 0), total - 1);
    // 环形取窗：从最后一首开始时，窗口要接上列表开头的歌，
    // 否则交给原生的队列只有 1 首，控制中心的「下一首」就是重播同一首
    var count = Math.min(WINDOW, total);
    var slice = [];
    var ringIndex = [];
    for (var k = 0; k < count; k++) {
      var idx = (start + k) % total;
      slice.push(list[idx]);
      ringIndex.push(idx);
    }
    if (!slice.length) return false;

    state.status = 'loading';
    state.error = '';
    emit();

    // 只等前 WARM 首，先开播；剩下的地址后台补，补完再把原生队列扩满
    var warm = slice.slice(0, Math.min(WARM, slice.length));
    await resolveUrls(warm);
    if (token !== opToken) return false; // 期间又点了别的歌，这次作废

    var nativeTracks = [];
    var map = [];
    warm.forEach(function (track, i) {
      var url = urlOf(track);
      if (!url) return;
      nativeTracks.push(toNativeTrack(track, url));
      map.push(ringIndex[i]);
    });

    if (!nativeTracks.length) {
      state.status = 'error';
      state.error = '这首放不了';
      emit();
      return false;
    }

    windowTracks = slice;
    windowMap = map;
    rebuiltFor = '';
    lastNativeIndex = -1;
    edgeFiredFor = '';

    var status = null;
    try {
      status = await audio.replaceQueue({
        tracks: nativeTracks,
        startIndex: 0,
        mode: modeOf(settings),
        autoplay: autoplay !== false
      });
    } catch (err) {
      state.status = 'error';
      state.error = '起播失败，换一首试试';
      emit();
      return false;
    }

    if (token !== opToken) return false;

    stats.queues += 1;
    openedAt = Date.now();
    startPolling();
    if (status) applyStatus(status, true);

    return true;
  }

  function toNativeTrack(track, url) {
    return {
      id: trackKey(track),
      albumId: track.album || '',
      title: track.name || '未知歌曲',
      artist: track.artist || '',
      cover: track.cover || '',
      url: url
    };
  }

  /** 把当前窗口从 WARM 首扩到完整窗口，尽量不让用户听出来（同一首 + 恢复进度） */
  async function expandWindow(token, start, slice) {
    if (busy || token !== opToken) return;
    if (!state.track) return;
    if (trackKey(state.track) !== trackKey(list[start])) return;
    // 已经播了一阵子就不折腾，等自然换窗时再给完整窗口
    if (Date.now() - openedAt > 15000) return;

    var nativeTracks = [];
    var map = [];
    slice.forEach(function (track, i) {
      var url = urlOf(track);
      if (!url) return;
      nativeTracks.push(toNativeTrack(track, url));
      map.push(start + i);
    });
    if (nativeTracks.length <= windowMap.length) return;

    var resumeAt = (state.time || 0) / 1000;
    var wasPlaying = state.status === 'playing';

    busy = true;
    var status = null;
    try {
      status = await audio.replaceQueue({
        tracks: nativeTracks,
        startIndex: 0,
        mode: modeOf(settings),
        autoplay: wasPlaying
      });
    } catch (err) {
      status = null;
    } finally {
      busy = false;
    }

    if (token !== opToken) return;

    windowMap = map;
    lastNativeIndex = 0;
    edgeFiredFor = '';
    openedAt = Date.now();

    if (resumeAt > 1) {
      try {
        await audio.seekTo(resumeAt);
      } catch (err) { /* 恢复不了就从头放，影响很小 */ }
    }

    if (status) applyStatus(status, true);
  }

  /* ---------------- 状态同步 ---------------- */

  function indexByTrackId(id) {
    if (!id) return -1;
    for (var i = 0; i < list.length; i++) {
      if (trackKey(list[i]) === id) return i;
    }
    return -1;
  }

  function applyStatus(raw, force) {
    if (!raw) return;
    var nativeIndex = Number(raw.currentTrackIndex);

    // 优先按原生返回的 trackId 对回 JS 队列：App 重开后窗口映射是空的，靠这个恢复
    var track = null;
    var byId = indexByTrackId(raw.trackId);
    if (byId >= 0) track = list[byId];
    else if (Number.isFinite(nativeIndex) && windowMap[nativeIndex] != null) {
      track = list[windowMap[nativeIndex]];
    }

    // 队列里没有这首（比如角色在 App 没打开时点的歌）→ 用原生返回的信息补一首，
    // 否则界面永远显示「没有在放歌」
    if (!track && raw.title) {
      if (state.track && state.track.name === raw.title) {
        track = state.track;
      } else {
        track = {
          source: 'native',
          platform: 'local',
          id: String(raw.trackId || raw.title),
          name: raw.title,
          artist: raw.artist || '',
          album: raw.albumId || '',
          cover: raw.cover || '',
          duration: (Number(raw.duration) || 0) * 1000
        };
        list = list.concat([track]);
        windowMap[nativeIndex] = list.length - 1;
      }
    }

    if (track && (!state.track || trackKey(state.track) !== trackKey(track))) {
      state.track = track;
      // 换歌了：重新开始计时，避免把「刚切歌还在 prepare」误判成播放失败
      openedAt = Date.now();
      onTrackChange(track);
    }

    if (Number.isFinite(nativeIndex) && nativeIndex >= 0 && windowMap[nativeIndex] != null) {
      lastNativeIndex = nativeIndex;
    }

    if (typeof raw.currentTime === 'number') state.time = Math.max(0, raw.currentTime) * 1000;
    if (typeof raw.duration === 'number') state.duration = Math.max(0, raw.duration) * 1000;

    if (typeof raw.isPlaying === 'boolean') {
      state.status = raw.isPlaying ? 'playing' : (state.track ? 'paused' : 'idle');
      if (raw.isPlaying) autoSkips = 0;
    }

    emit();
    maybeRecover(raw);
    maybeAdvanceWindow(raw);
  }

  /**
   * 起播失败自救：原生 setDataSource 失败时不会有明确报错，
   * 表现是「没在播 + 时长 0 + 进度 0」。这时把地址缓存作废、重新解析并重开窗口。
   */
  function maybeRecover(raw) {
    if (minimal) return;
    if (!raw || !state.track || raw.isPlaying) return;
    if (Number(raw.duration) > 0 || Number(raw.currentTime) > 0) return; // 只是暂停
    if (!openedAt || Date.now() - openedAt < PREPARE_GRACE) return;
    if (busy) return;
    if (raw.initialized === false) return; // 原生队列空了，不重建
    // 原生状态里的 trackId 必须和当前这首对得上，否则说明正在切换，别乱重建
    if (raw.trackId && trackKey(state.track) !== raw.trackId) return;

    var key = trackKey(state.track);
    var tries = retried[key] || 0;
    if (tries >= 2) {
      // 无版权 / 放不出来的歌：直接跳过，别停在这儿
      var skipFrom = indexByTrackId(raw.trackId);
      if (autoSkips < 3 && skipFrom >= 0 && skipFrom + 1 < list.length) {
        autoSkips += 1;
        openWindow(skipFrom + 1, true).then(function () { busy = false; }, function () { busy = false; });
        busy = true;
        return;
      }

      state.status = 'error';
      state.error = '这首放不了，已跳到下一首';
      emit();
      return;
    }

    retried[key] = tries + 1;
    delete resolved[key];

    var jsIndex = indexByTrackId(raw.trackId);
    if (jsIndex < 0) return;

    busy = true;
    openedAt = Date.now();
    openWindow(jsIndex, true).then(function () {
      busy = false;
    }, function () {
      busy = false;
    });
  }

  /**
   * 窗口用完了再换窗：只在「当前是窗口最后一首，且快播完」时切成下一窗。
   * 这样正常切歌永远不会触发重建（之前每次状态变化都重建，所以点下一首会卡）。
   */
  function maybeAdvanceWindow(raw) {
    if (minimal) return;
    if (busy || !windowMap.length) return;
    if (windowMap.length <= 1) return;

    var nativeIndex = Number(raw.currentTrackIndex);
    if (nativeIndex !== windowMap.length - 1) return;

    var duration = Number(raw.duration) || 0;
    var current = Number(raw.currentTime) || 0;
    if (!duration || duration - current > EDGE_BEFORE) return;

    var jsIndex = windowMap[nativeIndex];
    if (jsIndex == null) return;

    var key = String(jsIndex);
    if (edgeFiredFor === key) return;
    edgeFiredFor = key;

    var nextIndex = jsIndex + 1;
    if (nextIndex >= list.length) {
      // 顺序播放到底：停下来，不回到第一首
      if (!settings.repeat || settings.repeat === REPEAT.OFF) {
        audio.pause().then(function (status) {
          if (status) applyStatus(status, true);
        }, function () { /* 忽略 */ });
        return;
      }
      nextIndex = 0;
    }

    busy = true;
    openWindow(nextIndex, true).then(function () {
      busy = false;
    }, function () {
      busy = false;
    });
  }

  async function syncNow() {
    var status = await audio.getStatus();
    if (status) applyStatus(status, false);
  }

  function startPolling() {
    if (!listenerOff) {
      listenerOff = audio.addStatusListener(function (status) {
        if (!status) return;
        stats.events += 1;
        stats.lastEventAt = Date.now();
        applyStatus(status, true);
      });
    }
    // 极简模式：只靠原生事件更新界面，不轮询、不干预
    if (minimal || timer) return;
    timer = setInterval(syncNow, POLL_MS);
  }

  /** 极简模式：把自己彻底从原生播放器旁边挪开，用来分辨「是不是插件在干扰」 */
  function setMinimal(value) {
    minimal = !!value;
    if (minimal) {
      if (timer) clearInterval(timer);
      timer = null;
      if (!listenerOff) startPolling();
    } else {
      startPolling();
    }
  }

  function stopPolling() {
    if (timer) clearInterval(timer);
    timer = null;
    if (listenerOff) listenerOff();
    listenerOff = null;
  }

  /* ---------------- 对外接口 ---------------- */

  async function playList(tracks, startIndex, currentSettings) {
    list = (tracks || []).filter(Boolean).slice();
    settings = currentSettings || settings;
    lastNativeIndex = -1;
    if (!list.length) return false;
    return openWindow(startIndex || 0, true);
  }

  /** 重开 App 时只接管正在播的状态，不重新起播 */
  async function attach(tracks, currentSettings) {
    list = (tracks || []).filter(Boolean).slice();
    settings = currentSettings || settings;
    startPolling();
    await syncNow();
  }

  /**
   * 同步列表（追加/插入歌曲后必须调用）。
   * 不重新起播，只更新内部 list，否则 playAt 的索引会被 clamp 到旧长度，
   * 表现就是「点新加的歌却播了最后一首」「下一首老在同一首打转」。
   */
  function setList(tracks, currentSettings) {
    list = (tracks || []).filter(Boolean).slice();
    if (currentSettings) settings = currentSettings;
  }

  async function playAt(jsIndex) {
    if (!list.length) return false;
    return openWindow(jsIndex, true);
  }

  /** 下一首：窗口内直接让原生推进（不重启整窗，最快也不会掉播放） */
  async function next() {
    if (!list.length) return false;
    if (lastNativeIndex >= 0 && lastNativeIndex + 1 < windowMap.length) {
      var advanced = await audio.next();
      if (advanced) {
        applyStatus(advanced, true);
        return true;
      }
    }
    var nextIndex = lastNativeIndex >= 0 ? windowMap[lastNativeIndex] + 1 : 0;
    return openWindow(((nextIndex % list.length) + list.length) % list.length, true);
  }

  async function previous() {
    if (!list.length) return false;
    if (lastNativeIndex > 0) {
      var moved = await audio.previous();
      if (moved) {
        applyStatus(moved, true);
        return true;
      }
    }
    var jsIndex = lastNativeIndex >= 0 ? windowMap[lastNativeIndex] - 1 : 0;
    if (jsIndex < 0) jsIndex = 0;
    return openWindow(jsIndex, true);
  }

  async function toggle() {
    if (!state.track) return false;
    var status = await (state.status === 'playing' ? audio.pause() : audio.play());
    if (status) applyStatus(status, true);
    else emit();
    return true;
  }

  async function seek(ms) {
    var status = await audio.seekTo(Math.max(0, (Number(ms) || 0) / 1000));
    if (status) applyStatus(status, false);
  }

  async function setMode(nextSettings) {
    settings = nextSettings;
    await audio.setPlaybackMode(modeOf(settings));
  }

  async function stop() {
    stopPolling();
    await audio.stop();
    list = [];
    windowMap = [];
    windowTracks = [];
    state.status = 'idle';
    state.track = null;
    state.time = 0;
    state.duration = 0;
    emit();
  }

  function dispose() {
    stopPolling();
    state.track = null;
    state.status = 'idle';
  }

  function setVolume(v) {
    // 原生播放器跟随系统音量，这里只保留 UI 状态
    state.volume = Math.min(1, Math.max(0, Number(v) || 0));
    return state.volume;
  }

  return {
    kind: 'native',
    available: function () { return audio.available(); },
    playList: playList,
    attach: attach,
    setList: setList,
    playAt: playAt,
    next: next,
    previous: previous,
    toggle: toggle,
    seek: seek,
    setMode: setMode,
    stop: stop,
    dispose: dispose,
    setVolume: setVolume,
    setMinimal: setMinimal,
    stats: function () { return Object.assign({}, stats); },
    syncNow: syncNow,
    getState: getState,
    jsIndexOf: function () {
      var idx = windowMap[lastNativeIndex];
      return idx == null ? -1 : idx;
    }
  };
}
