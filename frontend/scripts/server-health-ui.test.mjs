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
  todayView,
  downloadView,
  routerSource,
  appCss,
  packageJsonText,
  nginxConfig,
] = await Promise.all([
  source('src/services/system.js'),
  source('src/components/ServerHealthBadge.vue'),
  source('src/views/Login.vue'),
  source('src/views/Register.vue'),
  source('src/views/Today.vue'),
  source('src/views/Download.vue'),
  source('src/router/index.js'),
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

test('auth screens do not expose APK download actions inside the app flow', () => {
  for (const view of [loginView, registerView]) {
    assert.doesNotMatch(view, /\/downloads\/motioncare-release\.apk/)
    assert.doesNotMatch(view, /\/downloads\/motioncare-debug\.apk/)
    assert.doesNotMatch(view, /下载安卓应用/)
    assert.doesNotMatch(view, /Android App/)
    assert.doesNotMatch(view, /android-download-link/)
  }
})

test('download page is the web-only home for the server-hosted Android package', () => {
  assert.match(routerSource, /import\s+\{\s*Capacitor\s*\}\s+from\s+['"]@capacitor\/core['"]/)
  assert.match(routerSource, /function\s+isNativeRuntime\(\)/)
  assert.match(routerSource, /path:\s*['"]\/download['"]/)
  assert.match(routerSource, /name:\s*['"]download['"]/)
  assert.match(routerSource, /redirect:\s*\(\)\s*=>\s*\(isNativeRuntime\(\)\s*\|\|\s*hasAuthToken\(\)\s*\?\s*['"]\/today['"]\s*:\s*['"]\/download['"]\)/)
  assert.match(routerSource, /to\.name\s*===\s*['"]download['"][\s\S]*?isNativeRuntime\(\)[\s\S]*?name:\s*['"]login['"]/)
  assert.match(downloadView, /<ServerHealthBadge\s*\/>/)
  assert.match(downloadView, /\/downloads\/motioncare-release\.apk/)
  assert.doesNotMatch(downloadView, /\/downloads\/motioncare-debug\.apk/)
  assert.match(downloadView, /下载安卓版 APK/)
  assert.match(downloadView, /\/icons\/motioncare-icon\.svg/)
  assert.doesNotMatch(downloadView, /download-brand__mark/)
  assert.match(downloadView, /download-page/)
  assert.match(downloadView, /download-primary/)
  assert.match(appCss, /\.download-page\s*\{[\s\S]*?--download-green:\s*#2e681d/)
  assert.match(appCss, /\.download-primary\s*\{[\s\S]*?background:\s*var\(--download-green\)/)
})

test('home page surfaces the APK download page and download page returns home', () => {
  assert.match(todayView, /type=["']button["'][\s\S]*?@click=["']goToDownload["']/)
  assert.match(todayView, /router\.push\(['"]\/download['"]\)/)
  assert.match(todayView, /android-download-link/)
  assert.match(todayView, /下载安卓版/)
  assert.doesNotMatch(todayView, /<RouterLink/)
  assert.doesNotMatch(todayView, /\/downloads\/motioncare-release\.apk/)
  assert.match(downloadView, /to=["']\/today["']/)
  assert.match(downloadView, /返回主页/)
  assert.match(downloadView, /download-return/)
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
