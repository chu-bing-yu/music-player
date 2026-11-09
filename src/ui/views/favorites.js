/**
 * 第三个底栏页：TA 的音乐主页。
 * 背景图 + 手写体 + 乐评卡（封面 + 唱片 + 专辑行 + 引号评价 + 签名水印）。
 */

import { h, clear } from '../dom.js';
import { pageTitle, iconBtn, fillCover, emptyHint } from '../components.js';
import { trackKey } from '../../core/track.js';
import { fmtSummary } from '../../core/format.js';
import { playlistDuration } from '../../core/playlist.js';
import { loadBgs, saveBg, clearBg, compressImage } from '../../services/taBg.js';

var CHAR_KEY = 'mp:taChar';
var PETAL_COUNT = 12;

/** 支持 **加粗** 的高亮：把 **xx** 渲染成 <b>xx</b> */
function richText(text) {
  var parts = String(text || '').split(/(\*\*[^*]+\*\*)/g);
  return parts.map(function (seg) {
    if (seg.length > 4 && seg.indexOf('**') === 0 && seg.lastIndexOf('**') === seg.length - 2) {
      return h('b', { text: seg.slice(2, -2) });
    }
    return document.createTextNode(seg);
  });
}

function readSavedChar() {
  try {
    return localStorage.getItem(CHAR_KEY) || '';
  } catch (err) {
    return '';
  }
}

function saveChar(id) {
  try {
    localStorage.setItem(CHAR_KEY, id || '');
  } catch (err) { /* 忽略 */ }
  try {
    var api = typeof window !== 'undefined' ? window.Roche : null;
    if (api && api.storage && typeof api.storage.set === 'function') {
      api.storage.set(CHAR_KEY, id || '');
    }
  } catch (err) { /* 忽略 */ }
}

