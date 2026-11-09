import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommands, stripCommands, dedupeKey, MARK_TYPES } from '../src/core/marker.js';

test('解析点歌标记', () => {
  const list = parseCommands('好呀，给你放这首 [[mp:play:晴天]]');
  assert.equal(list.length, 1);
  assert.equal(list[0].type, 'play');
  assert.equal(list[0].arg, '晴天');
});

test('解析无参数指令', () => {
  const list = parseCommands('[[mp:next]] 下一首\n[[mp:pause]]');
  assert.deepEqual(list.map((c) => c.type), ['next', 'pause']);
});

test('previous / favorite 归一化', () => {
  const list = parseCommands('[[mp:previous]][[mp:favorite]]');
  assert.deepEqual(list.map((c) => c.type), ['prev', 'fav']);
});

test('未知类型被忽略', () => {
  assert.equal(parseCommands('[[mp:hack:rm]]').length, 0);
});

test('play 缺参数丢弃', () => {
  assert.equal(parseCommands('[[mp:play:]]').length, 0);
});

test('recommend 缺参数直接丢弃（不再凭空挑歌）', () => {
  assert.equal(parseCommands('<!-- mp:recommend -->').length, 0);
  assert.equal(parseCommands('[[mp:recommend:]]').length, 0);
  // 只给歌单名没有关键词：仍然算有参数，交给执行层判断（它自己会要求竖线后有关键词）
  assert.equal(parseCommands('<!-- mp:recommend:雨夜书单|城市雨天 -->').length, 1);
});

test('comment 可带中文与空格', () => {
  const list = parseCommands('[[mp:comment:这首前奏很好听]]');
  assert.equal(list.length, 1);
  assert.equal(list[0].arg, '这首前奏很好听');
});

test('一轮最多 6 条', () => {
  const text = new Array(10).fill('[[mp:next]]').join('');
  assert.equal(parseCommands(text).length, 6);
});

test('strip 去掉标记只留正文', () => {
  const text = '给你放 [[mp:play:夜曲]] 啦';
  assert.equal(stripCommands(text), '给你放  啦');
});

test('HTML 注释形式也能解析（聊天里会隐藏）', () => {
  const list = parseCommands('这就切过去\n<!-- mp:play:关山酒 -->');
  assert.equal(list.length, 1);
  assert.equal(list[0].type, 'play');
  assert.equal(list[0].arg, '关山酒');
});

test('注释形式的多条指令', () => {
  const list = parseCommands('<!-- mp:next -->\n<!-- mp:resume -->');
  assert.deepEqual(list.map((c) => c.type), ['next', 'resume']);
});

test('strip 也能去掉注释形式', () => {
  assert.equal(stripCommands('好听 <!-- mp:pause -->'), '好听');
});

test('注释指令允许跨行（长乐评被折行也能认）', () => {
  const list = parseCommands('好听\n<!-- mp:comment:克制又有张力的唱腔，\n把执念与求而不得唱得透彻\n-->');
  assert.equal(list.length, 1);
  assert.equal(list[0].type, 'comment');
  assert.equal(list[0].arg, '克制又有张力的唱腔， 把执念与求而不得唱得透彻');
});

test('挑歌参数里的逗号/顿号/分号归一成空格', () => {
  const a = parseCommands('<!-- mp:recommend:古风|古风,戏腔、国风 -->');
  assert.equal(a.length, 1);
  assert.equal(a[0].arg, '古风|古风 戏腔 国风');

  const b = parseCommands('<!-- mp:recommend:夜跑|电子;爵士 -->');
  assert.equal(b[0].arg, '夜跑|电子 爵士');
});

test('带 [消息] 前缀也不影响解析', () => {
  const text = '[消息] 美化测试：旋律都在线，直接加进去了\n<!-- mp:recommend:古风|古风 戏腔 -->';
  const list = parseCommands(text);
  assert.equal(list.length, 1);
  assert.equal(list[0].arg, '古风|古风 戏腔');
});

test('去重键稳定', () => {
  const cmd = { type: 'play', arg: '晴天', raw: '[[mp:play:晴天]]' };
  assert.equal(dedupeKey('c1', 'm1', cmd), dedupeKey('c1', 'm1', cmd));
  assert.notEqual(dedupeKey('c1', 'm1', cmd), dedupeKey('c2', 'm1', cmd));
});

test('类型白名单完整', () => {
  ['play', 'next', 'prev', 'pause', 'resume', 'add', 'comment', 'new', 'recommend', 'fav']
    .forEach((t) => assert.ok(MARK_TYPES.includes(t), t));
});
