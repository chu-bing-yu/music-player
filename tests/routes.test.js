import test from 'node:test';
import assert from 'node:assert/strict';
import { TAB_ITEMS, TABS, SECONDARY_ROUTES, DEFAULT_ROUTE, isValidRoute, tabOf } from '../src/core/routes.js';

test('底栏首项是推荐', () => {
  assert.equal(TABS[0], 'recommend');
  assert.deepEqual(TABS, ['recommend', 'playlists', 'favorites', 'settings']);
});

test('默认路由是推荐页', () => {
  assert.equal(DEFAULT_ROUTE, 'recommend');
});

test('一级 tab 都合法', () => {
  TABS.forEach((id) => assert.equal(isValidRoute(id), true, id));
});

test('二级路由也合法（这是之前 goto 被拦的根因）', () => {
  SECONDARY_ROUTES.forEach((id) => assert.equal(isValidRoute(id), true, id));
  assert.equal(isValidRoute('search'), true);
  assert.equal(isValidRoute('playlist'), true);
  assert.equal(isValidRoute('now'), true);
});

test('未知路由被拒绝', () => {
  assert.equal(isValidRoute('nope'), false);
  assert.equal(isValidRoute(''), false);
  assert.equal(isValidRoute(null), false);
  assert.equal(isValidRoute(undefined), false);
});

test('二级页对应正确的底栏高亮', () => {
  assert.equal(tabOf('search'), 'recommend');
  assert.equal(tabOf('playlist'), 'playlists');
  assert.equal(tabOf('recommend'), 'recommend');
  assert.equal(tabOf('settings'), 'settings');
});

test('每个 tab 都有名字和图标', () => {
  TAB_ITEMS.forEach((item) => {
    assert.ok(item.id && item.name && item.icon, JSON.stringify(item));
  });
});
