/** 插件设置：默认值 + 归一化 */

import { REPEAT_ORDER, REPEAT } from './queue.js';

export var APP_ID = 'music-player';
export var SCHEMA_VERSION = 4;

/**
 * 公共网易云 API 实例（Netlify Functions，白名单版）。
 * 不填也能扫码登录；用户填了自己的地址就用自己的，清空则回落到这里。
 */
export var DEFAULT_NETEASE_API = 'https://netease-api-music-player.netlify.app';

/** 标记通道的提示词；占位符：{{title}} {{artist}} {{state}} {{queue}} */
export var DEFAULT_CHAT_PROMPT = [
  '【音乐插件】当前正在播放《{{title}}》（{{artist}}）{{state}}，队列 {{queue}} 首。',
  '',
  '你能操作音乐。需要操作时，在回复最后单独一行写一条 HTML 注释指令（聊天里不会显示）。示例：',
  '点歌：<!-- mp:play:晴天 -->',
  '上一首 <!-- mp:prev -->　下一首 <!-- mp:next -->　暂停 <!-- mp:pause -->　继续 <!-- mp:resume -->',
  '把当前这首收进你的歌单：<!-- mp:add -->',
  '给当前这首写评价：<!-- mp:comment:副歌一进来就被击中了 -->',
  '新建歌单：<!-- mp:new:雨夜书单 -->',
  '给用户挑几首：<!-- mp:recommend:雨夜书单|城市雨天 华语慢歌 -->',
  '',
  '规则：',
  '1. 把示例里的歌名 / 歌单名 / 关键词 / 评价换成本次真实内容，照抄示例文字等于没执行；',
  '2. 指令单独占一行，行首不要加「[消息]」、角色名、冒号，也不要包在括号或引号里；不要调用任何工具；',
  '3. 挑歌必须写成「歌单名|关键词」：竖线前后都要有真实内容，少一个都不会建歌单；关键词写流派 / 场景 / 情绪（如「古风 戏腔」），不要只写歌名；',
  '4. 评价一行、40 字以内、不要换行；你既然评论了这首歌，就必须写这条评价指令，否则 TA 页看不到你的评价；',
  '5. 没有写指令就等于没有操作，不要只说「已经加好了」「已经在播了」；用户让你放歌时必须写点歌指令。'
].join('\n');

/** 混合通道：点歌走工具（保证有卡片），其余操作走注释指令 */
export var HYBRID_CHAT_PROMPT = [
  '【音乐插件】当前正在播放《{{title}}》（{{artist}}）{{state}}，队列 {{queue}} 首。',
  '',
  '操作规则：',
  '1. 用户想听歌 / 换歌 → 必须调用工具 music_play（这样才会发「一起听」卡片）；',
  '2. 其他操作 → 在回复最后单独一行写 HTML 注释指令（聊天里不会显示）。示例：',
  '   下一首 <!-- mp:next -->　上一首 <!-- mp:prev -->　暂停 <!-- mp:pause -->　继续 <!-- mp:resume -->',
  '   把当前这首收进你的歌单 <!-- mp:add -->',
  '   给当前这首写评价 <!-- mp:comment:副歌一进来就被击中了 -->',
  '   新建歌单 <!-- mp:new:雨夜书单 -->',
  '   给用户挑几首 <!-- mp:recommend:雨夜书单|城市雨天 华语慢歌 -->',
  '3. 把示例里的歌单名 / 关键词 / 评价换成本次真实内容，照抄示例文字等于没执行；指令单独占一行，行首不要加「[消息]」、角色名、冒号；',
  '4. 挑歌必须写成「歌单名|关键词」，竖线前后都要有真实内容，少一个都不会建歌单；关键词写流派 / 场景 / 情绪（如「古风 戏腔」），不要只写歌名；',
  '5. 评价一行、40 字以内、不要换行；你既然评论了这首歌，就必须写这条评价指令，否则 TA 页看不到；',
  '6. 没有写指令就等于没有操作，不要只说「已经加好了」；',
  '7. 切歌时顺带自然地说一句你对这首歌的感受。'
].join('\n');

