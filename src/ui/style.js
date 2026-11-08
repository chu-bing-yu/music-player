/** 样式注入：App 与聊天卡片共用同一份 CSS，按需插入、用不到时清理 */

import themeCss from './theme.css';
import baseCss from './base.css';
import viewsCss from './views.css';

var STYLE_ID = 'music-player-style';
var CSS = [themeCss, baseCss, viewsCss].join('\n');

export function ensureStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** 页面上还有插件自己的节点（App 根 / 聊天卡片 / 弹层）时不能删样式 */
export function removeStyleIfUnused() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('.mp-root, .mp-card, .mp-modal')) return;
  var style = document.getElementById(STYLE_ID);
  if (style && style.parentNode) style.parentNode.removeChild(style);
}

/** 跟随系统深色模式，返回解绑函数 */
export function watchTheme(root) {
  if (typeof window === 'undefined' || !window.matchMedia) return function () {};
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function apply() {
    if (root) root.dataset.theme = mq.matches ? 'dark' : 'light';
  }
  apply();
  if (mq.addEventListener) mq.addEventListener('change', apply);
  else if (mq.addListener) mq.addListener(apply);

  return function () {
    if (mq.removeEventListener) mq.removeEventListener('change', apply);
    else if (mq.removeListener) mq.removeListener(apply);
  };
}
