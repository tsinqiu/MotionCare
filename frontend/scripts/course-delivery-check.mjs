import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

const activeViewNames = [
  'Today',
  'Activities',
  'ActivityDetail',
  'Status',
  'HealthDetail',
  'TrainingLoad',
  'Statistics',
  'Calendar',
  'Records',
  'Coach',
  'Me',
  'RecordActivity',
  'Security',
  'Sync',
  'Shoes',
  'Settings',
  'Admin',
]

const [router, shell, productConstants, recordActivity, ...activeViewSources] = await Promise.all([
  source('src/router/index.js'),
  source('src/components/AppShell.vue'),
  source('src/constants/product.js'),
  source('src/views/RecordActivity.vue'),
  ...activeViewNames.map((name) => source(`src/views/${name}.vue`)),
])

assert.doesNotMatch(router, /DatabaseSchema/)
assert.match(router, /path:\s*['"]\/schema['"][\s\S]*redirect:\s*['"]\/today['"]/)
assert.doesNotMatch(shell, /to:\s*['"]\/schema['"]/)
assert.match(shell, /MotionCare/)
assert.doesNotMatch(shell, /数据库系统|GarSync Motion/)
assert.match(productConstants, /label:\s*['"]今日['"][\s\S]*label:\s*['"]运动['"][\s\S]*label:\s*['"]状态['"][\s\S]*label:\s*['"]教练['"][\s\S]*label:\s*['"]我的['"]/)
assert.doesNotMatch(recordActivity, /services\/workouts|\/workouts|StartWorkout/)

for (const legacyView of ['StartWorkout', 'Community', 'Explore', 'Assistant', 'Analytics', 'Trends']) {
  await access(new URL(`../src/views/${legacyView}.vue`, import.meta.url))
}

for (const activeView of activeViewNames) {
  assert.match(router, new RegExp(`import ${activeView} from`))
}

for (const route of [
  '/today',
  '/activities',
  '/activities/:id',
  '/record',
  '/status',
  '/status/health',
  '/status/training-load',
  '/status/trends',
  '/status/calendar',
  '/status/records',
  '/coach',
  '/me',
  '/me/sync',
  '/me/shoes',
  '/me/security',
  '/me/settings',
  '/me/admin',
]) {
  assert.match(router, new RegExp(`path:\\s*['"]${route.replace('/', '\\/')}['"]`))
}

for (const redirect of [
  ['/start', '/record'],
  ['/health', '/status/health'],
  ['/training-load', '/status/training-load'],
  ['/calendar', '/status/calendar'],
  ['/records', '/status/records'],
  ['/statistics', '/status/trends'],
  ['/trends', '/status/trends'],
  ['/analytics', '/status/trends'],
  ['/assistant', '/coach'],
  ['/explore', '/coach'],
  ['/community', '/today'],
  ['/sync', '/me/sync'],
  ['/shoes', '/me/shoes'],
  ['/settings', '/me/settings'],
  ['/admin', '/me/admin'],
  ['/schema', '/today'],
]) {
  const [from, to] = redirect
  assert.match(router, new RegExp(`path:\\s*['"]${from.replace('/', '\\/')}['"][\\s\\S]*?redirect:\\s*['"]${to.replace('/', '\\/')}['"]`))
}

assert.doesNotMatch(router, /component:\s*(StartWorkout|Community|Explore|Assistant|Analytics|Trends)/)
assert.doesNotMatch(shell, /label:\s*['"](健康|运动统计|训练负荷|跑鞋|同步|AI 助手|探索|运动圈|设置)['"]/)
assert.match(shell, /记录运动/)

const forbiddenCopy = /数据库系统|数据库记录|原始字段|智能干预|浏览器模拟运动|AI Brief|Local AI|Manual activity/
for (const [index, viewSource] of activeViewSources.entries()) {
  const viewName = activeViewNames[index]
  assert.doesNotMatch(viewSource, /\bfetch\s*\(/, `${viewName} must use the shared API services`)
  assert.doesNotMatch(viewSource, forbiddenCopy, `${viewName} contains developer-facing copy`)
  assert.match(viewSource, /StateBlock/, `${viewName} must expose a visible state`)
}

for (const dataView of ['Today', 'Activities', 'Status', 'HealthDetail', 'TrainingLoad', 'Statistics', 'Calendar', 'Records', 'Coach', 'Sync', 'Shoes', 'Admin']) {
  const viewSource = activeViewSources[activeViewNames.indexOf(dataView)]
  assert.match(viewSource, /loading|Loading|加载|正在/, `${dataView} is missing a loading state`)
  assert.match(viewSource, /error|Error|失败|不可用/, `${dataView} is missing an error state`)
  assert.match(viewSource, /empty|暂无|没有|还没有/, `${dataView} is missing an empty state`)
}

console.log('Course delivery source checks passed.')
