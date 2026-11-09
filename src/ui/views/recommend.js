/**
 * 推荐页，两套皮肤各有一套渲染：
 * - 杂志风（默认）：刊头 + 大图竖排 + 编号曲目单 + 竖幅书架（东方杂志 / 册页）
 * - 经典：还原 0.40 ——「问候语 + AI 推荐卡（四格封面）+ 歌单横滑条 + 今日推荐列表」
 * 两套共用同一份 ctx API，切换皮肤时由 shell 重新挂载本页。
 */

import { h, clear } from '../dom.js';
import { masthead, sectionHead } from '../masthead.js';
import { iconBtn, coverNode, fillCover, shelfRail, magTrackRow } from '../components.js';
import { trackKey } from '../../core/track.js';
import { isClassic } from '../../core/settings.js';

function greeting() {
  var hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  if (hour < 23) return '晚上好';
  return '夜深了';
}

function today() {
  var d = new Date();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return mm + ' / ' + dd;
}

/** 经典皮肤的问候语：带上下文的那版 */
function classicGreeting() {
  var hour = new Date().getHours();
  if (hour < 6) return '夜深了，来点安静的歌';
  if (hour < 11) return '早上好，今天听点什么';
  if (hour < 14) return '中午好，放松一下';
  if (hour < 18) return '下午好，给你挑了几首';
  if (hour < 23) return '晚上好，适合慢慢听';
  return '夜深了，来点安静的歌';
}

export function mount(host, ctx) {
  return isClassic(ctx.state.settings) ? mountClassic(host, ctx) : mountMagazine(host, ctx);
}

/* ==========================================================
   杂志风
   ========================================================== */

