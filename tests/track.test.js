import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTrack, trackKey, trackLine, dedupeTracks } from '../src/core/track.js';
import { fmtTime, fmtCount, clip, fmtSummary } from '../src/core/format.js';

test('GD 风格数据归一化', () => {
  const t = normalizeTrack({
    source: 'gd',
    id: 123,
    name: '晴天',
    artist: ['周杰伦'],
    album: '叶惠美',
    pic_id: 'pic1',
    duration: 269
  }, 'gd');
  assert.equal(t.id, '123');
  assert.equal(t.name, '晴天');
  assert.equal(t.artist, '周杰伦');
  assert.equal(t.album, '叶惠美');
  assert.equal(t.picId, 'pic1');
  assert.equal(t.duration, 269);
});

test('iTunes 风格数据归一化', () => {
  const t = normalizeTrack({
    trackId: 9,
    trackName: 'Song',
    artistName: 'Someone',
    collectionName: 'Album',
    artworkUrl100: 'https://x/100x100bb.jpg',
    previewUrl: 'https://x/pre.m4a',
    trackTimeMillis: 30000
  }, 'itunes');
  assert.equal(t.id, '9');
  assert.equal(t.name, 'Song');
  assert.equal(t.artist, 'Someone');
  assert.equal(t.url, 'https://x/pre.m4a');
  assert.equal(t.duration, 30000);
});

test('多歌手数组与缺失字段兜底', () => {
  const t = normalizeTrack({ id: 1, name: '合唱', artist: [{ name: 'A' }, 'B'] }, 'gd');
  assert.equal(t.artist, 'A / B');
  const empty = normalizeTrack({ id: 2 }, 'gd');
  assert.equal(empty.name, '未知歌曲');
  assert.equal(empty.artist, '未知歌手');
});

test('没有 id 的条目直接丢弃', () => {
  assert.equal(normalizeTrack({ name: 'x' }, 'gd'), null);
  assert.equal(normalizeTrack(null, 'gd'), null);
});

test('不同音源同 id 不会撞键', () => {
  const a = normalizeTrack({ source: 'gd', platform: 'netease', id: 5 }, 'gd');
  const b = normalizeTrack({ source: 'itunes', id: 5 }, 'itunes');
  assert.notEqual(trackKey(a), trackKey(b));
  assert.equal(trackKey(a), 'gd:netease:5');
});

test('dedupeTracks 保持顺序并去掉重复键', () => {
  const list = [
    normalizeTrack({ source: 'gd', id: 1, name: 'A' }, 'gd'),
    normalizeTrack({ source: 'gd', id: 1, name: 'A2' }, 'gd'),
    normalizeTrack({ source: 'itunes', id: 1, name: 'B' }, 'itunes')
  ];
  const out = dedupeTracks(list);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'A');
});

test('trackLine 用于文案拼接', () => {
  const t = normalizeTrack({ source: 'gd', id: 1, name: '晴天', artist: '周杰伦' }, 'gd');
  assert.equal(trackLine(t), '周杰伦 - 晴天');
});

test('时间格式化', () => {
  assert.equal(fmtTime(0), '00:00');
  assert.equal(fmtTime(65000), '01:05');
  assert.equal(fmtTime(3600000), '1:00:00');
  assert.equal(fmtTime(-5), '00:00');
});

test('数字与文本格式化', () => {
  assert.equal(fmtCount(12000), '1.2万');
  assert.equal(fmtCount(88), '88');
  assert.equal(clip('abcdef', 4), 'abc…');
  assert.equal(clip('ab', 4), 'ab');
  assert.equal(fmtSummary(0, 0), '空歌单');
  assert.equal(fmtSummary(3, 0), '3 首');
});
