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

const [
  systemService,
  serverHealthBadge,
  loginView,
  registerView,
  appCss,
  packageJsonText,
  nginxConfig,
] = await Promise.all([
  source('src/services/system.js'),
  source('src/components/ServerHealthBadge.vue'),
  source('src/views/Login.vue'),
  source('src/views/Register.vue'),
  source('src/assets/app.css'),
  source('package.json'),
  source('../backend/docs/nginx-motion-analysis.conf'),
])

const packageJson = JSON.parse(packageJsonText)

test('public system service reads the server health endpoint through the configured API client', () => {
  assert.match(systemService, /apiClient\.get\(['"]\/health['"]\)/)
  assert.match(systemService, /unwrapApiResponse\(response\.data\)/)
  assert.match(systemService, /export\s+async\s+function\s+getServerHealth/)
})

test('ServerHealthBadge renders user-facing service state for auth screens', () => {
  assert.match(serverHealthBadge, /getServerHealth/)
  assert.match(serverHealthBadge, /服务在线/)
  assert.match(serverHealthBadge, /数据可用/)
  assert.doesNotMatch(serverHealthBadge, /数据库已连接/)
  assert.doesNotMatch(serverHealthBadge, /MotionCare API|数据层|数据库/)
  assert.match(serverHealthBadge, /服务暂不可用/)
  assert.match(serverHealthBadge, /server-health-badge/)
  assert.match(serverHealthBadge, /aria-live="polite"/)
})

test('login and register screens surface the server status before account actions', () => {
  assert.match(loginView, /import\s+ServerHealthBadge\s+from\s+['"]@\/components\/ServerHealthBadge\.vue['"]/)
  assert.match(registerView, /import\s+ServerHealthBadge\s+from\s+['"]@\/components\/ServerHealthBadge\.vue['"]/)
  assert.match(loginView, /<ServerHealthBadge\s*\/>/)
  assert.match(registerView, /<ServerHealthBadge\s*\/>/)
})

test('auth screens expose the server-hosted Android app package', () => {
  for (const view of [loginView, registerView]) {
    assert.match(view, /\/downloads\/motioncare-release\.apk/)
    assert.doesNotMatch(view, /\/downloads\/motioncare-debug\.apk/)
    assert.match(view, /移动应用/)
    assert.match(view, /下载安卓应用/)
    assert.doesNotMatch(view, /Android App/)
    assert.match(view, /android-download-link/)
  }
  assert.match(appCss, /\.android-download-link\s*\{[\s\S]*?var\(--app-green\)/)
})

test('server health badge follows the RQ-style green system status treatment', () => {
  assert.match(appCss, /\.server-health-badge\s*\{[\s\S]*?border:\s*1px solid color-mix\(in srgb, var\(--app-green\) 14%, var\(--border\)\)/)
  assert.match(appCss, /\.server-health-badge__dot\s*\{[\s\S]*?background:\s*var\(--app-green\)/)
  assert.match(appCss, /\.server-health-badge--offline\s+\.server-health-badge__dot\s*\{[\s\S]*?background:\s*#ef4444/)
})

test('course check includes server health UI coverage', () => {
  assert.match(packageJson.scripts['check:course'] || '', /scripts\/server-health-ui\.test\.mjs/)
})

test('nginx serves Android packages as real files instead of SPA fallback', () => {
  assert.match(nginxConfig, /location\s+\/downloads\/\s*\{[\s\S]*?try_files\s+\$uri\s+=404;/)
})