function mountMagazine(host, ctx) {
  var body = h('div', { class: 'mp-mag' });
  var refreshing = false;
  var autoFetched = false;

  var header = masthead({
    date: today(),
    title: greeting(),
    onTitle: function () { ctx.exitOrMinimize(); },
    actions: [
      iconBtn('search', { label: '搜索', onClick: function () { ctx.goto('search'); } }),
      iconBtn('gear', { label: '推荐偏好', onClick: function () { if (ctx.openPrefsPanel) ctx.openPrefsPanel(); } })
    ]
  });

  /* ---------------- 首篇：大图 + 竖排标题 ---------------- */

  function feature(rec) {
    var tracks = (rec && rec.tracks) || [];
    var first = tracks[0];

    var cover = h('div', { class: 'mp-mag__cover' });
    fillCover(cover, first ? ctx.coverOf(first) : '');

    var titleText = (rec && rec.playlistName) || '为你挑的';
    // 竖排标题：超过 6 个字只取前 6 个，避免一长条压到图外
    var title = h('div', { class: 'mp-mag__vtitle', text: String(titleText).slice(0, 6) });

    var playBtn = h('button', { class: 'mp-mag__play', type: 'button', text: '播放全部' });
    playBtn.addEventListener('click', function () {
      if (tracks.length) ctx.playRecommend(tracks, 0);
    });

    var swap = h('button', {
      class: 'mp-mag__swap',
      type: 'button',
      text: refreshing ? '正在挑…' : '换一批'
    });
    swap.addEventListener('click', function () {
      if (refreshing) return;
      refreshing = true;
      render();
      ctx.refreshRecommend(true).then(function () {
        refreshing = false;
        render();
      }, function () {
        refreshing = false;
        render();
      });
    });

    var foot = h('div', { class: 'mp-mag__featurefoot' }, [
      h('span', { class: 'mp-mag__count', text: tracks.length ? tracks.length + ' 首' : '还没有推荐' }),
      playBtn,
      swap
    ]);

    var sheet = h('div', { class: 'mp-mag__feature' }, [
      cover,
      h('div', { class: 'mp-mag__overlay' }, [
        title,
        h('div', { class: 'mp-mag__foryou', text: 'For You' })
      ])
    ]);

    var wrap = h('div', { class: 'mp-mag__featurewrap' }, [sheet, foot]);
    if (rec && rec.reason) wrap.appendChild(h('div', { class: 'mp-mag__hint', text: rec.reason }));
    return wrap;
  }

  /* ---------------- 曲目单 ---------------- */

  function tracklist(tracks) {
    var list = h('div', { class: 'mp-mag__tracks' });

    tracks.slice(0, 20).forEach(function (track, i) {
      list.appendChild(magTrackRow({
        index: i,
        track: track,
        current: ctx.isCurrent(track),
        onPlay: function () { ctx.playRecommend(tracks, i); }
      }));
    });

    return list;
  }

  /* ---------------- 我的歌单：竖幅封面书架 ---------------- */

  function shelf() {
    var list = (ctx.state.playlists || []).filter(function (p) { return p && p.id; });
    if (!list.length) return null;

    var items = list.slice(0, 20).map(function (p) {
      var first = (p.tracks || [])[0];
      return {
        name: p.name,
        sub: (p.tracks || []).length + ' 首',
        coverUrl: first ? ctx.coverOf(first) : '',
        coverKey: first ? trackKey(first) : '',
        onClick: function () { ctx.goto('playlist', { playlistId: p.id }); }
      };
    });

    return h('div', {}, [sectionHead('我的歌单'), shelfRail(items)]);
  }

  /* ---------------- 排行榜：目录 ---------------- */

  function ranks() {
    if (!ctx.neteaseReady || !ctx.neteaseReady()) return null;

    var row = h('button', { class: 'mp-mag__rankrow', type: 'button' }, [
      h('span', { class: 'mp-mag__rankno', text: '①' }),
      h('span', { class: 'mp-mag__rankname', text: '网易云排行榜' }),
      h('span', { class: 'mp-mag__ranksub', text: '热歌 / 新歌 / 飙升' })
    ]);
    row.addEventListener('click', function () { ctx.goto('search'); });

    return h('div', {}, [sectionHead('榜单'), row]);
  }

  /* ---------------- 渲染 ---------------- */

  function renderBody() {
    var rec = ctx.recommendCache ? ctx.recommendCache() : null;
    var tracks = (rec && rec.tracks) || [];

    body.appendChild(feature(rec));

    if (tracks.length) {
      body.appendChild(h('div', { class: 'mp-mag__gap' }));
      body.appendChild(sectionHead('每日推荐'));
      body.appendChild(tracklist(tracks));
    }

    var sp = shelf();
    if (sp) {
      body.appendChild(h('div', { class: 'mp-mag__gap' }));
      body.appendChild(sp);
    }

    var rk = ranks();
    if (rk) {
      body.appendChild(h('div', { class: 'mp-mag__gap' }));
      body.appendChild(rk);
    }

    body.appendChild(h('div', { class: 'mp-mag__end', text: '· 今日歌单到此 ·' }));
  }

  function render() {
    clear(body);
    try {
      renderBody();
    } catch (err) {
      clear(body);
      body.appendChild(h('div', { class: 'mp-mag__hint', text: '推荐加载失败' }));
      var retry = h('button', { class: 'mp-mag__swap', type: 'button', text: '重试' });
      retry.addEventListener('click', function () { render(); });
      body.appendChild(retry);
    }
  }

  var view = h('div', { class: 'mp-view mp-recpage' }, [header, body]);
  host.appendChild(view);
  render();

  var mode = (ctx.state.settings && ctx.state.settings.recMode) || 'manual';
  var cache = ctx.recommendCache ? ctx.recommendCache() : null;
  var shouldFetch = !cache || !cache.tracks || (mode === 'auto' && !autoFetched);

  if (shouldFetch && ctx.refreshRecommend) {
    if (mode === 'auto') autoFetched = true;
    refreshing = true;
    render();
    ctx.refreshRecommend(mode === 'auto').then(function () {
      refreshing = false;
      render();
    }, function () {
      refreshing = false;
      render();
    });
  }

  return {
    refresh: render,
    destroy: function () {
      refreshing = false;
    }
  };
}

