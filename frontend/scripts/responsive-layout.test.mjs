import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

const [appCss, coachView, adminView, mainSource] = await Promise.all([
  source('src/assets/app.css'),
  source('src/views/Coach.vue'),
  source('src/views/Admin.vue'),
  source('src/main.js'),
])

test('phone frame is a 430px named inline-size container', () => {
  assert.match(appCss, /--phone-max:\s*430px/)
  assert.match(appCss, /\.phone-frame\s*\{[\s\S]*?container-name:\s*phone-frame/)
  assert.match(appCss, /\.phone-frame\s*\{[\s\S]*?container-type:\s*inline-size/)
})

test('layout responds to compact and large phone container widths', () => {
  assert.match(appCss, /@container\s+phone-frame\s*\(max-width:\s*374px\)/)
  assert.match(appCss, /@container\s+phone-frame\s*\(min-width:\s*410px\)/)
})

test('phone content and form controls are allowed to shrink', () => {
  assert.match(appCss, /\.phone-frame\s+\.page-stack\s*\{[\s\S]*?min-width:\s*0/)
  assert.match(appCss, /\.phone-frame\s+:is\([^}]*input[^}]*textarea[^}]*select[^}]*\)\s*\{[\s\S]*?min-width:\s*0/)
})

test('coach layout contains long content inside the phone frame', () => {
  assert.match(coachView, /\.coach-head\s*>\s*div\s*\{[^}]*min-width:\s*0/)
  assert.match(coachView, /\.chat-surface\s*\{[\s\S]*?min-width:\s*0/)
  assert.match(coachView, /\.chat-composer\s+textarea\s*\{[\s\S]*?min-width:\s*0/)
  assert.match(coachView, /\.chat-bubble\s*\{[\s\S]*?overflow-wrap:\s*anywhere/)
})

test('admin users render as mobile cards with a Vant confirmation dialog', () => {
  assert.doesNotMatch(adminView, /<table[\s>]/)
  assert.match(adminView, /class="admin-user-list"/)
  assert.match(adminView, /class="admin-user-card"/)
  assert.match(adminView, /showConfirmDialog/)
})

test('personal record rows reserve fluid space for both labels and values', () => {
  assert.match(appCss, /\.records-grid\s*\{[^}]*grid-template-columns:\s*1fr/)
  assert.match(
    appCss,
    /\.record-list\s+button\s*\{[\s\S]*?grid-template-columns:\s*minmax\(72px,\s*1fr\)\s+minmax\(0,\s*1fr\)\s+18px/,
  )
})

test('the persisted theme is initialized before any route renders', () => {
  assert.match(mainSource, /import\s*\{\s*initTheme\s*\}\s*from\s*['"]@\/composables\/useThemeMode['"]/)
  assert.match(mainSource, /initTheme\(\)[\s\S]*createApp\(App\)/)
})
