/** 收藏与最近播放 */

import { trackKey, dedupeTracks } from './track.js';

export var MAX_FAVORITES = 500;
export var MAX_RECENT = 60;

export function isFavorite(favorites, key) {
  var arr = favorites || [];
  for (var i = 0; i < arr.length; i++) {
    if (trackKey(arr[i]) === key) return true;
  }
  return false;
}

export function findFavorite(favorites, key) {
  var arr = favorites || [];
  for (var i = 0; i < arr.length; i++) {
    if (trackKey(arr[i]) === key) return arr[i];
  }
  return null;
}

/** 收藏/取消收藏，返回新数组与结果标记 */
export function toggleFavorite(favorites, track) {
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

export function normalizeFavorites(raw) {
  if (!Array.isArray(raw)) return [];
  return dedupeTracks(raw).slice(0, MAX_FAVORITES);
}

/** 最近播放：同一首提前，最多 cap 条 */
export function pushRecent(recent, track, cap) {
  var limit = Number(cap) || MAX_RECENT;
  var key = trackKey(track);
  if (!key) return (recent || []).slice();
  var arr = (recent || []).filter(function (t) { return trackKey(t) !== key; });
  arr.unshift(track);
  return arr.slice(0, limit);
}

export function normalizeRecent(raw) {
  if (!Array.isArray(raw)) return [];
  return dedupeTracks(raw).slice(0, MAX_RECENT);
}
