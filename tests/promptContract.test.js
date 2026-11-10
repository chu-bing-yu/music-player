/**
 * 提示词 ↔ 解析器 契约测试。
 *
 * 以前改提示词不会让任何测试变红，于是「指令格式又被写坏」反复出现。
 * 这里把提示词里**每一个示例**抽出来，真的丢给 parseCommands 跑一遍：
 *  - 类型必须合法；
 *  - play / comment / new / recommend 必须有参数；
 *  - recommend 必须带「歌单名|关键词」；
 *  - 参数里不能出现占位词（说明示例被照抄）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CHAT_PROMPT, HYBRID_CHAT_PROMPT, TOOL_CHAT_PROMPT, defaultSettings } from '../src/core/settings.js';
import { parseCommands, MARK_TYPES, parseRecommendArg, isPlaceholderArg } from '../src/core/marker.js';

const PROMPTS = [
  ['DEFAULT_CHAT_PROMPT', DEFAULT_CHAT_PROMPT],
  ['HYBRID_CHAT_PROMPT', HYBRID_CHAT_PROMPT]
];

const NEED_ARG = ['play', 'comment', 'new', 'recommend'];

function examplesOf(text) {
  return String(text || '').match(/<!--\s*mp\s*:[^>]*-->/g) || [];
}

test('提示词里的每个示例都能被解析器解析，且参数合法', () => {
  PROMPTS.forEach(([name, text]) => {
    const list = examplesOf(text);
    assert.ok(list.length >= 4, `${name} 至少要给出 4 个示例，现在 ${list.length}`);

    list.forEach((raw) => {
      const cmds = parseCommands(raw);
      assert.equal(cmds.length, 1, `${name} 的示例解析不出来：${raw}`);

      const cmd = cmds[0];
      assert.ok(MARK_TYPES.indexOf(cmd.type) !== -1, `${name} 示例类型非法：${raw}`);

      if (NEED_ARG.indexOf(cmd.type) !== -1) {
        assert.ok(cmd.arg && cmd.arg.length > 0, `${name} 示例缺参数：${raw}`);
      }
      if (cmd.type === 'recommend') {
        assert.ok(raw.indexOf('|') !== -1, `${name} 的挑歌示例必须带「歌单名|关键词」：${raw}`);
        assert.ok(cmd.arg.indexOf('|') !== -1, `解析后也要有竖线：${raw}`);
      }
      if (cmd.type === 'recommend' || cmd.type === 'comment' || cmd.type === 'play') {
        assert.equal(isPlaceholderArg(cmd.arg), false, `${name} 示例里不能出现占位词：${raw}`);
      }
    });
  });
});

test('提示词明确要求「换成本次内容、不要照抄示例」', () => {
  PROMPTS.forEach(([name, text]) => {
    assert.ok(text.indexOf('照抄') !== -1, `${name} 要写明不要照抄示例`);
    assert.ok(text.indexOf('换成本次真实内容') !== -1, `${name} 要写明替换成真实内容`);
  });
});

test('提示词要求「评论了就必须写评价指令」', () => {
  PROMPTS.forEach(([name, text]) => {
    assert.ok(text.indexOf('TA 页看不到') !== -1, `${name} 要说清不写指令的后果`);
  });
});

test('提示词长度不会被 normalizeSettings 截断（<2000）', () => {
  const s = defaultSettings();
  [s.chatPrompt, s.chatPromptHybrid, s.chatPromptTool].forEach((t) => {
    assert.ok(String(t).length < 2000, '提示词超过 2000 字会被截断：' + String(t).length);
  });
  assert.ok(TOOL_CHAT_PROMPT.indexOf('keyword') !== -1);
});

test('pickRecommendArg：竖线前后拆开、全角竖线也认', () => {
  assert.deepEqual(parseRecommendArg('雨夜书单|城市雨天 华语慢歌'), {
    name: '雨夜书单', keyword: '城市雨天 华语慢歌', placeholder: false
  });
  assert.deepEqual(parseRecommendArg('雨夜书单｜城市雨天'), {
    name: '雨夜书单', keyword: '城市雨天', placeholder: false
  });
});

test('pickRecommendArg：没竖线时整段当关键词，歌单名留空', () => {
  const r = parseRecommendArg('古风 戏腔');
  assert.equal(r.name, '');
  assert.equal(r.keyword, '古风 戏腔');
  assert.equal(r.placeholder, false);
});

test('pickRecommendArg：照抄示例会被标记为占位', () => {
  const r = parseRecommendArg('歌单名|搜索关键词1 搜索关键词2');
  assert.equal(r.placeholder, true);

  assert.equal(isPlaceholderArg('一句话评价'), true);
  assert.equal(isPlaceholderArg('副歌一进来就被击中了'), false);
});

test('pickRecommendArg：空值安全', () => {
  assert.deepEqual(parseRecommendArg(''), { name: '', keyword: '', placeholder: false });
  assert.deepEqual(parseRecommendArg(null), { name: '', keyword: '', placeholder: false });
});
