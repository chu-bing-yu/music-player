/** 可复用小组件：图标按钮、封面、歌曲行、底部弹层 */

import { h, clear } from './dom.js';
import { icon } from './icons.js';

/** 页面标题：点击即退出 App（不显示额外按钮） */
export function pageTitle(text, onExit) {
  var el = h('div', { class: 'mp-header__title', text: text });
  if (onExit) {
    el.setAttribute('title', '点击退出');
    el.addEventListener('click', function () { onExit(); });
  }
  return el;
}

export function iconBtn(name, opts) {
  var o = opts || {};
  var btn = h('button', {
    class: 'mp-icon-btn' + (o.active ? ' is-active' : ''),
    type: 'button',
    'aria-label': o.label || name
  }, [h('span', { html: icon(name) })]);
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (o.onClick) o.onClick(e);
  });
  return btn;
}

export function coverNode(url, cls) {
  var box = h('div', { class: cls || 'mp-row__cover' });
  fillCover(box, url);
  return box;
}

/** 封面统一入口：有 URL 就换图，没有就放音符图标 */
export function fillCover(box, url) {
  if (!box) return;
  clear(box);
  if (url) {
    var img = h('img', { src: url, alt: '', loading: 'lazy' });
    img.addEventListener('error', function () {
      clear(box);
      box.innerHTML = icon('music');
    });
    box.appendChild(img);
  } else {
    box.innerHTML = icon('music');
  }
}

/**
 * @param {{track:Object, coverUrl?:string, coverKey?:string, current?:boolean,
 *          playing?:boolean, tag?:string, onPlay:Function, onMore?:Function}} opts
 */
export function songRow(opts) {
  var track = opts.track;
  var row = h('div', {
    class: 'mp-row' + (opts.current ? ' is-current' : '') + (opts.selected ? ' is-selected' : '')
  });

  if (opts.selectable) {
    row.appendChild(h('span', {
      class: 'mp-row__check' + (opts.selected ? ' is-on' : ''),
      html: opts.selected ? icon('check') : ''
    }));
  }

  var cover = coverNode(opts.coverUrl, 'mp-row__cover');
  if (opts.coverKey) cover.dataset.cover = opts.coverKey;

  var sub = h('div', { class: 'mp-row__sub' });
  if (opts.tag) sub.appendChild(h('span', { class: 'mp-row__tag', text: opts.tag }));
  sub.appendChild(document.createTextNode(track.artist + (track.album ? ' · ' + track.album : '')));

  var main = h('div', { class: 'mp-row__main' }, [
    h('div', { class: 'mp-row__name', text: track.name }),
    sub
  ]);

  var playBtn = h('button', {
    class: 'mp-row__btn' + (opts.current ? ' is-active' : ''),
    type: 'button',
    'aria-label': '播放'
  }, [h('span', { html: icon(opts.current && opts.playing ? 'pause' : 'play') })]);
  playBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    opts.onPlay();
  });

  row.appendChild(cover);
  row.appendChild(main);
  row.appendChild(playBtn);

  if (opts.onMore) {
    var more = h('button', { class: 'mp-row__btn', type: 'button', 'aria-label': '更多' },
      [h('span', { html: icon('more') })]);
    more.addEventListener('click', function (e) {
      e.stopPropagation();
      opts.onMore();
    });
    row.appendChild(more);
  }

  row.addEventListener('click', function () { opts.onPlay(row); });
  return row;
}

/**
 * 杂志书架：竖幅封面横滑条。
 * 封面高度按 3 步循环（高 / 矮 / 最高），底边对齐，看起来像书架上高低不一的书脊。
 * 名字压在封面底部的渐变压字上，这样整条的底边是齐的，错落感只出现在上沿。
 *
 * @param {{name:string, sub?:string, coverUrl?:string, coverKey?:string, onClick:Function}[]} items
 */
export function shelfRail(items) {
  var rail = h('div', { class: 'mp-shelf' });

  items.forEach(function (item) {
    var art = h('div', { class: 'mp-shelf__art' });
    fillCover(art, item.coverUrl || '');
    if (item.coverKey) art.dataset.cover = item.coverKey;

    var card = h('button', { class: 'mp-shelf__card', type: 'button' }, [
      art,
      h('div', { class: 'mp-shelf__label' }, [
        h('div', { class: 'mp-shelf__name', text: item.name || '' }),
        item.sub ? h('div', { class: 'mp-shelf__sub', text: item.sub }) : null
      ].filter(Boolean))
    ]);
    card.addEventListener('click', function () { item.onClick(); });
    rail.appendChild(card);
  });

  return rail;
}

export function emptyHint(title, sub) {
  return h('div', { class: 'mp-hint' }, [
    h('div', { text: title }),
    sub ? h('div', { text: sub }) : null
  ]);
}