export function mount(host, ctx) {
  var state = ctx.state;
  var currentChar = readSavedChar(); // 空 = 全部角色
  var profiles = Object.create(null);
  var bgs = Object.create(null);
  var compressBusy = false;

  /* ---------------- 角色资料 ---------------- */

  function loadCharacters() {
    var api = typeof window !== 'undefined' && window.Roche ? window.Roche : null;
    if (!api || !api.character || typeof api.character.list !== 'function') return Promise.resolve();

    return Promise.resolve(api.character.list()).then(function (list) {
      (list || []).forEach(function (c) {
        if (!c) return;
        var info = {
          name: c.handle || c.name || c.displayName || '',
          handle: c.handle || '',
          avatar: c.avatar || ''
        };
        [c.id, c.contactId, c.conversationId].forEach(function (key) {
          if (key) profiles[String(key)] = info;
        });
      });
    }).catch(function () { /* 用占位 */ });
  }

  function profileOf(id) {
    return (id && profiles[String(id)]) || null;
  }

  function nameOf(id) {
    var p = profileOf(id);
    if (p && p.name) return p.name;
    // 没拿到角色 ID 时统一归到 ta 组，显示「TA」而不是「角色」
    if (String(id) === 'ta') return 'TA';
    return '角色';
  }

  var signMap = Object.create(null); // 角色 ID → 该角色的英文签名

  async function loadSigns() {
    try {
      var api = typeof window !== 'undefined' ? window.Roche : null;
      var raw = api && api.storage ? await api.storage.get('mp:taSign') : null;
      signMap = raw && typeof raw === 'object' ? raw : Object.create(null);
    } catch (err) {
      signMap = Object.create(null);
    }
  }

  /**
   * 签名与角色绑定：英文 handle 优先（花体只对英文好看），
   * 其次该角色自己填的签名；都没有就不渲染。
   */
  function signOf(id) {
    var p = profileOf(id);
    var handle = p && p.handle ? String(p.handle).trim() : '';
    if (handle && /^[A-Za-z0-9 ._\-]+$/.test(handle)) return handle;
    return String(signMap[String(id)] || '').trim();
  }

  function avatarOf(id) {
    var p = profileOf(id);
    return p ? p.avatar : '';
  }

  /* ---------------- 数据 ---------------- */

  function mirrorOf(key) {
    try {
      return JSON.parse(localStorage.getItem('mp:mirror:' + key) || 'null');
    } catch (err) {
      return null;
    }
  }

  function allPlaylists() {
    var fromState = state.playlists || [];
    var mirror = mirrorOf('mp:playlists');
    if (!Array.isArray(mirror) || !mirror.length) return fromState;

    var byId = Object.create(null);
    fromState.forEach(function (p) { if (p && p.id) byId[p.id] = p; });
    mirror.forEach(function (p) { if (p && p.id) byId[p.id] = p; });
    return Object.keys(byId).map(function (id) { return byId[id]; });
  }

  function charPlaylistsAll() {
    return allPlaylists().filter(function (p) { return p && p.owner === 'char'; });
  }

  function allComments() {
    return ctx.taComments ? ctx.taComments('') : [];
  }

  /**
   * 分组用的角色 ID：空值统一归到 'ta'。
   * 宿主没把角色 ID 传给插件时，歌单 ownerId 和评论的 characterId 都会是空，
   * 以前这里直接把空值过滤掉 → 整页空白（评论明明存进去了也看不到）。
   */
  function groupIdOf(id) {
    var s = String(id == null ? '' : id).trim();
    return s || 'ta';
  }

  function charIds() {
    var seen = Object.create(null);
    var out = [];
    charPlaylistsAll().forEach(function (p) {
      var id = groupIdOf(p.ownerId);
      if (!seen[id]) { seen[id] = true; out.push(id); }
    });
    allComments().forEach(function (c) {
      var id = groupIdOf(c.characterId);
      if (!seen[id]) { seen[id] = true; out.push(id); }
    });
    return out;
  }

  /* ---------------- 结构 ---------------- */

  var bgLayer = h('div', { class: 'mp-ta-bg' });

  var heroTitle = h('div', { class: 'mp-ta-hero__title', text: 'TA 的歌单' });
  heroTitle.addEventListener('click', function () { ctx.exitOrMinimize(); });

  // 中文标题去掉，只保留左上的英文 Playlist（小号、低对比，不占高度）
  var menuBtn = iconBtn('more', { label: '更多', onClick: function () { openMenu(); } });
  menuBtn.classList.add('mp-ta-menu');

  var headline = h('div', { class: 'mp-ta-headline', text: 'Playlist' });

  var petals = null;
  var body = h('div', { class: 'mp-ta-body' });
  var view = h('div', { class: 'mp-view mp-ta' }, [bgLayer, headline, menuBtn, body]);
  host.appendChild(view);

  /* ---------------- 背景 ---------------- */

  function applyBg() {
    var id = currentChar;
    var bg = id ? bgs[id] : null;

    if (!bg && !id) {
      // 「全部角色」时用第一个设过背景的角色
      var first = Object.keys(bgs)[0];
      if (first) bg = bgs[first];
    }

    if (bg && bg.value) {
      bgLayer.style.backgroundImage = 'url(' + JSON.stringify(bg.value) + ')';
      bgLayer.classList.add('has-bg');
    } else {
      bgLayer.style.backgroundImage = '';
      bgLayer.classList.remove('has-bg');
    }
  }

  async function reloadBgs() {
    try {
      bgs = await loadBgs(window.Roche || null);
    } catch (err) {
      bgs = Object.create(null);
    }
    applyBg();
  }

  /* ---------------- 交互 ---------------- */

  function openCharPicker() {
    var items = [{
      label: '全部角色',
      icon: 'check',
      hint: currentChar ? '' : '当前',
      onClick: function () { currentChar = ''; saveChar(''); renderAll(); }
    }];

    charIds().forEach(function (id) {
      items.push({
        label: nameOf(id),
        icon: currentChar === id ? 'check' : 'music',
        hint: currentChar === id ? '当前' : '',
        onClick: function () { currentChar = id; saveChar(id); renderAll(); }
      });
    });

    ctx.openSheet({ title: '切换角色', items: items });
  }

  function openMenu() {
    var items = [];

    items.push({
      label: '切换角色',
      icon: 'music',
      hint: currentChar ? nameOf(currentChar) : '全部',
      onClick: function () { openCharPicker(); }
    });

    items.push({
      label: '本角色签名',
      icon: 'more',
      hint: signOf(currentChar) || '未设置',
      onClick: function () {
        var target = currentChar || charIds()[0] || '';
        if (!target) {
          if (ctx.toast) ctx.toast('先让 TA 有一个歌单或评论');
          return;
        }
        ctx.openPrompt({
          title: '本角色签名（英文）',
          value: String(signMap[target] || ''),
          placeholder: '例如 nori / arthur',
          onSubmit: async function (text) {
            signMap[target] = String(text || '').trim().slice(0, 16);
            try {
              var api = typeof window !== 'undefined' ? window.Roche : null;
              if (api && api.storage) await api.storage.set('mp:taSign', signMap);
            } catch (err) { /* 忽略 */ }
            renderAll();
          }
        });
      }
    });

    items.push({
      label: compressBusy ? '正在压缩…' : '从相册换背景',
      icon: 'plus',
      onClick: function () { pickFile(); }
    });

    items.push({
      label: '填图片链接',
      icon: 'more',
      onClick: function () {
        ctx.openPrompt({
          title: '背景图片链接',
          value: (currentChar && bgs[currentChar] && bgs[currentChar].type === 'url') ? bgs[currentChar].value : '',
          placeholder: 'https://… 图片地址',
          onSubmit: async function (text) {
            var url = String(text || '').trim();
            if (!/^https?:\/\//i.test(url)) {
              if (ctx.toast) ctx.toast('请填 http(s) 开头的图片地址');
              return;
            }
            var target = currentChar || charIds()[0] || '';
            if (!target) {
              if (ctx.toast) ctx.toast('先让 TA 有一个歌单或评论');
              return;
            }
            await saveBg(window.Roche || null, target, { type: 'url', value: url, at: Date.now() });
            await reloadBgs();
            if (ctx.toast) ctx.toast('背景已更新');
          }
        });
      }
    });

    // 三个明确选项，点哪个就是哪个，当前项打勾
    [
      { id: 'snow', name: '动效 · 下雪' },
      { id: 'petal', name: '动效 · 花瓣' },
      { id: 'none', name: '动效 · 关闭' }
    ].forEach(function (opt) {
      items.push({
        label: opt.name,
        icon: motionType() === opt.id ? 'check' : 'more',
        hint: motionType() === opt.id ? '当前' : '',
        onClick: function () { setMotion(opt.id); }
      });
    });

    if (currentChar && bgs[currentChar]) {
      items.push({
        label: '清除当前角色背景',
        icon: 'close',
        danger: true,
        onClick: async function () {
          await clearBg(window.Roche || null, currentChar);
          await reloadBgs();
          if (ctx.toast) ctx.toast('已恢复默认背景');
        }
      });
    }

    ctx.openSheet({ title: 'TA 页外观', items: items });
  }

  function pickFile() {
    if (compressBusy) return;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', async function () {
      var file = input.files && input.files[0];
      try { document.body.removeChild(input); } catch (err) { /* 忽略 */ }
      if (!file) return;

      var target = currentChar || charIds()[0] || '';
      if (!target) {
        if (ctx.toast) ctx.toast('先让 TA 有一个歌单或评论');
        return;
      }

      compressBusy = true;
      if (ctx.toast) ctx.toast('正在压缩图片…');
      var res = await compressImage(file);
      compressBusy = false;

      if (!res.ok) {
        if (ctx.toast) ctx.toast(res.reason || '图片处理失败');
        return;
      }

      var saved = await saveBg(window.Roche || null, target, { type: 'data', value: res.dataUrl, at: Date.now() });
      if (!saved.ok) {
        if (ctx.toast) ctx.toast(saved.reason || '保存失败');
        return;
      }

      await reloadBgs();
      if (ctx.toast) ctx.toast('背景已更新');
    });

    input.click();
  }

  /* ---------------- 渲染 ---------------- */

  // updateSettings 是异步的，回读 state 会拿到旧值，所以本地记一份立即生效
  var motionCache = '';

  /** 动效类型：none / petal / snow（兼容旧的布尔值） */
  function motionType() {
    if (motionCache) return motionCache;
    var v = state.settings.taMotion;
    if (v === 'none' || v === 'petal' || v === 'snow') return v;
    return v === false ? 'none' : 'snow';
  }

  function setMotion(type) {
    motionCache = type;
    ctx.updateSettings({ taMotion: type });
    renderPetals(type);
  }

  function renderPetals(type) {
    if (petals && petals.parentNode) petals.parentNode.removeChild(petals);
    petals = null;

    var t = type || motionType();
    if (t === 'none') return;

    petals = h('div', { class: 'mp-ta-petals' + (t === 'snow' ? ' is-snow' : '') });
    var count = t === 'snow' ? 28 : 18;
    for (var i = 0; i < count; i++) {
      petals.appendChild(h('span', { class: 'mp-ta-petal' }));
    }
    view.insertBefore(petals, body);
  }

  function playlistCard(p) {
    var first = (p.tracks || [])[0];
    var cover = h('div', { class: 'mp-ta-pl__cover' });
    fillCover(cover, first ? ctx.coverOf(first) : '');

    var card = h('button', { class: 'mp-ta-pl', type: 'button' }, [
      cover,
      h('div', { class: 'mp-ta-pl__name', text: p.name }),
      h('div', { class: 'mp-ta-pl__sub', text: fmtSummary((p.tracks || []).length, playlistDuration(p)) })
    ]);
    card.addEventListener('click', function () {
      ctx.goto('playlist', { playlistId: p.id });
    });
    return card;
  }

  /** 评论行左滑露出删除（触摸设备），桌面用鼠标拖也行 */
  function attachSwipe(row, inner) {
    var OPEN = -72;
    var startX = 0;
    var startY = 0;
    var dx = 0;
    var open = false;
    var tracking = false;

    function begin(x, y) {
      startX = x;
      startY = y;
      dx = open ? OPEN : 0;
      tracking = true;
      inner.style.transition = 'none';
    }

    function move(x, y) {
      if (!tracking) return;
      var mx = x - startX;
      var my = y - startY;
      if (Math.abs(my) > Math.abs(mx) && Math.abs(my) > 8) return; // 竖滑交给页面滚动
      dx = Math.max(OPEN, Math.min(0, (open ? OPEN : 0) + mx));
      inner.style.transform = 'translateX(' + dx + 'px)';
      row.classList.toggle('is-open', dx < -36);
    }

    function end() {
      if (!tracking) return;
      tracking = false;
      open = dx < -36;
      inner.style.transition = 'transform .18s ease';
      inner.style.transform = open ? 'translateX(' + OPEN + 'px)' : 'translateX(0)';
      row.classList.toggle('is-open', open);
    }

    inner.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      if (t) begin(t.clientX, t.clientY);
    }, { passive: true });
    inner.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      if (t) move(t.clientX, t.clientY);
    }, { passive: true });
    inner.addEventListener('touchend', end);

    // 桌面端没有左右滑动的手感，用长按 500ms 展开删除，避免在 window 上挂一堆监听
    var holdTimer = null;
    inner.addEventListener('mousedown', function () {
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = setTimeout(function () {
        open = true;
        inner.style.transition = 'transform .18s ease';
        inner.style.transform = 'translateX(' + OPEN + 'px)';
        row.classList.add('is-open');
      }, 500);
    });
    inner.addEventListener('mouseup', function () {
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
    });
    inner.addEventListener('mouseleave', function () {
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
    });
  }

  function reviewCard(item) {
    var cover = h('div', { class: 'mp-ta-review__cover' });

    if (item.cover) {
      fillCover(cover, item.cover);
    } else if (ctx.resolveCommentCover) {
      // 评价值里没有封面：先骨架，再联网补一张（补到就原地替换，不整页重渲）
      cover.classList.add('is-loading');
      ctx.resolveCommentCover(item).then(function (url) {
        cover.classList.remove('is-loading');
        if (url) fillCover(cover, url);
      }).catch(function () {
        cover.classList.remove('is-loading');
      });
    }

    var art = h('button', { class: 'mp-ta-review__art', type: 'button', 'aria-label': '播放这首' }, [cover]);
    art.addEventListener('click', function (e) {
      e.stopPropagation();
      if (ctx.playComment) ctx.playComment(item);
    });

    var main = h('div', { class: 'mp-ta-review__main' }, [
      h('div', { class: 'mp-ta-review__meta' }, [
        h('span', { class: 'mp-ta-review__dot' }),
        h('span', { text: (item.album || item.artist || '未知歌手') })
      ]),
      h('div', { class: 'mp-ta-review__name', text: item.name || '未知歌曲' }),
      h('div', { class: 'mp-ta-review__text' }, richText('“' + (item.text || '') + '”'))
    ]);
    main.addEventListener('click', function () {
      if (ctx.playComment) ctx.playComment(item);
    });

    var signText = signOf(item.characterId);
    var sign = signText ? h('div', { class: 'mp-ta-review__sign', text: signText }) : null;

    var inner = h('div', { class: 'mp-ta-review__inner' }, [art, main, sign].filter(Boolean));

    var del = h('button', { class: 'mp-ta-review__del', type: 'button', text: '删除' });
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!ctx.deleteTaComment) return;
      ctx.deleteTaComment(item).then(function (res) {
        if (res && res.ok) {
          if (ctx.toast) ctx.toast('已删除');
          renderAll();
        } else if (ctx.toast) {
          ctx.toast((res && res.reason) || '删除失败');
        }
      });
    });

    var row = h('div', { class: 'mp-ta-review' }, [inner, del]);
    attachSwipe(row, inner);
    return row;
  }

  function charBlock(id, playlists, comments) {
    var name = nameOf(id);
    var trackCount = playlists.reduce(function (sum, p) { return sum + ((p.tracks || []).length); }, 0);

    var avatar = h('div', { class: 'mp-ta-head__avatar' });
    var url = avatarOf(id);
    if (url) {
      var img = h('img', { src: url, alt: '' });
      img.addEventListener('error', function () { img.remove(); });
      avatar.appendChild(img);
    } else {
      avatar.appendChild(h('span', { text: String(name || '角').slice(0, 1) }));
    }

    var block = h('div', { class: 'mp-ta-block' }, [
      h('div', { class: 'mp-ta-head' }, [
        avatar,
        h('div', { class: 'mp-ta-head__main' }, [
          h('div', { class: 'mp-ta-head__name', text: name }),
          h('div', { class: 'mp-ta-head__stat', text: playlists.length + ' 个歌单 · ' + trackCount + ' 首' })
        ])
      ])
    ]);

    if (playlists.length) {
      var strip = h('div', { class: 'mp-ta-strip' });
      playlists.forEach(function (p) { strip.appendChild(playlistCard(p)); });
      block.appendChild(strip);
    }

    // 乐评区
    var head = h('div', { class: 'mp-ta-review__head' }, [
      h('span', { class: 'mp-ta-review__dot mp-ta-review__dot--lead' }),
      h('span', { class: 'mp-ta-review__title', text: 'TA 的乐评' }),
      h('span', { class: 'mp-ta-review__notes', text: 'Notes' }),
      h('span', { class: 'mp-ta-review__rule' }),
      h('span', { class: 'mp-ta-review__count', text: comments.length + ' 条评论' })
    ]);
    block.appendChild(head);

    if (!comments.length) {
      var retry = h('button', { class: 'mp-ta-review__retry', type: 'button', text: '没看到乐评？重新读取' });
      retry.addEventListener('click', function () {
        retry.textContent = '读取中…';
        Promise.resolve(ctx.reloadComments ? ctx.reloadComments() : null).then(function () {
          renderAll();
        });
      });
      block.appendChild(h('div', { class: 'mp-ta-review__empty' }, [
        h('div', { text: 'TA 还没有写下乐评' }),
        retry
      ]));
    } else {
      comments.slice(0, 20).forEach(function (c) { block.appendChild(reviewCard(c)); });
    }

    return block;
  }

  function renderAll() {
    clear(body);
    applyBg();

    var playlists = charPlaylistsAll();
    var comments = allComments();
    if (currentChar) {
      playlists = playlists.filter(function (p) { return groupIdOf(p.ownerId) === currentChar; });
      comments = comments.filter(function (c) { return groupIdOf(c.characterId) === currentChar; });
    }

    var ids = currentChar ? [currentChar] : charIds();

    if (!ids.length) {
      body.appendChild(emptyHint(
        'TA 还没有歌单和评价',
        '让 TA 在聊天里建个歌单、或在「一起听」时把当前这首收进去'
      ));
      return;
    }

    ids.forEach(function (id) {
      var mine = playlists.filter(function (p) { return groupIdOf(p.ownerId) === id; });
      var words = comments.filter(function (c) { return groupIdOf(c.characterId) === id; });
      body.appendChild(charBlock(id, mine, words));
    });
  }

  /* ---------------- 自动刷新 ---------------- */
  // 角色在聊天里刚写完评论，App 侧不会收到通知，所以停留时每 8 秒静默比对一次
  var lastSig = '';
  var refreshTimer = null;

  function signature() {
    var plays = charPlaylistsAll();
    var says = allComments();
    return plays.length + '|' + says.length + '|' +
      says.slice(0, 8).map(function (c) { return c.key + ':' + (c.at || 0); }).join(',');
  }

  function softReload() {
    return Promise.all([
      ctx.reloadPlaylists ? ctx.reloadPlaylists() : Promise.resolve(),
      ctx.reloadComments ? ctx.reloadComments() : Promise.resolve()
    ]).then(function () {
      var sig = signature();
      if (sig !== lastSig) {
        lastSig = sig;
        renderAll();
      }
    }).catch(function () { /* 忽略 */ });
  }

  function onVisible() {
    if (typeof document !== 'undefined' && document.hidden) return;
    softReload();
  }

  renderPetals();
  renderAll();
  lastSig = signature();
  refreshTimer = setInterval(onVisible, 8000);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
  }

  Promise.all([
    ctx.reloadPlaylists ? ctx.reloadPlaylists() : Promise.resolve(),
    ctx.reloadComments ? ctx.reloadComments() : Promise.resolve(),
    loadCharacters(),
    reloadBgs(),
    loadSigns()
  ]).then(function () {
    renderAll();
  }).catch(function () { /* 忽略 */ });

  return {
    refresh: renderAll,
    destroy: function () {
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
      if (petals && petals.parentNode) petals.parentNode.removeChild(petals);
      petals = null;
    }
  };
}
