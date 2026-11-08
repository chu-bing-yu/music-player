/** 时间与文本格式化：纯函数，不碰 DOM、不读系统时间 */

/** 毫秒 → mm:ss（超过 1 小时用 h:mm:ss） */
export function fmtTime(ms) {
  var total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  var h = Math.floor(total / 3600);
  var m = Math.floor((total % 3600) / 60);
  var s = total % 60;
  var mm = String(m).padStart(2, '0');
  var ss = String(s).padStart(2, '0');
  return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}

/** 播放次数之类的数字：12000 → 1.2万 */
export function fmtCount(n) {
  var v = Number(n) || 0;
  if (v >= 100000000) return (v / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
  if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return String(v);
}

export function clip(text, max) {
  var s = String(text == null ? '' : text);
  var limit = Math.max(0, Number(max) || 0);
  if (!limit || s.length <= limit) return s;
  return s.slice(0, limit - 1) + '…';
}

/** 秒数 → 「3 首 · 12:34」，用于歌单概要 */
export function fmtSummary(count, totalMs) {
  var songs = Number(count) || 0;
  if (!songs) return '空歌单';
  if (!totalMs) return songs + ' 首';
  return songs + ' 首 · ' + Math.round(totalMs / 60000) + ' 分钟';
}
