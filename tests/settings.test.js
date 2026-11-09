import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, normalizeSettings, atLeastOneSource, resolveMediaMode, DEFAULT_CHAT_PROMPT } from '../src/core/settings.js';
import { REPEAT } from '../src/core/queue.js';

test('默认设置：QQ + iTunes + 免费曲库 + 网易云兜底', () => {
  const s = defaultSettings();
  assert.equal(s.sources.tencent, true);
  assert.equal(s.sources.itunes, true);
  assert.equal(s.sources.audius, true);
  assert.equal(s.sources.netease, true);
  assert.equal(s.prefix, '');
  assert.equal(s.volume, 0.8);
  assert.equal(s.repeat, REPEAT.OFF);
  assert.equal(s.chatListen, true);
});

test('一起听开关能关掉', () => {
  assert.equal(normalizeSettings({ chatListen: false }).chatListen, false);
  assert.equal(normalizeSettings({}).chatListen, true);
});

test('推荐数量被夹在 5~50', () => {
  assert.equal(normalizeSettings({ recCount: 2 }).recCount, 5);
  assert.equal(normalizeSettings({ recCount: 999 }).recCount, 50);
  assert.equal(normalizeSettings({}).recCount, 20);
  assert.equal(normalizeSettings({ recCount: 'abc' }).recCount, 20);
  assert.equal(normalizeSettings({ recCount: 35 }).recCount, 35);
});

test('只推荐能播放的默认开，可关', () => {
  assert.equal(normalizeSettings({}).recFilterPlayable, true);
  assert.equal(normalizeSettings({ recFilterPlayable: false }).recFilterPlayable, false);
});

test('两种通道的提示词默认不同，且能分别自定义', () => {
  const def = defaultSettings();
  assert.notEqual(def.chatPrompt, def.chatPromptTool);
  assert.ok(def.chatPromptTool.indexOf('music_play') !== -1);
  assert.ok(def.chatPrompt.indexOf('mp:play') !== -1);
  assert.ok(def.chatPrompt.indexOf('<!--') !== -1);

  const s = normalizeSettings({ chatCommandMode: 'mark', chatPrompt: 'A {{title}}', chatPromptTool: 'B {{title}}' });
  assert.equal(s.chatCommandMode, 'mark');
  assert.equal(s.chatPrompt, 'A {{title}}');
  assert.equal(s.chatPromptTool, 'B {{title}}');

  assert.equal(normalizeSettings({}).chatCommandMode, 'hybrid');
});

test('一起听提示词：默认带占位符，可改，空值回退', () => {
  const def = defaultSettings();
  assert.ok(def.chatPrompt.indexOf('{{title}}') !== -1);
  assert.equal(def.chatPrompt, DEFAULT_CHAT_PROMPT);

  const custom = normalizeSettings({ chatPrompt: '  只回一句话 {{title}}  ' });
  assert.equal(custom.chatPrompt, '只回一句话 {{title}}');

  assert.equal(normalizeSettings({ chatPrompt: '   ' }).chatPrompt, DEFAULT_CHAT_PROMPT);

  const long = normalizeSettings({ chatPrompt: 'a'.repeat(3000) });
  assert.equal(long.chatPrompt.length, 2000);
});

test('0.1.x 的旧设置会被升级，gd 相关字段丢弃', () => {
  const s = normalizeSettings({
    sources: { gd: false, itunes: true },
    gdPlatform: 'kuwo',
    quality: 128,
    proxy: 'https://x/proxy?url=',
    volume: 0.5
  });
  assert.equal(s.sources.tencent, false);
  assert.equal(s.sources.netease, true);
  assert.equal(s.prefix, 'https://x/proxy?url=');
  assert.equal(s.gdPlatform, undefined);
  assert.equal(s.quality, undefined);
});

test('非法值回退', () => {
  const s = normalizeSettings({ volume: 9, repeat: 'weird', sources: 'x' });
  assert.equal(s.volume, 1);
  assert.equal(s.repeat, REPEAT.OFF);
  assert.equal(s.sources.tencent, true);
});

