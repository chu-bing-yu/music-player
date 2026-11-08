/** 搜索结果合并与排序：多音源同时搜，按音源顺序合并、按键去重 */

import { trackKey } from './track.js';

/**
 * @param {Array<{source:string, tracks:Array, error?:string}>} groups
 * @param {{perSource?:number}} opts
 */
export function mergeResults(groups, opts) {
  var o = opts || {};
  var perSource = Number(o.perSource) || 0;
  var seen = Object.create(null);
  var merged = [];
  var errors = [];
  var counts = {};

  (groups || []).forEach(function (group) {
    if (!group) return;
    if (group.error) errors.push({ source: group.source, error: group.error });
    var list = Array.isArray(group.tracks) ? group.tracks : [];
    if (perSource) list = list.slice(0, perSource);
    counts[group.source] = list.length;
    list.forEach(function (track) {
      var key = trackKey(track);
      if (!key || seen[key]) return;
      seen[key] = true;
      merged.push(track);
    });
  });

  return { tracks: merged, errors: errors, counts: counts };
}

function norm(text) {
  return String(text == null ? '' : text).toLowerCase().replace(/\s+/g, '');
}

/** 本地过滤：歌名、歌手、专辑任一包含关键词 */
export function filterByKeyword(list, keyword) {
  var kw = norm(keyword);
  var arr = list || [];
  if (!kw) return arr.slice();
  return arr.filter(function (t) {
    return norm(t.name).indexOf(kw) !== -1
      || norm(t.artist).indexOf(kw) !== -1
      || norm(t.album).indexOf(kw) !== -1;
  });
}

/**
 * 轻量排序：命中歌名开头 > 歌名包含 > 歌手包含，其它保持原顺序。
 * 不给用户可见的「相关度」概念，只是让最像的结果靠前。
 */
export function rankTracks(list, keyword) {
  var kw = norm(keyword);
  if (!kw) return (list || []).slice();
  return (list || [])
    .map(function (t, i) {
      var name = norm(t.name);
      var artist = norm(t.artist);
      var score = 3;
      if (name === kw) score = 100;
      else if (name.indexOf(kw) === 0) score = 80;
      else if (name.indexOf(kw) !== -1) score = 60;
      else if (artist.indexOf(kw) === 0) score = 40;
      else if (artist.indexOf(kw) !== -1) score = 30;
      return { track: t, score: score, i: i };
    })
    .sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.i - b.i;
    })
    .map(function (x) { return x.track; });
}
