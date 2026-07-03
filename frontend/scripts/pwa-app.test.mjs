import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path) {
  try {
    return await readFile(new URL(`../${path}`, import.meta.url), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return ''
    throw error
  }
}

async function json(path) {
  const text = await source(path)
  return text ? JSON.parse(text) : null
}

const [indexHtml, manifest, iconSvg, maskableSvg] = await Promise.all([
  source('index.html'),
  json('public/manifest.webmanifest'),
  source('public/icons/motioncare-icon.svg'),
  source('public/icons/motioncare-maskable.svg'),
])

test('index advertises MotionCare as an installable mobile app', () => {
  assert.match(indexHtml, /<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"\s*\/?>/)
  assert.match(indexHtml, /<meta\s+name="theme-color"\s+content="#15b66a"\s*\/?>/)
  assert.match(indexHtml, /<meta\s+name="apple-mobile-web-app-capable"\s+content="yes"\s*\/?>/)
  assert.match(indexHtml, /<meta\s+name="apple-mobile-web-app-title"\s+content="MotionCare"\s*\/?>/)
  assert.match(indexHtml, /<link\s+rel="apple-touch-icon"\s+href="\/icons\/motioncare-maskable\.svg"\s*\/?>/)
})

test('manifest uses the RQ-style green runner app identity', () => {
  assert.ok(manifest, 'manifest.webmanifest should exist')
  assert.equal(manifest.name, 'MotionCare')
  assert.equal(manifest.short_name, 'MotionCare')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/today')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.theme_color, '#15b66a')
  assert.equal(manifest.background_color, '#eef8f2')
  assert.match(manifest.description, /跑者/)
})

test('manifest provides regular and maskable app icons', () => {
  assert.ok(manifest, 'manifest.webmanifest should exist')
  assert.ok(Array.isArray(manifest.icons))
  assert.ok(manifest.icons.some((icon) => icon.src === '/icons/motioncare-icon.svg' && icon.purpose === 'any'))
  assert.ok(manifest.icons.some((icon) => icon.src === '/icons/motioncare-maskable.svg' && icon.purpose === 'maskable'))
  assert.ok(manifest.icons.every((icon) => icon.type === 'image/svg+xml'))
})

test('app icons carry a simple deep-green route runner mark', () => {
  assert.match(iconSvg, /#2e681d/)
  assert.match(iconSvg, /#15b66a/)
  assert.match(iconSvg, /MotionCare route runner/)
  assert.match(maskableSvg, /#2e681d/)
  assert.match(maskableSvg, /#15b66a/)
  assert.match(maskableSvg, /MotionCare route runner/)
  assert.match(maskableSvg, /viewBox="0 0 512 512"/)
  assert.match(iconSvg, /stroke-linecap="round"/)
  assert.match(iconSvg, /#f6d34d/)
  assert.doesNotMatch(iconSvg, />MC</)
  assert.doesNotMatch(iconSvg, /cx="323"\s+cy="150"\s+r="35"/)
})
