import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAudioUrl, isAutoplayBlocked } from '../src/services/player.js';

test('http 直链在 https 页面里升级成 https（混合内容会被拦）', () => {
  assert.equal(
    normalizeAudioUrl('http://ws.stream.qqmusic.qq.com/a.mp3', 'https:'),
    'https://ws.stream.qqmusic.qq.com/a.mp3'
  );
});

test('https 页面里的 https 地址不动', () => {
  assert.equal(
    normalizeAudioUrl('https://cdn.example.com/a.mp3', 'https:'),
    'https://cdn.example.com/a.mp3'
  );
});

test('http 页面保持 http（本地调试/preview 不会被乱升级）', () => {
  assert.equal(
    normalizeAudioUrl('http://cdn.example.com/a.mp3', 'http:'),
    'http://cdn.example.com/a.mp3'
  );
});

test('协议相对地址补上页面协议', () => {
  assert.equal(normalizeAudioUrl('//cdn.example.com/a.mp3', 'https:'), 'https://cdn.example.com/a.mp3');
});

test('空值与空白返回空串', () => {
  assert.equal(normalizeAudioUrl('', 'https:'), '');
  assert.equal(normalizeAudioUrl('   ', 'https:'), '');
  assert.equal(normalizeAudioUrl(null, 'https:'), '');
});

test('识别浏览器自动播放拦截', () => {
  const err = new Error('play() failed because the user didn\'t interact with the document first');
  err.name = 'NotAllowedError';
  assert.equal(isAutoplayBlocked(err), true);

  assert.equal(isAutoplayBlocked(new Error('The request is not allowed by the user agent')), true);
  assert.equal(isAutoplayBlocked(new Error('gesture required')), true);

  const netErr = new Error('网络错误');
  netErr.name = 'NotSupportedError';
  assert.equal(isAutoplayBlocked(netErr), false);
});
