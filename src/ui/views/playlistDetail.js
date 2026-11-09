/**
 * 歌单详情，两套皮肤：
 * - 杂志风：编号列表（01 + 宋体歌名 + 时长 + ⋯），操作是下划线文字按钮
 * - 经典：还原 0.40 —— 40px 小封面歌曲行，操作是「播放全部 / 随机播放」胶囊按钮
 */

import { h, clear } from '../dom.js';
import { icon } from '../icons.js';
import { iconBtn, songRow, magTrackRow, emptyHint } from '../components.js';
import { masthead } from '../masthead.js';
import { trackKey } from '../../core/track.js';
import { fmtSummary } from '../../core/format.js';
import { playlistDuration } from '../../core/playlist.js';
import { isClassic } from '../../core/settings.js';

export function mount(host, ctx) {
  var state = ctx.state;
  var classic = isClassic(state.settings);
  var listBox = h('div', { class: 'mp-body' + (classic ? '' : ' mp-tracklist') });

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

  var titleEl = h('div', {
    class: classic ? 'mp-header__title' : 'mp-mast__title',
    text: '歌单'
  });
  var subEl = h('div', {
    class: classic ? 'mp-header__sub' : 'mp-mast__hint',
    text: ''
  });

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
    classic: classic,
    leading: iconBtn('back', { label: '返回', onClick: back }),
    titleNode: titleEl,
    subNode: subEl,
    actions: [moreBtn]
  });

  var actions = h('div', { class: 'mp-actions' + (classic ? '' : ' mp-actions--text') });

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
      if (classic) {
        listBox.appendChild(songRow({
          track: track,
          coverUrl: ctx.coverOf(track),
          coverKey: trackKey(track),
          current: ctx.isCurrent(track),
          playing: state.player.status === 'playing',
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
        return;
      }

      listBox.appendChild(magTrackRow({
        index: i,
        track: track,
        current: ctx.isCurrent(track),
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
