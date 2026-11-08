/**
 * 聊天里的「一起听」卡片 + 加号面板入口。
 * 只负责卡片渲染与互发卡片，不做角色决策（提示词那套后面再接）。
 */

import { h, clear } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fillCover } from '../ui/components.js';
import { ensureStyle } from '../ui/style.js';
import { normalizeSettings } from '../core/settings.js';
import { createSources } from '../services/sources.js';
import { normalizeTrack, trackKey } from '../core/track.js';
import { openListenPanel } from './listenPanel.js';
import { rememberCard } from './chatLink.js';
import { getBridge, getSnapshot } from './bridge.js';

export var MESSAGE_TYPE = 'mp-listen';
export var PENDING_KEY = 'mp:pending';

function statusText(status) {
  if (status === 'listening') return '正在一起听';
  if (status === 'ended') return '一起听已结束';
  return '邀请你一起听';
}

function openAppWithTrack(roche, track) {
  try {
    if (track && roche && roche.storage) roche.storage.set(PENDING_KEY, track);
  } catch (err) { /* 打不开就当没点 */ }
  try {
    if (roche && roche.ui && typeof roche.ui.openApp === 'function') {
      roche.ui.openApp('music-player-home');
    }
  } catch (err) { /* 忽略 */ }
}

function render(container, message, roche) {
  ensureStyle();
  var data = message.cardData || {};
  var track = normalizeTrack(data.track, 'local') || {};
  var coverUrl = data.cover || track.cover || '';

  var cover = h('div', { class: 'mp-card__cover' });
  fillCover(cover, coverUrl);

  var name = h('div', { class: 'mp-card__name', text: track.name || data.title || '一起听' });
  // 歌手名超过 6 个字就截断，避免卡片宽度被拉得忽长忽短
  var artistText = String(track.artist || '');
  if (artistText.length > 6) artistText = artistText.slice(0, 6) + '…';
  var sub = h('div', {
    class: 'mp-card__sub',
    text: [artistText, statusText(data.status)].filter(Boolean).join(' · ')
  });

  var act = h('button', { class: 'mp-card__act', type: 'button', text: data.status === 'listening' ? '打开' : '一起听' });
  act.addEventListener('click', function (e) {
    e.stopPropagation();
    try {
      if (roche && roche.chat && typeof roche.chat.dispatchCardAction === 'function') {
        roche.chat.dispatchCardAction({
          conversationId: message.conversationId,
          messageId: message.id,
          action: 'open',
          payload: { trackKey: trackKey(track) }
        });
      } else {
        openAppWithTrack(roche, track);
      }
    } catch (err) {
      openAppWithTrack(roche, track);
    }
  });

  var card = h('div', { class: 'mp-card' }, [
    cover,
    h('div', { class: 'mp-card__main' }, [name, sub]),
    act
  ]);

  clear(container);
  container.appendChild(card);
}

export function mountCard(container, message, roche) {
  render(container, message, roche);
}

export function updateCard(container, message, roche) {
  render(container, message, roche);
}

export function unmountCard() {
  /* 宿主负责移除 DOM，这里没有全局监听需要解绑 */
}

/** 点卡片时先把这首歌放起来：App 在就让它跳过去，App 不在就直接交给原生播放器 */
async function playCardTrack(track, roche) {
  if (!track) return false;

  var bridge = getBridge();
  if (bridge && bridge.ready()) {
    try {
      var res = await bridge.playKey(trackKey(track));
      if (res && res.ok) return true;
      var added = await bridge.addAndPlay([track], 0);
      return !!(added && added.ok);
    } catch (err) { /* 落到原生 */ }
  }

  var native = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins
    ? window.Capacitor.Plugins.BackgroundAudio
    : null;
  if (!native || typeof native.replaceQueue !== 'function') return false;

  try {
    var settings = normalizeSettings(roche && roche.storage ? await roche.storage.get('mp:settings', null) : null);
    var sources = createSources();
    var url = '';
    try {
      url = await sources.createResolver(track, settings)();
    } catch (err) {
      url = '';
    }
    if (!url) return false;

    await native.replaceQueue({
      tracks: [{
        id: trackKey(track),
        albumId: track.album || '',
        title: track.name || '未知歌曲',
        artist: track.artist || '',
        cover: track.cover || '',
        url: url
      }],
      startIndex: 0,
      mode: 'loop',
      autoplay: true
    });
    return true;
  } catch (err) {
    return false;
  }
}

