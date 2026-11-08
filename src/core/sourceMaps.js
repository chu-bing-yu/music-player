/**
 * 音源返回数据 → 统一 track 的纯函数。
 * 放在 core 里是为了能单测：接口字段一改，先在这里崩，不要等到界面。
 */

import { normalizeTrack } from './track.js';

/** "4分29秒" / "04:29" / 269 / "269000" → 毫秒 */
export function parseInterval(input) {
  if (input == null) return 0;
  if (typeof input === 'number') {
    return input > 10000 ? Math.round(input) : Math.round(input * 1000);
  }
  var text = String(input).trim();
  if (!text) return 0;

  var cn = /^(\d+)\s*分\s*(\d+)\s*秒?$/.exec(text);
  if (cn) return (Number(cn[1]) * 60 + Number(cn[2])) * 1000;

  var clock = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(text);
  if (clock) {
    var a = Number(clock[1]);
    var b = Number(clock[2]);
    var c = clock[3] ? Number(clock[3]) : 0;
    return clock[3] ? ((a * 60 + b) * 60 + c) * 1000 : (a * 60 + b) * 1000;
  }

  var num = Number(text.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num > 10000 ? Math.round(num) : Math.round(num * 1000);
}

/** 尽量走 https，避免宿主是 https 页面时被浏览器当成混合内容拦掉 */
export function preferHttps(url) {
  var s = String(url || '').trim();
  if (!s) return '';
  if (s.indexOf('//') === 0) return 'https:' + s;
  return s.replace(/^http:\/\//i, 'https://');
}

export function neteaseOuterUrl(id) {
  if (!id) return '';
  return 'https://music.163.com/song/media/outer/url?id=' + encodeURIComponent(String(id)) + '.mp3';
}

/** 名称相似：去掉空格与括号注释后互相包含即认为同名 */
export function isSimilarName(a, b) {
  function norm(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[（(【\[].*?[)）】\]]/g, '')
      .replace(/[\s\-_·.,，。!！?？'"“”‘’]/g, '');
  }
  var x = norm(a);
  var y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.indexOf(y) !== -1 || y.indexOf(x) !== -1;
}

/** vkeys QQ 音乐搜索结果 */
export function mapTencentTracks(list) {
  return (list || []).map(function (item) {
    return normalizeTrack({
      source: 'tencent',
      platform: 'qq',
      id: item.id != null ? item.id : item.mid,
      name: item.song || item.name || item.title,
      artist: item.singer || item.singerName,
      album: item.album,
      cover: item.cover,
      duration: parseInterval(item.interval),
      // payplay > 0 基本等于「要会员/付费」，用来挡无版权歌
      payplay: item.payplay != null ? Number(item.payplay) : (item.pay && item.pay.payplay != null ? Number(item.pay.payplay) : 0),
      paydownload: item.paydownload != null ? Number(item.paydownload) : (item.pay && item.pay.paydownload != null ? Number(item.pay.paydownload) : 0)
    }, 'tencent');
  }).filter(Boolean);
}

/** iTunes 搜索结果（只有 30 秒试听） */
export function mapItunesTracks(results) {
  return (results || []).map(function (item) {
    return normalizeTrack({
      source: 'itunes',
      platform: 'itunes',
      id: item.trackId,
      name: item.trackName,
      artist: item.artistName,
      album: item.collectionName,
      cover: String(item.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/300x300bb.'),
      duration: item.trackTimeMillis,
      url: item.previewUrl
    }, 'itunes');
  }).filter(Boolean);
}

/** 从网易云搜索结果里挑同名的几首，用于 QQ 放不了时兜底 */
export function pickNeteaseMatches(list, track, max) {
  var limit = Number(max) || 3;
  var ids = [];
  (list || []).forEach(function (item) {
    if (ids.length >= limit) return;
    var name = item.song || item.name || item.title || '';
    if (!item.id) return;
    if (track && track.name && !isSimilarName(name, track.name)) return;
    if (ids.indexOf(String(item.id)) !== -1) return;
    ids.push(String(item.id));
  });
  return ids;
}
