import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function readProjectFile(path) {
  return readFile(resolve(root, path), 'utf8')
}

test('AI frontend service exposes coach feedback endpoints', async () => {
  const source = await readProjectFile('src/services/ai.js')

  assert.match(source, /submitAiFeedback/)
  assert.match(source, /submitMorningReadiness/)
  assert.match(source, /\/ai\/feedback/)
  assert.match(source, /\/ai\/morning-readiness/)
})

test('Coach view surfaces ML guidance, suggestion feedback, and morning readiness UI', async () => {
  const source = await readProjectFile('src/views/Coach.vue')

  assert.match(source, /coach-ml-panel/)
  assert.match(source, /建议反馈/)
  assert.match(source, /晨间状态/)
  assert.match(source, /submitAiFeedback/)
  assert.match(source, /submitMorningReadiness/)
})

test('Coach view presents recommendations as MotionCare training recommendations', async () => {
  const source = await readProjectFile('src/views/Coach.vue')

  assert.match(source, /coach-course-panel/)
  assert.doesNotMatch(source, /RQ课程|课程处方/)
  assert.match(source, /训练建议/)
  assert.match(source, /推荐训练/)
  assert.match(source, /course-prescription-strip/)
  assert.match(source, /course-intensity-ladder/)
  assert.match(source, /recommendation-card__metrics/)
  assert.match(source, /recommendationMeta/)
  assert.match(source, /coursePrompt/)
  assert.match(source, /加入今日计划/)
})