/** 工具通道的提示词（标记通道不可用时用） */
export var TOOL_CHAT_PROMPT = [
  '【音乐插件】当前正在播放《{{title}}》（{{artist}}）{{state}}，队列 {{queue}} 首。',
  '可用工具：music_play（点歌）、music_next、music_previous、music_pause、music_resume、',
  'music_add_to_playlist（把当前歌收进你的歌单）、music_comment（给当前歌写评价）、',
  'music_recommend（给别人挑歌）、music_status、music_favorite。',
  '规则：用户让你放歌时必须真的调用工具，不能只在文字里说「加好了」；',
  'music_recommend 必须带 keyword（流派/场景/情绪），没有关键词就不要调用、也不要吹嘘挑好了；工具返回失败就照实说。'
].join('\n');

export var THEMES = [
  { id: 'auto', name: '跟随系统' },
  { id: 'light', name: '白天' },
  { id: 'dark', name: '夜间' }
];

/** 播放模式：四选一，随机和循环不再并存 */
export var PLAY_MODES = [
  { id: 'sequence', name: '顺序播放' },
  { id: 'loop', name: '列表循环' },
  { id: 'one', name: '单曲循环' },
  { id: 'shuffle', name: '随机播放' }
];

export var PLAY_MODE_ORDER = ['sequence', 'loop', 'one', 'shuffle'];

export function playModeLabel(mode) {
  var hit = PLAY_MODES.filter(function (m) { return m.id === mode; })[0];
  return hit ? hit.name : '顺序播放';
}

export function nextPlayMode(mode) {
  var i = PLAY_MODE_ORDER.indexOf(mode);
  return PLAY_MODE_ORDER[(i + 1) % PLAY_MODE_ORDER.length];
}

/** 由 playMode 派生旧的 repeat/shuffle，供队列逻辑继续使用 */
export function modeToQueueFlags(mode) {
  if (mode === 'shuffle') return { repeat: REPEAT.OFF, shuffle: true };
  if (mode === 'one') return { repeat: REPEAT.ONE, shuffle: false };
  if (mode === 'loop') return { repeat: REPEAT.ALL, shuffle: false };
  return { repeat: REPEAT.OFF, shuffle: false };
}

/**
 * 界面风格：与日夜模式正交。
 * mag = 杂志风（宋体标题、直角封面、细分隔线、竖幅封面错落）
 * classic = 经典（无衬线、圆角卡片、方形封面、胶囊按钮）
 */
export var UI_SKINS = [
  { id: 'mag', name: '杂志风' },
  { id: 'classic', name: '经典' }
];

/** 当前是不是经典皮肤（默认杂志风） */
export function isClassic(settings) {
  return !!(settings && settings.uiTheme === 'classic');
}

/**
 * 系统媒体控件（安卓通知栏/灵动胶囊、iOS 锁屏与灵动岛）三档：
 * auto   自动：能接原生就接原生，接不上就用网页 mediaSession
 * native 映射：尽量交给系统媒体控件（没有原生时退回 mediaSession）
 * off    不映射：完全不注册媒体会话，系统里不出现媒体卡片
 */
export var MEDIA_MODES = [
  { id: 'auto', name: '自动' },
  { id: 'native', name: '映射' },
  { id: 'off', name: '不映射' }
];

/**
 * 决定「用宿主原生播放引擎」还是「网页播放 + navigator.mediaSession」。
 * @param {Object} settings
 * @param {boolean} hasNative 宿主是否提供 BackgroundAudio 插件
 * @returns {{useNative:boolean, mediaSession:boolean}}
 */
export function resolveMediaMode(settings, hasNative) {
  var mode = (settings && settings.systemMedia) || 'auto';
  if (mode === 'off') return { useNative: false, mediaSession: false };
  if (hasNative) return { useNative: true, mediaSession: false };
  // 没有原生播放器：映射 / 自动都只能用网页 mediaSession 顶上（iOS 就靠这个）
  return { useNative: false, mediaSession: true };
}

export var ACCENTS = [
  { id: 'red', name: '赤红', color: '#e14b4b' },
  { id: 'blue', name: '雾蓝', color: '#3b82f6' },
  { id: 'green', name: '松绿', color: '#2f9e44' },
  { id: 'purple', name: '藕紫', color: '#8b5cf6' },
  { id: 'amber', name: '暖橙', color: '#e8850c' }
];

