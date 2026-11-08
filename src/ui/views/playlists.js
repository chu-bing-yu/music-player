/** 歌单列表 */

import { h, clear } from '../dom.js';
import { icon } from '../icons.js';
import { iconBtn, pageTitle, coverNode, emptyHint } from '../components.js';
import { fmtSummary } from '../../core/format.js';
import { playlistDuration } from '../../core/playlist.js';
import { trackKey } from '../../core/track.js';

export function mount(host, ctx) {
  var state = ctx.state;
  var listBox = h('div', { class: 'mp-list mp-body mp-plpage__body' });

  function openPlaylist(p) {
    if (p.virtual === 'favorites') {
      ctx.goto('playlist', { playlistId: '__favorites__' });
      return;
    }
    ctx.goto('playlist', { playlistId: p.id });
  }

  // 报头：居中日期 + 手写体刊名 + 双线
  var titleEl = h('div', { class: 'mp-plpage__title', text: 'Playlists' });
  titleEl.addEventListener('click', function () { ctx.exitOrMinimize(); });

  var addBtn = iconBtn('plus', {
    label: '新建歌单',
    onClick: function () {
      ctx.openPrompt({
        title: '新建歌单',
        placeholder: '给歌单起个名字',
        onSubmit: function (name) { ctx.createPlaylist(name); }
      });
    }
  });
  addBtn.classList.add('mp-plpage__add');

  var d = new Date();
  var dateText = String(d.getMonth() + 1).padStart(2, '0') + ' / ' + String(d.getDate()).padStart(2, '0') +
    '  星期' + '日一二三四五六'[d.getDay()];

  var header = h('div', { class: 'mp-plpage__top' }, [
    h('div', { class: 'mp-plpage__mast' }, [
      h('div', { class: 'mp-plpage__date', text: dateText }),
      titleEl,
      h('div', { class: 'mp-plpage__rule' })
    ]),
    addBtn
  ]);

  /** 收藏：单独一行，作为入口 */
  function featureRow(p) {
    var first = p.tracks[0];
    var cover = coverNode(first ? ctx.coverOf(first) : '', 'mp-plfeat__cover');
    if (first) cover.dataset.cover = trackKey(first);

    var row = h('button', { class: 'mp-plfeat', type: 'button' }, [
      cover,
      h('div', { class: 'mp-plfeat__main' }, [
        h('div', { class: 'mp-plfeat__name', text: p.name }),
        h('div', { class: 'mp-plfeat__sub', text: fmtSummary(p.tracks.length, playlistDuration(p)) })
      ])
    ]);
    row.addEventListener('click', function () { openPlaylist(p); });
    return row;
  }

  /** 歌单卡：两列网格，封面 1:1 */
  function plCard(p) {
    var first = p.tracks[0];
    var cover = coverNode(first ? ctx.coverOf(first) : '', 'mp-plcard__cover');
    if (first) cover.dataset.cover = trackKey(first);

    var card = h('button', { class: 'mp-plcard', type: 'button' }, [
      cover,
      h('div', { class: 'mp-plcard__name', text: p.name }),
      h('div', { class: 'mp-plcard__sub', text: fmtSummary(p.tracks.length, playlistDuration(p)) })
    ]);
    card.addEventListener('click', function () { openPlaylist(p); });
    return card;
  }

  function grid(list) {
    var box = h('div', { class: 'mp-plgrid' });
    list.forEach(function (p) { box.appendChild(plCard(p)); });
    return box;
  }

  function renderList() {
    clear(listBox);

    // 收藏固定在最上面，作为一个虚拟歌单
    listBox.appendChild(featureRow({
      id: '__favorites__',
      virtual: 'favorites',
      name: '我的收藏',
      tracks: state.favorites || [],
      createdAt: 0
    }));

    var mine = state.playlists.filter(function (p) { return p.owner !== 'char'; });
    var theirs = state.playlists.filter(function (p) { return p.owner === 'char'; });

    if (mine.length) {
      listBox.appendChild(h('div', { class: 'mp-plpage__head', text: '我的歌单' }));
      listBox.appendChild(grid(mine));
    }

    if (theirs.length) {
      listBox.appendChild(h('div', { class: 'mp-plpage__head', text: 'TA 的歌单' }));
      listBox.appendChild(grid(theirs));
    }

    if (!mine.length && !theirs.length) {
      listBox.appendChild(emptyHint(
        '还没有歌单',
        '右上角 + 新建一个；收藏的歌会固定显示在最上面'
      ));
    }
  }

  var view = h('div', { class: 'mp-view' }, [header, listBox]);
  host.appendChild(view);
  renderList();

  return { refresh: renderList };
}