test('空值/脏数据也安全', () => {
  assert.deepEqual(normalizeSettings(null), defaultSettings());
  assert.deepEqual(normalizeSettings('abc'), defaultSettings());
});

test('前缀会去掉首尾空格', () => {
  const s = normalizeSettings({ prefix: '  https://x.hf.space/proxy?url=  ' });
  assert.equal(s.prefix, 'https://x.hf.space/proxy?url=');
});

test('外观默认值：跟随系统 / 赤红 / 悬浮开 / 悬浮歌词开', () => {
  const s = defaultSettings();
  assert.equal(s.theme, 'auto');
  assert.equal(s.accent, 'red');
  assert.equal(s.floating, true);
  assert.equal(s.floatLyric, true);
});

test('非法主题与主色调回退到默认', () => {
  const s = normalizeSettings({ theme: '彩虹', accent: 'pink' });
  assert.equal(s.theme, 'auto');
  assert.equal(s.accent, 'red');
});

test('主题与主色调可持久化，悬浮开关能关掉', () => {
  const s = normalizeSettings({ theme: 'dark', accent: 'blue', floating: false, floatLyric: false });
  assert.equal(s.theme, 'dark');
  assert.equal(s.accent, 'blue');
  assert.equal(s.floating, false);
  assert.equal(s.floatLyric, false);
});

test('两个搜索源都关掉时至少打开 QQ', () => {
  const s = atLeastOneSource(normalizeSettings({ sources: { tencent: false, itunes: false } }));
  assert.equal(s.sources.tencent, true);
});

test('提示词把「关键词必填 / 单独一行 / 不加消息前缀」写死', () => {
  const mark = defaultSettings().chatPrompt;
  const hybrid = defaultSettings().chatPromptHybrid;

  [mark, hybrid].forEach((text) => {
    assert.ok(text.indexOf('mp:recommend:歌单名|') !== -1, '要给出带竖线的完整格式');
    assert.ok(text.indexOf('关键词') !== -1, '要强调关键词');
    assert.ok(text.indexOf('单独占一行') !== -1, '要强调单独一行');
    assert.ok(text.indexOf('[消息]') !== -1, '要明确不要加消息前缀');
    assert.ok(text.indexOf('40 字') !== -1, '乐评要限 40 字');
    assert.ok(text.length < 2000, '提示词不能被 normalizeSettings 截断');
  });

  // 归一化后仍然完整（截断上限 2000）
  assert.equal(normalizeSettings({}).chatPrompt, mark);
});

test('系统媒体控件：默认自动，非法值回退', () => {
  assert.equal(defaultSettings().systemMedia, 'auto');
  assert.equal(normalizeSettings({}).systemMedia, 'auto');
  assert.equal(normalizeSettings({ systemMedia: 'off' }).systemMedia, 'off');
  assert.equal(normalizeSettings({ systemMedia: 'native' }).systemMedia, 'native');
  assert.equal(normalizeSettings({ systemMedia: '乱写' }).systemMedia, 'auto');
});

test('resolveMediaMode：不映射两边都关，有原生优先原生，没原生用 mediaSession', () => {
  assert.deepEqual(resolveMediaMode({ systemMedia: 'off' }, true), { useNative: false, mediaSession: false });
  assert.deepEqual(resolveMediaMode({ systemMedia: 'off' }, false), { useNative: false, mediaSession: false });

  assert.deepEqual(resolveMediaMode({ systemMedia: 'auto' }, true), { useNative: true, mediaSession: false });
  assert.deepEqual(resolveMediaMode({ systemMedia: 'native' }, true), { useNative: true, mediaSession: false });

  // iOS / 没有背景音频插件：映射与自动都退回 mediaSession
  assert.deepEqual(resolveMediaMode({ systemMedia: 'auto' }, false), { useNative: false, mediaSession: true });
  assert.deepEqual(resolveMediaMode({ systemMedia: 'native' }, false), { useNative: false, mediaSession: true });

  // 老设置里没有 systemMedia 字段
  assert.deepEqual(resolveMediaMode({}, true), { useNative: true, mediaSession: false });
});
