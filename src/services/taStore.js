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

/**
 * 角色 id 归一：空 / 'ta' 都当成同一个兜底角色。
 * 以前一会儿存成 ''、一会儿存成 'ta'、一会儿存真实 id，
 * 结果同一条评价会变成两份，TA 页还会分成两个块，删也删不干净。
 */
export function normalizeCharId(id) {
  var s = String(id == null ? '' : id).trim();
  return s || 'ta';
}

/** 取一条评论 entry 里任意一个角色条目（用来判断「这是哪首歌」） */
function firstEntryOf(entry) {
  if (!entry || typeof entry !== 'object') return null;
  var keys = Object.keys(entry);
  for (var i = 0; i < keys.length; i++) {
    var one = entry[keys[i]];
    if (one && typeof one === 'object') return one;
  }
  return null;
}

function sameSong(a, b) {
  if (!a || !b) return false;
  return String(a.name || '') === String(b.name || '')
    && String(a.artist || '') === String(b.artist || '');
}

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

/**
 * 深度合并：两边都是对象时递归，带 at 的取较新的一条。
 *
 * 注意数组（歌单列表）：**只有一边有数据时就用那一边**。
 * 以前不管三七二十一返回 b，镜像为空时会把宿主那份歌单整个丢掉
 * （`loadPlaylists` 只拿到 `{}`，界面上一首歌单都没有）。
 */
function mergeDeep(a, b) {
  var ha = hasData(a);
  var hb = hasData(b);
  if (!ha && !hb) return a == null ? b : a;
  if (!ha) return b;
  if (!hb) return a;

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
  var id = normalizeCharId(characterId);
  return (list || [])
    .filter(function (p) {
      return p && p.owner === 'char' && normalizeCharId(p.ownerId) === id;
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
    var made = createPlaylist(list, CHAR_PLAYLIST_NAME, 'char-' + normalizeCharId(characterId), Date.now(), {
      owner: 'char',
      ownerId: normalizeCharId(characterId)
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

/**
 * 角色歌单（推荐用）。
 * **同名 + 同角色已经存在就复用**（把歌去重追加进去），否则才新建。
 * 以前每次都 `'char-'+Date.now()` 新建，同一条指令执行两次就多一个同名歌单。
 */
export async function createCharPlaylist(roche, characterId, name, tracks) {
  var list = await loadPlaylists(roche);
  var owner = normalizeCharId(characterId);
  var wantName = String(name == null ? '' : name).trim() || CHAR_PLAYLIST_NAME;

  var existing = (list || []).filter(function (p) {
    return p && p.owner === 'char'
      && normalizeCharId(p.ownerId) === owner
      && String(p.name || '').trim() === wantName;
  })[0] || null;

  if (existing) {
    var reuse = addTracksToPlaylist(list, existing.id, tracks || [], Date.now());
    await writeJson(roche, 'mp:playlists', reuse.list);
    var updated = null;
    reuse.list.forEach(function (p) { if (p.id === existing.id) updated = p; });
    return {
      ok: true,
      reused: true,
      created: false,
      playlist: updated || existing,
      added: reuse.added,
      playlistId: existing.id
    };
  }

  var made = createPlaylist(list, wantName, 'char-' + Date.now().toString(36), Date.now(), {
    owner: 'char',
    ownerId: owner
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
  return { ok: true, reused: false, playlist: made.playlist, added: added, created: true, playlistId: made.playlist.id };
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
  // 有的来源（原生播放器状态）只有歌名没有 id，退化成 name|artist 当 key，
  // 否则 trackKey 为空 → 直接判「没有正在播放的歌」，乐评就丢了。
  var key = trackKey(track) || (track && track.name
    ? 'name|' + track.name + '|' + (track.artist || '')
    : '');
  if (!key) return { ok: false, reason: '没有正在播放的歌' };

  var map = await loadComments(roche);
  var cid = normalizeCharId(characterId);
  var me = { text: clean, at: Date.now(), name: String(track.name || ''), artist: String(track.artist || '') };

  // 同曲归并：同一个 track 从不同来源拿到的 key 不一样（tencent:qq:xxx / name|歌名|歌手），
  // 只要「歌名 + 歌手」相同就写到已有的那个 key 上，别再多存一条。
  var sameSongKeys = Object.keys(map).filter(function (k) {
    return sameSong(firstEntryOf(map[k]), me);
  });
  var targetKey = sameSongKeys.indexOf(key) !== -1 ? key : (sameSongKeys[0] || key);

  var entry = map[targetKey] && typeof map[targetKey] === 'object' ? map[targetKey] : {};
  // 把其它同曲 key 下的角色条目并过来，清掉重复 key
  sameSongKeys.forEach(function (k) {
    if (k === targetKey) return;
    var other = map[k];
    Object.keys(other || {}).forEach(function (c) {
      if (!entry[c]) entry[c] = other[c];
    });
    delete map[k];
  });

  entry[cid] = me;
  map[targetKey] = entry;

  // 只保留最近 300 首，避免 storage 越滚越大
  var keys = Object.keys(map);
  if (keys.length > MAX_COMMENT_TRACKS) {
    keys.sort(function (a, b) {
      return (map[a] && map[a][cid] && map[a][cid].at) || 0;
    }).slice(0, keys.length - MAX_COMMENT_TRACKS).forEach(function (k) { delete map[k]; });
  }

  await writeJson(roche, 'mp:comments', map);
  return { ok: true, text: clean, key: targetKey };
}

/**
 * 删除某个角色在某首歌下的短评（TA 页左滑删除用）。
 *
 * 一条评价可能因为历史原因存了好几份：不同 track key（`tencent:...` / `name|歌名|歌手`）、
 * 不同角色 key（'' / 'ta' / 真实 id）。这里一次清干净，否则删掉一份另一份还在，
 * 看着就是「删不掉」。
 *
 * @param {string} [text] 要删的那条正文；给了就顺带清掉同曲同文的重复副本
 * @returns {{ok:boolean, removed:number, reason?:string}}
 */
export async function deleteComment(roche, characterId, key, text) {
  var cid = normalizeCharId(characterId);
  var want = String(text == null ? '' : text).trim();
  var map = await loadComments(roche);

  var target = key && map[key] && typeof map[key] === 'object' ? map[key] : null;
  var anchor = firstEntryOf(target);

  // 同曲的其它 key（歌名 + 歌手相同）
  var keys = key ? [key] : [];
  if (anchor) {
    Object.keys(map).forEach(function (k) {
      if (k === key) return;
      if (sameSong(firstEntryOf(map[k]), anchor)) keys.push(k);
    });
  }

  var aliases = [cid];
  if (cid === 'ta') aliases.push('');
  else aliases.push('ta', '');

  var removed = 0;
  keys.forEach(function (k) {
    var entry = map[k];
    if (!entry || typeof entry !== 'object') return;
    Object.keys(entry).forEach(function (c) {
      var one = entry[c];
      var hitCid = aliases.indexOf(c) !== -1;
      var hitText = want && one && String(one.text || '').trim() === want;
      if (hitCid || hitText) {
        delete entry[c];
        removed += 1;
      }
    });
    if (!Object.keys(entry).length) delete map[k];
  });

  if (!removed) return { ok: false, reason: '没有这条短评', removed: 0 };
  await writeJson(roche, 'mp:comments', map);
  return { ok: true, removed: removed };
}

export function commentsOf(map, track, characterId) {
  var key = trackKey(track);
  var entry = key && map ? map[key] : null;
  if (!entry) return null;
  return entry[String(characterId || 'ta')] || null;
}
