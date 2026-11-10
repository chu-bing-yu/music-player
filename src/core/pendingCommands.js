/**
 * 从聊天消息里挑出「还没执行过的指令」——纯函数，方便单测。
 *
 * 这里曾经有三个会把指令吞掉的坑（角色乐评反复「捕捉不到」的元凶）：
 *  1. 最新那条消息没指令就 `return`，整轮放弃，不再往前找；
 *  2. 先把 lastMessageId 写死再解析，于是那条带指令的旧消息永远轮不到；
 *  3. 消息没有 id 时直接 `return`，后面全不看。
 *
 * 现在的规则：从新到旧扫、跳过用户消息 / 无 id / 已执行，**没命中就继续往前**，
 * 全都没有才返回 null。
 */

import { parseCommands } from './marker.js';

export function messageTextOf(msg) {
  if (!msg) return '';
  return String(msg.content || msg.text || msg.body || '');
}

export function messageRoleOf(msg) {
  if (!msg) return '';
  return String(msg.role || msg.senderType || (msg.isMe ? 'user' : 'assistant'));
}

export function messageIdOf(msg) {
  if (!msg) return '';
  return String(msg.id || msg.messageId || msg.createdAt || '');
}

/**
 * @param {Array} messages 宿主 getShortTerm 的返回
 * @param {{mode?:string, lastId?:string, done?:(cmd:Object, id:string, key:string)=>boolean}} [opts]
 * @returns {{id:string, cmds:Object[]}|null} 取不到就 null（调用方不要因此停掉轮询）
 */
export function pickPendingCommands(messages, opts) {
  var o = opts || {};
  var list = Array.isArray(messages) ? messages : [];
  var mode = o.mode || 'hybrid';
  var lastId = String(o.lastId || '');
  var done = typeof o.done === 'function' ? o.done : function () { return false; };

  for (var i = list.length - 1; i >= 0; i--) {
    var msg = list[i];
    if (messageRoleOf(msg) !== 'assistant') continue;

    var id = messageIdOf(msg);
    if (!id) continue;
    if (lastId && id === lastId) continue;

    var cmds = parseCommands(messageTextOf(msg));
    // 混合通道：点歌走工具（有卡片），这里跳过 play 免得同一首被处理两次
    if (mode === 'hybrid') {
      cmds = cmds.filter(function (c) { return c.type !== 'play'; });
    }
    if (!cmds.length) continue;

    var pending = cmds.filter(function (cmd) { return !done(cmd, id); });
    if (!pending.length) continue;

    return { id: id, cmds: pending };
  }

  return null;
}
