# 音乐播放器 · Roche 插件

多音源搜歌、播放、歌单与收藏，在聊天里还能发一张「一起听」卡片。

- 插件 id：`music-player`
- App id：`music-player-home`
- 当前版本：`0.18.0`

## 安装 / 更新

在 Roche 里打开「设置 → 插件 App 管理」，填这个链接：

```
https://raw.githubusercontent.com/chu-bing-yu/music-player/main/manifest.json
```

国内镜像（有缓存，可能滞后）：

```
https://cdn.jsdelivr.net/gh/chu-bing-yu/music-player@main/manifest.json
```

更新：改完代码 → `npm run build` → `npm run deploy` → App 内「检查更新 → 重载」。

## 现在能做什么

- **全屏**：根元素向外吃掉安全区，背景铺到屏幕边缘，标题栏和底栏再把状态栏 / 手势区内边距加回来
- **搜索**：QQ 音乐（走公开接口 api.vkeys.cn）＋ iTunes ＋ Audius，一次同时搜，结果合并去重；空白状态显示最近搜索 / 猜你喜欢 / 热门推荐
  - 点某一首：**只把这一首**加进播放列表并播放
  - 右上角「多选」：勾选若干首 → 「加入播放列表」，不会把整页结果塞进去
- **播放**：单曲播放、上一首 / 下一首、拖动进度、音量；暂停后被别的 App 抢了音频会话也能点回来（内部会重建 Audio）
- **系统媒体控制**：走宿主原生 `BackgroundAudio` 插件（Capacitor 的 `MediaSessionCompat` + 前台通知），状态栏 / 锁屏 / 控制中心显示歌名歌手封面，播放、暂停、上一首、下一首、进度都可用；退出 App、切到别的插件也继续放
- **队列**：播放页左边按钮看播放列表（点歌 → 播放 / 从列表移除），右边按钮调播放模式
- **播放模式四选一**：顺序 / 列表循环 / 单曲循环 / 随机，互斥，不再出现「随机 + 单曲循环」同时亮着
- **歌单**：收藏固定为最上面的「我的收藏」；自己的歌单和角色的歌单（`owner: 'char'`）分组展示
- **歌单**：新建、重命名、删除、加歌去重、移除、上移下移、播放全部 / 随机播放
- **收藏**：收藏 / 取消收藏，收藏页播放全部 / 随机
- **正在播放页**：大封面 / 滚动歌词、进度、随机、循环、收藏、加入歌单
- **歌词**：QQ 音乐歌词（`vkeys /tencent/lyric`），逐行高亮自动滚动，点歌词跳转，右上角按钮切封面 / 歌词
- **悬浮歌词**：在其他页面底部显示当前一句，可在设置或正在播放页开关
- **白天 / 夜间**：主题可跟随系统，也能手动锁白天或夜间；另有 5 种主色调
- **迷你播放条**：常驻底部，点一下进正在播放页
- **退出**：点击页面标题（搜索 / 歌单 / 收藏 / 设置）即退出 App，不放额外按钮；设置里也有「退出 App」
- **四按钮底栏**：搜索 / 歌单 / 收藏 / 设置
- **悬浮窗开关**：开 → 最小化后缩成悬浮球；关 → 点最小化直接退出 App，不显示悬浮球，音乐继续在后台播
- **彻底停止**：设置 → 播放 → 「停止并清除通知」，停播 + 清空队列 + 状态栏通知一起消失
- **不中断**：播放器是模块级单例，切到别的插件 / 重开 App 音乐继续放，队列存 `mp:queue`
- **键盘友好**：输入时播放条、悬浮歌词、底栏自动让位，搜索结果直接铺在搜索框下面
- **加号面板**（聊天 `+` → 一起听）：顶部显示「正在播放：xxx」，下面三个 tab —— **播放列表**（当前队列）/ **最近** / **歌单**，点任意一首直接发一起听卡片
- **聊天卡片**：「一起听」卡片。点卡片弹出**聊天内半屏面板**：
  当前歌 + 上一首/播放/下一首、**播放列表 / 歌单 / 搜索** 三个 tab、以及「结束一起听」。
  - 点卡片进来即视为「进入一起听」；「结束一起听」只关掉**当前这个聊天**，
    之后该会话不再注入提示词、模型也不能调音乐工具，其他聊天不受影响。
  - 模型点歌（`music_play`）默认**追加到当前播放列表末尾**，不替换用户已有的列表；
    只有当前没在播时才直接开始播。

