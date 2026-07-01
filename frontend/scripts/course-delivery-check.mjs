import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

const [router, shell, training, dashboard, healthDetail, activities] = await Promise.all([
  source('src/router/index.js'),
  source('src/components/AppShell.vue'),
  source('src/views/TrainingLoad.vue'),
  source('src/services/dashboard.js'),
  source('src/views/HealthDetail.vue'),
  source('src/views/Activities.vue'),
])

assert.doesNotMatch(router, /DatabaseSchema/)
assert.match(router, /path:\s*['"]\/schema['"][\s\S]*redirect:\s*['"]\/today['"]/)
assert.doesNotMatch(shell, /to:\s*['"]\/schema['"]/)
assert.match(shell, /MotionCare/)
assert.doesNotMatch(shell, /数据库系统|GarSync Motion/)
assert.doesNotMatch(training, /garmin-import-summary|数据库原始字段|TrainingStatusSnapshots|LactateThresholds/)
assert.doesNotMatch(dashboard, /\bfetch\s*\(/)
assert.doesNotMatch(healthDetail, /\bfetch\s*\(/)
assert.doesNotMatch(activities, /v-if="isAdmin"|只有管理员可以手动添加运动/)

console.log('Course delivery source checks passed.')
