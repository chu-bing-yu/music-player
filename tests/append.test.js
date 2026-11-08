import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue, current, appendTracks, removeAt } from '../src/core/queue.js';
import { normalizeTrack } from '../src/core/track.js';

function t(id) {
  return normalizeTrack({ id: id, name: '歌' + id, artist: '歌手' }, 'tencent');
}

test('appendTracks 追加到末尾，不动当前播放位置', () => {
  const q = createQueue([t(1), t(2)], { startIndex: 1 });
  const before = current(q);
  const next = appendTracks(q, [t(3), t(4)]);
  assert.equal(next.tracks.length, 4);
  assert.equal(current(next).id, before.id);
  assert.deepEqual(next.order, [0, 1, 2, 3]);
  assert.equal(next.pos, q.pos);
});

test('appendTracks 空数组原样返回', () => {
  const q = createQueue([t(1)]);
  assert.equal(appendTracks(q, []), q);
});

test('removeAt 删掉指定歌并修正索引', () => {
  const q = createQueue([t(1), t(2), t(3)], { startIndex: 1 });
  const next = removeAt(q, 0);
  assert.equal(next.tracks.length, 2);
  assert.deepEqual(next.order, [0, 1]);
  assert.equal(current(next).id, '2');
});

test('removeAt 删空后回到空队列', () => {
  const q = createQueue([t(1)]);
  const next = removeAt(q, 0);
  assert.equal(next.tracks.length, 0);
  assert.equal(current(next), null);
});

test('appendTracks 空队列时直接建队列', () => {
  const q = appendTracks(createQueue([]), [t(1), t(2)]);
  assert.equal(q.tracks.length, 2);
  assert.equal(current(q).id, '1');
});
