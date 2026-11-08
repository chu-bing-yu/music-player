/**
 * 推荐页：东方杂志 / 册页式排版。
 * 不做横滑卡片流，靠「刊头 + 大图竖排 + 编号曲目单 + 书脊歌单」建立秩序感。
 */

import { h, clear } from '../dom.js';
import { iconBtn, coverNode, fillCover } from '../components.js';
import { trackKey } from '../../core/track.js';
import { fmtTime } from '../../core/format.js';

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

export function mount(host, ctx) {
  var body = h('div', { class: 'mp-mag' });
  var refreshing = false;
  var autoFetched = false;

  // 报头式刊头：居中日期行 + 居中大标题 + 双线收边，按钮浮在右上角
  var greet = h('div', { class: 'mp-mag__greet', text: greeting() });
  greet.addEventListener('click', function () { ctx.exitOrMinimize(); });

  var header = h('div', { class: 'mp-mag__top' }, [
    h('div', { class: 'mp-mag__mast' }, [
      h('div', { class: 'mp-mag__date', text: today() + '  星期' + '日一二三四五六'[new Date().getDay()] }),
      greet,
      h('div', { class: 'mp-mag__doublerule' })
    ]),
    h('div', { class: 'mp-mag__acts' }, [
      iconBtn('search', { label: '搜索', onClick: function () { ctx.goto('search'); } }),
      iconBtn('gear', { label: '推荐偏好', onClick: function () { if (ctx.openPrefsPanel) ctx.openPrefsPanel(); } })
    ])
  ]);

  /* ---------------- 刊头 ---------------- */

  function headRow(text, action) {
    var row = h('div', { class: 'mp-mag__head' }, [
      h('span', { class: 'mp-mag__headtext', text: text }),
      h('span', { class: 'mp-mag__rule' })
    ]);
    if (action) row.appendChild(action);
    return row;
  }

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
      var no = String(i + 1).padStart(2, '0');
      var row = h('button', { class: 'mp-mag__track', type: 'button' }, [
        h('span', { class: 'mp-mag__no', text: no }),
        h('span', { class: 'mp-mag__tname', text: track.name || '未知歌曲' }),
        h('span', { class: 'mp-mag__time', text: track.duration ? fmtTime(track.duration) : '' })
      ]);
      row.addEventListener('click', function () {
        ctx.playRecommend(tracks, i);
      });
      list.appendChild(row);
    });

    return list;
  }

  /* ---------------- 我的歌单：小封面横滑卡 ---------------- */

  function shelf() {
    var list = (ctx.state.playlists || []).filter(function (p) { return p && p.id; });
    if (!list.length) return null;

    var rail = h('div', { class: 'mp-mag__shelf' });

    list.slice(0, 20).forEach(function (p) {
      var first = (p.tracks || [])[0];
      var cover = h('div', { class: 'mp-mag__shelfcover' });
      fillCover(cover, first ? ctx.coverOf(first) : '');

      var card = h('button', { class: 'mp-mag__shelfcard', type: 'button' }, [
        cover,
        h('div', { class: 'mp-mag__shelfname', text: p.name }),
        h('div', { class: 'mp-mag__shelfsub', text: (p.tracks || []).length + ' 首' })
      ]);
      card.addEventListener('click', function () {
        ctx.goto('playlist', { playlistId: p.id });
      });
      rail.appendChild(card);
    });

    return h('div', {}, [headRow('我的歌单'), rail]);
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

    return h('div', {}, [headRow('榜单'), row]);
  }

  /* ---------------- 渲染 ---------------- */

  function renderBody() {
    var rec = ctx.recommendCache ? ctx.recommendCache() : null;
    var tracks = (rec && rec.tracks) || [];

    body.appendChild(feature(rec));

    if (tracks.length) {
      body.appendChild(h('div', { class: 'mp-mag__gap' }));
      body.appendChild(headRow('每日推荐'));
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
