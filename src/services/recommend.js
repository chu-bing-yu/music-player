/**
 * 猜你喜欢：三条数据源，统一出口。
 *
 * 1. 登录网易云 → 用它自己的 /recommend/songs（真·个性化推荐）；
 * 2. 不登录 / 不调模型 → 本地随机：最近播放 + 收藏 + 偏好 + 场景词里随机抽种子；
 * 3. AI 可用 → 让模型挑，但数量与关键词都由设置决定。
 *
 * 每条路径最后都会经过 ground()：落地成真实可播的 track，可选地试解析地址剔除死链。
 */

import { prefsToPrompt, avoidTexts } from '../core/prefs.js';
import { trackKey } from '../core/track.js';
import { dailySongs, isLoggedIn } from './netease.js';

var AI_TIMEOUT = 20000;
var RESOLVE_TIMEOUT = 8000;
var RESOLVE_CONCURRENCY = 4;
/** 同一个歌手最多推几首 */
var MAX_PER_ARTIST = 2;
var SCENES = ['夜晚', '通勤', '雨天', '健身', '独处', '周末', '开车', '睡前'];

export var DEFAULT_COUNT = 20;
export var MIN_COUNT = 5;
export var MAX_COUNT = 50;

export function clampCount(value) {
  var n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_COUNT;
  return Math.max(MIN_COUNT, Math.min(MAX_COUNT, n));
}

/** 可注入的时间/随机源，单测里能稳定复现 */
function makeRandom(seed) {
  var s = Math.abs(Number(seed) || Date.now()) % 233280 || 1;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function shuffle(list, rnd) {
  var arr = list.slice();
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rnd() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * 从「最近播放歌手 + 收藏歌手 + 偏好关键词 + 场景词」里随机抽 2~3 个种子。
 * 这是「换一批没变化」的核心修复：每次抽样都不同。
 */
export function pickSeeds(prefs, recent, favorites, now) {
  var artistPool = [];
  var wordPool = [];

  (recent || []).forEach(function (t) {
    if (t && t.artist) artistPool.push(String(t.artist));
  });
  (favorites || []).forEach(function (t) {
    if (t && t.artist) artistPool.push(String(t.artist));
  });
  (prefs || []).forEach(function (p) {
    if (p && p.label !== '避雷' && p.prompt) wordPool.push(String(p.prompt));
  });
  SCENES.forEach(function (s) { wordPool.push(s); });

  function uniqWords(list) {
    var seen = Object.create(null);
    var out = [];
    list.forEach(function (word) {
      var text = String(word || '').replace(/\s+/g, ' ').trim();
      if (!text || seen[text]) return;
      seen[text] = true;
      out.push(text);
    });
    return out;
  }

  var words = uniqWords(wordPool);
  var artists = uniqWords(artistPool);
  if (!words.length && !artists.length) return ['华语流行'];

  var rnd = makeRandom(now);
  var take = 2 + Math.floor(rnd() * 2); // 2~3 个
  var seeds = shuffle(words, rnd).slice(0, take);

  // 歌手名最多掺 1 个，避免整批结果全是同一个歌手
  if (artists.length && rnd() < 0.75) {
    seeds.push(shuffle(artists, rnd)[0]);
  }

  return seeds.slice(0, 3);
}

/** 画像提示词：数量与「关键词要互不相同」都按设置来 */
export function buildProfilePrompt(prefs, recent, favorites, count) {
  var want = clampCount(count);
  var recentNames = (recent || []).slice(0, 12).map(function (t) {
    return '《' + (t.name || '') + '》' + (t.artist ? ' - ' + t.artist : '');
  }).filter(Boolean);

  var favNames = (favorites || []).slice(0, 12).map(function (t) {
    return '《' + (t.name || '') + '》' + (t.artist ? ' - ' + t.artist : '');
  }).filter(Boolean);

  return [
    '你是一个懂音乐的推荐助手。请根据下面的用户画像，挑一批适合现在听的歌。',
    '',
    '【偏好】',
    prefsToPrompt(prefs),
    '',
    recentNames.length ? '【最近在听】\n' + recentNames.join('、') : '【最近在听】暂无记录',
    favNames.length ? '【收藏】\n' + favNames.join('、') : '【收藏】暂无',
    '',
    '要求：',
    '1. 挑 ' + want + ' 首，风格要贴合画像，不要重复最近在听的歌；',
    '2. 只输出 JSON，不要解释、不要代码块，格式：',
    '{"playlistName":"四个字以内的小标题","keywords":["3 到 5 个互不相同的中文搜索关键词"],"tracks":[{"name":"歌名","artist":"歌手"}]}',
    '3. 歌名和歌手必须是真实存在的作品，不要编造。'
  ].join('\n');
}

/** 容错解析：去掉代码块、截取第一个完整 JSON 对象 */
export function parseRecommendJson(text) {
  var raw = String(text || '').trim();
  if (!raw) return null;

  raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  var start = raw.indexOf('{');
  var end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  var data = null;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch (err) {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  var tracks = Array.isArray(data.tracks) ? data.tracks : [];
  var clean = tracks.map(function (t) {
    if (!t) return null;
    if (typeof t === 'string') return { name: t.trim(), artist: '' };
    var name = String(t.name || t.title || '').trim();
    if (!name) return null;
    return { name: name, artist: String(t.artist || '').trim() };
  }).filter(Boolean);

  var keywords = Array.isArray(data.keywords)
    ? data.keywords.map(function (k) { return String(k || '').trim(); }).filter(Boolean).slice(0, 5)
    : [];

  return {
    playlistName: String(data.playlistName || data.name || 'AI 推荐').trim().slice(0, 12),
    keywords: keywords,
    tracks: clean
  };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('timeout')); }, ms);
    })
  ]);
}

