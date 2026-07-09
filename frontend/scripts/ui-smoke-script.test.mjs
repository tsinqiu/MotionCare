import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('./ui-smoke.mjs', import.meta.url), 'utf8')

test('ui smoke audits every primary app route after authentication', () => {
  assert.match(source, /const authRoutes = \[/)

  for (const route of [
    '/today',
    '/activities',
    '/activities/',
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
  ]) {
    assert.match(source, new RegExp(route.replaceAll('/', '\\/')))
  }
})

test('ui smoke audits the admin page with a real admin session', () => {
  assert.match(source, /const adminRoutes = \[/)
  assert.match(source, /UI_SMOKE_ADMIN_EMAIL/)
  assert.match(source, /UI_SMOKE_ADMIN_PASSWORD/)
  assert.match(source, /async function loginAccount/)
  assert.match(source, /path: '\/me\/admin'[\s\S]*requiredText: \['管理中心'/)
  assert.doesNotMatch(source, /requiredAnyText: \['管理中心', '今日'\]/)
})

test('ui smoke can reuse an installed system browser instead of downloading one', () => {
  assert.match(source, /UI_SMOKE_BROWSER_EXECUTABLE/)
  assert.match(source, /resolveBrowserExecutable/)
  assert.match(source, /C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome\.exe/)
  assert.match(source, /C:\\\\Program Files \(x86\)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge\.exe/)
  assert.match(source, /executablePath: browserExecutable/)
})

test('ui smoke checks production mobile layout invariants on every route', () => {
  assert.match(source, /function auditRoute/)
  assert.match(source, /docWidth/)
  assert.match(source, /bodyWidth/)
  assert.match(source, /pageFrameScrollWidth/)
  assert.match(source, /NaN\|undefined/)
  assert.doesNotMatch(source, /rqTabs/)
})

test('ui smoke exercises core server-backed app functions', () => {
  assert.match(source, /UI_SMOKE_EXERCISE_GPS/)
  assert.match(source, /newContext\(\{[\s\S]*permissions:\s*shouldExerciseGps\s*\?\s*\['geolocation'\]\s*:\s*\[\]/)
  assert.match(source, /geolocation:\s*shouldExerciseGps\s*\?/)
  assert.match(source, /args:\s*shouldExerciseGps\s*\?\s*\[/)
  assert.match(source, /--unsafely-treat-insecure-origin-as-secure=\$\{appUrl\}/)
  assert.doesNotMatch(source, /grantPermissions/)
  assert.match(source, /async function exerciseLiveWorkout/)
  assert.match(source, /async function exerciseManualActivity/)
  assert.match(source, /async function exerciseShoeFlow/)
  assert.match(source, /async function exerciseSettingsFlow/)
})

test('ui smoke exercises admin user creation and disable flow', () => {
  assert.match(source, /async function exerciseAdminUserFlow/)
  assert.match(source, /Codex管理员巡检/)
  assert.match(source, /添加用户/)
  assert.match(source, /停用账号/)
  assert.match(source, /name: \/\^停用\$\//)
  assert.match(source, /账号已停用/)
})

test('ui smoke waits for saved manual activity content before asserting detail page', () => {
  assert.match(source, /waitForFunction\([\s\S]*activityName/)
  assert.match(source, /Manual activity did not appear/)
})

test('ui smoke ignores navigation-aborted requests that happen during route changes', () => {
  assert.match(source, /ERR_ABORTED/)
})

test('ui smoke follows MotionCare navigation instead of hard-coded RQrun placeholders', () => {
  assert.doesNotMatch(source, /赛事|课表|RQ课程/)
  assert.match(source, /requiredText: \['训练总览'\]/)
  assert.match(source, /requiredText: \['运动记录'\]/)
  assert.match(source, /requiredText: \['训练建议'\]/)
  assert.doesNotMatch(source, /rqTabs: \['今日', '记录', '教练'\]/)
  assert.doesNotMatch(source, /rqTabs: \['运动记录', '我的状态', '运动统计'\]/)
  assert.doesNotMatch(source, /rqTabs: \['体能', '跑力', '技术'\]/)
})

test('ui smoke status route checks the current status hero copy', () => {
  assert.doesNotMatch(source, /requiredText: \['身体状态'\]/)
  assert.match(source, /requiredText: \['身体与训练'\]/)
})
