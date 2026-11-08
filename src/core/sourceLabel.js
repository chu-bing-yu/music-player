/**
 * 音源名称：所有地方（播放页、列表行、卡片）都从这里取，
 * 避免再出现「除了 iTunes 全显示 QQ 音乐」这种写死。
 */

var LABELS = {
  tencent: 'QQ 音乐',
  qq: 'QQ 音乐',
  netease: '网易云音乐',
  itunes: 'iTunes 试听',
  audius: 'Audius',
  local: '本地'
};

/** 从平台字段反推：老数据里 source 可能为空，但 platform 有值 */
function guessPlatform(track) {
  if (!track) return '';
  var raw = String(track.source || '') + ' ' + String(track.platform || '') + ' ' + String(track.id || '');
  var text = raw.toLowerCase();
  if (text.indexOf('netease') !== -1) return 'netease';
  if (text.indexOf('itunes') !== -1) return 'itunes';
  if (text.indexOf('audius') !== -1) return 'audius';
  if (text.indexOf('qq') !== -1 || text.indexOf('tencent') !== -1) return 'tencent';
  if (text.indexOf('local') !== -1) return 'local';
  return '';
}

export function sourceKey(track) {
  if (!track) return '';
  var key = String(track.source || '').toLowerCase();
  if (LABELS[key]) return key === 'qq' ? 'tencent' : key;
  return guessPlatform(track);
}

export function sourceLabel(track) {
  var key = sourceKey(track);
  if (!key) return '未知来源';
  return LABELS[key] || '未知来源';
}

/** 是否可播（iTunes 只有试听片段，仍算可播） */
export function isPreview(track) {
  return sourceKey(track) === 'itunes';
}
