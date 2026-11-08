import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBg, normalizeBgs, compressImage, LIMITS } from '../src/services/taBg.js';

test('dataURL 背景被接受', () => {
  const bg = normalizeBg({ type: 'data', value: 'data:image/jpeg;base64,AAA', at: 1 });
  assert.equal(bg.type, 'data');
  assert.equal(bg.at, 1);
});

test('https 链接被接受，http 也接受', () => {
  assert.equal(normalizeBg({ type: 'url', value: 'https://a.com/x.jpg' }).type, 'url');
  assert.equal(normalizeBg({ type: 'url', value: 'http://a.com/x.jpg' }).type, 'url');
});

test('非法值被拒绝', () => {
  assert.equal(normalizeBg(null), null);
  assert.equal(normalizeBg({ type: 'url', value: 'javascript:alert(1)' }), null);
  assert.equal(normalizeBg({ type: 'data', value: 'https://a.com/x.jpg' }), null);
  assert.equal(normalizeBg({ type: 'data', value: '' }), null);
});

test('默认 type 为 data', () => {
  assert.equal(normalizeBg({ value: 'data:image/png;base64,BBB' }).type, 'data');
});

test('整表归一化会丢掉坏数据', () => {
  const map = normalizeBgs({
    a: { type: 'url', value: 'https://a.com/1.jpg' },
    b: null,
    c: { type: 'data', value: 'oops' }
  });
  assert.deepEqual(Object.keys(map), ['a']);
});

test('非对象返回空表', () => {
  assert.deepEqual(Object.keys(normalizeBgs(null)), []);
  assert.deepEqual(Object.keys(normalizeBgs([])), []);
});

test('压缩：没有文件', async () => {
  const res = await compressImage(null);
  assert.equal(res.ok, false);
});

test('压缩：非图片类型被拒绝', async () => {
  const res = await compressImage({ type: 'text/plain', size: 10 });
  assert.equal(res.ok, false);
  assert.ok(res.reason.indexOf('图片') !== -1);
});

test('限制常量合理', () => {
  assert.equal(LIMITS.MAX_WIDTH, 900);
  assert.ok(LIMITS.SOFT_SIZE < LIMITS.HARD_SIZE);
});
