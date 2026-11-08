/** 播放队列：顺序 / 随机 / 列表循环 / 单曲循环。纯函数，随机源由参数注入 */

import { trackKey } from './track.js';

export var REPEAT = { OFF: 'off', ALL: 'all', ONE: 'one' };
export var REPEAT_ORDER = [REPEAT.OFF, REPEAT.ALL, REPEAT.ONE];

export function nextRepeat(mode) {
  var i = REPEAT_ORDER.indexOf(mode);
  return REPEAT_ORDER[(i + 1) % REPEAT_ORDER.length];
}

export function repeatLabel(mode) {
  if (mode === REPEAT.ALL) return '列表循环';
  if (mode === REPEAT.ONE) return '单曲循环';
  return '顺序播放';
}

function range(n) {
  var out = [];
  for (var i = 0; i < n; i++) out.push(i);
  return out;
}

/** Fisher-Yates；fixedFirst 不为 -1 时把它排到首位 */
function shuffledOrder(n, rng, fixedFirst) {
  var random = typeof rng === 'function' ? rng : Math.random;
  var arr = range(n);
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(random() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  if (fixedFirst >= 0 && fixedFirst < n) {
    var at = arr.indexOf(fixedFirst);
    if (at > 0) {
      arr.splice(at, 1);
      arr.unshift(fixedFirst);
    }
  }
  return arr;
}

function clamp(n, min, max) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * @param {Array} tracks
 * @param {{startIndex?:number, shuffle?:boolean, repeat?:string, rng?:Function}} opts
 */
export function createQueue(tracks, opts) {
  var o = opts || {};
  var list = (tracks || []).filter(Boolean).slice();
  var repeat = REPEAT_ORDER.indexOf(o.repeat) === -1 ? REPEAT.OFF : o.repeat;
  var shuffle = !!o.shuffle;
  var start = clamp(Number(o.startIndex) || 0, 0, Math.max(list.length - 1, 0));
  var order = shuffle ? shuffledOrder(list.length, o.rng, start) : range(list.length);
  var pos = shuffle ? 0 : start;

  return {
    tracks: list,
    order: order,
    pos: list.length ? pos : -1,
    shuffle: shuffle,
    repeat: repeat
  };
}

/**
 * 往队列末尾追加，不影响当前播放位置（模型点歌默认用它，不替换用户列表）
 */
export function appendTracks(queue, tracks) {
  var list = (tracks || []).filter(Boolean);
  if (!list.length) return queue;
  if (!queue || !queue.tracks.length) return createQueue(list, { repeat: queue ? queue.repeat : REPEAT.OFF });

  var merged = queue.tracks.concat(list);
  var order = queue.order.slice();
  for (var i = queue.tracks.length; i < merged.length; i++) order.push(i);
  return Object.assign({}, queue, { tracks: merged, order: order });
}

/** 从队列里删掉某一首，保持当前播放位置尽量不变 */
export function removeAt(queue, index) {
  if (!queue || index < 0 || index >= queue.tracks.length) return queue;
  var tracks = queue.tracks.slice();
  tracks.splice(index, 1);
  if (!tracks.length) return createQueue([], { repeat: queue.repeat });

  var playing = current(queue);
  var playingKey = playing ? trackKey(playing) : '';

  var order = queue.order
    .filter(function (n) { return n !== index; })
    .map(function (n) { return n > index ? n - 1 : n; });

  // 尽量让播放位置继续停在原来那首歌上
  var pos = 0;
  if (playingKey) {
    var at = -1;
    for (var i = 0; i < tracks.length; i++) {
      if (trackKey(tracks[i]) === playingKey) {
        at = i;
        break;
      }
    }
    if (at >= 0) pos = order.indexOf(at);
  }
  if (pos < 0) pos = 0;
  return Object.assign({}, queue, { tracks: tracks, order: order, pos: pos });
}

export function current(queue) {
  if (!queue || !queue.tracks.length || queue.pos < 0) return null;
  var idx = queue.order[queue.pos];
  return queue.tracks[idx] || null;
}

export function currentIndex(queue) {
  if (!queue || !queue.tracks.length || queue.pos < 0) return -1;
  return queue.order[queue.pos];
}

/**
 * 下一首。
 * auto=true（自然播完）时单曲循环保持当前曲；手动点下一首则照常切换。
 * @returns {{queue:Object, track:Object|null, ended:boolean}}
 */
export function advance(queue, opts) {
  var o = opts || {};
  if (!queue || !queue.tracks.length) return { queue: queue, track: null, ended: true };
  if (o.auto && queue.repeat === REPEAT.ONE) {
    return { queue: queue, track: current(queue), ended: false };
  }

  var pos = queue.pos + 1;
  if (pos < queue.order.length) {
    var moved = Object.assign({}, queue, { pos: pos });
    return { queue: moved, track: current(moved), ended: false };
  }

  if (queue.repeat === REPEAT.ALL) {
    var order = queue.shuffle
      ? shuffledOrder(queue.tracks.length, o.rng, -1)
      : range(queue.tracks.length);
    var looped = Object.assign({}, queue, { order: order, pos: 0 });
    return { queue: looped, track: current(looped), ended: false };
  }

  return { queue: queue, track: null, ended: true };
}

/** 上一首：到头则停在第 0 首并返回 restart=true（由调用方决定是否重头播放） */
export function back(queue) {
  if (!queue || !queue.tracks.length) return { queue: queue, track: null, restart: false };
  var pos = queue.pos - 1;
  if (pos < 0) {
    if (queue.repeat === REPEAT.ALL) {
      var tail = Object.assign({}, queue, { pos: queue.order.length - 1 });
      return { queue: tail, track: current(tail), restart: false };
    }
    return { queue: Object.assign({}, queue, { pos: 0 }), track: current(queue), restart: true };
  }
  var moved = Object.assign({}, queue, { pos: pos });
  return { queue: moved, track: current(moved), restart: false };
}

/** 跳到指定歌曲（键不存在时原样返回） */
export function jumpTo(queue, key) {
  if (!queue || !queue.tracks.length) return queue;
  var trackIdx = -1;
  for (var i = 0; i < queue.tracks.length; i++) {
    if (trackKey(queue.tracks[i]) === key) { trackIdx = i; break; }
  }
  if (trackIdx === -1) return queue;
  var at = queue.order.indexOf(trackIdx);
  if (at === -1) return queue;
  return Object.assign({}, queue, { pos: at });
}

export function setShuffle(queue, shuffle, rng) {
  if (!queue) return queue;
  if (!!shuffle === !!queue.shuffle) return queue;
  var playingIdx = currentIndex(queue);

  if (shuffle) {
    var shuffled = shuffledOrder(queue.tracks.length, rng, playingIdx);
    return Object.assign({}, queue, { shuffle: true, order: shuffled, pos: 0 });
  }

  // 关掉随机后换成自然顺序，当前位置直接就是歌曲下标
  var pos = playingIdx >= 0 ? playingIdx : 0;
  return Object.assign({}, queue, { shuffle: false, order: range(queue.tracks.length), pos: pos });
}

export function setRepeat(queue, mode) {
  if (!queue) return queue;
  return Object.assign({}, queue, { repeat: REPEAT_ORDER.indexOf(mode) === -1 ? REPEAT.OFF : mode });
}

/** 列表内容变化（收藏被取消、歌单被编辑）时同步队列，尽量停在当前歌上 */
export function replaceTracks(queue, tracks, rng) {
  var keep = current(queue);
  var list = (tracks || []).filter(Boolean).slice();
  if (!list.length) return createQueue([], {});

  var order = queue && queue.shuffle ? shuffledOrder(list.length, rng, -1) : range(list.length);
  var pos = 0;
  if (keep) {
    var key = trackKey(keep);
    for (var i = 0; i < list.length; i++) {
      if (trackKey(list[i]) === key) {
        pos = order.indexOf(i);
        if (pos < 0) pos = 0;
        break;
      }
    }
  }
  return {
    tracks: list,
    order: order,
    pos: pos,
    shuffle: !!(queue && queue.shuffle),
    repeat: (queue && queue.repeat) || REPEAT.OFF
  };
}