## 还没做

- 角色「同意 / 拒绝」一起听邀请的决策（要接 `roche.ai.chat` 与提示词）
- 本地文件导入、歌单封面自定义、下载、后台播放（宿主暂停 WebView 时无法保证）

## 一起听 · 主聊天联动（0.6.0）

**为什么不用「解析模型回复的特殊格式」**：宿主没有「模型回复之后」的钩子，只能 `memory.getShortTerm` 轮询聊天记录，延迟 1–3 秒、还会被模型改格式搞挂。
所以改成给主聊天注册**工具**（`chat.tools`）：模型想点歌时直接调用工具 → 宿主把参数交给插件执行 → 结果回填给模型 → 模型用自然语言回一句。
这等于「拿到了模型的意图」，比解析文本更准更快，也不需要猜格式。

`contextProvider` 每轮往 system prompt 里注入当前状态（设置里关掉「一起听」就返回 `null`，完全不注入）：

```
【音乐插件】当前正在播放《晴天》（周杰伦）正在播放，队列 25 首。
你可以直接调用音乐工具帮用户操作：music_play 点歌、music_next 下一首……
```

这段提示词**可以在「设置 → 聊天 → 一起听提示词 → 编辑」里改**，支持占位符：

| 占位符 | 替换成 |
|---|---|
| `{{title}}` | 当前歌名（没放歌时是「（没在放歌）」） |
| `{{artist}}` | 歌手 |
| `{{state}}` | 正在播放 / 已暂停 / 空 |
| `{{queue}}` | 队列首数 |

编辑器里有「恢复默认」。提示词只影响注入文本，工具行为不变。

| 工具 id | 作用 |
|---|---|
| `music_play` | 按歌名/歌手搜索并播放（参数 `keyword`） |
| `music_next` / `music_previous` | 切歌 |
| `music_pause` / `music_resume` | 暂停 / 继续 |
| `music_status` | 查当前播放与队列 |
| `music_favorite` | 收藏当前这首 |

联动细节：

- 播放成功会以**角色身份**发一张「一起听」卡片（单聊，`isMe: false`），点卡片回到 App 继续听。
- App 没打开时，切歌/暂停/继续 直接调原生 `BackgroundAudio`，照样能控制。
- 开关在「设置 → 聊天 → 一起听（主聊天）」，默认开。

## 系统状态栏播放控制（0.5.0）

WebView 里的 `<audio>` 只能让浏览器自己造媒体会话，在 Roche 的 APK 里通常不可用。
Roche 的安卓工程注册了一个 Capacitor 插件 `BackgroundAudio`（原生 `MediaSessionCompat` + 前台通知），
插件页面直接调用它就能让状态栏/锁屏/控制中心显示并控制播放：

```js
var p = window.Capacitor.Plugins.BackgroundAudio;
p.replaceQueue({ tracks: [{ id, title, artist, cover, url }], startIndex: 0, mode: 'loop', autoplay: true });
p.play(); p.pause(); p.next(); p.previous(); p.seekTo({ positionSeconds: 12 });
p.setPlaybackMode({ mode: 'one' }); // loop | one | random
p.addListener('statusChange', function (e) { /* e.status */ });
```

实现要点（`src/services/nativeEngine.js`）：

- 原生 `replaceQueue` 不能追加，所以一次只交 **10 首**（窗口）。
- **只在窗口最后一首快播完时才换窗**（下一首开头接上）。正常切歌、暂停、拖进度都不会触发重建，所以点下一首不会卡。
- **状态栏按钮不再被插件覆盖**：切换歌曲时原生会短暂处于「未播放 + 时长 0」，之前会被误判成播放失败并重建窗口，表现就是「控制中心点了没反应」。现在换歌会重置判定计时（6 秒宽限）、并用 trackId 校验，避免误重建。
- 顺序播放到底会真的停，不会绕回第一首；列表循环才回第一首。
- `statusChange` 事件 + 900ms 轮询双保险，同步歌名、进度、播放状态到界面和歌词。
- **一次解析满 10 首再交给原生**，不再「先 3 首再补满」——补满等于又调一次 `replaceQueue`，
  会重置原生会话，用户此时按控制中心按钮就像没反应。
