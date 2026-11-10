/**
 * 网易云：走用户自己部署的 NeteaseCloudMusicApi（或同协议的公共实例）。
 *
 * 关键点：该服务支持把 cookie 当成 query 参数传（?cookie=xxx），
 * 所以插件不需要依赖浏览器 Cookie，登录后把 cookie 存进 storage 就能用。
 */

import { fetchJson } from './http.js';
import { resolveNeteaseApi } from '../core/settings.js';

/** 网易云封面常给 http，WebView 里会被当混合内容拦掉，统一升 https */
function httpsCover(url) {
  var text = String(url || '');
  if (!text) return '';
  return text.replace(/^http:\/\//i, 'https://');
}

function base(settings) {
  // 留空 = 走公共实例，填了就用用户的地址
  return resolveNeteaseApi(settings);
}

export function isReady(settings) {
  return !!base(settings);
}

export function isLoggedIn(settings) {
  return !!base(settings) && !!(settings && settings.neteaseCookie);
}

async function call(settings, path, params) {
  var root = base(settings);
  if (!root) throw new Error('还没有配置网易云 API 地址');

  var query = [];
  var merged = Object.assign({}, params || {});
  if (settings && settings.neteaseCookie) merged.cookie = settings.neteaseCookie;
  merged.timestamp = Date.now();

  Object.keys(merged).forEach(function (key) {
    if (merged[key] === undefined || merged[key] === null || merged[key] === '') return;
    query.push(encodeURIComponent(key) + '=' + encodeURIComponent(merged[key]));
  });

  var url = root + path + (query.length ? '?' + query.join('&') : '');
  return fetchJson(url, settings.prefix);
}

/* ---------------- 扫码登录 ---------------- */

export async function qrKey(settings) {
  var data = await call(settings, '/login/qr/key');
  var unikey = data && data.data && data.data.unikey;
  if (!unikey) throw new Error('拿不到二维码 key（检查 API 地址是否可访问）');
  return unikey;
}

export async function qrCreate(settings, key) {
  var data = await call(settings, '/login/qr/create', { key: key, qrimg: 'true' });
  var item = (data && data.data) || {};
  return { qrimg: item.qrimg || '', qrurl: item.qrurl || '' };
}

/** code: 800 过期 / 801 等待扫码 / 802 待确认 / 803 成功 */
export async function qrCheck(settings, key) {
  var data = await call(settings, '/login/qr/check', { key: key, noCookie: 'true' });
  var code = Number(data && data.code);
  var cookie = (data && data.cookie) || '';
  return { code: code, message: (data && data.message) || '', cookie: cookie };
}

/* ---------------- 账号信息 ---------------- */

export async function account(settings) {
  var data = await call(settings, '/login/status');
  var profile = data && data.data && data.data.profile;
  if (profile && profile.nickname) return { nickname: profile.nickname, userId: profile.userId };
  var inner = data && data.data;
  if (inner && inner.account) return { nickname: String(inner.account.id || ''), userId: inner.account.id };
  return null;
}

export async function myPlaylists(settings) {
  var status = await call(settings, '/login/status');
  var uid = status && status.data && status.data.profile && status.data.profile.userId;
  if (!uid) throw new Error('还没登录');
  var data = await call(settings, '/user/playlist', { uid: uid, limit: 50 });
  return (data && data.playlist) || [];
}

/* ---------------- 搜索 / 播放 ---------------- */

export async function search(settings, keyword, limit) {
  var data = await call(settings, '/cloudsearch', {
    keywords: keyword,
    type: 1,
    limit: limit || 20
  });
  var songs = (data && data.result && data.result.songs) || [];
  return songs.map(function (song) {
    var artists = (song.ar || song.artists || []).map(function (a) { return a.name; }).join('/');
    return {
      source: 'netease',
      platform: 'netease',
      id: song.id,
      name: song.name,
      artist: artists,
      album: (song.al && song.al.name) || '',
      cover: httpsCover(song.al && song.al.picUrl),
      duration: song.dt || 0
    };
  });
}

export async function songUrl(settings, id, level) {
  var data = await call(settings, '/song/url/v1', { id: id, level: level || 'exhigh' });
  var first = (data && data.data && data.data[0]) || {};
  return first.url || '';
}

/** 排行榜列表（网易云官方榜单，取前 8 个） */
export async function toplists(settings) {
  var data = await call(settings, '/toplist');
  var list = (data && (data.list || data.data)) || [];
  return list.slice(0, 8).map(function (item) {
    return {
      id: item.id,
      name: item.name,
      cover: item.coverImgUrl || '',
      count: item.trackCount || (item.tracks && item.tracks.length) || 0
    };
  });
}

/** 每日推荐（需要登录） */
export async function dailySongs(settings, limit) {
  var data = await call(settings, '/recommend/songs');
  // 不同版本的 API 返回结构不一样，三种都兼容
  var songs = (data && data.data && data.data.dailySongs)
    || (data && data.recommend)
    || (data && data.songs)
    || [];
  var max = Math.max(1, Math.min(50, Number(limit) || 20));
  return songs.slice(0, max).map(function (song) {
    var artists = (song.ar || []).map(function (a) { return a.name; }).join('/');
    return {
      source: 'netease',
      platform: 'netease',
      id: song.id,
      name: song.name,
      artist: artists,
      album: (song.al && song.al.name) || '',
      cover: httpsCover(song.al && song.al.picUrl),
      duration: song.dt || 0
    };
  });
}

/** 某个榜单里的歌 */
export async function playlistTracks(settings, id, limit) {
  var data = await call(settings, '/playlist/track/all', { id: id, limit: limit || 30 });
  var songs = (data && data.songs) || [];
  return songs.map(function (song) {
    var artists = (song.ar || song.artists || []).map(function (a) { return a.name; }).join('/');
    return {
      source: 'netease',
      platform: 'netease',
      id: song.id,
      name: song.name,
      artist: artists,
      album: (song.al && song.al.name) || '',
      cover: httpsCover(song.al && song.al.picUrl),
      duration: song.dt || 0
    };
  });
}

export async function lyric(settings, id) {
  var data = await call(settings, '/lyric', { id: id });
  var lrc = (data && data.lrc && data.lrc.lyric) || '';
  return lrc;
}
