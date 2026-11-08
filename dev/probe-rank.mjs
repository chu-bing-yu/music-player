/** 找推荐/榜单接口：能拿到歌单就做「推荐歌单」，拿不到就用本地历史猜你喜欢 */
const LIST = [
  ['tencent/toplist', 'https://api.vkeys.cn/v2/music/tencent/toplist'],
  ['tencent/toplist?id=4', 'https://api.vkeys.cn/v2/music/tencent/toplist?id=4'],
  ['tencent/top', 'https://api.vkeys.cn/v2/music/tencent/top'],
  ['tencent/recommend', 'https://api.vkeys.cn/v2/music/tencent/recommend'],
  ['tencent/songlist', 'https://api.vkeys.cn/v2/music/tencent/songlist'],
  ['tencent/rank', 'https://api.vkeys.cn/v2/music/tencent/rank'],
  ['netease/toplist', 'https://api.vkeys.cn/v2/music/netease/toplist']
];

for (const [label, url] of LIST) {
  try {
    const res = await fetch(url, { headers: { Origin: 'https://example.com', 'User-Agent': 'Mozilla/5.0' } });
    const text = await res.text();
    const acao = res.headers.get('access-control-allow-origin') || '-';
    let brief = text.replace(/\s+/g, ' ').slice(0, 180);
    try {
      const json = JSON.parse(text);
      const d = json.data;
      brief = Array.isArray(d)
        ? 'array(' + d.length + ') ' + JSON.stringify(d[0] || {}).slice(0, 150)
        : JSON.stringify(json).slice(0, 180);
    } catch (e) { /* 原文 */ }
    console.log(`${res.status} CORS=${acao} ${label}\n   ${brief}\n`);
  } catch (err) {
    console.log(`fail ${label}: ${err.message}\n`);
  }
}