/** 能不能真的播：解析一次地址，拿不到就当不能播 */
async function playable(track, sources, settings) {
  try {
    var url = await withTimeout(Promise.resolve(sources.createResolver(track, settings)()), RESOLVE_TIMEOUT);
    return !!url;
  } catch (err) {
    return false;
  }
}

/**
 * 把候选落地成可播 track。
 * @param {{want:number, filterPlayable:boolean, avoid:string[], exclude:Object}} opts
 */
async function ground(opts) {
  var sources = opts.sources;
  var settings = opts.settings;
  var want = clampCount(opts.want);
  var avoid = opts.avoid || [];
  var exclude = opts.exclude || Object.create(null);

  var out = [];
  var seen = Object.create(null);
  var checked = Object.create(null);

  function blocked(track) {
    // 开了「只推荐能播放的」时，QQ 标记为要付费/要会员的直接不进推荐
    if (opts.filterPlayable && Number(track.payplay) > 0) return true;

    if (!avoid.length) return false;
    var text = (track.name || '') + ' ' + (track.artist || '');
    return avoid.some(function (word) { return word && text.indexOf(word) !== -1; });
  }

  // 候选池：先按模型/种子给的歌名搜，再用关键词铺量
  var picks = [];

  for (var i = 0; i < (opts.picks || []).length && picks.length < want * 2; i++) {
    var pick = opts.picks[i];
    if (!pick || !pick.name) continue;
    try {
      var found = await sources.search((pick.name + ' ' + pick.artist).trim(), settings, { limit: 3 });
      (found && found.tracks ? found.tracks : []).forEach(function (t) { picks.push(t); });
    } catch (err) { /* 单首失败继续 */ }
  }

  // 每个种子只取一小批，多轮交错，避免「一个歌手刷屏」
  var keywords = opts.keywords || [];
  var perKeyword = Math.max(3, Math.ceil(want / Math.max(1, keywords.length)) + 2);

  for (var round = 0; round < 3 && picks.length < want * 2; round++) {
    for (var j = 0; j < keywords.length && picks.length < want * 2; j++) {
      try {
        var res = await sources.search(keywords[j], settings, { limit: perKeyword + round * 2 });
        (res && res.tracks ? res.tracks : []).forEach(function (t) { picks.push(t); });
      } catch (err) { /* 忽略 */ }
    }
  }

  // 去重 + 避雷 + 排除最近听过的
  var candidates = [];
  picks.forEach(function (track) {
    if (!track) return;
    var key = trackKey(track);
    if (!key || seen[key] || exclude[key]) return;
    if (blocked(track)) return;
    seen[key] = true;
    candidates.push(track);
  });

  if (!opts.filterPlayable) {
    var limited = [];
    candidates.forEach(function (t) {
      if (limited.length < want && takeSlot(t)) limited.push(t);
    });
    return limited;
  }

  // 同一个歌手最多 X 首，避免整页都是一个人
  var artistCount = Object.create(null);

  function artistOf(track) {
    return String(track.artist || '').split('/')[0].split('&')[0].trim() || '未知';
  }

  function takeSlot(track) {
    var artist = artistOf(track);
    if ((artistCount[artist] || 0) >= MAX_PER_ARTIST) return false;
    artistCount[artist] = (artistCount[artist] || 0) + 1;
    return true;
  }

  // 逐首试解析（并发 4），拿不到地址的剔除
  var cursor = 0;
  async function worker() {
    while (cursor < candidates.length && out.length < want) {
      var track = candidates[cursor++];
      var key = trackKey(track);
      if (checked[key]) continue;
      checked[key] = true;
      var ok = await playable(track, sources, settings);
      if (ok && out.length < want && takeSlot(track)) out.push(track);
    }
  }

  var workers = [];
  for (var w = 0; w < RESOLVE_CONCURRENCY; w++) workers.push(worker());
  await Promise.all(workers);

  return out;
}

