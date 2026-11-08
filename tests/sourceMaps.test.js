import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInterval, preferHttps, neteaseOuterUrl, isSimilarName,
  mapTencentTracks, mapItunesTracks, pickNeteaseMatches
} from '../src/core/sourceMaps.js';

test('时长解析：中文 / 冒号 / 数字', () => {
  assert.equal(parseInterval('4分29秒'), 269000);
  assert.equal(parseInterval('4:29'), 269000);
  assert.equal(parseInterval('03:58'), 238000);
  assert.equal(parseInterval('1:02:03'), 3723000);
  assert.equal(parseInterval(269), 269000);
  assert.equal(parseInterval(269000), 269000);
  assert.equal(parseInterval(''), 0);
  assert.equal(parseInterval(null), 0);
});

test('http 直链统一改 https，避免混合内容被拦', () => {
  assert.equal(preferHttps('http://ws.stream.qqmusic.qq.com/a.mp3'), 'https://ws.stream.qqmusic.qq.com/a.mp3');
  assert.equal(preferHttps('https://x/a.mp3'), 'https://x/a.mp3');
  assert.equal(preferHttps('//x/a.mp3'), 'https://x/a.mp3');
  assert.equal(preferHttps(''), '');
});

test('网易云外链地址拼装', () => {
  assert.equal(neteaseOuterUrl(186016), 'https://music.163.com/song/media/outer/url?id=186016.mp3');
  assert.equal(neteaseOuterUrl(''), '');
});

test('同名判断忽略括号注释、空格与标点', () => {
  assert.equal(isSimilarName('晴天 (Live)', '晴天'), true);
  assert.equal(isSimilarName('晴天（原唱 周杰伦）', '晴天'), true);
  assert.equal(isSimilarName('Clean (Taylor\'s Version)', 'clean'), true);
  assert.equal(isSimilarName('晴天', '夜曲'), false);
  assert.equal(isSimilarName('', '晴天'), false);
});

test('QQ 搜索结果归一化', () => {
  const tracks = mapTencentTracks([
    { id: 97773, mid: '0039MnYb0qxYhV', song: '晴天', singer: '周杰伦', album: '叶惠美', interval: '4分29秒', pay: '付费' },
    { id: null, mid: '000BEsDj0UUhf8', song: '晴天 (交响改编版)', singer: '维也纳碎片', interval: '3:58' },
    { song: '没有 id 的脏数据' }
  ]);
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].source, 'tencent');
  assert.equal(tracks[0].platform, 'qq');
  assert.equal(tracks[0].name, '晴天');
  assert.equal(tracks[0].artist, '周杰伦');
  assert.equal(tracks[0].duration, 269000);
  assert.equal(tracks[1].id, '000BEsDj0UUhf8');
  assert.equal(tracks[1].duration, 238000);
});

test('iTunes 结果归一化并升级封面尺寸', () => {
  const tracks = mapItunesTracks([{
    trackId: 1001,
    trackName: '晴天 (试听)',
    artistName: '周杰伦',
    collectionName: '叶惠美',
    artworkUrl100: 'https://x/100x100bb.jpg',
    previewUrl: 'https://x/pre.m4a',
    trackTimeMillis: 30000
  }]);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].source, 'itunes');
  assert.equal(tracks[0].url, 'https://x/pre.m4a');
  assert.equal(tracks[0].cover, 'https://x/300x300bb.jpg');
});

test('网易云兜底：只挑同名歌曲，且限制条数', () => {
  const track = { name: '晴天', artist: '周杰伦' };
  const list = [
    { id: 1, song: '晴天' },
    { id: 2, song: '晴天 (Live)' },
    { id: 3, song: '夜曲' },
    { id: 1, song: '晴天 重复' },
    { id: 4, song: '晴天 (女声版)' },
    { id: 5, song: '晴天 (钢琴版)' }
  ];
  const ids = pickNeteaseMatches(list, track, 3);
  assert.deepEqual(ids, ['1', '2', '4']);
  assert.deepEqual(pickNeteaseMatches([], track), []);
});
