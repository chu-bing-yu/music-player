# 音乐播放器 · Roche 插件

多音源搜歌、播放、歌单与收藏，在聊天里还能发一张「一起听」卡片。

- 插件 id：`music-player`
- App id：`music-player-home`
- 当前版本：`0.3.0`

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

- **搜索**：QQ 音乐（走公开接口 api.vkeys.cn）＋ iTunes，一次同时搜，结果合并去重
- **播放**：单曲播放、上一首 / 下一首、拖动进度、音量
- **队列**：顺序播放 / 列表循环 / 单曲循环，随机播放
- **歌单**：新建、重命名、删除、加歌去重、移除、上移下移、播放全部 / 随机播放
- **收藏**：收藏 / 取消收藏，收藏页播放全部 / 随机
- **正在播放页**：大封面 / 滚动歌词、进度、随机、循环、收藏、加入歌单
- **歌词**：QQ 音乐歌词（`vkeys /tencent/lyric`），逐行高亮自动滚动，点歌词跳转，右上角按钮切封面 / 歌词
- **悬浮歌词**：在其他页面底部显示当前一句，可在设置或正在播放页开关
- **白天 / 夜间**：主题可跟随系统，也能手动锁白天或夜间；另有 5 种主色调
- **迷你播放条**：常驻底部，点一下进正在播放页
- **四按钮底栏**：搜索 / 歌单 / 收藏 / 设置
- **最小化**：可缩成悬浮按钮边聊边听，设置里能整体关掉
- **不中断**：播放器是模块级单例，切到别的插件 / 重开 App 音乐继续放，队列存 `mp:queue`
- **键盘友好**：输入时播放条、悬浮歌词、底栏自动让位，搜索结果直接铺在搜索框下面
- **聊天卡片**：「一起听」卡片 + 聊天 `+` 面板入口（选歌 → 发卡 → 点卡片回到 App 播放）

## 还没做

- 角色「同意 / 拒绝」一起听邀请的决策（要接 `roche.ai.chat` 与提示词）
- 本地文件导入、歌单封面自定义、下载、后台播放（宿主暂停 WebView 时无法保证）

## 已知限制

- 悬浮歌词画在插件 App 自己的页面上；App 被宿主最小化成悬浮按钮后，宿主外壳里画不了自定义内容。
- 「悬浮播放」开关只控制是否显示最小化入口，`minimize` 本身是注册时声明的静态能力。
- 歌词只有 QQ 音乐源有；iTunes 试听与网易云兜底的歌没有歌词。

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
│   │   └── player.js    唯一的 Audio 实例（模块级单例，不随 App 卸载销毁）
│   ├── ui/
│   │   ├── theme.css / base.css / views.css
│   │   ├── style.js     样式注入与深色模式跟随
│   │   ├── dom.js / icons.js / components.js
│   │   └── views/       search / playlists / playlistDetail / favorites / settings / now
│   └── chat/card.js     一起听卡片 + 加号面板选歌
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

- 一次点播最多串 6 个候选地址（QQ → 网易云 ×3 → iTunes），全部放不了才提示「这首放不了」。
- 三个源都能在设置里单独开关；至少保留一个搜索源。
- 设置 → 网络 → **音源自检**：会真机请求一遍，直接告诉你是哪个源在这台设备上不可用（换网络后可重跑）。
- 接口访问不了时可以在「设置 → 网络 → 请求前缀」填自己的反代（含 `{url}` 会替换，否则把编码后的地址接在后面）。
- 插件不保存任何账号、Key 或 Cookie；所有请求都从用户设备直接发出。
- 第三方接口随时可能限流或下线，`node dev/probe-sources.mjs` 是自带的音源体检脚本，换源前先跑一遍。歌曲版权归各平台与版权方所有，仅供个人学习使用。
