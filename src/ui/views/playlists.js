/**
 * 歌单列表，两套皮肤：
 * - 杂志风：栏目头 + 竖幅书架（一屏 4 张，等大、纵向错落）
 * - 经典：还原 0.40 的竖排列表（54px 封面 + 名称 + 数量），收藏固定在第一行
 */

import { h, clear } from '../dom.js';
import { iconBtn, coverNode, emptyHint, shelfRail } from '../components.js';
import { masthead, todayText, sectionHead } from '../masthead.js';
import { fmtSummary } from '../../core/format.js';
import { playlistDuration } from '../../core/playlist.js';
import { trackKey } from '../../core/track.js';
import { isClassic } from '../../core/settings.js';

export function mount(host, ctx) {
  return isClassic(ctx.state.settings) ? mountClassic(host, ctx) : mountMagazine(host, ctx);
}

function addButton(ctx) {
  return iconBtn('plus', {
    label: '新建歌单',
    onClick: function () {
      ctx.openPrompt({
        title: '新建歌单',
        placeholder: '给歌单起个名字',
        onSubmit: function (name) { ctx.createPlaylist(name); }
      });
    }
  });
}

function favoritesEntry(state) {
  return {
    id: '__favorites__',
    virtual: 'favorites',
    name: '我的收藏',
    tracks: state.favorites || [],
    createdAt: 0
  };
}

/**
 * 角色在聊天里新建的歌单只落在 localStorage 镜像里（聊天侧与 App 是两份 storage），
 * 所以进页面、回到前台都要重新拉一次并合并，不能只吃启动时那份 state。
 * @returns {Function} 卸载时清监听
 */
function autoRefresh(ctx, renderList) {
  function pull() {
    var task = ctx.reloadPlaylists ? ctx.reloadPlaylists() : null;
    Promise.resolve(task).then(renderList, renderList);
  }

  function onVisible() {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') pull();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
  }
  pull();

  return function () {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}

/* ---------------- 杂志风 ---------------- */

function mountMagazine(host, ctx) {
  var state = ctx.state;
  var listBox = h('div', { class: 'mp-list mp-body mp-plpage__body' });

  function openPlaylist(p) {
    if (p.virtual === 'favorites') {
      ctx.goto('playlist', { playlistId: '__favorites__' });
      return;
    }
    ctx.goto('playlist', { playlistId: p.id });
  }

  var header = masthead({
    date: todayText(),
    title: '歌单',
    onTitle: function () { ctx.exitOrMinimize(); },
    actions: [addButton(ctx)]
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
      h('span', { class: 'mp-plfeat__arrow', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>' })
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
    listBox.appendChild(featureRow(favoritesEntry(state)));

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
  var detach = autoRefresh(ctx, renderList);

  return { refresh: renderList, destroy: detach };
}

/* ---------------- 经典 ---------------- */

function mountClassic(host, ctx) {
  var state = ctx.state;
  var listBox = h('div', { class: 'mp-list mp-body' });

  var header = masthead({
    classic: true,
    title: '歌单',
    onTitle: function () { ctx.exitOrMinimize(); },
    actions: [addButton(ctx)]
  });

  function plRow(p) {
    var first = p.tracks[0];
    var cover = coverNode(first ? ctx.coverOf(first) : '', 'mp-pl__cover');
    if (first) cover.dataset.cover = trackKey(first);

    var row = h('button', { class: 'mp-pl', type: 'button' }, [
      cover,
      h('div', { class: 'mp-pl__main' }, [
        h('div', { class: 'mp-pl__name', text: p.name }),
        h('div', { class: 'mp-pl__sub', text: fmtSummary(p.tracks.length, playlistDuration(p)) })
      ])
    ]);
    row.addEventListener('click', function () {
      if (p.virtual === 'favorites') {
        ctx.goto('playlist', { playlistId: '__favorites__' });
        return;
      }
      ctx.goto('playlist', { playlistId: p.id });
    });
    return row;
  }

  function renderList() {
    clear(listBox);
    listBox.appendChild(plRow(favoritesEntry(state)));

    var mine = state.playlists.filter(function (p) { return p.owner !== 'char'; });
    var theirs = state.playlists.filter(function (p) { return p.owner === 'char'; });

    if (mine.length) {
      listBox.appendChild(h('div', { class: 'mp-section', text: '我的歌单' }));
      mine.forEach(function (p) { listBox.appendChild(plRow(p)); });
    }
    if (theirs.length) {
      listBox.appendChild(h('div', { class: 'mp-section', text: 'TA 的歌单' }));
      theirs.forEach(function (p) { listBox.appendChild(plRow(p)); });
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
  var detach = autoRefresh(ctx, renderList);

  return { refresh: renderList, destroy: detach };
}
