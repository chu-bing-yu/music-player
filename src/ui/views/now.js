/** 正在播放页：大封面 / 滚动歌词 + 进度 + 控制 */

import { h, clear } from '../dom.js';
import { icon } from '../icons.js';
import { iconBtn, fillCover } from '../components.js';
import { fmtTime } from '../../core/format.js';
import { REPEAT } from '../../core/queue.js';
import { activeLineIndex } from '../../core/lrc.js';
import { trackKey } from '../../core/track.js';
import { sourceLabel } from '../../core/sourceLabel.js';

export function mount(host, ctx) {
  var state = ctx.state;
  var coverCheck = '';
  var timer = null;
  var showLyric = true;
  var lastActive = -2;
  var renderedKey = '';
  var userScrolledAt = 0;

  var coverBox = h('div', { class: 'mp-now__cover' });
  var lyricBox = h('div', { class: 'mp-now__lyric' });
  var stage = h('div', { class: 'mp-now__stage' }, [coverBox, lyricBox]);

  var nameEl = h('div', { class: 'mp-now__name', text: '未在播放' });
  var artistEl = h('div', { class: 'mp-now__artist', text: '' });
  var fromEl = h('div', { class: 'mp-now__from', text: '' });
  var curEl = h('div', { text: '00:00' });
  var durEl = h('div', { text: '00:00' });
  var trackFill = h('i');
  var trackBar = h('div', { class: 'mp-now__track' }, [trackFill]);
  var playIcon = h('span', { html: icon('play') });
  var playBtn = h('button', { class: 'mp-now__play', type: 'button', 'aria-label': '播放/暂停' }, [playIcon]);

  // 左边看播放列表，右边调播放模式
  var queueBtn = iconBtn('queue', { label: '播放列表', onClick: function () { ctx.openQueueSheet(); } });
  var modeBtn = iconBtn('repeat', { label: '播放模式', onClick: function () { ctx.openPlayModeSheet(); } });
  var prevBtn = iconBtn('prev', { label: '上一首', onClick: function () { ctx.prev(); } });
  var nextBtn = iconBtn('next', { label: '下一首', onClick: function () { ctx.next(false); } });

  var favBtn = iconBtn('heart', {
    label: '收藏',
    onClick: function () {
      if (state.player.track) ctx.toggleFavorite(state.player.track);
    }
  });

  var addBtn = iconBtn('plus', {
    label: '加入歌单',
    onClick: function () {
      if (state.player.track) ctx.openAddToPlaylist(state.player.track);
    }
  });

  var lyricToggle = iconBtn('lyric', {
    label: '歌词',
    onClick: function () {
      showLyric = !showLyric;
      sync();
    }
  });

  var moreBtn = iconBtn('more', {
    label: '更多',
    onClick: function () {
      if (state.player.track) ctx.openSongSheet(state.player.track, {});
    }
  });

  var head = h('div', { class: 'mp-now__head' }, [
    iconBtn('back', { label: '返回', onClick: function () { ctx.closeNow(); } }),
    fromEl,
    lyricToggle,
    moreBtn
  ]);

  playBtn.addEventListener('click', function () { ctx.togglePlay(); });
  trackBar.addEventListener('click', function (e) {
    var st = state.player;
    var dur = st.duration || (st.track && st.track.duration) || 0;
    if (!dur) return;
    var rect = trackBar.getBoundingClientRect();
    var ratio = rect.width ? (e.clientX - rect.left) / rect.width : 0;
    ctx.seek(Math.max(0, Math.min(1, ratio)) * dur);
    sync();
  });

  lyricBox.addEventListener('scroll', function () { userScrolledAt = Date.now(); });

  var view = h('div', { class: 'mp-now' }, [
    head,
    stage,
    h('div', { class: 'mp-now__meta' }, [nameEl, artistEl]),
    h('div', { class: 'mp-now__progress' }, [
      trackBar,
      h('div', { class: 'mp-now__times' }, [curEl, durEl])
    ]),
    h('div', { class: 'mp-now__ctrl' }, [queueBtn, prevBtn, playBtn, nextBtn, modeBtn]),
    h('div', { class: 'mp-now__extras' }, [favBtn, addBtn])
  ]);
  host.appendChild(view);

  function renderLyricList() {
    var lines = ctx.lyricLines();
    var key = state.player.track ? trackKey(state.player.track) + '|' + lines.length : 'none';
    if (key === renderedKey) return;
    renderedKey = key;
    lastActive = -2;

    clear(lyricBox);
    if (!lines.length) {
      lyricBox.appendChild(h('div', {
        class: 'mp-lyric__empty',
        text: ctx.lyricLoading() ? '歌词加载中…' : '暂无歌词'
      }));
      return;
    }

    lines.forEach(function (line) {
      var node = h('div', { class: 'mp-lyric__line', text: line.text || '♪' });
      node.addEventListener('click', function () { ctx.seek(line.time); });
      lyricBox.appendChild(node);
    });

    // 上下留白，让当前行能滚到画面中间，而不是贴在顶部
    var pad = Math.max(24, Math.round(lyricBox.clientHeight * 0.38));
    lyricBox.style.paddingTop = pad + 'px';
    lyricBox.style.paddingBottom = pad + 'px';
  }

  function syncLyric(ms) {
    if (!showLyric) return;
    var lines = ctx.lyricLines();
    if (!lines.length) return;

    var index = activeLineIndex(lines, ms);
    if (index === lastActive) return;
    lastActive = index;

    var nodes = lyricBox.children;
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('is-active', i === index);
    }

    var node = nodes[index];
    if (node && Date.now() - userScrolledAt > 2500) {
      var top = node.offsetTop - lyricBox.clientHeight / 2 + node.offsetHeight / 2;
      if (typeof lyricBox.scrollTo === 'function') {
        lyricBox.scrollTo({ top: top, behavior: 'smooth' });
      } else {
        lyricBox.scrollTop = top;
      }
    }
  }

  function sync() {
    var st = state.player;
    var track = st.track;

    if (!track) {
      nameEl.textContent = '未在播放';
      artistEl.textContent = '去搜索页找首歌吧';
      fromEl.textContent = '';
      curEl.textContent = '00:00';
      durEl.textContent = '00:00';
      trackFill.style.width = '0%';
      coverBox.style.display = '';
      lyricBox.style.display = 'none';
      return;
    }

    var coverUrl = ctx.coverOf(track);
    var check = trackKey(track) + '|' + coverUrl;
    if (check !== coverCheck) {
      coverCheck = check;
      fillCover(coverBox, coverUrl);
    }

    nameEl.textContent = track.name;
    artistEl.textContent = track.artist + (track.album ? ' · ' + track.album : '');
    fromEl.textContent = sourceLabel(track);

    var dur = st.duration || track.duration || 0;
    var cur = Math.min(st.time || 0, dur || st.time || 0);
    curEl.textContent = fmtTime(cur);
    durEl.textContent = dur ? fmtTime(dur) : '--:--';
    trackFill.style.width = (dur > 0 ? Math.min(100, (cur / dur) * 100) : 0).toFixed(2) + '%';

    playIcon.innerHTML = icon(st.status === 'playing' ? 'pause' : 'play');

    var mode = state.settings.playMode;
    modeBtn.innerHTML = icon(mode === 'one' ? 'repeatOne' : (mode === 'shuffle' ? 'shuffle' : 'repeat'));
    modeBtn.classList.toggle('is-active', true);

    var fav = state.favorites.some(function (t) { return trackKey(t) === trackKey(track); });
    favBtn.innerHTML = icon(fav ? 'heartFull' : 'heart');
    favBtn.classList.toggle('is-active', fav);


    renderLyricList();
    var hasLyric = ctx.lyricLines().length > 0;
    lyricToggle.classList.toggle('is-active', showLyric && hasLyric);
    coverBox.style.display = showLyric && hasLyric ? 'none' : '';
    lyricBox.style.display = showLyric && hasLyric ? '' : 'none';
    if (showLyric && hasLyric) syncLyric(cur);
  }

  sync();
  timer = setInterval(sync, 400);

  return {
    refresh: sync,
    destroy: function () {
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
}
