/** 搜索页：历史搜索 / 猜你喜欢 / 热门推荐 + 结果列表 */

import { h, clear } from '../dom.js';
import { icon } from '../icons.js';
import { iconBtn, pageTitle, songRow, emptyHint } from '../components.js';
import { trackKey } from '../../core/track.js';
import { sourceLabel } from '../../core/sourceLabel.js';

export function mount(host, ctx) {
  var state = ctx.state;
  var resultsBox = h('div', { class: 'mp-body' });
  var selecting = false;
  var selected = Object.create(null);

  function toggleSelect(track) {
    var key = trackKey(track);
    if (selected[key]) delete selected[key];
    else selected[key] = track;
  }

  function selectedTracks() {
    return Object.keys(selected).map(function (key) { return selected[key]; });
  }

  /** 只更新计数，不重建列表（重建会闪、封面会重新加载） */
  function updateSelectCount() {
    var countEl = resultsBox.querySelector('.mp-select-bar__count');
    var addBtn = resultsBox.querySelector('.mp-select-bar .mp-btn');
    var n = selectedTracks().length;
    if (countEl) countEl.textContent = '已选 ' + n + ' 首';
    if (addBtn) addBtn.disabled = !n;
  }

  var input = h('input', {
    class: 'mp-search__input',
    type: 'text',
    inputmode: 'search',
    placeholder: '搜索歌曲、歌手、专辑',
    value: state.search.keyword || '',
    enterkeyhint: 'search'
  });

  var clearBtn = h('button', { class: 'mp-search__clear', type: 'button', 'aria-label': '清空' },
    [h('span', { html: icon('close') })]);

  var box = h('div', { class: 'mp-search__box' }, [
    h('span', { html: icon('search') }),
    input,
    clearBtn
  ]);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
      ctx.searchNow(input.value);
    }
  });

  clearBtn.addEventListener('click', function () {
    input.value = '';
    ctx.searchNow('');
    input.focus();
  });

  var headerRight = [];

  headerRight.push(iconBtn('check', {
    label: selecting ? '退出多选' : '多选',
    onClick: function () {
      selecting = !selecting;
      if (!selecting) selected = Object.create(null);
      renderResults();
    }
  }));

  // 右上角不再放最小化：一级页左上角已经按「悬浮窗」开关统一处理

  var header = h('div', { class: 'mp-header' }, [
    // 搜索是推荐页的二级页面，左上角回推荐
    iconBtn('back', { label: '返回推荐', onClick: function () { ctx.goto('recommend'); } }),
    pageTitle('搜索', function () { ctx.exitApp(); })
  ].concat(headerRight));

  /* ---------- 推荐区 ---------- */

  function chip(label, onClick) {
    var btn = h('button', { class: 'mp-rec-chip', type: 'button', text: label });
    btn.addEventListener('click', function () { onClick(label); });
    return btn;
  }

  function renderRecommend() {
    var box2 = h('div');
    var data = ctx.suggestions();

    if (data.searches.length) {
      var head = h('div', { class: 'mp-section' }, [
        h('span', { text: '最近搜索' }),
        (function () {
          var btn = h('button', { class: 'mp-section__act', type: 'button', text: '清空' });
          btn.addEventListener('click', function () { ctx.clearSearches(); });
          return btn;
        })()
      ]);
      var chips = h('div', { class: 'mp-rec' });
      data.searches.forEach(function (word) {
        chips.appendChild(chip(word, function (w) {
          input.value = w;
          ctx.searchNow(w);
        }));
      });
      box2.appendChild(head);
      box2.appendChild(chips);
    }

    if (data.artists.length) {
      box2.appendChild(h('div', { class: 'mp-section', text: '猜你喜欢' }));
      var guess = h('div', { class: 'mp-rec' });
      data.artists.forEach(function (artist) {
        guess.appendChild(chip(artist, function (w) {
          input.value = w;
          ctx.searchNow(w);
        }));
      });
      box2.appendChild(guess);
      box2.appendChild(h('div', { class: 'mp-rec__hint', text: '根据最近播放和收藏的歌手推荐' }));
    }

    box2.appendChild(h('div', { class: 'mp-section', text: '热门推荐' }));
    var hot = h('div', { class: 'mp-rec' });
    data.hot.forEach(function (word) {
      hot.appendChild(chip(word, function (w) {
        input.value = w;
        ctx.searchNow(w);
      }));
    });
    box2.appendChild(hot);

    box2.appendChild(h('div', { class: 'mp-hint mp-rec__foot', text: '点上面的词直接搜索，也可以自己输入歌名或歌手' }));

    // 排行榜跟着「最近搜索 / 猜你喜欢」一起排在下面，
    // 有搜索结果时整块被替换掉（不会盖住历史），清空后原样回来
    if (rankBox) box2.appendChild(rankBox);

    return box2;
  }

  /* ---------- 结果 ---------- */

  function renderResults() {
    clear(resultsBox);
    var s = state.search;

    if (s.busy) {
      resultsBox.appendChild(h('div', { class: 'mp-hint', text: '正在搜索…' }));
      return;
    }

    if (!s.at) {
      resultsBox.appendChild(renderRecommend());
      return;
    }

    (s.errors || []).forEach(function (err) {
      var label = sourceLabel({ source: err.source });
      resultsBox.appendChild(h('div', { class: 'mp-error', text: label + ' 搜索失败：' + err.error }));
    });

    if (!s.tracks.length) {
      resultsBox.appendChild(emptyHint('没有找到歌曲', '换个关键词，或在设置里打开音源'));
      return;
    }

    var counts = [];
    if (s.counts.tencent) counts.push('QQ ' + s.counts.tencent);
    if (s.counts.itunes) counts.push('iTunes ' + s.counts.itunes);
    resultsBox.appendChild(h('div', {
      class: 'mp-section',
      text: '找到 ' + s.tracks.length + ' 首' + (counts.length ? '（' + counts.join(' · ') + '）' : '')
    }));

    if (selecting) {
      var chosen = selectedTracks();
      var addBtn = h('button', { class: 'mp-btn mp-btn--ghost', type: 'button', text: '加入播放列表' });
      addBtn.disabled = !chosen.length;
      addBtn.addEventListener('click', function () {
        // 勾选是局部更新，chosen 要现取，不能用渲染时的快照
        var picked = selectedTracks();
        if (!picked.length) return;
        ctx.appendToQueue(picked).then(function (n) {
          selected = Object.create(null);
          selecting = false;
          ctx.toast('已加入 ' + n + ' 首到播放列表');
          renderResults();
        });
      });
      resultsBox.appendChild(h('div', { class: 'mp-select-bar' }, [
        h('span', { class: 'mp-select-bar__count', text: '已选 ' + chosen.length + ' 首' }),
        addBtn
      ]));
    }

    var playing = ctx.state.player.status === 'playing';
    s.tracks.forEach(function (track, i) {
      resultsBox.appendChild(songRow({
        track: track,
        coverUrl: ctx.coverOf(track),
        coverKey: trackKey(track),
        current: ctx.isCurrent(track),
        playing: playing && ctx.isCurrent(track),
        selectable: selecting,
        selected: !!selected[trackKey(track)],
        tag: track.source === 'itunes' ? '试听' : (track.source === 'audius' ? '免费' : ''),
        onPlay: function (rowEl) {
          if (selecting) {
            toggleSelect(track);
            var on = !!selected[trackKey(track)];
            if (rowEl) {
              rowEl.classList.toggle('is-selected', on);
              var check = rowEl.querySelector('.mp-row__check');
              if (check) {
                check.classList.toggle('is-on', on);
                check.innerHTML = on ? icon('check') : '';
              }
            }
            updateSelectCount();
            return;
          }
          // 点单曲：只把这一首加进列表并播放，不把整页结果塞进去
          if (ctx.isCurrent(track)) ctx.togglePlay();
          else ctx.playOne(track);
        },
        onMore: function () { ctx.openSongSheet(track, { queueTracks: s.tracks, queueIndex: i }); }
      }));
    });
  }

  /* ---------- 排行榜：进入就加载，直接铺榜单卡（和网易云一致） ---------- */

  var rankBox = null;
  var rankCancelled = false;

  function renderRankSkeleton() {
    clear(rankBox);
    rankBox.appendChild(h('div', { class: 'mp-section', text: '排行榜' }));
    var grid = h('div', { class: 'mp-rank__grid' });
    for (var i = 0; i < 4; i++) {
      grid.appendChild(h('div', { class: 'mp-rank__card is-skeleton' }, [
        h('div', { class: 'mp-rank__cover is-skeleton' }),
        h('div', { class: 'mp-rank__name is-skeleton', text: '加载中' })
      ]));
    }
    rankBox.appendChild(grid);
  }

  function renderRanks(list) {
    clear(rankBox);
    if (!list.length) return;

    rankBox.appendChild(h('div', { class: 'mp-section', text: '排行榜' }));
    var rail = h('div', { class: 'mp-rank-rail' });

    list.slice(0, 6).forEach(function (item) {
      var playBtn = h('button', { class: 'mp-rank-card__play', type: 'button', text: '播放' });
      playBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (ctx.playNeteaseToplist) ctx.playNeteaseToplist(item.id, item.name);
      });

      var head = h('div', { class: 'mp-rank-card__head' }, [
        h('div', { class: 'mp-rank-card__name', text: item.name || '榜单' }),
        playBtn
      ]);

      var rows = h('div', { class: 'mp-rank-card__rows' });
      (item.tracks || []).slice(0, 8).forEach(function (track, i) {
        var row = h('button', {
          class: 'mp-rank-row' + (i < 3 ? ' is-top' : ''),
          type: 'button'
        }, [
          h('span', { class: 'mp-rank-row__no', text: String(i + 1) }),
          h('span', { class: 'mp-rank-row__name', text: track.name || '未知歌曲' })
        ]);
        row.addEventListener('click', function () {
          if (ctx.playNeteaseSong) ctx.playNeteaseSong(track);
        });
        rows.appendChild(row);
      });

      if (!(item.tracks || []).length) {
        rows.appendChild(h('div', { class: 'mp-rank-card__empty', text: '榜单暂时拉不到' }));
      }

      rail.appendChild(h('div', { class: 'mp-rank-card' }, [head, rows]));
    });

    rankBox.appendChild(rail);
  }

  function renderRankError() {
    clear(rankBox);
    var btn = h('button', { class: 'mp-rank__retry', type: 'button', text: '榜单加载失败 · 点这里重试' });
    btn.addEventListener('click', function () { loadRanks(); });
    rankBox.appendChild(btn);
  }

  async function loadRanks() {
    if (!rankBox) return;
    renderRankSkeleton();
    var res = null;
    try {
      res = await ctx.fetchNeteaseRankCards();
    } catch (err) {
      res = { ok: false, list: [] };
    }
    if (rankCancelled) return;
    if (!res || !res.ok || !res.list || !res.list.length) {
      renderRankError();
      return;
    }
    renderRanks(res.list);
  }

  if (ctx.neteaseApiReady && ctx.neteaseApiReady()) {
    rankBox = h('div', { class: 'mp-rank' });
    loadRanks();
  }

  var view = h('div', { class: 'mp-view' }, [
    header,
    h('div', { class: 'mp-search' }, [box]),
    resultsBox
  ]);
  host.appendChild(view);

  renderResults();

  return {
    refresh: renderResults,
    destroy: function () {
      // 切页后榜单请求回来也不要再写 DOM
      rankCancelled = true;
    }
  };
}
