/**
 * 假宿主：本地预览与端到端测试用。
 * 只模拟插件会用到的那部分能力和两个音乐接口，真机行为以宿主为准。
 */
(function () {
  var STORAGE_KEY = 'music-player:mock-storage';

  var settings = {
    mockAudio: true,
    failSearch: false,
    aiReply: ''
  };

  var memory = {};
  try {
    memory = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (err) {
    memory = {};
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    } catch (err) { /* 忽略 */ }
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  var toasts = [];
  function toast(message) {
    toasts.push(String(message));
    if (toasts.length > 20) toasts.shift();
    var el = document.getElementById('toast');
    if (el) {
      el.textContent = message;
      el.style.opacity = '1';
      clearTimeout(el.__timer);
      el.__timer = setTimeout(function () { el.style.opacity = '0'; }, 1600);
    }
  }

  var characters = [
    { id: 'c1', name: '沈砚', handle: '阿砚', avatar: '', bio: '夜班编辑', conversationId: 'conv-1' }
  ];

  window.RochePlugin = {
    register: function (plugin) {
      window.__registeredPlugin = plugin;
    }
  };

  window.__mockMessages = [];

  window.roche = {
    storage: {
      get: async function (key) {
        await delay(5);
        return key in memory ? memory[key] : undefined;
      },
      set: async function (key, value) {
        await delay(5);
        memory[key] = value;
        persist();
      },
      delete: async function (key) {
        await delay(5);
        delete memory[key];
        persist();
      }
    },
    // 假记忆：e2e 可以往里塞一条带标记的角色回复，验证标记通道
    memory: {
      getShortTerm: async function () {
        await delay(5);
        return window.__mockMessages || [];
      }
    },
    ui: {
      toast: toast,
      confirm: async function () { return true; },
      openApp: function () { toast('openApp'); },
      closeApp: function () { toast('closeApp'); },
      minimizeApp: function () { toast('minimizeApp'); },
      restoreApp: function () { toast('restoreApp'); }
    },
    chat: {
      createCard: async function (payload) {
        window.__mockCards = window.__mockCards || [];
        window.__mockCards.push(payload);
        return true;
      },
      updateCard: async function () { return true; },
      sendMessage: async function () { return true; },
      dispatchCardAction: async function (payload) {
        var plugin = window.__registeredPlugin;
        var types = (plugin && plugin.chat && plugin.chat.messageTypes) || [];
        for (var i = 0; i < types.length; i++) {
          if (types[i].id === payload.messageType || types[i].id === 'mp-listen') {
            if (types[i].onAction) await types[i].onAction({ id: payload.messageId, conversationId: payload.conversationId, cardData: {} }, payload.action, payload.payload, window.roche);
          }
        }
        return true;
      }
    },
    character: {
      list: async function () { return characters; },
      get: async function (id) { return characters.filter(function (c) { return c.id === id; })[0] || null; }
    }
  };

  /* ---------------- 假音频：headless 环境里避免真解码 ---------------- */

  function MockAudio() {
    var listeners = {};
    var self = this;
    this.volume = 1;
    this.currentTime = 0;
    this.duration = 0;
    this._src = '';
    this._timer = null;

    this.addEventListener = function (type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    };
    this.removeEventListener = function (type, fn) {
      listeners[type] = (listeners[type] || []).filter(function (f) { return f !== fn; });
    };
    this._emit = function (type) {
      (listeners[type] || []).forEach(function (fn) { fn({ type: type }); });
    };

    Object.defineProperty(this, 'src', {
      get: function () { return self._src; },
      set: function (value) {
        self._src = value;
        self.currentTime = 0;
        self.duration = 210;
        setTimeout(function () {
          self._emit('loadedmetadata');
          self._emit('canplay');
        }, 10);
      }
    });

    this.play = function () {
      if (!self._src) return Promise.reject(new Error('no src'));
      setTimeout(function () { self._emit('play'); }, 0);
      clearInterval(self._timer);
      self._timer = setInterval(function () {
        self.currentTime = Math.min(self.duration, self.currentTime + 0.5);
        self._emit('timeupdate');
        if (self.currentTime >= self.duration) {
          clearInterval(self._timer);
          self._emit('ended');
        }
      }, 300);
      return Promise.resolve();
    };

    this.pause = function () {
      clearInterval(self._timer);
      self._emit('pause');
    };

    this.removeAttribute = function () { self._src = ''; };
    this.load = function () {};
  }

  var RealAudio = window.Audio;
  window.Audio = function () {
    return settings.mockAudio ? new MockAudio() : new RealAudio();
  };

  /* ---------------- 假音乐接口 ---------------- */

  var realFetch = window.fetch ? window.fetch.bind(window) : null;

  function fakeResponse(data) {
    var text = JSON.stringify(data);
    return {
      ok: true,
      status: 200,
      text: async function () { return text; },
      json: async function () { return data; }
    };
  }

  function qqTracks() {
    return [
      { id: 97773, mid: '0039MnYb0qxYhV', song: '晴天', album: '叶惠美', singer: '周杰伦', pay: '付费', interval: '4分29秒', cover: '' },
      { id: 736305074, mid: '000BEsDj0UUhf8', song: '晴天 (交响改编版)', album: '改编', singer: '维也纳碎片', pay: '免费', interval: '3:58', cover: '' },
      { id: 548046023, mid: '0042rlGx2WHBrG', song: '晴天 (深情版)', album: '翻唱', singer: 'Lucky小爱', pay: '免费', interval: '04:12', cover: '' },
      { id: 102065756, mid: '003OUlho2HcRHC', song: '夜曲', album: '十一月的萧邦', singer: '周杰伦', pay: '付费', interval: '3分46秒', cover: '' }
    ];
  }

  window.fetch = async function (input, init) {
    var url = String(input && input.url ? input.url : input);

    if (settings.failSearch) {
      return fakeResponse({ code: 500, message: '模拟失败', data: [] });
    }

    if (url.indexOf('api.vkeys.cn') !== -1) {
      await delay(10);
      if (url.indexOf('/tencent?word=') !== -1) {
        return fakeResponse({ code: 200, message: '请求成功！', data: qqTracks() });
      }
      if (url.indexOf('/tencent?id=') !== -1) {
        return fakeResponse({
          code: 200,
          message: '请求成功！',
          data: { id: 97773, mid: '0039MnYb0qxYhV', url: 'http://mock.local/qq.mp3', size: 1000, kbps: 320 }
        });
      }
      if (url.indexOf('/tencent/lyric') !== -1) {
        return fakeResponse({
          code: 200,
          message: '请求成功！',
          data: {
            lrc: '[ti:晴天]\n[00:00.00]故事的小黄花\n[00:08.50]从出生那年就飘着\n[00:17.00]童年的荡秋千\n[00:25.50]随记忆一直晃到现在'
          }
        });
      }
      if (url.indexOf('/netease?word=') !== -1) {
        return fakeResponse({ code: 200, message: '请求成功！', data: [{ id: 2724692015, song: '晴天', singer: '周杰伦' }] });
      }
      return fakeResponse({ code: 404, message: '404 not found', data: [] });
    }

    if (url.indexOf('itunes.apple.com') !== -1) {
      await delay(10);
      return fakeResponse({
        resultCount: 1,
        results: [{
          trackId: 1001,
          trackName: '晴天 (试听)',
          artistName: '周杰伦',
          collectionName: '叶惠美',
          artworkUrl100: '',
          previewUrl: 'https://mock.local/preview.m4a',
          trackTimeMillis: 30000
        }]
      });
    }

    if (url.indexOf('api.audius.co') !== -1) {
      await delay(10);
      if (url.indexOf('/tracks/search') !== -1) {
        return fakeResponse({
          data: [{
            id: 'aud-1',
            title: 'Lofi Beat',
            user: { name: 'Audius Artist' },
            duration: 180,
            is_streamable: true,
            artwork: { '480x480': '' },
            access: { stream: true }
          }]
        });
      }
      return fakeResponse({ data: [] });
    }

    if (url.indexOf('music.163.com/song/media/outer/url') !== -1) {
      return fakeResponse({ url: 'https://mock.local/netease.mp3' });
    }

    if (realFetch) return realFetch(input, init);
    throw new Error('fetch unavailable');
  };

  /* ---------------- 假原生后台音频（Capacitor BackgroundAudio） ---------------- */

  function createFakeBackgroundAudio() {
    var st = { queue: [], index: -1, playing: false, time: 0, duration: 0, mode: 'loop' };
    var listeners = [];
    var timer = null;

    function status() {
      var t = st.queue[st.index];
      return {
        status: {
          available: true,
          initialized: st.queue.length > 0,
          isPlaying: st.playing,
          currentTrackIndex: st.index,
          currentTime: st.time,
          duration: st.duration,
          queueSize: st.queue.length,
          mode: st.mode,
          trackId: t ? t.id : '',
          albumId: t ? t.albumId : '',
          title: t ? t.title : '',
          artist: t ? t.artist : ''
        }
      };
    }

    function emit() {
      var payload = status();
      listeners.slice().forEach(function (fn) { fn(payload); });
    }

    function advance(delta) {
      if (!st.queue.length) return;
      var size = st.queue.length;
      st.index = ((st.index + delta) % size + size) % size;
      st.time = 0;
      st.duration = 210;
    }

    function tick() {
      if (!st.playing || !st.queue.length) return;
      st.time += 0.5;
      if (st.time >= st.duration) {
        if (st.mode === 'one') st.time = 0;
        else advance(1);
      }
      emit();
    }

    function ensureTimer() {
      if (timer) return;
      timer = setInterval(tick, 500);
    }

    return {
      replaceQueue: function (payload) {
        st.queue = (payload && payload.tracks) || [];
        st.index = (payload && payload.startIndex) || 0;
        st.mode = (payload && payload.mode) || 'loop';
        st.time = 0;
        st.duration = 210;
        st.playing = !(payload && payload.autoplay === false);
        ensureTimer();
        emit();
        return Promise.resolve(status());
      },
      play: function () { st.playing = true; ensureTimer(); emit(); return Promise.resolve(status()); },
      pause: function () { st.playing = false; emit(); return Promise.resolve(status()); },
      stop: function () {
        st.queue = [];
        st.index = -1;
        st.playing = false;
        st.time = 0;
        emit();
        return Promise.resolve(status());
      },
      next: function () { advance(1); emit(); return Promise.resolve(status()); },
      previous: function () { advance(-1); emit(); return Promise.resolve(status()); },
      seekTo: function (payload) {
        st.time = Math.max(0, Number(payload && payload.positionSeconds) || 0);
        emit();
        return Promise.resolve(status());
      },
      setPlaybackMode: function (payload) {
        st.mode = (payload && payload.mode) || 'loop';
        emit();
        return Promise.resolve(status());
      },
      getStatus: function () { return Promise.resolve(status()); },
      addListener: function (name, handler) {
        listeners.push(handler);
        return Promise.resolve({
          remove: function () {
            listeners = listeners.filter(function (f) { return f !== handler; });
          }
        });
      }
    };
  }

  window.Capacitor = {
    Plugins: {
      BackgroundAudio: createFakeBackgroundAudio()
    }
  };

  window.__mock = {
    settings: settings,
    toasts: toasts,
    storage: memory,
    characters: characters,
    cards: function () { return window.__mockCards || []; },
    clear: function () {
      memory = {};
      localStorage.removeItem(STORAGE_KEY);
      window.__mockCards = [];
    }
  };
})();
