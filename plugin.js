/* music-player v0.2.0 | built 2026-11-02T14:56:41.834Z */
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
    var storage = {
      async get(key, fallback) {
        try {
          if (caps.storage) {
            var value = await raw.storage.get(key);
            if (value !== void 0 && value !== null) {
              memory[key] = value;
              return value;
            }
          }
        } catch (err) {
          warn("storage.get " + key, err);
        }
        return key in memory ? memory[key] : fallback;
      },
      async set(key, value) {
        memory[key] = value;
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
  function nextRepeat(mode) {
    var i = REPEAT_ORDER.indexOf(mode);
    return REPEAT_ORDER[(i + 1) % REPEAT_ORDER.length];
  }
  function repeatLabel(mode) {
    if (mode === REPEAT.ALL) return "列表循环";
    if (mode === REPEAT.ONE) return "单曲循环";
    return "顺序播放";
  }
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
  var SCHEMA_VERSION = 2;
  function defaultSettings() {
    return {
      schemaVersion: SCHEMA_VERSION,
      sources: { tencent: true, itunes: true, netease: true },
      prefix: "",
      volume: 0.8,
      repeat: REPEAT.OFF,
      shuffle: false
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
        netease: bool(sources.netease, def.sources.netease)
      },
      prefix: String(s.prefix || s.proxy || "").trim(),
      volume: clampNum(s.volume, 0, 1, def.volume),
      repeat: REPEAT_ORDER.indexOf(s.repeat) === -1 ? def.repeat : s.repeat,
      shuffle: bool(s.shuffle, def.shuffle)
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
      out.push({
        id: String(p.id),
        name: cleanName(p.name, "未命名歌单"),
        tracks: dedupeTracks(Array.isArray(p.tracks) ? p.tracks : []).slice(0, MAX_TRACKS_PER_PLAYLIST),
        createdAt: Number(p.createdAt) || 0,
        updatedAt: Number(p.updatedAt) || Number(p.createdAt) || 0
      });
    });
    return out;
  }
  function createPlaylist(list, name, id, now) {
    var arr = (list || []).slice();
    if (arr.length >= MAX_PLAYLISTS) return { list: arr, playlist: null, reason: "limit" };
    var playlist = {
      id: String(id),
      name: cleanName(name, "未命名歌单"),
      tracks: [],
      createdAt: Number(now) || 0,
      updatedAt: Number(now) || 0
    };
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
    recent: "mp:recent"
  };
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
    async function loadPlaylists() {
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
    async function clearAll() {
      await host.storage.delete(KEYS.settings);
      await host.storage.delete(KEYS.playlists);
      await host.storage.delete(KEYS.favorites);
      await host.storage.delete(KEYS.recent);
    }
    return {
      loadSettings,
      saveSettings,
      loadPlaylists,
      savePlaylists,
      loadFavorites,
      saveFavorites,
      loadRecent,
      saveRecent,
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

  // src/services/sources.js
  var VKEYS = "https://api.vkeys.cn/v2/music";
  var ITUNES = "https://itunes.apple.com/search";
  var TIMEOUT_MS = 12e3;
  function applyProxy(url, prefix) {
    var p = String(prefix || "").trim();
    if (!p) return url;
    if (p.indexOf("{url}") !== -1) return p.replace("{url}", encodeURIComponent(url));
    return p + encodeURIComponent(url);
  }
  async function fetchJson(url, prefix) {
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
      var text = await res.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch (err) {
        return JSON.parse(JSON.parse(text));
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
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
    var base = ITUNES + "?term=" + encodeURIComponent(keyword) + "&entity=song&limit=" + limit + "&country=cn&lang=zh_cn";
    var data = await fetchJson(base, settings.prefix);
    var list = data && data.results || [];
    if (!list.length) {
      var fallback = await fetchJson(base.replace("country=cn", "country=us"), settings.prefix);
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
  function createSources() {
    async function search(keyword, settings, opts) {
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
      else steps = ["netease", "itunes"];
      if (track.url) queue.push(preferHttps(track.url));
      async function fill(kind) {
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
      return results;
    }
    return { search, createResolver, selfTest };
  }

  // src/services/player.js
  function createPlayer(options) {
    var opts = options || {};
    var audio = new Audio();
    audio.preload = "auto";
    var state = {
      status: "idle",
      // idle | loading | playing | paused | error
      track: null,
      time: 0,
      duration: 0,
      error: "",
      volume: typeof opts.volume === "number" ? opts.volume : 0.8
    };
    audio.volume = state.volume;
    var attemptToken = 0;
    function emit() {
      if (typeof opts.onChange === "function") opts.onChange(getState());
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
    audio.addEventListener("timeupdate", function() {
      state.time = Number(audio.currentTime || 0) * 1e3;
      if (audio.duration && Number.isFinite(audio.duration)) {
        state.duration = Number(audio.duration) * 1e3;
      }
      emit();
    });
    audio.addEventListener("loadedmetadata", function() {
      state.duration = Number.isFinite(audio.duration) ? Number(audio.duration) * 1e3 : state.track && state.track.duration || 0;
      emit();
    });
    audio.addEventListener("play", function() {
      state.status = "playing";
      emit();
    });
    audio.addEventListener("pause", function() {
      if (state.status !== "error" && state.status !== "loading") state.status = "paused";
      emit();
    });
    audio.addEventListener("ended", function() {
      state.status = "paused";
      state.time = state.duration;
      emit();
      if (typeof opts.onEnded === "function") opts.onEnded();
    });
    function tryUrl(url) {
      return new Promise(function(resolve) {
        var settled = false;
        var timer = setTimeout(function() {
          finish(false);
        }, 12e3);
        function cleanup() {
          clearTimeout(timer);
          audio.removeEventListener("error", onError);
          audio.removeEventListener("canplay", onCanPlay);
          audio.removeEventListener("playing", onCanPlay);
        }
        function finish(ok) {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(ok);
        }
        function onError() {
          finish(false);
        }
        function onCanPlay() {
          finish(true);
        }
        audio.addEventListener("error", onError);
        audio.addEventListener("canplay", onCanPlay);
        audio.addEventListener("playing", onCanPlay);
        audio.src = url;
        var playing = audio.play();
        if (playing && playing.catch) {
          playing.catch(function() {
          });
        }
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
    async function toggle() {
      if (!state.track) return false;
      if (state.status === "playing") {
        audio.pause();
        return true;
      }
      if (state.status === "error") return false;
      try {
        await audio.play();
        return true;
      } catch (err) {
        state.status = "error";
        state.error = "无法继续播放";
        emit();
        return false;
      }
    }
    function seek(ms) {
      var sec = Math.max(0, (Number(ms) || 0) / 1e3);
      if (!Number.isFinite(audio.duration)) return;
      audio.currentTime = Math.min(sec, audio.duration || sec);
      state.time = audio.currentTime * 1e3;
      emit();
    }
    function setVolume(v) {
      var vol = Math.min(1, Math.max(0, Number(v)));
      if (!Number.isFinite(vol)) return state.volume;
      state.volume = vol;
      audio.volume = vol;
      emit();
      return vol;
    }
    function stop() {
      attemptToken += 1;
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch (err) {
      }
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
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch (err) {
      }
      state.status = "idle";
      state.track = null;
    }
    return {
      load,
      toggle,
      seek,
      setVolume,
      stop,
      dispose,
      getState,
      isPlaying: function() {
        return state.status === "playing";
      }
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
    note: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M7 4h10v16l-5-3-5 3z"/></svg>'
  };
  function icon(name) {
    return ICONS[name] || ICONS.music;
  }

  // src/ui/theme.css
  var theme_default = '/* 主题变量：只在插件根容器内生效 */\n.mp-root {\n  --mp-bg: #ffffff;\n  --mp-bg-2: #f7f7f9;\n  --mp-soft: #f2f3f5;\n  --mp-soft-2: #e9eaee;\n  --mp-line: #ededf0;\n  --mp-line-strong: #dfe0e4;\n  --mp-ink: #1b1c1f;\n  --mp-ink-2: #4f5259;\n  --mp-muted: #9299a3;\n  --mp-accent: #e14b4b;\n  --mp-accent-soft: rgba(225, 75, 75, 0.1);\n  --mp-on-accent: #ffffff;\n\n  --mp-r-lg: 16px;\n  --mp-r-md: 10px;\n  --mp-r-sm: 8px;\n  --mp-r-full: 999px;\n\n  --mp-shadow: 0 10px 30px rgba(17, 18, 20, 0.08);\n  --mp-font: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;\n}\n\n.mp-root[data-theme="dark"] {\n  --mp-bg: #141518;\n  --mp-bg-2: #1a1c20;\n  --mp-soft: #22242a;\n  --mp-soft-2: #2b2e35;\n  --mp-line: #262930;\n  --mp-line-strong: #34383f;\n  --mp-ink: #f1f2f4;\n  --mp-ink-2: #c3c7cd;\n  --mp-muted: #868c96;\n  --mp-accent: #f0645f;\n  --mp-accent-soft: rgba(240, 100, 95, 0.16);\n  --mp-on-accent: #ffffff;\n  --mp-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);\n}\n';

  // src/ui/base.css
  var base_default = '/* 基础布局：全页无外壳，播放条与底栏固定在页面底部 */\n\n.mp-root,\n.mp-root * {\n  box-sizing: border-box;\n}\n\n.mp-root {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  height: 100%;\n  min-width: 0;\n  min-height: 0;\n  overflow: hidden;\n  background: var(--mp-bg);\n  color: var(--mp-ink);\n  font-family: var(--mp-font);\n  font-size: 14px;\n  line-height: 1.45;\n  -webkit-font-smoothing: antialiased;\n}\n\n.mp-root button {\n  font-family: inherit;\n  cursor: pointer;\n}\n\n.mp-root button:disabled {\n  opacity: 0.45;\n  cursor: default;\n}\n\n/* ---------- 页面骨架 ---------- */\n\n.mp-view-host {\n  flex: 1 1 auto;\n  min-height: 0;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n}\n\n.mp-view {\n  flex: 1 1 auto;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n}\n\n.mp-header {\n  flex: 0 0 auto;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 14px 16px 8px;\n}\n\n.mp-header__title {\n  flex: 1 1 auto;\n  min-width: 0;\n  font-size: 21px;\n  font-weight: 700;\n  letter-spacing: -0.2px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-header__sub {\n  font-size: 12px;\n  color: var(--mp-muted);\n  font-weight: 400;\n}\n\n.mp-body {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow-y: auto;\n  overscroll-behavior: contain;\n  -webkit-overflow-scrolling: touch;\n  padding-bottom: 12px;\n}\n\n.mp-icon-btn {\n  flex: 0 0 auto;\n  width: 34px;\n  height: 34px;\n  display: grid;\n  place-items: center;\n  border: 0;\n  border-radius: var(--mp-r-full);\n  background: transparent;\n  color: var(--mp-ink-2);\n  padding: 0;\n}\n\n.mp-icon-btn:active {\n  background: var(--mp-soft);\n}\n\n.mp-icon-btn svg {\n  width: 21px;\n  height: 21px;\n}\n\n.mp-icon-btn.is-active {\n  color: var(--mp-accent);\n}\n\n/* ---------- 歌曲行 ---------- */\n\n.mp-row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 16px;\n  border: 0;\n  background: transparent;\n  width: 100%;\n  text-align: left;\n  color: inherit;\n}\n\n.mp-row:active {\n  background: var(--mp-soft);\n}\n\n.mp-row__cover {\n  flex: 0 0 auto;\n  width: 44px;\n  height: 44px;\n  border-radius: var(--mp-r-sm);\n  object-fit: cover;\n  background: var(--mp-soft-2);\n  display: grid;\n  place-items: center;\n  color: var(--mp-muted);\n  overflow: hidden;\n}\n\n.mp-row__cover svg {\n  width: 20px;\n  height: 20px;\n}\n\n.mp-row__cover img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  display: block;\n}\n\n.mp-row__main {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.mp-row__name {\n  font-size: 14.5px;\n  font-weight: 500;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-row.is-current .mp-row__name {\n  color: var(--mp-accent);\n}\n\n.mp-row__sub {\n  margin-top: 2px;\n  font-size: 11.5px;\n  color: var(--mp-muted);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-row__tag {\n  display: inline-block;\n  margin-right: 5px;\n  padding: 0 5px;\n  border-radius: 4px;\n  background: var(--mp-soft);\n  color: var(--mp-muted);\n  font-size: 10px;\n  line-height: 15px;\n  vertical-align: 1px;\n}\n\n.mp-row__btn {\n  flex: 0 0 auto;\n  width: 32px;\n  height: 32px;\n  display: grid;\n  place-items: center;\n  border: 0;\n  border-radius: var(--mp-r-full);\n  background: transparent;\n  color: var(--mp-muted);\n}\n\n.mp-row__btn:active {\n  background: var(--mp-soft-2);\n}\n\n.mp-row__btn svg {\n  width: 19px;\n  height: 19px;\n}\n\n.mp-row__btn.is-active {\n  color: var(--mp-accent);\n}\n\n/* ---------- 迷你播放条 ---------- */\n\n.mp-player {\n  position: relative;\n  flex: 0 0 auto;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 9px 14px 10px;\n  border-top: 1px solid var(--mp-line);\n  background: var(--mp-bg);\n}\n\n.mp-player__bar {\n  position: absolute;\n  top: 0;\n  left: 0;\n  right: 0;\n  height: 2px;\n  background: var(--mp-line);\n  cursor: pointer;\n}\n\n.mp-player__bar i {\n  display: block;\n  height: 100%;\n  width: 0;\n  background: var(--mp-accent);\n}\n\n.mp-player__cover {\n  flex: 0 0 auto;\n  width: 40px;\n  height: 40px;\n  border-radius: var(--mp-r-sm);\n  background: var(--mp-soft-2);\n  display: grid;\n  place-items: center;\n  overflow: hidden;\n  color: var(--mp-muted);\n}\n\n.mp-player__cover svg {\n  width: 19px;\n  height: 19px;\n}\n\n.mp-player__cover img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  display: block;\n}\n\n.mp-player__main {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.mp-player__hit {\n  display: block;\n  border: 0;\n  background: transparent;\n  padding: 0;\n  text-align: left;\n  color: inherit;\n}\n\n.mp-player__name {\n  font-size: 13.5px;\n  font-weight: 500;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-player__sub {\n  font-size: 11px;\n  color: var(--mp-muted);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-player__play {\n  flex: 0 0 auto;\n  width: 36px;\n  height: 36px;\n  display: grid;\n  place-items: center;\n  border: 0;\n  border-radius: var(--mp-r-full);\n  background: transparent;\n  color: var(--mp-ink);\n}\n\n.mp-player__play svg {\n  width: 26px;\n  height: 26px;\n}\n\n/* ---------- 四按钮底栏 ---------- */\n\n.mp-dock {\n  flex: 0 0 auto;\n  display: flex;\n  align-items: stretch;\n  border-top: 1px solid var(--mp-line);\n  background: var(--mp-bg);\n  padding: 4px 2px calc(4px + env(safe-area-inset-bottom));\n}\n\n.mp-dock__btn {\n  flex: 1 1 0;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 2px;\n  padding: 5px 0 3px;\n  border: 0;\n  background: transparent;\n  color: var(--mp-muted);\n  font-size: 10.5px;\n  line-height: 1.2;\n}\n\n.mp-dock__btn svg {\n  width: 22px;\n  height: 22px;\n}\n\n.mp-dock__btn.is-active {\n  color: var(--mp-accent);\n}\n\n/* ---------- 底部弹层（挂在插件根内） ---------- */\n\n.mp-mask {\n  position: absolute;\n  inset: 0;\n  z-index: 40;\n  display: flex;\n  align-items: flex-end;\n  background: rgba(0, 0, 0, 0.35);\n}\n\n.mp-sheet {\n  width: 100%;\n  max-height: 74%;\n  display: flex;\n  flex-direction: column;\n  background: var(--mp-bg);\n  border-radius: var(--mp-r-lg) var(--mp-r-lg) 0 0;\n  padding-bottom: calc(6px + env(safe-area-inset-bottom));\n  animation: mp-rise 0.18s ease-out;\n}\n\n@keyframes mp-rise {\n  from { transform: translateY(12px); opacity: 0.6; }\n  to { transform: translateY(0); opacity: 1; }\n}\n\n.mp-sheet__head {\n  flex: 0 0 auto;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 14px 16px 8px;\n}\n\n.mp-sheet__title {\n  flex: 1 1 auto;\n  min-width: 0;\n  font-size: 14px;\n  font-weight: 600;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-sheet__body {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow-y: auto;\n  padding-bottom: 6px;\n}\n\n.mp-sheet__item {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  width: 100%;\n  padding: 12px 16px;\n  border: 0;\n  background: transparent;\n  color: var(--mp-ink);\n  font-size: 14.5px;\n  text-align: left;\n}\n\n.mp-sheet__item:active {\n  background: var(--mp-soft);\n}\n\n.mp-sheet__item svg {\n  width: 19px;\n  height: 19px;\n  color: var(--mp-muted);\n}\n\n.mp-sheet__label {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-sheet__item.is-danger {\n  color: var(--mp-accent);\n}\n\n/* ---------- 聊天卡片（宿主只给内容区，这里不造气泡） ---------- */\n\n.mp-card {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 9px 11px;\n  border-radius: 12px;\n  background: var(--mp-bg, #fff);\n  color: var(--mp-ink, #1b1c1f);\n  border: 1px solid var(--mp-line, #ededf0);\n  min-width: 190px;\n  max-width: 100%;\n  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;\n}\n\n.mp-card__cover {\n  flex: 0 0 auto;\n  width: 40px;\n  height: 40px;\n  border-radius: 8px;\n  background: var(--mp-soft-2, #e9eaee);\n  display: grid;\n  place-items: center;\n  color: #9299a3;\n  overflow: hidden;\n}\n\n.mp-card__cover svg {\n  width: 20px;\n  height: 20px;\n}\n\n.mp-card__cover img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  display: block;\n}\n\n.mp-card__main {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.mp-card__name {\n  font-size: 13.5px;\n  font-weight: 600;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-card__sub {\n  margin-top: 1px;\n  font-size: 11px;\n  color: #9299a3;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-card__act {\n  flex: 0 0 auto;\n  border: 0;\n  background: rgba(225, 75, 75, 0.1);\n  color: #e14b4b;\n  font-size: 12px;\n  font-weight: 600;\n  padding: 6px 11px;\n  border-radius: 999px;\n}\n\n/* ---------- 独立弹层（聊天 + 面板里用，只能挂 body） ---------- */\n\n.mp-modal {\n  position: fixed;\n  inset: 0;\n  z-index: 9999;\n  display: flex;\n  align-items: flex-end;\n  justify-content: center;\n  background: rgba(0, 0, 0, 0.4);\n  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;\n}\n\n.mp-modal__panel {\n  width: 100%;\n  max-width: 480px;\n  max-height: 76vh;\n  display: flex;\n  flex-direction: column;\n  background: #fff;\n  color: #1b1c1f;\n  border-radius: 18px 18px 0 0;\n  padding-bottom: calc(8px + env(safe-area-inset-bottom));\n  overflow: hidden;\n}\n\n.mp-modal__head {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 14px 16px 10px;\n  border-bottom: 1px solid #ededf0;\n}\n\n.mp-modal__title {\n  flex: 1 1 auto;\n  font-size: 15px;\n  font-weight: 700;\n}\n\n.mp-modal__input {\n  flex: 1 1 auto;\n  min-width: 0;\n  border: 0;\n  outline: none;\n  font-size: 14.5px;\n  background: transparent;\n  color: inherit;\n}\n\n.mp-modal__body {\n  flex: 1 1 auto;\n  min-height: 120px;\n  max-height: 56vh;\n  overflow-y: auto;\n}\n\n.mp-modal__row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  width: 100%;\n  padding: 10px 16px;\n  border: 0;\n  background: transparent;\n  color: inherit;\n  text-align: left;\n  font-size: 14px;\n}\n\n.mp-modal__row:active {\n  background: #f2f3f5;\n}\n\n.mp-modal__row span {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-modal__hint {\n  padding: 14px 16px;\n  font-size: 12.5px;\n  color: #9299a3;\n  text-align: center;\n}\n';

  // src/ui/views.css
  var views_default = '/* 各页面专属样式 */\n\n/* ---------- 搜索 ---------- */\n\n.mp-search {\n  flex: 0 0 auto;\n  padding: 0 16px 8px;\n}\n\n.mp-search__box {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  height: 38px;\n  padding: 0 12px;\n  border-radius: var(--mp-r-full);\n  background: var(--mp-soft);\n  color: var(--mp-muted);\n}\n\n.mp-search__box svg {\n  width: 17px;\n  height: 17px;\n  flex: 0 0 auto;\n}\n\n.mp-search__input {\n  flex: 1 1 auto;\n  min-width: 0;\n  border: 0;\n  outline: none;\n  background: transparent;\n  color: var(--mp-ink);\n  font-size: 14px;\n}\n\n.mp-search__clear {\n  flex: 0 0 auto;\n  width: 20px;\n  height: 20px;\n  display: grid;\n  place-items: center;\n  border: 0;\n  border-radius: 50%;\n  background: var(--mp-soft-2);\n  color: var(--mp-muted);\n  padding: 0;\n}\n\n.mp-search__clear svg {\n  width: 12px;\n  height: 12px;\n}\n\n.mp-chips {\n  display: flex;\n  gap: 8px;\n  overflow-x: auto;\n  padding: 6px 16px 2px;\n  scrollbar-width: none;\n}\n\n.mp-chips::-webkit-scrollbar {\n  display: none;\n}\n\n.mp-chip {\n  flex: 0 0 auto;\n  border: 1px solid var(--mp-line-strong);\n  background: transparent;\n  color: var(--mp-ink-2);\n  border-radius: var(--mp-r-full);\n  padding: 4px 12px;\n  font-size: 12.5px;\n}\n\n.mp-chip.is-active {\n  border-color: transparent;\n  background: var(--mp-accent-soft);\n  color: var(--mp-accent);\n  font-weight: 600;\n}\n\n/* ---------- 通用段落 ---------- */\n\n.mp-section {\n  padding: 14px 16px 6px;\n  font-size: 12.5px;\n  font-weight: 600;\n  color: var(--mp-muted);\n}\n\n.mp-hint {\n  padding: 22px 24px;\n  text-align: center;\n  font-size: 12.5px;\n  color: var(--mp-muted);\n  line-height: 1.7;\n}\n\n.mp-error {\n  margin: 8px 16px;\n  padding: 9px 12px;\n  border-radius: var(--mp-r-md);\n  background: var(--mp-accent-soft);\n  color: var(--mp-accent);\n  font-size: 12px;\n}\n\n/* ---------- 歌单列表 ---------- */\n\n.mp-list {\n  padding: 4px 10px 8px;\n}\n\n.mp-pl {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  width: 100%;\n  padding: 9px 6px;\n  border: 0;\n  background: transparent;\n  color: inherit;\n  text-align: left;\n  border-radius: var(--mp-r-md);\n}\n\n.mp-pl:active {\n  background: var(--mp-soft);\n}\n\n.mp-pl__cover {\n  flex: 0 0 auto;\n  width: 54px;\n  height: 54px;\n  border-radius: var(--mp-r-md);\n  background: linear-gradient(135deg, var(--mp-soft-2), var(--mp-soft));\n  display: grid;\n  place-items: center;\n  color: var(--mp-muted);\n  overflow: hidden;\n}\n\n.mp-pl__cover svg {\n  width: 22px;\n  height: 22px;\n}\n\n.mp-pl__cover img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  display: block;\n}\n\n.mp-pl__main {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.mp-pl__name {\n  font-size: 14.5px;\n  font-weight: 500;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-pl__sub {\n  margin-top: 3px;\n  font-size: 11.5px;\n  color: var(--mp-muted);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* ---------- 歌单详情 / 收藏 顶部操作 ---------- */\n\n.mp-actions {\n  display: flex;\n  gap: 10px;\n  padding: 4px 16px 10px;\n}\n\n.mp-btn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  border: 0;\n  border-radius: var(--mp-r-full);\n  padding: 8px 16px;\n  font-size: 13px;\n  font-weight: 600;\n  background: var(--mp-soft);\n  color: var(--mp-ink);\n}\n\n.mp-btn svg {\n  width: 16px;\n  height: 16px;\n}\n\n.mp-btn--primary {\n  background: var(--mp-accent);\n  color: var(--mp-on-accent);\n}\n\n.mp-btn--ghost {\n  background: transparent;\n  border: 1px solid var(--mp-line-strong);\n  color: var(--mp-ink-2);\n  font-weight: 500;\n}\n\n.mp-actions .mp-btn {\n  flex: 1 1 0;\n}\n\n/* ---------- 正在播放页 ---------- */\n\n.mp-now {\n  flex: 1 1 auto;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  padding: 4px 26px 18px;\n  overflow: hidden;\n}\n\n.mp-now__head {\n  flex: 0 0 auto;\n  width: 100%;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 6px 0 8px;\n}\n\n.mp-now__from {\n  flex: 1 1 auto;\n  text-align: center;\n  font-size: 12px;\n  color: var(--mp-muted);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-now__cover {\n  flex: 0 0 auto;\n  width: min(76vw, 300px);\n  height: min(76vw, 300px);\n  margin: auto 0;\n  border-radius: 50%;\n  background: linear-gradient(135deg, var(--mp-soft-2), var(--mp-soft));\n  display: grid;\n  place-items: center;\n  color: var(--mp-muted);\n  overflow: hidden;\n  box-shadow: var(--mp-shadow);\n}\n\n.mp-now__cover svg {\n  width: 54px;\n  height: 54px;\n}\n\n.mp-now__cover img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  display: block;\n}\n\n.mp-now__meta {\n  flex: 0 0 auto;\n  width: 100%;\n  text-align: center;\n  margin-top: 18px;\n}\n\n.mp-now__name {\n  font-size: 18px;\n  font-weight: 700;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-now__artist {\n  margin-top: 4px;\n  font-size: 12.5px;\n  color: var(--mp-muted);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-now__progress {\n  flex: 0 0 auto;\n  width: 100%;\n  margin-top: 16px;\n}\n\n.mp-now__track {\n  height: 4px;\n  border-radius: 999px;\n  background: var(--mp-soft-2);\n  cursor: pointer;\n  position: relative;\n}\n\n.mp-now__track i {\n  display: block;\n  height: 100%;\n  width: 0;\n  border-radius: 999px;\n  background: var(--mp-accent);\n}\n\n.mp-now__times {\n  display: flex;\n  justify-content: space-between;\n  margin-top: 5px;\n  font-size: 11px;\n  color: var(--mp-muted);\n  font-variant-numeric: tabular-nums;\n}\n\n.mp-now__ctrl {\n  flex: 0 0 auto;\n  width: 100%;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-top: 14px;\n}\n\n.mp-now__ctrl .mp-icon-btn {\n  width: 42px;\n  height: 42px;\n}\n\n.mp-now__ctrl .mp-icon-btn svg {\n  width: 23px;\n  height: 23px;\n}\n\n.mp-now__play {\n  width: 58px;\n  height: 58px;\n  display: grid;\n  place-items: center;\n  border: 0;\n  border-radius: 50%;\n  background: var(--mp-ink);\n  color: var(--mp-bg);\n}\n\n.mp-now__play svg {\n  width: 28px;\n  height: 28px;\n}\n\n.mp-now__extras {\n  flex: 0 0 auto;\n  width: 100%;\n  display: flex;\n  justify-content: space-around;\n  margin-top: 14px;\n  padding-bottom: 4px;\n}\n\n/* ---------- 设置 ---------- */\n\n.mp-group {\n  margin: 6px 16px 14px;\n  border-radius: var(--mp-r-md);\n  background: var(--mp-bg-2);\n  overflow: hidden;\n}\n\n.mp-group__title {\n  padding: 12px 14px 6px;\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--mp-muted);\n}\n\n.mp-field {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 11px 14px;\n  border-top: 1px solid var(--mp-line);\n}\n\n.mp-group__title + .mp-field {\n  border-top: 0;\n}\n\n.mp-field__label {\n  flex: 1 1 auto;\n  min-width: 0;\n  font-size: 14px;\n}\n\n.mp-field__desc {\n  margin-top: 2px;\n  font-size: 11px;\n  color: var(--mp-muted);\n  line-height: 1.5;\n}\n\n.mp-field__value {\n  flex: 0 0 auto;\n  font-size: 13px;\n  color: var(--mp-muted);\n  max-width: 55%;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.mp-input {\n  flex: 0 0 auto;\n  width: 55%;\n  border: 0;\n  outline: none;\n  background: transparent;\n  color: var(--mp-ink);\n  font-size: 13px;\n  text-align: right;\n}\n\n.mp-switch {\n  flex: 0 0 auto;\n  width: 46px;\n  height: 27px;\n  border-radius: 999px;\n  border: 0;\n  background: var(--mp-soft-2);\n  position: relative;\n  transition: background 0.15s;\n  padding: 0;\n}\n\n.mp-switch::after {\n  content: "";\n  position: absolute;\n  top: 3px;\n  left: 3px;\n  width: 21px;\n  height: 21px;\n  border-radius: 50%;\n  background: #fff;\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);\n  transition: transform 0.15s;\n}\n\n.mp-switch.is-on {\n  background: var(--mp-accent);\n}\n\n.mp-switch.is-on::after {\n  transform: translateX(19px);\n}\n\n.mp-select {\n  flex: 0 0 auto;\n  border: 0;\n  background: transparent;\n  color: var(--mp-muted);\n  font-size: 13px;\n  text-align: right;\n  outline: none;\n}\n\n.mp-slider {\n  flex: 0 0 auto;\n  width: 55%;\n  accent-color: var(--mp-accent);\n}\n\n.mp-about {\n  padding: 6px 24px 28px;\n  text-align: center;\n  font-size: 11.5px;\n  color: var(--mp-muted);\n  line-height: 1.8;\n}\n';

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
    var row = h("div", { class: "mp-row" + (opts.current ? " is-current" : "") });
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
      opts.onPlay();
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
    function close() {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
    }
    (o.items || []).forEach(function(item) {
      var row = h("button", {
        class: "mp-sheet__item" + (item.danger ? " is-danger" : ""),
        type: "button"
      }, [
        h("span", { html: icon(item.icon || "music") }),
        h("span", { class: "mp-sheet__label", text: item.label }),
        item.hint ? h("span", { class: "mp-field__value", text: item.hint }) : null
      ]);
      row.addEventListener("click", function() {
        close();
        if (item.onClick) item.onClick();
      });
      body.appendChild(row);
    });
    if (!(o.items || []).length) {
      body.appendChild(h("div", { class: "mp-hint", text: o.empty || "这里还没有内容" }));
    }
    var sheet = h("div", { class: "mp-sheet" }, [
      h("div", { class: "mp-sheet__head" }, [
        h("div", { class: "mp-sheet__title", text: o.title || "" }),
        iconBtn("close", { label: "关闭", onClick: close })
      ]),
      body
    ]);
    mask.addEventListener("click", function(e) {
      if (e.target === mask) close();
    });
    mask.appendChild(sheet);
    rootEl.appendChild(mask);
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

  // src/ui/views/search.js
  function mount(host, ctx) {
    var state = ctx.state;
    var resultsBox = h("div");
    var input = h("input", {
      class: "mp-search__input",
      type: "search",
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
    if (ctx.host.caps.minimizeApp) {
      headerRight.push(iconBtn("down", {
        label: "最小化",
        onClick: function() {
          ctx.host.ui.minimizeApp();
        }
      }));
    }
    var header = h("div", { class: "mp-header" }, [
      h("div", { class: "mp-header__title", text: "搜索" }),
      h("div", { class: "mp-header__sub", text: "QQ 音乐 · iTunes" })
    ].concat(headerRight));
    var chips = h("div", { class: "mp-chips" });
    function toggleSource(key, label) {
      var sources = Object.assign({}, state.settings.sources);
      sources[key] = !sources[key];
      if (!sources.tencent && !sources.itunes) return;
      ctx.updateSettings({ sources }).then(function() {
        if (state.search.keyword) ctx.searchNow(state.search.keyword);
      });
    }
    function renderChips() {
      clear(chips);
      var qq = h("button", {
        class: "mp-chip" + (state.settings.sources.tencent ? " is-active" : ""),
        type: "button",
        text: "QQ 音乐"
      });
      qq.addEventListener("click", function() {
        toggleSource("tencent", "QQ 音乐");
      });
      var itunes = h("button", {
        class: "mp-chip" + (state.settings.sources.itunes ? " is-active" : ""),
        type: "button",
        text: "iTunes 30s"
      });
      itunes.addEventListener("click", function() {
        toggleSource("itunes", "iTunes");
      });
      chips.appendChild(qq);
      chips.appendChild(itunes);
    }
    function renderResults() {
      clear(resultsBox);
      var s = state.search;
      if (s.busy) {
        resultsBox.appendChild(h("div", { class: "mp-hint", text: "正在搜索…" }));
        return;
      }
      if (!s.at) {
        resultsBox.appendChild(emptyHint(
          "搜点什么吧",
          "QQ 音乐搜完整歌曲，iTunes 兜底 30 秒试听\n点歌曲右侧 ▶ 直接播放"
        ));
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
      var playing = ctx.state.player.status === "playing";
      s.tracks.forEach(function(track, i) {
        resultsBox.appendChild(songRow({
          track,
          coverUrl: ctx.coverOf(track),
          coverKey: trackKey(track),
          current: ctx.isCurrent(track),
          playing: playing && ctx.isCurrent(track),
          tag: track.source === "itunes" ? "试听" : "",
          onPlay: function() {
            if (ctx.isCurrent(track)) ctx.togglePlay();
            else ctx.playTracks(s.tracks, i);
          },
          onMore: function() {
            ctx.openSongSheet(track, { queueTracks: s.tracks, queueIndex: i });
          }
        }));
      });
    }
    var view = h("div", { class: "mp-view" }, [
      header,
      h("div", { class: "mp-search" }, [box]),
      chips,
      resultsBox
    ]);
    host.appendChild(view);
    renderChips();
    renderResults();
    return {
      refresh: function() {
        renderChips();
        renderResults();
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
  function mount2(host, ctx) {
    var state = ctx.state;
    var listBox = h("div", { class: "mp-list" });
    var header = h("div", { class: "mp-header" }, [
      h("div", { class: "mp-header__title", text: "歌单" }),
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
    function renderList() {
      clear(listBox);
      if (!state.playlists.length) {
        listBox.appendChild(emptyHint(
          "还没有歌单",
          "右上角 + 新建一个\n在歌曲的「⋯」里可以把歌加进来"
        ));
        return;
      }
      state.playlists.forEach(function(p) {
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
          ctx.goto("playlist", { playlistId: p.id });
        });
        listBox.appendChild(row);
      });
    }
    var view = h("div", { class: "mp-view" }, [header, listBox]);
    host.appendChild(view);
    renderList();
    return { refresh: renderList };
  }

  // src/ui/views/playlistDetail.js
  function mount3(host, ctx) {
    var state = ctx.state;
    var listBox = h("div");
    function back2() {
      ctx.goto("playlists");
    }
    function currentPlaylist() {
      return ctx.playlistOf(state.playlistId);
    }
    var titleEl = h("div", { class: "mp-header__title", text: "歌单" });
    var subEl = h("div", { class: "mp-header__sub", text: "" });
    var moreBtn = iconBtn("more", {
      label: "更多",
      onClick: function() {
        var p = currentPlaylist();
        if (!p) return;
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
  function mount4(host, ctx) {
    var state = ctx.state;
    var listBox = h("div");
    var actions = h("div", { class: "mp-actions" });
    var subEl = h("div", { class: "mp-header__sub", text: "" });
    var header = h("div", { class: "mp-header" }, [
      h("div", { class: "mp-header__title", text: "收藏" }),
      subEl
    ]);
    function render2() {
      var list = state.favorites;
      subEl.textContent = list.length ? list.length + " 首" : "";
      clear(actions);
      if (list.length) {
        var playAll = h("button", { class: "mp-btn mp-btn--primary", type: "button" }, [
          h("span", { html: icon("play") }),
          h("span", { text: "播放全部" })
        ]);
        playAll.addEventListener("click", function() {
          ctx.playTracks(list, 0);
        });
        var shuffleAll = h("button", { class: "mp-btn mp-btn--ghost", type: "button" }, [
          h("span", { html: icon("shuffle") }),
          h("span", { text: "随机播放" })
        ]);
        shuffleAll.addEventListener("click", async function() {
          if (!state.settings.shuffle) await ctx.toggleShuffle();
          ctx.playTracks(state.favorites, 0);
        });
        actions.appendChild(playAll);
        actions.appendChild(shuffleAll);
      }
      clear(listBox);
      if (!list.length) {
        listBox.appendChild(emptyHint("还没有收藏", "在歌曲的「⋯」里点收藏\n或者点播放条进入正在播放页"));
        return;
      }
      list.forEach(function(track, i) {
        listBox.appendChild(songRow({
          track,
          coverUrl: ctx.coverOf(track),
          coverKey: trackKey(track),
          current: ctx.isCurrent(track),
          playing: ctx.state.player.status === "playing",
          onPlay: function() {
            if (ctx.isCurrent(track)) ctx.togglePlay();
            else ctx.playTracks(list, i);
          },
          onMore: function() {
            ctx.openSongSheet(track, { queueTracks: list, queueIndex: i });
          }
        }));
      });
    }
    var view = h("div", { class: "mp-view" }, [header, actions, listBox]);
    host.appendChild(view);
    render2();
    return { refresh: render2 };
  }

  // src/ui/views/settings.js
  function field(label, node, desc) {
    var left = h("div", { class: "mp-field__label" }, [
      h("div", { text: label }),
      desc ? h("div", { class: "mp-field__desc", text: desc }) : null
    ]);
    return h("div", { class: "mp-field" }, [left, node]);
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
  function mount5(host, ctx) {
    var state = ctx.state;
    var body = h("div", { class: "mp-body" });
    var header = h("div", { class: "mp-header" }, [
      h("div", { class: "mp-header__title", text: "设置" })
    ]);
    function setSource(key, value) {
      var sources = Object.assign({}, state.settings.sources);
      sources[key] = value;
      if (key !== "netease" && !sources.tencent && !sources.itunes) return;
      ctx.updateSettings({ sources });
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
          "网易云兜底",
          switchEl(s.sources.netease, function(v) {
            setSource("netease", v);
          }),
          "QQ 放不了时，自动找网易云同名歌曲再试"
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
      var repeatBtn = h("button", { class: "mp-btn mp-btn--ghost", type: "button", text: repeatLabel(s.repeat) });
      repeatBtn.addEventListener("click", function() {
        ctx.cycleRepeat();
      });
      var playGroup = h("div", { class: "mp-group" }, [
        h("div", { class: "mp-group__title", text: "播放" }),
        field("音量", volume),
        field("循环模式", repeatBtn, "顺序 / 列表循环 / 单曲循环"),
        field("随机播放", switchEl(s.shuffle, function() {
          ctx.toggleShuffle();
        }), "开启后队列按随机顺序播放")
      ]);
      var clearBtn = h("button", { class: "mp-btn mp-btn--ghost", type: "button", text: "清空数据" });
      clearBtn.addEventListener("click", function() {
        ctx.clearData();
      });
      var dataGroup = h("div", { class: "mp-group" }, [
        h("div", { class: "mp-group__title", text: "数据" }),
        field("收藏", h("div", { class: "mp-field__value", text: state.favorites.length + " 首" })),
        field("歌单", h("div", { class: "mp-field__value", text: state.playlists.length + " 个" })),
        field("卸载插件会一起清空", clearBtn, "插件数据存在宿主 storage 里，卸载即删除")
      ]);
      var about = h("div", { class: "mp-about" }, [
        h("div", { text: "音乐播放器 v" + state.version }),
        h("div", { text: "音源来自公开接口，仅供个人学习使用" }),
        h("div", { text: "歌曲版权归各平台与版权方所有" })
      ]);
      body.appendChild(sourceGroup);
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
        render2();
      }
    };
  }

  // src/ui/views/now.js
  function mount6(host, ctx) {
    var state = ctx.state;
    var coverCheck = "";
    var timer = null;
    var coverBox = h("div", { class: "mp-now__cover" });
    var nameEl = h("div", { class: "mp-now__name", text: "未在播放" });
    var artistEl = h("div", { class: "mp-now__artist", text: "" });
    var fromEl = h("div", { class: "mp-now__from", text: "" });
    var curEl = h("div", { text: "00:00" });
    var durEl = h("div", { text: "00:00" });
    var trackFill = h("i");
    var trackBar = h("div", { class: "mp-now__track" }, [trackFill]);
    var playIcon = h("span", { html: icon("play") });
    var playBtn = h("button", { class: "mp-now__play", type: "button", "aria-label": "播放/暂停" }, [playIcon]);
    var shuffleBtn = iconBtn("shuffle", {
      label: "随机",
      onClick: function() {
        ctx.toggleShuffle();
      }
    });
    var repeatBtn = iconBtn("repeat", {
      label: "循环",
      onClick: function() {
        ctx.cycleRepeat();
      }
    });
    var favBtn = iconBtn("heart", {
      label: "收藏",
      onClick: function() {
        var track = state.player.track;
        if (track) ctx.toggleFavorite(track);
      }
    });
    var addBtn = iconBtn("plus", {
      label: "加入歌单",
      onClick: function() {
        var track = state.player.track;
        if (track) ctx.openAddToPlaylist(track);
      }
    });
    var moreBtn = iconBtn("more", {
      label: "更多",
      onClick: function() {
        var track = state.player.track;
        if (track) ctx.openSongSheet(track, {});
      }
    });
    var head = h("div", { class: "mp-now__head" }, [
      iconBtn("back", { label: "返回", onClick: function() {
        ctx.closeNow();
      } }),
      fromEl,
      moreBtn
    ]);
    playBtn.addEventListener("click", function() {
      ctx.togglePlay();
    });
    var prevBtn = iconBtn("prev", { label: "上一首", onClick: function() {
      ctx.prev();
    } });
    var nextBtn = iconBtn("next", { label: "下一首", onClick: function() {
      ctx.next(false);
    } });
    trackBar.addEventListener("click", function(e) {
      var st = state.player;
      var dur = st.duration || st.track && st.track.duration || 0;
      if (!dur) return;
      var rect = trackBar.getBoundingClientRect();
      var ratio = rect.width ? (e.clientX - rect.left) / rect.width : 0;
      ctx.seek(Math.max(0, Math.min(1, ratio)) * dur);
      sync();
    });
    var view = h("div", { class: "mp-now" }, [
      head,
      coverBox,
      h("div", { class: "mp-now__meta" }, [nameEl, artistEl]),
      h("div", { class: "mp-now__progress" }, [
        trackBar,
        h("div", { class: "mp-now__times" }, [curEl, durEl])
      ]),
      h("div", { class: "mp-now__ctrl" }, [shuffleBtn, prevBtn, playBtn, nextBtn, repeatBtn]),
      h("div", { class: "mp-now__extras" }, [favBtn, addBtn])
    ]);
    host.appendChild(view);
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
      fromEl.textContent = track.source === "itunes" ? "iTunes 试听" : "GD · " + track.platform;
      var dur = st.duration || track.duration || 0;
      var cur = Math.min(st.time || 0, dur || st.time || 0);
      curEl.textContent = fmtTime(cur);
      durEl.textContent = dur ? fmtTime(dur) : "--:--";
      trackFill.style.width = (dur > 0 ? Math.min(100, cur / dur * 100) : 0).toFixed(2) + "%";
      playIcon.innerHTML = icon(st.status === "playing" ? "pause" : "play");
      shuffleBtn.classList.toggle("is-active", !!state.settings.shuffle);
      var mode = state.settings.repeat;
      repeatBtn.innerHTML = icon(mode === REPEAT.ONE ? "repeatOne" : "repeat");
      repeatBtn.classList.toggle("is-active", mode !== REPEAT.OFF);
      var fav = state.favorites.some(function(t) {
        return trackKey(t) === trackKey(track);
      });
      favBtn.innerHTML = icon(fav ? "heartFull" : "heart");
      favBtn.classList.toggle("is-active", fav);
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
  var TABS = [
    { id: "search", name: "搜索", icon: "search" },
    { id: "playlists", name: "歌单", icon: "folder" },
    { id: "favorites", name: "收藏", icon: "heart" },
    { id: "settings", name: "设置", icon: "gear" }
  ];
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
    var mainBtn = h("button", {
      class: "mp-player__main mp-player__hit",
      type: "button"
    }, [nameEl, subEl]);
    var playerEl = h("div", { class: "mp-player" }, [bar, coverBox, mainBtn, playBtn]);
    var dockEl = h("nav", { class: "mp-dock" });
    root.appendChild(viewHost);
    root.appendChild(playerEl);
    root.appendChild(dockEl);
    container.replaceChildren(root);
    var disposeTheme = watchTheme(root);
    var page = null;
    var playerCoverKey = "";
    function isNow() {
      return ctx.state.route === "now";
    }
    function activeTab() {
      if (ctx.state.route === "playlist") return "playlists";
      return ctx.state.route;
    }
    function renderDock() {
      clear(dockEl);
      dockEl.style.display = isNow() ? "none" : "flex";
      var active = activeTab();
      TABS.forEach(function(tab) {
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
    function renderPlayer() {
      var st = ctx.state.player;
      if (!st.track || isNow()) {
        playerEl.style.display = "none";
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
      if (route === "search") page = mount(viewHost, ctx);
      else if (route === "playlists") page = mount2(viewHost, ctx);
      else if (route === "playlist") page = mount3(viewHost, ctx);
      else if (route === "favorites") page = mount4(viewHost, ctx);
      else if (route === "settings") page = mount5(viewHost, ctx);
      else if (route === "now") page = mount6(viewHost, ctx);
    }
    function renderAll() {
      renderDock();
      renderView();
      renderPlayer();
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
    renderAll();
    if (ctx.state.route === "now") renderPlayer();
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
      applyCover,
      openSheet: function(options) {
        return openSheet(root, options);
      },
      openPrompt: function(options) {
        return openPrompt(root, options);
      },
      destroy: function() {
        if (page && page.destroy) {
          try {
            page.destroy();
          } catch (err) {
          }
        }
        page = null;
        disposeTheme();
        playerCoverKey = "";
      }
    };
  }

  // src/app/container.js
  var TABS2 = ["search", "playlists", "favorites", "settings"];
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
    var state = {
      version,
      route: "search",
      nowBack: "search",
      playlistId: "",
      settings: null,
      playlists: [],
      favorites: [],
      recent: [],
      search: { keyword: "", busy: false, tracks: [], errors: [], counts: {}, at: 0 },
      queue: null,
      player: { status: "idle", track: null, time: 0, duration: 0, error: "", volume: 0.8 },
      covers: {}
    };
    var shell = null;
    var player = null;
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
    function refresh() {
      if (shell) {
        shell.renderPlayer();
        shell.renderDock();
        shell.refreshPage();
      }
    }
    async function playTrack(track2) {
      if (!track2) return false;
      state.player = Object.assign({}, state.player, { status: "loading", track: track2, error: "" });
      if (shell) shell.renderPlayer();
      var ok = await player.load(track2, sources.createResolver(track2, state.settings));
      if (ok) {
        state.recent = pushRecent(state.recent, track2, MAX_RECENT);
        await store.saveRecent(state.recent);
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
        shuffle: state.settings.shuffle,
        repeat: state.settings.repeat
      });
      await playTrack(current(state.queue));
      refresh();
    }
    function next(auto) {
      var res = advance(state.queue, { auto: !!auto });
      if (res.ended || !res.track) {
        state.queue = res.queue;
        toast("已经是最后一首了");
        return;
      }
      state.queue = res.queue;
      playTrack(res.track);
      refresh();
    }
    function prev() {
      var res = back(state.queue);
      if (!res.track) return;
      state.queue = res.queue;
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
      if (st.status === "error") {
        await playTrack(st.track);
        return;
      }
      player.toggle();
    }
    function seek(ms) {
      player.seek(ms);
    }
    async function setVolume(v) {
      var vol = player.setVolume(v);
      state.settings = Object.assign({}, state.settings, { volume: vol });
      await store.saveSettings(state.settings);
      refresh();
    }
    async function cycleRepeat() {
      var mode = nextRepeat(state.settings.repeat);
      state.settings = Object.assign({}, state.settings, { repeat: mode });
      state.queue = setRepeat(state.queue, mode);
      await store.saveSettings(state.settings);
      refresh();
      return mode;
    }
    async function toggleShuffle() {
      var shuffle = !state.settings.shuffle;
      state.settings = Object.assign({}, state.settings, { shuffle });
      state.queue = setShuffle(state.queue, shuffle);
      await store.saveSettings(state.settings);
      refresh();
      return shuffle;
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
      }
      if (shell) shell.refreshPage();
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
      if (TABS2.indexOf(route) === -1 && route !== "playlist" && route !== "now") return;
      if (route === "playlist") {
        state.playlistId = o.playlistId || state.playlistId;
      }
      state.route = route;
      if (shell) shell.renderAll();
    }
    function openNow() {
      if (state.route === "now") return;
      state.nowBack = TABS2.indexOf(state.route) !== -1 ? state.route : "search";
      state.route = "now";
      if (shell) shell.renderAll();
    }
    function closeNow() {
      state.route = state.nowBack || "search";
      if (shell) shell.renderAll();
    }
    async function updateSettings(patch) {
      state.settings = Object.assign({}, state.settings, patch);
      state.settings = await store.saveSettings(state.settings);
      if (state.queue) {
        state.queue = setRepeat(state.queue, state.settings.repeat);
        state.queue = setShuffle(state.queue, state.settings.shuffle);
      }
      if (typeof state.settings.volume === "number" && player) player.setVolume(state.settings.volume);
      refresh();
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
      searchNow,
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
      updateSettings,
      clearData
    };
    var loaded = await Promise.all([
      store.loadSettings(),
      store.loadPlaylists(),
      store.loadFavorites(),
      store.loadRecent()
    ]);
    state.settings = loaded[0];
    state.playlists = loaded[1];
    state.favorites = loaded[2];
    state.recent = loaded[3];
    state.player.volume = state.settings.volume;
    state.queue = createQueue([], { repeat: state.settings.repeat, shuffle: state.settings.shuffle });
    player = createPlayer({
      volume: state.settings.volume,
      onChange: function(snapshot) {
        state.player = snapshot;
        if (shell) shell.renderPlayer();
      },
      onEnded: function() {
        next(true);
      }
    });
    shell = createShell(container, ctx);
    shell.mount();
    var pending = await host.storage.get("mp:pending", null);
    if (pending) {
      await host.storage.delete("mp:pending");
      var track = normalizeTrack(pending, "local");
      if (track) {
        state.queue = createQueue([track], { repeat: state.settings.repeat, shuffle: false });
        playTrack(track);
      }
    }
    return {
      ctx,
      destroy: function() {
        searchToken += 1;
        if (player) player.dispose();
        if (shell) shell.destroy();
        shell = null;
        player = null;
      }
    };
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
    var sub = h("div", {
      class: "mp-card__sub",
      text: [track.artist, statusText(data.status)].filter(Boolean).join(" · ")
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
  async function onCardAction(message, action, payload, roche) {
    if (action !== "open") return;
    var data = message.cardData || {};
    var track = normalizeTrack(data.track, "local");
    openAppWithTrack(roche, track);
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
    var settings = normalizeSettings(await roche.storage.get("mp:settings", null));
    var recent = await roche.storage.get("mp:recent", []) || [];
    var favorites = await roche.storage.get("mp:favorites", []) || [];
    var sources = createSources();
    var listBox = h("div", { class: "mp-modal__body" });
    var input = h("input", {
      class: "mp-modal__input",
      type: "search",
      placeholder: "搜歌名 / 歌手，或从下面直接选"
    });
    var modal = h("div", { class: "mp-modal" });
    function close() {
      closeModal(modal);
    }
    function rowFor(track) {
      var row = h("button", { class: "mp-modal__row", type: "button" }, [
        h("span", { text: track.name + " - " + track.artist })
      ]);
      row.addEventListener("click", async function() {
        row.disabled = true;
        var ok = await sendCard(roche, ctx, track, settings);
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
      tracks.slice(0, 30).forEach(function(t) {
        listBox.appendChild(rowFor(t));
      });
    }
    function renderDefault() {
      var seen = /* @__PURE__ */ Object.create(null);
      var merged = [];
      (recent || []).concat(favorites || []).forEach(function(raw) {
        var t = normalizeTrack(raw, "local");
        if (!t) return;
        var key = trackKey(t);
        if (seen[key]) return;
        seen[key] = true;
        merged.push(t);
      });
      renderList(merged, "这里还没有记录，直接搜一首试试");
    }
    async function doSearch() {
      var kw = String(input.value || "").trim();
      if (!kw) {
        renderDefault();
        return;
      }
      clear(listBox);
      listBox.appendChild(h("div", { class: "mp-modal__hint", text: "搜索中…" }));
      var result = await sources.search(kw, settings);
      renderList(result.tracks, "没搜到，换个关键词");
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
    var panel = h("div", { class: "mp-modal__panel" }, [
      h("div", { class: "mp-modal__head" }, [
        input,
        closeBtn
      ]),
      listBox
    ]);
    modal.appendChild(panel);
    modal.addEventListener("click", function(e) {
      if (e.target === modal) close();
    });
    document.body.appendChild(modal);
    renderDefault();
    setTimeout(function() {
      input.focus();
    }, 30);
  }

  // src/main.js
  var app = null;
  async function mount7(container, roche) {
    ensureStyle();
    container.classList.add("mp-host");
    app = await createApp({ container, roche, version: "0.2.0" });
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
    version: "0.2.0",
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
        mount: mount7,
        unmount
      }
    ],
    chat: {
      scope: { conversationTypes: ["direct", "group"] },
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
})();