export async function onCardAction(message, action, payload, roche) {
  if (action !== 'open') return;
  // 记住这张卡：之后切歌时把卡片上的歌名一起更新，避免卡片和播放不同步
  rememberCard(message, roche);

  // 点卡片要不要重新播放，交给设置决定（默认只显示当前状态，不打断正在听的歌）
  var settings = normalizeSettings(null);
  try {
    settings = normalizeSettings(roche && roche.storage ? await roche.storage.get('mp:settings', null) : null);
  } catch (err) { /* 用默认值 */ }

  // 卡片数据可能缺 track（只存了歌名/文案），这时从 cardData.title / modelText 里捞歌名兜底
  var cardData = (message && message.cardData) || {};
  var track = cardData.track && cardData.track.name ? normalizeTrack(cardData.track, 'local') : null;

  if (!track) {
    var fallbackName = String(cardData.title || cardData.name || '').trim();
    if (!fallbackName) {
      var m = String((message && message.modelText) || '').match(/《([^》]+)》/);
      fallbackName = m ? m[1] : '';
    }
    if (fallbackName) {
      track = normalizeTrack({ name: fallbackName, artist: String(cardData.artist || ''), source: 'local' }, 'local');
    }
  }

  if (settings.cardTapPlay && track && track.name) {
    var snap = getSnapshot();
    if (!(snap && snap.track && trackKey(snap.track) === trackKey(track))) {
      playCardTrack(track, roche).catch(function () { /* 播放失败不影响打开面板 */ });
    }
  }

  // 在聊天里弹出半屏面板（不跳 App，避免被聊天界面盖住）
  openListenPanel(message, roche);
}

/* ---------------- 加号面板：选歌 → 发卡 ---------------- */

function closeModal(modal) {
  if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
}

async function sendCard(roche, ctx, track, settings) {
  var cover = track.cover || '';

  var line = '我邀请你一起听《' + track.name + '》- ' + track.artist + '。';
  try {
    await roche.chat.createCard({
      conversationId: ctx.conversationId,
      messageType: MESSAGE_TYPE,
      isMe: true,
      cardData: {
        track: track,
        cover: cover,
        status: 'invite',
        at: Date.now()
      },
      modelText: line
    });
    if (roche.ui && roche.ui.toast) roche.ui.toast('邀请卡片已发出');
    return true;
  } catch (err) {
    if (roche.ui && roche.ui.toast) roche.ui.toast('发卡片失败：宿主版本可能不支持');
    return false;
  }
}

