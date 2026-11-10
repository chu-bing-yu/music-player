/**
 * 标记指令解析：模型在回复正文里写 [[mp:play:晴天]] 这种标记，
 * 插件解析后自己执行，省掉工具调用带来的第二次模型请求。
 *
 * 纯函数，不碰 DOM / storage / 网络，方便单测。
 */

export var MARK_TYPES = ['play', 'next', 'prev', 'pause', 'resume', 'status', 'add', 'comment', 'new', 'recommend', 'fav'];

var PATTERN = /\[\[\s*mp\s*:\s*([a-zA-Z]+)\s*(?::\s*([^\]\n]*))?\]\]/g;
/**
 * 推荐写法：<!-- mp:play:歌名 -->，聊天里按 Markdown 渲染时会被隐藏。
 *
 * 参数段用 [\s\S] 允许跨行；闭合符也放宽成 `-{1,2}\s*-?\s*>`：
 * 模型写长乐评时经常把 `-->` 折成「- 换行 >」，旧写法要求连续的 `-->`，
 * 整条指令会被静默丢掉（角色评价了但插件里看不到，就是栽在这）。
 */
var COMMENT_PATTERN = /<!--\s*mp\s*:\s*([a-zA-Z]+)\s*(?::\s*([\s\S]*?))?\s*-{1,2}\s*-?\s*>/g;

/** 参数归一：折叠空白；挑歌的逗号/顿号/分号统一成空格，方便按多关键词搜 */
function normalizeArg(type, raw) {
  var text = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (type === 'recommend') {
    text = text.replace(/[,，、;；]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return text;
}

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
      var arg = normalizeArg(type, match[2]);

      // 需要参数的指令，缺参数直接丢弃。
      // recommend 以前漏在这里：<!-- mp:recommend --> 也会执行，然后插件自己随机抽词搜歌，
      // 表现就是「角色没写指令，却凭空多出一个塞满歌的歌单」。
      if ((type === 'play' || type === 'comment' || type === 'new' || type === 'recommend') && !arg) continue;

      out.push({ type: type, arg: arg, raw: String(match[0]) });
      if (out.length >= 6) return; // 一轮最多执行 6 条，防止刷屏
    }
  }

  collect(COMMENT_PATTERN);
  if (out.length < 6) collect(PATTERN);
  return out;
}

/** 从正文里去掉标记，避免把指令原样显示给用户 */
/**
 * 模型「照抄提示词里的示例」时会写出这些词，必须识别出来拒掉：
 * 例如 <!-- mp:recommend:歌单名|搜索关键词1 搜索关键词2 -->、<!-- mp:comment:一句话评价 -->
 */
var PLACEHOLDER_WORDS = ['歌单名', '搜索关键词', '关键词1', '关键词2', '一句话评价', '歌名', '评价内容'];

export function isPlaceholderArg(text) {
  var s = String(text == null ? '' : text).trim();
  if (!s) return false;
  return PLACEHOLDER_WORDS.some(function (w) { return s.indexOf(w) !== -1; });
}

/**
 * 解析挑歌参数：`歌单名|关键词1 关键词2`，也容忍半角/全角竖线。
 * 没写竖线时整段当关键词（歌单名由调用方兜底）。
 * @returns {{name:string, keyword:string, placeholder:boolean}}
 */
export function parseRecommendArg(raw) {
  var text = String(raw == null ? '' : raw).replace(/｜/g, '|').trim();
  var name = '';
  var keyword = text;
  var idx = text.indexOf('|');
  if (idx !== -1) {
    name = text.slice(0, idx).trim();
    keyword = text.slice(idx + 1).trim();
  }
  return { name: name, keyword: keyword, placeholder: isPlaceholderArg(text) };
}

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
