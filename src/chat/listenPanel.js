/**
 * 聊天里的「一起听」面板：点卡片后弹出的半屏抽屉，
 * 里面能看当前播放、切歌、搜索点歌，不用离开聊天（不会被聊天界面盖住）。
 */

import { h, clear } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { ensureStyle } from '../ui/style.js';
import { fillCover } from '../ui/components.js';
import { getBridge, getSnapshot } from './bridge.js';
import { createSources } from '../services/sources.js';
import { createNativeAudio } from '../services/nativeAudio.js';
import { readChatSettings } from '../services/chatSettings.js';
import { trackKey, normalizeTrack } from '../core/track.js';
import { setState as setListenState, toJSON as listenJSON } from './listenState.js';

var REFRESH_MS = 2000;

export async function openListenPanel(message, roche) {
  ensureStyle();

  // 走镜像：聊天侧直接读宿主 storage 会拿到默认设置（默认开着 QQ 源）
  var settings = await readChatSettings(roche);
  var sources = createSources();
  var native = createNativeAudio();
  var timer = null;
  var tab = 'queue';
  var searching = false;
  var lastIsPlaying = false;
  var searchTracks = [];

  var tabs = h('div', { class: 'mp-listen__tabs' });
  var coverBox = h('div', { class: 'mp-listen__cover' });
  var nameEl = h('div', { class: 'mp-listen__name', text: '还没在放歌' });
  var artistEl = h('div', { class: 'mp-listen__artist', text: '' });
  var playIcon = h('span', { html: icon('play') });
  var rows = h('div', { class: 'mp-listen__list' });
  var input = h('input', {
    class: 'mp-modal__input',
    type: 'text',
    inputmode: 'search',
    placeholder: '搜歌名 / 歌手，回车搜索'
  });

  var modal = h('div', { class: 'mp-modal' });

  function close() {
    if (timer) clearInterval(timer);
    timer = null;
    if (modal.parentNode) modal.parentNode.removeChild(modal);
  }

  /* ---------- 当前播放 ---------- */

  async function currentStatus() {
    // 先问原生播放器：它是唯一真实的播放状态，
    // bridge / 快照可能停在上一首（会显示成「面板歌名和实际播放不一致」）
    var res = await native.getStatus();
    var st = (res && res.status) || {};
    if (st.title) {
      return {
        playing: { name: st.title, artist: st.artist, cover: '' },
        isPlaying: !!st.isPlaying,
        queueSize: st.queueSize || 0
      };
    }

    var bridge = getBridge();
    if (bridge && bridge.ready()) {
      var live = bridge.status();
      if (live && live.playing) return live;
    }

    var snap = getSnapshot();
    if (snap && snap.track) {
      return {
        playing: snap.track,
        isPlaying: !!snap.isPlaying,
        queueSize: snap.queue && snap.queue.tracks ? snap.queue.tracks.length : 0
      };
    }
    return { playing: null, isPlaying: false, queueSize: 0 };
  }

  /** 队列来源：App 在就用 App 的，不在就用快照里的 */
  function queueList() {
    var bridge = getBridge();
    if (bridge && bridge.ready()) {
      var live = bridge.queue();
      if (live && live.length) return live;
    }

    var snap = getSnapshot();
    var queue = snap && snap.queue;
    if (!queue || !queue.tracks || !queue.tracks.length) return [];

    var currentKey = snap.track ? trackKey(snap.track) : '';
    return queue.tracks.slice(0, 60).map(function (track) {
      return {
        key: trackKey(track),
        name: track.name,
        artist: track.artist,
        cover: track.cover || '',
        current: currentKey && trackKey(track) === currentKey,
        track: track
      };
    });
  }

  async function refreshNow() {
    var status = await currentStatus();
    lastIsPlaying = !!(status && status.isPlaying);
    var track = status && status.playing;
    clear(coverBox);
    if (track && track.cover) fillCover(coverBox, track.cover);
    else coverBox.innerHTML = icon('music');

    nameEl.textContent = track ? track.name : '还没在放歌';
    artistEl.textContent = track ? (track.artist || '') : '搜索一首歌开始一起听';
    playIcon.innerHTML = icon(status && status.isPlaying ? 'pause' : 'play');
  }

  /* ---------- 列表 ---------- */

  function row(title, sub, onClick, active) {
    var btn = h('button', { class: 'mp-modal__row' + (active ? ' is-active' : ''), type: 'button' }, [
      h('span', { text: title }),
      sub ? h('span', { class: 'mp-listen__sub', text: sub }) : null
    ]);
    btn.addEventListener('click', function () { onClick(); });
    return btn;
  }

  async function renderQueue() {
    clear(rows);
    var list = queueList();
    if (!list.length) {
      rows.appendChild(h('div', { class: 'mp-modal__hint', text: '队列是空的，上面搜一首歌试试' }));
      return;
    }
    list.slice(0, 50).forEach(function (item) {
      rows.appendChild(row(item.name, item.artist, function () {
        var bridge = getBridge();
        if (bridge && bridge.ready()) bridge.playKey(item.key);
        else if (item.track) nativePlayList([item.track], 0);
      }, item.current));
    });
  }

  async function renderSearch() {
    clear(rows);
    if (!searchTracks.length) {
      rows.appendChild(h('div', { class: 'mp-modal__hint', text: '输入歌名或歌手，回车搜索' }));
      return;
    }
    searchTracks.forEach(function (track) {
      rows.appendChild(row(track.name, track.artist, function () {
        // 只把点的这一首加进列表，不要把整页搜索结果都塞进去
        playFrom([track], 0);
        setTab('queue');
      }));
    });
  }

  async function renderPlaylists() {
    clear(rows);

    // 优先用 App 留下的快照：宿主 storage 可能按作用域隔离，聊天侧直接读会读不到
    var snap = getSnapshot();
    var list = (snap && snap.playlists) || [];
    var favorites = (snap && snap.favorites) || [];

    if (!list.length) {
      try {
        list = (await roche.storage.get('mp:playlists', [])) || [];
      } catch (err) { list = []; }
    }
    if (!favorites.length) {
      try {
        favorites = (await roche.storage.get('mp:favorites', [])) || [];
      } catch (err) { favorites = []; }
    }

    // 收藏固定在最上面
    var favTracks = (favorites || []).map(function (t) { return normalizeTrack(t, t && t.source); }).filter(Boolean);
    rows.appendChild(row('我的收藏', favTracks.length + ' 首', function () {
      playPlaylist({ name: '我的收藏', tracks: favTracks });
    }));

    if (list && list.length) {
      list.forEach(function (pl) {
        rows.appendChild(row(pl.name + (pl.owner === 'char' ? '（TA）' : ''), (pl.tracks || []).length + ' 首', function () {
          playPlaylist(pl);
        }));
      });
    } else {
      rows.appendChild(h('div', { class: 'mp-modal__hint', text: '还没有自建歌单，收藏的歌在最上面' }));
    }
  }

  async function playPlaylist(pl) {
    var tracks = (pl.tracks || []).map(function (t) {
      return normalizeTrack(t, t && t.source);
    }).filter(Boolean).slice(0, 30);
    if (!tracks.length) {
      rows.appendChild(h('div', { class: 'mp-modal__hint', text: '这个歌单还是空的' }));
      return;
    }
    // 从歌单进入：整个歌单作为播放列表（状态栏队列也是这一个歌单）
    var bridge = getBridge();
    if (bridge && bridge.ready() && typeof bridge.playList === 'function') {
      await bridge.playList(tracks, 0);
    } else {
      await nativePlayList(tracks, 0);
    }
    await refreshNow();
    setTab('queue');
  }

  async function doSearch() {
    var keyword = String(input.value || '').trim();
    if (!keyword) {
      searchTracks = [];
      renderList();
      return;
    }
    searching = true;
    clear(rows);
    rows.appendChild(h('div', { class: 'mp-modal__hint', text: '搜索中…' }));

    var result = await sources.search(keyword, settings, { limit: 20 });
    searchTracks = result.tracks || [];
    renderList();
  }

  function renderList() {
    // 顶部输入框就是搜索，列表只在「有搜索结果」时临时让位
    if (searching && searchTracks.length) return renderSearch();
    if (tab === 'playlists') return renderPlaylists();
    return renderQueue();
  }

  function renderTabs() {
    clear(tabs);
    [['queue', '播放列表'], ['playlists', '歌单']].forEach(function (item) {
      var btn = h('button', {
        class: 'mp-listen__tab' + (tab === item[0] ? ' is-active' : ''),
        type: 'button',
        text: item[1]
      });
      btn.addEventListener('click', function () { setTab(item[0]); });
      tabs.appendChild(btn);
    });
  }

  function setTab(next) {
    tab = next;
    searching = false;
    renderTabs();
    renderList();
  }

  /* ---------- 播放 ---------- */

  async function nativePlayList(tracks, index) {
    var slice = (tracks || []).slice(index, index + 5);
    var nativeTracks = [];
    for (var i = 0; i < slice.length; i++) {
      var track = slice[i];
      try {
        var resolver = sources.createResolver(track, settings);
        var url = await resolver();
        if (!url) continue;
        nativeTracks.push({
          id: trackKey(track),
          albumId: track.album || '',
          title: track.name,
          artist: track.artist || '',
          cover: track.cover || '',
          url: url
        });
      } catch (err) { /* 跳过 */ }
    }
    if (!nativeTracks.length) return false;
    await native.replaceQueue({ tracks: nativeTracks, startIndex: 0, mode: 'loop', autoplay: true });
    return true;
  }

  async function playFrom(tracks, index) {
    var bridge = getBridge();
    if (bridge && bridge.ready()) {
      // 追加并播放，不动用户原来的列表
      if (typeof bridge.addAndPlay === 'function') {
        await bridge.addAndPlay(tracks, index);
        return;
      }
      await bridge.playList(tracks, index);
      return;
    }
    var ok = await nativePlayList(tracks, index);
    if (!ok) nameEl.textContent = '这首放不了，换一首';
  }

  async function control(action) {
    var bridge = getBridge();

    if (bridge && bridge.ready()) {
      await bridge.control(action);
      return;
    }

    if (action === 'next' || action === 'previous') {
      await native[action]();
      return;
    }
    // toggle 直接按本地记的状态切，少一次跨桥查询，点起来不卡
    if (action === 'toggle') action = lastIsPlaying ? 'pause' : 'resume';
    if (action === 'pause') await native.pause();
    else if (action === 'resume') await native.play();
  }

  /* ---------- DOM ---------- */

  var playBtn = h('button', { class: 'mp-listen__btn', type: 'button', 'aria-label': '播放/暂停' }, [playIcon]);
  playBtn.addEventListener('click', async function () {
    await control('toggle');
    await refreshNow();
  });

  var prevBtn = h('button', { class: 'mp-listen__btn', type: 'button', 'aria-label': '上一首' },
    [h('span', { html: icon('prev') })]);
  prevBtn.addEventListener('click', async function () {
    await control('previous');
    await refreshNow();
  });

  var nextBtn = h('button', { class: 'mp-listen__btn', type: 'button', 'aria-label': '下一首' },
    [h('span', { html: icon('next') })]);
  nextBtn.addEventListener('click', async function () {
    await control('next');
    await refreshNow();
  });

  var closeBtn = h('button', { class: 'mp-icon-btn', type: 'button', 'aria-label': '关闭' },
    [h('span', { html: icon('close') })]);
  closeBtn.addEventListener('click', close);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
      doSearch();
    }
  });

  var openAppBtn = h('button', { class: 'mp-listen__open', type: 'button', text: '打开音乐 App' });
  openAppBtn.addEventListener('click', function () {
    close();
    try {
      if (roche && roche.ui && typeof roche.ui.openApp === 'function') roche.ui.openApp('music-player-home');
    } catch (err) { /* 忽略 */ }
  });

  var stopBtn = h('button', { class: 'mp-listen__stop', type: 'button', text: '结束一起听' });
  stopBtn.addEventListener('click', async function () {
    var cid = message && message.conversationId;
    setListenState(cid, false);
    try {
      await roche.storage.set('mp:listen', listenJSON());
    } catch (err) { /* 忽略 */ }
    try {
      if (roche && roche.ui && typeof roche.ui.toast === 'function') {
        roche.ui.toast('已结束一起听，这个聊天里不会再自动点歌');
      }
    } catch (err) { /* 忽略 */ }
    close();
  });

  var panel = h('div', { class: 'mp-modal__panel mp-listen' }, [
    h('div', { class: 'mp-modal__head' }, [
      h('div', { class: 'mp-modal__title', text: '一起听' }),
      closeBtn
    ]),
    h('div', { class: 'mp-listen__now' }, [
      coverBox,
      h('div', { class: 'mp-listen__meta' }, [nameEl, artistEl]),
      h('div', { class: 'mp-listen__ctrl' }, [prevBtn, playBtn, nextBtn])
    ]),
    h('div', { class: 'mp-modal__head' }, [
      h('span', { html: icon('search'), class: 'mp-listen__searchicon' }),
      input
    ]),
    tabs,
    rows,
    h('div', { class: 'mp-listen__foot' }, [openAppBtn, stopBtn])
  ]);

  modal.appendChild(panel);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) close();
  });
  document.body.appendChild(modal);

  // 点卡片进来就算「进入一起听」，把之前结束过的记录清掉
  var convId = message && message.conversationId;
  if (convId) {
    setListenState(convId, true);
    try {
      await roche.storage.set('mp:listen', listenJSON());
    } catch (err) { /* 忽略 */ }
  }

  renderTabs();
  refreshNow();
  renderList();
  timer = setInterval(refreshNow, REFRESH_MS);

  return close;
}
