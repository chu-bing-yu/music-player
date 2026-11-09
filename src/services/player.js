/**
 * 播放器：整个插件只有一个 Audio 实例（模块级单例，切插件/重开 App 也不销毁）。
 *
 * 另外做两件容易被忽略的事：
 *  1. 音频会话被别的 App 抢走后，WebView 常见「点播放没反应」——重建 Audio 再放。
 *  2. 接 navigator.mediaSession，让系统状态栏/锁屏/控制中心能暂停、上一首、下一首。
 */

var MEDIA_ACTIONS = ['play', 'pause', 'previoustrack', 'nexttrack', 'stop', 'seekto', 'seekbackward', 'seekforward'];

/**
 * 地址归一：去空白、补协议；https 页面里的 http 直链会被浏览器当混合内容拦掉，先升级。
 * @param {string} url
 * @param {string} [proto] 页面协议，默认取 location.protocol
 */
export function normalizeAudioUrl(url, proto) {
  var s = String(url == null ? '' : url).trim();
  if (!s) return '';
  var page = proto || (typeof location !== 'undefined' ? location.protocol : '');
  if (s.indexOf('//') === 0) {
    s = (page || 'https:') + s;
    page = page || 'https:';
  }
  if (page === 'https:' && /^http:\/\//i.test(s)) {
    s = s.replace(/^http:\/\//i, 'https://');
  }
  return s;
}

/** 是不是「浏览器拦截自动播放」这类错误（不是地址坏） */
export function isAutoplayBlocked(err) {
  var name = String((err && err.name) || '');
  var msg = String((err && err.message) || '');
  if (name === 'NotAllowedError' || name === 'SecurityError') return true;
  return /gesture|autoplay|not allowed/i.test(msg);
}

/** MediaError.code → 人话 */
export var MEDIA_ERROR_TEXT = {
  1: '播放被中止',
  2: '网络中断',
  3: '解码失败（文件可能不完整）',
  4: '这个地址浏览器不支持'
};

export function mediaErrorText(code) {
  return MEDIA_ERROR_TEXT[Number(code)] || ('未知错误 ' + code);
}

/**
 * 是不是「没播完就结束」——直链只给了一小段就是这个特征。
 * @param {number} played 实际播到的秒数
 * @param {number} duration 元数据时长（0/NaN 表示未知）
 */
export function isTruncatedPlay(played, duration) {
  var p = Number(played) || 0;
  var d = Number(duration) || 0;
  if (p <= 0) return false;
  // 完整播完（短视频也包括在内）
  if (d > 0 && p >= d - 0.8) return false;
  var limit = d > 0 ? Math.min(10, d / 2) : 10;
  return p < limit;
}

/** 重试闸门：800ms 内不重复，最多 5 次 */
export function createRetryGate(intervalMs, maxTimes) {
  var gap = Number(intervalMs) || 800;
  var max = Number(maxTimes) || 5;
  var count = 0;
  var lastAt = 0;
  return {
    allow: function (now) {
      var t = Number(now) || Date.now();
      if (count >= max) return false;
      if (t - lastAt < gap) return false;
      count += 1;
      lastAt = t;
      return true;
    },
    reset: function () { count = 0; lastAt = 0; },
    count: function () { return count; },
    max: function () { return max; }
  };
}

/* ---------------- 页面音频抢占 ----------------
 * Roche 网页版内置「保活音频」（`new Audio(); loop = true`，一个静音、一个音乐保活），
 * 它们没有挂进 DOM，插件拿不到引用；但在手机上它们会占住音频会话，
 * 我们一播就被打断（表现就是点了停住 / 刚出声又没了）。
 *
 * 办法：给 HTMLMediaElement.play 打补丁 —— 插件正在放歌时，
 * 页面里其它 **loop=true** 的音频一律不让播（语音消息之类 loop 是 false，不受影响）。
 * 插件停了就放行，Roche 的保活可以在下一次用户操作时自己恢复。
 */
var activeAudio = null;
var guardInstalled = false;

export function installPageAudioGuard() {
  if (guardInstalled) return;
  if (typeof window === 'undefined' || typeof HTMLMediaElement === 'undefined') return;
  guardInstalled = true;

  var origPlay = HTMLMediaElement.prototype.play;
  if (typeof origPlay !== 'function') return;

  HTMLMediaElement.prototype.play = function () {
    try {
      if (this !== activeAudio && this.loop && activeAudio && !activeAudio.paused) {
        try { this.pause(); } catch (err) { /* 忽略 */ }
        // 假装播过了，免得宿主反复重试
        return Promise.resolve();
      }
    } catch (err) { /* 忽略 */ }
    return origPlay.apply(this, arguments);
  };
}

/** 把页面里正在循环播放的音频压下去（保活音频不一定在 DOM 里，尽力而为） */
export function silencePageLoops(except) {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
  try {
    var list = document.querySelectorAll('audio, video');
    Array.prototype.forEach.call(list, function (el) {
      if (!el || el === except || !el.loop) return;
      try { if (!el.paused) el.pause(); } catch (err) { /* 忽略 */ }
    });
  } catch (err) { /* 忽略 */ }
}

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
  // 被浏览器自动播放策略拦下的地址：留着给下一次点击直接用，不重新解析
  var pendingUrl = '';
  var pendingTrack = null;
  // 最近一次失败：{ host, reason: 'blocked' | 'bad' | 'interrupted' | 'stolen' | 'truncated', detail }
  var lastFailure = null;
  // 用户主动暂停（区别于被系统/其它音频打断）
  var userPaused = false;
  // 打断后自动续播的闸门：800ms 内不重复，最多 5 次
  var retryGate = createRetryGate(800, 5);
  // 事件探针：最近 20 条，设置页能直接看
  var probe = [];
  var sessionStart = Date.now();

  /** 记一条音频事件（timeupdate 不参与，避免刷屏） */
  function note(event) {
    try {
      if (!audio) return;
      var buffered = 0;
      try {
        if (audio.buffered && audio.buffered.length) {
          buffered = Number(audio.buffered.end(audio.buffered.length - 1).toFixed(2));
        }
      } catch (err) { /* 忽略 */ }
      probe.push({
        t: Math.round((Date.now() - sessionStart) / 100) / 10,
        event: event,
        time: Number((audio.currentTime || 0).toFixed(2)),
        duration: Number.isFinite(audio.duration) ? Number(audio.duration.toFixed(2)) : -1,
        readyState: audio.readyState,
        networkState: audio.networkState,
        paused: audio.paused,
        buffered: buffered,
        err: audio.error ? audio.error.code : 0
      });
      if (probe.length > 20) probe.shift();
    } catch (err) { /* 忽略 */ }
  }

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
    userPaused = false;
    retryGate.reset();
    note('playing');
    // 我们开始出声了：把页面里循环播放的保活音频压住，避免它们把会话抢回去
    silencePageLoops(audio);
    emit();
  }

  /**
   * 被打断后的自动续播。
   * 以前叫 nudged、只允许一次且只在 1 秒内触发，2 秒处被打断就再也不会救；
   * 现在只要有节流上限，任何位置被打断都尝试拉回来。
   */
  function maybeResumeAfterBreak() {
    if (userPaused) return;
    if (!audio || audio.ended) return;
    if (!retryGate.allow(Date.now())) {
      if (retryGate.count() >= retryGate.max()) {
        lastFailure = { host: hostOf(lastSrc), reason: 'stolen' };
        state.error = '反复被打断（Roche 的「音乐保活」占着音频）';
        emit();
      }
      return;
    }
    setTimeout(function () {
      if (!audio || !audio.paused || userPaused) return;
      silencePageLoops(audio);
      var p = audio.play();
      if (p && p.catch) p.catch(function () { /* 下一轮再试 */ });
    }, 260);
  }

  function onPause() {
    var wasPlaying = state.status === 'playing';
    note('pause');
    if (state.status !== 'error' && state.status !== 'loading') state.status = 'paused';

    if (!userPaused && !audio.ended && wasPlaying) {
      lastFailure = { host: hostOf(lastSrc), reason: 'stolen' };
      try {
        console.warn('[mp] audio interrupted (pause)', hostOf(lastSrc), recentEvents().slice(-5));
      } catch (err) { /* 忽略 */ }
    }
    emit();

    if (!userPaused && !audio.ended && wasPlaying) maybeResumeAfterBreak();
  }

  function onEnded() {
    note('ended');
    var played = Number(audio && audio.currentTime) || 0;
    var dur = audio && Number.isFinite(audio.duration) ? Number(audio.duration) : 0;

    // 直链只给了一小段：不能当成「正常播完」，否则会被自动切到下一首
    if (isTruncatedPlay(played, dur)) {
      lastFailure = { host: hostOf(lastSrc), reason: 'truncated' };
      state.status = 'error';
      state.error = '这个音源只给了几秒';
      try {
        console.warn('[mp] audio interrupted (truncated)', hostOf(lastSrc), played + '/' + dur, recentEvents().slice(-5));
      } catch (err) { /* 忽略 */ }
      emit();
      if (typeof opts.onTruncated === 'function') opts.onTruncated();
      return;
    }

    state.status = 'paused';
    state.time = state.duration;
    emit();
    if (typeof opts.onEnded === 'function') opts.onEnded();
  }

  function onError() {
    note('error');
    var code = audio && audio.error ? audio.error.code : 0;
    lastFailure = { host: hostOf(lastSrc), reason: 'bad', detail: mediaErrorText(code) };
    // 地址失效时交给 load() 的候选链处理；这里只标记
    if (state.status === 'loading') return;
    state.status = 'error';
    state.error = mediaErrorText(code);
    emit();
  }

  var probeFns = [];
  var PROBE_EVENTS = ['loadstart', 'canplay', 'waiting', 'stalled', 'abort', 'emptied'];

  function bindAudio(target) {
    target.addEventListener('timeupdate', onTimeUpdate);
    target.addEventListener('loadedmetadata', onLoadedMetadata);
    target.addEventListener('play', onPlay);
    target.addEventListener('pause', onPause);
    target.addEventListener('ended', onEnded);
    target.addEventListener('error', onError);

    probeFns = [];
    PROBE_EVENTS.forEach(function (name) {
      var fn = function () { note(name); };
      target.addEventListener(name, fn);
      probeFns.push([name, fn]);
    });
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
        probeFns.forEach(function (pair) { audio.removeEventListener(pair[0], pair[1]); });
        probeFns = [];
      } catch (err) { /* 忽略 */ }
    }
    audio = new Audio();
    audio.preload = 'auto';
    audio.volume = state.volume;
    // 让页面音频抢占守卫知道「这个才是插件自己的」
    activeAudio = audio;
    bindAudio(audio);
  }

  recreateAudio();
  // 打一次补丁：插件放歌时不让页面里的循环音频（Roche 的两个保活音频都是 loop）抢会话
  installPageAudioGuard();

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
    setActionHandler('pause', function () { userPaused = true; if (audio) audio.pause(); });
    setActionHandler('stop', function () { userPaused = true; if (audio) audio.pause(); });
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

  function hostOf(url) {
    try {
      return new URL(String(url || '')).host;
    } catch (err) {
      return '';
    }
  }

  function isBlockedError(err) {
    return isAutoplayBlocked(err);
  }

  /**
   * 单地址尝试。
   * @returns {Promise<'ok'|'blocked'|'bad'>}
   *  ok      真正出声（playing 事件 或 play() resolve）
   *  blocked 浏览器自动播放策略拦的，地址本身没问题
   *  bad     地址放不了
   */
  function tryUrl(url) {
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () { finish('bad'); }, 12000);

      function cleanup() {
        clearTimeout(timer);
        audio.removeEventListener('error', onTryError);
        audio.removeEventListener('playing', onTryPlaying);
      }

      function finish(result) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      }

      function onTryError() { finish('bad'); }
      function onTryPlaying() { finish('ok'); }

      audio.addEventListener('error', onTryError);
      audio.addEventListener('playing', onTryPlaying);

      lastSrc = url;
      audio.src = url;

      var playing = null;
      try {
        playing = audio.play();
      } catch (err) {
        finish(isBlockedError(err) ? 'blocked' : 'bad');
        return;
      }
      if (playing && typeof playing.then === 'function') {
        playing.then(function () { finish('ok'); }, function (err) {
          finish(isBlockedError(err) ? 'blocked' : 'bad');
        });
      }
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
    pendingUrl = '';
    pendingTrack = null;
    lastFailure = null;
    userPaused = false;
    retryGate.reset();
    probe = [];
    sessionStart = Date.now();
    note('session');
    emit();
    updateMediaSession();

    if (typeof nextUrl !== 'function') return false;

    for (var i = 0; i < 6; i++) {
      var raw = '';
      try {
        raw = await nextUrl();
      } catch (err) {
        raw = '';
      }
      if (token !== attemptToken) return false;
      if (!raw) break;

      var url = normalizeAudioUrl(raw);
      if (!url) continue;

      var result = await tryUrl(url);
      if (token !== attemptToken) return false;

      if (result === 'ok') {
        state.status = 'playing';
        state.error = '';
        emit();
        return true;
      }

      if (result === 'blocked') {
        // 自动播放被拦：地址是好的，别继续试别的候选（每个都要等 12 秒），
        // 也不要标成 error —— 用户再点一下播放就能接着放，地址直接用这份。
        pendingUrl = url;
        pendingTrack = track;
        lastFailure = { host: hostOf(url), reason: 'blocked' };
        state.status = 'paused';
        state.error = '浏览器拦了自动播放，点一下播放';
        emit();
        return false;
      }

      lastFailure = { host: hostOf(url), reason: 'bad' };
    }

    state.status = 'error';
    state.error = '所有音源都放不了这首';
    emit();
    return false;
  }

  /** 从暂停/中断里恢复：先直接 play（这次点击还在手势里），不行再重建 Audio */
  async function resume() {
    if (!state.track && !pendingUrl) return false;
    userPaused = false;
    retryGate.reset();

    // 上次被策略拦下的地址：这次点击直接起播，不要重新解析
    if (pendingUrl && (!audio || audio.src !== pendingUrl)) {
      if (!audio) recreateAudio();
      audio.src = pendingUrl;
      audio.currentTime = Math.max(0, (state.time || 0) / 1000);
    }

    if (audio && audio.src) {
      try {
        await audio.play();
        pendingUrl = '';
        pendingTrack = null;
        lastFailure = null;
        state.error = '';
        return true;
      } catch (err) {
        if (isBlockedError(err)) {
          // 别再重建 Audio：那会把已经拿到播放许可的实例丢掉
          state.status = 'paused';
          state.error = '浏览器拦了自动播放，点一下播放';
          lastFailure = { host: hostOf(lastSrc), reason: 'blocked' };
          emit();
          return false;
        }
      }
    }

    if (!lastSrc) return false;
    recreateAudio();
    audio.src = lastSrc;
    audio.currentTime = Math.max(0, (state.time || 0) / 1000);
    try {
      await audio.play();
      return true;
    } catch (err) {
      if (isBlockedError(err)) {
        state.status = 'paused';
        state.error = '浏览器拦了自动播放，点一下播放';
        lastFailure = { host: hostOf(lastSrc), reason: 'blocked' };
        emit();
        return false;
      }
      state.status = 'error';
      state.error = '被系统中断，点一下重新加载';
      lastFailure = { host: hostOf(lastSrc), reason: 'interrupted' };
      emit();
      return false;
    }
  }

  /**
   * 首次用户手势时给 audio 解个锁（Safari / 严格策略下有用）。
   * 没有 src 时不去空放，避免把第一次点击白白消耗掉。
   */
  function armUnlock() {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    var events = ['pointerdown', 'keydown', 'touchend'];

    function handler() {
      if (!audio || !audio.src) return;
      events.forEach(function (name) { document.removeEventListener(name, handler, true); });
      try {
        var muted = audio.muted;
        audio.muted = true;
        var p = audio.play();
        if (p && typeof p.then === 'function') {
          p.then(function () {
            try { audio.pause(); } catch (err) { /* 忽略 */ }
            audio.muted = muted;
          }, function () { audio.muted = muted; });
        } else {
          audio.pause();
          audio.muted = muted;
        }
      } catch (err) { /* 忽略 */ }
    }

    events.forEach(function (name) { document.addEventListener(name, handler, true); });
  }

  armUnlock();

  function lastFail() {
    return lastFailure;
  }

  /** 最近 20 条音频事件（设置页「最近播放事件」用） */
  function recentEvents() {
    return probe.slice();
  }

  /** @returns {Promise<boolean>} 失败时上层可以重新解析地址 */
  async function toggle() {
    if (!state.track) return false;
    if (audio && !audio.paused) {
      userPaused = true; // 用户主动暂停：不要自动续播
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
    userPaused = true;
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
    lastFail: lastFail,
    recentEvents: recentEvents,
    hasPending: function () { return !!pendingUrl; },
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
