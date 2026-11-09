/** 歌单列表：与推荐页同一套杂志语言（栏目头 + 竖幅封面书架） */

import { h, clear } from '../dom.js';
import { icon } from '../icons.js';
import { iconBtn, coverNode, emptyHint, shelfRail } from '../components.js';
import { masthead, todayText, sectionHead } from '../masthead.js';
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

  var header = masthead({
    date: todayText(),
    title: '歌单',
    onTitle: function () { ctx.exitOrMinimize(); },
    actions: [addBtn]
  });

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
      ]),
      h('span', { class: 'mp-plfeat__arrow', html: icon('play') })
    ]);
    row.addEventListener('click', function () { openPlaylist(p); });
    return row;
  }

  /** 一组歌单：栏目头 + 书架 */
  function group(title, list) {
    var items = list.map(function (p) {
      var first = p.tracks[0];
      return {
        name: p.name,
        sub: p.tracks.length + ' 首',
        coverUrl: first ? ctx.coverOf(first) : '',
        coverKey: first ? trackKey(first) : '',
        onClick: function () { openPlaylist(p); }
      };
    });
    return h('div', { class: 'mp-plgroup' }, [sectionHead(title), shelfRail(items)]);
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

    if (mine.length) listBox.appendChild(group('我的歌单', mine));
    if (theirs.length) listBox.appendChild(group('TA 的歌单', theirs));

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
