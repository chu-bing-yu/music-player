/** 歌词：QQ 音乐走 vkeys 的 lyric 接口，结果按歌曲缓存在内存里 */

import { fetchJson } from './http.js';
import { parseLrc, pickLrc } from '../core/lrc.js';
import { trackKey } from '../core/track.js';
import { lyric as neLyric, isReady as neReady } from './netease.js';

var VKEYS = 'https://api.vkeys.cn/v2/music';

export function createLyrics() {
  var cache = Object.create(null);

  async function load(track, settings) {
    if (!track) return [];

    // 网易云（自建 API）：直接拿 LRC
    if (track.source === 'netease' && track.id && neReady(settings)) {
      var lrc = await neLyric(settings, track.id);
      return lrc ? parseLrc(lrc) : [];
    }

    if (track.source !== 'tencent' || !track.id) return [];

    var url = VKEYS + '/tencent/lyric?id=' + encodeURIComponent(track.id);
    var data = await fetchJson(url, settings.prefix);
    var text = pickLrc(data);
    return text ? parseLrc(text) : [];
  }

  /** @returns {Promise<Array<{time:number,text:string}>>} */
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

  function clear() {
    cache = Object.create(null);
  }

  return { get: get, getCached: getCached, clear: clear };
}
