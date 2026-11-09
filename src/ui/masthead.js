/**
 * 统一刊头：
 * - 杂志风（默认）：左对齐，日期与标题同一条基线，下面一条通栏细线；不用主题色竖线做锚点。
 * - 经典：还原 0.40 的 `.mp-header`（大号粗标题 + 右上角图标按钮，没有日期行、没有细线）。
 * 两种皮肤走同一份调用参数，页面里不用关心自己长什么样。
 */

import { h } from './dom.js';

export function masthead(opts) {
  var o = opts || {};

  var titleNode = o.titleNode || h('div', {
    class: 'mp-mast__title' + (o.hand ? ' mp-mast__title--hand' : ''),
    text: o.title || ''
  });

  if (o.classic) {
    var classicTitle = o.titleNode || h('div', { class: 'mp-header__title', text: o.title || '' });
    if (o.onTitle) classicTitle.addEventListener('click', o.onTitle);
    var row = h('div', { class: 'mp-header' }, [
      o.leading || null,
      classicTitle,
      o.subNode || null,
      o.hint ? h('div', { class: 'mp-header__sub', text: o.hint }) : null
    ].filter(Boolean));
    (o.actions || []).forEach(function (btn) { row.appendChild(btn); });
    return row;
  }

  var text = h('div', { class: 'mp-mast__text' }, [
    o.date ? h('div', { class: 'mp-mast__date', text: o.date }) : null,
    titleNode
  ].filter(Boolean));

  var bar = h('div', { class: 'mp-mast__bar' }, [
    o.leading || null,
    text,
    o.actions ? h('div', { class: 'mp-mast__acts' }, o.actions) : null
  ].filter(Boolean));

  if (o.onTitle) {
    text.addEventListener('click', o.onTitle);
  }

  var wrap = h('div', { class: 'mp-mast' }, [bar, h('div', { class: 'mp-mast__rule' })]);
  if (o.subNode) wrap.appendChild(o.subNode);
  else if (o.hint) wrap.appendChild(h('div', { class: 'mp-mast__hint', text: o.hint }));
  return wrap;
}

/** 今日日期：`11 / 09` */
export function todayText() {
  var d = new Date();
  return String(d.getMonth() + 1).padStart(2, '0') + ' / ' + String(d.getDate()).padStart(2, '0');
}

/** 分组小标题：宋体小字 + 一条延伸到右边的细线（杂志的「栏目头」） */
export function sectionHead(text, action) {
  var row = h('div', { class: 'mp-mag__head' }, [
    h('span', { class: 'mp-mag__headtext', text: text }),
    h('span', { class: 'mp-mag__rule' })
  ]);
  if (action) row.appendChild(action);
  return row;
}
