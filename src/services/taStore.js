/**
 * 角色（TA）的音乐数据：歌单与歌曲短评。
 *
 * 这一层同时被「聊天侧」和「App 侧」调用，所以不能依赖 host.js（那是 App 专用）。
 * 统一策略：先写宿主 storage，再写一份 localStorage 镜像；
 * 读取时宿主拿不到就回落镜像（宿主 storage 在 App / 聊天回调里可能是两份）。
 */

import { normalizePlaylists, createPlaylist, addTracksToPlaylist } from '../core/playlist.js';
import { trackKey } from '../core/track.js';

export var CHAR_PLAYLIST_NAME = 'TA 的歌';
export var RECOMMEND_PLAYLIST_NAME = '为你挑的';
export var MAX_COMMENT_LEN = 80;
export var MAX_COMMENT_TRACKS = 300;

function mirrorRead(key) {
  try {
    if (typeof localStorage === 'undefined') return null;
    var text = localStorage.getItem('mp:mirror:' + key);
    if (!text) return null;
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function mirrorWrite(key, value) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('mp:mirror:' + key, JSON.stringify(value));
  } catch (err) { /* 配额满就算了 */ }
}

function hasData(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.keys(value).length > 0;
}

/** 深度合并：两边都是对象时递归，带 at 的取较新的一条 */
function mergeDeep(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  if (typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return b;

  var out = {};
  Object.keys(a).forEach(function (k) { out[k] = a[k]; });
  Object.keys(b).forEach(function (k) {
    var av = out[k];
    var bv = b[k];
    if (av && bv && typeof av === 'object' && typeof bv === 'object' && !Array.isArray(av) && !Array.isArray(bv)) {
      if (av.at && bv.at) out[k] = Number(av.at) >= Number(bv.at) ? av : bv;
      else out[k] = mergeDeep(av, bv);
    } else {
      out[k] = bv;
    }
  });
  return out;
}

/**
 * 重要：以前这里「宿主有值就覆盖镜像」，宿主返回空对象时会把镜像里
 * 角色刚写的评论整个清掉，表现就是「评论一会儿有一会儿没有」。
 * 现在两边取并集，任何一边为空都不允许覆盖另一边。
 */
async function readJson(roche, key, fallback) {
  var fromHost = null;
  try {
    if (roche && roche.storage && typeof roche.storage.get === 'function') {
      fromHost = await roche.storage.get(key);
    }
  } catch (err) {
    fromHost = null;
  }

  var fromMirror = mirrorRead(key);

  if (!hasData(fromHost) && !hasData(fromMirror)) return fallback;

  var merged = mergeDeep(hasData(fromHost) ? fromHost : {}, hasData(fromMirror) ? fromMirror : {});
  mirrorWrite(key, merged);
  return merged;
}

async function writeJson(roche, key, value) {
  mirrorWrite(key, value);
  try {
    if (roche && roche.storage && typeof roche.storage.set === 'function') {
      await roche.storage.set(key, value);
    }
    return true;
  } catch (err) {
    return false;
  }
}

/* ---------------- 歌单 ---------------- */

export async function loadPlaylists(roche) {
  var raw = await readJson(roche, 'mp:playlists', []);
  return normalizePlaylists(raw);
}

/** 这个角色的歌单（可能多个，按更新时间倒序） */
export function charPlaylists(list, characterId) {
  var id = String(characterId || '');
  return (list || [])
    .filter(function (p) {
      return p && p.owner === 'char' && String(p.ownerId || '') === id;
    })
    .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
}

/**
 * 把一首歌放进角色的歌单；没有就新建「TA 的歌」。
 * @returns {{ok:boolean, playlist?:object, created?:boolean, duplicate?:boolean, reason?:string}}
 */
export async function addTrackForChar(roche, characterId, track) {
  if (!track || !trackKey(track)) return { ok: false, reason: '没有正在播放的歌' };

  var list = await loadPlaylists(roche);
  var mine = charPlaylists(list, characterId);
  var target = mine[0] || null;
  var created = false;

  if (!target) {
    var made = createPlaylist(list, CHAR_PLAYLIST_NAME, 'char-' + String(characterId || 'ta'), Date.now(), {
      owner: 'char',
      ownerId: characterId
    });
    if (!made.playlist) return { ok: false, reason: '歌单数量已达上限' };
    list = made.list;
    target = made.playlist;
    created = true;
  }

  var res = addTracksToPlaylist(list, target.id, [track], Date.now());
  await writeJson(roche, 'mp:playlists', res.list);

  var updated = null;
  res.list.forEach(function (p) { if (p.id === target.id) updated = p; });

  return {
    ok: res.added > 0 || res.duplicate > 0,
    playlist: updated || target,
    created: created,
    duplicate: res.duplicate > 0 && res.added === 0,
    reason: res.added > 0 ? '' : (res.duplicate > 0 ? '这首已经在歌单里了' : '歌单已满')
  };
}

/** 新建一个角色歌单（推荐用） */
export async function createCharPlaylist(roche, characterId, name, tracks) {
  var list = await loadPlaylists(roche);
  var made = createPlaylist(list, name || CHAR_PLAYLIST_NAME, 'char-' + Date.now().toString(36), Date.now(), {
    owner: 'char',
    ownerId: characterId
  });
  if (!made.playlist) return { ok: false, reason: '歌单数量已达上限' };

  list = made.list;
  var added = 0;
  if (tracks && tracks.length) {
    var res = addTracksToPlaylist(list, made.playlist.id, tracks, Date.now());
    list = res.list;
    added = res.added;
  }
  await writeJson(roche, 'mp:playlists', list);
  return { ok: true, playlist: made.playlist, added: added, created: true, playlistId: made.playlist.id };
}

/* ---------------- 短评 ---------------- */

export function cleanComment(text) {
  var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return s.slice(0, MAX_COMMENT_LEN);
}

export async function loadComments(roche) {
  var raw = await readJson(roche, 'mp:comments', {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

/** 写一条角色短评：每首歌每个角色保留最新一条 */
export async function saveComment(roche, characterId, track, text) {
  var clean = cleanComment(text);
  if (!clean) return { ok: false, reason: '短评为空' };
  var key = trackKey(track);
  if (!key) return { ok: false, reason: '没有正在播放的歌' };

  var map = await loadComments(roche);
  var entry = map[key] && typeof map[key] === 'object' ? map[key] : {};
  entry[String(characterId || 'ta')] = {
    text: clean,
    at: Date.now(),
    name: track.name || '',
    artist: track.artist || ''
  };

  // 只保留最近 300 首，避免 storage 越滚越大
  var keys = Object.keys(map);
  if (keys.length > MAX_COMMENT_TRACKS) {
    keys.sort(function (a, b) {
      return (map[a] && map[a][String(characterId)] && map[a][String(characterId)].at) || 0;
    }).slice(0, keys.length - MAX_COMMENT_TRACKS).forEach(function (k) { delete map[k]; });
  }
  map[key] = entry;

  await writeJson(roche, 'mp:comments', map);
  return { ok: true, text: clean, key: key };
}

/** 删除某个角色在某首歌下的短评（TA 页左滑删除用） */
export async function deleteComment(roche, characterId, key) {
  var id = String(characterId || '');
  var map = await loadComments(roche);
  var entry = key && map[key] && typeof map[key] === 'object' ? map[key] : null;
  if (!entry || !entry[id]) return { ok: false, reason: '没有这条短评' };

  delete entry[id];
  if (!Object.keys(entry).length) delete map[key];

  await writeJson(roche, 'mp:comments', map);
  return { ok: true };
}

export function commentsOf(map, track, characterId) {
  var key = trackKey(track);
  var entry = key && map ? map[key] : null;
  if (!entry) return null;
  return entry[String(characterId || 'ta')] || null;
}
