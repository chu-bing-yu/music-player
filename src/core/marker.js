/**
 * 标记指令解析：模型在回复正文里写 [[mp:play:晴天]] 这种标记，
 * 插件解析后自己执行，省掉工具调用带来的第二次模型请求。
 *
 * 纯函数，不碰 DOM / storage / 网络，方便单测。
 */

export var MARK_TYPES = ['play', 'next', 'prev', 'pause', 'resume', 'status', 'add', 'comment', 'new', 'recommend', 'fav'];

var PATTERN = /\[\[\s*mp\s*:\s*([a-zA-Z]+)\s*(?::\s*([^\]\n]*))?\]\]/g;
/** 推荐写法：<!-- mp:play:歌名 -->，聊天里按 Markdown 渲染时会被隐藏 */
var COMMENT_PATTERN = /<!--\s*mp\s*:\s*([a-zA-Z]+)\s*(?::\s*([^>\n]*?))?\s*-->/g;

/** 指令类型白名单（防止模型乱写导致误执行） */
function normalizeType(raw) {
  var type = String(raw || '').toLowerCase();
  if (type === 'previous') return 'prev';
  if (type === 'favorite') return 'fav';
  if (MARK_TYPES.indexOf(type) === -1) return '';
  return type;
}

/**
 * @param {string} text 模型回复正文
 * @returns {Array<{type:string, arg:string, raw:string}>}
 */
export function parseCommands(text) {
  var source = String(text || '');
  if (!source) return [];

  var out = [];

  function collect(pattern) {
    var match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(source)) !== null) {
      var type = normalizeType(match[1]);
      if (!type) continue;
      var arg = String(match[2] == null ? '' : match[2]).trim();

      // 需要参数的指令，缺参数直接丢弃
      if ((type === 'play' || type === 'comment' || type === 'new') && !arg) continue;

      out.push({ type: type, arg: arg, raw: String(match[0]) });
      if (out.length >= 6) return; // 一轮最多执行 6 条，防止刷屏
    }
  }

  collect(COMMENT_PATTERN);
  if (out.length < 6) collect(PATTERN);
  return out;
}

/** 从正文里去掉标记，避免把指令原样显示给用户 */
export function stripCommands(text) {
  return String(text || '')
    .replace(COMMENT_PATTERN, '')
    .replace(PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 去重键：同一会话同一条消息里的同一条指令只执行一次 */
export function dedupeKey(conversationId, messageId, cmd) {
  return [conversationId || '', messageId || '', cmd.raw || cmd.type].join('|');
}
