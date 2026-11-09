/**
 * 统一刊头：左对齐 + 主题色竖线锚点 + 通栏细线。
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
    h('span', { class: 'mp-mast__mark' }),
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
