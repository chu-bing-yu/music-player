import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfilePrompt, parseRecommendJson, pickSeeds, clampCount } from '../src/services/recommend.js';
import { defaultPrefs } from '../src/core/prefs.js';

test('画像提示词包含偏好、最近在听、收藏与数量', () => {
  const text = buildProfilePrompt(
    defaultPrefs(),
    [{ name: '晴天', artist: '周杰伦' }],
    [{ name: '夜曲', artist: '周杰伦' }],
    24
  );
  assert.ok(text.indexOf('曲风与语种') !== -1);
  assert.ok(text.indexOf('《晴天》') !== -1);
  assert.ok(text.indexOf('《夜曲》') !== -1);
  assert.ok(text.indexOf('挑 24 首') !== -1);
  assert.ok(text.indexOf('只输出 JSON') !== -1);
});

test('没有历史时也不报错', () => {
  const text = buildProfilePrompt(defaultPrefs(), [], [], 20);
  assert.ok(text.indexOf('暂无记录') !== -1);
});

test('数量被夹在 5~50', () => {
  assert.equal(clampCount(3), 5);
  assert.equal(clampCount(999), 50);
  assert.equal(clampCount('abc'), 20);
  assert.equal(clampCount(12), 12);
});

test('种子随机：同一份数据两次抽样不完全相同', () => {
  const prefs = defaultPrefs();
  const recent = [{ name: 'a', artist: '周杰伦' }, { name: 'b', artist: '孙燕姿' }];
  const favorites = [{ name: 'c', artist: '五月天' }];

  const a = pickSeeds(prefs, recent, favorites, 1111);
  const b = pickSeeds(prefs, recent, favorites, 2222);

  assert.ok(a.length >= 2 && a.length <= 3);
  assert.ok(b.length >= 2 && b.length <= 3);
  assert.notDeepEqual(a, b, '不同时间戳应产生不同种子');
});

test('种子来自最近播放/收藏/偏好/场景词', () => {
  const seeds = pickSeeds(defaultPrefs(), [{ name: 'x', artist: '周杰伦' }], [], Date.now());
  const pool = ['周杰伦', '夜晚', '通勤', '雨天', '健身', '独处', '周末', '开车', '睡前'];
  const fromPrefs = defaultPrefs().map((p) => p.prompt);
  seeds.forEach((s) => {
    assert.ok(pool.indexOf(s) !== -1 || fromPrefs.indexOf(s) !== -1, s);
  });
});

test('种子不会重复', () => {
  const seeds = pickSeeds(defaultPrefs(), [{ name: 'x', artist: '周杰伦' }, { name: 'y', artist: '周杰伦' }], [], 99);
  assert.equal(new Set(seeds).size, seeds.length);
});

test('解析标准 JSON', () => {
  const parsed = parseRecommendJson('{"playlistName":"夜色慢行","keywords":["城市夜晚"],"tracks":[{"name":"夜曲","artist":"周杰伦"}]}');
  assert.equal(parsed.playlistName, '夜色慢行');
  assert.equal(parsed.tracks.length, 1);
  assert.equal(parsed.tracks[0].name, '夜曲');
  assert.deepEqual(parsed.keywords, ['城市夜晚']);
});

test('解析带代码块与前后废话', () => {
  const text = '好的，这是推荐：\n```json\n{"tracks":[{"name":"稻香","artist":"周杰伦"}]}\n```\n希望你喜欢';
  const parsed = parseRecommendJson(text);
  assert.equal(parsed.tracks.length, 1);
  assert.equal(parsed.tracks[0].name, '稻香');
});

test('解析字符串数组形式的 tracks', () => {
  const parsed = parseRecommendJson('{"tracks":["稻香","夜曲"]}');
  assert.equal(parsed.tracks.length, 2);
  assert.equal(parsed.tracks[0].artist, '');
});

test('非法 JSON 返回 null', () => {
  assert.equal(parseRecommendJson('抱歉我不能推荐'), null);
  assert.equal(parseRecommendJson('{不合法}'), null);
});

test('数量不再被写死 8 首', () => {
  const many = new Array(20).fill(0).map((_, i) => ({ name: 'song' + i, artist: 'a' }));
  const parsed = parseRecommendJson(JSON.stringify({ tracks: many }));
  assert.equal(parsed.tracks.length, 20);
});

test('缺少歌名的项被丢弃', () => {
  const parsed = parseRecommendJson('{"tracks":[{"artist":"周杰伦"},{"name":"夜曲","artist":"周杰伦"}]}');
  assert.equal(parsed.tracks.length, 1);
});
