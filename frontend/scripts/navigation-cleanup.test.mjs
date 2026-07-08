import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

const [routerSource, appShell, recordActivityView, startWorkoutView, todayView] = await Promise.all([
  source('src/router/index.js'),
  source('src/components/AppShell.vue'),
  source('src/views/RecordActivity.vue'),
  source('src/views/StartWorkout.vue'),
  source('src/views/Today.vue'),
])

test('nested app pages declare stable parent back targets', () => {
  const nestedRoutes = [
    ['activity-detail', '/activities'],
    ['status-health', '/status'],
    ['status-training-load', '/status'],
    ['status-trends', '/status'],
    ['status-calendar', '/status'],
    ['status-records', '/status'],
    ['me-sync', '/me'],
    ['me-shoes', '/me'],
    ['me-security', '/me'],
    ['me-settings', '/me'],
    ['me-admin', '/me'],
  ]

  for (const [name, backTo] of nestedRoutes) {
    assert.match(
      routerSource,
      new RegExp(`name:\\s*'${name}'[\\s\\S]*?meta:\\s*\\{[^}]*backTo:\\s*'${backTo}'`),
    )
  }
})

test('app shell renders a scoped back button for nested pages', () => {
  assert.match(appShell, /:title="navTitle"/)
  assert.match(appShell, /:left-arrow="showBack"/)
  assert.match(appShell, /:left-text="showBack \? '返回' : ''"/)
  assert.match(appShell, /@click-left="goBack"/)
  assert.match(appShell, /const showBack = computed\(\(\) => Boolean\(route\.meta\.backTo\)\)/)
  assert.match(appShell, /router\.push\(route\.meta\.backTo \|\| '\/today'\)/)
})

test('marked helper copy is removed from record and today surfaces', () => {
  const removedCopy = [
    'APK 会优先使用原生定位服务持续记录；浏览器环境会退回前台 GPS 采样。',
    '允许定位后，按 GPS 采样保存运动轨迹。',
    '填写类型、时间、距离和心率。',
    '用手机定位实时记录户外训练，也可以手工补记已经完成的运动。',
    '建议已结合你的近期运动生成',
    '基于身体状态与训练负荷生成',
  ]

  for (const copy of removedCopy) {
    assert.doesNotMatch(recordActivityView, new RegExp(copy))
    assert.doesNotMatch(startWorkoutView, new RegExp(copy))
    assert.doesNotMatch(todayView, new RegExp(copy))
  }
})
