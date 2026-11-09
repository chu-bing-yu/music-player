/**
 * 音源适配（全部为公开接口，不需要 Key、不需要梯子、不需要自建后端）：
 *
 *  1. QQ 音乐 ── 搜索走 api.vkeys.cn，播放地址也由它解析，实测可放完整歌曲
 *  2. 网易云兜底 ── QQ 放不了时，搜同名歌曲，用 music.163.com 外链音频（<audio> 不需要 CORS）
 *  3. iTunes ── 官方接口，只有 30 秒试听，用来兜底冷门/外语歌
 *
 * 一个 track 可能要试多个地址，所以对外给的是「候选地址生成器」，由播放器逐个试。
 */

import { mapTencentTracks, mapItunesTracks, pickNeteaseMatches, preferHttps, neteaseOuterUrl } from '../core/sourceMaps.js';
import { mergeResults, rankTracks } from '../core/search.js';
import { normalizeTrack } from '../core/track.js';
import { fetchJson, applyProxy } from './http.js';
import { search as neSearch, songUrl as neUrl, isLoggedIn as neLoggedIn, isReady as neReady } from './netease.js';

var VKEYS = 'https://api.vkeys.cn/v2/music';
var ITUNES = 'https://itunes.apple.com/search';
var AUDIUS = 'https://api.audius.co';
var AUDIUS_APP = 'RocheMusic';

/* ---------------- QQ 音乐（vkeys） ---------------- */

async function tencentSearch(keyword, settings, limit) {
  var url = VKEYS + '/tencent?word=' + encodeURIComponent(keyword) + '&page=1&num=' + limit;
  var data = await fetchJson(url, settings.prefix);
  if (!data) return [];
  if (Number(data.code) !== 200 && !Array.isArray(data.data)) {
    throw new Error(data.message || '接口返回异常');
  }
  return mapTencentTracks(data.data);
}

async function tencentUrl(track, settings) {
  var url = VKEYS + '/tencent?id=' + encodeURIComponent(track.id) + '&quality=8';
  var data = await fetchJson(url, settings.prefix);
  var item = data && data.data;
  var url2 = item && (item.url || item.playUrl);
  return preferHttps(url2 || '');
}

/* ---------------- 网易云兜底 ---------------- */

async function neteaseIds(track, settings) {
  var keyword = [track.name, track.artist].filter(Boolean).join(' ');
  var url = VKEYS + '/netease?word=' + encodeURIComponent(keyword) + '&page=1&num=10';
  var data = await fetchJson(url, settings.prefix);
  if (!data || !Array.isArray(data.data)) return [];
  return pickNeteaseMatches(data.data, track, 3).map(neteaseOuterUrl);
}

/* ---------------- iTunes（30 秒试听） ---------------- */

async function itunesSearch(keyword, settings, limit) {
  var base = ITUNES
    + '?term=' + encodeURIComponent(keyword)
    + '&entity=song&limit=' + limit + '&country=cn&lang=zh_cn';
  var data = await fetchJson(base, settings.prefix);
  var list = (data && data.results) || [];
  if (!list.length) {
    var fallback = await fetchJson(base.replace('country=cn', 'country=us'), settings.prefix);
    list = (fallback && fallback.results) || [];
  }
  return mapItunesTracks(list);
}

async function itunesPreview(track, settings) {
  var keyword = [track.name, track.artist].filter(Boolean).join(' ');
  var list = await itunesSearch(keyword, settings, 5);
  if (!list.length) return '';
  // 优先同名同歌手，实在没有就取第一条
  var same = list.filter(function (t) {
    return t.name.toLowerCase().indexOf(String(track.name).toLowerCase()) !== -1;
  });
  var picked = same[0] || list[0];
  return preferHttps(picked.url);
}

/* ---------------- Audius（免费/无版权曲库，欧美为主） ---------------- */