export async function openPlusAction(ctx, roche) {
  ensureStyle();

  if (!roche || !roche.chat || typeof roche.chat.createCard !== 'function') {
    if (roche && roche.ui && roche.ui.toast) roche.ui.toast('当前宿主不支持发卡片');
    return;
  }

  // 每次都先拿快照：宿主的 storage 在聊天侧可能读不到 App 写的数据
  var snap = getSnapshot();
  var settings = normalizeSettings((snap && snap.settings) || (await roche.storage.get('mp:settings', null)));
  var favorites = (snap && snap.favorites) || (await roche.storage.get('mp:favorites', [])) || [];
  var playlists = (snap && snap.playlists) || (await roche.storage.get('mp:playlists', [])) || [];
  var sources = createSources();

  // 当前播放 / 当前列表：App 在就用实时的，不在就用快照
  var bridge = getBridge();
  var live = bridge && bridge.ready() ? bridge.queue() : null;
  var queueTracks = live && live.length ? live.map(function (x) { return x.track; }).filter(Boolean)
    : (snap && snap.queue && snap.queue.tracks ? snap.queue.tracks.slice() : []);
  var nowPlaying = (bridge && bridge.ready() && bridge.status().playing) || (snap && snap.track) || null;

  var listBox = h('div', { class: 'mp-modal__body' });
  var tabs = h('div', { class: 'mp-listen__tabs' });
  var tab = queueTracks.length ? 'queue' : 'playlists';
  var searchTracks = [];

  var input = h('input', {
    class: 'mp-modal__input',
    type: 'text',
    inputmode: 'search',
    placeholder: '搜歌名 / 歌手，或从下面直接选'
  });

  var modal = h('div', { class: 'mp-modal' });

  function close() { closeModal(modal); }

  function rowFor(track) {
    var row = h('button', { class: 'mp-modal__row', type: 'button' }, [
      h('span', { text: track.name }),
      h('span', { class: 'mp-listen__sub', text: track.artist || '' })
    ]);
    row.addEventListener('click', async function () {
      row.disabled = true;
      var ok = await sendCard(roche, ctx, track, settings);
      // 发卡即播放：卡片发出去的同时就切到这首歌
      if (ok) {
        try {
          if (!(getSnapshot() && getSnapshot().track && trackKey(getSnapshot().track) === trackKey(track))) {
            await playCardTrack(track, roche);
          }
        } catch (err) { /* 播放失败不影响发卡 */ }
      }
      row.disabled = false;
      if (ok) close();
    });
    return row;
  }

  function renderList(tracks, emptyText) {
    clear(listBox);
    if (!tracks.length) {
      listBox.appendChild(h('div', { class: 'mp-modal__hint', text: emptyText }));
      return;
    }
    tracks.slice(0, 40).forEach(function (t) { listBox.appendChild(rowFor(t)); });
  }

  function renderTabs() {
    clear(tabs);
    [['queue', '播放列表'], ['playlists', '歌单']].forEach(function (item) {
      var btn = h('button', {
        class: 'mp-listen__tab' + (tab === item[0] ? ' is-active' : ''),
        type: 'button',
        text: item[1]
      });
      btn.addEventListener('click', function () {
        tab = item[0];
        input.value = '';
        searchTracks = [];
        renderTabs();
        renderBody();
      });
      tabs.appendChild(btn);
    });
  }

  function renderPlaylists() {
    clear(listBox);

    // 收藏固定置顶
    var favTracks = (favorites || []).map(function (t) { return normalizeTrack(t, t && t.source); }).filter(Boolean);
    var favRow = h('button', { class: 'mp-modal__row', type: 'button' }, [
      h('span', { text: '我的收藏' }),
      h('span', { class: 'mp-listen__sub', text: favTracks.length + ' 首' })
    ]);
    favRow.addEventListener('click', function () {
      renderList(favTracks, '还没有收藏');
    });
    listBox.appendChild(favRow);

    if (!playlists.length) {
      listBox.appendChild(h('div', { class: 'mp-modal__hint', text: '还没有自建歌单，收藏的歌在上面' }));
      return;
    }
    playlists.forEach(function (pl) {
      var count = (pl.tracks || []).length;
      var row = h('button', { class: 'mp-modal__row', type: 'button' }, [
        h('span', { text: pl.name }),
        h('span', { class: 'mp-listen__sub', text: count + ' 首' })
      ]);
      row.addEventListener('click', function () {
        var tracks = (pl.tracks || []).map(function (t) { return normalizeTrack(t, t && t.source); }).filter(Boolean);
        renderList(tracks, '这个歌单还是空的');
      });
      listBox.appendChild(row);
    });
  }

  function renderBody() {
    if (tab === 'playlists') { renderPlaylists(); return; }
    if (searchTracks.length) { renderList(searchTracks, ''); return; }
    renderList(queueTracks, '当前播放列表还是空的');
  }

  async function doSearch() {
    var kw = String(input.value || '').trim();
    if (!kw) { searchTracks = []; renderBody(); return; }
    clear(listBox);
    listBox.appendChild(h('div', { class: 'mp-modal__hint', text: '搜索中…' }));
    var result = await sources.search(kw, settings);
    searchTracks = result.tracks || [];
    renderList(searchTracks, '没搜到，换个关键词');
  }

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
      doSearch();
    }
  });

  var closeBtn = h('button', { class: 'mp-icon-btn', type: 'button', 'aria-label': '关闭' },
    [h('span', { html: icon('close') })]);
  closeBtn.addEventListener('click', close);

  var nowRow = null;
  if (nowPlaying) {
    var cover = h('div', { class: 'mp-listen__cover' });
    fillCover(cover, nowPlaying.cover || '');
    nowRow = h('div', { class: 'mp-listen__now' }, [
      cover,
      h('div', { class: 'mp-listen__meta' }, [
        h('div', { class: 'mp-listen__name', text: '正在播放：' + nowPlaying.name }),
        h('div', { class: 'mp-listen__artist', text: [nowPlaying.artist, queueTracks.length ? '列表 ' + queueTracks.length + ' 首' : ''].filter(Boolean).join(' · ') })
      ])
    ]);
  }

  var panel = h('div', { class: 'mp-modal__panel mp-listen' }, [
    h('div', { class: 'mp-modal__head' }, [
      h('div', { class: 'mp-modal__title', text: '一起听' }),
      closeBtn
    ]),
    nowRow,
    h('div', { class: 'mp-modal__head' }, [
      h('span', { html: icon('search'), class: 'mp-listen__searchicon' }),
      input
    ]),
    tabs,
    listBox
  ].filter(Boolean));

  modal.appendChild(panel);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) close();
  });

  document.body.appendChild(modal);
  renderTabs();
  renderBody();
  setTimeout(function () { input.focus(); }, 30);
}
