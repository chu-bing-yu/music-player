import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, activeLineIndex, pickLrc } from '../src/core/lrc.js';

const SAMPLE = [
  '[ti:晴天]',
  '[ar:周杰伦]',
  '[offset:0]',
  '[00:00.00]晴天 - 周杰伦',
  '[00:02.25]词：周杰伦',
  '[00:09.5]故事的小黄花',
  ''
].join('\n');

test('解析 LRC：跳过元信息与空行', () => {
  const lines = parseLrc(SAMPLE);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].time, 0);
  assert.equal(lines[0].text, '晴天 - 周杰伦');
  assert.equal(lines[1].time, 2250);
  assert.equal(lines[2].time, 9500);
});

test('一行多个时间戳会拆成多行', () => {
  const lines = parseLrc('[00:01.00][00:05.00]副歌\n[00:03.00]主歌');
  assert.deepEqual(lines.map(l => l.time), [1000, 3000, 5000]);
  assert.equal(lines[0].text, '副歌');
  assert.equal(lines[2].text, '副歌');
});

test('三位毫秒也能解析', () => {
  const lines = parseLrc('[01:02.345]测试');
  assert.equal(lines[0].time, 62345);
});

test('空歌词与脏数据不崩', () => {
  assert.deepEqual(parseLrc(''), []);
  assert.deepEqual(parseLrc(null), []);
  assert.deepEqual(parseLrc('没有时间戳的一行'), []);
});

test('按时间找当前行', () => {
  const lines = parseLrc(SAMPLE);
  assert.equal(activeLineIndex(lines, 0), 0);
  assert.equal(activeLineIndex(lines, 2000), 0);
  assert.equal(activeLineIndex(lines, 2260), 1);
  assert.equal(activeLineIndex(lines, 20000), 2);
  assert.equal(activeLineIndex(lines, -1), -1);
  assert.equal(activeLineIndex([], 100), -1);
});

test('pickLrc 兼容多种返回结构', () => {
  assert.equal(pickLrc(null), '');
  assert.equal(pickLrc('[00:00.00]直出'), '[00:00.00]直出');
  assert.equal(pickLrc({ data: { lrc: 'A' } }), 'A');
  assert.equal(pickLrc({ data: { lyric: 'B' } }), 'B');
  assert.equal(pickLrc({ data: 'C' }), 'C');
  assert.equal(pickLrc({ nope: 1 }), '');
});
