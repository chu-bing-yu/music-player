/**
 * 宿主原生后台音频（Capacitor 插件 BackgroundAudio）。
 *
 * Roche 的 APK 里注册了这个插件，它用原生 MediaSessionCompat + 前台通知实现
 * 状态栏 / 锁屏 / 控制中心的播放控制。插件页面能直接拿到它：
 *   window.Capacitor.Plugins.BackgroundAudio
 *
 * 接口：replaceQueue / play / pause / stop / next / previous / seekTo /
 *       setPlaybackMode / getStatus，另有 statusChange 事件。
 * 队列项：{ id, albumId, title, artist, cover, url }
 * 模式：'loop' | 'one' | 'random'
 */

function getPlugin() {
  if (typeof window === 'undefined') return null;
  var cap = window.Capacitor;
  var plugin = cap && cap.Plugins ? cap.Plugins.BackgroundAudio : null;
  if (!plugin || typeof plugin.replaceQueue !== 'function') return null;
  return plugin;
}

export function nativeAvailable() {
  return !!getPlugin();
}

export function createNativeAudio() {
  function plugin() {
    return getPlugin();
  }

  function statusOf(res) {
    if (!res) return null;
    return res.status || res;
  }

  async function call(method, payload) {
    var p = plugin();
    if (!p || typeof p[method] !== 'function') return null;
    try {
      var res = await p[method](payload || {});
      return statusOf(res);
    } catch (err) {
      return null;
    }
  }

  return {
    available: function () { return !!plugin(); },
    replaceQueue: function (payload) { return call('replaceQueue', payload); },
    play: function () { return call('play'); },
    pause: function () { return call('pause'); },
    stop: function () { return call('stop'); },
    next: function () { return call('next'); },
    previous: function () { return call('previous'); },
    seekTo: function (positionSeconds) { return call('seekTo', { positionSeconds: positionSeconds }); },
    setPlaybackMode: function (mode) { return call('setPlaybackMode', { mode: mode }); },
    getStatus: function () { return call('getStatus'); },
    addStatusListener: function (handler) {
      var p = plugin();
      if (!p || typeof p.addListener !== 'function') return function () {};
      var handle = null;
      var removed = false;
      try {
        Promise.resolve(p.addListener('statusChange', function (event) {
          handler(statusOf(event));
        })).then(function (h) { handle = h; if (removed && h && h.remove) h.remove(); });
      } catch (err) { /* 忽略 */ }
      return function () {
        removed = true;
        if (handle && typeof handle.remove === 'function') {
          try { handle.remove(); } catch (err) { /* 忽略 */ }
        }
      };
    }
  };
}