/* ==========================================================
   经典（0.40 版式）：问候 + AI 卡 + 歌单横滑 + 今日推荐
   ========================================================== */

function mountClassic(host, ctx) {
  var body = h('div', { class: 'mp-body' });
  var refreshing = false;
  var autoFetched = false;

  var header = masthead({
    classic: true,
    title: '推荐',
    onTitle: function () { ctx.exitOrMinimize(); },
    actions: [
      iconBtn('search', { label: '搜索', onClick: function () { ctx.goto('search'); } }),
      iconBtn('more', { label: '推荐偏好', onClick: function () { if (ctx.openPrefsPanel) ctx.openPrefsPanel(); } })
    ]
  });

  /** 四格封面：AI 推荐卡左侧的拼图 */
  function coverTile(tracks) {
    var grid = h('div', { class: 'mp-rec__mosaic' });
    var list = (tracks || []).slice(0, 4);
    for (var i = 0; i < 4; i++) {
      var t = list[i];
      var cell = coverNode(t ? ctx.coverOf(t) : '', 'mp-rec__tile');
      if (t) cell.dataset.cover = trackKey(t);
      grid.appendChild(cell);
    }
    return grid;
  }

  function aiCard(rec) {
    var tracks = (rec && rec.tracks) || [];
    var name = (rec && rec.playlistName) || 'AI 为你挑的';

    var playBtn = h('button', { class: 'mp-rec__play', type: 'button', text: '播放全部' });
    playBtn.addEventListener('click', function () {
      if (!tracks.length) return;
      ctx.playRecommend(tracks, 0);
    });

    var refreshBtn = h('button', {
      class: 'mp-rec__refresh',
      type: 'button',
      text: refreshing ? '正在挑…' : '换一批'
    });
    refreshBtn.addEventListener('click', function () {
      if (refreshing) return;
      refreshing = true;
      render();
      ctx.refreshRecommend(true).then(function () {
        refreshing = false;
        render();
      }, function () {
        refreshing = false;
        render();
      });
    });

    return h('div', { class: 'mp-rec__card' }, [
      coverTile(tracks),
      h('div', { class: 'mp-rec__info' }, [
        h('div', { class: 'mp-rec__label', text: 'AI 为你挑的' }),
        h('div', { class: 'mp-rec__name', text: name }),
        h('div', {
          class: 'mp-rec__meta',
          text: tracks.length
            ? tracks.length + ' 首 · ' + (rec.mode === 'local' ? '按偏好' : 'AI 挑选')
            : '还没有推荐'
        }),
        h('div', { class: 'mp-rec__actions' }, [playBtn, refreshBtn])
      ])
    ]);
  }

  /* 中间的卡正常、两侧渐隐（0.40 的横滑条手感） */
  function updateRailFade(rail) {
    var mid = rail.scrollLeft + rail.clientWidth / 2;
    var half = rail.clientWidth / 2 || 1;
    Array.prototype.forEach.call(rail.children, function (card) {
      var center = card.offsetLeft + card.offsetWidth / 2;
      var dist = Math.abs(center - mid) / half;
      var near = Math.max(0, 1 - dist);
      card.classList.toggle('is-center', dist < 0.36);
      card.style.opacity = String((0.45 + near * 0.55).toFixed(3));
      card.style.filter = dist < 0.36 ? 'none' : 'grayscale(0.6)';
    });
  }

  function playlistsRail() {
    var list = (ctx.state.playlists || []).filter(function (p) { return p && p.id; });
    if (!list.length) return null;

    var rail = h('div', { class: 'mp-rec-rail' });
    list.slice(0, 20).forEach(function (p) {
      var first = (p.tracks || [])[0];
      var cover = h('div', { class: 'mp-rec-rail__cover' });
      fillCover(cover, first ? ctx.coverOf(first) : '');
      if (first) cover.dataset.cover = trackKey(first);

      var card = h('button', { class: 'mp-rec-rail__card', type: 'button' }, [
        cover,
        h('div', { class: 'mp-rec-rail__name', text: p.name }),
        h('div', { class: 'mp-rec-rail__sub', text: (p.tracks || []).length + ' 首' })
      ]);
      card.addEventListener('click', function () {
        ctx.goto('playlist', { playlistId: p.id });
      });
      rail.appendChild(card);
    });

    rail.addEventListener('scroll', function () { updateRailFade(rail); }, { passive: true });
    requestAnimationFrame(function () { updateRailFade(rail); });

    return h('div', { class: 'mp-rec-railwrap' }, [
      h('div', { class: 'mp-section', text: '我的歌单' }),
      rail
    ]);
  }

  function trackRow(track, index, tracks) {
    var cover = coverNode(ctx.coverOf(track), 'mp-rec__rowcover');
    cover.dataset.cover = trackKey(track);
    var row = h('button', { class: 'mp-rec__row', type: 'button' }, [
      cover,
      h('div', { class: 'mp-rec__rowmain' }, [
        h('div', { class: 'mp-rec__rowname', text: track.name || '未知歌曲' }),
        h('div', { class: 'mp-rec__rowsub', text: track.artist || '' })
      ])
    ]);
    row.addEventListener('click', function () {
      ctx.playRecommend(tracks, index);
    });
    return row;
  }

  function renderBody() {
    var rec = ctx.recommendCache ? ctx.recommendCache() : null;
    var tracks = (rec && rec.tracks) || [];

    body.appendChild(h('div', { class: 'mp-rec__hello', text: classicGreeting() }));
    body.appendChild(aiCard(rec));

    var rail = playlistsRail();
    if (rail) body.appendChild(rail);

    if (rec && rec.reason) {
      body.appendChild(h('div', { class: 'mp-rec__hint', text: rec.reason }));
    }

    if (tracks.length) {
      body.appendChild(h('div', { class: 'mp-section', text: '今日推荐' }));
      var listBox = h('div', { class: 'mp-rec__list' });
      tracks.forEach(function (track, i) {
        listBox.appendChild(trackRow(track, i, tracks));
      });
      body.appendChild(listBox);
    }

    if (ctx.neteaseReady && ctx.neteaseReady()) {
      var rank = h('button', { class: 'mp-rec__rank', type: 'button' }, [
        h('div', { class: 'mp-rec__rankname', text: '排行榜' }),
        h('div', { class: 'mp-rec__ranksub', text: '去搜索页看热歌榜 / 新歌榜' })
      ]);
      rank.addEventListener('click', function () { ctx.goto('search'); });
      body.appendChild(rank);
    }
  }

  function render() {
    clear(body);
    try {
      renderBody();
    } catch (err) {
      clear(body);
      body.appendChild(h('div', { class: 'mp-rec__hint', text: '推荐加载失败' }));
      var retry = h('button', { class: 'mp-rec__refresh', type: 'button', text: '重试' });
      retry.addEventListener('click', function () { render(); });
      body.appendChild(retry);
    }
  }

  var view = h('div', { class: 'mp-view' }, [header, body]);
  host.appendChild(view);
  render();

  var mode = (ctx.state.settings && ctx.state.settings.recMode) || 'manual';
  var cache = ctx.recommendCache ? ctx.recommendCache() : null;
  var shouldFetch = !cache || !cache.tracks || (mode === 'auto' && !autoFetched);

  if (shouldFetch && ctx.refreshRecommend) {
    if (mode === 'auto') autoFetched = true;
    refreshing = true;
    render();
    ctx.refreshRecommend(mode === 'auto').then(function () {
      refreshing = false;
      render();
    }, function () {
      refreshing = false;
      render();
    });
  }

  return {
    refresh: render,
    destroy: function () {
      refreshing = false;
    }
  };
}