function excludeMap(tracks) {
  var map = Object.create(null);
  (tracks || []).forEach(function (t) {
    var key = trackKey(t);
    if (key) map[key] = true;
  });
  return map;
}

/** 统一出口结构 */
function result(source, playlistName, tracks, reason) {
  return {
    ok: tracks.length > 0,
    source: source,
    playlistName: playlistName,
    tracks: tracks,
    reason: reason || (tracks.length ? '' : '没搜到能播放的歌')
  };
}

/**
 * @returns {{ok:boolean, source:'netease'|'local'|'ai', playlistName:string, tracks:Array, reason:string}}
 */
export async function generate(options) {
  var opts = options || {};
  var settings = opts.settings || {};
  var prefs = opts.prefs || [];
  var count = clampCount(settings.recCount);
  var filterPlayable = settings.recFilterPlayable !== false;
  var avoid = avoidTexts(prefs);
  var mode = String(settings.recMode || 'manual');

  // 1) 登录网易云：直接用它自己的每日推荐
  var logged = false;
  try {
    logged = isLoggedIn(settings);
  } catch (err) {
    logged = false;
  }

  // 「不调模型」只是不调用 AI，网易云每日推荐本身不花 AI 额度，仍然优先用它
  if (logged) {
    try {
      // 每日推荐当天的歌是固定的，换一批时要重新打乱并换一批子集，否则看起来没变化
      var daily = await dailySongs(settings, 50);
      if (daily && daily.length) {
        var pool = daily.slice();
        for (var si = pool.length - 1; si > 0; si--) {
          var sj = Math.floor(Math.random() * (si + 1));
          var tmp = pool[si];
          pool[si] = pool[sj];
          pool[sj] = tmp;
        }
        return result('netease', '网易云每日推荐', pool.slice(0, count), '');
      }
    } catch (err) { /* 落到本地 */ }
  }

  // 2) AI 可用且不是 local 模式：让模型挑
  var ai = null;
  try {
    var api = typeof window !== 'undefined' ? window.Roche : null;
    ai = api && api.ai ? api.ai : null;
  } catch (err) {
    ai = null;
  }

  var exclude = excludeMap(opts.recent);

  if (mode !== 'local' && ai && typeof ai.chat === 'function') {
    try {
      var text = '';
      var res = await withTimeout(ai.chat({
        messages: [
          { role: 'system', content: '你只输出 JSON，不要输出任何解释或 Markdown 代码块。' },
          { role: 'user', content: buildProfilePrompt(prefs, opts.recent, opts.favorites, count) }
        ],
        temperature: 0.95
      }), AI_TIMEOUT);
      text = (res && (res.text || res.content)) || '';

      var parsed = parseRecommendJson(text);
      if (parsed) {
        var tracks = await ground({
          sources: opts.sources,
          settings: settings,
          picks: parsed.tracks,
          keywords: parsed.keywords,
          avoid: avoid,
          exclude: exclude,
          want: count,
          filterPlayable: filterPlayable
        });
        if (tracks.length) {
          return result('ai', parsed.playlistName || 'AI 为你挑的', tracks, '');
        }
      }
    } catch (err) { /* 落到本地 */ }
  }

  // 3) 本地随机：每次换一批一定不一样
  var seeds = pickSeeds(prefs, opts.recent, opts.favorites, Date.now());
  var localTracks = await ground({
    sources: opts.sources,
    settings: settings,
    picks: [],
    keywords: seeds,
    avoid: avoid,
    exclude: exclude,
    want: count,
    filterPlayable: filterPlayable
  });

  // 种子搜出来的不够，再补一轮（换一批种子，避免又推同一批）
  if (localTracks.length < Math.min(count, 8)) {
    var moreSeeds = pickSeeds(prefs, opts.recent, opts.favorites, Date.now() + 7919);
    var extra = await ground({
      sources: opts.sources,
      settings: settings,
      picks: [],
      keywords: moreSeeds,
      avoid: avoid,
      exclude: Object.assign({}, exclude, excludeMap(localTracks)),
      want: count - localTracks.length,
      filterPlayable: filterPlayable
    });
    localTracks = localTracks.concat(extra);
  }

  var why = '';
  if (!localTracks.length) why = '没搜到能播放的歌，换个偏好试试';
  else if (mode === 'local') why = '';

  return result('local', seeds.slice(0, 2).join(' · ') || '为你挑的', localTracks, why);
}
