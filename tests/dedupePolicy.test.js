/**
 * 去重策略：写库类指令长期有效（避免重复建歌单/写评论），播放控制类保留短窗口；
 * 失败重试只针对「真失败」，幂等冲突不重试。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { contentDedupeTtl, shouldRetryResult, LONG_DEDUPE_TYPES } from '../src/core/marker.js';

const SHORT = 60 * 1000;

test('写库类内容 key 永不过期', () => {
  LONG_DEDUPE_TYPES.forEach((type) => {
    assert.equal(contentDedupeTtl('c|' + type + '|参数', SHORT), 0, type + ' 应该长期有效');
  });
});

test('播放控制类仍是 60 秒窗口', () => {
  ['play', 'next', 'prev', 'pause', 'resume'].forEach((type) => {
    assert.equal(contentDedupeTtl('c|' + type + '|x', SHORT), SHORT);
  });
});

test('消息级 key 不受类型影响', () => {
  assert.equal(contentDedupeTtl('conv|msg-1|recommend|古风', SHORT), SHORT);
});

test('空 key 安全', () => {
  assert.equal(contentDedupeTtl('', SHORT), SHORT);
  assert.equal(contentDedupeTtl(null, SHORT), SHORT);
});

test('shouldRetryResult：成功不重试', () => {
  assert.equal(shouldRetryResult({ ok: true }), false);
  assert.equal(shouldRetryResult(null), false);
  assert.equal(shouldRetryResult(undefined), false);
});

test('shouldRetryResult：普通失败要重试', () => {
  assert.equal(shouldRetryResult({ ok: false, reason: '网络超时' }), true);
  assert.equal(shouldRetryResult({ ok: false, reason: '没找到可推荐的歌' }), true);
  assert.equal(shouldRetryResult({ ok: false }), true);
});

test('shouldRetryResult：幂等冲突不重试', () => {
  assert.equal(shouldRetryResult({ ok: false, reason: '这首已经在歌单里了' }), false);
  assert.equal(shouldRetryResult({ ok: false, reason: '歌单已存在' }), false);
  assert.equal(shouldRetryResult({ ok: false, reason: '重复执行' }), false);
});
