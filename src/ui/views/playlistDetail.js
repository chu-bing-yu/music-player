/** 歌单详情：播放全部 / 随机 / 排序 / 移除 */

import { h, clear } from '../dom.js';
import { icon } from '../icons.js';
import { iconBtn, songRow, emptyHint } from '../components.js';
import { masthead } from '../masthead.js';
import { trackKey } from '../../core/track.js';
import { fmtSummary } from '../../core/format.js';
import { playlistDuration } from '../../core/playlist.js';

export function mount(host, ctx) {
  var state = ctx.state;
  var listBox = h('div', { class: 'mp-body' });

  function back() {
    ctx.goto('playlists');
  }

  var FAKE_FAVORITES = '__favorites__';

  function isFavorites() {
    return state.playlistId === FAKE_FAVORITES;
  }

  function currentPlaylist() {
    if (isFavorites()) {
      // 收藏当作一个虚拟歌单展示
      return {
        id: FAKE_FAVORITES,
        name: '我的收藏',
        tracks: state.favorites || [],
        createdAt: 0,
        readonly: true
      };
    }
    return ctx.playlistOf(state.playlistId);
  }

  var titleEl = h('div', { class: 'mp-header__title', text: '歌单' });
  var subEl = h('div', { class: 'mp-mast__hint', text: '' });

  var moreBtn = iconBtn('more', {
    label: '更多',
    onClick: function () {
      var p = currentPlaylist();
      if (!p || p.readonly) return;
      ctx.openSheet({
        title: p.name,
        items: [
          {
            label: '重命名',
            icon: 'note',
            onClick: function () {
              ctx.openPrompt({
                title: '重命名歌单',
                value: p.name,
                onSubmit: function (name) { ctx.renamePlaylist(p.id, name); }
              });
            }
          },
          {
            label: '删除歌单',
            icon: 'trash',
            danger: true,
            onClick: function () { ctx.deletePlaylist(p.id); }
          }
        ]
      });
    }
  });

  var header = masthead({
    leading: iconBtn('back', { label: '返回', onClick: back }),
    titleNode: h('div', { class: 'mp-mast__title', text: '歌单' }),
    subNode: subEl,
    actions: [moreBtn]
  });
  // 标题交给 masthead 渲染，后续更新沿用 titleEl 引用
  titleEl = header.querySelector('.mp-mast__title');

  var actions = h('div', { class: 'mp-actions mp-actions--text' });

  function renderActions(p) {
    clear(actions);
    var disabled = !p.tracks.length;

    var playAll = h('button', { class: 'mp-btn mp-btn--primary', type: 'button' }, [
      h('span', { html: icon('play') }),
      h('span', { text: '播放全部' })
    ]);
    playAll.disabled = disabled;
    playAll.addEventListener('click', function () { ctx.playTracks(p.tracks, 0); });

    var shuffleAll = h('button', { class: 'mp-btn mp-btn--ghost', type: 'button' }, [
      h('span', { html: icon('shuffle') }),
      h('span', { text: '随机播放' })
    ]);
    shuffleAll.disabled = disabled;
    shuffleAll.addEventListener('click', async function () {
      if (!state.settings.shuffle) await ctx.toggleShuffle();
      ctx.playTracks(p.tracks, 0);
    });

    actions.appendChild(playAll);
    actions.appendChild(shuffleAll);
  }

  function renderList() {
    clear(listBox);
    var p = currentPlaylist();
    if (!p) {
      titleEl.textContent = '歌单不存在';
      subEl.textContent = '';
      clear(actions);
      moreBtn.style.display = 'none';
      listBox.appendChild(emptyHint('这个歌单已经被删除了', '返回上一页看看别的歌单'));
      return;
    }
    moreBtn.style.display = '';
    titleEl.textContent = p.name;
    subEl.textContent = fmtSummary(p.tracks.length, playlistDuration(p));
    renderActions(p);

    if (!p.tracks.length) {
      listBox.appendChild(emptyHint('歌单还是空的', '去搜索结果里点「⋯ → 加入歌单」'));
      return;
    }

    p.tracks.forEach(function (track, i) {
      listBox.appendChild(songRow({
        track: track,
        coverUrl: ctx.coverOf(track),
        coverKey: trackKey(track),
        current: ctx.isCurrent(track),
        playing: ctx.state.player.status === 'playing',
        onPlay: function () {
          if (ctx.isCurrent(track)) ctx.togglePlay();
          else ctx.playTracks(p.tracks, i);
        },
        onMore: function () {
          ctx.openSongSheet(track, {
            playlistId: p.id,
            index: i,
            queueTracks: p.tracks,
            queueIndex: i
          });
        }
      }));
    });
  }

  var view = h('div', { class: 'mp-view' }, [header, actions, listBox]);
  host.appendChild(view);
  renderList();

  return { refresh: renderList };
}
