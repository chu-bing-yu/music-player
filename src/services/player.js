/**
 * 播放器：整个插件只有一个 Audio 实例（模块级单例，切插件/重开 App 也不销毁）。
 *
 * 另外做两件容易被忽略的事：
 *  1. 音频会话被别的 App 抢走后，WebView 常见「点播放没反应」——重建 Audio 再放。
 *  2. 接 navigator.mediaSession，让系统状态栏/锁屏/控制中心能暂停、上一首、下一首。
 */

var MEDIA_ACTIONS = ['play', 'pause', 'previoustrack', 'nexttrack', 'stop', 'seekto', 'seekbackward', 'seekforward'];

export function createPlayer(options) {
  var opts = options || {};
  var state = {
    status: 'idle', // idle | loading | playing | paused | error
    track: null,
    time: 0,
    duration: 0,
    error: '',
    volume: typeof opts.volume === 'number' ? opts.volume : 0.8
  };

  var audio = null;
  var lastSrc = '';
  var attemptToken = 0;
  var lastPositionAt = 0;
  // 系统媒体控件（iOS 锁屏 / 灵动岛、安卓通知栏）开关：设置里选「不映射」时整块关掉，
  // 系统里就不会留下一个点不动的空媒体卡片（华为平板就栽在这）。
  var mediaOn = opts.mediaSession !== false;

  function emit() {
    if (typeof opts.onChange === 'function') opts.onChange(getState());
    updateMediaSession();
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

  /* ---------------- Audio 实例 ---------------- */

  function onTimeUpdate() {
    state.time = Number(audio.currentTime || 0) * 1000;
    if (audio.duration && Number.isFinite(audio.duration)) {
      state.duration = Number(audio.duration) * 1000;
    }
    if (typeof opts.onChange === 'function') opts.onChange(getState());
    updatePositionState();
  }

  function onLoadedMetadata() {
    state.duration = Number.isFinite(audio.duration)
      ? Number(audio.duration) * 1000
      : (state.track && state.track.duration) || 0;
    emit();
  }

  function onPlay() {
    state.status = 'playing';
    state.error = '';
    emit();
  }

  /** 网页版（Chrome 打开链接）常出现「刚播就暂停」，这里自愈一次 */
  var nudged = false;

  function onPause() {
    var wasPlaying = state.status === 'playing';
    var nearStart = !!audio && audio.currentTime < 1 && wasPlaying;

    if (state.status !== 'error' && state.status !== 'loading') state.status = 'paused';
    emit();

    if (nearStart && !nudged) {
      nudged = true;
      setTimeout(function () {
        if (!audio || !audio.paused) return;
        audio.play().catch(function () { nudged = false; });
      }, 300);
    }
  }

  function onEnded() {
    state.status = 'paused';
    state.time = state.duration;
    emit();
    if (typeof opts.onEnded === 'function') opts.onEnded();
  }

  function onError() {
    // 地址失效时交给 load() 的候选链处理；这里只标记
    if (state.status === 'loading') return;
    state.status = 'error';
    state.error = '音频加载失败';
    emit();
  }

  function bindAudio(target) {
    target.addEventListener('timeupdate', onTimeUpdate);
    target.addEventListener('loadedmetadata', onLoadedMetadata);
    target.addEventListener('play', onPlay);
    target.addEventListener('pause', onPause);
    target.addEventListener('ended', onEnded);
    target.addEventListener('error', onError);
  }

  function recreateAudio() {
    if (audio) {
      try { audio.pause(); } catch (err) { /* 忽略 */ }
      try {
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('play', onPlay);
        audio.removeEventListener('pause', onPause);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
      } catch (err) { /* 忽略 */ }
    }
    audio = new Audio();
    audio.preload = 'auto';
    audio.volume = state.volume;
    bindAudio(audio);
  }

  recreateAudio();

  /* ---------------- 系统媒体控制 ---------------- */

  function mediaSession() {
    if (!mediaOn) return null;
    if (typeof navigator === 'undefined' || !navigator.mediaSession) return null;
    return navigator.mediaSession;
  }

  /** 设置里切换「映射 / 不映射」时调用；关掉要把已注册的会话清理干净 */
  function setMediaSessionEnabled(on) {
    var next = on !== false;
    if (next === mediaOn) return;
    if (!next) {
      MEDIA_ACTIONS.forEach(function (action) { setActionHandler(action, null); });
      var ms = mediaSession();
      if (ms) {
        try { ms.metadata = null; } catch (err) { /* 忽略 */ }
        try { ms.playbackState = 'none'; } catch (err) { /* 忽略 */ }
      }
    }
    mediaOn = next;
    if (next) {
      setupMediaActions();
      updateMediaSession();
    }
  }

  function updateMediaSession() {
    var ms = mediaSession();
    if (!ms) return;

    if (state.track && typeof MediaMetadata !== 'undefined') {
      var cover = state.track.cover || '';
      try {
        ms.metadata = new MediaMetadata({
          title: state.track.name || '',
          artist: state.track.artist || '',
          album: state.track.album || '',
          artwork: cover ? [{ src: cover, sizes: '300x300', type: 'image/jpeg' }] : []
        });
      } catch (err) { /* 忽略 */ }
    }

    try {
      if (!state.track) ms.playbackState = 'none';
      else ms.playbackState = state.status === 'playing' ? 'playing' : 'paused';
    } catch (err) { /* 忽略 */ }
  }

  function updatePositionState() {
    var ms = mediaSession();
    if (!ms || typeof ms.setPositionState !== 'function') return;
    var now = Date.now();
    if (now - lastPositionAt < 1000) return;
    lastPositionAt = now;

    var duration = state.duration / 1000;
    if (!duration || !Number.isFinite(duration) || duration <= 0) return;
    try {
      ms.setPositionState({
        duration: duration,
        playbackRate: 1,
        position: Math.min(Math.max(state.time / 1000, 0), duration)
      });
    } catch (err) { /* 忽略 */ }
  }

  function setActionHandler(action, handler) {
    var ms = mediaSession();
    if (!ms || typeof ms.setActionHandler !== 'function') return;
    try {
      ms.setActionHandler(action, handler);
    } catch (err) { /* 部分动作不支持 */ }
  }

  function setupMediaActions() {
    if (!mediaSession()) return;
    setActionHandler('play', function () { resume(); });
    setActionHandler('pause', function () { if (audio) audio.pause(); });
    setActionHandler('stop', function () { if (audio) audio.pause(); });
    setActionHandler('previoustrack', function () { if (typeof opts.onPrev === 'function') opts.onPrev(); });
    setActionHandler('nexttrack', function () { if (typeof opts.onNext === 'function') opts.onNext(); });
    setActionHandler('seekto', function (details) {
      if (details && typeof details.seekTime === 'number') seek(details.seekTime * 1000);
    });
    setActionHandler('seekbackward', function () { seek(state.time - 10000); });
    setActionHandler('seekforward', function () { seek(state.time + 10000); });
  }

  setupMediaActions();

  /* ---------------- 播放 ---------------- */

  /** 单地址尝试：能出声（canplay/playing）算成功，报错或超时算失败 */
  function tryUrl(url) {
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () { finish(false); }, 12000);

      function cleanup() {
        clearTimeout(timer);
        audio.removeEventListener('error', onTryError);
        audio.removeEventListener('canplay', onTryOk);
        audio.removeEventListener('playing', onTryOk);
      }

      function finish(ok) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(ok);
      }

      function onTryError() { finish(false); }
      function onTryOk() { finish(true); }

      audio.addEventListener('error', onTryError);
      audio.addEventListener('canplay', onTryOk);
      audio.addEventListener('playing', onTryOk);

      lastSrc = url;
      audio.src = url;
      var playing = audio.play();
      if (playing && playing.catch) playing.catch(function () { /* 交给事件判断 */ });
    });
  }

  /**
   * @param {Object} track
   * @param {() => Promise<string>} nextUrl 候选地址生成器
   */
  async function load(track, nextUrl) {
    var token = ++attemptToken;
    state.track = track;
    state.status = 'loading';
    state.error = '';
    state.time = 0;
    state.duration = (track && track.duration) || 0;
    emit();
    updateMediaSession();

    if (typeof nextUrl !== 'function') return false;

    for (var i = 0; i < 6; i++) {
      var url = '';
      try {
        url = await nextUrl();
      } catch (err) {
        url = '';
      }
      if (token !== attemptToken) return false;
      if (!url) break;

      var ok = await tryUrl(url);
      if (token !== attemptToken) return false;
      if (ok) {
        state.status = 'playing';
        state.error = '';
        emit();
        return true;
      }
    }

    state.status = 'error';
    state.error = '所有音源都放不了这首';
    emit();
    return false;
  }

  /** 从暂停/中断里恢复：先直接 play，不行说明音频会话被抢了，重建 Audio 再放 */
  async function resume() {
    if (!state.track) return false;

    if (audio && audio.src) {
      try {
        await audio.play();
        return true;
      } catch (err) { /* 下面重建后再试 */ }
    }

    if (!lastSrc) return false;
    recreateAudio();
    audio.src = lastSrc;
    audio.currentTime = Math.max(0, (state.time || 0) / 1000);
    try {
      await audio.play();
      return true;
    } catch (err) {
      state.status = 'error';
      state.error = '被系统中断，点一下重新加载';
      emit();
      return false;
    }
  }

  /** @returns {Promise<boolean>} 失败时上层可以重新解析地址 */
  async function toggle() {
    if (!state.track) return false;
    if (audio && !audio.paused) {
      audio.pause();
      return true;
    }
    return resume();
  }

  function seek(ms) {
    var sec = Math.max(0, (Number(ms) || 0) / 1000);
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(sec, audio.duration || sec);
    state.time = audio.currentTime * 1000;
    emit();
  }

  function setVolume(v) {
    var vol = Math.min(1, Math.max(0, Number(v)));
    if (!Number.isFinite(vol)) return state.volume;
    state.volume = vol;
    if (audio) audio.volume = vol;
    emit();
    return vol;
  }

  function stop() {
    attemptToken += 1;
    try {
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
    } catch (err) { /* 忽略 */ }
    lastSrc = '';
    state.status = 'idle';
    state.track = null;
    state.time = 0;
    state.duration = 0;
    state.error = '';
    emit();
  }

  function dispose() {
    attemptToken += 1;
    try {
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
    } catch (err) { /* 忽略 */ }
    MEDIA_ACTIONS.forEach(function (action) { setActionHandler(action, null); });
    state.status = 'idle';
    state.track = null;
  }

  function setHandlers(handlers) {
    var h = handlers || {};
    opts.onChange = typeof h.onChange === 'function' ? h.onChange : null;
    opts.onEnded = typeof h.onEnded === 'function' ? h.onEnded : null;
    opts.onNext = typeof h.onNext === 'function' ? h.onNext : null;
    opts.onPrev = typeof h.onPrev === 'function' ? h.onPrev : null;
    setupMediaActions();
  }

  return {
    load: load,
    toggle: toggle,
    resume: resume,
    seek: seek,
    setVolume: setVolume,
    stop: stop,
    dispose: dispose,
    getState: getState,
    setHandlers: setHandlers,
    setMediaSessionEnabled: setMediaSessionEnabled,
    mediaSessionOn: function () { return mediaOn; },
    isPlaying: function () { return state.status === 'playing'; }
  };
}

/**
 * 插件内唯一的播放器实例：故意放在模块作用域，
 * 这样 App 被卸载/切到别的插件时，音乐还能继续播。
 */
var shared = null;

export function getPlayer(options) {
  if (!shared) {
    shared = createPlayer(options || {});
  } else if (options) {
    shared.setHandlers(options);
    if (typeof options.volume === 'number') shared.setVolume(options.volume);
    // 允许运行中开关系统媒体会话（引擎不重建，避免打断正在播的歌）
    if (options.mediaSession !== undefined) shared.setMediaSessionEnabled(options.mediaSession);
  }
  return shared;
}

export function hasPlayer() {
  return !!shared;
}