- 设置 → 播放 → **播放引擎**：显示「原生 · 队列 N 首 · loop」说明接上原生；显示「网页音频」说明没接上（状态栏控制不可用）。

### 控制栏没反应时怎么判断

设置 → 播放 里有三样东西：

| 项 | 用法 |
|---|---|
| **极简模式** | **默认开启**：插件不轮询、不重建、不自动暂停，只把队列交给原生播放器。状态栏按钮就是在这条路径下正常工作的；关掉后插件会自行轮询补救 |
| **重建播放会话** | 先 `stop()` 再重新 `replaceQueue`，会重启前台服务和通知。媒体卡片「僵死」（进程被杀但通知残留）时按一下通常能救回来 |
| **彻底停止** | 停播 + 清空队列 + 通知消失，不想听时按这个 |
- 播放地址缓存 **3 分钟 TTL**，过期自动重解析（vkey 会失效）。
- 起播 3 秒还没声（时长/进度都是 0）判定失败 → 作废缓存、重解析、重开窗口，最多 2 次。
- 换窗口 / 快速连点用操作序号防并发覆盖。
- 重开 App / 换插件回来时只 `attach` 接管状态，不会从头重新起播。
- 拿不到原生插件时（桌面浏览器、旧 APK）自动退回 WebView `<audio>`，功能不变但状态栏控制不到。

## 已知限制

- 悬浮歌词画在插件 App 自己的页面上；App 被宿主最小化成悬浮按钮后，宿主外壳里画不了自定义内容。
- 「悬浮播放」开关只控制是否显示最小化入口，`minimize` 本身是注册时声明的静态能力。
- 歌词只有 QQ 音乐源有；iTunes 试听与网易云兜底的歌没有歌词。
- 原生播放器没有音量接口，设置里的音量会显示「跟随系统音量」，用手机音量键调。
- 安全区用 `env(safe-area-inset-*)` 实现，桌面浏览器为 0；真机刘海 / 手势条的避让效果需在手机上确认。
- 一起听依赖宿主的 `chat.tools` / `contextProvider`；宿主版本过旧时这两个字段会被忽略，卡片和播放不受影响。
- 点歌类工具需要音乐 App 已打开过（要往队列里塞歌）；纯切歌/暂停在 App 关闭时也能用。

## 目录结构

```
music-player/
├── manifest.json        安装入口
├── package.json         只有 devDependency: esbuild
├── build.mjs            src/ → plugin.js（单文件 iife），归档 releases/v*
├── deploy.mjs           发布到 GitHub，token 只走环境变量
├── rollback.mjs         列出 / 回退已归档版本
├── plugin.js            构建产物，不要手改
├── src/
│   ├── main.js          注册 + 生命周期 + chat 能力
│   ├── app/
│   │   ├── container.js 装配：host + store + sources + player + 状态 + 动作
│   │   └── shell.js     页面容器、迷你播放条、四按钮底栏、弹层宿主
│   ├── core/            纯逻辑（无 DOM、无 roche、不读系统时间）
│   │   ├── track.js     歌曲归一化与唯一键
│   │   ├── queue.js     播放队列 / 随机 / 循环
│   │   ├── playlist.js  歌单增删改与排序
│   │   ├── favorites.js 收藏与最近播放
│   │   ├── search.js    多源结果合并、过滤、排序
│   │   ├── sourceMaps.js 音源返回字段 → track（时长解析、兜底挑歌）
│   │   ├── lrc.js       LRC 解析与当前行定位
│   │   ├── settings.js  设置默认值与归一化
│   │   └── format.js    时间与文本格式化
│   ├── services/
│   │   ├── host.js      **唯一允许出现 roche.\* 的文件**
│   │   ├── store.js     roche.storage 读写，键前缀 mp:
│   │   ├── http.js      统一请求（超时 / 请求前缀）
│   │   ├── sources.js   音源适配（QQ 音乐 / 网易云兜底 / iTunes）
│   │   ├── lyrics.js    歌词拉取与缓存
│   │   ├── nativeAudio.js  宿主原生 BackgroundAudio 插件封装
│   │   ├── nativeEngine.js 原生播放引擎（10 首窗口 + 状态同步）
│   │   └── player.js    兜底的 Audio 实例（模块级单例）
│   ├── ui/
│   │   ├── theme.css / base.css / views.css
│   │   ├── style.js     样式注入与深色模式跟随
│   │   ├── dom.js / icons.js / components.js
│   │   └── views/       search / playlists / playlistDetail / favorites / settings / now
│   └── chat/
│       ├── card.js      一起听卡片 + 加号面板选歌
│       ├── bridge.js    App → 主聊天工具的动作注册表
│       └── chatLink.js  contextProvider + 音乐工具（点歌/切歌/暂停/状态/收藏）
├── tests/               node:test 纯逻辑单测
└── dev/
    ├── preview.html     浏览器预览（假宿主）
    ├── mock-host.js     假宿主 + 假音频 + 假音源接口
    ├── probe-sources.mjs 音源体检（哪个接口还活着）
    └── e2e/run.mjs      无头 Edge 端到端
```

