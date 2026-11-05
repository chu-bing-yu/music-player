/* music-player v0.38.0 | built 2026-11-05T11:33:22.272Z */
(() => {
  // src/services/host.js
  function isFn(obj, name) {
    return !!(obj && typeof obj[name] === "function");
  }
  function warn(label, err) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[music-player] " + label, err);
    }
  }
  function createHost(roche) {
    var raw = roche || {};
    var memory = /* @__PURE__ */ Object.create(null);
    var caps = {
      storage: isFn(raw.storage, "get") && isFn(raw.storage, "set"),
      storageDelete: isFn(raw.storage, "delete"),
      uiToast: isFn(raw.ui, "toast"),
      uiConfirm: isFn(raw.ui, "confirm"),
      uiCloseApp: isFn(raw.ui, "closeApp"),
      openApp: isFn(raw.ui, "openApp"),
      minimizeApp: isFn(raw.ui, "minimizeApp"),
      restoreApp: isFn(raw.ui, "restoreApp"),
      createCard: isFn(raw.chat, "createCard"),
      updateCard: isFn(raw.chat, "updateCard"),
      sendMessage: isFn(raw.chat, "sendMessage"),
      dispatchCardAction: isFn(raw.chat, "dispatchCardAction")
    };
    function mirrorGet(key) {
      try {
        if (typeof localStorage === "undefined") return null;
        var text = localStorage.getItem("mp:mirror:" + key);
        if (!text) return null;
        return JSON.parse(text);
      } catch (err) {
        return null;
      }
    }
    function mirrorSet(key, value) {
      try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem("mp:mirror:" + key, JSON.stringify(value));
      } catch (err) {
      }
    }
    var storage = {
      async get(key, fallback) {
        try {
          if (caps.storage) {
            var value = await raw.storage.get(key);
            if (value !== void 0 && value !== null) {
              memory[key] = value;
              mirrorSet(key, value);
              return value;
            }
          }
        } catch (err) {
          warn("storage.get " + key, err);
        }
        if (key in memory) return memory[key];
        var mirrored = mirrorGet(key);
        if (mirrored !== null) {
          memory[key] = mirrored;
          return mirrored;
        }
        return fallback;
      },
      async set(key, value) {
        memory[key] = value;
        mirrorSet(key, value);
        try {
          if (caps.storage) await raw.storage.set(key, value);
          return true;
        } catch (err) {
          warn("storage.set " + key, err);
          return false;
        }
      },
      async delete(key) {
        delete memory[key];
        try {
          if (caps.storageDelete) await raw.storage.delete(key);
          return true;
        } catch (err) {
          warn("storage.delete " + key, err);
          return false;
        }
      }
    };
    var ui = {
      toast(message) {
        if (caps.uiToast) {
          try {
            raw.ui.toast(String(message));
          } catch (err) {
            warn("ui.toast", err);
          }
        }
      },
      async confirm(options) {
        if (!caps.uiConfirm) return true;
        try {
          return !!await raw.ui.confirm(options || {});
        } catch (err) {
          warn("ui.confirm", err);
          return false;
        }
      },
      openApp(appId) {
        if (caps.openApp) {
          try {
            raw.ui.openApp(appId);
          } catch (err) {
            warn("ui.openApp", err);
          }
        }
      },
      closeApp() {
        if (caps.uiCloseApp) {
          try {
            raw.ui.closeApp();
          } catch (err) {
            warn("ui.closeApp", err);
          }
        }
      },
      minimizeApp() {
        if (caps.minimizeApp) {
          try {
            raw.ui.minimizeApp();
          } catch (err) {
            warn("ui.minimizeApp", err);
          }
        }
      },
      restoreApp() {
        if (caps.restoreApp) {
          try {
            raw.ui.restoreApp();
          } catch (err) {
            warn("ui.restoreApp", err);
          }
        }
      }
    };
    var chat = {
      async createCard(payload) {
        if (!caps.createCard) return { ok: false, reason: "no_api" };
        try {
          await raw.chat.createCard(payload);
          return { ok: true };
        } catch (err) {
          warn("chat.createCard", err);
          return { ok: false, reason: "error", error: err };
        }
      },
      async updateCard(payload) {
        if (!caps.updateCard) return { ok: false, reason: "no_api" };
        try {
          await raw.chat.updateCard(payload);
          return { ok: true };
        } catch (err) {
          warn("chat.updateCard", err);
          return { ok: false, reason: "error", error: err };
        }
      },
      async sendMessage(payload) {
        if (!caps.sendMessage) return { ok: false, reason: "no_api" };
        try {
          await raw.chat.sendMessage(payload);
          return { ok: true };
        } catch (err) {
          warn("chat.sendMessage", err);
          return { ok: false, reason: "error", error: err };
        }
      },
      async dispatchCardAction(payload) {
        if (!caps.dispatchCardAction) return { ok: false, reason: "no_api" };
        try {
          await raw.chat.dispatchCardAction(payload);
          return { ok: true };
        } catch (err) {
          warn("chat.dispatchCardAction", err);
          return { ok: false, reason: "error", error: err };
        }
      }
    };
    return { caps, raw, storage, ui, chat };
  }

  // src/core/track.js
  function trackKey(track) {
    if (!track || track.id == null || String(track.id) === "") return "";
    return [track.source || "", track.platform || "", track.id].join(":");
  }
  function joinArtists(raw) {
    if (Array.isArray(raw)) {
      return raw.map(function(a) {
        return typeof a === "string" ? a : a && (a.name || a.artist) || "";
      }).filter(Boolean).join(" / ");
    }
    return String(raw || "");
  }
  function normalizeTrack(raw, fallbackSource) {
    if (!raw) return null;
    var source = String(raw.source || fallbackSource || "local");
    var platform = String(raw.platform || raw.srcSource || "");
    var id = raw.id != null ? raw.id : raw.songmid != null ? raw.songmid : raw.trackId;
    if (id == null || String(id) === "") return null;
    var artist = joinArtists(raw.artist || raw.artists || raw.artistName) || "未知歌手";
    var name = String(raw.name || raw.trackName || raw.title || "未知歌曲");
    var duration = Number(raw.duration || raw.trackTimeMillis || raw.interval || 0);
    return {
      source,
      platform,
      id: String(id),
      name,
      artist,
      album: String(raw.album || raw.collectionName || ""),
      cover: String(raw.cover || raw.artwork || ""),
      duration: Number.isFinite(duration) ? duration : 0,
      url: String(raw.url || raw.previewUrl || ""),
      picId: String(raw.picId || raw.pic_id || ""),
      lyricId: String(raw.lyricId || raw.lyric_id || "")
    };
  }
  function dedupeTracks(list) {
    var seen = /* @__PURE__ */ Object.create(null);
    var out = [];
    (list || []).forEach(function(t) {
      var key = trackKey(t);
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(t);
    });
    return out;
  }

  // src/core/queue.js
  var REPEAT = { OFF: "off", ALL: "all", ONE: "one" };
  var REPEAT_ORDER = [REPEAT.OFF, REPEAT.ALL, REPEAT.ONE];
  function range(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(i);
    return out;
  }
  function shuffledOrder(n, rng, fixedFirst) {
    var random = typeof rng === "function" ? rng : Math.random;
    var arr = range(n);
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    if (fixedFirst >= 0 && fixedFirst < n) {
      var at = arr.indexOf(fixedFirst);
      if (at > 0) {
        arr.splice(at, 1);
        arr.unshift(fixedFirst);
      }
    }
    return arr;
  }
  function clamp(n, min, max) {
    if (max < min) return min;
    return Math.min(max, Math.max(min, n));
  }
  function createQueue(tracks, opts) {
    var o = opts || {};
    var list = (tracks || []).filter(Boolean).slice();
    var repeat = REPEAT_ORDER.indexOf(o.repeat) === -1 ? REPEAT.OFF : o.repeat;
    var shuffle = !!o.shuffle;
    var start = clamp(Number(o.startIndex) || 0, 0, Math.max(list.length - 1, 0));
    var order = shuffle ? shuffledOrder(list.length, o.rng, start) : range(list.length);
    var pos = shuffle ? 0 : start;
    return {
      tracks: list,
      order,
      pos: list.length ? pos : -1,
      shuffle,
      repeat
    };
  }
  function appendTracks(queue, tracks) {
    var list = (tracks || []).filter(Boolean);
    if (!list.length) return queue;
    if (!queue || !queue.tracks.length) return createQueue(list, { repeat: queue ? queue.repeat : REPEAT.OFF });
    var merged = queue.tracks.concat(list);
    var order = queue.order.slice();
    for (var i = queue.tracks.length; i < merged.length; i++) order.push(i);
    return Object.assign({}, queue, { tracks: merged, order });
  }
  function removeAt(queue, index) {
    if (!queue || index < 0 || index >= queue.tracks.length) return queue;
    var tracks = queue.tracks.slice();
    tracks.splice(index, 1);
    if (!tracks.length) return createQueue([], { repeat: queue.repeat });
    var playing = current(queue);
    var playingKey = playing ? trackKey(playing) : "";
    var order = queue.order.filter(function(n) {
      return n !== index;
    }).map(function(n) {
      return n > index ? n - 1 : n;
    });
    var pos = 0;
    if (playingKey) {
      var at = -1;
      for (var i = 0; i < tracks.length; i++) {
        if (trackKey(tracks[i]) === playingKey) {
          at = i;
          break;
        }
      }
      if (at >= 0) pos = order.indexOf(at);
    }
    if (pos < 0) pos = 0;
    return Object.assign({}, queue, { tracks, order, pos });
  }
  function current(queue) {
    if (!queue || !queue.tracks.length || queue.pos < 0) return null;
    var idx = queue.order[queue.pos];
    return queue.tracks[idx] || null;
  }
  function currentIndex(queue) {
    if (!queue || !queue.tracks.length || queue.pos < 0) return -1;
    return queue.order[queue.pos];
  }
  function advance(queue, opts) {
    var o = opts || {};
    if (!queue || !queue.tracks.length) return { queue, track: null, ended: true };
    if (o.auto && queue.repeat === REPEAT.ONE) {
      return { queue, track: current(queue), ended: false };
    }
    var pos = queue.pos + 1;
    if (pos < queue.order.length) {
      var moved = Object.assign({}, queue, { pos });
      return { queue: moved, track: current(moved), ended: false };
    }
    if (queue.repeat === REPEAT.ALL) {
      var order = queue.shuffle ? shuffledOrder(queue.tracks.length, o.rng, -1) : range(queue.tracks.length);
      var looped = Object.assign({}, queue, { order, pos: 0 });
      return { queue: looped, track: current(looped), ended: false };
    }
    return { queue, track: null, ended: true };
  }
  function back(queue) {
    if (!queue || !queue.tracks.length) return { queue, track: null, restart: false };
    var pos = queue.pos - 1;
    if (pos < 0) {
      if (queue.repeat === REPEAT.ALL) {
        var tail = Object.assign({}, queue, { pos: queue.order.length - 1 });
        return { queue: tail, track: current(tail), restart: false };
      }
      return { queue: Object.assign({}, queue, { pos: 0 }), track: current(queue), restart: true };
    }
    var moved = Object.assign({}, queue, { pos });
    return { queue: moved, track: current(moved), restart: false };
  }
  function jumpTo(queue, key) {
    if (!queue || !queue.tracks.length) return queue;
    var trackIdx = -1;
    for (var i = 0; i < queue.tracks.length; i++) {
      if (trackKey(queue.tracks[i]) === key) {
        trackIdx = i;
        break;
      }
    }
    if (trackIdx === -1) return queue;
    var at = queue.order.indexOf(trackIdx);
    if (at === -1) return queue;
    return Object.assign({}, queue, { pos: at });
  }
  function setShuffle(queue, shuffle, rng) {
    if (!queue) return queue;
    if (!!shuffle === !!queue.shuffle) return queue;
    var playingIdx = currentIndex(queue);
    if (shuffle) {
      var shuffled = shuffledOrder(queue.tracks.length, rng, playingIdx);
      return Object.assign({}, queue, { shuffle: true, order: shuffled, pos: 0 });
    }
    var pos = playingIdx >= 0 ? playingIdx : 0;
    return Object.assign({}, queue, { shuffle: false, order: range(queue.tracks.length), pos });
  }
  function setRepeat(queue, mode) {
    if (!queue) return queue;
    return Object.assign({}, queue, { repeat: REPEAT_ORDER.indexOf(mode) === -1 ? REPEAT.OFF : mode });
  }

  // src/core/settings.js
  var SCHEMA_VERSION = 4;
  var DEFAULT_CHAT_PROMPT = [
    "【音乐插件】当前正在播放《{{title}}》（{{artist}}）{{state}}，队列 {{queue}} 首。",
    "",
    "你能操作音乐。需要操作时，在回复最后单独一行写一条 HTML 注释指令（聊天里不会显示）：",
    "点歌 / 加歌：<!-- mp:play:歌名 -->",
    "上一首：<!-- mp:prev -->　下一首：<!-- mp:next -->",
    "暂停：<!-- mp:pause -->　继续：<!-- mp:resume -->",
    "把当前这首收进你的歌单：<!-- mp:add -->",
    "给当前这首写一句评价：<!-- mp:comment:一句话评价 -->",
    "新建歌单：<!-- mp:new:歌单名 -->　给我挑几首：<!-- mp:recommend:关键词 -->",
    "",
    "规则：",
    "1. 【重要】不要调用任何工具（music_play / music_next 等），只写上面这种注释指令；",
    "2. 指令必须单独占一行，且必须是 <!-- ... --> 这种注释形式，不要用方括号；",
    "3. 没有写指令就等于没有操作，不要只说「已经加好了」「已经在播了」；",
    "4. 用户让你放歌时必须写 <!-- mp:play:歌名 -->；",
    "5. 切歌或换歌时，可以顺带自然地说一句你对这首歌的感受。"
  ].join("\n");
  var HYBRID_CHAT_PROMPT = [
    "【音乐插件】当前正在播放《{{title}}》（{{artist}}）{{state}}，队列 {{queue}} 首。",
    "",
    "操作规则：",
    "1. 用户想听歌 / 换歌 → 必须调用工具 music_play（这样才会发「一起听」卡片）；",
    "2. 其他操作 → 在回复最后单独一行写 HTML 注释指令（聊天里不会显示）：",
    "   下一首 <!-- mp:next -->　上一首 <!-- mp:prev -->",
    "   暂停 <!-- mp:pause -->　继续 <!-- mp:resume -->",
    "   把当前这首收进你的歌单 <!-- mp:add -->",
    "   给当前这首写评价 <!-- mp:comment:一句话评价 -->",
    "   新建歌单 <!-- mp:new:歌单名 -->　给用户挑几首 <!-- mp:recommend:关键词 -->",
    "3. 指令必须单独占一行，且必须是 <!-- ... --> 形式；",
    "4. 没有写指令就等于没有操作，不要只说「已经加好了」；",
    "5. 切歌时顺带自然地说一句你对这首歌的感受。"
  ].join("\n");
  var TOOL_CHAT_PROMPT = [
    "【音乐插件】当前正在播放《{{title}}》（{{artist}}）{{state}}，队列 {{queue}} 首。",
    "可用工具：music_play（点歌）、music_next、music_previous、music_pause、music_resume、",
    "music_add_to_playlist（把当前歌收进你的歌单）、music_comment（给当前歌写评价）、",
    "music_recommend（给别人挑歌）、music_status、music_favorite。",
    "规则：用户让你放歌时必须真的调用工具，不能只在文字里说「加好了」；工具返回失败就照实说。"
  ].join("\n");
  var THEMES = [
    { id: "auto", name: "跟随系统" },
    { id: "light", name: "白天" },
    { id: "dark", name: "夜间" }
  ];
  var PLAY_MODE_ORDER = ["sequence", "loop", "one", "shuffle"];
  function nextPlayMode(mode) {
    var i = PLAY_MODE_ORDER.indexOf(mode);
    return PLAY_MODE_ORDER[(i + 1) % PLAY_MODE_ORDER.length];
  }
  function modeToQueueFlags(mode) {
    if (mode === "shuffle") return { repeat: REPEAT.OFF, shuffle: true };
    if (mode === "one") return { repeat: REPEAT.ONE, shuffle: false };
    if (mode === "loop") return { repeat: REPEAT.ALL, shuffle: false };
    return { repeat: REPEAT.OFF, shuffle: false };
  }
  var ACCENTS = [
    { id: "red", name: "赤红", color: "#e14b4b" },
    { id: "blue", name: "雾蓝", color: "#3b82f6" },
    { id: "green", name: "松绿", color: "#2f9e44" },
    { id: "purple", name: "藕紫", color: "#8b5cf6" },
    { id: "amber", name: "暖橙", color: "#e8850c" }
  ];
  function defaultSettings() {
    return {
      schemaVersion: SCHEMA_VERSION,
      sources: { tencent: true, itunes: true, audius: true, netease: true },
      prefix: "",
      volume: 0.8,
      playMode: "sequence",
      // repeat / shuffle 是由 playMode 派生的，只为兼容旧代码
      repeat: REPEAT.OFF,
      shuffle: false,
      theme: "auto",
      accent: "red",
      // 空 = 用预设色块；有值 = 用户自选色（优先级更高）
      accentColor: "",
      floating: true,
      floatLyric: true,
      // 网易云：自己部署的 NeteaseCloudMusicApi 地址 + 扫码登录后的 cookie
      neteaseApi: "",
      neteaseCookie: "",
      neteaseProfile: "",
      chatListen: true,
      // 角色点歌时：true = 只把第一首加进队列；false = 直接替换成这首
      chatAddToQueue: true,
      // 工具通道 / 混合通道的提示词（和标记通道分开存，设置页按当前模式显示对应那份）
      chatPromptTool: TOOL_CHAT_PROMPT,
      chatPromptHybrid: HYBRID_CHAT_PROMPT,
      /** 点聊天卡片时要不要重新播放这首；默认只显示当前状态 */
      cardTapPlay: false,
      /** 推荐页刷新策略：manual = 点「换一批」才调模型（默认）；auto = 每次进入都调；local = 不调模型 */
      recMode: "manual",
      // 指令通道：hybrid = 点歌用工具、其余用注释（默认）；
      // tool = 全走工具（多一次调用但最稳）；mark = 全走注释（最省调用）
      chatCommandMode: "hybrid",
      // 推荐歌单的搜索词由角色自己决定（指令里带参数），这里不再保存固定词
      chatPrompt: DEFAULT_CHAT_PROMPT,
      /**
       * 极简模式：插件不再轮询、不重建、不自动暂停，只把队列交给原生播放器。
       * v0.5.0 能让状态栏按钮生效的正是这条路径，所以默认开着。
       */
      nativeMinimal: true
    };
  }
  function bool(v, fallback) {
    return typeof v === "boolean" ? v : fallback;
  }
  function clampNum(v, min, max, fallback) {
    var n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }
  function pickId(list, value, fallback) {
    var hit = list.filter(function(item) {
      return item.id === value;
    })[0];
    return hit ? hit.id : fallback;
  }
  function resolvePlayMode(s) {
    if (PLAY_MODE_ORDER.indexOf(s.playMode) !== -1) return s.playMode;
    if (s.shuffle) return "shuffle";
    if (s.repeat === REPEAT.ONE) return "one";
    if (s.repeat === REPEAT.ALL) return "loop";
    return "sequence";
  }
  function normalizeSettings(raw) {
    var def = defaultSettings();
    var s = raw && typeof raw === "object" ? raw : {};
    var sources = s.sources && typeof s.sources === "object" ? s.sources : {};
    var tencent = bool(sources.tencent, sources.gd === false ? false : def.sources.tencent);
    return {
      schemaVersion: SCHEMA_VERSION,
      sources: {
        tencent,
        itunes: bool(sources.itunes, def.sources.itunes),
        audius: bool(sources.audius, def.sources.audius),
        netease: bool(sources.netease, def.sources.netease)
      },
      prefix: String(s.prefix || s.proxy || "").trim(),
      volume: clampNum(s.volume, 0, 1, def.volume),
      playMode: resolvePlayMode(s),
      repeat: modeToQueueFlags(resolvePlayMode(s)).repeat,
      shuffle: modeToQueueFlags(resolvePlayMode(s)).shuffle,
      theme: pickId(THEMES, s.theme, def.theme),
      // custom = 用户自选颜色
      accent: s.accent === "custom" ? "custom" : pickId(ACCENTS, s.accent, def.accent),
      accentColor: /^#[0-9a-fA-F]{6}$/.test(String(s.accentColor || "")) ? String(s.accentColor) : "",
      floating: bool(s.floating, def.floating),
      floatLyric: bool(s.floatLyric, def.floatLyric),
      neteaseApi: String(s.neteaseApi || "").trim().replace(/\/+$/, ""),
      neteaseCookie: String(s.neteaseCookie || "").trim(),
      neteaseProfile: String(s.neteaseProfile || "").trim(),
      chatListen: bool(s.chatListen, def.chatListen),
      chatAddToQueue: bool(s.chatAddToQueue, def.chatAddToQueue),
      chatCommandMode: (function() {
        var mode = String(s.chatCommandMode || "");
        if (mode === "mark" || mode === "tool" || mode === "hybrid") return mode;
        return def.chatCommandMode;
      })(),
      chatPromptHybrid: (function() {
        var text = String(s.chatPromptHybrid == null ? "" : s.chatPromptHybrid).trim();
        return text ? text.slice(0, 2e3) : def.chatPromptHybrid;
      })(),
      cardTapPlay: bool(s.cardTapPlay, def.cardTapPlay),
      recMode: (function() {
        var mode = String(s.recMode || "");
        if (mode === "auto" || mode === "local" || mode === "manual") return mode;
        return def.recMode;
      })(),
      chatPromptTool: (function() {
        var text = String(s.chatPromptTool == null ? "" : s.chatPromptTool).trim();
        if (!text) return def.chatPromptTool;
        if (text.indexOf("mp:play") !== -1 || text.indexOf("[[mp:") !== -1) return def.chatPromptTool;
        return text.slice(0, 2e3);
      })(),
      chatPrompt: (function() {
        var text = String(s.chatPrompt == null ? "" : s.chatPrompt).trim();
        if (!text) return def.chatPrompt;
        if (text.indexOf("mp:play") === -1 && text.indexOf("[[mp:") === -1 && text.indexOf("music_play") !== -1) return def.chatPrompt;
        return text.slice(0, 2e3);
      })(),
      nativeMinimal: bool(s.nativeMinimal, def.nativeMinimal)
    };
  }

  // src/core/playlist.js
  var MAX_PLAYLISTS = 50;
  var MAX_TRACKS_PER_PLAYLIST = 500;
  function cleanName(name, fallback) {
    var s = String(name == null ? "" : name).trim();
    if (!s) s = fallback;
    return s.slice(0, 40);
  }
  function stamp(playlist, now) {
    return Object.assign({}, playlist, { updatedAt: Number(now) || 0 });
  }
  function findPlaylist(list, id) {
    var arr = list || [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].id === id) return arr[i];
    }
    return null;
  }
  function normalizePlaylists(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    raw.slice(0, MAX_PLAYLISTS).forEach(function(p) {
      if (!p || !p.id) return;
      var item = {
        id: String(p.id),
        name: cleanName(p.name, "未命名歌单"),
        tracks: dedupeTracks(Array.isArray(p.tracks) ? p.tracks : []).slice(0, MAX_TRACKS_PER_PLAYLIST),
        createdAt: Number(p.createdAt) || 0,
        updatedAt: Number(p.updatedAt) || Number(p.createdAt) || 0
      };
      if (p.owner === "char") {
        item.owner = "char";
        item.ownerId = String(p.ownerId || "");
      }
      out.push(item);
    });
    return out;
  }
  function createPlaylist(list, name, id, now, options) {
    var o = options || {};
    var arr = (list || []).slice();
    if (arr.length >= MAX_PLAYLISTS) return { list: arr, playlist: null, reason: "limit" };
    var playlist = {
      id: String(id),
      name: cleanName(name, o.owner === "char" ? "TA 的歌" : "未命名歌单"),
      tracks: [],
      createdAt: Number(now) || 0,
      updatedAt: Number(now) || 0
    };
    if (o.owner === "char") {
      playlist.owner = "char";
      playlist.ownerId = String(o.ownerId || "");
    }
    arr.unshift(playlist);
    return { list: arr, playlist };
  }
  function renamePlaylist(list, id, name, now) {
    return (list || []).map(function(p) {
      if (p.id !== id) return p;
      return stamp(Object.assign({}, p, { name: cleanName(name, p.name) }), now);
    });
  }
  function deletePlaylist(list, id) {
    return (list || []).filter(function(p) {
      return p.id !== id;
    });
  }
  function addTracksToPlaylist(list, id, tracks, now) {
    var added = 0;
    var duplicate = 0;
    var full = false;
    var incoming = (tracks || []).filter(Boolean);
    var next = (list || []).map(function(p) {
      if (p.id !== id) return p;
      var exist = /* @__PURE__ */ Object.create(null);
      p.tracks.forEach(function(t) {
        exist[trackKey(t)] = true;
      });
      var merged = p.tracks.slice();
      incoming.forEach(function(t) {
        var key = trackKey(t);
        if (!key) return;
        if (exist[key]) {
          duplicate += 1;
          return;
        }
        if (merged.length >= MAX_TRACKS_PER_PLAYLIST) {
          full = true;
          return;
        }
        exist[key] = true;
        merged.push(t);
        added += 1;
      });
      return stamp(Object.assign({}, p, { tracks: merged }), now);
    });
    return { list: next, added, duplicate, full };
  }
  function removeTrackFromPlaylist(list, id, key, now) {
    return (list || []).map(function(p) {
      if (p.id !== id) return p;
      return stamp(Object.assign({}, p, {
        tracks: p.tracks.filter(function(t) {
          return trackKey(t) !== key;
        })
      }), now);
    });
  }
  function moveTrackInPlaylist(list, id, from, to, now) {
    return (list || []).map(function(p) {
      if (p.id !== id) return p;
      var tracks = p.tracks.slice();
      if (from < 0 || from >= tracks.length) return p;
      var target = Math.min(Math.max(to, 0), tracks.length - 1);
      if (target === from) return p;
      var moved = tracks.splice(from, 1)[0];
      tracks.splice(target, 0, moved);
      return stamp(Object.assign({}, p, { tracks }), now);
    });
  }
  function playlistDuration(playlist) {
    var tracks = playlist && playlist.tracks || [];
    return tracks.reduce(function(sum, t) {
      return sum + (Number(t.duration) || 0);
    }, 0);
  }

  // src/core/favorites.js
  var MAX_FAVORITES = 500;
  var MAX_RECENT = 60;
  function toggleFavorite(favorites, track) {
    var arr = (favorites || []).slice();
    var key = trackKey(track);
    if (!key) return { favorites: arr, added: false, removed: false };
    for (var i = 0; i < arr.length; i++) {
      if (trackKey(arr[i]) === key) {
        arr.splice(i, 1);
        return { favorites: arr, added: false, removed: true };
      }
    }
    if (arr.length >= MAX_FAVORITES) return { favorites: arr, added: false, removed: false, full: true };
    arr.unshift(track);
    return { favorites: arr, added: true, removed: false };
  }
  function normalizeFavorites(raw) {
    if (!Array.isArray(raw)) return [];
    return dedupeTracks(raw).slice(0, MAX_FAVORITES);
  }
  function pushRecent(recent, track, cap) {
    var limit = Number(cap) || MAX_RECENT;
    var key = trackKey(track);
    if (!key) return (recent || []).slice();
    var arr = (recent || []).filter(function(t) {
      return trackKey(t) !== key;
    });
    arr.unshift(track);
    return arr.slice(0, limit);
  }
  function normalizeRecent(raw) {
    if (!Array.isArray(raw)) return [];
    return dedupeTracks(raw).slice(0, MAX_RECENT);
  }

  // src/services/store.js
  var KEYS = {
    settings: "mp:settings",
    playlists: "mp:playlists",
    favorites: "mp:favorites",
    recent: "mp:recent",
    searches: "mp:searches",
    comments: "mp:comments",
    cmd: "mp:cmd",
    queue: "mp:queue"
  };
  var MAX_SEARCHES = 12;
  function createStore(host) {
    async function loadSettings() {
      var raw = await host.storage.get(KEYS.settings, null);
      return raw ? normalizeSettings(raw) : defaultSettings();
    }
    async function saveSettings(settings) {
      var clean = normalizeSettings(settings);
      await host.storage.set(KEYS.settings, clean);
      return clean;
    }
    async function loadPlaylists2() {
      return normalizePlaylists(await host.storage.get(KEYS.playlists, []));
    }
    async function savePlaylists(list) {
      var clean = normalizePlaylists(list);
      await host.storage.set(KEYS.playlists, clean);
      return clean;
    }
    async function loadFavorites() {
      return normalizeFavorites(await host.storage.get(KEYS.favorites, []));
    }
    async function saveFavorites(list) {
      var clean = normalizeFavorites(list);
      await host.storage.set(KEYS.favorites, clean);
      return clean;
    }
    async function loadRecent() {
      return normalizeRecent(await host.storage.get(KEYS.recent, []));
    }
    async function saveRecent(list) {
      var clean = normalizeRecent(list);
      await host.storage.set(KEYS.recent, clean);
      return clean;
    }
    async function loadSearches() {
      var raw = await host.storage.get(KEYS.searches, []);
      if (!Array.isArray(raw)) return [];
      var out = [];
      raw.forEach(function(item) {
        var text = String(item || "").trim();
        if (!text || out.indexOf(text) !== -1) return;
        out.push(text);
      });
      return out.slice(0, MAX_SEARCHES);
    }
    async function saveSearches(list) {
      var out = [];
      (list || []).forEach(function(item) {
        var text = String(item || "").trim();
        if (!text || out.indexOf(text) !== -1) return;
        out.push(text);
      });
      var clean = out.slice(0, MAX_SEARCHES);
      await host.storage.set(KEYS.searches, clean);
      return clean;
    }
    async function loadComments2() {
      var raw = await host.storage.get(KEYS.comments, null);
      return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    }
    async function saveComments(map2) {
      var safe = map2 && typeof map2 === "object" ? map2 : {};
      await host.storage.set(KEYS.comments, safe);
      return safe;
    }
    async function loadCommands() {
      var raw = await host.storage.get(KEYS.cmd, []);
      return Array.isArray(raw) ? raw.slice(-200) : [];
    }
    async function saveCommands(list) {
      var clean = (Array.isArray(list) ? list : []).slice(-200);
      await host.storage.set(KEYS.cmd, clean);
      return clean;
    }
    async function clearAll() {
      await host.storage.delete(KEYS.settings);
      await host.storage.delete(KEYS.playlists);
      await host.storage.delete(KEYS.favorites);
      await host.storage.delete(KEYS.recent);
      await host.storage.delete(KEYS.searches);
      await host.storage.delete(KEYS.queue);
      await host.storage.delete(KEYS.comments);
      await host.storage.delete(KEYS.cmd);
    }
    return {
      loadSettings,
      saveSettings,
      loadPlaylists: loadPlaylists2,
      savePlaylists,
      loadFavorites,
      saveFavorites,
      loadRecent,
      saveRecent,
      loadSearches,
      saveSearches,
      loadComments: loadComments2,
      saveComments,
      loadCommands,
      saveCommands,
      clearAll
    };
  }

  // src/core/sourceMaps.js
  function parseInterval(input) {
    if (input == null) return 0;
    if (typeof input === "number") {
      return input > 1e4 ? Math.round(input) : Math.round(input * 1e3);
    }
    var text = String(input).trim();
    if (!text) return 0;
    var cn = /^(\d+)\s*分\s*(\d+)\s*秒?$/.exec(text);
    if (cn) return (Number(cn[1]) * 60 + Number(cn[2])) * 1e3;
    var clock = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(text);
    if (clock) {
      var a = Number(clock[1]);
      var b = Number(clock[2]);
      var c = clock[3] ? Number(clock[3]) : 0;
      return clock[3] ? ((a * 60 + b) * 60 + c) * 1e3 : (a * 60 + b) * 1e3;
    }
    var num = Number(text.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(num) || num <= 0) return 0;
    return num > 1e4 ? Math.round(num) : Math.round(num * 1e3);
  }
  function preferHttps(url) {
    var s = String(url || "").trim();
    if (!s) return "";
    if (s.indexOf("//") === 0) return "https:" + s;
    return s.replace(/^http:\/\//i, "https://");
  }
  function neteaseOuterUrl(id) {
    if (!id) return "";
    return "https://music.163.com/song/media/outer/url?id=" + encodeURIComponent(String(id)) + ".mp3";
  }
  function isSimilarName(a, b) {
    function norm2(text) {
      return String(text || "").toLowerCase().replace(/[（(【\[].*?[)）】\]]/g, "").replace(/[\s\-_·.,，。!！?？'"“”‘’]/g, "");
    }
    var x = norm2(a);
    var y = norm2(b);
    if (!x || !y) return false;
    if (x === y) return true;
    return x.indexOf(y) !== -1 || y.indexOf(x) !== -1;
  }
  function mapTencentTracks(list) {
    return (list || []).map(function(item) {
      return normalizeTrack({
        source: "tencent",
        platform: "qq",
        id: item.id != null ? item.id : item.mid,
        name: item.song || item.name || item.title,
        artist: item.singer || item.singerName,
        album: item.album,
        cover: item.cover,
        duration: parseInterval(item.interval)
      }, "tencent");
    }).filter(Boolean);
  }
  function mapItunesTracks(results) {
    return (results || []).map(function(item) {
      return normalizeTrack({
        source: "itunes",
        platform: "itunes",
        id: item.trackId,
        name: item.trackName,
        artist: item.artistName,
        album: item.collectionName,
        cover: String(item.artworkUrl100 || "").replace(/\/\d+x\d+bb\./, "/300x300bb."),
        duration: item.trackTimeMillis,
        url: item.previewUrl
      }, "itunes");
    }).filter(Boolean);
  }
  function pickNeteaseMatches(list, track, max) {
    var limit = Number(max) || 3;
    var ids = [];
    (list || []).forEach(function(item) {
      if (ids.length >= limit) return;
      var name = item.song || item.name || item.title || "";
      if (!item.id) return;
      if (track && track.name && !isSimilarName(name, track.name)) return;
      if (ids.indexOf(String(item.id)) !== -1) return;
      ids.push(String(item.id));
    });
    return ids;
  }

  // src/core/search.js
  function mergeResults(groups, opts) {
    var o = opts || {};
    var perSource = Number(o.perSource) || 0;
    var seen = /* @__PURE__ */ Object.create(null);
    var merged = [];
    var errors = [];
    var counts = {};
    (groups || []).forEach(function(group) {
      if (!group) return;
      if (group.error) errors.push({ source: group.source, error: group.error });
      var list = Array.isArray(group.tracks) ? group.tracks : [];
      if (perSource) list = list.slice(0, perSource);
      counts[group.source] = list.length;
      list.forEach(function(track) {
        var key = trackKey(track);
        if (!key || seen[key]) return;
        seen[key] = true;
        merged.push(track);
      });
    });
    return { tracks: merged, errors, counts };
  }
  function norm(text) {
    return String(text == null ? "" : text).toLowerCase().replace(/\s+/g, "");
  }
  function rankTracks(list, keyword) {
    var kw = norm(keyword);
    if (!kw) return (list || []).slice();
    return (list || []).map(function(t, i) {
      var name = norm(t.name);
      var artist = norm(t.artist);
      var score = 3;
      if (name === kw) score = 100;
      else if (name.indexOf(kw) === 0) score = 80;
      else if (name.indexOf(kw) !== -1) score = 60;
      else if (artist.indexOf(kw) === 0) score = 40;
      else if (artist.indexOf(kw) !== -1) score = 30;
      return { track: t, score, i };
    }).sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.i - b.i;
    }).map(function(x) {
      return x.track;
    });
  }

  // src/services/http.js
  var TIMEOUT_MS = 8e3;
  function applyProxy(url, prefix) {
    var p = String(prefix || "").trim();
    if (!p) return url;
    if (p.indexOf("{url}") !== -1) return p.replace("{url}", encodeURIComponent(url));
    return p + encodeURIComponent(url);
  }
  async function fetchText(url, prefix) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = controller ? setTimeout(function() {
      controller.abort();
    }, TIMEOUT_MS) : null;
    try {
      var res = await fetch(applyProxy(url, prefix), {
        method: "GET",
        cache: "no-store",
        signal: controller ? controller.signal : void 0
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async function fetchJson(url, prefix) {
    var text = await fetchText(url, prefix);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      return JSON.parse(JSON.parse(text));
    }
  }

  // src/services/netease.js
  function httpsCover(url) {
    var text = String(url || "");
    if (!text) return "";
    return text.replace(/^http:\/\//i, "https://");
  }
  function base(settings) {
    var url = String(settings && settings.neteaseApi ? settings.neteaseApi : "").trim();
    return url.replace(/\/+$/, "");
  }
  function isReady(settings) {
    return !!base(settings);
  }
  function isLoggedIn(settings) {
    return !!base(settings) && !!(settings && settings.neteaseCookie);
  }
  async function call(settings, path, params) {
    var root = base(settings);
    if (!root) throw new Error("还没有配置网易云 API 地址");
    var query = [];
    var merged = Object.assign({}, params || {});
    if (settings && settings.neteaseCookie) merged.cookie = settings.neteaseCookie;
    merged.timestamp = Date.now();
    Object.keys(merged).forEach(function(key) {
      if (merged[key] === void 0 || merged[key] === null || merged[key] === "") return;
      query.push(encodeURIComponent(key) + "=" + encodeURIComponent(merged[key]));
    });
    var url = root + path + (query.length ? "?" + query.join("&") : "");
    return fetchJson(url, settings.prefix);
  }
  async function qrKey(settings) {
    var data = await call(settings, "/login/qr/key");
    var unikey = data && data.data && data.data.unikey;
    if (!unikey) throw new Error("拿不到二维码 key（检查 API 地址是否可访问）");
    return unikey;
  }
  async function qrCreate(settings, key) {
    var data = await call(settings, "/login/qr/create", { key, qrimg: "true" });
    var item = data && data.data || {};
    return { qrimg: item.qrimg || "", qrurl: item.qrurl || "" };
  }
  async function qrCheck(settings, key) {
    var data = await call(settings, "/login/qr/check", { key, noCookie: "true" });
    var code = Number(data && data.code);
    var cookie = data && data.cookie || "";
    return { code, message: data && data.message || "", cookie };
  }
  async function account(settings) {
    var data = await call(settings, "/login/status");
    var profile = data && data.data && data.data.profile;
    if (profile && profile.nickname) return { nickname: profile.nickname, userId: profile.userId };
    var inner = data && data.data;
    if (inner && inner.account) return { nickname: String(inner.account.id || ""), userId: inner.account.id };
    return null;
  }
  async function search(settings, keyword, limit) {
    var data = await call(settings, "/cloudsearch", {
      keywords: keyword,
      type: 1,
      limit: limit || 20
    });
    var songs = data && data.result && data.result.songs || [];
    return songs.map(function(song) {
      var artists = (song.ar || song.artists || []).map(function(a) {
        return a.name;
      }).join("/");
      return {
        source: "netease",
        platform: "netease",
        id: song.id,
        name: song.name,
        artist: artists,
        album: song.al && song.al.name || "",
        cover: httpsCover(song.al && song.al.picUrl),
        duration: song.dt || 0
      };
    });
  }
  async function songUrl(settings, id, level) {
    var data = await call(settings, "/song/url/v1", { id, level: level || "exhigh" });
    var first = data && data.data && data.data[0] || {};
    return first.url || "";
  }
  async function toplists(settings) {
    var data = await call(settings, "/toplist");
    var list = data && (data.list || data.data) || [];
    return list.slice(0, 8).map(function(item) {
      return {
        id: item.id,
        name: item.name,
        cover: item.coverImgUrl || "",
        count: item.trackCount || item.tracks && item.tracks.length || 0
      };
    });
  }
  async function playlistTracks(settings, id, limit) {
    var data = await call(settings, "/playlist/track/all", { id, limit: limit || 30 });
    var songs = data && data.songs || [];
    return songs.map(function(song) {
      var artists = (song.ar || song.artists || []).map(function(a) {
        return a.name;
      }).join("/");
      return {
        source: "netease",
        platform: "netease",
        id: song.id,
        name: song.name,
        artist: artists,
        album: song.al && song.al.name || "",
        cover: httpsCover(song.al && song.al.picUrl),
        duration: song.dt || 0
      };
    });
  }
  async function lyric(settings, id) {
    var data = await call(settings, "/lyric", { id });
    var lrc = data && data.lrc && data.lrc.lyric || "";
    return lrc;
  }

  // src/services/sources.js
  var VKEYS = "https://api.vkeys.cn/v2/music";
  var ITUNES = "https://itunes.apple.com/search";
  var AUDIUS = "https://api.audius.co";
  var AUDIUS_APP = "RocheMusic";
  async function tencentSearch(keyword, settings, limit) {
    var url = VKEYS + "/tencent?word=" + encodeURIComponent(keyword) + "&page=1&num=" + limit;
    var data = await fetchJson(url, settings.prefix);
    if (!data) return [];
    if (Number(data.code) !== 200 && !Array.isArray(data.data)) {
      throw new Error(data.message || "接口返回异常");
    }
    return mapTencentTracks(data.data);
  }
  async function tencentUrl(track, settings) {
    var url = VKEYS + "/tencent?id=" + encodeURIComponent(track.id) + "&quality=8";
    var data = await fetchJson(url, settings.prefix);
    var item = data && data.data;
    var url2 = item && (item.url || item.playUrl);
    return preferHttps(url2 || "");
  }
  async function neteaseIds(track, settings) {
    var keyword = [track.name, track.artist].filter(Boolean).join(" ");
    var url = VKEYS + "/netease?word=" + encodeURIComponent(keyword) + "&page=1&num=10";
    var data = await fetchJson(url, settings.prefix);
    if (!data || !Array.isArray(data.data)) return [];
    return pickNeteaseMatches(data.data, track, 3).map(neteaseOuterUrl);
  }
  async function itunesSearch(keyword, settings, limit) {
    var base2 = ITUNES + "?term=" + encodeURIComponent(keyword) + "&entity=song&limit=" + limit + "&country=cn&lang=zh_cn";
    var data = await fetchJson(base2, settings.prefix);
    var list = data && data.results || [];
    if (!list.length) {
      var fallback = await fetchJson(base2.replace("country=cn", "country=us"), settings.prefix);
      list = fallback && fallback.results || [];
    }
    return mapItunesTracks(list);
  }
  async function itunesPreview(track, settings) {
    var keyword = [track.name, track.artist].filter(Boolean).join(" ");
    var list = await itunesSearch(keyword, settings, 5);
    if (!list.length) return "";
    var same = list.filter(function(t) {
      return t.name.toLowerCase().indexOf(String(track.name).toLowerCase()) !== -1;
    });
    var picked = same[0] || list[0];
    return preferHttps(picked.url);
  }
  async function audiusSearch(keyword, settings, limit) {
    var url = AUDIUS + "/v1/tracks/search?query=" + encodeURIComponent(keyword) + "&app_name=" + AUDIUS_APP + "&limit=" + limit;
    var data = await fetchJson(url, settings.prefix);
    var list = data && data.data || [];
    return list.filter(function(item) {
      if (item.is_streamable === false) return false;
      if (item.access && item.access.stream === false) return false;
      return true;
    }).map(function(item) {
      return normalizeTrack({
        source: "audius",
        platform: "audius",
        id: item.id,
        name: item.title,
        artist: item.user && item.user.name || "Audius",
        album: "",
        cover: item.artwork && (item.artwork["480x480"] || item.artwork["150x150"]) || "",
        duration: (Number(item.duration) || 0) * 1e3,
        // 这个地址可以直接拼，不用二次解析，原生队列也能直接用
        url: AUDIUS + "/v1/tracks/" + item.id + "/stream?app_name=" + AUDIUS_APP
      }, "audius");
    }).filter(Boolean);
  }
  function createSources() {
    async function search2(keyword, settings, opts) {
      var kw = String(keyword || "").trim();
      if (!kw) return { tracks: [], errors: [], counts: {} };
      var limit = opts && opts.limit || 25;
      var tasks = [];
      if (settings.sources.tencent) {
        tasks.push(
          tencentSearch(kw, settings, limit).then(function(tracks) {
            return { source: "tencent", tracks };
          }).catch(function(err) {
            return { source: "tencent", tracks: [], error: String(err && err.message || err) };
          })
        );
      }
      if (settings.sources.itunes) {
        tasks.push(
          itunesSearch(kw, settings, Math.min(limit, 15)).then(function(tracks) {
            return { source: "itunes", tracks };
          }).catch(function(err) {
            return { source: "itunes", tracks: [], error: String(err && err.message || err) };
          })
        );
      }
      if (settings.sources.audius) {
        tasks.push(
          audiusSearch(kw, settings, Math.min(limit, 12)).then(function(tracks) {
            return { source: "audius", tracks };
          }).catch(function(err) {
            return { source: "audius", tracks: [], error: String(err && err.message || err) };
          })
        );
      }
      if (settings.sources.netease && isReady(settings)) {
        tasks.push(
          search(settings, kw, Math.min(limit, 20)).then(function(list) {
            return {
              source: "netease",
              tracks: list.map(function(item) {
                return normalizeTrack(Object.assign({}, item, { url: "" }), "netease");
              }).filter(Boolean)
            };
          }).catch(function(err) {
            return { source: "netease", tracks: [], error: String(err && err.message || err) };
          })
        );
      }
      var groups = await Promise.all(tasks);
      var merged = mergeResults(groups);
      return {
        tracks: rankTracks(merged.tracks, kw),
        errors: merged.errors,
        counts: merged.counts,
        keyword: kw
      };
    }
    function createResolver(track, settings) {
      var queue = [];
      var filled = { qq: false, netease: false, itunes: false };
      var steps = [];
      if (track.source === "tencent") steps = ["qq", "netease", "itunes"];
      else if (track.source === "itunes") steps = ["itunes"];
      else if (track.source === "netease") steps = isReady(settings) ? ["neapi", "netease", "itunes"] : ["netease", "itunes"];
      else steps = ["netease", "itunes"];
      if (track.url) queue.push(preferHttps(track.url));
      async function fill(kind) {
        if (kind === "neapi") {
          var apiUrl = "";
          try {
            apiUrl = await songUrl(settings, track.id);
          } catch (err) {
            apiUrl = "";
          }
          if (apiUrl) queue.push(preferHttps(apiUrl));
          return;
        }
        if (kind === "qq") {
          if (filled.qq) return;
          filled.qq = true;
          var direct = await tencentUrl(track, settings);
          if (direct) queue.push(direct);
          return;
        }
        if (kind === "netease") {
          if (filled.netease || !settings.sources.netease) return;
          filled.netease = true;
          var list = await neteaseIds(track, settings);
          list.forEach(function(u) {
            if (u) queue.push(u);
          });
          return;
        }
        if (kind === "itunes") {
          if (filled.itunes || !settings.sources.itunes) return;
          filled.itunes = true;
          var preview = await itunesPreview(track, settings);
          if (preview) queue.push(preview);
        }
      }
      var stepIndex = 0;
      return async function nextUrl() {
        for (; ; ) {
          if (queue.length) return queue.shift();
          if (stepIndex >= steps.length) return "";
          var kind = steps[stepIndex++];
          try {
            await fill(kind);
          } catch (err) {
          }
        }
      };
    }
    async function selfTest(settings) {
      var results = [];
      var keyword = "晴天";
      async function run(name, fn) {
        var started = Date.now();
        try {
          var detail = await fn();
          results.push({ name, ok: true, ms: Date.now() - started, detail: detail || "正常" });
        } catch (err) {
          results.push({ name, ok: false, ms: Date.now() - started, detail: String(err && err.message || err) });
        }
      }
      if (settings.sources.tencent) {
        await run("QQ 音乐 · 搜索", async function() {
          var list = await tencentSearch(keyword, settings, 3);
          if (!list.length) throw new Error("能连上但没返回歌曲");
          return list.length + " 首，第一首《" + list[0].name + "》";
        });
        await run("QQ 音乐 · 播放地址", async function() {
          var list = await tencentSearch(keyword, settings, 1);
          if (!list.length) throw new Error("搜索不到歌曲，无法解析");
          var url = await tencentUrl(list[0], settings);
          if (!url) throw new Error("没有返回播放地址（可能被限流）");
          return "已拿到 " + url.slice(0, 46) + "…";
        });
      }
      if (settings.sources.netease) {
        await run("网易云 · 兜底接口", async function() {
          var probe = normalizeTrack({ source: "tencent", platform: "qq", id: "0", name: keyword, artist: "周杰伦" }, "tencent");
          var list = await neteaseIds(probe, settings);
          if (!list.length) throw new Error("没找到同名歌曲");
          return "可兜底 " + list.length + " 个地址";
        });
      }
      if (settings.sources.itunes) {
        await run("iTunes · 试听", async function() {
          var list = await itunesSearch(keyword, settings, 3);
          if (!list.length) throw new Error("没返回结果");
          return list.length + " 首（30 秒试听）";
        });
      }
      if (settings.sources.audius) {
        await run("Audius · 免费曲库", async function() {
          var list = await audiusSearch("lofi", settings, 3);
          if (!list.length) throw new Error("没返回结果");
          return list.length + " 首，第一首《" + list[0].name + "》";
        });
      }
      return results;
    }
    return { search: search2, createResolver, selfTest };
  }

  // src/core/lrc.js
  var TIME_RE = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  function msOf(fraction) {
    if (!fraction) return 0;
    var text = String(fraction);
    if (text.length === 1) text = text + "00";
    else if (text.length === 2) text = text + "0";
    return Number(text.slice(0, 3)) || 0;
  }
  function parseLrc(text) {
    var out = [];
    if (!text) return out;
    String(text).split(/\r?\n/).forEach(function(raw) {
      if (!raw) return;
      var times = [];
      var content = raw.replace(TIME_RE, function(all, mm, ss, fraction) {
        times.push((Number(mm) * 60 + Number(ss)) * 1e3 + msOf(fraction));
        return "";
      }).trim();
      if (!times.length) return;
      if (!content) return;
      times.forEach(function(time) {
        out.push({ time, text: content });
      });
    });
    out.sort(function(a, b) {
      return a.time - b.time;
    });
    return out;
  }
  function activeLineIndex(lines, ms) {
    var arr = lines || [];
    if (!arr.length) return -1;
    var target = Number(ms) || 0;
    var lo = 0;
    var hi = arr.length - 1;
    var ans = -1;
    while (lo <= hi) {
      var mid = lo + hi >> 1;
      if (arr[mid].time <= target) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }
  function pickLrc(payload) {
    if (!payload) return "";
    if (typeof payload === "string") return payload;
    var data = payload.data || payload;
    if (typeof data === "string") return data;
    if (data && typeof data.lrc === "string") return data.lrc;
    if (data && typeof data.lyric === "string") return data.lyric;
    return "";
  }

  // src/services/lyrics.js
  var VKEYS2 = "https://api.vkeys.cn/v2/music";
  function createLyrics() {
    var cache = /* @__PURE__ */ Object.create(null);
    async function load(track, settings) {
      if (!track) return [];
      if (track.source === "netease" && track.id && isReady(settings)) {
        var lrc = await lyric(settings, track.id);
        return lrc ? parseLrc(lrc) : [];
      }
      if (track.source !== "tencent" || !track.id) return [];
      var url = VKEYS2 + "/tencent/lyric?id=" + encodeURIComponent(track.id);
      var data = await fetchJson(url, settings.prefix);
      var text = pickLrc(data);
      return text ? parseLrc(text) : [];
    }
    async function get(track, settings) {
      var key = trackKey(track);
      if (!key) return [];
      if (cache[key]) return cache[key];
      try {
        var lines = await load(track, settings);
        cache[key] = lines;
        return lines;
      } catch (err) {
        cache[key] = [];
        return [];
      }
    }
    function getCached(track) {
      return cache[trackKey(track)] || null;
    }
    function clear2() {
      cache = /* @__PURE__ */ Object.create(null);
    }
    return { get, getCached, clear: clear2 };
  }

  // src/services/player.js
  var MEDIA_ACTIONS = ["play", "pause", "previoustrack", "nexttrack", "stop", "seekto", "seekbackward", "seekforward"];
  function createPlayer(options) {
    var opts = options || {};
    var state = {
      status: "idle",
      // idle | loading | playing | paused | error
      track: null,
      time: 0,
      duration: 0,
      error: "",
      volume: typeof opts.volume === "number" ? opts.volume : 0.8
    };
    var audio = null;
    var lastSrc = "";
    var attemptToken = 0;
    var lastPositionAt = 0;
    function emit() {
      if (typeof opts.onChange === "function") opts.onChange(getState());
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
    function onTimeUpdate() {
      state.time = Number(audio.currentTime || 0) * 1e3;
      if (audio.duration && Number.isFinite(audio.duration)) {
        state.duration = Number(audio.duration) * 1e3;
      }
      if (typeof opts.onChange === "function") opts.onChange(getState());
      updatePositionState();
    }
    function onLoadedMetadata() {
      state.duration = Number.isFinite(audio.duration) ? Number(audio.duration) * 1e3 : state.track && state.track.duration || 0;
      emit();
    }
    function onPlay() {
      state.status = "playing";
      state.error = "";
      emit();
    }
    var nudged = false;
    function onPause() {
      var wasPlaying = state.status === "playing";
      var nearStart = !!audio && audio.currentTime < 1 && wasPlaying;
      if (state.status !== "error" && state.status !== "loading") state.status = "paused";
      emit();
      if (nearStart && !nudged) {
        nudged = true;
        setTimeout(function() {
          if (!audio || !audio.paused) return;
          audio.play().catch(function() {
            nudged = false;
          });
        }, 300);
      }
    }
    function onEnded() {
      state.status = "paused";
      state.time = state.duration;
      emit();
      if (typeof opts.onEnded === "function") opts.onEnded();
    }
    function onError() {
      if (state.status === "loading") return;
      state.status = "error";
      state.error = "音频加载失败";
      emit();
    }
    function bindAudio(target) {
      target.addEventListener("timeupdate", onTimeUpdate);
      target.addEventListener("loadedmetadata", onLoadedMetadata);
      target.addEventListener("play", onPlay);
      target.addEventListener("pause", onPause);
      target.addEventListener("ended", onEnded);
      target.addEventListener("error", onError);
    }
    function recreateAudio() {
      if (audio) {
        try {
          audio.pause();
        } catch (err) {
        }
        try {
          audio.removeEventListener("timeupdate", onTimeUpdate);
          audio.removeEventListener("loadedmetadata", onLoadedMetadata);
          audio.removeEventListener("play", onPlay);
          audio.removeEventListener("pause", onPause);
          audio.removeEventListener("ended", onEnded);
          audio.removeEventListener("error", onError);
        } catch (err) {
        }
      }
      audio = new Audio();
      audio.preload = "auto";
      audio.volume = state.volume;
      bindAudio(audio);
    }
    recreateAudio();
    function mediaSession() {
      if (typeof navigator === "undefined" || !navigator.mediaSession) return null;
      return navigator.mediaSession;
    }
    function updateMediaSession() {
      var ms = mediaSession();
      if (!ms) return;
      if (state.track && typeof MediaMetadata !== "undefined") {
        var cover = state.track.cover || "";
        try {
          ms.metadata = new MediaMetadata({
            title: state.track.name || "",
            artist: state.track.artist || "",
            album: state.track.album || "",
            artwork: cover ? [{ src: cover, sizes: "300x300", type: "image/jpeg" }] : []
          });
        } catch (err) {
        }
      }
      try {
        ms.playbackState = state.status === "playing" ? "playing" : "paused";
      } catch (err) {
      }
    }
    function updatePositionState() {
      var ms = mediaSession();
      if (!ms || typeof ms.setPositionState !== "function") return;
      var now = Date.now();
      if (now - lastPositionAt < 1e3) return;
      lastPositionAt = now;
      var duration = state.duration / 1e3;
      if (!duration || !Number.isFinite(duration) || duration <= 0) return;
      try {
        ms.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.min(Math.max(state.time / 1e3, 0), duration)
        });
      } catch (err) {
      }
    }
    function setActionHandler(action, handler) {
      var ms = mediaSession();
      if (!ms || typeof ms.setActionHandler !== "function") return;
      try {
        ms.setActionHandler(action, handler);
      } catch (err) {
      }
    }
    function setupMediaActions() {
      if (!mediaSession()) return;
      setActionHandler("play", function() {
        resume();
      });
      setActionHandler("pause", function() {
        if (audio) audio.pause();
      });
      setActionHandler("stop", function() {
        if (audio) audio.pause();
      });
      setActionHandler("previoustrack", function() {
        if (typeof opts.onPrev === "function") opts.onPrev();
      });
      setActionHandler("nexttrack", function() {
        if (typeof opts.onNext === "function") opts.onNext();
      });
      setActionHandler("seekto", function(details) {
        if (details && typeof details.seekTime === "number") seek(details.seekTime * 1e3);
      });
      setActionHandler("seekbackward", function() {
        seek(state.time - 1e4);
      });
      setActionHandler("seekforward", function() {
        seek(state.time + 1e4);
      });
    }
    setupMediaActions();
    function tryUrl(url) {
      return new Promise(function(resolve) {
        var settled = false;
        var timer = setTimeout(function() {
          finish(false);
        }, 12e3);
        function cleanup() {
          clearTimeout(timer);
          audio.removeEventListener("error", onTryError);
          audio.removeEventListener("canplay", onTryOk);
          audio.removeEventListener("playing", onTryOk);
        }
        function finish(ok) {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(ok);
        }
        function onTryError() {
          finish(false);
        }
        function onTryOk() {
          finish(true);
        }
        audio.addEventListener("error", onTryError);
        audio.addEventListener("canplay", onTryOk);
        audio.addEventListener("playing", onTryOk);
        lastSrc = url;
        audio.src = url;
        var playing = audio.play();
        if (playing && playing.catch) playing.catch(function() {
        });
      });
    }
    async function load(track, nextUrl) {
      var token = ++attemptToken;
      state.track = track;
      state.status = "loading";
      state.error = "";
      state.time = 0;
      state.duration = track && track.duration || 0;
      emit();
      updateMediaSession();
      if (typeof nextUrl !== "function") return false;
      for (var i = 0; i < 6; i++) {
        var url = "";
        try {
          url = await nextUrl();
        } catch (err) {
          url = "";
        }
        if (token !== attemptToken) return false;
        if (!url) break;
        var ok = await tryUrl(url);
        if (token !== attemptToken) return false;
        if (ok) {
          state.status = "playing";
          state.error = "";
          emit();
          return true;
        }
      }
      state.status = "error";
      state.error = "所有音源都放不了这首";
      emit();
      return false;
    }
    async function resume() {
      if (!state.track) return false;
      if (audio && audio.src) {
        try {
          await audio.play();
          return true;
        } catch (err) {
        }
      }
      if (!lastSrc) return false;
      recreateAudio();
      audio.src = lastSrc;
      audio.currentTime = Math.max(0, (state.time || 0) / 1e3);
      try {
        await audio.play();
        return true;
      } catch (err) {
        state.status = "error";
        state.error = "被系统中断，点一下重新加载";
        emit();
        return false;
      }
    }
    async function toggle() {
      if (!state.track) return false;
      if (audio && !audio.paused) {
        audio.pause();
        return true;
      }
      return resume();
    }
    function seek(ms) {
      var sec = Math.max(0, (Number(ms) || 0) / 1e3);
      if (!audio || !Number.isFinite(audio.duration)) return;
      audio.currentTime = Math.min(sec, audio.duration || sec);
      state.time = audio.currentTime * 1e3;
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
          audio.removeAttribute("src");
          audio.load();
        }
      } catch (err) {
      }
      lastSrc = "";
      state.status = "idle";
      state.track = null;
      state.time = 0;
      state.duration = 0;
      state.error = "";
      emit();
    }
    function dispose() {
      attemptToken += 1;
      try {
        if (audio) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
      } catch (err) {
      }
      MEDIA_ACTIONS.forEach(function(action) {
        setActionHandler(action, null);
      });
      state.status = "idle";
      state.track = null;
    }
    function setHandlers(handlers) {
      var h2 = handlers || {};
      opts.onChange = typeof h2.onChange === "function" ? h2.onChange : null;
      opts.onEnded = typeof h2.onEnded === "function" ? h2.onEnded : null;
      opts.onNext = typeof h2.onNext === "function" ? h2.onNext : null;
      opts.onPrev = typeof h2.onPrev === "function" ? h2.onPrev : null;
      setupMediaActions();
    }
    return {
      load,
      toggle,
      resume,
      seek,
      setVolume,
      stop,
      dispose,
      getState,
      setHandlers,
      isPlaying: function() {
        return state.status === "playing";
      }
    };
  }
  var shared = null;
  function getPlayer(options) {
    if (!shared) {
      shared = createPlayer(options || {});
    } else if (options) {
      shared.setHandlers(options);
      if (typeof options.volume === "number") shared.setVolume(options.volume);
    }
    return shared;
  }

  // src/services/nativeAudio.js
  function getPlugin() {
    if (typeof window === "undefined") return null;
    var cap = window.Capacitor;
    var plugin = cap && cap.Plugins ? cap.Plugins.BackgroundAudio : null;
    if (!plugin || typeof plugin.replaceQueue !== "function") return null;
    return plugin;
  }
  function nativeAvailable() {
    return !!getPlugin();
  }
  function createNativeAudio() {
    function plugin() {
      return getPlugin();
    }
    function statusOf(res) {
      if (!res) return null;
      return res.status || res;
    }
    async function call2(method, payload) {
      var p = plugin();
      if (!p || typeof p[method] !== "function") return null;
      try {
        var res = await p[method](payload || {});
        return statusOf(res);
      } catch (err) {
        return null;
      }
    }
    return {
      available: function() {
        return !!plugin();
      },
      replaceQueue: function(payload) {
        return call2("replaceQueue", payload);
      },
      play: function() {
        return call2("play");
      },
      pause: function() {
        return call2("pause");
      },
      stop: function() {
        return call2("stop");
      },
      next: function() {
        return call2("next");
      },
      previous: function() {
        return call2("previous");
      },
      seekTo: function(positionSeconds) {
        return call2("seekTo", { positionSeconds });
      },
      setPlaybackMode: function(mode) {
        return call2("setPlaybackMode", { mode });
      },
      getStatus: function() {
        return call2("getStatus");
      },
      addStatusListener: function(handler) {
        var p = plugin();
        if (!p || typeof p.addListener !== "function") return function() {
        };
        var handle = null;
        var removed = false;
        try {
          Promise.resolve(p.addListener("statusChange", function(event) {
            handler(statusOf(event));
          })).then(function(h2) {
            handle = h2;
            if (removed && h2 && h2.remove) h2.remove();
          });
        } catch (err) {
        }
        return function() {
          removed = true;
          if (handle && typeof handle.remove === "function") {
            try {
              handle.remove();
            } catch (err) {
            }
          }
        };
      }
    };
  }

  // src/services/nativeEngine.js
  var WINDOW = 10;
  var WARM = WINDOW;
  var CONCURRENCY = 4;
  var POLL_MS = 900;
  var EDGE_BEFORE = 1.5;
  var URL_TTL = 3 * 60 * 1e3;
  var PREPARE_GRACE = 6e3;
  function createNativeEngine(options) {
    var opts = options || {};
    var sources = opts.sources;
    var onChange = typeof opts.onChange === "function" ? opts.onChange : function() {
    };
    var onTrackChange = typeof opts.onTrackChange === "function" ? opts.onTrackChange : function() {
    };
    var onEnded = typeof opts.onEnded === "function" ? opts.onEnded : function() {
    };
    var audio = createNativeAudio();
    var list = [];
    var windowTracks = [];
    var windowMap = [];
    var resolved = /* @__PURE__ */ Object.create(null);
    var settings = null;
    var timer = null;
    var listenerOff = null;
    var lastNativeIndex = -1;
    var rebuiltFor = "";
    var busy = false;
    var opToken = 0;
    var openedAt = 0;
    var retried = /* @__PURE__ */ Object.create(null);
    var edgeFiredFor = "";
    var autoSkips = 0;
    var stats = { events: 0, queues: 0, lastEventAt: 0 };
    var minimal = !!opts.minimal;
    var state = {
      status: "idle",
      track: null,
      time: 0,
      duration: 0,
      error: "",
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
      if (!s) return "loop";
      if (s.playMode === "shuffle" || s.playMode == null && s.shuffle) return "random";
      if (s.playMode === "one" || s.playMode == null && s.repeat === REPEAT.ONE) return "one";
      return "loop";
    }
    function urlOf(track) {
      var key = trackKey(track);
      var item = resolved[key];
      if (!item) return "";
      if (Date.now() - item.at > URL_TTL) {
        delete resolved[key];
        return "";
      }
      return item.url;
    }
    async function resolveOne(track) {
      var key = trackKey(track);
      try {
        var next2 = sources.createResolver(track, settings);
        var url = await next2();
        if (url) resolved[key] = { url, at: Date.now() };
        else delete resolved[key];
      } catch (err) {
        delete resolved[key];
      }
    }
    async function resolveUrls(tracks) {
      var pending = (tracks || []).filter(function(t) {
        return t && !urlOf(t);
      });
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
    async function openWindow(jsStart, autoplay) {
      if (!list.length) return false;
      var token = ++opToken;
      var total = list.length;
      var start = Math.min(Math.max(jsStart, 0), total - 1);
      var count = Math.min(WINDOW, total);
      var slice = [];
      var ringIndex = [];
      for (var k = 0; k < count; k++) {
        var idx = (start + k) % total;
        slice.push(list[idx]);
        ringIndex.push(idx);
      }
      if (!slice.length) return false;
      state.status = "loading";
      state.error = "";
      emit();
      var warm = slice.slice(0, Math.min(WARM, slice.length));
      await resolveUrls(warm);
      if (token !== opToken) return false;
      var nativeTracks = [];
      var map2 = [];
      warm.forEach(function(track, i) {
        var url = urlOf(track);
        if (!url) return;
        nativeTracks.push(toNativeTrack(track, url));
        map2.push(ringIndex[i]);
      });
      if (!nativeTracks.length) {
        state.status = "error";
        state.error = "这首放不了";
        emit();
        return false;
      }
      windowTracks = slice;
      windowMap = map2;
      rebuiltFor = "";
      lastNativeIndex = -1;
      edgeFiredFor = "";
      var status = null;
      try {
        status = await audio.replaceQueue({
          tracks: nativeTracks,
          startIndex: 0,
          mode: modeOf(settings),
          autoplay: autoplay !== false
        });
      } catch (err) {
        state.status = "error";
        state.error = "起播失败，换一首试试";
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
        albumId: track.album || "",
        title: track.name || "未知歌曲",
        artist: track.artist || "",
        cover: track.cover || "",
        url
      };
    }
    async function expandWindow(token, start, slice) {
      if (busy || token !== opToken) return;
      if (!state.track) return;
      if (trackKey(state.track) !== trackKey(list[start])) return;
      if (Date.now() - openedAt > 15e3) return;
      var nativeTracks = [];
      var map2 = [];
      slice.forEach(function(track, i) {
        var url = urlOf(track);
        if (!url) return;
        nativeTracks.push(toNativeTrack(track, url));
        map2.push(start + i);
      });
      if (nativeTracks.length <= windowMap.length) return;
      var resumeAt = (state.time || 0) / 1e3;
      var wasPlaying = state.status === "playing";
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
      windowMap = map2;
      lastNativeIndex = 0;
      edgeFiredFor = "";
      openedAt = Date.now();
      if (resumeAt > 1) {
        try {
          await audio.seekTo(resumeAt);
        } catch (err) {
        }
      }
      if (status) applyStatus(status, true);
    }
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
      var track = null;
      var byId = indexByTrackId(raw.trackId);
      if (byId >= 0) track = list[byId];
      else if (Number.isFinite(nativeIndex) && windowMap[nativeIndex] != null) {
        track = list[windowMap[nativeIndex]];
      }
      if (!track && raw.title) {
        if (state.track && state.track.name === raw.title) {
          track = state.track;
        } else {
          track = {
            source: "native",
            platform: "local",
            id: String(raw.trackId || raw.title),
            name: raw.title,
            artist: raw.artist || "",
            album: raw.albumId || "",
            cover: raw.cover || "",
            duration: (Number(raw.duration) || 0) * 1e3
          };
          list = list.concat([track]);
          windowMap[nativeIndex] = list.length - 1;
        }
      }
      if (track && (!state.track || trackKey(state.track) !== trackKey(track))) {
        state.track = track;
        openedAt = Date.now();
        onTrackChange(track);
      }
      if (Number.isFinite(nativeIndex) && nativeIndex >= 0 && windowMap[nativeIndex] != null) {
        lastNativeIndex = nativeIndex;
      }
      if (typeof raw.currentTime === "number") state.time = Math.max(0, raw.currentTime) * 1e3;
      if (typeof raw.duration === "number") state.duration = Math.max(0, raw.duration) * 1e3;
      if (typeof raw.isPlaying === "boolean") {
        state.status = raw.isPlaying ? "playing" : state.track ? "paused" : "idle";
        if (raw.isPlaying) autoSkips = 0;
      }
      emit();
      maybeRecover(raw);
      maybeAdvanceWindow(raw);
    }
    function maybeRecover(raw) {
      if (minimal) return;
      if (!raw || !state.track || raw.isPlaying) return;
      if (Number(raw.duration) > 0 || Number(raw.currentTime) > 0) return;
      if (!openedAt || Date.now() - openedAt < PREPARE_GRACE) return;
      if (busy) return;
      if (raw.initialized === false) return;
      if (raw.trackId && trackKey(state.track) !== raw.trackId) return;
      var key = trackKey(state.track);
      var tries = retried[key] || 0;
      if (tries >= 2) {
        var skipFrom = indexByTrackId(raw.trackId);
        if (autoSkips < 3 && skipFrom >= 0 && skipFrom + 1 < list.length) {
          autoSkips += 1;
          openWindow(skipFrom + 1, true).then(function() {
            busy = false;
          }, function() {
            busy = false;
          });
          busy = true;
          return;
        }
        state.status = "error";
        state.error = "这首放不了，已跳到下一首";
        emit();
        return;
      }
      retried[key] = tries + 1;
      delete resolved[key];
      var jsIndex = indexByTrackId(raw.trackId);
      if (jsIndex < 0) return;
      busy = true;
      openedAt = Date.now();
      openWindow(jsIndex, true).then(function() {
        busy = false;
      }, function() {
        busy = false;
      });
    }
    function maybeAdvanceWindow(raw) {
      if (minimal) return;
      if (busy || !windowMap.length) return;
      if (windowMap.length <= 1) return;
      var nativeIndex = Number(raw.currentTrackIndex);
      if (nativeIndex !== windowMap.length - 1) return;
      var duration = Number(raw.duration) || 0;
      var current2 = Number(raw.currentTime) || 0;
      if (!duration || duration - current2 > EDGE_BEFORE) return;
      var jsIndex = windowMap[nativeIndex];
      if (jsIndex == null) return;
      var key = String(jsIndex);
      if (edgeFiredFor === key) return;
      edgeFiredFor = key;
      var nextIndex = jsIndex + 1;
      if (nextIndex >= list.length) {
        if (!settings.repeat || settings.repeat === REPEAT.OFF) {
          audio.pause().then(function(status) {
            if (status) applyStatus(status, true);
          }, function() {
          });
          return;
        }
        nextIndex = 0;
      }
      busy = true;
      openWindow(nextIndex, true).then(function() {
        busy = false;
      }, function() {
        busy = false;
      });
    }
    async function syncNow() {
      var status = await audio.getStatus();
      if (status) applyStatus(status, false);
    }
    function startPolling() {
      if (!listenerOff) {
        listenerOff = audio.addStatusListener(function(status) {
          if (!status) return;
          stats.events += 1;
          stats.lastEventAt = Date.now();
          applyStatus(status, true);
        });
      }
      if (minimal || timer) return;
      timer = setInterval(syncNow, POLL_MS);
    }
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
    async function playList(tracks, startIndex, currentSettings) {
      list = (tracks || []).filter(Boolean).slice();
      settings = currentSettings || settings;
      lastNativeIndex = -1;
      if (!list.length) return false;
      return openWindow(startIndex || 0, true);
    }
    async function attach(tracks, currentSettings) {
      list = (tracks || []).filter(Boolean).slice();
      settings = currentSettings || settings;
      startPolling();
      await syncNow();
    }
    function setList(tracks, currentSettings) {
      list = (tracks || []).filter(Boolean).slice();
      if (currentSettings) settings = currentSettings;
    }
    async function playAt(jsIndex) {
      if (!list.length) return false;
      return openWindow(jsIndex, true);
    }
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
      return openWindow((nextIndex % list.length + list.length) % list.length, true);
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
      var status = await (state.status === "playing" ? audio.pause() : audio.play());
      if (status) applyStatus(status, true);
      else emit();
      return true;
    }
    async function seek(ms) {
      var status = await audio.seekTo(Math.max(0, (Number(ms) || 0) / 1e3));
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
      state.status = "idle";
      state.track = null;
      state.time = 0;
      state.duration = 0;
      emit();
    }
    function dispose() {
      stopPolling();
      state.track = null;
      state.status = "idle";
    }
    function setVolume(v) {
      state.volume = Math.min(1, Math.max(0, Number(v) || 0));
      return state.volume;
    }
    return {
      kind: "native",
      available: function() {
        return audio.available();
      },
      playList,
      attach,
      setList,
      playAt,
      next,
      previous,
      toggle,
      seek,
      setMode,
      stop,
      dispose,
      setVolume,
      setMinimal,
      stats: function() {
        return Object.assign({}, stats);
      },
      syncNow,
      getState,
      jsIndexOf: function() {
        var idx = windowMap[lastNativeIndex];
        return idx == null ? -1 : idx;
      }
    };
  }

  // src/services/taStore.js
  var CHAR_PLAYLIST_NAME = "TA 的歌";
  var RECOMMEND_PLAYLIST_NAME = "为你挑的";
  var MAX_COMMENT_LEN = 80;
  var MAX_COMMENT_TRACKS = 300;
  function mirrorRead(key) {
    try {
      if (typeof localStorage === "undefined") return null;
      var text = localStorage.getItem("mp:mirror:" + key);
      if (!text) return null;
      return JSON.parse(text);
    } catch (err) {
      return null;
    }
  }
  function mirrorWrite(key, value) {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem("mp:mirror:" + key, JSON.stringify(value));
    } catch (err) {
    }
  }
  async function readJson(roche, key, fallback) {
    var fromHost = null;
    try {
      if (roche && roche.storage && typeof roche.storage.get === "function") {
        fromHost = await roche.storage.get(key);
      }
    } catch (err) {
      fromHost = null;
    }
    if (fromHost !== void 0 && fromHost !== null) {
      mirrorWrite(key, fromHost);
      return fromHost;
    }
    var mirrored = mirrorRead(key);
    return mirrored === null ? fallback : mirrored;
  }
  async function writeJson(roche, key, value) {
    mirrorWrite(key, value);
    try {
      if (roche && roche.storage && typeof roche.storage.set === "function") {
        await roche.storage.set(key, value);
      }
      return true;
    } catch (err) {
      return false;
    }
  }
  async function loadPlaylists(roche) {
    var raw = await readJson(roche, "mp:playlists", []);
    return normalizePlaylists(raw);
  }
  function charPlaylists(list, characterId) {
    var id = String(characterId || "");
    return (list || []).filter(function(p) {
      return p && p.owner === "char" && String(p.ownerId || "") === id;
    }).sort(function(a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }
  async function addTrackForChar(roche, characterId, track) {
    if (!track || !trackKey(track)) return { ok: false, reason: "没有正在播放的歌" };
    var list = await loadPlaylists(roche);
    var mine = charPlaylists(list, characterId);
    var target = mine[0] || null;
    var created = false;
    if (!target) {
      var made = createPlaylist(list, CHAR_PLAYLIST_NAME, "char-" + String(characterId || "ta"), Date.now(), {
        owner: "char",
        ownerId: characterId
      });
      if (!made.playlist) return { ok: false, reason: "歌单数量已达上限" };
      list = made.list;
      target = made.playlist;
      created = true;
    }
    var res = addTracksToPlaylist(list, target.id, [track], Date.now());
    await writeJson(roche, "mp:playlists", res.list);
    var updated = null;
    res.list.forEach(function(p) {
      if (p.id === target.id) updated = p;
    });
    return {
      ok: res.added > 0 || res.duplicate > 0,
      playlist: updated || target,
      created,
      duplicate: res.duplicate > 0 && res.added === 0,
      reason: res.added > 0 ? "" : res.duplicate > 0 ? "这首已经在歌单里了" : "歌单已满"
    };
  }
  async function createCharPlaylist(roche, characterId, name, tracks) {
    var list = await loadPlaylists(roche);
    var made = createPlaylist(list, name || CHAR_PLAYLIST_NAME, "char-" + Date.now().toString(36), Date.now(), {
      owner: "char",
      ownerId: characterId
    });
    if (!made.playlist) return { ok: false, reason: "歌单数量已达上限" };
    list = made.list;
    var added = 0;
    if (tracks && tracks.length) {
      var res = addTracksToPlaylist(list, made.playlist.id, tracks, Date.now());
      list = res.list;
      added = res.added;
    }
    await writeJson(roche, "mp:playlists", list);
    return { ok: true, playlist: made.playlist, added, created: true, playlistId: made.playlist.id };
  }
  function cleanComment(text) {
    var s = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
    return s.slice(0, MAX_COMMENT_LEN);
  }
  async function loadComments(roche) {
    var raw = await readJson(roche, "mp:comments", {});
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  }
  async function saveComment(roche, characterId, track, text) {
    var clean = cleanComment(text);
    if (!clean) return { ok: false, reason: "短评为空" };
    var key = trackKey(track);
    if (!key) return { ok: false, reason: "没有正在播放的歌" };
    var map2 = await loadComments(roche);
    var entry = map2[key] && typeof map2[key] === "object" ? map2[key] : {};
    entry[String(characterId || "ta")] = {
      text: clean,
      at: Date.now(),
      name: track.name || "",
      artist: track.artist || ""
    };
    var keys = Object.keys(map2);
    if (keys.length > MAX_COMMENT_TRACKS) {
      keys.sort(function(a, b) {
        return map2[a] && map2[a][String(characterId)] && map2[a][String(characterId)].at || 0;
      }).slice(0, keys.length - MAX_COMMENT_TRACKS).forEach(function(k) {
        delete map2[k];
      });
    }
    map2[key] = entry;
    await writeJson(roche, "mp:comments", map2);
    return { ok: true, text: clean, key };
  }

  // src/core/prefs.js
  var MAX_PREFS = 12;
  function clampWeight(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return 50;
    return Math.max(0, Math.min(100, Math.round(n)));
  }
  function cleanText(text, max) {
    return String(text == null ? "" : text).replace(/\s+/g, " ").trim().slice(0, max);
  }
  function defaultPrefs() {
    return [
      {
        id: "genre",
        label: "曲风与语种",
        prompt: "偏华语流行、独立民谣，也能接受英文慢歌",
        weight: 60,
        builtin: true
      },
      {
        id: "era",
        label: "年代",
        prompt: "更偏 2010 年之后的歌，好听的老歌也可以",
        weight: 40,
        builtin: true
      },
      {
        id: "mood",
        label: "情绪",
        prompt: "睡前和通勤时想听安静、治愈的歌",
        weight: 55,
        builtin: true
      },
      {
        id: "avoid",
        label: "避雷",
        prompt: "不要喊麦、不要土味改编、不要太吵",
        weight: 80,
        builtin: true
      }
    ];
  }
  function normalizePrefs(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    var seen = /* @__PURE__ */ Object.create(null);
    list.slice(0, MAX_PREFS).forEach(function(item, index) {
      if (!item || typeof item !== "object") return;
      var label = cleanText(item.label, 16);
      var prompt = cleanText(item.prompt, 120);
      if (!label && !prompt) return;
      var id = String(item.id || "p" + index + "_" + Date.now().toString(36));
      if (seen[id]) id = id + "_" + index;
      seen[id] = true;
      out.push({
        id,
        label: label || "偏好",
        prompt,
        weight: clampWeight(item.weight),
        builtin: !!item.builtin
      });
    });
    return out.length ? out : defaultPrefs();
  }
  function addPref(list, label, prompt) {
    var arr = Array.isArray(list) ? list.slice() : [];
    if (arr.length >= MAX_PREFS) return { list: arr, pref: null, reason: "limit" };
    var pref = {
      id: "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e3),
      label: cleanText(label, 16) || "新偏好",
      prompt: cleanText(prompt, 120),
      weight: 50,
      builtin: false
    };
    arr.push(pref);
    return { list: arr, pref };
  }
  function removePref(list, id) {
    var arr = Array.isArray(list) ? list.slice() : [];
    var target = null;
    arr.forEach(function(p) {
      if (p && p.id === id) target = p;
    });
    if (target && target.builtin) return { list: arr, removed: false, reason: "builtin" };
    var next = arr.filter(function(p) {
      return !p || p.id !== id;
    });
    if (!next.length) return { list: next, removed: false, reason: "empty" };
    return { list: next, removed: true };
  }
  function updatePref(list, id, patch) {
    return (Array.isArray(list) ? list : []).map(function(p) {
      if (!p || p.id !== id) return p;
      var next = Object.assign({}, p);
      if (patch && typeof patch.label === "string") next.label = cleanText(patch.label, 16) || p.label;
      if (patch && typeof patch.prompt === "string") next.prompt = cleanText(patch.prompt, 120);
      if (patch && patch.weight != null) next.weight = clampWeight(patch.weight);
      return next;
    });
  }
  function prefsToPrompt(list) {
    var arr = (Array.isArray(list) ? list : []).slice();
    arr.sort(function(a, b) {
      return (b.weight || 0) - (a.weight || 0);
    });
    return arr.map(function(p) {
      return "- " + p.label + "（重要度 " + p.weight + "/100）：" + (p.prompt || "无特别要求");
    }).join("\n");
  }
  function avoidTexts(list) {
    return (Array.isArray(list) ? list : []).filter(function(p) {
      return p && p.label === "避雷" && p.prompt;
    }).map(function(p) {
      return p.prompt;
    });
  }

  // src/services/recommend.js
  var AI_TIMEOUT = 2e4;
  var MAX_TRACKS = 8;
  function buildProfilePrompt(prefs, recent, favorites) {
    var recentNames = (recent || []).slice(0, 12).map(function(t) {
      return "《" + (t.name || "") + "》" + (t.artist ? " - " + t.artist : "");
    }).filter(Boolean);
    var favNames = (favorites || []).slice(0, 12).map(function(t) {
      return "《" + (t.name || "") + "》" + (t.artist ? " - " + t.artist : "");
    }).filter(Boolean);
    return [
      "你是一个懂音乐的推荐助手。请根据下面的用户画像，挑一批适合现在听的歌。",
      "",
      "【偏好】",
      prefsToPrompt(prefs),
      "",
      recentNames.length ? "【最近在听】\n" + recentNames.join("、") : "【最近在听】暂无记录",
      favNames.length ? "【收藏】\n" + favNames.join("、") : "【收藏】暂无",
      "",
      "要求：",
      "1. 挑 6 到 8 首，风格要贴合画像，不要重复最近在听的歌；",
      "2. 只输出 JSON，不要解释、不要代码块，格式：",
      '{"playlistName":"四个字以内的小标题","keywords":["3 个中文搜索关键词"],"tracks":[{"name":"歌名","artist":"歌手"}]}',
      "3. 歌名和歌手必须是真实存在的作品，不要编造。"
    ].join("\n");
  }
  function parseRecommendJson(text) {
    var raw = String(text || "").trim();
    if (!raw) return null;
    raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    var start = raw.indexOf("{");
    var end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    var body = raw.slice(start, end + 1);
    var data = null;
    try {
      data = JSON.parse(body);
    } catch (err) {
      return null;
    }
    if (!data || typeof data !== "object") return null;
    var tracks = Array.isArray(data.tracks) ? data.tracks : [];
    var clean = tracks.map(function(t) {
      if (!t) return null;
      if (typeof t === "string") return { name: t.trim(), artist: "" };
      var name = String(t.name || t.title || "").trim();
      if (!name) return null;
      return { name, artist: String(t.artist || "").trim() };
    }).filter(Boolean).slice(0, MAX_TRACKS);
    var keywords = Array.isArray(data.keywords) ? data.keywords.map(function(k) {
      return String(k || "").trim();
    }).filter(Boolean).slice(0, 4) : [];
    return {
      playlistName: String(data.playlistName || data.name || "AI 推荐").trim().slice(0, 12),
      keywords,
      tracks: clean
    };
  }
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function(_, reject) {
        setTimeout(function() {
          reject(new Error("timeout"));
        }, ms);
      })
    ]);
  }
  async function ground({ sources, settings, picks, keywords, avoid }) {
    var out = [];
    var seen = /* @__PURE__ */ Object.create(null);
    function blocked(track) {
      if (!avoid || !avoid.length) return false;
      var text = (track.name || "") + " " + (track.artist || "");
      return avoid.some(function(word) {
        return word && text.indexOf(word) !== -1;
      });
    }
    function push(track) {
      if (!track) return false;
      var key = trackKey(track);
      if (!key || seen[key]) return false;
      if (blocked(track)) return false;
      seen[key] = true;
      out.push(track);
      return true;
    }
    for (var i = 0; i < picks.length && out.length < MAX_TRACKS; i++) {
      var pick = picks[i];
      try {
        var kw = (pick.name + " " + pick.artist).trim();
        var found = await sources.search(kw, settings, { limit: 4 });
        if (found && found.tracks && found.tracks.length) push(found.tracks[0]);
      } catch (err) {
      }
    }
    for (var j = 0; j < keywords.length && out.length < MAX_TRACKS; j++) {
      try {
        var res = await sources.search(keywords[j], settings, { limit: 6 });
        (res && res.tracks ? res.tracks : []).forEach(function(t) {
          if (out.length < MAX_TRACKS) push(t);
        });
      } catch (err) {
      }
    }
    return out;
  }
  async function localGenerate({ sources, settings, prefs, recent, avoid }) {
    var keywords = [];
    (prefs || []).forEach(function(p) {
      if (!p || p.label === "避雷" || !p.prompt) return;
      keywords.push(p.prompt);
    });
    (recent || []).slice(0, 3).forEach(function(t) {
      if (t && t.artist) keywords.push(t.artist);
    });
    if (!keywords.length) keywords.push("华语流行");
    var tracks = await ground({ sources, settings, picks: [], keywords: keywords.slice(0, 4), avoid });
    return {
      ok: tracks.length > 0,
      mode: "local",
      playlistName: "为你挑的",
      tracks,
      reason: tracks.length ? "" : "没搜到合适的歌"
    };
  }
  async function generate(options) {
    var opts = options || {};
    var sources = opts.sources;
    var settings = opts.settings || {};
    var prefs = opts.prefs || [];
    var avoid = avoidTexts(prefs);
    var mode = String(settings.recMode || "manual");
    var ai = null;
    try {
      var api2 = typeof window !== "undefined" ? window.Roche : null;
      ai = api2 && api2.ai ? api2.ai : null;
    } catch (err) {
      ai = null;
    }
    if (mode === "local" || !ai || typeof ai.chat !== "function") {
      return localGenerate({ sources, settings, prefs, recent: opts.recent, avoid });
    }
    var prompt = buildProfilePrompt(prefs, opts.recent, opts.favorites);
    var text = "";
    try {
      var result = await withTimeout(ai.chat({
        messages: [
          { role: "system", content: "你只输出 JSON，不要输出任何解释或 Markdown 代码块。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.85
      }), AI_TIMEOUT);
      text = result && (result.text || result.content) || "";
    } catch (err) {
      var fallback = await localGenerate({ sources, settings, prefs, recent: opts.recent, avoid });
      fallback.reason = "AI 暂时不可用，先按偏好挑了几首";
      return fallback;
    }
    var parsed = parseRecommendJson(text);
    if (!parsed || !parsed.tracks.length && !parsed.keywords.length) {
      var again = await localGenerate({ sources, settings, prefs, recent: opts.recent, avoid });
      again.reason = "AI 返回的格式看不懂，已按偏好兜底";
      return again;
    }
    var tracks = await ground({
      sources,
      settings,
      picks: parsed.tracks,
      keywords: parsed.keywords,
      avoid
    });
    if (!tracks.length) {
      var retry = await localGenerate({ sources, settings, prefs, recent: opts.recent, avoid });
      retry.reason = "AI 挑的歌没搜到，已按偏好兜底";
      return retry;
    }
    return {
      ok: true,
      mode: "ai",
      playlistName: parsed.playlistName || "AI 为你挑的",
      keywords: parsed.keywords,
      tracks,
      reason: ""
    };
  }

  // src/ui/dom.js
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function(key) {
        var v = attrs[key];
        if (v === null || v === void 0 || v === false) return;
        if (key === "class") el.className = v;
        else if (key === "text") el.textContent = v;
        else if (key === "html") el.innerHTML = v;
        else if (key === "dataset") {
          Object.keys(v).forEach(function(d) {
            el.dataset[d] = v[d];
          });
        } else if (key.slice(0, 2) === "on" && typeof v === "function") {
          el.addEventListener(key.slice(2).toLowerCase(), v);
        } else if (v === true) {
          el.setAttribute(key, "");
        } else {
          el.setAttribute(key, v);
        }
      });
    }
    append(el, children);
    return el;
  }
  function append(parent, children) {
    if (children === null || children === void 0 || children === false) return parent;
    if (Array.isArray(children)) {
      children.forEach(function(c) {
        append(parent, c);
      });
      return parent;
    }
    if (typeof children === "string" || typeof children === "number") {
      parent.appendChild(document.createTextNode(String(children)));
      return parent;
    }
    if (children.nodeType) parent.appendChild(children);
    return parent;
  }
  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  // src/ui/icons.js
  var STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  var FILL = 'fill="currentColor"';
  var ICONS = {
    search: '<svg viewBox="0 0 24 24" ' + STROKE + '><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
    music: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
    heart: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M12 20s-7-4.6-7-9.4A4.1 4.1 0 0 1 12 7a4.1 4.1 0 0 1 7 3.6C19 15.4 12 20 12 20z"/></svg>',
    heartFull: '<svg viewBox="0 0 24 24" ' + FILL + '><path d="M12 20s-7-4.6-7-9.4A4.1 4.1 0 0 1 12 7a4.1 4.1 0 0 1 7 3.6C19 15.4 12 20 12 20z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2.2"/><circle cx="8" cy="16" r="2.2"/></svg>',
    play: '<svg viewBox="0 0 24 24" ' + FILL + '><path d="M7 5.5v13l12-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" ' + FILL + '><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>',
    prev: '<svg viewBox="0 0 24 24" ' + FILL + '><rect x="5" y="5" width="2.6" height="14" rx="1.2"/><path d="M19 6.5v11L9.5 12z"/></svg>',
    next: '<svg viewBox="0 0 24 24" ' + FILL + '><rect x="16.4" y="5" width="2.6" height="14" rx="1.2"/><path d="M5 6.5v11L14.5 12z"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M4 6h3l10 12h3M4 18h3l3-3.6M14 8.6L17 6h3"/><path d="M17 3.5 20 6l-3 2.5M17 15.5 20 18l-3 2.5"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M6 7h11a3 3 0 0 1 3 3v2"/><path d="M18 17H7a3 3 0 0 1-3-3v-2"/><path d="M14 4.5 17 7l-3 2.5M10 19.5 7 17l3-2.5"/></svg>',
    repeatOne: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M6 7h11a3 3 0 0 1 3 3v2"/><path d="M18 17H7a3 3 0 0 1-3-3v-2"/><path d="M14 4.5 17 7l-3 2.5M10 19.5 7 17l3-2.5"/><path d="M11.4 10.6l1.2-.8v4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M12 5v14M5 12h14"/></svg>',
    more: '<svg viewBox="0 0 24 24" ' + FILL + '><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>',
    back: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M14.5 5 8 12l6.5 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M6 6l12 12M18 6 6 18"/></svg>',
    trash: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12"/></svg>',
    check: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M5 12.5 10 17l9-10"/></svg>',
    down: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    up: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    folder: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M4 7h6l2 2h8v9H4z"/></svg>',
    lyric: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M4 7h16M4 12h11M4 17h13"/></svg>',
    queue: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M4 7h11M4 12h11M4 17h6"/><circle cx="18" cy="16" r="2"/><path d="M20 16V8l-3 1"/></svg>',
    float: '<svg viewBox="0 0 24 24" ' + STROKE + '><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M7 9h7M7 12h5"/></svg>',
    note: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M7 4h10v16l-5-3-5 3z"/></svg>'
  };
  function icon(name) {
    return ICONS[name] || ICONS.music;
  }

  // src/ui/theme.css
  var theme_default = '/* 主题变量：只在插件根容器内生效 */\n.mp-root {\n  --mp-bg: #ffffff;\n  --mp-bg-2: #f7f7f9;\n  --mp-soft: #f2f3f5;\n  --mp-soft-2: #e9eaee;\n  --mp-line: #ededf0;\n  --mp-line-strong: #dfe0e4;\n  --mp-ink: #1b1c1f;\n  --mp-ink-2: #4f5259;\n  --mp-muted: #9299a3;\n  --mp-accent: #e14b4b;\n  --mp-accent-soft: rgba(225, 75, 75, 0.1);\n  --mp-on-accent: #ffffff;\n\n  --mp-r-lg: 16px;\n  --mp-r-md: 10px;\n  --mp-r-sm: 8px;\n  --mp-r-full: 999px;\n\n  --mp-shadow: 0 10px 30px rgba(17, 18, 20, 0.08);\n  --mp-font: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;\n}\n\n/* 主色调：与日夜模式正交，放在 dark 之后保证优先级 */\n.mp-root[data-accent="blue"] {\n  --mp-accent: #3b82f6;\n  --mp-accent-soft: rgba(59, 130, 246, 0.14);\n}\n\n.mp-root[data-accent="green"] {\n  --mp-accent: #2f9e44;\n  --mp-accent-soft: rgba(47, 158, 68, 0.14);\n}\n\n.mp-root[data-accent="purple"] {\n  --mp-accent: #8b5cf6;\n  --mp-accent-soft: rgba(139, 92, 246, 0.14);\n}\n\n.mp-root[data-accent="amber"] {\n  --mp-accent: #e8850c;\n  --mp-accent-soft: rgba(232, 133, 12, 0.16);\n}\n\n.mp-root[data-theme="dark"] {\n  --mp-bg: #141518;\n  --mp-bg-2: #1a1c20;\n  --mp-soft: #22242a;\n  --mp-soft-2: #2b2e35;\n  --mp-line: #262930;\n  --mp-line-strong: #34383f;\n  --mp-ink: #f1f2f4;\n  --mp-ink-2: #c3c7cd;\n  --mp-muted: #868c96;\n  --mp-accent: #f0645f;\n  --mp-accent-soft: rgba(240, 100, 95, 0.16);\n  --mp-on-accent: #ffffff;\n  --mp-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);\n}\n\n/* 深色下的主色调：提亮一点，避免压得太沉 */\n.mp-root[data-theme="dark"][data-accent="blue"] { --mp-accent: #6ba4ff; }\n.mp-root[data-theme="dark"][data-accent="green"] { --mp-accent: #4ec46a; }\n.mp-root[data-theme="dark"][data-accent="purple"] { --mp-accent: #a78bfa; }\n.mp-root[data-theme="dark"][data-accent="amber"] { --mp-accent: #ffb347; }\n.mp-root[data-theme="dark"][data-accent="red"] { --mp-accent: #f0645f; }\n';

  // src/ui/base.css
  var base_default = '/* 基础布局：全页无外壳，播放条与底栏固定在页面底部 */\n\n.mp-root,\n.mp-root * {\n  box-sizing: border-box;\n}\n\n/* 全屏：背景铺到屏幕边缘，再把安全区内边距加回自己的 header / 底栏 */\n.mp-root {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  width: calc(100% + env(safe-area-inset-left) + env(safe-area-inset-right));\n  height: calc(100% + env(safe-area-inset-top) + env(safe-area-inset-bottom));\n  margin: calc(0px - env(safe-area-inset-top)) calc(0px - env(safe-area-inset-right)) calc(0px - env(safe-area-inset-bottom)) calc(0px - env(safe-area-inset-left));\n  min-width: 0;\n  min-height: 0;\n  overflow: hidden;\n  background: var(--mp-bg);\n  color: var(--mp-ink);\n  font-family: var(--mp-font);\n  font-size: 14px;\n  line-height: 1.45;\n  -webkit-font-smoothing: antialiased;\n}\n\n.mp-root button {\n  font-family: inherit;\n  cursor: pointer;\n}\n\n.mp-root button:disabled {\n  opacity: 0.45;\n  cursor: default;\n}\n\n/* ---------- 页面骨架 ---------- */\n\n.mp-view-host {\n  flex: 1 1 auto;\n  min-height: 0;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n}\n\n.mp-view {\n  flex: 1 1 auto;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n}\n\n.mp-header {\n  flex: 0 0 auto;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: calc(14px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 8px max(16px, env(safe-area-inset-left));\n}\n\n.mp-header__title {\n  flex: 1 1 auto;\n  min-width: 0;\n  font-size: 21px;\n  font-weight: 700;\n  letter-spacing: -0.2px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-header__sub {\n  font-size: 12px;\n  color: var(--mp-muted);\n  font-weight: 400;\n}\n\n.mp-body {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow-y: auto;\n  overscroll-behavior: contain;\n  -webkit-overflow-scrolling: touch;\n  padding-bottom: 12px;\n}\n\n.mp-icon-btn {\n  flex: 0 0 auto;\n  width: 34px;\n  height: 34px;\n  display: grid;\n  place-items: center;\n  border: 0;\n  border-radius: var(--mp-r-full);\n  background: transparent;\n  color: var(--mp-ink-2);\n  padding: 0;\n}\n\n.mp-icon-btn:active {\n  background: var(--mp-soft);\n}\n\n.mp-icon-btn svg {\n  width: 21px;\n  height: 21px;\n}\n\n.mp-icon-btn.is-active {\n  color: var(--mp-accent);\n}\n\n/* ---------- 歌曲行 ---------- */\n\n.mp-row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 16px;\n  border: 0;\n  background: transparent;\n  width: 100%;\n  text-align: left;\n  color: inherit;\n}\n\n.mp-row:active {\n  background: var(--mp-soft);\n}\n\n.mp-row__cover {\n  flex: 0 0 auto;\n  width: 44px;\n  height: 44px;\n  border-radius: var(--mp-r-sm);\n  object-fit: cover;\n  background: var(--mp-soft-2);\n  display: grid;\n  place-items: center;\n  color: var(--mp-muted);\n  overflow: hidden;\n}\n\n.mp-row__cover svg {\n  width: 20px;\n  height: 20px;\n}\n\n.mp-row__cover img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  display: block;\n}\n\n.mp-row__main {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.mp-row__name {\n  font-size: 14.5px;\n  font-weight: 500;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-row.is-current .mp-row__name {\n  color: var(--mp-accent);\n}\n\n.mp-row.is-selected {\n  background: var(--mp-accent-soft);\n}\n\n.mp-row__check {\n  flex: 0 0 auto;\n  width: 20px;\n  height: 20px;\n  border-radius: 50%;\n  border: 1.5px solid var(--mp-line-strong);\n  display: grid;\n  place-items: center;\n  color: #fff;\n}\n\n.mp-row__check.is-on {\n  border-color: var(--mp-accent);\n  background: var(--mp-accent);\n}\n\n.mp-row__check svg {\n  width: 13px;\n  height: 13px;\n}\n\n.mp-select-bar {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 6px 16px 8px;\n}\n\n.mp-select-bar__count {\n  flex: 1 1 auto;\n  font-size: 12.5px;\n  color: var(--mp-muted);\n}\n\n.mp-row__sub {\n  margin-top: 2px;\n  font-size: 11.5px;\n  color: var(--mp-muted);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-row__tag {\n  display: inline-block;\n  margin-right: 5px;\n  padding: 0 5px;\n  border-radius: 4px;\n  background: var(--mp-soft);\n  color: var(--mp-muted);\n  font-size: 10px;\n  line-height: 15px;\n  vertical-align: 1px;\n}\n\n.mp-row__btn {\n  flex: 0 0 auto;\n  width: 32px;\n  height: 32px;\n  display: grid;\n  place-items: center;\n  border: 0;\n  border-radius: var(--mp-r-full);\n  background: transparent;\n  color: var(--mp-muted);\n}\n\n.mp-row__btn:active {\n  background: var(--mp-soft-2);\n}\n\n.mp-row__btn svg {\n  width: 19px;\n  height: 19px;\n}\n\n.mp-row__btn.is-active {\n  color: var(--mp-accent);\n}\n\n/* ---------- 迷你播放条 ---------- */\n\n.mp-player {\n  position: relative;\n  flex: 0 0 auto;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 9px 14px 10px;\n  border-top: 1px solid var(--mp-line);\n  background: var(--mp-bg);\n}\n\n.mp-player__bar {\n  position: absolute;\n  top: 0;\n  left: 0;\n  right: 0;\n  height: 2px;\n  background: var(--mp-line);\n  cursor: pointer;\n}\n\n.mp-player__bar i {\n  display: block;\n  height: 100%;\n  width: 0;\n  background: var(--mp-accent);\n}\n\n.mp-player__cover {\n  flex: 0 0 auto;\n  width: 40px;\n  height: 40px;\n  border-radius: var(--mp-r-sm);\n  background: var(--mp-soft-2);\n  display: grid;\n  place-items: center;\n  overflow: hidden;\n  color: var(--mp-muted);\n}\n\n.mp-player__cover svg {\n  width: 19px;\n  height: 19px;\n}\n\n.mp-player__cover img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  display: block;\n}\n\n.mp-player__main {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.mp-player__hit {\n  display: block;\n  border: 0;\n  background: transparent;\n  padding: 0;\n  text-align: left;\n  color: inherit;\n}\n\n.mp-player__name {\n  font-size: 13.5px;\n  font-weight: 500;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-player__sub {\n  font-size: 11px;\n  color: var(--mp-muted);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-player__play {\n  flex: 0 0 auto;\n  width: 36px;\n  height: 36px;\n  display: grid;\n  place-items: center;\n  border: 0;\n  border-radius: var(--mp-r-full);\n  background: transparent;\n  color: var(--mp-ink);\n}\n\n.mp-player__play svg {\n  width: 26px;\n  height: 26px;\n}\n\n/* ---------- 悬浮歌词 ---------- */\n\n.mp-float-lyric {\n  flex: 0 0 auto;\n  display: none;\n  margin: 0 10px 6px;\n  padding: 5px 12px;\n  border-radius: var(--mp-r-sm);\n  background: var(--mp-bg-2);\n  font-size: 11.5px;\n  line-height: 1.5;\n  color: var(--mp-ink-2);\n  text-align: center;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.mp-float-lyric.is-fresh {\n  animation: mp-lyric-in 0.28s ease-out;\n}\n\n@keyframes mp-lyric-in {\n  from { opacity: 0.25; transform: translateY(3px); }\n  to { opacity: 1; transform: none; }\n}\n\n/* 键盘弹出时把播放条、悬浮歌词、底栏全部让出去，屏幕留给搜索结果 */\n.mp-root.is-keyboard .mp-player,\n.mp-root.is-keyboard .mp-float-lyric,\n.mp-root.is-keyboard .mp-dock {\n  display: none !important;\n}\n\n/* ---------- 四按钮底栏 ---------- */\n\n.mp-dock {\n  flex: 0 0 auto;\n  display: flex;\n  align-items: stretch;\n  border-top: 1px solid var(--mp-line);\n  background: var(--mp-bg);\n  padding: 4px 2px calc(4px + env(safe-area-inset-bottom));\n}\n\n.mp-dock__btn {\n  flex: 1 1 0;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 2px;\n  padding: 5px 0 3px;\n  border: 0;\n  background: transparent;\n  color: var(--mp-muted);\n  font-size: 10.5px;\n  line-height: 1.2;\n}\n\n.mp-dock__btn svg {\n  width: 22px;\n  height: 22px;\n}\n\n.mp-dock__btn.is-active {\n  color: var(--mp-accent);\n}\n\n/* ---------- 底部弹层（挂在插件根内） ---------- */\n\n.mp-mask {\n  position: absolute;\n  inset: 0;\n  z-index: 40;\n  display: flex;\n  align-items: flex-end;\n  background: rgba(0, 0, 0, 0.35);\n}\n\n.mp-sheet {\n  width: 100%;\n  max-height: 74%;\n  display: flex;\n  flex-direction: column;\n  background: var(--mp-bg);\n  border-radius: var(--mp-r-lg) var(--mp-r-lg) 0 0;\n  padding-bottom: calc(6px + env(safe-area-inset-bottom));\n  animation: mp-rise 0.18s ease-out;\n}\n\n@keyframes mp-rise {\n  from { transform: translateY(12px); opacity: 0.6; }\n  to { transform: translateY(0); opacity: 1; }\n}\n\n.mp-sheet__head {\n  flex: 0 0 auto;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 14px 16px 8px;\n}\n\n.mp-sheet__title {\n  flex: 1 1 auto;\n  min-width: 0;\n  font-size: 14px;\n  font-weight: 600;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-sheet__body {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow-y: auto;\n  padding-bottom: 6px;\n}\n\n.mp-sheet__item {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  width: 100%;\n  padding: 12px 16px;\n  border: 0;\n  background: transparent;\n  color: var(--mp-ink);\n  font-size: 14.5px;\n  text-align: left;\n}\n\n.mp-sheet__item:active {\n  background: var(--mp-soft);\n}\n\n.mp-sheet__item svg {\n  width: 19px;\n  height: 19px;\n  color: var(--mp-muted);\n}\n\n.mp-editor {\n  display: block;\n  width: calc(100% - 32px);\n  margin: 4px 16px 10px;\n  min-height: 150px;\n  padding: 12px;\n  border: 1px solid var(--mp-line-strong);\n  border-radius: var(--mp-r-md);\n  background: var(--mp-bg-2);\n  color: var(--mp-ink);\n  font-family: inherit;\n  font-size: 13px;\n  line-height: 1.65;\n  resize: vertical;\n  outline: none;\n}\n\n.mp-editor:focus {\n  border-color: var(--mp-accent);\n}\n\n.mp-sheet__label {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-sheet__x {\n  flex: 0 0 auto;\n  width: 28px;\n  height: 28px;\n  display: grid;\n  place-items: center;\n  border: 0;\n  border-radius: 50%;\n  background: transparent;\n  color: var(--mp-muted);\n  padding: 0;\n}\n\n.mp-sheet__x:active {\n  background: var(--mp-soft-2);\n}\n\n.mp-sheet__x svg {\n  width: 15px;\n  height: 15px;\n}\n\n.mp-sheet__item.is-danger {\n  color: var(--mp-accent);\n}\n\n/* ---------- 聊天卡片（宿主只给内容区，这里不造气泡） ---------- */\n\n.mp-card {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 9px 11px;\n  border-radius: 12px;\n  background: var(--mp-bg, #fff);\n  color: var(--mp-ink, #1b1c1f);\n  border: 1px solid var(--mp-line, #ededf0);\n  /* 固定宽度：不随歌名 / 歌手长短变化 */\n  width: 252px;\n  min-width: 0;\n  box-sizing: border-box;\n  max-width: 100%;\n  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;\n}\n\n.mp-card__main {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.mp-card__act {\n  flex: 0 0 auto;\n  white-space: nowrap;\n}\n\n.mp-card__cover {\n  flex: 0 0 auto;\n  width: 40px;\n  height: 40px;\n  border-radius: 8px;\n  background: var(--mp-soft-2, #e9eaee);\n  display: grid;\n  place-items: center;\n  color: #9299a3;\n  overflow: hidden;\n}\n\n.mp-card__cover svg {\n  width: 20px;\n  height: 20px;\n}\n\n.mp-card__cover img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  display: block;\n}\n\n.mp-card__main {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.mp-card__name {\n  font-size: 13.5px;\n  font-weight: 600;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-card__sub {\n  margin-top: 1px;\n  font-size: 11px;\n  color: #9299a3;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-card__act {\n  flex: 0 0 auto;\n  border: 0;\n  background: rgba(225, 75, 75, 0.1);\n  color: #e14b4b;\n  font-size: 12px;\n  font-weight: 600;\n  padding: 6px 11px;\n  border-radius: 999px;\n}\n\n/* ---------- 独立弹层（聊天 + 面板里用，只能挂 body） ---------- */\n\n.mp-modal {\n  position: fixed;\n  inset: 0;\n  z-index: 9999;\n  display: flex;\n  align-items: flex-end;\n  justify-content: center;\n  background: rgba(0, 0, 0, 0.4);\n  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;\n}\n\n.mp-modal__panel {\n  width: 100%;\n  max-width: 480px;\n  max-height: 76vh;\n  display: flex;\n  flex-direction: column;\n  background: #fff;\n  color: #1b1c1f;\n  border-radius: 18px 18px 0 0;\n  padding-bottom: calc(8px + env(safe-area-inset-bottom));\n  overflow: hidden;\n}\n\n.mp-modal__head {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 14px 16px 10px;\n  border-bottom: 1px solid #ededf0;\n}\n\n.mp-modal__title {\n  flex: 1 1 auto;\n  font-size: 15px;\n  font-weight: 700;\n}\n\n.mp-modal__input {\n  flex: 1 1 auto;\n  min-width: 0;\n  border: 0;\n  outline: none;\n  font-size: 14.5px;\n  background: transparent;\n  color: inherit;\n}\n\n.mp-modal__body {\n  flex: 1 1 auto;\n  min-height: 120px;\n  max-height: 56vh;\n  overflow-y: auto;\n}\n\n.mp-modal__row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  width: 100%;\n  padding: 10px 16px;\n  border: 0;\n  background: transparent;\n  color: inherit;\n  text-align: left;\n  font-size: 14px;\n}\n\n.mp-modal__row:active {\n  background: #f2f3f5;\n}\n\n.mp-modal__row span {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-modal__hint {\n  padding: 14px 16px;\n  font-size: 12.5px;\n  color: #9299a3;\n  text-align: center;\n}\n\n/* ---------- 聊天里的「一起听」面板 ---------- */\n\n.mp-listen {\n  max-height: 68vh;\n}\n\n.mp-listen__now {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 10px 16px 14px;\n}\n\n.mp-listen__cover {\n  flex: 0 0 auto;\n  width: 52px;\n  height: 52px;\n  border-radius: 12px;\n  background: #eef0f3;\n  display: grid;\n  place-items: center;\n  color: #9299a3;\n  overflow: hidden;\n}\n\n.mp-listen__cover img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  display: block;\n}\n\n.mp-listen__cover svg {\n  width: 20px;\n  height: 20px;\n}\n\n.mp-listen__meta {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.mp-listen__name {\n  font-size: 14px;\n  font-weight: 600;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-listen__artist {\n  font-size: 11.5px;\n  color: #9299a3;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-listen__ctrl {\n  flex: 0 0 auto;\n  display: flex;\n  align-items: center;\n  gap: 2px;\n}\n\n.mp-listen__btn {\n  width: 36px;\n  height: 36px;\n  display: grid;\n  place-items: center;\n  border: 0;\n  background: transparent;\n  color: #1b1c1f;\n  padding: 0;\n}\n\n.mp-listen__btn svg {\n  width: 22px;\n  height: 22px;\n}\n\n.mp-listen__list {\n  flex: 1 1 auto;\n  min-height: 120px;\n  max-height: 32vh;\n  overflow-y: auto;\n  border-top: 1px solid #ededf0;\n}\n\n.mp-listen__sub {\n  /* 固定宽度 + 右对齐，多行列表里歌手名才能对齐成一条线 */\n  flex: 0 0 auto;\n  width: 42%;\n  text-align: right;\n  font-size: 11.5px;\n  color: #9299a3;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-modal__row.is-active span:first-child {\n  color: #e14b4b;\n  font-weight: 600;\n}\n\n.mp-listen__searchicon {\n  display: grid;\n  place-items: center;\n  color: #9299a3;\n}\n\n.mp-listen__searchicon svg {\n  width: 16px;\n  height: 16px;\n}\n\n.mp-listen__foot {\n  flex: 0 0 auto;\n  display: flex;\n  align-items: center;\n  padding: 6px 16px;\n  border-top: 1px solid #ededf0;\n}\n\n.mp-listen__open {\n  flex: 1 1 auto;\n  border: 0;\n  background: transparent;\n  color: #6b7280;\n  font-size: 12.5px;\n  padding: 8px 0;\n}\n\n.mp-listen__stop {\n  flex: 0 0 auto;\n  border: 0;\n  background: transparent;\n  color: #d5544e;\n  font-size: 12.5px;\n  padding: 8px 0 8px 14px;\n}\n\n.mp-listen__tabs {\n  display: flex;\n  gap: 10px;\n  padding: 2px 16px 10px;\n}\n\n.mp-listen__tab {\n  flex: 1 1 0;\n  padding: 8px 0;\n  border: 0;\n  border-radius: 999px;\n  background: #f2f3f5;\n  color: #6b7280;\n  font-size: 13px;\n}\n\n.mp-listen__tab.is-active {\n  background: #ffeceb;\n  color: #e14b4b;\n  font-weight: 600;\n}\n';

  // src/ui/views.css
  var views_default = `/* 各页面专属样式 */

/* ---------- 搜索 ---------- */

.mp-search {
  flex: 0 0 auto;
  padding: 0 16px 8px;
}

.mp-search__box {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 12px;
  border-radius: var(--mp-r-full);
  background: var(--mp-soft);
  color: var(--mp-muted);
}

.mp-search__box svg {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
}

.mp-search__input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--mp-ink);
  font-size: 14px;
  -webkit-appearance: none;
  appearance: none;
}

/* 去掉 WebView 自带的搜索框装饰（那个多余的 × 和小图标） */
.mp-search__input::-webkit-search-cancel-button,
.mp-search__input::-webkit-search-decoration,
.mp-search__input::-webkit-search-results-button {
  -webkit-appearance: none;
  display: none;
}

.mp-search__clear {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: var(--mp-soft-2);
  color: var(--mp-muted);
  padding: 0;
}

.mp-search__clear svg {
  width: 12px;
  height: 12px;
}

.mp-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 6px 16px 2px;
  scrollbar-width: none;
}

.mp-chips::-webkit-scrollbar {
  display: none;
}

.mp-chip {
  flex: 0 0 auto;
  border: 1px solid var(--mp-line-strong);
  background: transparent;
  color: var(--mp-ink-2);
  border-radius: var(--mp-r-full);
  padding: 4px 12px;
  font-size: 12.5px;
}

.mp-chip.is-active {
  border-color: transparent;
  background: var(--mp-accent-soft);
  color: var(--mp-accent);
  font-weight: 600;
}

/* ---------- 通用段落 ---------- */

.mp-section {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--mp-muted);
}

.mp-section__act {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--mp-muted);
  font-size: 12px;
  font-weight: 400;
  padding: 2px 0;
}

/* ---------- 搜索推荐 ---------- */

.mp-rec {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 2px 16px 10px;
}

.mp-rec-chip {
  border: 1px solid var(--mp-line-strong);
  background: transparent;
  color: var(--mp-ink-2);
  border-radius: var(--mp-r-full);
  padding: 6px 13px;
  font-size: 13px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-rec-chip:active {
  background: var(--mp-soft);
}

.mp-rec__hint {
  padding: 0 16px 8px;
  font-size: 11.5px;
  color: var(--mp-muted);
}

.mp-rec__foot {
  padding-top: 8px;
  padding-bottom: 4px;
}

.mp-hint {
  padding: 22px 24px;
  text-align: center;
  font-size: 12.5px;
  color: var(--mp-muted);
  line-height: 1.7;
}

.mp-error {
  margin: 8px 16px;
  padding: 9px 12px;
  border-radius: var(--mp-r-md);
  background: var(--mp-accent-soft);
  color: var(--mp-accent);
  font-size: 12px;
}

/* ---------- 歌单列表 ---------- */

.mp-list {
  padding: 4px 10px 8px;
}

.mp-pl {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 9px 6px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  border-radius: var(--mp-r-md);
}

.mp-pl:active {
  background: var(--mp-soft);
}

.mp-pl__cover {
  flex: 0 0 auto;
  width: 54px;
  height: 54px;
  border-radius: var(--mp-r-md);
  background: linear-gradient(135deg, var(--mp-soft-2), var(--mp-soft));
  display: grid;
  place-items: center;
  color: var(--mp-muted);
  overflow: hidden;
}

.mp-pl__cover svg {
  width: 22px;
  height: 22px;
}

.mp-pl__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mp-pl__main {
  flex: 1 1 auto;
  min-width: 0;
}

.mp-pl__name {
  font-size: 14.5px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-pl__sub {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--mp-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- 歌单详情 / 收藏 顶部操作 ---------- */

.mp-actions {
  display: flex;
  gap: 10px;
  padding: 4px 16px 10px;
}

.mp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  border-radius: var(--mp-r-full);
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 600;
  background: var(--mp-soft);
  color: var(--mp-ink);
  /* 在设置行里被压缩时不要变成竖排文字 */
  flex: 0 0 auto;
  white-space: nowrap;
  writing-mode: horizontal-tb;
  min-width: 68px;
}

.mp-btn svg {
  width: 16px;
  height: 16px;
}

.mp-btn--primary {
  background: var(--mp-accent);
  color: var(--mp-on-accent);
}

.mp-btn--ghost {
  background: transparent;
  border: 1px solid var(--mp-line-strong);
  color: var(--mp-ink-2);
  font-weight: 500;
}

.mp-actions .mp-btn {
  flex: 1 1 0;
}

.mp-field__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

/* 网易云扫码登录弹层 */
.mp-qr {
  padding-bottom: 18px;
}

.mp-qr__img {
  display: block;
  width: 200px;
  height: 200px;
  margin: 10px auto 6px;
  border-radius: 12px;
  background: #fff;
  object-fit: contain;
}

.mp-qr__tip {
  padding: 4px 20px 0;
  text-align: center;
  font-size: 12.5px;
  color: #9299a3;
  line-height: 1.6;
}

/* ---------- 正在播放页 ---------- */

.mp-now {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: calc(4px + env(safe-area-inset-top)) 26px calc(18px + env(safe-area-inset-bottom));
  overflow: hidden;
}

.mp-now__head {
  flex: 0 0 auto;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0 8px;
}

.mp-now__from {
  flex: 1 1 auto;
  text-align: center;
  font-size: 12px;
  color: var(--mp-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-now__stage {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mp-now__cover {
  flex: 0 0 auto;
  width: min(76vw, 300px);
  height: min(76vw, 300px);
  margin: auto 0;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--mp-soft-2), var(--mp-soft));
  display: grid;
  place-items: center;
  color: var(--mp-muted);
  overflow: hidden;
  box-shadow: var(--mp-shadow);
}

.mp-now__cover svg {
  width: 54px;
  height: 54px;
}

.mp-now__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mp-now__meta {
  flex: 0 0 auto;
  width: 100%;
  text-align: center;
  margin-top: 18px;
}

.mp-now__name {
  font-size: 18px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-now__artist {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--mp-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-now__progress {
  flex: 0 0 auto;
  width: 100%;
  margin-top: 16px;
}

.mp-now__track {
  height: 4px;
  border-radius: 999px;
  background: var(--mp-soft-2);
  cursor: pointer;
  position: relative;
}

.mp-now__track i {
  display: block;
  height: 100%;
  width: 0;
  border-radius: 999px;
  background: var(--mp-accent);
}

.mp-now__times {
  display: flex;
  justify-content: space-between;
  margin-top: 5px;
  font-size: 11px;
  color: var(--mp-muted);
  font-variant-numeric: tabular-nums;
}

.mp-now__ctrl {
  flex: 0 0 auto;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
}

.mp-now__ctrl .mp-icon-btn {
  width: 42px;
  height: 42px;
}

.mp-now__ctrl .mp-icon-btn svg {
  width: 23px;
  height: 23px;
}

.mp-now__play {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: var(--mp-ink);
  color: var(--mp-bg);
}

.mp-now__play svg {
  width: 28px;
  height: 28px;
}

.mp-now__extras {
  flex: 0 0 auto;
  width: 100%;
  display: flex;
  justify-content: space-around;
  margin-top: 14px;
  padding-bottom: 4px;
}

/* 正在播放：滚动歌词 */

.mp-now__lyric {
  flex: 1 1 auto;
  align-self: stretch;
  min-height: 0;
  width: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  text-align: center;
  padding: 4px 0 8px;
  scrollbar-width: none;
}

.mp-now__lyric::-webkit-scrollbar {
  display: none;
}

.mp-lyric__line {
  padding: 7px 10px;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--mp-muted);
  transition: color 0.15s, transform 0.15s, opacity 0.15s;
  opacity: 0.7;
}

.mp-lyric__line.is-active {
  color: var(--mp-accent);
  font-weight: 600;
  opacity: 1;
  transform: scale(1.05);
}

.mp-lyric__empty {
  padding: 46px 24px;
  font-size: 12.5px;
  color: var(--mp-muted);
  line-height: 1.8;
}

/* ---------- 设置 ---------- */

.mp-group {
  margin: 6px 16px 14px;
  border-radius: var(--mp-r-md);
  background: var(--mp-bg-2);
  overflow: hidden;
}

.mp-group__title {
  padding: 12px 14px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mp-muted);
}

.mp-field {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-top: 1px solid var(--mp-line);
}

/* 控件比较宽（比如三个按钮）时用它：标题和说明占一行，控件单独一行 */
.mp-field--stack {
  display: block;
}

.mp-field--stack .mp-field__label {
  margin-bottom: 9px;
}

/* 右侧控件永远不被压扁 */
.mp-field > .mp-btn,
.mp-field > .mp-switch,
.mp-field > .mp-field__value,
.mp-field > .mp-dots,
.mp-field > .mp-theme-row {
  flex: 0 0 auto;
  margin-left: auto;
}

/* 开关行：标题+说明占左侧，开关垂直居中靠右（原生设置页的常规布局） */
.mp-field > .mp-switch {
  align-self: center;
}

.mp-group__title + .mp-field {
  border-top: 0;
}

.mp-field__label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 14px;
}

.mp-field__desc {
  margin-top: 2px;
  font-size: 11px;
  color: var(--mp-muted);
  line-height: 1.5;
}

.mp-field__value {
  flex: 0 0 auto;
  font-size: 13px;
  color: var(--mp-muted);
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-input {
  flex: 0 0 auto;
  width: 55%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--mp-ink);
  font-size: 13px;
  text-align: right;
}

.mp-switch {
  flex: 0 0 auto;
  width: 46px;
  height: 27px;
  border-radius: 999px;
  border: 0;
  background: var(--mp-soft-2);
  position: relative;
  transition: background 0.15s;
  padding: 0;
}

.mp-switch::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s;
}

.mp-switch.is-on {
  background: var(--mp-accent);
}

.mp-switch.is-on::after {
  transform: translateX(19px);
}

.mp-select {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--mp-muted);
  font-size: 13px;
  text-align: right;
  outline: none;
}

.mp-slider {
  flex: 0 0 auto;
  width: 55%;
  accent-color: var(--mp-accent);
}

/* ---------- TA 页：按角色的动态流 ---------- */

.mp-ta-block {
  padding: 16px 16px 6px;
}

.mp-ta-block + .mp-ta-block {
  padding-top: 6px;
}

.mp-ta-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.mp-ta-head__avatar {
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: var(--mp-accent-soft, rgba(225, 75, 75, 0.14));
  color: var(--mp-accent);
  font-size: 15px;
  font-weight: 600;
}

.mp-ta-head__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mp-ta-head__name {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--mp-ink);
  line-height: 1.3;
}

.mp-ta-head__stat {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--mp-ink-2);
}

/* 歌单横滑条 */
.mp-ta-strip {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
  margin-bottom: 10px;
  scrollbar-width: none;
}

.mp-ta-strip::-webkit-scrollbar {
  display: none;
}

.mp-ta-pl {
  flex: 0 0 auto;
  width: 104px;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
}

.mp-ta-pl__cover {
  width: 104px;
  height: 104px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--mp-bg-2);
}

.mp-ta-pl__name {
  margin-top: 6px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--mp-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-ta-pl__sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--mp-ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 评价气泡：左侧主题色竖线做引用标识 */
.mp-ta-quote {
  position: relative;
  margin: 0 0 10px;
  padding: 10px 12px 10px 14px;
  border-radius: 12px;
  background: var(--mp-bg-2);
  border: 1px solid var(--mp-line);
}

.mp-ta-quote::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 2px;
  background: var(--mp-accent);
}

.mp-ta-quote__song {
  margin-bottom: 4px;
  font-size: 11.5px;
  color: var(--mp-ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-ta-quote__artist {
  opacity: 0.85;
}

.mp-ta-quote__text {
  font-size: 13px;
  line-height: 1.65;
  color: var(--mp-ink);
  word-break: break-word;
}

.mp-ta-quote__text b {
  color: var(--mp-accent);
  font-weight: 700;
}

/* ---------- 推荐页 ---------- */

.mp-rec__hello {
  padding: 2px 16px 12px;
  font-size: 12.5px;
  color: var(--mp-ink-2);
}

.mp-rec__card {
  display: flex;
  gap: 14px;
  margin: 0 16px 14px;
  padding: 14px;
  border-radius: 14px;
  background: var(--mp-bg-2);
  border: 1px solid var(--mp-line);
}

.mp-rec__mosaic {
  flex: 0 0 auto;
  width: 92px;
  height: 92px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 2px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--mp-line);
}

.mp-rec__tile {
  overflow: hidden;
  background: var(--mp-bg);
}

.mp-rec__tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mp-rec__info {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.mp-rec__label {
  font-size: 11px;
  color: var(--mp-accent);
  letter-spacing: 0.4px;
}

.mp-rec__name {
  margin-top: 3px;
  font-size: 16px;
  font-weight: 600;
  color: var(--mp-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-rec__meta {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--mp-ink-2);
}

.mp-rec__actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}

.mp-rec__play {
  padding: 6px 14px;
  border: 0;
  border-radius: 999px;
  background: var(--mp-accent);
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
}

.mp-rec__refresh {
  padding: 6px 12px;
  border: 1px solid var(--mp-line);
  border-radius: 999px;
  background: transparent;
  color: var(--mp-ink-2);
  font-size: 12.5px;
}

.mp-rec__hint {
  margin: -4px 16px 12px;
  font-size: 11.5px;
  color: var(--mp-ink-2);
}

.mp-rec__list {
  padding-bottom: 6px;
}

.mp-rec__row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 16px;
  border: 0;
  background: transparent;
  text-align: left;
}

.mp-rec__row:active {
  background: var(--mp-bg-2);
}

.mp-rec__rowcover {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--mp-bg-2);
}

.mp-rec__rowcover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mp-rec__rowmain {
  flex: 1 1 auto;
  min-width: 0;
}

.mp-rec__rowname {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--mp-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-rec__rowsub {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--mp-ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-rec__rank,
.mp-rank-entry {
  display: block;
  width: calc(100% - 32px);
  margin: 10px 16px 16px;
  padding: 12px 14px;
  border: 1px solid var(--mp-line);
  border-radius: 14px;
  background: var(--mp-bg-2);
  text-align: left;
}

.mp-rec__rankname,
.mp-rank-entry__name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--mp-ink);
}

.mp-rec__ranksub,
.mp-rank-entry__sub {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--mp-ink-2);
}

.mp-rank-entry-wrap {
  padding-bottom: 12px;
}

/* 搜索页：进入即展示的榜单网格 */
.mp-rank {
  padding-bottom: 16px;
}

.mp-rank__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 12px;
  padding: 8px 16px 0;
}

.mp-rank__card {
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
}

.mp-rank__cover {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 12px;
  overflow: hidden;
  background: var(--mp-bg-2);
}

.mp-rank__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mp-rank__count {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 10.5px;
}

.mp-rank__name {
  margin-top: 6px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--mp-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-rank__card.is-skeleton .is-skeleton,
.mp-rank__cover.is-skeleton {
  background: linear-gradient(90deg, var(--mp-bg-2) 25%, var(--mp-line) 37%, var(--mp-bg-2) 63%);
  background-size: 400% 100%;
  animation: mp-skeleton 1.2s ease infinite;
}

@keyframes mp-skeleton {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

.mp-rank__retry {
  display: block;
  width: calc(100% - 32px);
  margin: 8px 16px 0;
  padding: 12px;
  border: 1px dashed var(--mp-line-strong, var(--mp-line));
  border-radius: 12px;
  background: transparent;
  color: var(--mp-ink-2);
  font-size: 12.5px;
}

/* ---------- 推荐偏好面板 ---------- */

.mp-prefs__sheet {
  max-height: 82vh;
}

.mp-prefs {
  overflow-y: auto;
}

.mp-prefs__head {
  padding: 4px 16px 12px;
}

.mp-prefs__title {
  margin-bottom: 8px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--mp-ink);
}

.mp-prefs__modes {
  width: 100%;
}

.mp-prefs__hint {
  padding: 0 16px 10px;
  font-size: 11.5px;
  color: var(--mp-ink-2);
  line-height: 1.5;
}

.mp-prefs__item {
  padding: 10px 16px 12px;
  border-top: 1px solid var(--mp-line);
}

.mp-prefs__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mp-prefs__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--mp-ink);
}

.mp-prefs__weight {
  font-size: 11.5px;
  color: var(--mp-accent);
  font-weight: 600;
}

.mp-prefs__tag {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--mp-bg);
  color: var(--mp-ink-2);
  font-size: 10.5px;
}

.mp-prefs__slider {
  width: 100%;
  margin: 8px 0 6px;
  appearance: none;
  height: 3px;
  border-radius: 2px;
  background: var(--mp-line);
  outline: none;
}

.mp-prefs__slider::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--mp-accent);
  border: 2px solid var(--mp-bg-2);
}

.mp-prefs__foot {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mp-prefs__prompt {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11.5px;
  color: var(--mp-ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-prefs__edit,
.mp-prefs__del {
  flex: 0 0 auto;
  padding: 4px 10px;
  border: 1px solid var(--mp-line);
  border-radius: 999px;
  background: transparent;
  color: var(--mp-ink-2);
  font-size: 11.5px;
}

.mp-prefs__del {
  color: #d5544e;
  border-color: rgba(213, 84, 78, 0.4);
}

.mp-prefs__add {
  width: calc(100% - 32px);
  margin: 12px 16px 18px;
  padding: 10px;
  border: 1px dashed var(--mp-line-strong, var(--mp-line));
  border-radius: 12px;
  background: transparent;
  color: var(--mp-ink-2);
  font-size: 12.5px;
}

.mp-theme-row {
  display: flex;
  gap: 8px;
  padding: 11px 14px;
}

.mp-theme-btn {
  flex: 1 1 0;
  padding: 8px 2px;
  border-radius: var(--mp-r-sm);
  border: 1px solid var(--mp-line-strong);
  background: transparent;
  color: var(--mp-ink-2);
  font-size: 12.5px;
  white-space: nowrap;
}

.mp-theme-btn.is-active {
  border-color: transparent;
  background: var(--mp-accent-soft);
  color: var(--mp-accent);
  font-weight: 600;
}

.mp-dots {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mp-dot--custom {
  position: relative;
  overflow: hidden;
}

.mp-dot--custom .mp-color {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
}

.mp-color {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
  -webkit-appearance: none;
  appearance: none;
  overflow: hidden;
}

.mp-color::-webkit-color-swatch-wrapper {
  padding: 0;
}

.mp-color::-webkit-color-swatch {
  border: 0;
  border-radius: 50%;
}

.mp-dot {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid transparent;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}

.mp-dot.is-active {
  border-color: var(--mp-ink);
}

.mp-about {
  padding: 6px 24px 28px;
  text-align: center;
  font-size: 11.5px;
  color: var(--mp-muted);
  line-height: 1.8;
}
`;

  // src/ui/style.js
  var STYLE_ID = "music-player-style";
  var CSS = [theme_default, base_default, views_default].join("\n");
  function ensureStyle() {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  function removeStyleIfUnused() {
    if (typeof document === "undefined") return;
    if (document.querySelector(".mp-root, .mp-card, .mp-modal")) return;
    var style = document.getElementById(STYLE_ID);
    if (style && style.parentNode) style.parentNode.removeChild(style);
  }
  function watchTheme(root) {
    if (typeof window === "undefined" || !window.matchMedia) return function() {
    };
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    function apply() {
      if (root) root.dataset.theme = mq.matches ? "dark" : "light";
    }
    apply();
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else if (mq.addListener) mq.addListener(apply);
    return function() {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else if (mq.removeListener) mq.removeListener(apply);
    };
  }

  // src/ui/components.js
  function pageTitle(text, onExit) {
    var el = h("div", { class: "mp-header__title", text });
    if (onExit) {
      el.setAttribute("title", "点击退出");
      el.addEventListener("click", function() {
        onExit();
      });
    }
    return el;
  }
  function iconBtn(name, opts) {
    var o = opts || {};
    var btn = h("button", {
      class: "mp-icon-btn" + (o.active ? " is-active" : ""),
      type: "button",
      "aria-label": o.label || name
    }, [h("span", { html: icon(name) })]);
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      if (o.onClick) o.onClick(e);
    });
    return btn;
  }
  function coverNode(url, cls) {
    var box = h("div", { class: cls || "mp-row__cover" });
    fillCover(box, url);
    return box;
  }
  function fillCover(box, url) {
    if (!box) return;
    clear(box);
    if (url) {
      var img = h("img", { src: url, alt: "", loading: "lazy" });
      img.addEventListener("error", function() {
        clear(box);
        box.innerHTML = icon("music");
      });
      box.appendChild(img);
    } else {
      box.innerHTML = icon("music");
    }
  }
  function songRow(opts) {
    var track = opts.track;
    var row = h("div", {
      class: "mp-row" + (opts.current ? " is-current" : "") + (opts.selected ? " is-selected" : "")
    });
    if (opts.selectable) {
      row.appendChild(h("span", {
        class: "mp-row__check" + (opts.selected ? " is-on" : ""),
        html: opts.selected ? icon("check") : ""
      }));
    }
    var cover = coverNode(opts.coverUrl, "mp-row__cover");
    if (opts.coverKey) cover.dataset.cover = opts.coverKey;
    var sub = h("div", { class: "mp-row__sub" });
    if (opts.tag) sub.appendChild(h("span", { class: "mp-row__tag", text: opts.tag }));
    sub.appendChild(document.createTextNode(track.artist + (track.album ? " · " + track.album : "")));
    var main = h("div", { class: "mp-row__main" }, [
      h("div", { class: "mp-row__name", text: track.name }),
      sub
    ]);
    var playBtn = h("button", {
      class: "mp-row__btn" + (opts.current ? " is-active" : ""),
      type: "button",
      "aria-label": "播放"
    }, [h("span", { html: icon(opts.current && opts.playing ? "pause" : "play") })]);
    playBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      opts.onPlay();
    });
    row.appendChild(cover);
    row.appendChild(main);
    row.appendChild(playBtn);
    if (opts.onMore) {
      var more = h(
        "button",
        { class: "mp-row__btn", type: "button", "aria-label": "更多" },
        [h("span", { html: icon("more") })]
      );
      more.addEventListener("click", function(e) {
        e.stopPropagation();
        opts.onMore();
      });
      row.appendChild(more);
    }
    row.addEventListener("click", function() {
      opts.onPlay(row);
    });
    return row;
  }
  function emptyHint(title, sub) {
    return h("div", { class: "mp-hint" }, [
      h("div", { text: title }),
      sub ? h("div", { text: sub }) : null
    ]);
  }
  function openSheet(rootEl, opts) {
    var o = opts || {};
    var mask = h("div", { class: "mp-mask" });
    var body = h("div", { class: "mp-sheet__body" });
    var titleEl = h("div", { class: "mp-sheet__title", text: typeof o.title === "string" ? o.title : "" });
    function close() {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
    }
    function currentItems() {
      return typeof o.items === "function" ? o.items() || [] : o.items || [];
    }
    function renderItems() {
      body.replaceChildren();
      if (typeof o.title === "function") titleEl.textContent = o.title() || "";
      var items = currentItems();
      items.forEach(function(item) {
        var row = h("div", {
          class: "mp-sheet__item" + (item.danger ? " is-danger" : ""),
          role: "button",
          tabindex: "0"
        }, [
          h("span", { html: icon(item.icon || "music") }),
          h("span", { class: "mp-sheet__label", text: item.label }),
          item.hint ? h("span", { class: "mp-field__value", text: item.hint }) : null
        ]);
        row.addEventListener("click", function() {
          close();
          if (item.onClick) item.onClick();
        });
        if (item.onRemove) {
          var remove = h(
            "button",
            { class: "mp-sheet__x", type: "button", "aria-label": "移除" },
            [h("span", { html: icon("close") })]
          );
          remove.addEventListener("click", function(e) {
            e.stopPropagation();
            if (item.onRemove) item.onRemove();
            renderItems();
          });
          row.appendChild(remove);
        }
        body.appendChild(row);
      });
      if (!items.length) {
        body.appendChild(h("div", { class: "mp-hint", text: o.empty || "这里还没有内容" }));
      }
    }
    renderItems();
    var sheet = h("div", { class: "mp-sheet" }, [
      h("div", { class: "mp-sheet__head" }, [
        titleEl,
        iconBtn("close", { label: "关闭", onClick: close })
      ]),
      body
    ]);
    mask.addEventListener("click", function(e) {
      if (e.target === mask) close();
    });
    mask.appendChild(sheet);
    rootEl.appendChild(mask);
    close.refresh = renderItems;
    return close;
  }
  function openEditor(rootEl, opts) {
    var o = opts || {};
    var area = h("textarea", {
      class: "mp-editor",
      placeholder: o.placeholder || "",
      rows: "8"
    });
    area.value = o.value || "";
    var mask = h("div", { class: "mp-mask" });
    var body = h("div", { class: "mp-sheet__body" }, [area]);
    function close() {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
    }
    function submit() {
      close();
      if (o.onSubmit) o.onSubmit(area.value);
    }
    var okBtn = h("button", { class: "mp-btn mp-btn--primary", type: "button", text: "保存" });
    okBtn.addEventListener("click", submit);
    var resetBtn = h("button", { class: "mp-btn mp-btn--ghost", type: "button", text: "恢复默认" });
    resetBtn.addEventListener("click", function() {
      if (o.onReset) o.onReset();
      area.value = o.defaultValue || "";
      area.focus();
    });
    var sheet = h("div", { class: "mp-sheet" }, [
      h("div", { class: "mp-sheet__head" }, [
        h("div", { class: "mp-sheet__title", text: o.title || "编辑" }),
        okBtn,
        iconBtn("close", { label: "关闭", onClick: close })
      ]),
      body,
      h("div", { class: "mp-field" }, [resetBtn])
    ]);
    mask.addEventListener("click", function(e) {
      if (e.target === mask) close();
    });
    mask.appendChild(sheet);
    rootEl.appendChild(mask);
    setTimeout(function() {
      area.focus();
    }, 30);
    return close;
  }
  function openPrompt(rootEl, opts) {
    var o = opts || {};
    var value = o.value || "";
    var input = h("input", {
      class: "mp-modal__input",
      type: "text",
      placeholder: o.placeholder || "",
      value,
      maxlength: "40"
    });
    var mask = h("div", { class: "mp-mask" });
    var body = h("div", { class: "mp-sheet__body" }, [
      h("div", { class: "mp-field" }, [input])
    ]);
    function close() {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
    }
    function submit() {
      var text = String(input.value || "").trim();
      if (!text) {
        input.focus();
        return;
      }
      close();
      if (o.onSubmit) o.onSubmit(text);
    }
    var okBtn = h("button", { class: "mp-btn mp-btn--primary", type: "button", text: "确定" });
    okBtn.addEventListener("click", submit);
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter") submit();
    });
    var sheet = h("div", { class: "mp-sheet" }, [
      h("div", { class: "mp-sheet__head" }, [
        h("div", { class: "mp-sheet__title", text: o.title || "" }),
        okBtn,
        iconBtn("close", { label: "关闭", onClick: close })
      ]),
      body
    ]);
    mask.addEventListener("click", function(e) {
      if (e.target === mask) close();
    });
    mask.appendChild(sheet);
    rootEl.appendChild(mask);
    setTimeout(function() {
      input.focus();
    }, 30);
    return close;
  }

  // src/core/routes.js
  var TAB_ITEMS = [
    { id: "recommend", name: "推荐", icon: "search" },
    { id: "playlists", name: "歌单", icon: "folder" },
    { id: "favorites", name: "TA", icon: "heart" },
    { id: "settings", name: "设置", icon: "gear" }
  ];
  var TABS = TAB_ITEMS.map(function(item) {
    return item.id;
  });
  var SECONDARY_ROUTES = ["search", "playlist", "now"];
  var DEFAULT_ROUTE = "recommend";
  function isValidRoute(route) {
    var id = String(route || "");
    if (!id) return false;
    return TABS.indexOf(id) !== -1 || SECONDARY_ROUTES.indexOf(id) !== -1;
  }
  function tabOf(route) {
    if (route === "playlist") return "playlists";
    if (route === "search") return "recommend";
    return route;
  }

  // src/ui/views/recommend.js
  function greeting() {
    var hour = (/* @__PURE__ */ new Date()).getHours();
    if (hour < 6) return "夜深了，来点安静的歌";
    if (hour < 11) return "早上好，今天听点什么";
    if (hour < 14) return "中午好，放松一下";
    if (hour < 18) return "下午好，给你挑了几首";
    if (hour < 23) return "晚上好，适合慢慢听";
    return "夜深了，来点安静的歌";
  }
  function mount(host, ctx) {
    var body = h("div", { class: "mp-body" });
    var refreshing = false;
    var autoFetched = false;
    var header = h("div", { class: "mp-header" }, [
      pageTitle("推荐", function() {
        ctx.exitOrMinimize();
      }),
      iconBtn("search", { label: "搜索", onClick: function() {
        ctx.goto("search");
      } }),
      iconBtn("more", { label: "推荐偏好", onClick: function() {
        openPrefs();
      } })
    ]);
    function coverTile(tracks) {
      var grid = h("div", { class: "mp-rec__mosaic" });
      var list = (tracks || []).slice(0, 4);
      for (var i = 0; i < 4; i++) {
        var t = list[i];
        var cell = coverNode(t ? ctx.coverOf(t) : "", "mp-rec__tile");
        if (t) cell.dataset.cover = trackKey(t);
        grid.appendChild(cell);
      }
      return grid;
    }
    function aiCard(rec) {
      var tracks = rec && rec.tracks || [];
      var name = rec && rec.playlistName || "AI 为你挑的";
      var playBtn = h("button", { class: "mp-rec__play", type: "button", text: "播放全部" });
      playBtn.addEventListener("click", function() {
        if (!tracks.length) return;
        ctx.playRecommend(tracks, 0);
      });
      var refreshBtn = h("button", { class: "mp-rec__refresh", type: "button", text: refreshing ? "正在挑…" : "换一批" });
      refreshBtn.addEventListener("click", function() {
        if (refreshing) return;
        refreshing = true;
        render2();
        ctx.refreshRecommend(true).then(function() {
          refreshing = false;
          render2();
        }, function() {
          refreshing = false;
          render2();
        });
      });
      return h("div", { class: "mp-rec__card" }, [
        coverTile(tracks),
        h("div", { class: "mp-rec__info" }, [
          h("div", { class: "mp-rec__label", text: "AI 为你挑的" }),
          h("div", { class: "mp-rec__name", text: name }),
          h("div", { class: "mp-rec__meta", text: tracks.length ? tracks.length + " 首 · " + (rec.mode === "local" ? "按偏好" : "AI 挑选") : "还没有推荐" }),
          h("div", { class: "mp-rec__actions" }, [playBtn, refreshBtn])
        ])
      ]);
    }
    function trackRow(track, index, tracks) {
      var cover = coverNode(ctx.coverOf(track), "mp-rec__rowcover");
      cover.dataset.cover = trackKey(track);
      var row = h("button", { class: "mp-rec__row", type: "button" }, [
        cover,
        h("div", { class: "mp-rec__rowmain" }, [
          h("div", { class: "mp-rec__rowname", text: track.name || "未知歌曲" }),
          h("div", { class: "mp-rec__rowsub", text: track.artist || "" })
        ])
      ]);
      row.addEventListener("click", function() {
        ctx.playRecommend(tracks, index);
      });
      return row;
    }
    function renderBody() {
      var rec = ctx.recommendCache ? ctx.recommendCache() : null;
      var tracks = rec && rec.tracks || [];
      body.appendChild(h("div", { class: "mp-rec__hello", text: greeting() }));
      body.appendChild(aiCard(rec));
      if (rec && rec.reason) {
        body.appendChild(h("div", { class: "mp-rec__hint", text: rec.reason }));
      }
      if (tracks.length) {
        body.appendChild(h("div", { class: "mp-section", text: "今日推荐" }));
        var listBox = h("div", { class: "mp-rec__list" });
        tracks.forEach(function(track, i) {
          listBox.appendChild(trackRow(track, i, tracks));
        });
        body.appendChild(listBox);
      }
      if (ctx.neteaseReady && ctx.neteaseReady()) {
        var rank = h("button", { class: "mp-rec__rank", type: "button" }, [
          h("div", { class: "mp-rec__rankname", text: "排行榜" }),
          h("div", { class: "mp-rec__ranksub", text: "去搜索页看热歌榜 / 新歌榜" })
        ]);
        rank.addEventListener("click", function() {
          ctx.goto("search");
        });
        body.appendChild(rank);
      }
    }
    function render2() {
      clear(body);
      try {
        renderBody();
      } catch (err) {
        clear(body);
        body.appendChild(h("div", { class: "mp-rec__hint", text: "推荐加载失败" }));
        var retry = h("button", { class: "mp-rec__refresh", type: "button", text: "重试" });
        retry.addEventListener("click", function() {
          render2();
        });
        body.appendChild(retry);
      }
    }
    function openPrefs() {
      if (ctx.openPrefsPanel) {
        ctx.openPrefsPanel();
        return;
      }
    }
    var view = h("div", { class: "mp-view" }, [header, body]);
    host.appendChild(view);
    render2();
    var mode = ctx.state.settings && ctx.state.settings.recMode || "manual";
    var cache = ctx.recommendCache ? ctx.recommendCache() : null;
    var shouldFetch = !cache || !cache.tracks || mode === "auto" && !autoFetched;
    if (shouldFetch && ctx.refreshRecommend) {
      if (mode === "auto") autoFetched = true;
      refreshing = true;
      render2();
      ctx.refreshRecommend(mode === "auto").then(function() {
        refreshing = false;
        render2();
      }, function() {
        refreshing = false;
        render2();
      });
    }
    return {
      refresh: render2,
      destroy: function() {
        refreshing = false;
      }
    };
  }

  // src/ui/views/search.js
  function mount2(host, ctx) {
    var state = ctx.state;
    var resultsBox = h("div", { class: "mp-body" });
    var selecting = false;
    var selected = /* @__PURE__ */ Object.create(null);
    function toggleSelect(track) {
      var key = trackKey(track);
      if (selected[key]) delete selected[key];
      else selected[key] = track;
    }
    function selectedTracks() {
      return Object.keys(selected).map(function(key) {
        return selected[key];
      });
    }
    function updateSelectCount() {
      var countEl = resultsBox.querySelector(".mp-select-bar__count");
      var addBtn = resultsBox.querySelector(".mp-select-bar .mp-btn");
      var n = selectedTracks().length;
      if (countEl) countEl.textContent = "已选 " + n + " 首";
      if (addBtn) addBtn.disabled = !n;
    }
    var input = h("input", {
      class: "mp-search__input",
      type: "text",
      inputmode: "search",
      placeholder: "搜索歌曲、歌手、专辑",
      value: state.search.keyword || "",
      enterkeyhint: "search"
    });
    var clearBtn = h(
      "button",
      { class: "mp-search__clear", type: "button", "aria-label": "清空" },
      [h("span", { html: icon("close") })]
    );
    var box = h("div", { class: "mp-search__box" }, [
      h("span", { html: icon("search") }),
      input,
      clearBtn
    ]);
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
        ctx.searchNow(input.value);
      }
    });
    clearBtn.addEventListener("click", function() {
      input.value = "";
      ctx.searchNow("");
      input.focus();
    });
    var headerRight = [];
    headerRight.push(iconBtn("check", {
      label: selecting ? "退出多选" : "多选",
      onClick: function() {
        selecting = !selecting;
        if (!selecting) selected = /* @__PURE__ */ Object.create(null);
        renderResults();
      }
    }));
    var header = h("div", { class: "mp-header" }, [
      // 搜索是推荐页的二级页面，左上角回推荐
      iconBtn("back", { label: "返回推荐", onClick: function() {
        ctx.goto("recommend");
      } }),
      pageTitle("搜索", function() {
        ctx.exitApp();
      })
    ].concat(headerRight));
    function chip(label, onClick) {
      var btn = h("button", { class: "mp-rec-chip", type: "button", text: label });
      btn.addEventListener("click", function() {
        onClick(label);
      });
      return btn;
    }
    function renderRecommend() {
      var box2 = h("div");
      var data = ctx.suggestions();
      if (data.searches.length) {
        var head = h("div", { class: "mp-section" }, [
          h("span", { text: "最近搜索" }),
          (function() {
            var btn = h("button", { class: "mp-section__act", type: "button", text: "清空" });
            btn.addEventListener("click", function() {
              ctx.clearSearches();
            });
            return btn;
          })()
        ]);
        var chips = h("div", { class: "mp-rec" });
        data.searches.forEach(function(word) {
          chips.appendChild(chip(word, function(w) {
            input.value = w;
            ctx.searchNow(w);
          }));
        });
        box2.appendChild(head);
        box2.appendChild(chips);
      }
      if (data.artists.length) {
        box2.appendChild(h("div", { class: "mp-section", text: "猜你喜欢" }));
        var guess = h("div", { class: "mp-rec" });
        data.artists.forEach(function(artist) {
          guess.appendChild(chip(artist, function(w) {
            input.value = w;
            ctx.searchNow(w);
          }));
        });
        box2.appendChild(guess);
        box2.appendChild(h("div", { class: "mp-rec__hint", text: "根据最近播放和收藏的歌手推荐" }));
      }
      box2.appendChild(h("div", { class: "mp-section", text: "热门推荐" }));
      var hot = h("div", { class: "mp-rec" });
      data.hot.forEach(function(word) {
        hot.appendChild(chip(word, function(w) {
          input.value = w;
          ctx.searchNow(w);
        }));
      });
      box2.appendChild(hot);
      box2.appendChild(h("div", { class: "mp-hint mp-rec__foot", text: "点上面的词直接搜索，也可以自己输入歌名或歌手" }));
      return box2;
    }
    function renderResults() {
      clear(resultsBox);
      var s = state.search;
      if (s.busy) {
        resultsBox.appendChild(h("div", { class: "mp-hint", text: "正在搜索…" }));
        return;
      }
      if (!s.at) {
        resultsBox.appendChild(renderRecommend());
        return;
      }
      (s.errors || []).forEach(function(err) {
        var label = err.source === "itunes" ? "iTunes" : "QQ 音乐";
        resultsBox.appendChild(h("div", { class: "mp-error", text: label + " 搜索失败：" + err.error }));
      });
      if (!s.tracks.length) {
        resultsBox.appendChild(emptyHint("没有找到歌曲", "换个关键词，或在设置里打开音源"));
        return;
      }
      var counts = [];
      if (s.counts.tencent) counts.push("QQ " + s.counts.tencent);
      if (s.counts.itunes) counts.push("iTunes " + s.counts.itunes);
      resultsBox.appendChild(h("div", {
        class: "mp-section",
        text: "找到 " + s.tracks.length + " 首" + (counts.length ? "（" + counts.join(" · ") + "）" : "")
      }));
      if (selecting) {
        var chosen = selectedTracks();
        var addBtn = h("button", { class: "mp-btn mp-btn--ghost", type: "button", text: "加入播放列表" });
        addBtn.disabled = !chosen.length;
        addBtn.addEventListener("click", function() {
          var picked = selectedTracks();
          if (!picked.length) return;
          ctx.appendToQueue(picked).then(function(n) {
            selected = /* @__PURE__ */ Object.create(null);
            selecting = false;
            ctx.toast("已加入 " + n + " 首到播放列表");
            renderResults();
          });
        });
        resultsBox.appendChild(h("div", { class: "mp-select-bar" }, [
          h("span", { class: "mp-select-bar__count", text: "已选 " + chosen.length + " 首" }),
          addBtn
        ]));
      }
      var playing = ctx.state.player.status === "playing";
      s.tracks.forEach(function(track, i) {
        resultsBox.appendChild(songRow({
          track,
          coverUrl: ctx.coverOf(track),
          coverKey: trackKey(track),
          current: ctx.isCurrent(track),
          playing: playing && ctx.isCurrent(track),
          selectable: selecting,
          selected: !!selected[trackKey(track)],
          tag: track.source === "itunes" ? "试听" : track.source === "audius" ? "免费" : "",
          onPlay: function(rowEl) {
            if (selecting) {
              toggleSelect(track);
              var on = !!selected[trackKey(track)];
              if (rowEl) {
                rowEl.classList.toggle("is-selected", on);
                var check = rowEl.querySelector(".mp-row__check");
                if (check) {
                  check.classList.toggle("is-on", on);
                  check.innerHTML = on ? icon("check") : "";
                }
              }
              updateSelectCount();
              return;
            }
            if (ctx.isCurrent(track)) ctx.togglePlay();
            else ctx.playOne(track);
          },
          onMore: function() {
            ctx.openSongSheet(track, { queueTracks: s.tracks, queueIndex: i });
          }
        }));
      });
    }
    var rankBox = null;
    var rankCancelled = false;
    function renderRankSkeleton() {
      clear(rankBox);
      rankBox.appendChild(h("div", { class: "mp-section", text: "排行榜" }));
      var grid = h("div", { class: "mp-rank__grid" });
      for (var i = 0; i < 4; i++) {
        grid.appendChild(h("div", { class: "mp-rank__card is-skeleton" }, [
          h("div", { class: "mp-rank__cover is-skeleton" }),
          h("div", { class: "mp-rank__name is-skeleton", text: "加载中" })
        ]));
      }
      rankBox.appendChild(grid);
    }
    function renderRanks(list) {
      clear(rankBox);
      if (!list.length) return;
      rankBox.appendChild(h("div", { class: "mp-section", text: "排行榜" }));
      var grid = h("div", { class: "mp-rank__grid" });
      list.slice(0, 6).forEach(function(item) {
        var cover = h("div", { class: "mp-rank__cover" });
        var url = String(item.cover || "").replace(/^http:/, "https:");
        if (url) {
          var img = h("img", { src: url, alt: "" });
          img.addEventListener("error", function() {
            img.remove();
          });
          cover.appendChild(img);
        }
        if (item.count) cover.appendChild(h("span", { class: "mp-rank__count", text: item.count + " 首" }));
        var card = h("button", { class: "mp-rank__card", type: "button" }, [
          cover,
          h("div", { class: "mp-rank__name", text: item.name || "榜单" })
        ]);
        card.addEventListener("click", function() {
          if (ctx.playNeteaseToplist) ctx.playNeteaseToplist(item.id, item.name);
        });
        grid.appendChild(card);
      });
      rankBox.appendChild(grid);
    }
    function renderRankError() {
      clear(rankBox);
      var btn = h("button", { class: "mp-rank__retry", type: "button", text: "榜单加载失败 · 点这里重试" });
      btn.addEventListener("click", function() {
        loadRanks();
      });
      rankBox.appendChild(btn);
    }
    async function loadRanks() {
      if (!rankBox) return;
      renderRankSkeleton();
      var res = null;
      try {
        res = await ctx.fetchNeteaseToplists();
      } catch (err) {
        res = { ok: false, list: [] };
      }
      if (rankCancelled) return;
      if (!res || !res.ok || !res.list || !res.list.length) {
        renderRankError();
        return;
      }
      renderRanks(res.list);
    }
    if (ctx.neteaseApiReady && ctx.neteaseApiReady()) {
      rankBox = h("div", { class: "mp-rank" });
      loadRanks();
    }
    var view = h("div", { class: "mp-view" }, [
      header,
      h("div", { class: "mp-search" }, [box]),
      resultsBox
    ].concat(rankBox ? [rankBox] : []));
    host.appendChild(view);
    renderResults();
    return {
      refresh: renderResults,
      destroy: function() {
        rankCancelled = true;
      }
    };
  }

  // src/core/format.js
  function fmtTime(ms) {
    var total = Math.max(0, Math.round((Number(ms) || 0) / 1e3));
    var h2 = Math.floor(total / 3600);
    var m = Math.floor(total % 3600 / 60);
    var s = total % 60;
    var mm = String(m).padStart(2, "0");
    var ss = String(s).padStart(2, "0");
    return h2 > 0 ? h2 + ":" + mm + ":" + ss : mm + ":" + ss;
  }
  function fmtSummary(count, totalMs) {
    var songs = Number(count) || 0;
    if (!songs) return "空歌单";
    if (!totalMs) return songs + " 首";
    return songs + " 首 · " + Math.round(totalMs / 6e4) + " 分钟";
  }

  // src/ui/views/playlists.js
  function mount3(host, ctx) {
    var state = ctx.state;
    var listBox = h("div", { class: "mp-list mp-body" });
    var header = h("div", { class: "mp-header" }, [
      pageTitle("歌单", function() {
        ctx.exitOrMinimize();
      }),
      iconBtn("plus", {
        label: "新建歌单",
        onClick: function() {
          ctx.openPrompt({
            title: "新建歌单",
            placeholder: "给歌单起个名字",
            onSubmit: function(name) {
              ctx.createPlaylist(name);
            }
          });
        }
      })
    ]);
    function plRow(p) {
      var first = p.tracks[0];
      var cover = coverNode(first ? ctx.coverOf(first) : "", "mp-pl__cover");
      if (first) cover.dataset.cover = trackKey(first);
      var row = h("button", { class: "mp-pl", type: "button" }, [
        cover,
        h("div", { class: "mp-pl__main" }, [
          h("div", { class: "mp-pl__name", text: p.name }),
          h("div", { class: "mp-pl__sub", text: fmtSummary(p.tracks.length, playlistDuration(p)) })
        ])
      ]);
      row.addEventListener("click", function() {
        if (p.virtual === "favorites") {
          ctx.goto("playlist", { playlistId: "__favorites__" });
          return;
        }
        ctx.goto("playlist", { playlistId: p.id });
      });
      return row;
    }
    function renderList() {
      clear(listBox);
      listBox.appendChild(plRow({
        id: "__favorites__",
        virtual: "favorites",
        name: "我的收藏",
        tracks: state.favorites || [],
        createdAt: 0
      }));
      var mine = state.playlists.filter(function(p) {
        return p.owner !== "char";
      });
      var theirs = state.playlists.filter(function(p) {
        return p.owner === "char";
      });
      if (mine.length) {
        listBox.appendChild(h("div", { class: "mp-section", text: "我的歌单" }));
        mine.forEach(function(p) {
          listBox.appendChild(plRow(p));
        });
      }
      if (theirs.length) {
        listBox.appendChild(h("div", { class: "mp-section", text: "TA 的歌单" }));
        theirs.forEach(function(p) {
          listBox.appendChild(plRow(p));
        });
      }
      if (!mine.length && !theirs.length) {
        listBox.appendChild(emptyHint(
          "还没有歌单",
          "右上角 + 新建一个；收藏的歌会固定显示在最上面"
        ));
      }
    }
    var view = h("div", { class: "mp-view" }, [header, listBox]);
    host.appendChild(view);
    renderList();
    return { refresh: renderList };
  }

  // src/ui/views/playlistDetail.js
  function mount4(host, ctx) {
    var state = ctx.state;
    var listBox = h("div", { class: "mp-body" });
    function back2() {
      ctx.goto("playlists");
    }
    var FAKE_FAVORITES = "__favorites__";
    function isFavorites() {
      return state.playlistId === FAKE_FAVORITES;
    }
    function currentPlaylist() {
      if (isFavorites()) {
        return {
          id: FAKE_FAVORITES,
          name: "我的收藏",
          tracks: state.favorites || [],
          createdAt: 0,
          readonly: true
        };
      }
      return ctx.playlistOf(state.playlistId);
    }
    var titleEl = h("div", { class: "mp-header__title", text: "歌单" });
    var subEl = h("div", { class: "mp-header__sub", text: "" });
    var moreBtn = iconBtn("more", {
      label: "更多",
      onClick: function() {
        var p = currentPlaylist();
        if (!p || p.readonly) return;
        ctx.openSheet({
          title: p.name,
          items: [
            {
              label: "重命名",
              icon: "note",
              onClick: function() {
                ctx.openPrompt({
                  title: "重命名歌单",
                  value: p.name,
                  onSubmit: function(name) {
                    ctx.renamePlaylist(p.id, name);
                  }
                });
              }
            },
            {
              label: "删除歌单",
              icon: "trash",
              danger: true,
              onClick: function() {
                ctx.deletePlaylist(p.id);
              }
            }
          ]
        });
      }
    });
    var header = h("div", { class: "mp-header" }, [
      iconBtn("back", { label: "返回", onClick: back2 }),
      titleEl,
      subEl,
      moreBtn
    ]);
    var actions = h("div", { class: "mp-actions" });
    function renderActions(p) {
      clear(actions);
      var disabled = !p.tracks.length;
      var playAll = h("button", { class: "mp-btn mp-btn--primary", type: "button" }, [
        h("span", { html: icon("play") }),
        h("span", { text: "播放全部" })
      ]);
      playAll.disabled = disabled;
      playAll.addEventListener("click", function() {
        ctx.playTracks(p.tracks, 0);
      });
      var shuffleAll = h("button", { class: "mp-btn mp-btn--ghost", type: "button" }, [
        h("span", { html: icon("shuffle") }),
        h("span", { text: "随机播放" })
      ]);
      shuffleAll.disabled = disabled;
      shuffleAll.addEventListener("click", async function() {
        if (!state.settings.shuffle) await ctx.toggleShuffle();
        ctx.playTracks(p.tracks, 0);
      });
      actions.appendChild(playAll);
      actions.appendChild(shuffleAll);
    }
    function renderList() {
      clear(listBox);
      var p = currentPlaylist();
      if (!p) {
        titleEl.textContent = "歌单不存在";
        subEl.textContent = "";
        clear(actions);
        moreBtn.style.display = "none";
        listBox.appendChild(emptyHint("这个歌单已经被删除了", "返回上一页看看别的歌单"));
        return;
      }
      moreBtn.style.display = "";
      titleEl.textContent = p.name;
      subEl.textContent = fmtSummary(p.tracks.length, playlistDuration(p));
      renderActions(p);
      if (!p.tracks.length) {
        listBox.appendChild(emptyHint("歌单还是空的", "去搜索结果里点「⋯ → 加入歌单」"));
        return;
      }
      p.tracks.forEach(function(track, i) {
        listBox.appendChild(songRow({
          track,
          coverUrl: ctx.coverOf(track),
          coverKey: trackKey(track),
          current: ctx.isCurrent(track),
          playing: ctx.state.player.status === "playing",
          onPlay: function() {
            if (ctx.isCurrent(track)) ctx.togglePlay();
            else ctx.playTracks(p.tracks, i);
          },
          onMore: function() {
            ctx.openSongSheet(track, {
              playlistId: p.id,
              index: i,
              queueTracks: p.tracks,
              queueIndex: i
            });
          }
        }));
      });
    }
    var view = h("div", { class: "mp-view" }, [header, actions, listBox]);
    host.appendChild(view);
    renderList();
    return { refresh: renderList };
  }

  // src/ui/views/favorites.js
  var CHAR_KEY = "mp:taChar";
  function richText(text) {
    var parts = String(text || "").split(/(\*\*[^*]+\*\*)/g);
    return parts.map(function(seg) {
      if (seg.length > 4 && seg.indexOf("**") === 0 && seg.lastIndexOf("**") === seg.length - 2) {
        return h("b", { text: seg.slice(2, -2) });
      }
      return document.createTextNode(seg);
    });
  }
  function readSavedChar() {
    try {
      return localStorage.getItem(CHAR_KEY) || "";
    } catch (err) {
      return "";
    }
  }
  function saveChar(id) {
    try {
      localStorage.setItem(CHAR_KEY, id || "");
    } catch (err) {
    }
    try {
      var api2 = typeof window !== "undefined" ? window.Roche : null;
      if (api2 && api2.storage && typeof api2.storage.set === "function") {
        api2.storage.set(CHAR_KEY, id || "");
      }
    } catch (err) {
    }
  }
  function mount5(host, ctx) {
    var state = ctx.state;
    var listBox = h("div", { class: "mp-body" });
    var subEl = h("div", { class: "mp-header__sub", text: "" });
    var currentChar = readSavedChar();
    var profiles = /* @__PURE__ */ Object.create(null);
    function loadCharacters() {
      var api2 = typeof window !== "undefined" && window.Roche ? window.Roche : null;
      if (!api2 || !api2.character || typeof api2.character.list !== "function") return Promise.resolve();
      return Promise.resolve(api2.character.list()).then(function(list) {
        (list || []).forEach(function(c) {
          if (!c) return;
          var info = {
            name: c.handle || c.name || c.displayName || "",
            avatar: c.avatar || ""
          };
          [c.id, c.contactId, c.conversationId].forEach(function(key) {
            if (key) profiles[String(key)] = info;
          });
        });
      }).catch(function() {
      });
    }
    function profileOf(id) {
      return id && profiles[String(id)] || null;
    }
    function nameOf(id) {
      var p = profileOf(id);
      if (p && p.name) return p.name;
      return "角色";
    }
    function avatarOf(id) {
      var p = profileOf(id);
      return p ? p.avatar : "";
    }
    var switchBtn = iconBtn("more", { label: "切换角色", onClick: function() {
      openCharPicker();
    } });
    var header = h("div", { class: "mp-header" }, [
      pageTitle("TA 的歌单", function() {
        ctx.exitOrMinimize();
      }),
      subEl,
      switchBtn
    ]);
    function mirrorOf(key) {
      try {
        var raw = JSON.parse(localStorage.getItem("mp:mirror:" + key) || "null");
        return raw;
      } catch (err) {
        return null;
      }
    }
    function allPlaylists() {
      var fromState = state.playlists || [];
      var mirror = mirrorOf("mp:playlists");
      if (!Array.isArray(mirror) || !mirror.length) return fromState;
      var byId = /* @__PURE__ */ Object.create(null);
      fromState.forEach(function(p) {
        if (p && p.id) byId[p.id] = p;
      });
      mirror.forEach(function(p) {
        if (p && p.id) byId[p.id] = p;
      });
      return Object.keys(byId).map(function(id) {
        return byId[id];
      });
    }
    function charPlaylistsAll() {
      return allPlaylists().filter(function(p) {
        return p && p.owner === "char";
      });
    }
    function allComments() {
      return ctx.taComments ? ctx.taComments("") : [];
    }
    function charIds() {
      var seen = /* @__PURE__ */ Object.create(null);
      var out = [];
      charPlaylistsAll().forEach(function(p) {
        var id = String(p.ownerId || "");
        if (id && !seen[id]) {
          seen[id] = true;
          out.push(id);
        }
      });
      allComments().forEach(function(c) {
        var id = String(c.characterId || "");
        if (id && !seen[id]) {
          seen[id] = true;
          out.push(id);
        }
      });
      return out;
    }
    function openCharPicker() {
      var items = [{
        label: "全部角色",
        icon: "check",
        hint: currentChar ? "" : "当前",
        onClick: function() {
          currentChar = "";
          saveChar("");
          renderList();
        }
      }];
      charIds().forEach(function(id) {
        items.push({
          label: nameOf(id),
          icon: currentChar === id ? "check" : "music",
          hint: currentChar === id ? "当前" : "",
          onClick: function() {
            currentChar = id;
            saveChar(id);
            renderList();
          }
        });
      });
      ctx.openSheet({ title: "切换角色", items });
    }
    function avatarNode(id, name) {
      var box = h("div", { class: "mp-ta-head__avatar" });
      var url = avatarOf(id);
      if (url) {
        var img = h("img", { src: url, alt: "" });
        img.addEventListener("error", function() {
          img.remove();
        });
        box.appendChild(img);
      } else {
        box.appendChild(h("span", { text: String(name || "角").slice(0, 1) }));
      }
      return box;
    }
    function playlistCard(p) {
      var first = (p.tracks || [])[0];
      var cover = coverNode(first ? ctx.coverOf(first) : "", "mp-ta-pl__cover");
      if (first) cover.dataset.cover = trackKey(first);
      var card = h("button", { class: "mp-ta-pl", type: "button" }, [
        cover,
        h("div", { class: "mp-ta-pl__name", text: p.name }),
        h("div", { class: "mp-ta-pl__sub", text: fmtSummary((p.tracks || []).length, playlistDuration(p)) })
      ]);
      card.addEventListener("click", function() {
        ctx.goto("playlist", { playlistId: p.id });
      });
      return card;
    }
    function commentBubble(item) {
      return h("div", { class: "mp-ta-quote" }, [
        h("div", { class: "mp-ta-quote__song" }, [
          h("span", { text: item.name || "未知歌曲" }),
          item.artist ? h("span", { class: "mp-ta-quote__artist", text: " · " + item.artist }) : null
        ]),
        h("div", { class: "mp-ta-quote__text" }, richText(item.text || ""))
      ]);
    }
    function charBlock(id, playlists, comments) {
      var name = nameOf(id);
      var trackCount = playlists.reduce(function(sum, p) {
        return sum + (p.tracks || []).length;
      }, 0);
      var stat = [playlists.length + " 个歌单", trackCount + " 首"].join(" · ");
      var block = h("div", { class: "mp-ta-block" }, [
        h("div", { class: "mp-ta-head" }, [
          avatarNode(id, name),
          h("div", { class: "mp-ta-head__main" }, [
            h("div", { class: "mp-ta-head__name", text: name }),
            h("div", { class: "mp-ta-head__stat", text: stat })
          ])
        ])
      ]);
      if (playlists.length) {
        var strip = h("div", { class: "mp-ta-strip" });
        playlists.forEach(function(p) {
          strip.appendChild(playlistCard(p));
        });
        block.appendChild(strip);
      }
      comments.slice(0, 8).forEach(function(c) {
        block.appendChild(commentBubble(c));
      });
      return block;
    }
    function renderList() {
      clear(listBox);
      var playlists = charPlaylistsAll();
      var comments = allComments();
      if (currentChar) {
        playlists = playlists.filter(function(p) {
          return String(p.ownerId || "") === currentChar;
        });
        comments = comments.filter(function(c) {
          return String(c.characterId || "") === currentChar;
        });
      }
      var ids = currentChar ? [currentChar] : charIds();
      subEl.textContent = currentChar ? nameOf(currentChar) : ids.length ? ids.length + " 个角色" : "";
      if (!ids.length) {
        listBox.appendChild(emptyHint(
          "TA 还没有歌单和评价",
          "让 TA 在聊天里建个歌单、或在「一起听」时把当前这首收进去\n你自己收藏的歌在「歌单 → 我的收藏」"
        ));
        return;
      }
      ids.forEach(function(id) {
        var mine = playlists.filter(function(p) {
          return String(p.ownerId || "") === id;
        });
        var words = comments.filter(function(c) {
          return String(c.characterId || "") === id;
        });
        listBox.appendChild(charBlock(id, mine, words));
      });
    }
    var view = h("div", { class: "mp-view" }, [header, listBox]);
    host.appendChild(view);
    renderList();
    Promise.all([
      ctx.reloadPlaylists ? ctx.reloadPlaylists() : Promise.resolve(),
      ctx.reloadComments ? ctx.reloadComments() : Promise.resolve(),
      loadCharacters()
    ]).then(function() {
      renderList();
    }).catch(function() {
    });
    return { refresh: renderList };
  }

  // src/ui/views/settings.js
  function field(label, node, desc) {
    var left = h("div", { class: "mp-field__label" }, [
      h("div", { text: label }),
      desc ? h("div", { class: "mp-field__desc", text: desc }) : null
    ]);
    return h("div", { class: "mp-field" }, [left, node]);
  }
  function fieldStack(label, node, desc) {
    var left = h("div", { class: "mp-field__label" }, [
      h("div", { text: label }),
      desc ? h("div", { class: "mp-field__desc", text: desc }) : null
    ]);
    return h("div", { class: "mp-field mp-field--stack" }, [left, node]);
  }
  function switchEl(on, onToggle) {
    var btn = h("button", {
      class: "mp-switch" + (on ? " is-on" : ""),
      type: "button",
      "aria-pressed": on ? "true" : "false"
    });
    btn.addEventListener("click", function() {
      onToggle(!on);
    });
    return btn;
  }
  function mount6(host, ctx) {
    var state = ctx.state;
    var body = h("div", { class: "mp-body" });
    var statsTimer = null;
    var header = h("div", { class: "mp-header" }, [
      pageTitle("设置", function() {
        ctx.exitOrMinimize();
      })
    ]);
    function setSource(key, value) {
      var sources = Object.assign({}, state.settings.sources);
      sources[key] = value;
      ctx.updateSettings({ sources });
      if (!sources.tencent && !sources.itunes && !sources.audius) {
        ctx.toast("都关掉了，搜索会没有结果");
      }
    }
    function openQrModal() {
      var settings = state.settings;
      if (!isReady(settings)) {
        ctx.toast("先填网易云 API 地址");
        return;
      }
      var img = h("img", { class: "mp-qr__img", alt: "二维码" });
      var tip = h("div", { class: "mp-qr__tip", text: "正在获取二维码…" });
      var mask = h("div", { class: "mp-modal" });
      var closeBtn = h(
        "button",
        { class: "mp-icon-btn", type: "button", "aria-label": "关闭" },
        [h("span", { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' })]
      );
      var timer = null;
      function close() {
        if (timer) clearInterval(timer);
        timer = null;
        if (mask.parentNode) mask.parentNode.removeChild(mask);
      }
      closeBtn.addEventListener("click", close);
      mask.addEventListener("click", function(e) {
        if (e.target === mask) close();
      });
      mask.appendChild(h("div", { class: "mp-modal__panel mp-qr" }, [
        h("div", { class: "mp-modal__head" }, [
          h("div", { class: "mp-modal__title", text: "扫码登录网易云" }),
          closeBtn
        ]),
        img,
        tip
      ]));
      document.body.appendChild(mask);
      (async function() {
        try {
          var key = await qrKey(settings);
          var qr = await qrCreate(settings, key);
          if (qr.qrimg) img.src = qr.qrimg;
          else if (qr.qrurl) img.src = "https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=" + encodeURIComponent(qr.qrurl);
          tip.textContent = "用网易云音乐 App 扫一扫";
          timer = setInterval(async function() {
            try {
              var res = await qrCheck(settings, key);
              if (res.code === 803) {
                close();
                var profile = null;
                try {
                  profile = await account(Object.assign({}, settings, { neteaseCookie: res.cookie }));
                } catch (err) {
                }
                ctx.updateSettings({
                  neteaseCookie: res.cookie,
                  neteaseProfile: profile && profile.nickname ? profile.nickname : "已登录"
                });
                ctx.toast("网易云登录成功");
              } else if (res.code === 800) {
                tip.textContent = "二维码已过期，请重新打开";
                if (timer) clearInterval(timer);
                timer = null;
              } else if (res.code === 802) {
                tip.textContent = "已扫码，请在手机上确认";
              }
            } catch (err) {
              tip.textContent = "查询失败：" + (err && err.message ? err.message : "网络错误");
            }
          }, 2500);
        } catch (err) {
          tip.textContent = "获取二维码失败：" + (err && err.message ? err.message : "检查 API 地址");
        }
      })();
    }
    function runSelfTest() {
      ctx.openSheet({
        title: "音源自检",
        items: [{ label: "正在检查…", icon: "music", hint: "" }]
      });
      ctx.sources.selfTest(state.settings).then(function(results) {
        ctx.openSheet({
          title: "音源自检结果",
          items: results.map(function(r) {
            return {
              label: r.name + " · " + (r.ok ? "正常" : "失败"),
              icon: r.ok ? "check" : "close",
              hint: r.ok ? r.ms + "ms" : r.detail.slice(0, 40)
            };
          }).concat([{
            label: "关闭",
            icon: "close",
            onClick: function() {
            }
          }])
        });
      }).catch(function(err) {
        ctx.toast("自检失败：" + (err && err.message));
      });
    }
    function render2() {
      clear(body);
      var s = state.settings;
      var themeRow = h("div", { class: "mp-theme-row" });
      THEMES.forEach(function(t) {
        var btn = h("button", {
          class: "mp-theme-btn" + (s.theme === t.id ? " is-active" : ""),
          type: "button",
          text: t.name
        });
        btn.addEventListener("click", function() {
          ctx.updateSettings({ theme: t.id });
        });
        themeRow.appendChild(btn);
      });
      var dotRow = h("div", { class: "mp-dots" });
      ACCENTS.forEach(function(a) {
        var dot = h("button", {
          class: "mp-dot" + (s.accent === a.id ? " is-active" : ""),
          type: "button",
          "aria-label": a.name,
          style: "background:" + a.color
        });
        dot.addEventListener("click", function() {
          ctx.updateSettings({ accent: a.id, accentColor: "" });
        });
        dotRow.appendChild(dot);
      });
      var colorInput = h("input", {
        class: "mp-color",
        type: "color",
        value: /^#[0-9a-fA-F]{6}$/.test(s.accentColor || "") ? s.accentColor : "#e14b4b"
      });
      var customDot = h("button", {
        class: "mp-dot mp-dot--custom" + (s.accentColor ? " is-active" : ""),
        type: "button",
        "aria-label": "自定义颜色",
        style: "background:" + (s.accentColor || "#e14b4b")
      });
      customDot.appendChild(colorInput);
      colorInput.addEventListener("input", function() {
        customDot.style.background = colorInput.value;
        ctx.updateSettings({ accent: "custom", accentColor: colorInput.value });
      });
      var appearanceGroup = h("div", { class: "mp-group" }, [
        h("div", { class: "mp-group__title", text: "外观" }),
        field("主题", themeRow, "跟随系统 / 白天白色 / 夜间深色"),
        field(
          "主色调",
          h("div", { class: "mp-dots" }, [dotRow, customDot]),
          "点色块选预设，点最右边取色器可以完全自定义"
        ),
        field(
          "悬浮窗",
          switchEl(!!s.floating, function(v) {
            ctx.updateSettings({ floating: v });
          }),
          s.floating ? "开：点右上角最小化会缩成悬浮球" : "关：点右上角直接退出 App，不显示悬浮球，音乐继续在后台播放"
        )
      ]);
      var mode = s.chatCommandMode || "hybrid";
      var promptKey = mode === "mark" ? "chatPrompt" : mode === "tool" ? "chatPromptTool" : "chatPromptHybrid";
      var promptDefault = mode === "mark" ? DEFAULT_CHAT_PROMPT : mode === "tool" ? TOOL_CHAT_PROMPT : HYBRID_CHAT_PROMPT;
      var promptValue = s[promptKey] || promptDefault;
      var modeName = mode === "mark" ? "标记通道" : mode === "tool" ? "工具通道" : "混合通道";
      var editPromptBtn = h("button", { class: "mp-btn mp-btn--ghost", type: "button", text: "编辑" });
      editPromptBtn.addEventListener("click", function() {
        var patch = {};
        ctx.openEditor({
          title: modeName + "提示词",
          value: promptValue,
          defaultValue: promptDefault,
          placeholder: "可用占位符：{{title}} {{artist}} {{state}} {{queue}}",
          onSubmit: function(text) {
            var next = {};
            next[promptKey] = text;
            ctx.updateSettings(next);
          },
          onReset: function() {
            var next = {};
            next[promptKey] = promptDefault;
            ctx.updateSettings(next);
          }
        });
      });
      var chatGroup = h("div", { class: "mp-group" }, [
        h("div", { class: "mp-group__title", text: "聊天" }),
        field(
          "一起听（主聊天）",
          switchEl(!!s.chatListen, function(v) {
            ctx.updateSettings({ chatListen: v });
          }),
          "开启后主聊天的模型能看到当前在听什么，并可直接点歌、切歌、暂停"
        ),
        field(
          "角色点歌加入队列",
          switchEl(!!s.chatAddToQueue, function(v) {
            ctx.updateSettings({ chatAddToQueue: v });
          }),
          "开：只把搜到的第一首加进当前列表；关：直接用它替换列表"
        ),
        fieldStack("指令通道", (function() {
          var row = h("div", { class: "mp-theme-row" });
          [
            { id: "hybrid", name: "混合（推荐）" },
            { id: "mark", name: "标记（最省）" },
            { id: "tool", name: "工具（最稳）" }
          ].forEach(function(item) {
            var btn = h("button", {
              class: "mp-theme-btn" + ((s.chatCommandMode || "hybrid") === item.id ? " is-active" : ""),
              type: "button",
              text: item.name
            });
            btn.addEventListener("click", function() {
              ctx.updateSettings({ chatCommandMode: item.id });
            });
            row.appendChild(btn);
          });
          return row;
        })(), "混合：点歌走工具（有卡片），其余用注释指令；标记：全部注释；工具：全部 function calling"),
        field("推荐模式", (function() {
          var row = h("div", { class: "mp-theme-row" });
          [
            { id: "manual", name: "换一批才调" },
            { id: "auto", name: "每次进入调" },
            { id: "local", name: "不调模型" }
          ].forEach(function(item) {
            var btn = h("button", {
              class: "mp-theme-btn" + ((s.recMode || "manual") === item.id ? " is-active" : ""),
              type: "button",
              text: item.name
            });
            btn.addEventListener("click", function() {
              ctx.updateSettings({ recMode: item.id });
            });
            row.appendChild(btn);
          });
          return row;
        })(), "推荐页刷新策略：手动只在你点「换一批」时调模型，最省"),
        field(
          "点卡片播放",
          switchEl(!!s.cardTapPlay, function(v) {
            ctx.updateSettings({ cardTapPlay: v });
          }),
          s.cardTapPlay ? "开：每次点卡片都切回这张卡上的歌" : "关：发卡时已经播过，之后再点卡片只显示当前播放状态"
        ),
        field(
          "一起听提示词",
          editPromptBtn,
          "每轮注入给主聊天的说明；占位符 {{title}} {{artist}} {{state}} {{queue}} 会自动替换"
        )
      ]);
      var sourceGroup = h("div", { class: "mp-group" }, [
        h("div", { class: "mp-group__title", text: "音源" }),
        field(
          "QQ 音乐",
          switchEl(s.sources.tencent, function(v) {
            setSource("tencent", v);
          }),
          "搜索并播放完整歌曲（经公开接口解析）"
        ),
        field(
          "iTunes",
          switchEl(s.sources.itunes, function(v) {
            setSource("itunes", v);
          }),
          "苹果官方接口，只有 30 秒试听"
        ),
        field(
          "免费曲库 Audius",
          switchEl(s.sources.audius, function(v) {
            setSource("audius", v);
          }),
          "无版权/CC 音乐，能完整播放；以欧美电音为主，中文歌很少"
        ),
        field(
          "网易云",
          switchEl(s.sources.netease, function(v) {
            setSource("netease", v);
          }),
          "QQ 放不了时自动找网易云同名歌曲兜底；开了上面的 API 地址还能搜整库"
        )
      ]);
      var prefixInput = h("input", {
        class: "mp-input",
        type: "text",
        placeholder: "留空 = 直连",
        value: s.prefix
      });
      prefixInput.addEventListener("change", function() {
        ctx.updateSettings({ prefix: prefixInput.value.trim() });
      });
      var netGroup = h("div", { class: "mp-group" }, [
        h("div", { class: "mp-group__title", text: "网络" }),
        field("请求前缀", prefixInput, "接口访问不了时填代理前缀；含 {url} 会替换，否则把编码后的地址接在后面"),
        field("音源自检", (function() {
          var btn = h("button", { class: "mp-btn mp-btn--ghost", type: "button", text: "运行" });
          btn.addEventListener("click", runSelfTest);
          return btn;
        })(), "逐个真实请求，告诉你哪个源在这台设备上能用")
      ]);
      var apiInput = h("input", {
        class: "mp-input",
        type: "url",
        placeholder: "https://你的服务地址",
        value: s.neteaseApi || ""
      });
      apiInput.addEventListener("change", function() {
        ctx.updateSettings({ neteaseApi: String(apiInput.value || "").trim() });
      });
      var loginBtn = h("button", {
        class: "mp-btn mp-btn--ghost",
        type: "button",
        text: s.neteaseCookie ? "重新登录" : "扫码登录"
      });
      loginBtn.addEventListener("click", openQrModal);
      var neteaseGroup = h("div", { class: "mp-group" }, [
        h("div", { class: "mp-group__title", text: "网易云（可选）" }),
        field("API 地址", apiInput, "填你自己部署的 NeteaseCloudMusicApi 地址；留空就只用公开音源"),
        field(
          "账号",
          h("div", { class: "mp-field__value", text: s.neteaseCookie ? s.neteaseProfile || "已登录" : "未登录" }),
          s.neteaseCookie ? "登录后可用自己账号的曲库/歌单" : "填好地址后扫码登录"
        ),
        field("排行榜", (function() {
          var btn = h("button", { class: "mp-btn mp-btn--ghost", type: "button", text: "查看" });
          btn.addEventListener("click", function() {
            ctx.openNeteaseToplist();
          });
          return btn;
        })(), "从网易云拉官方榜单，点一个直接播该榜前 30 首"),
        field(
          s.neteaseCookie ? "重新登录" : "扫码登录",
          h("div", { class: "mp-field__actions" }, [
            loginBtn,
            s.neteaseCookie ? (function() {
              var out = h("button", { class: "mp-btn mp-btn--ghost", type: "button", text: "退出" });
              out.addEventListener("click", function() {
                ctx.updateSettings({ neteaseCookie: "", neteaseProfile: "" });
              });
              return out;
            })() : null
          ]),
          "二维码由你部署的服务生成"
        )
      ]);
      var volume = h("input", {
        class: "mp-slider",
        type: "range",
        min: "0",
        max: "100",
        step: "1",
        value: String(Math.round(s.volume * 100))
      });
      volume.addEventListener("change", function() {
        ctx.setVolume(Number(volume.value) / 100);
      });
      var playGroup = h("div", { class: "mp-group" }, [
        h("div", { class: "mp-group__title", text: "播放" }),
        field(
          "播放引擎",
          h("div", { class: "mp-field__value", text: ctx.engineLabel() }),
          ctx.isNative() ? "原生播放器；状态栏/锁屏的按钮由它负责" : "没接上原生播放器，状态栏控制不可用（需要新版宿主）"
        ),
        field(
          "极简模式",
          switchEl(!!s.nativeMinimal, function(v) {
            ctx.updateSettings({ nativeMinimal: v });
          }),
          "默认开启：插件不轮询、不重建，只把队列交给原生播放器，状态栏控制才稳"
        ),
        field("重建播放会话", (function() {
          var btn = h("button", { class: "mp-btn mp-btn--ghost", type: "button", text: "重建" });
          btn.addEventListener("click", function() {
            ctx.rebuildSession();
          });
          return btn;
        })(), "控制栏按钮点了没反应时按一下：重开原生服务和通知，通常能救活"),
        field("彻底停止", (function() {
          var btn = h("button", { class: "mp-btn mp-btn--ghost", type: "button", text: "停止并清除通知" });
          btn.addEventListener("click", function() {
            ctx.hardStop();
          });
          return btn;
        })(), "不想听的时候按这个：停止播放 + 清空队列 + 状态栏通知一起消失"),
        field(
          "音量",
          ctx.isNative() ? h("div", { class: "mp-field__value", text: "跟随系统音量" }) : volume,
          ctx.isNative() ? "走宿主原生播放器，音量用手机音量键调" : "循环模式和随机播放在播放页右下角的按钮里调"
        )
      ]);
      var clearBtn = h("button", { class: "mp-btn mp-btn--ghost", type: "button", text: "清空数据" });
      clearBtn.addEventListener("click", function() {
        ctx.clearData();
      });
      var exitBtn = h("button", { class: "mp-btn mp-btn--ghost", type: "button", text: "退出 App" });
      exitBtn.addEventListener("click", function() {
        ctx.exitApp();
      });
      var dataGroup = h("div", { class: "mp-group" }, [
        h("div", { class: "mp-group__title", text: "数据" }),
        field("收藏", h("div", { class: "mp-field__value", text: state.favorites.length + " 首" })),
        field("歌单", h("div", { class: "mp-field__value", text: state.playlists.length + " 个" })),
        field("搜索历史", h("div", { class: "mp-field__value", text: state.searches.length + " 条" })),
        field("退出 App", exitBtn, "回到 Roche，音乐会继续放在后台播放"),
        field("卸载插件会一起清空", clearBtn, "插件数据存在宿主 storage 里，卸载即删除")
      ]);
      var about = h("div", { class: "mp-about" }, [
        h("div", { text: "音乐播放器 v" + state.version }),
        h("div", { text: "音源来自公开接口，仅供个人学习使用" }),
        h("div", { text: "歌曲版权归各平台与版权方所有" })
      ]);
      body.appendChild(appearanceGroup);
      body.appendChild(chatGroup);
      body.appendChild(sourceGroup);
      body.appendChild(neteaseGroup);
      body.appendChild(netGroup);
      body.appendChild(playGroup);
      body.appendChild(dataGroup);
      body.appendChild(about);
    }
    var view = h("div", { class: "mp-view" }, [header, body]);
    host.appendChild(view);
    render2();
    return {
      refresh: function() {
        var active = document.activeElement;
        if (active && active.tagName === "INPUT" && view.contains(active)) return;
        var scrollTop = body.scrollTop;
        render2();
        body.scrollTop = scrollTop;
      },
      destroy: function() {
        if (statsTimer) clearInterval(statsTimer);
        statsTimer = null;
      }
    };
  }

  // src/ui/views/now.js
  function mount7(host, ctx) {
    var state = ctx.state;
    var coverCheck = "";
    var timer = null;
    var showLyric = true;
    var lastActive = -2;
    var renderedKey = "";
    var userScrolledAt = 0;
    var coverBox = h("div", { class: "mp-now__cover" });
    var lyricBox = h("div", { class: "mp-now__lyric" });
    var stage = h("div", { class: "mp-now__stage" }, [coverBox, lyricBox]);
    var nameEl = h("div", { class: "mp-now__name", text: "未在播放" });
    var artistEl = h("div", { class: "mp-now__artist", text: "" });
    var fromEl = h("div", { class: "mp-now__from", text: "" });
    var curEl = h("div", { text: "00:00" });
    var durEl = h("div", { text: "00:00" });
    var trackFill = h("i");
    var trackBar = h("div", { class: "mp-now__track" }, [trackFill]);
    var playIcon = h("span", { html: icon("play") });
    var playBtn = h("button", { class: "mp-now__play", type: "button", "aria-label": "播放/暂停" }, [playIcon]);
    var queueBtn = iconBtn("queue", { label: "播放列表", onClick: function() {
      ctx.openQueueSheet();
    } });
    var modeBtn = iconBtn("repeat", { label: "播放模式", onClick: function() {
      ctx.openPlayModeSheet();
    } });
    var prevBtn = iconBtn("prev", { label: "上一首", onClick: function() {
      ctx.prev();
    } });
    var nextBtn = iconBtn("next", { label: "下一首", onClick: function() {
      ctx.next(false);
    } });
    var favBtn = iconBtn("heart", {
      label: "收藏",
      onClick: function() {
        if (state.player.track) ctx.toggleFavorite(state.player.track);
      }
    });
    var addBtn = iconBtn("plus", {
      label: "加入歌单",
      onClick: function() {
        if (state.player.track) ctx.openAddToPlaylist(state.player.track);
      }
    });
    var lyricToggle = iconBtn("lyric", {
      label: "歌词",
      onClick: function() {
        showLyric = !showLyric;
        sync();
      }
    });
    var moreBtn = iconBtn("more", {
      label: "更多",
      onClick: function() {
        if (state.player.track) ctx.openSongSheet(state.player.track, {});
      }
    });
    var head = h("div", { class: "mp-now__head" }, [
      iconBtn("back", { label: "返回", onClick: function() {
        ctx.closeNow();
      } }),
      fromEl,
      lyricToggle,
      moreBtn
    ]);
    playBtn.addEventListener("click", function() {
      ctx.togglePlay();
    });
    trackBar.addEventListener("click", function(e) {
      var st = state.player;
      var dur = st.duration || st.track && st.track.duration || 0;
      if (!dur) return;
      var rect = trackBar.getBoundingClientRect();
      var ratio = rect.width ? (e.clientX - rect.left) / rect.width : 0;
      ctx.seek(Math.max(0, Math.min(1, ratio)) * dur);
      sync();
    });
    lyricBox.addEventListener("scroll", function() {
      userScrolledAt = Date.now();
    });
    var view = h("div", { class: "mp-now" }, [
      head,
      stage,
      h("div", { class: "mp-now__meta" }, [nameEl, artistEl]),
      h("div", { class: "mp-now__progress" }, [
        trackBar,
        h("div", { class: "mp-now__times" }, [curEl, durEl])
      ]),
      h("div", { class: "mp-now__ctrl" }, [queueBtn, prevBtn, playBtn, nextBtn, modeBtn]),
      h("div", { class: "mp-now__extras" }, [favBtn, addBtn])
    ]);
    host.appendChild(view);
    function renderLyricList() {
      var lines = ctx.lyricLines();
      var key = state.player.track ? trackKey(state.player.track) + "|" + lines.length : "none";
      if (key === renderedKey) return;
      renderedKey = key;
      lastActive = -2;
      clear(lyricBox);
      if (!lines.length) {
        lyricBox.appendChild(h("div", {
          class: "mp-lyric__empty",
          text: ctx.lyricLoading() ? "歌词加载中…" : "暂无歌词"
        }));
        return;
      }
      lines.forEach(function(line) {
        var node = h("div", { class: "mp-lyric__line", text: line.text || "♪" });
        node.addEventListener("click", function() {
          ctx.seek(line.time);
        });
        lyricBox.appendChild(node);
      });
      var pad = Math.max(24, Math.round(lyricBox.clientHeight * 0.38));
      lyricBox.style.paddingTop = pad + "px";
      lyricBox.style.paddingBottom = pad + "px";
    }
    function syncLyric(ms) {
      if (!showLyric) return;
      var lines = ctx.lyricLines();
      if (!lines.length) return;
      var index = activeLineIndex(lines, ms);
      if (index === lastActive) return;
      lastActive = index;
      var nodes = lyricBox.children;
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].classList.toggle("is-active", i === index);
      }
      var node = nodes[index];
      if (node && Date.now() - userScrolledAt > 2500) {
        var top = node.offsetTop - lyricBox.clientHeight / 2 + node.offsetHeight / 2;
        if (typeof lyricBox.scrollTo === "function") {
          lyricBox.scrollTo({ top, behavior: "smooth" });
        } else {
          lyricBox.scrollTop = top;
        }
      }
    }
    function sync() {
      var st = state.player;
      var track = st.track;
      if (!track) {
        nameEl.textContent = "未在播放";
        artistEl.textContent = "去搜索页找首歌吧";
        fromEl.textContent = "";
        curEl.textContent = "00:00";
        durEl.textContent = "00:00";
        trackFill.style.width = "0%";
        coverBox.style.display = "";
        lyricBox.style.display = "none";
        return;
      }
      var coverUrl = ctx.coverOf(track);
      var check = trackKey(track) + "|" + coverUrl;
      if (check !== coverCheck) {
        coverCheck = check;
        fillCover(coverBox, coverUrl);
      }
      nameEl.textContent = track.name;
      artistEl.textContent = track.artist + (track.album ? " · " + track.album : "");
      fromEl.textContent = track.source === "itunes" ? "iTunes 试听" : "QQ 音乐";
      var dur = st.duration || track.duration || 0;
      var cur = Math.min(st.time || 0, dur || st.time || 0);
      curEl.textContent = fmtTime(cur);
      durEl.textContent = dur ? fmtTime(dur) : "--:--";
      trackFill.style.width = (dur > 0 ? Math.min(100, cur / dur * 100) : 0).toFixed(2) + "%";
      playIcon.innerHTML = icon(st.status === "playing" ? "pause" : "play");
      var mode = state.settings.playMode;
      modeBtn.innerHTML = icon(mode === "one" ? "repeatOne" : mode === "shuffle" ? "shuffle" : "repeat");
      modeBtn.classList.toggle("is-active", true);
      var fav = state.favorites.some(function(t) {
        return trackKey(t) === trackKey(track);
      });
      favBtn.innerHTML = icon(fav ? "heartFull" : "heart");
      favBtn.classList.toggle("is-active", fav);
      renderLyricList();
      var hasLyric = ctx.lyricLines().length > 0;
      lyricToggle.classList.toggle("is-active", showLyric && hasLyric);
      coverBox.style.display = showLyric && hasLyric ? "none" : "";
      lyricBox.style.display = showLyric && hasLyric ? "" : "none";
      if (showLyric && hasLyric) syncLyric(cur);
    }
    sync();
    timer = setInterval(sync, 400);
    return {
      refresh: sync,
      destroy: function() {
        if (timer) clearInterval(timer);
        timer = null;
      }
    };
  }

  // src/app/shell.js
  function createShell(container, ctx) {
    ensureStyle();
    var root = h("div", { class: "mp-root" });
    var viewHost = h("div", { class: "mp-view-host" });
    var coverBox = h("div", { class: "mp-player__cover" });
    var nameEl = h("div", { class: "mp-player__name" });
    var subEl = h("div", { class: "mp-player__sub" });
    var playIcon = h("span", { html: icon("play") });
    var playBtn = h("button", { class: "mp-player__play", type: "button", "aria-label": "播放/暂停" }, [playIcon]);
    var barFill = h("i");
    var bar = h("div", { class: "mp-player__bar" }, [barFill]);
    var mainBtn = h("button", { class: "mp-player__main mp-player__hit", type: "button" }, [nameEl, subEl]);
    var playerEl = h("div", { class: "mp-player" }, [bar, coverBox, mainBtn, playBtn]);
    var floatLyric = h("div", { class: "mp-float-lyric" });
    var dockEl = h("nav", { class: "mp-dock" });
    root.appendChild(viewHost);
    root.appendChild(floatLyric);
    root.appendChild(playerEl);
    root.appendChild(dockEl);
    container.replaceChildren(root);
    var disposeTheme = null;
    var page = null;
    var playerCoverKey = "";
    var lastLyricText = "";
    function isNow() {
      return ctx.state.route === "now";
    }
    function activeTab() {
      return tabOf(ctx.state.route);
    }
    function hexToRgba(hex, alpha) {
      var text = String(hex || "").replace("#", "");
      if (text.length !== 6) return "rgba(0,0,0," + alpha + ")";
      var r = parseInt(text.slice(0, 2), 16);
      var g = parseInt(text.slice(2, 4), 16);
      var b = parseInt(text.slice(4, 6), 16);
      return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    }
    function applyAppearance() {
      var s = ctx.state.settings;
      root.dataset.accent = s.accent || "red";
      if (s.accentColor) {
        root.style.setProperty("--mp-accent", s.accentColor);
        root.style.setProperty("--mp-accent-soft", hexToRgba(s.accentColor, 0.16));
      } else {
        root.style.removeProperty("--mp-accent");
        root.style.removeProperty("--mp-accent-soft");
      }
      if (disposeTheme) {
        disposeTheme();
        disposeTheme = null;
      }
      if (s.theme === "auto") {
        disposeTheme = watchTheme(root);
      } else {
        root.dataset.theme = s.theme === "dark" ? "dark" : "light";
      }
    }
    function keyboardOpen() {
      var shrunk = false;
      if (typeof window !== "undefined" && window.visualViewport && window.innerHeight) {
        shrunk = window.innerHeight - window.visualViewport.height > 120;
      }
      var focused = false;
      try {
        var active = document.activeElement;
        focused = !!(active && root.contains(active) && (active.tagName === "INPUT" || active.tagName === "TEXTAREA"));
      } catch (err) {
      }
      return shrunk || focused;
    }
    function syncKeyboard() {
      root.classList.toggle("is-keyboard", keyboardOpen());
    }
    function onViewportChange() {
      syncKeyboard();
    }
    function onFocusIn() {
      setTimeout(syncKeyboard, 60);
    }
    function onFocusOut() {
      setTimeout(syncKeyboard, 120);
    }
    window.addEventListener("resize", onViewportChange);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onViewportChange);
      window.visualViewport.addEventListener("scroll", onViewportChange);
    }
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    var keyboardTimer = setInterval(syncKeyboard, 300);
    function renderDock() {
      clear(dockEl);
      dockEl.style.display = isNow() ? "none" : "flex";
      var active = activeTab();
      TAB_ITEMS.forEach(function(tab) {
        var btn = h("button", {
          class: "mp-dock__btn" + (tab.id === active ? " is-active" : ""),
          type: "button"
        }, [
          h("span", { html: icon(tab.icon) }),
          h("span", { text: tab.name })
        ]);
        btn.addEventListener("click", function() {
          if (ctx.state.route !== tab.id) ctx.goto(tab.id);
        });
        dockEl.appendChild(btn);
      });
    }
    function renderFloatLyric() {
      var st = ctx.state.player;
      var s = ctx.state.settings;
      var lines = ctx.lyricLines();
      var visible = false;
      if (!visible) {
        floatLyric.style.display = "none";
        return;
      }
      var index = activeLineIndex(lines, st.time);
      var text = index >= 0 ? lines[index].text : "";
      floatLyric.style.display = text ? "block" : "none";
      if (text && text !== lastLyricText) {
        lastLyricText = text;
        clear(floatLyric);
        floatLyric.appendChild(document.createTextNode(text));
        floatLyric.classList.remove("is-fresh");
        void floatLyric.offsetWidth;
        floatLyric.classList.add("is-fresh");
      }
    }
    function renderPlayer() {
      var st = ctx.state.player;
      if (!st.track || isNow()) {
        playerEl.style.display = "none";
        renderFloatLyric();
        return;
      }
      playerEl.style.display = "flex";
      var coverUrl = ctx.coverOf(st.track);
      var key = trackKey(st.track) + "|" + coverUrl;
      if (key !== playerCoverKey) {
        playerCoverKey = key;
        fillCover(coverBox, coverUrl);
      }
      nameEl.textContent = st.track.name;
      var tail = "";
      if (st.status === "loading") tail = " · 加载中…";
      else if (st.status === "error") tail = " · " + (st.error || "播放失败");
      subEl.textContent = st.track.artist + tail;
      playIcon.innerHTML = icon(st.status === "playing" ? "pause" : "play");
      var dur = st.duration || st.track.duration || 0;
      var pct = dur > 0 ? Math.min(100, st.time / dur * 100) : 0;
      barFill.style.width = pct.toFixed(2) + "%";
      renderFloatLyric();
    }
    function renderView() {
      if (page && page.destroy) {
        try {
          page.destroy();
        } catch (err) {
        }
      }
      page = null;
      clear(viewHost);
      var route = ctx.state.route;
      if (route === "recommend") page = mount(viewHost, ctx);
      else if (route === "search") page = mount2(viewHost, ctx);
      else if (route === "playlists") page = mount3(viewHost, ctx);
      else if (route === "playlist") page = mount4(viewHost, ctx);
      else if (route === "favorites") page = mount5(viewHost, ctx);
      else if (route === "settings") page = mount6(viewHost, ctx);
      else if (route === "now") page = mount7(viewHost, ctx);
    }
    function renderAll() {
      applyAppearance();
      renderDock();
      renderView();
      renderPlayer();
      syncKeyboard();
    }
    function refreshPage() {
      if (page && typeof page.refresh === "function") {
        try {
          page.refresh();
        } catch (err) {
        }
      }
    }
    function applyCover(key, url) {
      var nodes = root.querySelectorAll('[data-cover="' + key + '"]');
      for (var i = 0; i < nodes.length; i++) fillCover(nodes[i], url);
      if (ctx.state.player.track && trackKey(ctx.state.player.track) === key) {
        playerCoverKey = "";
        renderPlayer();
      }
    }
    mainBtn.addEventListener("click", function() {
      ctx.openNow();
    });
    playBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      ctx.togglePlay();
    });
    bar.addEventListener("click", function(e) {
      var dur = ctx.state.player.duration || ctx.state.player.track && ctx.state.player.track.duration || 0;
      if (!dur) return;
      var rect = bar.getBoundingClientRect();
      var ratio = rect.width ? (e.clientX - rect.left) / rect.width : 0;
      ctx.seek(Math.max(0, Math.min(1, ratio)) * dur);
    });
    function openPrefsPanel() {
      if (!ctx.prefs || !ctx.savePrefs) return;
      var mask = h("div", { class: "mp-mask" });
      var body = h("div", { class: "mp-sheet__body mp-prefs" });
      function close() {
        if (mask.parentNode) mask.parentNode.removeChild(mask);
      }
      function renderPanel() {
        clear(body);
        var mode = ctx.state.settings && ctx.state.settings.recMode || "manual";
        var modeRow = h("div", { class: "mp-theme-row mp-prefs__modes" });
        [
          { id: "manual", name: "换一批才调" },
          { id: "auto", name: "每次进入调" },
          { id: "local", name: "不调模型" }
        ].forEach(function(item) {
          var btn = h("button", {
            class: "mp-theme-btn" + (mode === item.id ? " is-active" : ""),
            type: "button",
            text: item.name
          });
          btn.addEventListener("click", function() {
            ctx.updateSettings({ recMode: item.id });
            renderPanel();
          });
          modeRow.appendChild(btn);
        });
        body.appendChild(h("div", { class: "mp-prefs__head" }, [
          h("div", { class: "mp-prefs__title", text: "推荐模式" }),
          modeRow
        ]));
        var list = ctx.prefs();
        body.appendChild(h("div", { class: "mp-prefs__hint", text: "拖动条表示这类偏好的重要程度，越靠右越影响推荐" }));
        list.forEach(function(pref) {
          var weightText = h("span", { class: "mp-prefs__weight", text: pref.weight + "%" });
          var slider = h("input", {
            class: "mp-prefs__slider",
            type: "range",
            min: "0",
            max: "100",
            step: "5",
            value: String(pref.weight)
          });
          slider.addEventListener("input", function() {
            weightText.textContent = slider.value + "%";
          });
          slider.addEventListener("change", function() {
            ctx.savePrefs(updatePref(ctx.prefs(), pref.id, { weight: Number(slider.value) }));
            renderPanel();
          });
          var editBtn = h("button", { class: "mp-prefs__edit", type: "button", text: pref.prompt ? "改提示词" : "写提示词" });
          editBtn.addEventListener("click", function() {
            openPrompt(root, {
              title: pref.label + " · 提示词",
              value: pref.prompt || "",
              placeholder: "例如：偏华语流行、独立民谣",
              onSubmit: function(text) {
                ctx.savePrefs(updatePref(ctx.prefs(), pref.id, { prompt: text }));
                renderPanel();
              }
            });
          });
          var row = h("div", { class: "mp-prefs__item" }, [
            h("div", { class: "mp-prefs__row" }, [
              h("div", { class: "mp-prefs__label", text: pref.label }),
              weightText,
              pref.builtin ? h("span", { class: "mp-prefs__tag", text: "内置" }) : null
            ]),
            slider,
            h("div", { class: "mp-prefs__foot" }, [
              h("div", { class: "mp-prefs__prompt", text: pref.prompt || "（还没有提示词）" }),
              editBtn,
              pref.builtin ? null : (function() {
                var del = h("button", { class: "mp-prefs__del", type: "button", text: "删除" });
                del.addEventListener("click", function() {
                  var res = removePref(ctx.prefs(), pref.id);
                  if (!res.removed) {
                    ctx.toast(res.reason === "builtin" ? "内置偏好不能删" : "至少保留一条偏好");
                    return;
                  }
                  ctx.savePrefs(res.list);
                  renderPanel();
                });
                return del;
              })()
            ].filter(Boolean))
          ]);
          body.appendChild(row);
        });
        var addBtn = h("button", { class: "mp-prefs__add", type: "button", text: "＋ 新增偏好" });
        addBtn.addEventListener("click", function() {
          openPrompt(root, {
            title: "新增偏好",
            value: "",
            placeholder: "例如：通勤路上 / 健身房",
            onSubmit: function(label) {
              var res = addPref(ctx.prefs(), label, "");
              if (!res.pref) {
                ctx.toast("偏好数量已达上限");
                return;
              }
              ctx.savePrefs(res.list);
              renderPanel();
            }
          });
        });
        body.appendChild(addBtn);
      }
      var sheet = h("div", { class: "mp-sheet mp-prefs__sheet" }, [
        h("div", { class: "mp-sheet__head" }, [
          h("div", { class: "mp-sheet__title", text: "推荐偏好" }),
          (function() {
            var btn = h(
              "button",
              { class: "mp-icon-btn", type: "button", "aria-label": "关闭" },
              [h("span", { html: icon("close") })]
            );
            btn.addEventListener("click", close);
            return btn;
          })()
        ]),
        body
      ]);
      mask.addEventListener("click", function(e) {
        if (e.target === mask) close();
      });
      mask.appendChild(sheet);
      root.appendChild(mask);
      renderPanel();
    }
    applyAppearance();
    renderAll();
    return {
      root,
      mount: function() {
        renderAll();
      },
      renderAll,
      renderDock,
      renderPlayer,
      renderView,
      refreshPage,
      applyAppearance,
      applyCover,
      openPrefsPanel: function() {
        openPrefsPanel();
      },
      openSheet: function(options) {
        return openSheet(root, options);
      },
      openPrompt: function(options) {
        return openPrompt(root, options);
      },
      openEditor: function(options) {
        return openEditor(root, options);
      },
      destroy: function() {
        if (page && page.destroy) {
          try {
            page.destroy();
          } catch (err) {
          }
        }
        page = null;
        if (disposeTheme) {
          disposeTheme();
          disposeTheme = null;
        }
        window.removeEventListener("resize", onViewportChange);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener("resize", onViewportChange);
          window.visualViewport.removeEventListener("scroll", onViewportChange);
        }
        root.removeEventListener("focusin", onFocusIn);
        root.removeEventListener("focusout", onFocusOut);
        if (keyboardTimer) clearInterval(keyboardTimer);
        keyboardTimer = null;
        playerCoverKey = "";
        lastLyricText = "";
      }
    };
  }

  // src/chat/bridge.js
  var api = null;
  var snapshot = null;
  function setBridge(next) {
    api = next || null;
  }
  function clearBridge() {
    api = null;
  }
  function getBridge() {
    return api;
  }
  function saveSnapshot(data) {
    snapshot = data || null;
  }
  function getSnapshot() {
    return snapshot;
  }

  // src/chat/listenState.js
  var map = /* @__PURE__ */ Object.create(null);
  function hydrate(raw) {
    map = /* @__PURE__ */ Object.create(null);
    if (!raw || typeof raw !== "object") return;
    Object.keys(raw).forEach(function(key) {
      if (raw[key] === false) map[key] = false;
    });
  }
  function setState(conversationId, on) {
    if (!conversationId) return;
    if (on) delete map[conversationId];
    else map[conversationId] = false;
  }
  function isOn(conversationId, globalOn) {
    if (!globalOn) return false;
    if (!conversationId) return true;
    return map[conversationId] !== false;
  }
  function toJSON() {
    var out = {};
    Object.keys(map).forEach(function(key) {
      if (map[key] === false) out[key] = false;
    });
    return out;
  }

  // src/chat/listenPanel.js
  var REFRESH_MS = 2e3;
  async function openListenPanel(message, roche) {
    ensureStyle();
    var settings = normalizeSettings(await roche.storage.get("mp:settings", null));
    var sources = createSources();
    var native = createNativeAudio();
    var timer = null;
    var tab = "queue";
    var searching = false;
    var lastIsPlaying = false;
    var searchTracks = [];
    var tabs = h("div", { class: "mp-listen__tabs" });
    var coverBox = h("div", { class: "mp-listen__cover" });
    var nameEl = h("div", { class: "mp-listen__name", text: "还没在放歌" });
    var artistEl = h("div", { class: "mp-listen__artist", text: "" });
    var playIcon = h("span", { html: icon("play") });
    var rows = h("div", { class: "mp-listen__list" });
    var input = h("input", {
      class: "mp-modal__input",
      type: "text",
      inputmode: "search",
      placeholder: "搜歌名 / 歌手，回车搜索"
    });
    var modal = h("div", { class: "mp-modal" });
    function close() {
      if (timer) clearInterval(timer);
      timer = null;
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    }
    async function currentStatus() {
      var res = await native.getStatus();
      var st = res && res.status || {};
      if (st.title) {
        return {
          playing: { name: st.title, artist: st.artist, cover: "" },
          isPlaying: !!st.isPlaying,
          queueSize: st.queueSize || 0
        };
      }
      var bridge = getBridge();
      if (bridge && bridge.ready()) {
        var live = bridge.status();
        if (live && live.playing) return live;
      }
      var snap = getSnapshot();
      if (snap && snap.track) {
        return {
          playing: snap.track,
          isPlaying: !!snap.isPlaying,
          queueSize: snap.queue && snap.queue.tracks ? snap.queue.tracks.length : 0
        };
      }
      return { playing: null, isPlaying: false, queueSize: 0 };
    }
    function queueList() {
      var bridge = getBridge();
      if (bridge && bridge.ready()) {
        var live = bridge.queue();
        if (live && live.length) return live;
      }
      var snap = getSnapshot();
      var queue = snap && snap.queue;
      if (!queue || !queue.tracks || !queue.tracks.length) return [];
      var currentKey = snap.track ? trackKey(snap.track) : "";
      return queue.tracks.slice(0, 60).map(function(track) {
        return {
          key: trackKey(track),
          name: track.name,
          artist: track.artist,
          cover: track.cover || "",
          current: currentKey && trackKey(track) === currentKey,
          track
        };
      });
    }
    async function refreshNow() {
      var status = await currentStatus();
      lastIsPlaying = !!(status && status.isPlaying);
      var track = status && status.playing;
      clear(coverBox);
      if (track && track.cover) fillCover(coverBox, track.cover);
      else coverBox.innerHTML = icon("music");
      nameEl.textContent = track ? track.name : "还没在放歌";
      artistEl.textContent = track ? track.artist || "" : "搜索一首歌开始一起听";
      playIcon.innerHTML = icon(status && status.isPlaying ? "pause" : "play");
    }
    function row(title, sub, onClick, active) {
      var btn = h("button", { class: "mp-modal__row" + (active ? " is-active" : ""), type: "button" }, [
        h("span", { text: title }),
        sub ? h("span", { class: "mp-listen__sub", text: sub }) : null
      ]);
      btn.addEventListener("click", function() {
        onClick();
      });
      return btn;
    }
    async function renderQueue() {
      clear(rows);
      var list = queueList();
      if (!list.length) {
        rows.appendChild(h("div", { class: "mp-modal__hint", text: "队列是空的，上面搜一首歌试试" }));
        return;
      }
      list.slice(0, 50).forEach(function(item) {
        rows.appendChild(row(item.name, item.artist, function() {
          var bridge = getBridge();
          if (bridge && bridge.ready()) bridge.playKey(item.key);
          else if (item.track) nativePlayList([item.track], 0);
        }, item.current));
      });
    }
    async function renderSearch() {
      clear(rows);
      if (!searchTracks.length) {
        rows.appendChild(h("div", { class: "mp-modal__hint", text: "输入歌名或歌手，回车搜索" }));
        return;
      }
      searchTracks.forEach(function(track) {
        rows.appendChild(row(track.name, track.artist, function() {
          playFrom([track], 0);
          setTab("queue");
        }));
      });
    }
    async function renderPlaylists() {
      clear(rows);
      var snap = getSnapshot();
      var list = snap && snap.playlists || [];
      var favorites = snap && snap.favorites || [];
      if (!list.length) {
        try {
          list = await roche.storage.get("mp:playlists", []) || [];
        } catch (err) {
          list = [];
        }
      }
      if (!favorites.length) {
        try {
          favorites = await roche.storage.get("mp:favorites", []) || [];
        } catch (err) {
          favorites = [];
        }
      }
      var favTracks = (favorites || []).map(function(t) {
        return normalizeTrack(t, t && t.source);
      }).filter(Boolean);
      rows.appendChild(row("我的收藏", favTracks.length + " 首", function() {
        playPlaylist({ name: "我的收藏", tracks: favTracks });
      }));
      if (list && list.length) {
        list.forEach(function(pl) {
          rows.appendChild(row(pl.name + (pl.owner === "char" ? "（TA）" : ""), (pl.tracks || []).length + " 首", function() {
            playPlaylist(pl);
          }));
        });
      } else {
        rows.appendChild(h("div", { class: "mp-modal__hint", text: "还没有自建歌单，收藏的歌在最上面" }));
      }
    }
    async function playPlaylist(pl) {
      var tracks = (pl.tracks || []).map(function(t) {
        return normalizeTrack(t, t && t.source);
      }).filter(Boolean).slice(0, 30);
      if (!tracks.length) {
        rows.appendChild(h("div", { class: "mp-modal__hint", text: "这个歌单还是空的" }));
        return;
      }
      var bridge = getBridge();
      if (bridge && bridge.ready() && typeof bridge.playList === "function") {
        await bridge.playList(tracks, 0);
      } else {
        await nativePlayList(tracks, 0);
      }
      await refreshNow();
      setTab("queue");
    }
    async function doSearch() {
      var keyword = String(input.value || "").trim();
      if (!keyword) {
        searchTracks = [];
        renderList();
        return;
      }
      searching = true;
      clear(rows);
      rows.appendChild(h("div", { class: "mp-modal__hint", text: "搜索中…" }));
      var result = await sources.search(keyword, settings, { limit: 20 });
      searchTracks = result.tracks || [];
      renderList();
    }
    function renderList() {
      if (searching && searchTracks.length) return renderSearch();
      if (tab === "playlists") return renderPlaylists();
      return renderQueue();
    }
    function renderTabs() {
      clear(tabs);
      [["queue", "播放列表"], ["playlists", "歌单"]].forEach(function(item) {
        var btn = h("button", {
          class: "mp-listen__tab" + (tab === item[0] ? " is-active" : ""),
          type: "button",
          text: item[1]
        });
        btn.addEventListener("click", function() {
          setTab(item[0]);
        });
        tabs.appendChild(btn);
      });
    }
    function setTab(next) {
      tab = next;
      searching = false;
      renderTabs();
      renderList();
    }
    async function nativePlayList(tracks, index) {
      var slice = (tracks || []).slice(index, index + 5);
      var nativeTracks = [];
      for (var i = 0; i < slice.length; i++) {
        var track = slice[i];
        try {
          var resolver = sources.createResolver(track, settings);
          var url = await resolver();
          if (!url) continue;
          nativeTracks.push({
            id: trackKey(track),
            albumId: track.album || "",
            title: track.name,
            artist: track.artist || "",
            cover: track.cover || "",
            url
          });
        } catch (err) {
        }
      }
      if (!nativeTracks.length) return false;
      await native.replaceQueue({ tracks: nativeTracks, startIndex: 0, mode: "loop", autoplay: true });
      return true;
    }
    async function playFrom(tracks, index) {
      var bridge = getBridge();
      if (bridge && bridge.ready()) {
        if (typeof bridge.addAndPlay === "function") {
          await bridge.addAndPlay(tracks, index);
          return;
        }
        await bridge.playList(tracks, index);
        return;
      }
      var ok = await nativePlayList(tracks, index);
      if (!ok) nameEl.textContent = "这首放不了，换一首";
    }
    async function control(action) {
      var bridge = getBridge();
      if (bridge && bridge.ready()) {
        await bridge.control(action);
        return;
      }
      if (action === "next" || action === "previous") {
        await native[action]();
        return;
      }
      if (action === "toggle") action = lastIsPlaying ? "pause" : "resume";
      if (action === "pause") await native.pause();
      else if (action === "resume") await native.play();
    }
    var playBtn = h("button", { class: "mp-listen__btn", type: "button", "aria-label": "播放/暂停" }, [playIcon]);
    playBtn.addEventListener("click", async function() {
      await control("toggle");
      await refreshNow();
    });
    var prevBtn = h(
      "button",
      { class: "mp-listen__btn", type: "button", "aria-label": "上一首" },
      [h("span", { html: icon("prev") })]
    );
    prevBtn.addEventListener("click", async function() {
      await control("previous");
      await refreshNow();
    });
    var nextBtn = h(
      "button",
      { class: "mp-listen__btn", type: "button", "aria-label": "下一首" },
      [h("span", { html: icon("next") })]
    );
    nextBtn.addEventListener("click", async function() {
      await control("next");
      await refreshNow();
    });
    var closeBtn = h(
      "button",
      { class: "mp-icon-btn", type: "button", "aria-label": "关闭" },
      [h("span", { html: icon("close") })]
    );
    closeBtn.addEventListener("click", close);
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
        doSearch();
      }
    });
    var openAppBtn = h("button", { class: "mp-listen__open", type: "button", text: "打开音乐 App" });
    openAppBtn.addEventListener("click", function() {
      close();
      try {
        if (roche && roche.ui && typeof roche.ui.openApp === "function") roche.ui.openApp("music-player-home");
      } catch (err) {
      }
    });
    var stopBtn = h("button", { class: "mp-listen__stop", type: "button", text: "结束一起听" });
    stopBtn.addEventListener("click", async function() {
      var cid = message && message.conversationId;
      setState(cid, false);
      try {
        await roche.storage.set("mp:listen", toJSON());
      } catch (err) {
      }
      try {
        if (roche && roche.ui && typeof roche.ui.toast === "function") {
          roche.ui.toast("已结束一起听，这个聊天里不会再自动点歌");
        }
      } catch (err) {
      }
      close();
    });
    var panel = h("div", { class: "mp-modal__panel mp-listen" }, [
      h("div", { class: "mp-modal__head" }, [
        h("div", { class: "mp-modal__title", text: "一起听" }),
        closeBtn
      ]),
      h("div", { class: "mp-listen__now" }, [
        coverBox,
        h("div", { class: "mp-listen__meta" }, [nameEl, artistEl]),
        h("div", { class: "mp-listen__ctrl" }, [prevBtn, playBtn, nextBtn])
      ]),
      h("div", { class: "mp-modal__head" }, [
        h("span", { html: icon("search"), class: "mp-listen__searchicon" }),
        input
      ]),
      tabs,
      rows,
      h("div", { class: "mp-listen__foot" }, [openAppBtn, stopBtn])
    ]);
    modal.appendChild(panel);
    modal.addEventListener("click", function(e) {
      if (e.target === modal) close();
    });
    document.body.appendChild(modal);
    var convId = message && message.conversationId;
    if (convId) {
      setState(convId, true);
      try {
        await roche.storage.set("mp:listen", toJSON());
      } catch (err) {
      }
    }
    renderTabs();
    refreshNow();
    renderList();
    timer = setInterval(refreshNow, REFRESH_MS);
    return close;
  }

  // src/chat/card.js
  var MESSAGE_TYPE = "mp-listen";
  var PENDING_KEY = "mp:pending";
  function statusText(status) {
    if (status === "listening") return "正在一起听";
    if (status === "ended") return "一起听已结束";
    return "邀请你一起听";
  }
  function openAppWithTrack(roche, track) {
    try {
      if (track && roche && roche.storage) roche.storage.set(PENDING_KEY, track);
    } catch (err) {
    }
    try {
      if (roche && roche.ui && typeof roche.ui.openApp === "function") {
        roche.ui.openApp("music-player-home");
      }
    } catch (err) {
    }
  }
  function render(container, message, roche) {
    ensureStyle();
    var data = message.cardData || {};
    var track = normalizeTrack(data.track, "local") || {};
    var coverUrl = data.cover || track.cover || "";
    var cover = h("div", { class: "mp-card__cover" });
    fillCover(cover, coverUrl);
    var name = h("div", { class: "mp-card__name", text: track.name || data.title || "一起听" });
    var artistText = String(track.artist || "");
    if (artistText.length > 6) artistText = artistText.slice(0, 6) + "…";
    var sub = h("div", {
      class: "mp-card__sub",
      text: [artistText, statusText(data.status)].filter(Boolean).join(" · ")
    });
    var act = h("button", { class: "mp-card__act", type: "button", text: data.status === "listening" ? "打开" : "一起听" });
    act.addEventListener("click", function(e) {
      e.stopPropagation();
      try {
        if (roche && roche.chat && typeof roche.chat.dispatchCardAction === "function") {
          roche.chat.dispatchCardAction({
            conversationId: message.conversationId,
            messageId: message.id,
            action: "open",
            payload: { trackKey: trackKey(track) }
          });
        } else {
          openAppWithTrack(roche, track);
        }
      } catch (err) {
        openAppWithTrack(roche, track);
      }
    });
    var card = h("div", { class: "mp-card" }, [
      cover,
      h("div", { class: "mp-card__main" }, [name, sub]),
      act
    ]);
    clear(container);
    container.appendChild(card);
  }
  function mountCard(container, message, roche) {
    render(container, message, roche);
  }
  function updateCard(container, message, roche) {
    render(container, message, roche);
  }
  function unmountCard() {
  }
  async function playCardTrack(track, roche) {
    if (!track) return false;
    var bridge = getBridge();
    if (bridge && bridge.ready()) {
      try {
        var res = await bridge.playKey(trackKey(track));
        if (res && res.ok) return true;
        var added = await bridge.addAndPlay([track], 0);
        return !!(added && added.ok);
      } catch (err) {
      }
    }
    var native = typeof window !== "undefined" && window.Capacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins.BackgroundAudio : null;
    if (!native || typeof native.replaceQueue !== "function") return false;
    try {
      var settings = normalizeSettings(roche && roche.storage ? await roche.storage.get("mp:settings", null) : null);
      var sources = createSources();
      var url = "";
      try {
        url = await sources.createResolver(track, settings)();
      } catch (err) {
        url = "";
      }
      if (!url) return false;
      await native.replaceQueue({
        tracks: [{
          id: trackKey(track),
          albumId: track.album || "",
          title: track.name || "未知歌曲",
          artist: track.artist || "",
          cover: track.cover || "",
          url
        }],
        startIndex: 0,
        mode: "loop",
        autoplay: true
      });
      return true;
    } catch (err) {
      return false;
    }
  }
  async function onCardAction(message, action, payload, roche) {
    if (action !== "open") return;
    rememberCard(message, roche);
    var settings = normalizeSettings(null);
    try {
      settings = normalizeSettings(roche && roche.storage ? await roche.storage.get("mp:settings", null) : null);
    } catch (err) {
    }
    var track = normalizeTrack(message && message.cardData ? message.cardData.track : null, "local");
    if (settings.cardTapPlay && track) {
      var snap = getSnapshot();
      if (!(snap && snap.track && trackKey(snap.track) === trackKey(track))) {
        playCardTrack(track, roche).catch(function() {
        });
      }
    }
    openListenPanel(message, roche);
  }
  function closeModal(modal) {
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  }
  async function sendCard(roche, ctx, track, settings) {
    var cover = track.cover || "";
    var line = "我邀请你一起听《" + track.name + "》- " + track.artist + "。";
    try {
      await roche.chat.createCard({
        conversationId: ctx.conversationId,
        messageType: MESSAGE_TYPE,
        isMe: true,
        cardData: {
          track,
          cover,
          status: "invite",
          at: Date.now()
        },
        modelText: line
      });
      if (roche.ui && roche.ui.toast) roche.ui.toast("邀请卡片已发出");
      return true;
    } catch (err) {
      if (roche.ui && roche.ui.toast) roche.ui.toast("发卡片失败：宿主版本可能不支持");
      return false;
    }
  }
  async function openPlusAction(ctx, roche) {
    ensureStyle();
    if (!roche || !roche.chat || typeof roche.chat.createCard !== "function") {
      if (roche && roche.ui && roche.ui.toast) roche.ui.toast("当前宿主不支持发卡片");
      return;
    }
    var snap = getSnapshot();
    var settings = normalizeSettings(snap && snap.settings || await roche.storage.get("mp:settings", null));
    var favorites = snap && snap.favorites || await roche.storage.get("mp:favorites", []) || [];
    var playlists = snap && snap.playlists || await roche.storage.get("mp:playlists", []) || [];
    var sources = createSources();
    var bridge = getBridge();
    var live = bridge && bridge.ready() ? bridge.queue() : null;
    var queueTracks = live && live.length ? live.map(function(x) {
      return x.track;
    }).filter(Boolean) : snap && snap.queue && snap.queue.tracks ? snap.queue.tracks.slice() : [];
    var nowPlaying = bridge && bridge.ready() && bridge.status().playing || snap && snap.track || null;
    var listBox = h("div", { class: "mp-modal__body" });
    var tabs = h("div", { class: "mp-listen__tabs" });
    var tab = queueTracks.length ? "queue" : "playlists";
    var searchTracks = [];
    var input = h("input", {
      class: "mp-modal__input",
      type: "text",
      inputmode: "search",
      placeholder: "搜歌名 / 歌手，或从下面直接选"
    });
    var modal = h("div", { class: "mp-modal" });
    function close() {
      closeModal(modal);
    }
    function rowFor(track) {
      var row = h("button", { class: "mp-modal__row", type: "button" }, [
        h("span", { text: track.name }),
        h("span", { class: "mp-listen__sub", text: track.artist || "" })
      ]);
      row.addEventListener("click", async function() {
        row.disabled = true;
        var ok = await sendCard(roche, ctx, track, settings);
        if (ok) {
          try {
            if (!(getSnapshot() && getSnapshot().track && trackKey(getSnapshot().track) === trackKey(track))) {
              await playCardTrack(track, roche);
            }
          } catch (err) {
          }
        }
        row.disabled = false;
        if (ok) close();
      });
      return row;
    }
    function renderList(tracks, emptyText) {
      clear(listBox);
      if (!tracks.length) {
        listBox.appendChild(h("div", { class: "mp-modal__hint", text: emptyText }));
        return;
      }
      tracks.slice(0, 40).forEach(function(t) {
        listBox.appendChild(rowFor(t));
      });
    }
    function renderTabs() {
      clear(tabs);
      [["queue", "播放列表"], ["playlists", "歌单"]].forEach(function(item) {
        var btn = h("button", {
          class: "mp-listen__tab" + (tab === item[0] ? " is-active" : ""),
          type: "button",
          text: item[1]
        });
        btn.addEventListener("click", function() {
          tab = item[0];
          input.value = "";
          searchTracks = [];
          renderTabs();
          renderBody();
        });
        tabs.appendChild(btn);
      });
    }
    function renderPlaylists() {
      clear(listBox);
      var favTracks = (favorites || []).map(function(t) {
        return normalizeTrack(t, t && t.source);
      }).filter(Boolean);
      var favRow = h("button", { class: "mp-modal__row", type: "button" }, [
        h("span", { text: "我的收藏" }),
        h("span", { class: "mp-listen__sub", text: favTracks.length + " 首" })
      ]);
      favRow.addEventListener("click", function() {
        renderList(favTracks, "还没有收藏");
      });
      listBox.appendChild(favRow);
      if (!playlists.length) {
        listBox.appendChild(h("div", { class: "mp-modal__hint", text: "还没有自建歌单，收藏的歌在上面" }));
        return;
      }
      playlists.forEach(function(pl) {
        var count = (pl.tracks || []).length;
        var row = h("button", { class: "mp-modal__row", type: "button" }, [
          h("span", { text: pl.name }),
          h("span", { class: "mp-listen__sub", text: count + " 首" })
        ]);
        row.addEventListener("click", function() {
          var tracks = (pl.tracks || []).map(function(t) {
            return normalizeTrack(t, t && t.source);
          }).filter(Boolean);
          renderList(tracks, "这个歌单还是空的");
        });
        listBox.appendChild(row);
      });
    }
    function renderBody() {
      if (tab === "playlists") {
        renderPlaylists();
        return;
      }
      if (searchTracks.length) {
        renderList(searchTracks, "");
        return;
      }
      renderList(queueTracks, "当前播放列表还是空的");
    }
    async function doSearch() {
      var kw = String(input.value || "").trim();
      if (!kw) {
        searchTracks = [];
        renderBody();
        return;
      }
      clear(listBox);
      listBox.appendChild(h("div", { class: "mp-modal__hint", text: "搜索中…" }));
      var result = await sources.search(kw, settings);
      searchTracks = result.tracks || [];
      renderList(searchTracks, "没搜到，换个关键词");
    }
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
        doSearch();
      }
    });
    var closeBtn = h(
      "button",
      { class: "mp-icon-btn", type: "button", "aria-label": "关闭" },
      [h("span", { html: icon("close") })]
    );
    closeBtn.addEventListener("click", close);
    var nowRow = null;
    if (nowPlaying) {
      var cover = h("div", { class: "mp-listen__cover" });
      fillCover(cover, nowPlaying.cover || "");
      nowRow = h("div", { class: "mp-listen__now" }, [
        cover,
        h("div", { class: "mp-listen__meta" }, [
          h("div", { class: "mp-listen__name", text: "正在播放：" + nowPlaying.name }),
          h("div", { class: "mp-listen__artist", text: [nowPlaying.artist, queueTracks.length ? "列表 " + queueTracks.length + " 首" : ""].filter(Boolean).join(" · ") })
        ])
      ]);
    }
    var panel = h("div", { class: "mp-modal__panel mp-listen" }, [
      h("div", { class: "mp-modal__head" }, [
        h("div", { class: "mp-modal__title", text: "一起听" }),
        closeBtn
      ]),
      nowRow,
      h("div", { class: "mp-modal__head" }, [
        h("span", { html: icon("search"), class: "mp-listen__searchicon" }),
        input
      ]),
      tabs,
      listBox
    ].filter(Boolean));
    modal.appendChild(panel);
    modal.addEventListener("click", function(e) {
      if (e.target === modal) close();
    });
    document.body.appendChild(modal);
    renderTabs();
    renderBody();
    setTimeout(function() {
      input.focus();
    }, 30);
  }

  // src/core/marker.js
  var MARK_TYPES = ["play", "next", "prev", "pause", "resume", "status", "add", "comment", "new", "recommend", "fav"];
  var PATTERN = /\[\[\s*mp\s*:\s*([a-zA-Z]+)\s*(?::\s*([^\]\n]*))?\]\]/g;
  var COMMENT_PATTERN = /<!--\s*mp\s*:\s*([a-zA-Z]+)\s*(?::\s*([^>\n]*?))?\s*-->/g;
  function normalizeType(raw) {
    var type = String(raw || "").toLowerCase();
    if (type === "previous") return "prev";
    if (type === "favorite") return "fav";
    if (MARK_TYPES.indexOf(type) === -1) return "";
    return type;
  }
  function parseCommands(text) {
    var source = String(text || "");
    if (!source) return [];
    var out = [];
    function collect(pattern) {
      var match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(source)) !== null) {
        var type = normalizeType(match[1]);
        if (!type) continue;
        var arg = String(match[2] == null ? "" : match[2]).trim();
        if ((type === "play" || type === "comment" || type === "new") && !arg) continue;
        out.push({ type, arg, raw: String(match[0]) });
        if (out.length >= 6) return;
      }
    }
    collect(COMMENT_PATTERN);
    if (out.length < 6) collect(PATTERN);
    return out;
  }
  function dedupeKey(conversationId, messageId, cmd) {
    return [conversationId || "", messageId || "", cmd.raw || cmd.type].join("|");
  }

  // src/chat/commandBridge.js
  var POLL_MS2 = 2500;
  var MAX_EXECUTED = 200;
  var runtime = {
    conversationId: "",
    characterId: "",
    characterName: "",
    // App 挂载时用的那份 roche 是完整的（含 chat），聊天回调里的 window.roche 常常没有 chat
    roche: null,
    mode: "mark",
    // mark | tool
    degraded: false,
    timer: null,
    executed: [],
    lastMessageId: ""
  };
  function setRoche(raw) {
    if (raw && raw.chat) runtime.roche = raw;
  }
  function resolveRoche() {
    if (runtime.roche) return runtime.roche;
    if (typeof window === "undefined") return null;
    return window.Roche || window.roche || null;
  }
  function chatListenOn() {
    return isOn(runtime.conversationId, true);
  }
  function noteConversation(ctx) {
    if (!ctx) return;
    var cid = ctx.conversationId || ctx.conversation && ctx.conversation.id || "";
    if (cid) runtime.conversationId = cid;
    var contact = ctx.contact || null;
    if (contact && contact.id) {
      runtime.characterId = String(contact.id);
      runtime.characterName = String(contact.name || contact.nickname || "");
    }
  }
  function setCommandMode(mode) {
    runtime.mode = mode === "mark" ? "mark" : mode === "tool" ? "tool" : "hybrid";
    runtime.degraded = false;
  }
  function commandStatus() {
    return {
      mode: runtime.mode,
      degraded: runtime.degraded,
      conversationId: runtime.conversationId,
      characterId: runtime.characterId
    };
  }
  function nativePlugin() {
    if (typeof window === "undefined") return null;
    var cap = window.Capacitor;
    var plugin = cap && cap.Plugins ? cap.Plugins.BackgroundAudio : null;
    return plugin && typeof plugin.getStatus === "function" ? plugin : null;
  }
  async function readSettings(roche) {
    try {
      return normalizeSettings(roche && roche.storage ? await roche.storage.get("mp:settings", null) : null);
    } catch (err) {
      return normalizeSettings(null);
    }
  }
  async function headlessPlay(keyword, roche, settings) {
    var native = nativePlugin();
    if (!native) return { ok: false, reason: "没有可用的原生播放器" };
    var sources = createSources();
    var found = await sources.search(keyword, settings, { limit: 6 });
    if (!found.tracks.length) return { ok: false, reason: "没搜到这首歌" };
    var track = found.tracks[0];
    var url = "";
    try {
      url = await sources.createResolver(track, settings)();
    } catch (err) {
      url = "";
    }
    if (!url) return { ok: false, reason: "拿不到播放地址" };
    await native.replaceQueue({
      tracks: [{
        id: trackKey(track),
        albumId: track.album || "",
        title: track.name,
        artist: track.artist || "",
        cover: track.cover || "",
        url
      }],
      startIndex: 0,
      mode: "loop",
      autoplay: true
    });
    return { ok: true, track };
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
      var st = res && res.status || {};
      if (!st.title) return null;
      return { name: st.title, artist: st.artist || "", id: st.trackId || st.title, source: "native" };
    } catch (err) {
      return null;
    }
  }
  async function pushListenCard(roche, track) {
    var host = runtime.roche && runtime.roche.chat ? runtime.roche : roche;
    if (!track || !host || !host.chat || typeof host.chat.createCard !== "function") return;
    if (!runtime.conversationId) return;
    try {
      await host.chat.createCard({
        conversationId: runtime.conversationId,
        messageType: "mp-listen",
        isMe: false,
        senderId: runtime.characterId || "",
        cardData: { track, status: "listening", at: Date.now() },
        modelText: "我点开了《" + track.name + "》" + (track.artist ? " - " + track.artist : "") + "，和你一起听。"
      });
    } catch (err) {
    }
  }
  async function doPlay(keyword, roche, settings) {
    var bridge = getBridge();
    if (bridge && bridge.ready()) {
      var found = await bridge.search(keyword, 6);
      if (!found || !found.length) return { ok: false, reason: "没搜到这首歌" };
      if (settings.chatAddToQueue && typeof bridge.addAndPlay === "function") {
        await bridge.addAndPlay([found[0]], 0);
      } else if (typeof bridge.playList === "function") {
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
    if (!native) return { ok: false, reason: "没有可用的播放器" };
    var methods = { next: "next", prev: "previous", pause: "pause", resume: "play" };
    var method = methods[action];
    if (!method) return { ok: false, reason: "不支持的操作" };
    await native[method]();
    return { ok: true };
  }
  async function doAdd(roche) {
    var track = await currentTrack(roche);
    if (!track) return { ok: false, reason: "现在没有在放的歌" };
    var added = await addTrackForChar(roche, runtime.characterId, track);
    return added.ok ? { ok: true, playlist: added.playlist, created: added.created, duplicate: added.duplicate } : { ok: false, reason: added.reason };
  }
  async function doComment(text, roche) {
    var track = await currentTrack(roche);
    if (!track) return { ok: false, reason: "现在没有在放的歌" };
    var saved = await saveComment(roche, runtime.characterId, track, text);
    return saved.ok ? { ok: true, text: saved.text } : { ok: false, reason: saved.reason };
  }
  async function doRecommend(roche, settings, keyword) {
    var sources = createSources();
    var seed = String(keyword || "").trim();
    if (!seed) seed = "华语流行";
    try {
      var found = await sources.search(seed, settings, { limit: 8 });
      if (!found.tracks.length) return { ok: false, reason: "没找到可推荐的歌" };
      var made = await createCharPlaylist(roche, runtime.characterId, RECOMMEND_PLAYLIST_NAME, found.tracks.slice(0, 6));
      return made.ok ? { ok: true, playlist: made.playlist, added: made.added } : { ok: false, reason: made.reason };
    } catch (err) {
      return { ok: false, reason: String(err && err.message || err) };
    }
  }
  async function runCommand(cmd, roche) {
    var settings = await readSettings(roche);
    try {
      switch (cmd.type) {
        case "play":
          return await doPlay(cmd.arg, roche, settings);
        case "next":
          return await doControl("next");
        case "prev":
          return await doControl("prev");
        case "pause":
          return await doControl("pause");
        case "resume":
          return await doControl("resume");
        case "add":
          return await doAdd(roche);
        case "comment":
          return await doComment(cmd.arg, roche);
        case "recommend":
          return await doRecommend(roche, settings, cmd.arg);
        case "new": {
          var made = await createCharPlaylist(roche, runtime.characterId, cmd.arg, []);
          return made.ok ? { ok: true, playlist: made.playlist } : { ok: false, reason: made.reason };
        }
        case "status":
          return Object.assign({ ok: true }, commandStatus());
        default:
          return { ok: false, reason: "不支持的指令" };
      }
    } catch (err) {
      return { ok: false, reason: String(err && err.message || err) };
    }
  }
  function pickMessages(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.messages)) return raw.messages;
    if (raw && Array.isArray(raw.items)) return raw.items;
    return [];
  }
  function messageText(msg) {
    if (!msg) return "";
    return String(msg.content || msg.text || msg.body || "");
  }
  function messageRole(msg) {
    if (!msg) return "";
    return String(msg.role || msg.senderType || (msg.isMe ? "user" : "assistant"));
  }
  var CONTENT_TTL = 60 * 1e3;
  function alreadyDone(key) {
    var now = Date.now();
    return runtime.executed.some(function(item) {
      if (typeof item === "string") return item === key;
      return item && item.k === key && now - (item.at || 0) < CONTENT_TTL;
    });
  }
  function markDone(key, cmd) {
    var now = Date.now();
    runtime.executed.push({ k: key, at: now });
    if (cmd) {
      runtime.executed.push({ k: "c|" + cmd.type + "|" + (cmd.arg || ""), at: now });
    }
    if (runtime.executed.length > MAX_EXECUTED) runtime.executed.shift();
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("mp:cmdLog", JSON.stringify(runtime.executed));
      }
    } catch (err) {
    }
  }
  async function pollOnce() {
    if (runtime.mode === "tool") return;
    if (runtime.degraded) return;
    if (!runtime.conversationId) return;
    if (!chatListenOn()) return;
    var roche = resolveRoche();
    if (!roche || !roche.memory || typeof roche.memory.getShortTerm !== "function") {
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
      if (messageRole(msg) !== "assistant") continue;
      var id = String(msg.id || msg.messageId || msg.createdAt || "");
      if (!id || id === runtime.lastMessageId) return;
      runtime.lastMessageId = id;
      var cmds = parseCommands(messageText(msg));
      if (runtime.mode === "hybrid") {
        cmds = cmds.filter(function(c) {
          return c.type !== "play";
        });
      }
      if (!cmds.length) return;
      for (var j = 0; j < cmds.length; j++) {
        var key = dedupeKey(runtime.conversationId, id, cmds[j]);
        var contentKey = "c|" + cmds[j].type + "|" + (cmds[j].arg || "");
        if (alreadyDone(key) || alreadyDone(contentKey)) continue;
        markDone(key, cmds[j]);
        try {
          await runCommand(cmds[j], roche);
        } catch (err) {
        }
      }
      return;
    }
  }
  function startCommandBridge() {
    if (runtime.timer) return;
    try {
      if (typeof localStorage !== "undefined") {
        var saved = localStorage.getItem("mp:cmdLog");
        if (saved) runtime.executed = JSON.parse(saved) || [];
      }
    } catch (err) {
    }
    runtime.timer = setInterval(function() {
      pollOnce().catch(function() {
      });
    }, POLL_MS2);
  }

  // src/chat/chatLink.js
  var runtime2 = {
    chatListen: true,
    title: "",
    artist: "",
    isPlaying: false,
    queueSize: 0,
    chatAddToQueue: true,
    chatCommandMode: "hybrid",
    chatPrompt: DEFAULT_CHAT_PROMPT,
    chatPromptTool: TOOL_CHAT_PROMPT,
    chatPromptHybrid: HYBRID_CHAT_PROMPT
  };
  function setChatRuntime(patch) {
    if (!patch) return;
    Object.keys(patch).forEach(function(key) {
      runtime2[key] = patch[key];
    });
  }
  function nativePlugin2() {
    if (typeof window === "undefined") return null;
    var cap = window.Capacitor;
    var plugin = cap && cap.Plugins ? cap.Plugins.BackgroundAudio : null;
    return plugin && typeof plugin.getStatus === "function" ? plugin : null;
  }
  async function nativeControl(action) {
    var plugin = nativePlugin2();
    if (!plugin) return { ok: false, reason: "没有可控制的播放器" };
    try {
      var methods = { next: "next", previous: "previous", pause: "pause", resume: "play" };
      var method = methods[action];
      if (!method) return { ok: false, reason: "不支持的动作" };
      var res = await plugin[method]();
      var status = res && res.status;
      return {
        ok: true,
        isPlaying: status ? !!status.isPlaying : null,
        title: status ? status.title : "",
        artist: status ? status.artist : ""
      };
    } catch (err) {
      return { ok: false, reason: "播放器调用失败" };
    }
  }
  async function doControl2(action) {
    var bridge = getBridge();
    if (bridge && bridge.ready()) {
      try {
        return await bridge.control(action);
      } catch (err) {
        return { ok: false, reason: "App 内部执行失败" };
      }
    }
    return nativeControl(action);
  }
  async function headlessPlay2(keyword, roche) {
    var native = createNativeAudio();
    if (!native.available()) {
      return { ok: false, reason: "这台设备没有原生播放器，需要先打开音乐 App" };
    }
    var settings = normalizeSettings(roche && roche.storage ? await roche.storage.get("mp:settings", null) : null);
    var sources = createSources();
    var found = await sources.search(keyword, settings, { limit: 8 });
    if (!found.tracks.length) return { ok: false, reason: "没搜到这首歌" };
    var list = found.tracks.slice(0, 1);
    var nativeTracks = [];
    for (var i = 0; i < list.length; i++) {
      try {
        var resolver = sources.createResolver(list[i], settings);
        var url = await resolver();
        if (!url) continue;
        nativeTracks.push({
          id: trackKey(list[i]),
          albumId: list[i].album || "",
          title: list[i].name,
          artist: list[i].artist || "",
          cover: list[i].cover || "",
          url
        });
      } catch (err) {
      }
    }
    if (!nativeTracks.length) return { ok: false, reason: "拿不到播放地址" };
    await native.replaceQueue({ tracks: nativeTracks, startIndex: 0, mode: "loop", autoplay: true });
    try {
      var raw = await roche.storage.get("mp:queue", null);
      var existing = raw && Array.isArray(raw.tracks) ? raw.tracks.slice() : [];
      var key = trackKey(list[0]);
      var dup = existing.some(function(t) {
        return trackKey(t) === key;
      });
      var merged = dup ? existing : existing.concat(list.slice(0, nativeTracks.length));
      var order = merged.map(function(_, i2) {
        return i2;
      });
      var payload = {
        tracks: merged.slice(0, 200),
        order: order.slice(0, 200),
        pos: dup ? Math.max(0, existing.length - 1) : Math.max(0, existing.length),
        shuffle: false,
        repeat: "off",
        at: Date.now()
      };
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("mp:mirror:mp:queue", JSON.stringify(payload));
          localStorage.setItem("mp:needRebuild", "1");
        }
      } catch (err) {
      }
      await roche.storage.set("mp:queue", payload);
    } catch (err) {
    }
    return { ok: true, started: true, track: list[0], candidates: list.slice(0, 5).map(function(t) {
      return t.name + " - " + t.artist;
    }) };
  }
  var lastCard = null;
  function rememberCard(message, roche) {
    if (!message || !message.id || !message.conversationId) return;
    lastCard = { conversationId: message.conversationId, messageId: message.id, roche };
  }
  async function pushCard(ctx, roche, track, status) {
    if (!roche || !roche.chat || typeof roche.chat.createCard !== "function") return;
    if (!ctx || !ctx.conversationId || !ctx.contact || !ctx.contact.id) return;
    try {
      var created = await roche.chat.createCard({
        conversationId: ctx.conversationId,
        messageType: MESSAGE_TYPE,
        isMe: false,
        senderId: ctx.contact.id,
        cardData: { track, status: status || "listening", at: Date.now() },
        modelText: "我点开了《" + track.name + "》" + (track.artist ? " - " + track.artist : "") + "，和你一起听。"
      });
      var id = created && (created.id || created.message && created.message.id);
      if (id) lastCard = { conversationId: ctx.conversationId, messageId: id, roche };
    } catch (err) {
    }
  }
  function renderChatPrompt(templateOverride) {
    var template = String(templateOverride || runtime2.chatPrompt || DEFAULT_CHAT_PROMPT);
    var stateText = runtime2.isPlaying ? "正在播放" : runtime2.title ? "已暂停" : "";
    return template.replace(/\{\{title\}\}/g, runtime2.title || "（没在放歌）").replace(/\{\{artist\}\}/g, runtime2.artist || "").replace(/\{\{state\}\}/g, stateText).replace(/\{\{queue\}\}/g, String(runtime2.queueSize || 0)).trim();
  }
  function conversationIdOf(ctx) {
    if (!ctx) return "";
    return ctx.conversationId || ctx.conversation && ctx.conversation.id || "";
  }
  function chatContextProvider(ctx) {
    noteConversation(ctx);
    if (!isOn(conversationIdOf(ctx), runtime2.chatListen)) return null;
    var mode = runtime2.chatCommandMode || "hybrid";
    var template;
    if (mode === "mark") template = runtime2.chatPrompt || DEFAULT_CHAT_PROMPT;
    else if (mode === "tool") template = runtime2.chatPromptTool || TOOL_CHAT_PROMPT;
    else template = runtime2.chatPromptHybrid || HYBRID_CHAT_PROMPT;
    return renderChatPrompt(template) || null;
  }
  function tool(id, description, parameters, run) {
    return {
      id,
      description,
      parameters: parameters || {},
      async execute(args, ctx, roche) {
        if (!isOn(conversationIdOf(ctx), runtime2.chatListen)) {
          return { ok: false, reason: "用户已经结束了这次一起听，不要再执行音乐操作" };
        }
        try {
          return await run(args || {}, ctx || {}, roche);
        } catch (err) {
          return { ok: false, reason: String(err && err.message || err) };
        }
      }
    };
  }
  var chatTools = [
    tool(
      "music_play",
      "用户说「放/加/来一首 某某」时必须调用：搜索这首歌，把第一首加入当前播放列表。不调用就等于没做。",
      { keyword: "string" },
      async function(args, ctx, roche) {
        var keyword = String(args.keyword || "").trim();
        if (!keyword) return { ok: false, reason: "缺少 keyword" };
        var bridge = getBridge();
        if (!bridge || !bridge.ready()) {
          var headless = await headlessPlay2(keyword, roche);
          if (!headless.ok) return headless;
          await pushCard(ctx, roche, headless.track, "listening");
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
        if (!found || !found.length) return { ok: false, reason: "没搜到这首歌" };
        var first = found[0];
        var result;
        if (runtime2.chatAddToQueue) {
          result = await bridge.addAndPlay([first], 0);
        } else {
          result = await bridge.playList([first], 0);
          result = { ok: !!result, started: true };
        }
        if (!result || !result.ok) return { ok: false, reason: result && result.reason || "没找到歌" };
        await pushCard(ctx, roche, first, "listening");
        return {
          ok: true,
          started: !!result.started,
          added: 1,
          playing: first.name,
          artist: first.artist,
          candidates: found.slice(0, 5).map(function(t) {
            return t.name + " - " + t.artist;
          })
        };
      }
    ),
    tool("music_next", "切到下一首。", {}, async function() {
      var res = await doControl2("next");
      return res.ok ? { ok: true, playing: res.title || "", artist: res.artist || "" } : res;
    }),
    tool("music_previous", "切到上一首。", {}, async function() {
      var res = await doControl2("previous");
      return res.ok ? { ok: true, playing: res.title || "", artist: res.artist || "" } : res;
    }),
    tool("music_pause", "暂停播放。", {}, async function() {
      return doControl2("pause");
    }),
    tool("music_resume", "继续播放。", {}, async function() {
      return doControl2("resume");
    }),
    tool("music_status", "查看当前播放的歌和队列。", {}, async function() {
      var bridge = getBridge();
      if (bridge && bridge.ready()) {
        var status = bridge.status();
        return Object.assign({ ok: true }, status);
      }
      var plugin = nativePlugin2();
      if (!plugin) return { ok: false, reason: "没有播放器" };
      var res = await plugin.getStatus();
      var st = res && res.status || {};
      return { ok: true, playing: st.title || "", artist: st.artist || "", isPlaying: !!st.isPlaying, queueSize: st.queueSize || 0 };
    }),
    tool("music_add_to_playlist", "把当前正在播放的这首收进你自己的歌单（没有歌单会自动建一个）。", {}, async function(args, ctx, roche) {
      var bridge = getBridge();
      var track = null;
      if (bridge && bridge.ready()) {
        var st = bridge.status();
        track = st && st.playing;
      }
      if (!track) {
        var native = nativePlugin2();
        if (native) {
          var res = await native.getStatus();
          var raw = res && res.status || {};
          if (raw.title) track = { name: raw.title, artist: raw.artist || "", id: raw.trackId || raw.title, source: "native" };
        }
      }
      if (!track) return { ok: false, reason: "现在没有在放的歌" };
      var characterId = ctx && ctx.contact ? ctx.contact.id : "";
      var added = await addTrackForChar(roche, characterId, track);
      return added.ok ? { ok: true, added: track.name, playlist: added.playlist ? added.playlist.name : "", created: !!added.created } : { ok: false, reason: added.reason };
    }),
    tool("music_comment", "给当前正在播放的歌写一句简短评价（不超过 30 字）。", { text: "string" }, async function(args, ctx, roche) {
      var text = String(args.text || "").trim();
      if (!text) return { ok: false, reason: "缺少 text" };
      var bridge = getBridge();
      var track = null;
      if (bridge && bridge.ready()) {
        var st = bridge.status();
        track = st && st.playing;
      }
      if (!track) {
        var native = nativePlugin2();
        if (native) {
          var res = await native.getStatus();
          var raw = res && res.status || {};
          if (raw.title) track = { name: raw.title, artist: raw.artist || "", id: raw.trackId || raw.title, source: "native" };
        }
      }
      if (!track) return { ok: false, reason: "现在没有在放的歌" };
      var characterId = ctx && ctx.contact ? ctx.contact.id : "";
      var saved = await saveComment(roche, characterId, track, text);
      return saved.ok ? { ok: true, text: saved.text, track: track.name } : { ok: false, reason: saved.reason };
    }),
    tool("music_recommend", "按对方最近的喜好挑几首歌，放进名为「为你挑的」的歌单。keyword 由你根据对话决定（例如「城市夜晚」）。", { keyword: "string" }, async function(args, ctx, roche) {
      var settings = normalizeSettings(roche && roche.storage ? await roche.storage.get("mp:settings", null) : null);
      var sources = createSources();
      var seed = String(args.keyword || "").trim() || (/^(华语流行)$/.test(String(args.keyword || "")) ? "" : "") || (function() {
        var recent = (runtime2.recentNames || [])[0];
        return recent || "华语流行";
      })();
      var found = await sources.search(seed, settings, { limit: 8 });
      if (!found.tracks.length) return { ok: false, reason: "没找到可推荐的歌" };
      var characterId = ctx && ctx.contact ? ctx.contact.id : "";
      var made = await createCharPlaylist(roche, characterId, RECOMMEND_PLAYLIST_NAME, found.tracks.slice(0, 6));
      return made.ok ? { ok: true, playlist: RECOMMEND_PLAYLIST_NAME, added: made.added } : { ok: false, reason: made.reason };
    }),
    tool("music_favorite", "把当前播放的歌加入收藏。", {}, async function() {
      var bridge = getBridge();
      if (!bridge || !bridge.ready()) return { ok: false, reason: "音乐 App 没有打开" };
      var res = await bridge.favoriteCurrent();
      return res || { ok: false };
    })
  ];

  // src/app/container.js
  function uid() {
    return "pl_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  async function createApp(opts) {
    var container = opts.container;
    var roche = opts.roche;
    var version = opts.version;
    var host = createHost(roche);
    var store = createStore(host);
    var sources = createSources();
    var lyrics = createLyrics();
    var state = {
      version,
      route: "recommend",
      nowBack: "recommend",
      playlistId: "",
      settings: null,
      playlists: [],
      favorites: [],
      recent: [],
      search: { keyword: "", busy: false, tracks: [], errors: [], counts: {}, at: 0 },
      searches: [],
      comments: {},
      prefs: [],
      // 推荐偏好
      rec: null,
      // 推荐缓存 { at, playlistName, tracks }
      queue: null,
      player: { status: "idle", track: null, time: 0, duration: 0, error: "", volume: 0.8 },
      lyrics: { lines: [], loading: false, error: "" },
      covers: {}
    };
    var shell = null;
    var player = null;
    var engine = null;
    var searchToken = 0;
    function toast(message) {
      host.ui.toast(message);
    }
    function coverOf(track2) {
      if (!track2) return "";
      return state.covers[trackKey(track2)] || track2.cover || "";
    }
    function isCurrent(track2) {
      return !!track2 && !!state.player.track && trackKey(state.player.track) === trackKey(track2);
    }
    async function ensureCover(track2) {
      return track2;
    }
    var cardSyncKey = "";
    function refresh() {
      if (shell) {
        shell.renderPlayer();
        shell.renderDock();
        shell.refreshPage();
      }
      syncChatRuntime();
    }
    function syncChatRuntime() {
      setChatRuntime({
        chatListen: !!state.settings.chatListen,
        title: state.player.track ? state.player.track.name : "",
        artist: state.player.track ? state.player.track.artist : "",
        isPlaying: state.player.status === "playing",
        queueSize: state.queue ? state.queue.tracks.length : 0,
        chatAddToQueue: !!state.settings.chatAddToQueue,
        chatCommandMode: state.settings.chatCommandMode || "tool",
        chatPrompt: state.settings.chatPrompt,
        chatPromptTool: state.settings.chatPromptTool,
        chatPromptHybrid: state.settings.chatPromptHybrid
      });
      var commandMode = state.settings.chatCommandMode || "tool";
      setCommandMode(commandMode);
      setRoche(host.raw);
      if (commandMode !== "tool" && typeof window !== "undefined" && typeof window.__mpStartCommandBridge === "function") {
        window.__mpStartCommandBridge();
      }
      saveSnapshot({
        track: state.player.track,
        isPlaying: state.player.status === "playing",
        queue: state.queue,
        settings: state.settings,
        favorites: state.favorites,
        playlists: state.playlists
      });
    }
    function installBridge() {
      setBridge({
        ready: function() {
          return !!shell;
        },
        status: function() {
          return {
            playing: state.player.track ? { name: state.player.track.name, artist: state.player.track.artist } : null,
            isPlaying: state.player.status === "playing",
            queueSize: state.queue ? state.queue.tracks.length : 0
          };
        },
        search: async function(keyword, limit) {
          var res = await sources.search(keyword, state.settings, { limit: limit || 5 });
          return res.tracks;
        },
        playKeyword: async function(keyword) {
          var res = await sources.search(keyword, state.settings, { limit: 10 });
          if (!res.tracks.length) return { ok: false, reason: "没搜到这首歌" };
          var list = res.tracks.slice(0, 10);
          await playTracks(list, 0);
          return {
            ok: true,
            track: list[0],
            candidates: list.slice(0, 5).map(function(t) {
              return t.name + " - " + t.artist;
            })
          };
        },
        playList: async function(tracks, index) {
          var list = (tracks || []).filter(Boolean);
          if (!list.length) return { ok: false, reason: "没有可播放的歌" };
          await playTracks(list, index || 0);
          return { ok: true, track: list[index || 0] || list[0] };
        },
        /** 追加到队列末尾并立刻播其中第一首，原有列表不丢 */
        addAndPlay: async function(tracks, index) {
          var list = (tracks || []).filter(Boolean);
          if (!list.length) return { ok: false, reason: "没有可播放的歌" };
          var start = index || 0;
          var want = list[start] || list[0];
          var existIndex = -1;
          var wantKey = trackKey(want);
          var wantName = String(want.name || "").trim();
          var wantArtist = String(want.artist || "").trim();
          if (state.queue) {
            for (var i = 0; i < state.queue.tracks.length; i++) {
              var item = state.queue.tracks[i];
              if (!item) continue;
              if (trackKey(item) === wantKey) {
                existIndex = i;
                break;
              }
              if (wantName && String(item.name || "").trim() === wantName && String(item.artist || "").trim() === wantArtist) {
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
        addTracks: async function(tracks) {
          var list = (tracks || []).filter(Boolean);
          if (!list.length) return { ok: false, reason: "没有可加入的歌" };
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
            nowPlaying: state.player.track ? state.player.track.name : ""
          };
        },
        playKey: async function(key) {
          var q = state.queue;
          if (!q) return { ok: false, reason: "队列为空" };
          for (var i = 0; i < q.tracks.length; i++) {
            if (trackKey(q.tracks[i]) === key) {
              await playQueueAt(i);
              return { ok: true, track: q.tracks[i] };
            }
          }
          return { ok: false, reason: "队列里没有这首" };
        },
        queue: function() {
          var q = state.queue;
          if (!q) return [];
          return q.tracks.slice(0, 60).map(function(track2) {
            return {
              key: trackKey(track2),
              name: track2.name,
              artist: track2.artist,
              cover: track2.cover || "",
              current: isCurrent(track2),
              track: track2
            };
          });
        },
        control: async function(action) {
          if (action === "next") {
            next(false);
            return { ok: true };
          }
          if (action === "previous") {
            prev();
            return { ok: true };
          }
          if (action === "pause") {
            if (state.player.status === "playing") await togglePlay();
            return { ok: true };
          }
          if (action === "resume") {
            if (state.player.status !== "playing") await togglePlay();
            return { ok: true };
          }
          return { ok: false, reason: "不支持的动作" };
        },
        favoriteCurrent: async function() {
          if (!state.player.track) return { ok: false, reason: "没有正在播放的歌" };
          var name = state.player.track.name;
          await toggleFavorite2(state.player.track);
          return { ok: true, favorite: name };
        }
      });
    }
    async function saveQueue() {
      var q = state.queue;
      if (!q) return;
      await host.storage.set("mp:queue", {
        tracks: q.tracks.slice(0, 200),
        order: q.order,
        pos: q.pos,
        shuffle: q.shuffle,
        repeat: q.repeat,
        at: Date.now()
      });
    }
    async function loadQueue() {
      var rawHost = await host.storage.get("mp:queue", null);
      var rawMirror = null;
      try {
        rawMirror = JSON.parse(localStorage.getItem("mp:mirror:mp:queue") || "null");
      } catch (err) {
        rawMirror = null;
      }
      var raw = rawHost;
      if (rawMirror && (!rawHost || (Number(rawMirror.at) || 0) > (Number(rawHost.at) || 0))) {
        raw = rawMirror;
      }
      if (!raw || !Array.isArray(raw.tracks) || !raw.tracks.length) return null;
      var tracks = raw.tracks.map(function(t) {
        return normalizeTrack(t, t && t.source);
      }).filter(Boolean);
      if (!tracks.length) return null;
      var natural = tracks.map(function(_, i) {
        return i;
      });
      var order = Array.isArray(raw.order) && raw.order.length === tracks.length ? raw.order : natural;
      var valid = order.every(function(n) {
        return Number.isInteger(n) && n >= 0 && n < tracks.length;
      });
      return {
        tracks,
        order: valid ? order : natural,
        pos: Math.min(Math.max(Number(raw.pos) || 0, 0), tracks.length - 1),
        shuffle: !!raw.shuffle,
        repeat: raw.repeat || state.settings.repeat
      };
    }
    async function loadLyrics(track2) {
      var key = trackKey(track2);
      state.lyrics = { lines: [], loading: true, error: "" };
      if (shell) shell.renderPlayer();
      var lines = await lyrics.get(track2, state.settings);
      if (!state.player.track || trackKey(state.player.track) !== key) return;
      state.lyrics = { lines, loading: false, error: lines.length ? "" : "暂无歌词" };
      if (shell) {
        shell.renderPlayer();
        if (state.route === "now") shell.refreshPage();
      }
    }
    async function playTrack(track2) {
      if (!track2) return false;
      state.player = Object.assign({}, state.player, { status: "loading", track: track2, error: "" });
      if (shell) shell.renderPlayer();
      if (engine) {
        state.queue = createQueue([track2], { repeat: state.settings.repeat, shuffle: false });
        saveQueue();
        var started = await engine.playList(state.queue.tracks, 0, state.settings);
        if (!started) toast("这首放不了（音源可能没版权），换一首试试");
        refresh();
        return started;
      }
      var ok = await player.load(track2, sources.createResolver(track2, state.settings));
      if (ok) {
        state.recent = pushRecent(state.recent, track2, MAX_RECENT);
        await store.saveRecent(state.recent);
        loadLyrics(track2);
        if (state.route === "now" && shell) shell.refreshPage();
      } else {
        toast("这首放不了（音源可能没版权），换一首试试");
      }
      refresh();
      return ok;
    }
    async function playTracks(tracks, startIndex) {
      var list = (tracks || []).filter(Boolean);
      if (!list.length) {
        toast("这个列表还是空的");
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
        if (!started) toast("这首放不了（音源可能没版权），换一首试试");
        refresh();
        return;
      }
      await playTrack(current(state.queue));
      refresh();
    }
    function next(auto) {
      if (engine) {
        engine.next().then(function() {
          refresh();
        });
        return;
      }
      var res = advance(state.queue, { auto: !!auto });
      if (res.ended || !res.track) {
        state.queue = res.queue;
        toast("已经是最后一首了");
        return;
      }
      state.queue = res.queue;
      saveQueue();
      playTrack(res.track);
      refresh();
    }
    function prev() {
      if (engine) {
        engine.previous().then(function() {
          refresh();
        });
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
          toast("先搜一首歌吧");
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
      return setPlayMode(state.settings.playMode === "shuffle" ? "sequence" : "shuffle");
    }
    async function setRepeatMode(mode) {
      var next2 = mode === REPEAT.ONE ? "one" : mode === REPEAT.ALL ? "loop" : "sequence";
      return setPlayMode(next2);
    }
    async function playQueueAt(index) {
      var q = state.queue;
      if (!q) return;
      var track2 = q.tracks[index];
      if (!track2) return;
      state.queue = jumpTo(q, trackKey(track2));
      saveQueue();
      if (engine) {
        engine.setList(state.queue.tracks, state.settings);
        var started = await engine.playAt(index);
        if (!started) await playTrack(track2);
        refresh();
        return;
      }
      await playTrack(track2);
      refresh();
    }
    async function appendToQueue(tracks) {
      var list = (tracks || []).filter(Boolean);
      if (!list.length) return 0;
      state.queue = appendTracks(state.queue, list);
      saveQueue();
      if (engine) engine.setList(state.queue.tracks, state.settings);
      refresh();
      return list.length;
    }
    async function playOne(track2) {
      if (!track2) return false;
      state.queue = appendTracks(state.queue, [track2]);
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
        toast("播放队列还是空的");
        return;
      }
      function buildItems() {
        var now = state.queue;
        if (!now) return [];
        return now.tracks.slice(0, 200).map(function(track2, i) {
          return {
            label: track2.name,
            hint: track2.artist,
            icon: isCurrent(track2) ? "pause" : "play",
            onClick: function() {
              playQueueAt(i);
            },
            onRemove: function() {
              removeFromQueue(i);
            }
          };
        });
      }
      queueSheetClose = shell.openSheet({
        title: function() {
          return "播放列表 · " + (state.queue ? state.queue.tracks.length : 0) + " 首";
        },
        items: buildItems
      });
    }
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
    async function openNeteaseToplist() {
      if (!shell) return;
      if (!state.settings.neteaseApi) {
        toast("先在设置里填网易云 API 地址");
        return;
      }
      toast("正在拉取榜单…");
      try {
        var list = await toplists(state.settings);
        if (!list.length) {
          toast("没拿到榜单，检查 API 地址是否可访问");
          return;
        }
        shell.openSheet({
          title: "网易云排行榜",
          items: list.map(function(item) {
            return {
              label: item.name,
              hint: item.count ? item.count + " 首" : "",
              icon: "queue",
              onClick: function() {
                playNeteasePlaylist(item);
              }
            };
          })
        });
      } catch (err) {
        toast("拉取失败：" + (err && err.message || "网络错误"));
      }
    }
    async function playNeteasePlaylist(item) {
      try {
        var songs = await playlistTracks(state.settings, item.id, 30);
        if (!songs.length) {
          toast("这个榜单没有歌");
          return;
        }
        var tracks = songs.map(function(s) {
          return normalizeTrack(s, "netease");
        }).filter(Boolean);
        await playTracks(tracks, 0);
        toast("正在播放：" + item.name);
      } catch (err) {
        toast("播放失败：" + (err && err.message || "网络错误"));
      }
    }
    function openPlayModeSheet() {
      if (!shell) return;
      var current2 = state.settings.playMode;
      shell.openSheet({
        title: "播放模式",
        items: [
          { id: "sequence", label: "顺序播放", icon: "music" },
          { id: "loop", label: "列表循环", icon: "repeat" },
          { id: "one", label: "单曲循环", icon: "repeatOne" },
          { id: "shuffle", label: "随机播放", icon: "shuffle" }
        ].map(function(item) {
          return {
            label: item.label,
            icon: current2 === item.id ? "check" : item.icon,
            hint: current2 === item.id ? "当前" : "",
            onClick: function() {
              setPlayMode(item.id);
            }
          };
        })
      });
    }
    function exitApp() {
      host.ui.closeApp();
    }
    async function hardStop() {
      try {
        if (engine) await engine.stop();
        else if (player) player.stop();
      } catch (err) {
      }
      state.queue = createQueue([]);
      try {
        await host.storage.delete("mp:queue");
      } catch (err) {
      }
      state.player = {
        status: "idle",
        track: null,
        time: 0,
        duration: 0,
        error: "",
        volume: state.settings.volume
      };
      state.lyrics = { lines: [], loading: false, error: "" };
      refresh();
      toast("已彻底停止，状态栏通知也会消失");
    }
    async function rebuildSession() {
      if (!engine) {
        toast("当前没有原生播放器");
        return;
      }
      var q = state.queue;
      if (!q || !q.tracks.length) {
        toast("播放列表是空的");
        return;
      }
      var index = q.order[q.pos];
      if (!(index >= 0)) index = 0;
      var track2 = q.tracks[index];
      await engine.stop();
      var started = await engine.playList(q.tracks, index, state.settings);
      if (started && track2) loadLyrics(track2);
      toast(started ? "已重建播放会话" : "重建失败，换一首试试");
    }
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
      if (token !== searchToken) return;
      state.search = {
        keyword: kw,
        busy: false,
        tracks: result.tracks,
        errors: result.errors,
        counts: result.counts,
        at: Date.now()
      };
      if (!result.tracks.length) {
        if (result.errors.length) toast("搜索失败，检查网络或换音源");
        else toast("没有找到歌曲");
      } else {
        state.searches = await store.saveSearches([kw].concat(state.searches));
      }
      if (shell) shell.refreshPage();
    }
    async function clearSearches() {
      state.searches = await store.saveSearches([]);
      toast("已清空搜索历史");
      refresh();
    }
    function suggestions() {
      var counter = /* @__PURE__ */ Object.create(null);
      (state.recent || []).forEach(function(t) {
        if (t && t.artist) counter[t.artist] = (counter[t.artist] || 0) + 1;
      });
      (state.favorites || []).forEach(function(t) {
        if (t && t.artist) counter[t.artist] = (counter[t.artist] || 0) + 2;
      });
      var artists = Object.keys(counter).sort(function(a, b) {
        return counter[b] - counter[a];
      }).slice(0, 6);
      return {
        searches: (state.searches || []).slice(0, 8),
        artists,
        hot: ["古风", "华语流行", "粤语", "民谣", "钢琴", "说唱", "纯音乐", "动漫"]
      };
    }
    async function toggleFavorite2(track2) {
      var res = toggleFavorite(state.favorites, track2);
      if (res.full) {
        toast("收藏已满 " + state.favorites.length + " 首");
        return;
      }
      state.favorites = res.favorites;
      await store.saveFavorites(state.favorites);
      toast(res.added ? "已收藏" : "已取消收藏");
      refresh();
    }
    async function addCurrentToCharPlaylist(characterId) {
      var track2 = state.player.track;
      if (!track2) return { ok: false, reason: "现在没有在放的歌" };
      var res = await addTrackForChar(host.raw, characterId || "ta", track2);
      if (res.ok) {
        state.playlists = await store.loadPlaylists();
        refresh();
      }
      return res;
    }
    async function commentCurrent(characterId, text) {
      var track2 = state.player.track;
      if (!track2) return { ok: false, reason: "现在没有在放的歌" };
      var res = await saveComment(host.raw, characterId || "ta", track2, text);
      if (res.ok) {
        state.comments = await store.loadComments();
        refresh();
      }
      return res;
    }
    async function reloadComments() {
      try {
        var fromHost = await store.loadComments();
        var mirror = null;
        try {
          mirror = JSON.parse(localStorage.getItem("mp:mirror:mp:comments") || "null");
        } catch (err) {
          mirror = null;
        }
        if (mirror && typeof mirror === "object" && !Array.isArray(mirror)) {
          var merged = Object.assign({}, fromHost);
          Object.keys(mirror).forEach(function(key) {
            var base2 = merged[key] && typeof merged[key] === "object" ? merged[key] : {};
            merged[key] = Object.assign({}, base2, mirror[key] || {});
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
    async function reloadPlaylists() {
      try {
        var fromHost = await store.loadPlaylists();
        var mirror = null;
        try {
          mirror = JSON.parse(localStorage.getItem("mp:mirror:mp:playlists") || "null");
        } catch (err) {
          mirror = null;
        }
        if (Array.isArray(mirror) && mirror.length) {
          var byId = /* @__PURE__ */ Object.create(null);
          fromHost.forEach(function(p) {
            byId[p.id] = p;
          });
          mirror.forEach(function(raw) {
            if (!raw || !raw.id) return;
            byId[raw.id] = raw;
          });
          state.playlists = normalizePlaylists(Object.keys(byId).map(function(id) {
            return byId[id];
          }));
        } else {
          state.playlists = fromHost;
        }
        return state.playlists;
      } catch (err) {
        return state.playlists;
      }
    }
    async function createPlaylist2(name, tracks) {
      var res = createPlaylist(state.playlists, name, uid(), Date.now());
      if (!res.playlist) {
        toast("歌单数量已达上限");
        return "";
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
    async function renamePlaylist2(id, name) {
      state.playlists = renamePlaylist(state.playlists, id, name, Date.now());
      await store.savePlaylists(state.playlists);
      refresh();
    }
    async function deletePlaylist2(id) {
      var ok = await host.ui.confirm({
        title: "删除歌单",
        message: "删除后不可恢复，歌曲本身不会被删除。"
      });
      if (!ok) return false;
      state.playlists = deletePlaylist(state.playlists, id);
      await store.savePlaylists(state.playlists);
      if (state.route === "playlist") goto("playlists");
      refresh();
      return true;
    }
    async function addToPlaylist(playlistId, tracks) {
      var res = addTracksToPlaylist(state.playlists, playlistId, tracks, Date.now());
      state.playlists = res.list;
      await store.savePlaylists(state.playlists);
      if (res.full) toast("歌单已满，部分歌曲没加进去");
      else if (!res.added) toast(res.duplicate ? "这些歌已经在歌单里了" : "没有可添加的歌曲");
      else toast("已加入歌单");
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
    function openAddToPlaylist(track2) {
      if (!shell) return;
      var items = state.playlists.map(function(p) {
        return {
          label: p.name,
          icon: "folder",
          hint: p.tracks.length + " 首",
          onClick: function() {
            addToPlaylist(p.id, [track2]);
          }
        };
      });
      items.push({
        label: "新建歌单并加入",
        icon: "plus",
        onClick: function() {
          shell.openPrompt({
            title: "新建歌单",
            placeholder: "给歌单起个名字",
            onSubmit: function(name) {
              createPlaylist2(name, [track2]);
            }
          });
        }
      });
      shell.openSheet({ title: "加入歌单", items, empty: "还没有歌单" });
    }
    function openSongSheet(track2, options) {
      if (!shell || !track2) return;
      var o = options || {};
      var fav = state.favorites.some(function(t) {
        return trackKey(t) === trackKey(track2);
      });
      var items = [
        {
          label: "立即播放",
          icon: "play",
          onClick: function() {
            playTracks(o.queueTracks && o.queueTracks.length ? o.queueTracks : [track2], o.queueIndex || 0);
          }
        },
        {
          label: fav ? "取消收藏" : "收藏",
          icon: fav ? "heartFull" : "heart",
          onClick: function() {
            toggleFavorite2(track2);
          }
        },
        { label: "加入歌单", icon: "plus", onClick: function() {
          openAddToPlaylist(track2);
        } }
      ];
      if (o.playlistId) {
        items.push({
          label: "从歌单移除",
          icon: "trash",
          danger: true,
          onClick: function() {
            removeFromPlaylist(o.playlistId, trackKey(track2));
          }
        });
        items.push({
          label: "上移",
          icon: "up",
          onClick: function() {
            moveInPlaylist(o.playlistId, o.index, o.index - 1);
          }
        });
        items.push({
          label: "下移",
          icon: "down",
          onClick: function() {
            moveInPlaylist(o.playlistId, o.index, o.index + 1);
          }
        });
      }
      shell.openSheet({ title: track2.name, items });
    }
    function goto(route, options) {
      var o = options || {};
      if (!isValidRoute(route)) return;
      if (route === "playlist") {
        state.playlistId = o.playlistId || state.playlistId;
      }
      state.route = route;
      if (shell) shell.renderAll();
    }
    function openNow() {
      if (state.route === "now") return;
      state.nowBack = TABS.indexOf(state.route) !== -1 ? state.route : DEFAULT_ROUTE;
      state.route = "now";
      if (shell) shell.renderAll();
    }
    function closeNow() {
      state.route = state.nowBack || DEFAULT_ROUTE;
      if (shell) shell.renderAll();
    }
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
      if (typeof state.settings.volume === "number") {
        if (engine) engine.setVolume(state.settings.volume);
        else if (player) player.setVolume(state.settings.volume);
      }
      refresh();
      if (shell) shell.applyAppearance();
    }
    async function clearData() {
      var ok = await host.ui.confirm({
        title: "清空数据",
        message: "歌单、收藏、最近播放与设置都会清空，不可恢复。"
      });
      if (!ok) return;
      await store.clearAll();
      state.playlists = [];
      state.favorites = [];
      state.recent = [];
      state.settings = await store.loadSettings();
      toast("已清空");
      refresh();
    }
    var ctx = {
      state,
      host,
      store,
      sources,
      version,
      get player() {
        return player;
      },
      get shell() {
        return shell;
      },
      toast,
      confirm: function(options) {
        return host.ui.confirm(options);
      },
      refresh,
      coverOf,
      isCurrent,
      playlistOf: function(id) {
        return findPlaylist(state.playlists, id);
      },
      durationOf: playlistDuration,
      gotoTab: function(tab) {
        goto(tab);
      },
      goto,
      openNow,
      closeNow,
      playTracks,
      playTrack,
      playOne,
      appendToQueue,
      togglePlay,
      next,
      prev,
      seek,
      setVolume,
      cycleRepeat,
      toggleShuffle,
      queueTracks: function() {
        return state.queue ? state.queue.tracks : [];
      },
      openQueueSheet,
      openPlayModeSheet,
      openNeteaseToplist,
      removeFromQueue,
      setPlayMode,
      playQueueAt,
      setRepeatMode,
      searchNow,
      suggestions,
      clearSearches,
      exitApp,
      toggleFavorite: toggleFavorite2,
      createPlaylist: createPlaylist2,
      renamePlaylist: renamePlaylist2,
      deletePlaylist: deletePlaylist2,
      addToPlaylist,
      removeFromPlaylist,
      moveInPlaylist,
      openSongSheet,
      openAddToPlaylist,
      openPrompt: function(options) {
        if (shell) shell.openPrompt(options);
      },
      openSheet: function(options) {
        if (shell) shell.openSheet(options);
      },
      openEditor: function(options) {
        if (shell) shell.openEditor(options);
      },
      updateSettings,
      clearData,
      lyricLines: function() {
        return state.lyrics.lines;
      },
      lyricLoading: function() {
        return state.lyrics.loading;
      },
      reloadLyrics: function() {
        if (state.player.track) loadLyrics(state.player.track);
      },
      canMinimize: function() {
        return !!host.caps.minimizeApp;
      },
      // 「悬浮播放」关掉时不缩成悬浮球，而是直接退出 App——音乐照样在后台放，但界面上没有悬浮窗
      minimizeApp: function() {
        if (state.settings.floating) host.ui.minimizeApp();
        else host.ui.closeApp();
      },
      minimizeLabel: function() {
        return state.settings.floating ? "最小化" : "退出并后台播放";
      },
      /**
       * 一级页左上角的统一行为：
       * 悬浮窗开 → 缩成悬浮球（音乐继续）；关 → 直接退出 App（音乐同样继续）
       */
      exitOrMinimize: function() {
        try {
          if (state.settings.floating && host.caps.minimizeApp) host.ui.minimizeApp();
          else host.ui.closeApp();
        } catch (err) {
        }
      },
      toast: function(text) {
        toast(text);
      },
      isNative: function() {
        return !!engine;
      },
      engineLabel: function() {
        if (!engine) return "网页音频（无状态栏控制）";
        var size = state.queue ? state.queue.tracks.length : 0;
        var mode = state.settings.shuffle ? "random" : state.settings.repeat === REPEAT.ONE ? "one" : "loop";
        return "原生 · 队列 " + size + " 首 · " + mode + (state.settings.nativeMinimal ? " · 极简" : "");
      },
      rebuildSession,
      hardStop,
      // TA 页用：角色歌单 + 歌曲短评
      taPlaylists: function() {
        return (state.playlists || []).filter(function(p) {
          return p.owner === "char";
        });
      },
      /**
       * characterId 为空 = 返回**所有角色**的每条评价（一首歌可能被多个角色评过）；
       * 非空 = 只返回这个角色的，没有就跳过（不要回退到别的角色）。
       */
      taComments: function(characterId) {
        var map2 = state.comments || {};
        var want = String(characterId || "");
        var out = [];
        Object.keys(map2).forEach(function(key) {
          var entry = map2[key] || {};
          Object.keys(entry).forEach(function(cid) {
            if (want && String(cid) !== want) return;
            var one = entry[cid] || {};
            out.push({
              key,
              characterId: String(cid),
              name: one.name || "",
              artist: one.artist || "",
              text: one.text || "",
              at: one.at || 0
            });
          });
        });
        return out.sort(function(a, b) {
          return b.at - a.at;
        });
      },
      reloadComments,
      reloadPlaylists,
      /* ---------------- 推荐 ---------------- */
      prefs: function() {
        return state.prefs && state.prefs.length ? state.prefs : defaultPrefs();
      },
      savePrefs: async function(list) {
        state.prefs = normalizePrefs(list);
        await host.storage.set("mp:prefs", state.prefs);
        return state.prefs;
      },
      recommendCache: function() {
        return state.rec;
      },
      /** 有没有登录网易云（决定推荐页要不要显示排行榜入口） */
      neteaseReady: function() {
        try {
          return isLoggedIn(state.settings);
        } catch (err) {
          return false;
        }
      },
      /** 网易云服务是否可用（搜索页直接展示榜单只看这个，公开榜单不需要登录） */
      neteaseApiReady: function() {
        try {
          return isReady(state.settings);
        } catch (err) {
          return false;
        }
      },
      /** 拉榜单列表；失败不弹 toast，交给页面显示重试 */
      fetchNeteaseToplists: async function() {
        try {
          var list = await toplists(state.settings);
          return { ok: true, list: list || [] };
        } catch (err) {
          return { ok: false, list: [], reason: String(err && err.message || err) };
        }
      },
      playNeteaseToplist: async function(id, name) {
        return playNeteasePlaylist({ id, name: name || "网易云榜单" });
      },
      openPrefsPanel: function() {
        if (shell) shell.openPrefsPanel();
      },
      /** force=true 表示用户点了「换一批」；否则 30 分钟内直接用缓存 */
      refreshRecommend: async function(force) {
        var cache = state.rec;
        var fresh = cache && cache.at && Date.now() - cache.at < 30 * 60 * 1e3;
        if (!force && fresh) return cache;
        var res = await generate({
          sources,
          settings: state.settings,
          prefs: state.prefs && state.prefs.length ? state.prefs : defaultPrefs(),
          recent: state.recent,
          favorites: state.favorites
        });
        state.rec = Object.assign({ at: Date.now() }, res);
        await host.storage.set("mp:rec", state.rec);
        return state.rec;
      },
      playRecommend: async function(tracks, index) {
        var list = (tracks || []).filter(Boolean);
        if (!list.length) return { ok: false, reason: "没有可播放的歌" };
        await playTracks(list, index || 0);
        refresh();
        return { ok: true };
      },
      addCurrentToCharPlaylist,
      commentCurrent,
      engineStats: function() {
        if (!engine) return null;
        var stats = engine.stats();
        return {
          events: stats.events,
          queues: stats.queues,
          secondsAgo: stats.lastEventAt ? Math.round((Date.now() - stats.lastEventAt) / 1e3) : -1
        };
      }
    };
    var loaded = await Promise.all([
      store.loadSettings(),
      store.loadPlaylists(),
      store.loadFavorites(),
      store.loadRecent(),
      store.loadSearches(),
      store.loadComments()
    ]);
    state.settings = loaded[0];
    state.playlists = loaded[1];
    state.favorites = loaded[2];
    state.recent = loaded[3];
    state.searches = loaded[4];
    state.comments = loaded[5] || {};
    state.prefs = normalizePrefs(await host.storage.get("mp:prefs", null));
    state.rec = await host.storage.get("mp:rec", null);
    state.player.volume = state.settings.volume;
    state.queue = await loadQueue() || createQueue([], {
      repeat: state.settings.repeat,
      shuffle: state.settings.shuffle
    });
    if (nativeAvailable()) {
      engine = createNativeEngine({
        sources,
        minimal: !!state.settings.nativeMinimal,
        onChange: function(snapshot2) {
          state.player = snapshot2;
          if (shell) shell.renderPlayer();
        },
        onTrackChange: function(track2) {
          var inList = state.queue && state.queue.tracks.some(function(t) {
            return trackKey(t) === trackKey(track2);
          });
          if (!inList) {
            state.queue = appendTracks(state.queue, [track2]);
            if (engine) engine.setList(state.queue.tracks, state.settings);
          }
          state.queue = jumpTo(state.queue, trackKey(track2));
          state.recent = pushRecent(state.recent, track2, MAX_RECENT);
          store.saveRecent(state.recent);
          saveQueue();
          loadLyrics(track2);
          if (shell) shell.renderPlayer();
        }
      });
    }
    player = getPlayer({
      volume: state.settings.volume,
      onChange: function(snapshot2) {
        state.player = snapshot2;
        if (shell) shell.renderPlayer();
      },
      onEnded: function() {
        next(true);
      },
      onNext: function() {
        next(false);
      },
      onPrev: function() {
        prev();
      }
    });
    state.player = player.getState();
    shell = createShell(container, ctx);
    shell.mount();
    installBridge();
    hydrate(await host.storage.get("mp:listen", null));
    syncChatRuntime();
    if (engine) {
      engine.attach(state.queue.tracks, state.settings).then(function() {
        var nowPlaying = engine.getState().track;
        if (nowPlaying) {
          var exists = state.queue.tracks.some(function(t) {
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
            state.lyrics = { lines: cachedLines, loading: false, error: "" };
          } else {
            loadLyrics(nowPlaying);
          }
          if (shell) shell.renderPlayer();
        }
        var needRebuild = null;
        try {
          needRebuild = localStorage.getItem("mp:needRebuild");
        } catch (err) {
          needRebuild = null;
        }
        if (needRebuild && state.queue.tracks.length > 1) {
          try {
            localStorage.removeItem("mp:needRebuild");
          } catch (err) {
          }
          var resumeAt = state.player.time || 0;
          var idx2 = state.queue.order[state.queue.pos];
          if (!(idx2 >= 0)) idx2 = 0;
          engine.playList(state.queue.tracks, idx2, state.settings).then(function() {
            if (resumeAt > 1500) engine.seek(resumeAt);
          });
        }
      });
    }
    if (state.player.track) {
      var cached = lyrics.getCached(state.player.track);
      if (cached && cached.length) {
        state.lyrics = { lines: cached, loading: false, error: "" };
        shell.renderPlayer();
      } else {
        loadLyrics(state.player.track);
      }
    }
    var queueSyncTimer = setInterval(function() {
      if (!engine || !shell || !state.queue) return;
      var now = engine.getState().track;
      if (!now) return;
      var exists = state.queue.tracks.some(function(t) {
        return trackKey(t) === trackKey(now);
      });
      if (exists) return;
      state.queue = appendTracks(state.queue, [now]);
      engine.setList(state.queue.tracks, state.settings);
      saveQueue();
      refresh();
    }, 4e3);
    var pending = await host.storage.get("mp:pending", null);
    if (pending) {
      await host.storage.delete("mp:pending");
      var track = normalizeTrack(pending, "local");
      if (track) {
        state.queue = createQueue([track], { repeat: state.settings.repeat, shuffle: false });
        saveQueue();
        playTrack(track);
      }
    }
    return {
      ctx,
      destroy: function() {
        searchToken += 1;
        if (queueSyncTimer) clearInterval(queueSyncTimer);
        queueSyncTimer = null;
        if (player) player.setHandlers({});
        if (engine) engine.dispose();
        clearBridge();
        if (shell) shell.destroy();
        shell = null;
        saveQueue();
      }
    };
  }

  // src/main.js
  var app = null;
  async function mount8(container, roche) {
    ensureStyle();
    container.classList.add("mp-host");
    app = await createApp({ container, roche, version: "0.38.0" });
  }
  async function unmount(container) {
    if (app) {
      app.destroy();
      app = null;
    }
    container.replaceChildren();
    container.classList.remove("mp-host");
    container.removeAttribute("data-theme");
    removeStyleIfUnused();
  }
  var PLUS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';
  window.RochePlugin.register({
    id: "music-player",
    name: "音乐播放器",
    version: "0.38.0",
    description: "多音源搜歌、播放、歌单与收藏，可在聊天里发起一起听。",
    apps: [
      {
        id: "music-player-home",
        name: "音乐",
        icon: "music",
        iconImage: "",
        // 边听歌边聊天：允许最小化成全局悬浮按钮
        minimize: {
          mode: "button",
          scope: "global",
          iconSvg: PLUS_ICON,
          width: 300,
          height: 220
        },
        mount: mount8,
        unmount
      }
    ],
    chat: {
      scope: { conversationTypes: ["direct", "group"] },
      // 每轮注入「当前在听什么」+ 可用动作；设置里关掉一起听后返回 null，不注入
      contextProvider: chatContextProvider,
      // 模型可直接调用的音乐工具（点歌 / 切歌 / 暂停 / 查状态 / 收藏）
      tools: chatTools,
      messageTypes: [
        {
          id: MESSAGE_TYPE,
          name: "一起听",
          scope: { conversationTypes: ["direct", "group"] },
          mount: mountCard,
          update: updateCard,
          unmount: unmountCard,
          onAction: onCardAction
        }
      ],
      plusActions: [
        {
          id: "mp-listen",
          label: "一起听",
          iconSvg: PLUS_ICON,
          scope: { conversationTypes: ["direct", "group"] },
          open: openPlusAction
        }
      ]
    }
  });
  if (typeof window !== "undefined") {
    window.__mpStartCommandBridge = startCommandBridge;
  }
})();
