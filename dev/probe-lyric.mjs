/** 找歌词源：逐个试，看谁返回 LRC 且带 CORS */
const mid = '0039MnYb0qxYhV';
const neteaseId = 2724692015;

const LIST = [
  ['vkeys /tencent/lyric', `https://api.vkeys.cn/v2/music/tencent/lyric?id=97773`],
  ['vkeys /lyric?type=tencent', `https://api.vkeys.cn/v2/music/lyric?type=tencent&id=97773`],
  ['vkeys /tencent?type=lyric', `https://api.vkeys.cn/v2/music/tencent?id=97773&type=lyric`],
  ['vkeys /tencent/lyric?mid', `https://api.vkeys.cn/v2/music/tencent/lyric?mid=${mid}`],
  ['qijieya lyric', `https://api.qijieya.cn/meting/?type=lyric&id=${neteaseId}&server=netease`],
  ['injahow lyric', `https://api.injahow.cn/meting/?type=lyric&id=${neteaseId}&server=netease`],
  ['lrclib search', `https://lrclib.net/api/search?q=${encodeURIComponent('晴天 周杰伦')}`],
  ['lrclib get', `https://lrclib.net/api/get?artist_name=${encodeURIComponent('周杰伦')}&track_name=${encodeURIComponent('晴天')}`],
  ['网易云官方 lyric', `https://music.163.com/api/song/lyric?id=${neteaseId}&lv=1&kv=1&tv=-1`],
  ['QQ 官方 lyric', `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${mid}&format=json&nobase64=1&g_tk=5381`]
];

for (const [label, url] of LIST) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Origin: 'https://example.com', 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow'
    });
    const acao = res.headers.get('access-control-allow-origin') || '-';
    const text = await res.text();
    console.log(`${res.status === 200 ? '✓' : '✗'} ${label}  ${res.status} ${Date.now() - started}ms CORS=${acao}`);
    console.log('   ' + text.replace(/\s+/g, ' ').slice(0, 220) + '\n');
  } catch (err) {
    console.log(`✗ ${label}  失败: ${err.message}\n`);
  }
}
