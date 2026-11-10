import test from 'node:test';
import assert from 'node:assert/strict';
import { pickPendingCommands, messageRoleOf } from '../src/core/pendingCommands.js';

const msg = (id, role, content) => ({ id, role, content });

test('核心回归：最新一条是普通回复时，仍能取到上一条带评论的指令', () => {
  const messages = [
    msg('m1', 'assistant', '好听\n<!-- mp:comment:副歌一进来就被击中了 -->'),
    msg('m2', 'assistant', '嗯，我也觉得。')
  ];
  const picked = pickPendingCommands(messages, { mode: 'hybrid' });
  assert.ok(picked, '不能因为最新一条没指令就返回 null');
  assert.equal(picked.id, 'm1');
  assert.equal(picked.cmds[0].type, 'comment');
  assert.equal(picked.cmds[0].arg, '副歌一进来就被击中了');
});

test('完全没有指令时返回 null', () => {
  const messages = [msg('m1', 'assistant', '就是聊天'), msg('m2', 'user', '在吗')];
  assert.equal(pickPendingCommands(messages, { mode: 'hybrid' }), null);
});

test('跳过用户消息（哪怕他写了指令）', () => {
  const messages = [
    msg('u1', 'user', '<!-- mp:comment:我自己写的 -->'),
    msg('a1', 'assistant', '<!-- mp:next -->')
  ];
  const picked = pickPendingCommands(messages, { mode: 'mark' });
  assert.equal(picked.id, 'a1');
});

test('没有 id 的消息跳过，但不会挡住更早的消息', () => {
  const messages = [
    msg('', 'assistant', '<!-- mp:comment:没有 id -->'),
    msg('a1', 'assistant', '<!-- mp:comment:有 id -->')
  ];
  const picked = pickPendingCommands(messages, { mode: 'mark' });
  assert.equal(picked.id, 'a1');
});

test('lastId 只跳过那一条，不会中断扫描', () => {
  const messages = [
    msg('a1', 'assistant', '<!-- mp:comment:更早的 -->'),
    msg('a2', 'assistant', '<!-- mp:next -->')
  ];
  const picked = pickPendingCommands(messages, { mode: 'mark', lastId: 'a2' });
  assert.equal(picked.id, 'a1');
});

test('已执行的跳过，继续往前找', () => {
  const messages = [
    msg('a1', 'assistant', '<!-- mp:comment:第一条 -->'),
    msg('a2', 'assistant', '<!-- mp:comment:第二条 -->')
  ];
  const picked = pickPendingCommands(messages, {
    mode: 'mark',
    done: (cmd) => cmd.arg === '第二条'
  });
  assert.equal(picked.id, 'a1');
  assert.equal(picked.cmds[0].arg, '第一条');
});

test('hybrid 通道过滤 play（点歌交给工具，避免双重执行）', () => {
  const messages = [msg('a1', 'assistant', '<!-- mp:play:晴天 -->')];
  assert.equal(pickPendingCommands(messages, { mode: 'hybrid' }), null);

  const mark = pickPendingCommands(messages, { mode: 'mark' });
  assert.equal(mark.cmds[0].type, 'play');
});

test('一条消息里的多条指令都返回（含混合）', () => {
  const messages = [msg('a1', 'assistant', '<!-- mp:next -->\n<!-- mp:comment:好听 -->')];
  const picked = pickPendingCommands(messages, { mode: 'mark' });
  assert.deepEqual(picked.cmds.map((c) => c.type), ['next', 'comment']);
});

test('角色判定：缺 role 时按 isMe 推断', () => {
  assert.equal(messageRoleOf({ isMe: true }), 'user');
  assert.equal(messageRoleOf({ isMe: false }), 'assistant');
  assert.equal(messageRoleOf({ senderType: 'assistant' }), 'assistant');
});
