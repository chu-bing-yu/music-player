import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLiveStatus } from '../src/core/liveStatus.js';

test('活状态优先：bridge 里正在放的那首赢过快照与缓存', () => {
  const st = resolveLiveStatus({
    bridgeStatus: { playing: { name: '晴天', artist: '周杰伦' }, isPlaying: true, queueSize: 12 },
    snapshot: { track: { name: '夜曲', artist: '周杰伦' }, isPlaying: false, queue: { tracks: [1] } },
    runtime: { title: '旧歌', artist: '旧', isPlaying: false, queueSize: 3 }
  });
  assert.equal(st.title, '晴天');
  assert.equal(st.artist, '周杰伦');
  assert.equal(st.isPlaying, true);
  assert.equal(st.queueSize, 12);
});

test('App 不在（bridge 为空）时用快照', () => {
  const st = resolveLiveStatus({
    snapshot: { track: { name: '起风了', artist: '买辣椒也用券' }, isPlaying: true, queue: { tracks: [1, 2, 3] } },
    runtime: { title: '旧歌', isPlaying: false, queueSize: 1 }
  });
  assert.equal(st.title, '起风了');
  assert.equal(st.queueSize, 3);
});

test('都没有时退回缓存', () => {
  const st = resolveLiveStatus({ runtime: { title: '缓存歌', artist: 'A', isPlaying: true, queueSize: 5 } });
  assert.deepEqual(st, { title: '缓存歌', artist: 'A', isPlaying: true, queueSize: 5 });
});

test('什么都没放：标题空、isPlaying 为 false、队列 0', () => {
  const st = resolveLiveStatus({ bridgeStatus: { playing: null, isPlaying: false, queueSize: 0 } });
  assert.deepEqual(st, { title: '', artist: '', isPlaying: false, queueSize: 0 });
});

test('字段缺失不炸', () => {
  assert.deepEqual(resolveLiveStatus({}), { title: '', artist: '', isPlaying: false, queueSize: 0 });
  assert.deepEqual(resolveLiveStatus(), { title: '', artist: '', isPlaying: false, queueSize: 0 });
});

test('bridge 有歌但缺 isPlaying 时，快照的布尔值仍可用', () => {
  const st = resolveLiveStatus({
    bridgeStatus: { playing: { name: '赐我' } },
    snapshot: { isPlaying: true }
  });
  assert.equal(st.title, '赐我');
  assert.equal(st.isPlaying, true);
});
