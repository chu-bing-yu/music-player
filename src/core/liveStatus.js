/**
 * AI 读到的「当前播放状态」：**活状态 → 快照 → 缓存**。
 *
 * 以前只吃 runtime 缓存（由 App 的 refresh 推过来），原生引擎切歌时 refresh 不一定跑，
 * 于是「AI 说在放上一首」。这里纯函数化，方便单测，也让 chatLink 不用拖 UI 依赖。
 */

/**
 * @param {{bridgeStatus?:Object, snapshot?:Object, runtime?:Object}} input
 * @returns {{title:string, artist:string, isPlaying:boolean, queueSize:number}}
 */
export function resolveLiveStatus(input) {
  var opts = input || {};
  var live = opts.bridgeStatus || null;
  var snap = opts.snapshot || null;
  var rt = opts.runtime || {};

  var track = (live && live.playing) || (snap && snap.track) || null;
  var title = track && track.name ? String(track.name) : '';
  var artist = track && track.artist ? String(track.artist) : '';

  var isPlaying;
  if (live && typeof live.isPlaying === 'boolean') isPlaying = live.isPlaying;
  else if (snap && typeof snap.isPlaying === 'boolean') isPlaying = snap.isPlaying;
  else isPlaying = !!rt.isPlaying;

  var queueSize;
  if (live && typeof live.queueSize === 'number') queueSize = live.queueSize;
  else if (snap && snap.queue && Array.isArray(snap.queue.tracks)) queueSize = snap.queue.tracks.length;
  else if (typeof rt.queueSize === 'number') queueSize = rt.queueSize;
  else queueSize = 0;

  // 活状态/快照都没有歌时，退回缓存（App 刚卸载、快照还没写的情况）
  if (!title && rt.title) {
    title = String(rt.title);
    artist = String(rt.artist || '');
    if (typeof rt.isPlaying === 'boolean') isPlaying = rt.isPlaying;
    if (typeof rt.queueSize === 'number') queueSize = rt.queueSize;
  }

  return { title: title, artist: artist, isPlaying: !!isPlaying, queueSize: queueSize };
}
