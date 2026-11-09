/** 外壳：页面容器 + 悬浮歌词 + 迷你播放条 + 四按钮底栏 + 弹层宿主 */

import { h, clear } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { ensureStyle, watchTheme } from '../ui/style.js';
import { openSheet, openPrompt, openEditor, fillCover } from '../ui/components.js';
import { trackKey } from '../core/track.js';
import { activeLineIndex } from '../core/lrc.js';
import { addPref, removePref, updatePref } from '../core/prefs.js';
import { TAB_ITEMS as TABS, tabOf } from '../core/routes.js';
import * as recommendView from '../ui/views/recommend.js';
import * as searchView from '../ui/views/search.js';
import * as playlistsView from '../ui/views/playlists.js';
import * as playlistDetailView from '../ui/views/playlistDetail.js';
import * as favoritesView from '../ui/views/favorites.js';
import * as settingsView from '../ui/views/settings.js';
import * as nowView from '../ui/views/now.js';



export function createShell(container, ctx) {
  ensureStyle();

  var root = h('div', { class: 'mp-root' });
  var viewHost = h('div', { class: 'mp-view-host' });

  var coverBox = h('div', { class: 'mp-player__cover' });
  var nameEl = h('div', { class: 'mp-player__name' });
  var subEl = h('div', { class: 'mp-player__sub' });
  var playIcon = h('span', { html: icon('play') });
  var playBtn = h('button', { class: 'mp-player__play', type: 'button', 'aria-label': '播放/暂停' }, [playIcon]);
  var barFill = h('i');
  var bar = h('div', { class: 'mp-player__bar' }, [barFill]);

  var mainBtn = h('button', { class: 'mp-player__main mp-player__hit', type: 'button' }, [nameEl, subEl]);
  var playerEl = h('div', { class: 'mp-player' }, [bar, coverBox, mainBtn, playBtn]);

  var floatLyric = h('div', { class: 'mp-float-lyric' });
  var dockEl = h('nav', { class: 'mp-dock' });

  root.appendChild(viewHost);
  root.appendChild(floatLyric);
  root.appendChild(playerEl);
  root.appendChild(dockEl);
  container.replaceChildren(root);

  var disposeTheme = null;
  var page = null;
  var playerCoverKey = '';
  var lastLyricText = '';

  function isNow() {
    return ctx.state.route === 'now';
  }

  function activeTab() {
    return tabOf(ctx.state.route);
  }

  /* ---------- 外观 ---------- */

  function hexToRgba(hex, alpha) {
    var text = String(hex || '').replace('#', '');
    if (text.length !== 6) return 'rgba(0,0,0,' + alpha + ')';
    var r = parseInt(text.slice(0, 2), 16);
    var g = parseInt(text.slice(2, 4), 16);
    var b = parseInt(text.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  var HAND_FALLBACK = '"STKaiti","KaiTi","Kaiti SC","楷体","Songti SC",cursive';
  var loadedFontUrl = '';

  /** 自定义手写字体：填了 URL 就动态加载，失败静默回退系统楷体 */
  function applyHandFont(url) {
    if (!url) {
      if (loadedFontUrl) {
        // 只影响评论正文，不动签名/标题用的内置花体
        root.style.removeProperty('--mp-hand-custom');
        loadedFontUrl = '';
      }
      return;
    }
    if (url === loadedFontUrl) return;
    loadedFontUrl = url;

    try {
      if (typeof FontFace === 'undefined' || !document.fonts) return;
      var face = new FontFace('mpHandCustom', 'url(' + JSON.stringify(url) + ')');
      face.load().then(function (f) {
        try { document.fonts.add(f); } catch (err) { /* 忽略 */ }
        root.style.setProperty('--mp-hand-custom', '"mpHandCustom", ' + HAND_FALLBACK);
      }).catch(function () {
        loadedFontUrl = '';
      });
    } catch (err) {
      loadedFontUrl = '';
    }
  }

  function applyAppearance() {
    var s = ctx.state.settings;
    root.dataset.accent = s.accent || 'red';
    // 界面风格：mag / classic，样式全部挂在 data-ui 上，切主题不用重建页面
    root.dataset.ui = s.uiTheme === 'classic' ? 'classic' : 'mag';
    applyHandFont(s.taFontUrl || '');
    // 自定义主色调：只要选了颜色就覆盖 CSS 变量（优先级高于预设色板）
    if (s.accentColor) {
      root.style.setProperty('--mp-accent', s.accentColor);
      root.style.setProperty('--mp-accent-soft', hexToRgba(s.accentColor, 0.16));
    } else {
      root.style.removeProperty('--mp-accent');
      root.style.removeProperty('--mp-accent-soft');
    }
    if (disposeTheme) {
      disposeTheme();
      disposeTheme = null;
    }
    if (s.theme === 'auto') {
      disposeTheme = watchTheme(root);
    } else {
      root.dataset.theme = s.theme === 'dark' ? 'dark' : 'light';
    }
  }

  /* ---------- 键盘 ---------- */

  function keyboardOpen() {
    var shrunk = false;
    if (typeof window !== 'undefined' && window.visualViewport && window.innerHeight) {
      shrunk = (window.innerHeight - window.visualViewport.height) > 120;
    }
    var focused = false;
    try {
      var active = document.activeElement;
      focused = !!(active && root.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA'));
    } catch (err) { /* 忽略 */ }
    return shrunk || focused;
  }

  function syncKeyboard() {
    root.classList.toggle('is-keyboard', keyboardOpen());
  }

  function onViewportChange() { syncKeyboard(); }
  function onFocusIn() { setTimeout(syncKeyboard, 60); }
  function onFocusOut() { setTimeout(syncKeyboard, 120); }

  window.addEventListener('resize', onViewportChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewportChange);
    window.visualViewport.addEventListener('scroll', onViewportChange);
  }
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('focusout', onFocusOut);
  // 有些 WebView 不派发 focusin/focusout，再兜一个低频轮询，成本可以忽略
  var keyboardTimer = setInterval(syncKeyboard, 300);

  /* ---------- 底栏 ---------- */

  function renderDock() {
    clear(dockEl);
    dockEl.style.display = isNow() ? 'none' : 'flex';
    var active = activeTab();
    TABS.forEach(function (tab) {
      var btn = h('button', {
        class: 'mp-dock__btn' + (tab.id === active ? ' is-active' : ''),
        type: 'button'
      }, [
        h('span', { html: icon(tab.icon) }),
        h('span', { text: tab.name })
      ]);
      btn.addEventListener('click', function () {
        if (ctx.state.route !== tab.id) ctx.goto(tab.id);
      });
      dockEl.appendChild(btn);
    });
  }

  /* ---------- 悬浮歌词 ---------- */

  function renderFloatLyric() {
    var st = ctx.state.player;
    var s = ctx.state.settings;
    var lines = ctx.lyricLines();
    // 悬浮歌词已下线（宿主不允许在其他页面画自定义内容），这里恒不显示
    var visible = false;

    if (!visible) {
      floatLyric.style.display = 'none';
      return;
    }

    var index = activeLineIndex(lines, st.time);
    var text = index >= 0 ? lines[index].text : '';
    floatLyric.style.display = text ? 'block' : 'none';
    if (text && text !== lastLyricText) {
      lastLyricText = text;
      clear(floatLyric);
      floatLyric.appendChild(document.createTextNode(text));
      floatLyric.classList.remove('is-fresh');
      /* 触发一次淡入动画 */
      void floatLyric.offsetWidth;
      floatLyric.classList.add('is-fresh');
    }
  }

  /* ---------- 播放条 ---------- */

  function renderPlayer() {
    var st = ctx.state.player;
    if (!st.track || isNow()) {
      playerEl.style.display = 'none';
      renderFloatLyric();
      return;
    }
    playerEl.style.display = 'flex';

    var coverUrl = ctx.coverOf(st.track);
    var key = trackKey(st.track) + '|' + coverUrl;
    if (key !== playerCoverKey) {
      playerCoverKey = key;
      fillCover(coverBox, coverUrl);
    }

    nameEl.textContent = st.track.name;
    var tail = '';
    if (st.status === 'loading') tail = ' · 加载中…';
    else if (st.status === 'error') tail = ' · ' + (st.error || '播放失败');
    subEl.textContent = st.track.artist + tail;
    playIcon.innerHTML = icon(st.status === 'playing' ? 'pause' : 'play');

    var dur = st.duration || st.track.duration || 0;
    var pct = dur > 0 ? Math.min(100, (st.time / dur) * 100) : 0;
    barFill.style.width = pct.toFixed(2) + '%';

    renderFloatLyric();
  }

  /* ---------- 页面 ---------- */

  function renderView() {
    if (page && page.destroy) {
      try { page.destroy(); } catch (err) { /* 忽略 */ }
    }
    page = null;
    clear(viewHost);

    var route = ctx.state.route;
    if (route === 'recommend') page = recommendView.mount(viewHost, ctx);
    else if (route === 'search') page = searchView.mount(viewHost, ctx);
    else if (route === 'playlists') page = playlistsView.mount(viewHost, ctx);
    else if (route === 'playlist') page = playlistDetailView.mount(viewHost, ctx);
    else if (route === 'favorites') page = favoritesView.mount(viewHost, ctx);
    else if (route === 'settings') page = settingsView.mount(viewHost, ctx);
    else if (route === 'now') page = nowView.mount(viewHost, ctx);
  }

  function renderAll() {
    applyAppearance();
    renderDock();
    renderView();
    renderPlayer();
    syncKeyboard();
  }

  function refreshPage() {
    if (page && typeof page.refresh === 'function') {
      try { page.refresh(); } catch (err) { /* 视图刷新失败不影响播放 */ }
    }
  }

  function applyCover(key, url) {
    var nodes = root.querySelectorAll('[data-cover="' + key + '"]');
    for (var i = 0; i < nodes.length; i++) fillCover(nodes[i], url);
    if (ctx.state.player.track && trackKey(ctx.state.player.track) === key) {
      playerCoverKey = '';
      renderPlayer();
    }
  }

  mainBtn.addEventListener('click', function () { ctx.openNow(); });
  playBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    ctx.togglePlay();
  });
  bar.addEventListener('click', function (e) {
    var dur = ctx.state.player.duration || (ctx.state.player.track && ctx.state.player.track.duration) || 0;
    if (!dur) return;
    var rect = bar.getBoundingClientRect();
    var ratio = rect.width ? (e.clientX - rect.left) / rect.width : 0;
    ctx.seek(Math.max(0, Math.min(1, ratio)) * dur);
  });

  /* ---------- 推荐偏好面板 ---------- */

  function openPrefsPanel() {
    if (!ctx.prefs || !ctx.savePrefs) return;

    var mask = h('div', { class: 'mp-mask' });
    var body = h('div', { class: 'mp-sheet__body mp-prefs' });

    function close() {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
    }

    function renderPanel() {
      clear(body);

      // 推荐模式
      var mode = (ctx.state.settings && ctx.state.settings.recMode) || 'manual';
      var modeRow = h('div', { class: 'mp-theme-row mp-prefs__modes' });
      [
        { id: 'manual', name: '换一批才调' },
        { id: 'auto', name: '每次进入调' },
        { id: 'local', name: '不调模型' }
      ].forEach(function (item) {
        var btn = h('button', {
          class: 'mp-theme-btn' + (mode === item.id ? ' is-active' : ''),
          type: 'button',
          text: item.name
        });
        btn.addEventListener('click', function () {
          ctx.updateSettings({ recMode: item.id });
          renderPanel();
        });
        modeRow.appendChild(btn);
      });
      body.appendChild(h('div', { class: 'mp-prefs__head' }, [
        h('div', { class: 'mp-prefs__title', text: '推荐模式' }),
        modeRow
      ]));

      // 每次推荐多少首
      var countValue = (ctx.state.settings && ctx.state.settings.recCount) || 20;
      var countText = h('span', { class: 'mp-prefs__weight', text: countValue + ' 首' });
      var countSlider = h('input', {
        class: 'mp-prefs__slider',
        type: 'range',
        min: '5',
        max: '50',
        step: '1',
        value: String(countValue)
      });
      countSlider.addEventListener('input', function () {
        countText.textContent = countSlider.value + ' 首';
      });
      countSlider.addEventListener('change', function () {
        ctx.updateSettings({ recCount: Number(countSlider.value) });
        renderPanel();
      });
      body.appendChild(h('div', { class: 'mp-prefs__item' }, [
        h('div', { class: 'mp-prefs__row' }, [
          h('div', { class: 'mp-prefs__label', text: '每次推荐多少首' }),
          countText
        ]),
        countSlider
      ]));

      // 只推荐能播放的
      var onlyPlayOn = !(ctx.state.settings && ctx.state.settings.recFilterPlayable === false);
      var onlyPlay = h('button', {
        class: 'mp-switch' + (onlyPlayOn ? ' is-on' : ''),
        type: 'button',
        'aria-pressed': onlyPlayOn ? 'true' : 'false'
      });
      onlyPlay.addEventListener('click', function () {
        var next = ctx.state.settings && ctx.state.settings.recFilterPlayable === false;
        ctx.updateSettings({ recFilterPlayable: next });
        renderPanel();
      });
      body.appendChild(h('div', { class: 'mp-prefs__item' }, [
        h('div', { class: 'mp-prefs__row' }, [
          h('div', { class: 'mp-prefs__label', text: '只推荐能播放的' }),
          h('span', { class: 'mp-prefs__tag', text: onlyPlayOn ? '开' : '关' })
        ]),
        h('div', { class: 'mp-prefs__foot' }, [
          h('div', { class: 'mp-prefs__prompt', text: '关闭后推荐更快，但列表里可能有无版权的歌' }),
          onlyPlay
        ])
      ]));

      // 偏好列表
      var list = ctx.prefs();
      body.appendChild(h('div', { class: 'mp-prefs__hint', text: '拖动条表示这类偏好的重要程度，越靠右越影响推荐' }));

      list.forEach(function (pref) {
        var weightText = h('span', { class: 'mp-prefs__weight', text: pref.weight + '%' });

        var slider = h('input', {
          class: 'mp-prefs__slider',
          type: 'range',
          min: '0',
          max: '100',
          step: '5',
          value: String(pref.weight)
        });
        slider.addEventListener('input', function () {
          weightText.textContent = slider.value + '%';
        });
        slider.addEventListener('change', function () {
          ctx.savePrefs(updatePref(ctx.prefs(), pref.id, { weight: Number(slider.value) }));
          renderPanel();
        });

        var editBtn = h('button', { class: 'mp-prefs__edit', type: 'button', text: pref.prompt ? '改提示词' : '写提示词' });
        editBtn.addEventListener('click', function () {
          // 注意：openPrompt 的第一个参数是根元素，漏传会直接抛错（上一版点了没反应）
          openPrompt(root, {
            title: pref.label + ' · 提示词',
            value: pref.prompt || '',
            placeholder: '例如：偏华语流行、独立民谣',
            onSubmit: function (text) {
              ctx.savePrefs(updatePref(ctx.prefs(), pref.id, { prompt: text }));
              renderPanel();
            }
          });
        });

        var row = h('div', { class: 'mp-prefs__item' }, [
          h('div', { class: 'mp-prefs__row' }, [
            h('div', { class: 'mp-prefs__label', text: pref.label }),
            weightText,
            pref.builtin ? h('span', { class: 'mp-prefs__tag', text: '内置' }) : null
          ]),
          slider,
          h('div', { class: 'mp-prefs__foot' }, [
            h('div', { class: 'mp-prefs__prompt', text: pref.prompt || '（还没有提示词）' }),
            editBtn,
            pref.builtin ? null : (function () {
              var del = h('button', { class: 'mp-prefs__del', type: 'button', text: '删除' });
              del.addEventListener('click', function () {
                var res = removePref(ctx.prefs(), pref.id);
                if (!res.removed) {
                  ctx.toast(res.reason === 'builtin' ? '内置偏好不能删' : '至少保留一条偏好');
                  return;
                }
                ctx.savePrefs(res.list);
                renderPanel();
              });
              return del;
            })()
          ].filter(Boolean))
        ]);
        body.appendChild(row);
      });

      var addBtn = h('button', { class: 'mp-prefs__add', type: 'button', text: '＋ 新增偏好' });
      addBtn.addEventListener('click', function () {
        openPrompt(root, {
          title: '新增偏好',
          value: '',
          placeholder: '例如：通勤路上 / 健身房',
          onSubmit: function (label) {
            var res = addPref(ctx.prefs(), label, '');
            if (!res.pref) {
              ctx.toast('偏好数量已达上限');
              return;
            }
            ctx.savePrefs(res.list);
            renderPanel();
          }
        });
      });
      body.appendChild(addBtn);
    }

    var sheet = h('div', { class: 'mp-sheet mp-prefs__sheet' }, [
      h('div', { class: 'mp-sheet__head' }, [
        h('div', { class: 'mp-sheet__title', text: '推荐偏好' }),
        (function () {
          var btn = h('button', { class: 'mp-icon-btn', type: 'button', 'aria-label': '关闭' },
            [h('span', { html: icon('close') })]);
          btn.addEventListener('click', close);
          return btn;
        })()
      ]),
      body
    ]);

    mask.addEventListener('click', function (e) {
      if (e.target === mask) close();
    });
    mask.appendChild(sheet);
    root.appendChild(mask);
    renderPanel();
  }

  applyAppearance();
  renderAll();

  return {
    root: root,
    mount: function () { renderAll(); },
    renderAll: renderAll,
    renderDock: renderDock,
    renderPlayer: renderPlayer,
    renderView: renderView,
    refreshPage: refreshPage,
    applyAppearance: applyAppearance,
    applyCover: applyCover,
    openPrefsPanel: function () { openPrefsPanel(); },
    openSheet: function (options) { return openSheet(root, options); },
    openPrompt: function (options) { return openPrompt(root, options); },
    openEditor: function (options) { return openEditor(root, options); },
    destroy: function () {
      if (page && page.destroy) {
        try { page.destroy(); } catch (err) { /* 忽略 */ }
      }
      page = null;
      if (disposeTheme) {
        disposeTheme();
        disposeTheme = null;
      }
      window.removeEventListener('resize', onViewportChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', onViewportChange);
        window.visualViewport.removeEventListener('scroll', onViewportChange);
      }
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      if (keyboardTimer) clearInterval(keyboardTimer);
      keyboardTimer = null;
      playerCoverKey = '';
      lastLyricText = '';
    }
  };
}