export function defaultSettings() {
  return {
    schemaVersion: SCHEMA_VERSION,
    sources: { tencent: true, itunes: true, audius: true, netease: true },
    prefix: '',
    volume: 0.8,
    playMode: 'sequence',
    // repeat / shuffle 是由 playMode 派生的，只为兼容旧代码
    repeat: REPEAT.OFF,
    shuffle: false,
    theme: 'auto',
    /** 界面风格：mag = 杂志风；classic = 经典 */
    uiTheme: 'mag',
    /** 系统媒体控件：auto / native（映射）/ off（不映射） */
    systemMedia: 'auto',
    accent: 'red',
    // 空 = 用预设色块；有值 = 用户自选色（优先级更高）
    accentColor: '',
    floating: true,
    floatLyric: true,
    // 网易云：默认走公共实例，用户也可以改成自己部署的地址 + 扫码登录后的 cookie
    neteaseApi: DEFAULT_NETEASE_API,
    neteaseCookie: '',
    neteaseProfile: '',
    chatListen: true,
    // 角色点歌时：true = 只把第一首加进队列；false = 直接替换成这首
    chatAddToQueue: true,
    // 工具通道 / 混合通道的提示词（和标记通道分开存，设置页按当前模式显示对应那份）
    chatPromptTool: TOOL_CHAT_PROMPT,
    chatPromptHybrid: HYBRID_CHAT_PROMPT,
    /** 点聊天卡片时要不要重新播放这首；默认只显示当前状态 */
    cardTapPlay: false,
    /** 推荐页刷新策略：manual = 点「换一批」才调模型（默认）；auto = 每次进入都调；local = 不调模型 */
    recMode: 'manual',
    /** 每次推荐多少首（5~50） */
    recCount: 20,
    /** 只推荐能解析出播放地址的歌（每批会多花 2~4 秒） */
    recFilterPlayable: true,
    /** 音源策略：single = 只用主源；multi = 全开（会员时网易云优先） */
    sourceMode: 'multi',
    /** 单选时的主源 */
    primarySource: 'tencent',
    /** TA 页花瓣飘落动效 */
    taMotion: true,
    /** 自定义手写字体链接（留空用内置 Italianno） */
    taFontUrl: '',
    /** 角色签名文字（英文花体；留空则自动用角色 handle，再没有就不显示） */
    taSign: '',
    // 指令通道：hybrid = 点歌用工具、其余用注释（默认）；
    // tool = 全走工具（多一次调用但最稳）；mark = 全走注释（最省调用）
    chatCommandMode: 'hybrid',
    // 推荐歌单的搜索词由角色自己决定（指令里带参数），这里不再保存固定词
    chatPrompt: DEFAULT_CHAT_PROMPT,
    /**
     * 极简模式：插件不再轮询、不重建、不自动暂停，只把队列交给原生播放器。
     * v0.5.0 能让状态栏按钮生效的正是这条路径，所以默认开着。
     */
    nativeMinimal: true
  };
}

function bool(v, fallback) {
  return typeof v === 'boolean' ? v : fallback;
}

