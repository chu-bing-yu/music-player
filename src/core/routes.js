/**
 * 路由的单一来源。
 *
 * 之前 shell 和 container 各存了一份 TABS，底栏首项从 search 换成 recommend 后
 * container 那份没同步，goto('recommend') 直接被白名单拦掉，
 * 表现就是「点推荐进不去、搜索页返回无效」。所以这里统一成一份。
 */

export var TAB_ITEMS = [
  { id: 'recommend', name: '推荐', icon: 'search' },
  { id: 'playlists', name: '歌单', icon: 'folder' },
  { id: 'favorites', name: 'TA', icon: 'heart' },
  { id: 'settings', name: '设置', icon: 'gear' }
];

export var TABS = TAB_ITEMS.map(function (item) { return item.id; });

/** 二级页面：不在底栏，但必须允许跳转 */
export var SECONDARY_ROUTES = ['search', 'playlist', 'now'];

export var DEFAULT_ROUTE = 'recommend';

export function isValidRoute(route) {
  var id = String(route || '');
  if (!id) return false;
  return TABS.indexOf(id) !== -1 || SECONDARY_ROUTES.indexOf(id) !== -1;
}

/** 二级页面对应的底栏高亮项 */
export function tabOf(route) {
  if (route === 'playlist') return 'playlists';
  if (route === 'search') return 'recommend';
  return route;
}