## 常用命令

```powershell
cd c:\Users\admin\Desktop\roche-新\music-player

npm install
npm run build        # 构建 plugin.js 并归档 releases/v<版本号>/
npm test             # 纯逻辑单测
npm run e2e          # 无头 Edge 端到端（先 build）
npm run ship         # build → test → deploy
npm run releases     # 列出归档版本
npm run rollback -- 0.1.0
```

发布：

```powershell
$env:GITHUB_TOKEN="ghp_xxx"   # 只用环境变量，不写进任何文件
npm run deploy
```

**版本号要同时改两处**：`package.json` 与 `manifest.json`，不一致会直接构建失败。

## 数据存储

都在 `roche.storage`（宿主 IndexedDB），键前缀 `mp:`：

| key | 内容 |
|---|---|
| `mp:settings` | 音源开关、平台、音质、反代、音量、循环、随机 |
| `mp:playlists` | 歌单（名称 + 歌曲数组），最多 50 个 / 每单 500 首 |
| `mp:favorites` | 收藏，最多 500 首 |
| `mp:recent` | 最近播放，最多 60 首 |
| `mp:searches` | 搜索历史，最多 12 条，用于推荐区 |
| `mp:queue` | 当前播放队列（最多 200 首），重开 App 后接着放 |
| `mp:pending` | 从聊天卡片点进来时临时传递要播的歌，用完即删 |

卸载插件时这些数据会被宿主一起清掉，重要歌单请自己截图或记录。

## 音源说明与风险

0.2.0 起去掉了连不上的 GD 音乐台，改成三段落：

| 音源 | 作用 | 说明 |
|---|---|---|
| **QQ 音乐**（`api.vkeys.cn/v2/music/tencent`） | 搜索 + 播放完整歌曲 | 公开接口，无需 Key；搜索和解析地址实测都可用，返回的 `ws.stream.qqmusic.qq.com` 直链能直接播（会自动改 https 防混合内容） |
| **网易云兜底** | QQ 放不了时自动再试 | 用同名搜索拿 id，再走 `music.163.com/song/media/outer/url` 外链音频；`<audio>` 播放不需要 CORS，实测能救回一部分 QQ 没版权的歌 |
| **iTunes**（官方） | 兜底 30 秒试听 | 无 Key、CORS 开放，冷门/外语歌的最后兜底 |
| **Audius**（免费曲库） | 搜索 + 完整播放 | 去中心化音乐平台，无版权/CC 内容为主，CORS 开放；播放地址可直接拼 `/v1/tracks/{id}/stream`，不用二次解析。中文歌很少，适合英文/电音/lofi |

- 一次点播最多串 6 个候选地址（QQ → 网易云 ×3 → iTunes），全部放不了才提示「这首放不了」。
- 三个源都能在设置里单独开关；至少保留一个搜索源。
- 设置 → 网络 → **音源自检**：会真机请求一遍，直接告诉你是哪个源在这台设备上不可用（换网络后可重跑）。
- 接口访问不了时可以在「设置 → 网络 → 请求前缀」填自己的反代（含 `{url}` 会替换，否则把编码后的地址接在后面）。
- 插件不保存任何账号、Key 或 Cookie；所有请求都从用户设备直接发出。
- 第三方接口随时可能限流或下线，`node dev/probe-sources.mjs` 是自带的音源体检脚本，换源前先跑一遍。歌曲版权归各平台与版权方所有，仅供个人学习使用。