function clampNum(v, min, max, fallback) {
  var n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pickId(list, value, fallback) {
  var hit = list.filter(function (item) { return item.id === value; })[0];
  return hit ? hit.id : fallback;
}

function resolvePlayMode(s) {
  if (PLAY_MODE_ORDER.indexOf(s.playMode) !== -1) return s.playMode;
  // 旧数据没有 playMode：按 shuffle / repeat 推导
  if (s.shuffle) return 'shuffle';
  if (s.repeat === REPEAT.ONE) return 'one';
  if (s.repeat === REPEAT.ALL) return 'loop';
  return 'sequence';
}

/** 网易云地址：非空就用用户的（去掉尾部斜杠），空则回落到公共实例 */
function normalizeNeteaseApi(value) {
  var url = String(value || '').trim().replace(/\/+$/, '');
  return url || DEFAULT_NETEASE_API;
}

export function normalizeSettings(raw) {
  var def = defaultSettings();
  var s = raw && typeof raw === 'object' ? raw : {};
  var sources = s.sources && typeof s.sources === 'object' ? s.sources : {};

  // 老版本（0.1.x）里还有 gd / gdPlatform / quality / proxy，这里直接丢掉
  var tencent = bool(sources.tencent, sources.gd === false ? false : def.sources.tencent);

  return {
    schemaVersion: SCHEMA_VERSION,
    sources: {
      tencent: tencent,
      itunes: bool(sources.itunes, def.sources.itunes),
      audius: bool(sources.audius, def.sources.audius),
      netease: bool(sources.netease, def.sources.netease)
    },
    prefix: String(s.prefix || s.proxy || '').trim(),
    volume: clampNum(s.volume, 0, 1, def.volume),
    playMode: resolvePlayMode(s),
    repeat: modeToQueueFlags(resolvePlayMode(s)).repeat,
    shuffle: modeToQueueFlags(resolvePlayMode(s)).shuffle,
    theme: pickId(THEMES, s.theme, def.theme),
    uiTheme: pickId(UI_SKINS, s.uiTheme, def.uiTheme),
    systemMedia: pickId(MEDIA_MODES, s.systemMedia, def.systemMedia),
    // custom = 用户自选颜色
    accent: s.accent === 'custom' ? 'custom' : pickId(ACCENTS, s.accent, def.accent),
    accentColor: /^#[0-9a-fA-F]{6}$/.test(String(s.accentColor || '')) ? String(s.accentColor) : '',
    floating: bool(s.floating, def.floating),
    floatLyric: bool(s.floatLyric, def.floatLyric),
    neteaseApi: normalizeNeteaseApi(s.neteaseApi),
    neteaseCookie: String(s.neteaseCookie || '').trim(),
    neteaseProfile: String(s.neteaseProfile || '').trim(),
    chatListen: bool(s.chatListen, def.chatListen),
    chatAddToQueue: bool(s.chatAddToQueue, def.chatAddToQueue),
    chatCommandMode: (function () {
      var mode = String(s.chatCommandMode || '');
      if (mode === 'mark' || mode === 'tool' || mode === 'hybrid') return mode;
      return def.chatCommandMode;
    })(),
    chatPromptHybrid: (function () {
      var text = String(s.chatPromptHybrid == null ? '' : s.chatPromptHybrid).trim();
      return text ? text.slice(0, 2000) : def.chatPromptHybrid;
    })(),
    cardTapPlay: bool(s.cardTapPlay, def.cardTapPlay),
    recMode: (function () {
      var mode = String(s.recMode || '');
      if (mode === 'auto' || mode === 'local' || mode === 'manual') return mode;
      return def.recMode;
    })(),
    recCount: (function () {
      var n = Math.round(Number(s.recCount));
      if (!Number.isFinite(n)) return def.recCount;
      return Math.max(5, Math.min(50, n));
    })(),
    recFilterPlayable: bool(s.recFilterPlayable, def.recFilterPlayable),
    sourceMode: s.sourceMode === 'single' ? 'single' : 'multi',
    primarySource: (function () {
      var list = ['tencent', 'netease', 'itunes', 'audius'];
      var v = String(s.primarySource || '');
      return list.indexOf(v) !== -1 ? v : 'tencent';
    })(),
    taMotion: bool(s.taMotion, def.taMotion),
    taFontUrl: (function () {
      var url = String(s.taFontUrl == null ? '' : s.taFontUrl).trim();
      // 只接受 http(s)，避免塞进 javascript: 之类的东西
      if (!/^https?:\/\//i.test(url)) return '';
      return url.slice(0, 300);
    })(),
    taSign: String(s.taSign == null ? '' : s.taSign).trim().slice(0, 16),
    chatPromptTool: (function () {
      var text = String(s.chatPromptTool == null ? '' : s.chatPromptTool).trim();
      if (!text) return def.chatPromptTool;
      // 误把标记版存到工具字段时回退，避免两个通道混用
      if (text.indexOf('mp:play') !== -1 || text.indexOf('[[mp:') !== -1) return def.chatPromptTool;
      return text.slice(0, 2000);
    })(),

    chatPrompt: (function () {
      var text = String(s.chatPrompt == null ? '' : s.chatPrompt).trim();
      if (!text) return def.chatPrompt;
      // 老版本把「工具版」存进了这个字段，迁移成新的标记提示词
      if (text.indexOf('mp:play') === -1 && text.indexOf('[[mp:') === -1
        && text.indexOf('music_play') !== -1) return def.chatPrompt;
      return text.slice(0, 2000);
    })(),
    nativeMinimal: bool(s.nativeMinimal, def.nativeMinimal)
  };
}

/** 至少开一个搜索源，否则搜不出东西 */
export function atLeastOneSource(settings) {
  if (settings.sources.tencent || settings.sources.itunes) return settings;
  return Object.assign({}, settings, { sources: Object.assign({}, settings.sources, { tencent: true }) });
}

export function accentColor(id) {
  var hit = ACCENTS.filter(function (item) { return item.id === id; })[0];
  return hit ? hit.color : ACCENTS[0].color;
}
