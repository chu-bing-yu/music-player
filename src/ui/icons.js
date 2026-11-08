/** 内置图标：只放常量 SVG，避免依赖图片与外链 */

var STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
var FILL = 'fill="currentColor"';

export var ICONS = {
  search: '<svg viewBox="0 0 24 24" ' + STROKE + '><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
  music: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
  heart: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M12 20s-7-4.6-7-9.4A4.1 4.1 0 0 1 12 7a4.1 4.1 0 0 1 7 3.6C19 15.4 12 20 12 20z"/></svg>',
  heartFull: '<svg viewBox="0 0 24 24" ' + FILL + '><path d="M12 20s-7-4.6-7-9.4A4.1 4.1 0 0 1 12 7a4.1 4.1 0 0 1 7 3.6C19 15.4 12 20 12 20z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2.2"/><circle cx="8" cy="16" r="2.2"/></svg>',
  play: '<svg viewBox="0 0 24 24" ' + FILL + '><path d="M7 5.5v13l12-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" ' + FILL + '><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>',
  prev: '<svg viewBox="0 0 24 24" ' + FILL + '><rect x="5" y="5" width="2.6" height="14" rx="1.2"/><path d="M19 6.5v11L9.5 12z"/></svg>',
  next: '<svg viewBox="0 0 24 24" ' + FILL + '><rect x="16.4" y="5" width="2.6" height="14" rx="1.2"/><path d="M5 6.5v11L14.5 12z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M4 6h3l10 12h3M4 18h3l3-3.6M14 8.6L17 6h3"/><path d="M17 3.5 20 6l-3 2.5M17 15.5 20 18l-3 2.5"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M6 7h11a3 3 0 0 1 3 3v2"/><path d="M18 17H7a3 3 0 0 1-3-3v-2"/><path d="M14 4.5 17 7l-3 2.5M10 19.5 7 17l3-2.5"/></svg>',
  repeatOne: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M6 7h11a3 3 0 0 1 3 3v2"/><path d="M18 17H7a3 3 0 0 1-3-3v-2"/><path d="M14 4.5 17 7l-3 2.5M10 19.5 7 17l3-2.5"/><path d="M11.4 10.6l1.2-.8v4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M12 5v14M5 12h14"/></svg>',
  more: '<svg viewBox="0 0 24 24" ' + FILL + '><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>',
  back: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M14.5 5 8 12l6.5 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M6 6l12 12M18 6 6 18"/></svg>',
  trash: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12"/></svg>',
  check: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M5 12.5 10 17l9-10"/></svg>',
  down: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  up: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  folder: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M4 7h6l2 2h8v9H4z"/></svg>',
  lyric: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M4 7h16M4 12h11M4 17h13"/></svg>',
  queue: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M4 7h11M4 12h11M4 17h6"/><circle cx="18" cy="16" r="2"/><path d="M20 16V8l-3 1"/></svg>',
  float: '<svg viewBox="0 0 24 24" ' + STROKE + '><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M7 9h7M7 12h5"/></svg>',
  note: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M7 4h10v16l-5-3-5 3z"/></svg>'
};

export function icon(name) {
  return ICONS[name] || ICONS.music;
}
