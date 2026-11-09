/**
 * 统一刊头：左对齐，日期与标题同一条基线，下面一条通栏细线。
 * 不再用主题色竖线做锚点（用户反馈那条竖线很奇怪），靠字号与字距分层。
 * 所有页面共用一份，避免出现「有的页面改了有的没改」。
 */

import { h } from './dom.js';

export function masthead(opts) {
  var o = opts || {};

  var text = h('div', { class: 'mp-mast__text' }, [
    o.date ? h('div', { class: 'mp-mast__date', text: o.date }) : null,
    o.titleNode || h('div', { class: 'mp-mast__title' + (o.hand ? ' mp-mast__title--hand' : ''), text: o.title || '' })
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