async function audiusSearch(keyword, settings, limit) {
  var url = AUDIUS + '/v1/tracks/search?query=' + encodeURIComponent(keyword)
    + '&app_name=' + AUDIUS_APP + '&limit=' + limit;
  var data = await fetchJson(url, settings.prefix);
  var list = (data && data.data) || [];

  return list.filter(function (item) {
    if (item.is_streamable === false) return false;
    if (item.access && item.access.stream === false) return false;
    return true;
  }).map(function (item) {
    return normalizeTrack({
      source: 'audius',
      platform: 'audius',
      id: item.id,
      name: item.title,
      artist: (item.user && item.user.name) || 'Audius',
      album: '',
      cover: (item.artwork && (item.artwork['480x480'] || item.artwork['150x150'])) || '',
      duration: (Number(item.duration) || 0) * 1000,
      // 这个地址可以直接拼，不用二次解析，原生队列也能直接用
      url: AUDIUS + '/v1/tracks/' + item.id + '/stream?app_name=' + AUDIUS_APP
    }, 'audius');
  }).filter(Boolean);
}

/* ---------------- 对外接口 ---------------- */

export function createSources() {
  /** 多音源并发搜索；单个源失败不影响其它源 */
  /**
   * 音源计划：
   * - single：只搜设置里选定的那一个源（列表里只会出现这一种源）
   * - multi：全开；网易云会员时把网易云排到最前，否则 QQ 最前
   */
  function sourcePlan(settings) {
    var base = (settings && settings.sources) || {};

    // 之前按「单选」把其它源直接关死，结果某些环境下一个源拿不到数据就完全搜不到歌。
    // 现在只按用户勾选的源开关走，主源仅用于排序（主源命中排前面）。
    return {
      tencent: base.tencent !== false,
      itunes: base.itunes === true,
      audius: base.audius === true,
      netease: base.netease === true,
      primary: String((settings && settings.primarySource) || 'tencent')
    };
  }

  async function search(keyword, settings, opts) {
    var kw = String(keyword || '').trim();
    if (!kw) return { tracks: [], errors: [], counts: {} };
    var limit = (opts && opts.limit) || 25;
    var tasks = [];

    // 单选：只搜主源；多选：全开（网易云会员时网易云排最前）
    var plan = sourcePlan(settings);

    if (plan.tencent) {
      tasks.push(
        tencentSearch(kw, settings, limit).then(function (tracks) {
          return { source: 'tencent', tracks: tracks };
        }).catch(function (err) {
          return { source: 'tencent', tracks: [], error: String((err && err.message) || err) };
        })
      );
    }

    if (plan.itunes) {
      tasks.push(
        itunesSearch(kw, settings, Math.min(limit, 15)).then(function (tracks) {
          return { source: 'itunes', tracks: tracks };
        }).catch(function (err) {
          return { source: 'itunes', tracks: [], error: String((err && err.message) || err) };
        })
      );
    }

    if (plan.audius) {
      tasks.push(
        audiusSearch(kw, settings, Math.min(limit, 12)).then(function (tracks) {
          return { source: 'audius', tracks: tracks };
        }).catch(function (err) {
          return { source: 'audius', tracks: [], error: String((err && err.message) || err) };
        })
      );
    }

    // 自己部署的网易云 API（登录后当独立音源用）
    if (settings.sources.netease && neReady(settings)) {
      tasks.push(
        neSearch(settings, kw, Math.min(limit, 20)).then(function (list) {
          return {
            source: 'netease',
            tracks: list.map(function (item) {
              return normalizeTrack(Object.assign({}, item, { url: '' }), 'netease');
            }).filter(Boolean)
          };
        }).catch(function (err) {
          return { source: 'netease', tracks: [], error: String((err && err.message) || err) };
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

  /**
   * 候选地址生成器：调用一次返回一个地址，没有更多时返回空串。
   * 顺序：QQ 直链 → 网易云同名外链 ×3 → iTunes 试听
   */
  function createResolver(track, settings) {
    var queue = [];
    // 直链被截断/防盗链时的兜底：走用户配的代理再要一次同一个地址
    var proxied = [];
    var prefix = String(settings && settings.prefix || '').trim();
    var filled = { qq: false, netease: false, itunes: false };

    function pushUrl(url) {
      if (!url) return;
      queue.push(url);
      if (prefix) proxied.push(applyProxy(url, prefix));
    }

    var steps = [];
    if (track.source === 'tencent') steps = ['qq', 'netease', 'itunes'];
    else if (track.source === 'itunes') steps = ['itunes'];
    else if (track.source === 'netease') steps = neReady(settings) ? ['neapi', 'netease', 'itunes'] : ['netease', 'itunes'];
    else steps = ['netease', 'itunes'];

    if (track.url) pushUrl(preferHttps(track.url));

    async function fill(kind) {
      if (kind === 'neapi') {
        var apiUrl = '';
        try {
          apiUrl = await neUrl(settings, track.id);
        } catch (err) {
          apiUrl = '';
        }
        if (apiUrl) pushUrl(preferHttps(apiUrl));
        return;
      }
      if (kind === 'qq') {
        if (filled.qq) return;
        filled.qq = true;
        var direct = await tencentUrl(track, settings);
        if (direct) pushUrl(direct);
        return;
      }
      if (kind === 'netease') {
        if (filled.netease || !settings.sources.netease) return;
        filled.netease = true;
        var list = await neteaseIds(track, settings);
        list.forEach(function (u) { pushUrl(u); });
        return;
      }
      if (kind === 'itunes') {
        if (filled.itunes || !settings.sources.itunes) return;
        filled.itunes = true;
        var preview = await itunesPreview(track, settings);
        if (preview) pushUrl(preview);
      }
    }

    var stepIndex = 0;
    return async function nextUrl() {
      for (;;) {
        if (queue.length) return queue.shift();
        if (stepIndex >= steps.length) {
          // 直链都试完了：把走代理的同一批地址作为最后兜底
          if (proxied.length) return proxied.shift();
          return '';
        }
        var kind = steps[stepIndex++];
        try {
          await fill(kind);
        } catch (err) {
          /* 这一步失败就继续下一步 */
        }
      }
    };
  }

  /** 设置页的「音源自检」：把每个源真实请求一遍，返回可展示的结果 */
  async function selfTest(settings) {
    var results = [];
    var keyword = '晴天';

    async function run(name, fn) {
      var started = Date.now();
      try {
        var detail = await fn();
        results.push({ name: name, ok: true, ms: Date.now() - started, detail: detail || '正常' });
      } catch (err) {
        results.push({ name: name, ok: false, ms: Date.now() - started, detail: String((err && err.message) || err) });
      }
    }

    if (settings.sources.tencent) {
      await run('QQ 音乐 · 搜索', async function () {
        var list = await tencentSearch(keyword, settings, 3);
        if (!list.length) throw new Error('能连上但没返回歌曲');
        return list.length + ' 首，第一首《' + list[0].name + '》';
      });
      await run('QQ 音乐 · 播放地址', async function () {
        var list = await tencentSearch(keyword, settings, 1);
        if (!list.length) throw new Error('搜索不到歌曲，无法解析');
        var url = await tencentUrl(list[0], settings);
        if (!url) throw new Error('没有返回播放地址（可能被限流）');
        return '已拿到 ' + url.slice(0, 46) + '…';
      });
    }

    if (settings.sources.netease) {
      await run('网易云 · 兜底接口', async function () {
        var probe = normalizeTrack({ source: 'tencent', platform: 'qq', id: '0', name: keyword, artist: '周杰伦' }, 'tencent');
        var list = await neteaseIds(probe, settings);
        if (!list.length) throw new Error('没找到同名歌曲');
        return '可兜底 ' + list.length + ' 个地址';
      });
    }

    if (settings.sources.itunes) {
      await run('iTunes · 试听', async function () {
        var list = await itunesSearch(keyword, settings, 3);
        if (!list.length) throw new Error('没返回结果');
        return list.length + ' 首（30 秒试听）';
      });
    }

    if (settings.sources.audius) {
      await run('Audius · 免费曲库', async function () {
        var list = await audiusSearch('lofi', settings, 3);
        if (!list.length) throw new Error('没返回结果');
        return list.length + ' 首，第一首《' + list[0].name + '》';
      });
    }

    return results;
  }

  return { search: search, createResolver: createResolver, selfTest: selfTest };
}
