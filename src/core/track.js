/** 歌曲对象归一化：所有音源都映射成同一份结构 */

/** 唯一键：音源 + 平台 + id。跨源同名歌曲不会被误判成同一首；没有 id 视为无效 */
export function trackKey(track) {
  if (!track || track.id == null || String(track.id) === '') return '';
  return [track.source || '', track.platform || '', track.id].join(':');
}

function joinArtists(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map(function (a) { return typeof a === 'string' ? a : (a && (a.name || a.artist)) || ''; })
      .filter(Boolean)
      .join(' / ');
  }
  return String(raw || '');
}

/**
 * 把各音源返回的原始项统一成 track。
 * 支持字段：id / name / artist / album / cover / duration / url / picId / lyricId / platform
 */
export function normalizeTrack(raw, fallbackSource) {
  if (!raw) return null;
  var source = String(raw.source || fallbackSource || 'local');
  var platform = String(raw.platform || raw.srcSource || '');
  var id = raw.id != null ? raw.id : (raw.songmid != null ? raw.songmid : raw.trackId);
  if (id == null || String(id) === '') return null;

  var artist = joinArtists(raw.artist || raw.artists || raw.artistName) || '未知歌手';
  var name = String(raw.name || raw.trackName || raw.title || '未知歌曲');
  var duration = Number(raw.duration || raw.trackTimeMillis || raw.interval || 0);

  return {
    source: source,
    platform: platform,
    id: String(id),
    name: name,
    artist: artist,
    album: String(raw.album || raw.collectionName || ''),
    cover: String(raw.cover || raw.artwork || ''),
    duration: Number.isFinite(duration) ? duration : 0,
    url: String(raw.url || raw.previewUrl || ''),
    picId: String(raw.picId || raw.pic_id || ''),
    lyricId: String(raw.lyricId || raw.lyric_id || ''),
    // 版权标记：>0 基本等于要会员/付费，QQ 无版权的歌常落在这里
    payplay: Number(raw.payplay) || 0,
    paydownload: Number(raw.paydownload) || 0
  };
}

export function sameTrack(a, b) {
  return !!a && !!b && trackKey(a) === trackKey(b);
}

/** 「歌手 - 歌名」：聊天卡片与 modelText 用 */
export function trackLine(track) {
  if (!track) return '';
  return track.artist + ' - ' + track.name;
}

/** 复制一份，避免外部改到队列里的对象 */
export function cloneTrack(track) {
  return track ? Object.assign({}, track) : null;
}

/** 从对象数组里按键去重，保持原顺序 */
export function dedupeTracks(list) {
  var seen = Object.create(null);
  var out = [];
  (list || []).forEach(function (t) {
    var key = trackKey(t);
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push(t);
  });
  return out;
}