export function openSheet(rootEl, opts) {
  var o = opts || {};
  var mask = h('div', { class: 'mp-mask' });
  var body = h('div', { class: 'mp-sheet__body' });
  var titleEl = h('div', { class: 'mp-sheet__title', text: typeof o.title === 'string' ? o.title : '' });

  function close() {
    if (mask.parentNode) mask.parentNode.removeChild(mask);
  }

  function currentItems() {
    return typeof o.items === 'function' ? (o.items() || []) : (o.items || []);
  }

  /** 原地重绘列表：删除单行时用它，弹层不关、不闪 */
  function renderItems() {
    body.replaceChildren();
    if (typeof o.title === 'function') titleEl.textContent = o.title() || '';

    var items = currentItems();
    items.forEach(function (item) {
      var row = h('div', {
        class: 'mp-sheet__item' + (item.danger ? ' is-danger' : ''),
        role: 'button',
        tabindex: '0'
      }, [
        h('span', { html: icon(item.icon || 'music') }),
        h('span', { class: 'mp-sheet__label', text: item.label }),
        item.hint ? h('span', { class: 'mp-field__value', text: item.hint }) : null
      ]);
      row.addEventListener('click', function () {
        close();
        if (item.onClick) item.onClick();
      });

      // 行尾的 × ：单独执行移除，不关弹层
      if (item.onRemove) {
        var remove = h('button', { class: 'mp-sheet__x', type: 'button', 'aria-label': '移除' },
          [h('span', { html: icon('close') })]);
        remove.addEventListener('click', function (e) {
          e.stopPropagation();
          if (item.onRemove) item.onRemove();
          renderItems();
        });
        row.appendChild(remove);
      }

      body.appendChild(row);
    });

    if (!items.length) {
      body.appendChild(h('div', { class: 'mp-hint', text: o.empty || '这里还没有内容' }));
    }
  }

  renderItems();

  var sheet = h('div', { class: 'mp-sheet' }, [
    h('div', { class: 'mp-sheet__head' }, [
      titleEl,
      iconBtn('close', { label: '关闭', onClick: close })
    ]),
    body
  ]);

  mask.addEventListener('click', function (e) {
    if (e.target === mask) close();
  });

  mask.appendChild(sheet);
  rootEl.appendChild(mask);
  close.refresh = renderItems;
  return close;
}

/** 多行文本编辑弹层：用于编辑提示词 */
export function openEditor(rootEl, opts) {
  var o = opts || {};
  var area = h('textarea', {
    class: 'mp-editor',
    placeholder: o.placeholder || '',
    rows: '8'
  });
  area.value = o.value || '';

  var mask = h('div', { class: 'mp-mask' });
  var body = h('div', { class: 'mp-sheet__body' }, [area]);

  function close() {
    if (mask.parentNode) mask.parentNode.removeChild(mask);
  }

  function submit() {
    close();
    if (o.onSubmit) o.onSubmit(area.value);
  }

  var okBtn = h('button', { class: 'mp-btn mp-btn--primary', type: 'button', text: '保存' });
  okBtn.addEventListener('click', submit);

  var resetBtn = h('button', { class: 'mp-btn mp-btn--ghost', type: 'button', text: '恢复默认' });
  resetBtn.addEventListener('click', function () {
    if (o.onReset) o.onReset();
    area.value = o.defaultValue || '';
    area.focus();
  });

  var sheet = h('div', { class: 'mp-sheet' }, [
    h('div', { class: 'mp-sheet__head' }, [
      h('div', { class: 'mp-sheet__title', text: o.title || '编辑' }),
      okBtn,
      iconBtn('close', { label: '关闭', onClick: close })
    ]),
    body,
    h('div', { class: 'mp-field' }, [resetBtn])
  ]);

  mask.addEventListener('click', function (e) {
    if (e.target === mask) close();
  });
  mask.appendChild(sheet);
  rootEl.appendChild(mask);
  setTimeout(function () { area.focus(); }, 30);
  return close;
}

/** 输入型弹层：新建 / 重命名歌单 */
export function openPrompt(rootEl, opts) {
  var o = opts || {};
  var value = o.value || '';
  var input = h('input', {
    class: 'mp-modal__input',
    type: 'text',
    placeholder: o.placeholder || '',
    value: value,
    maxlength: '40'
  });

  var mask = h('div', { class: 'mp-mask' });
  var body = h('div', { class: 'mp-sheet__body' }, [
    h('div', { class: 'mp-field' }, [input])
  ]);

  function close() {
    if (mask.parentNode) mask.parentNode.removeChild(mask);
  }

  function submit() {
    var text = String(input.value || '').trim();
    if (!text) {
      input.focus();
      return;
    }
    close();
    if (o.onSubmit) o.onSubmit(text);
  }

  var okBtn = h('button', { class: 'mp-btn mp-btn--primary', type: 'button', text: '确定' });
  okBtn.addEventListener('click', submit);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') submit();
  });

  var sheet = h('div', { class: 'mp-sheet' }, [
    h('div', { class: 'mp-sheet__head' }, [
      h('div', { class: 'mp-sheet__title', text: o.title || '' }),
      okBtn,
      iconBtn('close', { label: '关闭', onClick: close })
    ]),
    body
  ]);

  mask.addEventListener('click', function (e) {
    if (e.target === mask) close();
  });
  mask.appendChild(sheet);
  rootEl.appendChild(mask);
  setTimeout(function () { input.focus(); }, 30);
  return close;
}
