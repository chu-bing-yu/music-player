# 音乐播放器 · Roche 插件

多音源搜歌、播放、歌单与收藏，在聊天里还能发一张「一起听」卡片。

- 插件 id：`music-player`
- App id：`music-player-home`
- 当前版本：`0.1.0`

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

- **搜索**：网易云 / 酷我 / QQ / 酷狗 / 咪咕 / JOOX（走 GD 音乐台）＋ iTunes，一次同时搜，结果合并去重
- **播放**：单曲播放、上一首 / 下一首、拖动进度、音量
- **队列**：顺序播放 / 列表循环 / 单曲循环，随机播放
- **歌单**：新建、重命名、删除、加歌去重、移除、上移下移、播放全部 / 随机播放
- **收藏**：收藏 / 取消收藏，收藏页播放全部 / 随机
- **正在播放页**：大封面、进度、随机、循环、收藏、加入歌单
- **迷你播放条**：常驻底部，点一下进正在播放页
- **四按钮底栏**：搜索 / 歌单 / 收藏 / 设置
- **最小化**：声明了 `minimize`，可以缩成悬浮按钮边聊边听
- **聊天卡片**：「一起听」卡片 + 聊天 `+` 面板入口（选歌 → 发卡 → 点卡片回到 App 播放）

## 还没做

- 角色「同意 / 拒绝」一起听邀请的决策（要接 `roche.ai.chat` 与提示词，这一版按需求先不做）
- 歌词、本地文件导入、歌单封面自定义、下载

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
│   │   ├── settings.js  设置默认值与归一化
│   │   └── format.js    时间与文本格式化
│   ├── services/
│   │   ├── host.js      **唯一允许出现 roche.\* 的文件**
│   │   ├── store.js     roche.storage 读写，键前缀 mp:
│   │   ├── sources.js   音源适配（GD 音乐台 / iTunes / 自定义反代）
│   │   └── player.js    唯一的 Audio 实例
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
| `mp:pending` | 从聊天卡片点进来时临时传递要播的歌，用完即删 |

卸载插件时这些数据会被宿主一起清掉，重要歌单请自己截图或记录。

## 音源说明与风险

- **GD 音乐台**（`music-api.gdstudio.xyz`）：聚合多个平台，**不需要 Key、不需要自建后端**。第三方公益接口，官方写明「仅供学习，禁止商用」，歌曲版权归各平台。若被跨域拦截，可在「设置 → 自定义反代」填自己的代理前缀（含 `{url}` 会替换，否则把编码后的地址接在后面）。
- **iTunes Search API**：苹果官方接口，无 Key、可直接跨域请求，但只返回 **30 秒试听片段**。
- 两个源都可以在设置里单独开关；都关掉时会自动打开 GD。
- 插件不保存任何账号、Key 或 Cookie；所有请求都从用户设备直接发出。
