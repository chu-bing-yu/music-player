/** 歌单：只做数据变换，id 与时间戳由调用方传入 */

import { trackKey, dedupeTracks } from './track.js';

export var MAX_PLAYLISTS = 50;
export var MAX_TRACKS_PER_PLAYLIST = 500;

function cleanName(name, fallback) {
  var s = String(name == null ? '' : name).trim();
  if (!s) s = fallback;
  return s.slice(0, 40);
}

function stamp(playlist, now) {
  return Object.assign({}, playlist, { updatedAt: Number(now) || 0 });
}

export function findPlaylist(list, id) {
  var arr = list || [];
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && arr[i].id === id) return arr[i];
  }
  return null;
}

export function normalizePlaylists(raw) {
  if (!Array.isArray(raw)) return [];
  var out = [];
  raw.slice(0, MAX_PLAYLISTS).forEach(function (p) {
    if (!p || !p.id) return;
    var item = {
      id: String(p.id),
      name: cleanName(p.name, '未命名歌单'),
      tracks: dedupeTracks(Array.isArray(p.tracks) ? p.tracks : []).slice(0, MAX_TRACKS_PER_PLAYLIST),
      createdAt: Number(p.createdAt) || 0,
      updatedAt: Number(p.updatedAt) || Number(p.createdAt) || 0
    };
    // 角色歌单：owner=char + 具体角色 id（不保留的话存一轮就被裁掉）
    if (p.owner === 'char') {
      item.owner = 'char';
      item.ownerId = String(p.ownerId || '');
    }
    out.push(item);
  });
  return out;
}

/**
 * 新建歌单，返回新数组；同名允许，id 由调用方生成
 * options: { owner: 'char', ownerId: string } —— 角色歌单
 */
export function createPlaylist(list, name, id, now, options) {
  var o = options || {};
  var arr = (list || []).slice();
  if (arr.length >= MAX_PLAYLISTS) return { list: arr, playlist: null, reason: 'limit' };
  var playlist = {
    id: String(id),
    name: cleanName(name, o.owner === 'char' ? 'TA 的歌' : '未命名歌单'),
    tracks: [],
    createdAt: Number(now) || 0,
    updatedAt: Number(now) || 0
  };
  if (o.owner === 'char') {
    playlist.owner = 'char';
    playlist.ownerId = String(o.ownerId || '');
  }
  arr.unshift(playlist);
  return { list: arr, playlist: playlist };
}

export function renamePlaylist(list, id, name, now) {
  return (list || []).map(function (p) {
    if (p.id !== id) return p;
    return stamp(Object.assign({}, p, { name: cleanName(name, p.name) }), now);
  });
}

export function deletePlaylist(list, id) {
  return (list || []).filter(function (p) { return p.id !== id; });
}

/**
 * 加歌：自动去重、超出上限截断。
 * @returns {{list:Array, added:number, duplicate:number, full:boolean}}
 */
export function addTracksToPlaylist(list, id, tracks, now) {
  var added = 0;
  var duplicate = 0;
  var full = false;
  var incoming = (tracks || []).filter(Boolean);

  var next = (list || []).map(function (p) {
    if (p.id !== id) return p;
    var exist = Object.create(null);
    p.tracks.forEach(function (t) { exist[trackKey(t)] = true; });
    var merged = p.tracks.slice();

    incoming.forEach(function (t) {
      var key = trackKey(t);
      if (!key) return;
      if (exist[key]) { duplicate += 1; return; }
      if (merged.length >= MAX_TRACKS_PER_PLAYLIST) { full = true; return; }
      exist[key] = true;
      merged.push(t);
      added += 1;
    });

    return stamp(Object.assign({}, p, { tracks: merged }), now);
  });

  return { list: next, added: added, duplicate: duplicate, full: full };
}

export function removeTrackFromPlaylist(list, id, key, now) {
  return (list || []).map(function (p) {
    if (p.id !== id) return p;
    return stamp(Object.assign({}, p, {
      tracks: p.tracks.filter(function (t) { return trackKey(t) !== key; })
    }), now);
  });
}

export function moveTrackInPlaylist(list, id, from, to, now) {
  return (list || []).map(function (p) {
    if (p.id !== id) return p;
    var tracks = p.tracks.slice();
    if (from < 0 || from >= tracks.length) return p;
    var target = Math.min(Math.max(to, 0), tracks.length - 1);
    if (target === from) return p;
    var moved = tracks.splice(from, 1)[0];
    tracks.splice(target, 0, moved);
    return stamp(Object.assign({}, p, { tracks: tracks }), now);
  });
}

export function playlistDuration(playlist) {
  var tracks = (playlist && playlist.tracks) || [];
  return tracks.reduce(function (sum, t) { return sum + (Number(t.duration) || 0); }, 0);
}
