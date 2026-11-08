import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQueue, current, advance, back, setShuffle, setRepeat, jumpTo,
  replaceTracks, nextRepeat, REPEAT
} from '../src/core/queue.js';
import { normalizeTrack } from '../src/core/track.js';

function list(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(normalizeTrack({ id: 's' + i, name: '歌' + i, artist: '歌手' }, 'gd'));
  }
  return out;
}

function seeded(seed) {
  let s = seed;
  return function () {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

test('顺序队列从第 0 首开始，next 依序前进', () => {
  const q = createQueue(list(3));
  assert.equal(current(q).name, '歌0');
  const r1 = advance(q);
  assert.equal(r1.track.name, '歌1');
  const r2 = advance(r1.queue);
  assert.equal(r2.track.name, '歌2');
});

test('顺序播放到末尾会结束，不循环', () => {
  let q = createQueue(list(2));
  q = advance(q).queue;
  const res = advance(q);
  assert.equal(res.ended, true);
  assert.equal(res.track, null);
  assert.equal(current(res.queue).name, '歌1');
});

test('列表循环到末尾回到第一首', () => {
  let q = createQueue(list(2), { repeat: REPEAT.ALL });
  q = advance(q).queue;
  const res = advance(q);
  assert.equal(res.ended, false);
  assert.equal(res.track.name, '歌0');
});

test('单曲循环：自然播完停在当前曲，手动下一首照常切换', () => {
  const tracks = list(3);
  const q = createQueue(tracks, { startIndex: 1, repeat: REPEAT.ONE });
  const auto = advance(q, { auto: true });
  assert.equal(auto.track.name, '歌1');
  const manual = advance(q);
  assert.equal(manual.track.name, '歌2');
});

test('上一首在开头时 restart，循环模式下跳到末尾', () => {
  const q = createQueue(list(3));
  const first = back(q);
  assert.equal(first.restart, true);

  const loopQ = createQueue(list(3), { repeat: REPEAT.ALL });
  const wrapped = back(loopQ);
  assert.equal(wrapped.track.name, '歌2');
  assert.equal(wrapped.restart, false);
});

test('随机队列固定起点在首位，且包含全部歌曲', () => {
  const q = createQueue(list(5), { shuffle: true, startIndex: 2, rng: seeded(7) });
  assert.equal(current(q).name, '歌2');
  assert.equal(q.order.length, 5);
  assert.deepEqual(q.order.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4]);
});

test('开关随机不会丢掉当前播放的歌曲', () => {
  const tracks = list(6);
  const q = createQueue(tracks, { startIndex: 3 });
  const shuffled = setShuffle(q, true, seeded(3));
  assert.equal(current(shuffled).name, '歌3');

  const back2 = setShuffle(shuffled, false);
  assert.equal(current(back2).name, '歌3');
});

test('循环模式按 顺序 → 列表 → 单曲 轮换', () => {
  assert.equal(nextRepeat(REPEAT.OFF), REPEAT.ALL);
  assert.equal(nextRepeat(REPEAT.ALL), REPEAT.ONE);
  assert.equal(nextRepeat(REPEAT.ONE), REPEAT.OFF);
});

test('jumpTo 跳到指定歌，setRepeat 只改模式', () => {
  const q = createQueue(list(4));
  const jumped = jumpTo(q, 'gd::s2');
  assert.equal(current(jumped).name, '歌2');
  assert.equal(setRepeat(q, REPEAT.ONE).repeat, REPEAT.ONE);
  assert.equal(setRepeat(q, '不存在的模式').repeat, REPEAT.OFF);
});

test('列表变化后 replaceTracks 尽量停在当前歌上', () => {
  const tracks = list(4);
  let q = createQueue(tracks, { startIndex: 2 });
  q = replaceTracks(q, tracks.slice(0, 3));
  assert.equal(current(q).name, '歌2');

  q = replaceTracks(q, [tracks[0]]);
  assert.equal(current(q).name, '歌0');
});

test('空列表时 current 为 null，advance 直接结束', () => {
  const q = createQueue([]);
  assert.equal(current(q), null);
  assert.equal(advance(q).ended, true);
});
