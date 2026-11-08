/** LRC 歌词解析：纯函数，时间单位统一毫秒 */

var TIME_RE = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

function msOf(fraction) {
  if (!fraction) return 0;
  var text = String(fraction);
  if (text.length === 1) text = text + '00';
  else if (text.length === 2) text = text + '0';
  return Number(text.slice(0, 3)) || 0;
}

/**
 * @param {string} text LRC 原文
 * @returns {Array<{time:number, text:string}>} 按时间升序
 */
export function parseLrc(text) {
  var out = [];
  if (!text) return out;

  String(text).split(/\r?\n/).forEach(function (raw) {
    if (!raw) return;
    var times = [];
    var content = raw.replace(TIME_RE, function (all, mm, ss, fraction) {
      times.push((Number(mm) * 60 + Number(ss)) * 1000 + msOf(fraction));
      return '';
    }).trim();

    if (!times.length) return; // [ti:] [ar:] 这类元信息
    if (!content) return; // 纯时间戳的间奏行

    times.forEach(function (time) {
      out.push({ time: time, text: content });
    });
  });

  out.sort(function (a, b) { return a.time - b.time; });
  return out;
}

/** 二分找到当前时间对应的歌词行，没有则 -1 */
export function activeLineIndex(lines, ms) {
  var arr = lines || [];
  if (!arr.length) return -1;
  var target = Number(ms) || 0;
  var lo = 0;
  var hi = arr.length - 1;
  var ans = -1;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    if (arr[mid].time <= target) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** 从 vkeys 的歌词返回里取出 LRC 文本（兼容 data.lrc / data.lyric / 直出字符串） */
export function pickLrc(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  var data = payload.data || payload;
  if (typeof data === 'string') return data;
  if (data && typeof data.lrc === 'string') return data.lrc;
  if (data && typeof data.lyric === 'string') return data.lyric;
  return '';
}
