import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { chromium } from 'playwright'

const appUrl = process.env.UI_SMOKE_URL || 'http://127.0.0.1:4173'
const browserCandidates = [
  process.env.UI_SMOKE_BROWSER_EXECUTABLE,
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)
const shouldRegister = process.argv.includes('--register')
const shouldAuditRoutes = shouldRegister || process.argv.includes('--all-routes')
const adminEmail = process.env.UI_SMOKE_ADMIN_EMAIL || ''
const adminPassword = process.env.UI_SMOKE_ADMIN_PASSWORD || ''
const shouldRequireAdminAudit = process.env.UI_SMOKE_REQUIRE_ADMIN === '1'
const shouldExerciseGps = process.env.UI_SMOKE_EXERCISE_GPS === '1'
const screenshotDir = path.resolve('.codex-logs', 'ui-smoke')

function resolveBrowserExecutable() {
  return browserCandidates.find((candidate) => existsSync(candidate))
}

const authRoutes = [
  { path: '/today', selector: '.page-stack', name: 'today', requiredText: ['训练总览'] },
  { path: '/activities', selector: '.page-stack', name: 'activities', requiredText: ['运动记录'] },
  { path: '/activities/', selector: '.page-stack', name: 'activity-detail', requiredText: ['训练分析'] },
  { path: '/record', selector: '.page-stack', name: 'record', requiredText: ['记录运动', '手动添加运动'] },
  { path: '/status', selector: '.page-stack', name: 'status', requiredText: ['身体与训练'] },
  { path: '/status/health', selector: '.page-stack', name: 'health', requiredText: ['身体数据'] },
  { path: '/status/training-load', selector: '.page-stack', name: 'training-load', requiredText: ['训练指数'] },
  { path: '/status/trends', selector: '.page-stack', name: 'statistics', requiredText: ['运动统计'] },
  { path: '/status/calendar', selector: '.page-stack', name: 'calendar', requiredText: ['运动日历'] },
  { path: '/status/records', selector: '.page-stack', name: 'records', requiredText: ['成绩曲线'] },
  { path: '/coach', selector: '.page-stack', name: 'coach', requiredText: ['训练建议'] },
  { path: '/me', selector: '.page-stack', name: 'me', requiredText: ['个人服务'] },
  { path: '/me/sync', selector: '.page-stack', name: 'sync', requiredText: ['连接你的 Garmin 账号'] },
  { path: '/me/shoes', selector: '.page-stack', name: 'shoes', requiredText: ['跑鞋里程'] },
  { path: '/me/security', selector: '.page-stack', name: 'security', requiredText: ['账号安全'] },
  { path: '/me/settings', selector: '.page-stack', name: 'settings', requiredText: ['设置'] },
]

const adminRoutes = [
  { path: '/me/admin', selector: '.page-stack', name: 'admin', requiredText: ['管理中心', '添加用户', '用户列表'] },
]

function redact(text = '') {
  return text.replace(/https?:\/\/[^/\s]+/g, 'http://<server>')
}

function routePath(route, state) {
  if (route.path === '/activities/') return state.manualActivityPath || '/activities'
  return route.path
}

async function collectBrowserEvents(page) {
    const events = []
    page.on('console', (message) => {
    if (message.type() === 'error') events.push(`console:${redact(message.text())}`)
  })
  page.on('requestfailed', (request) => {
    const url = request.url()
    if (url.includes('/favicon')) return
    const failure = request.failure()?.errorText || 'failed'
    if (failure.includes('ERR_ABORTED')) return
    events.push(`request:${redact(url)}:${failure}`)
  })
  return events
}

async function registerAccount(page) {
  const timestamp = Date.now()
  const username = `codex_ui_${timestamp}`
  const email = `codex_ui_${timestamp}@motioncare.local`
  const password = `MotionCare${timestamp}!`

  await page.goto(`${appUrl}/register`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.locator('input[autocomplete="username"]').fill(username)
  await page.locator('input[autocomplete="email"]').fill(email)
  const passwordInputs = page.locator('input[type="password"]')
  await passwordInputs.nth(0).fill(password)
  await passwordInputs.nth(1).fill(password)
  await page.getByRole('button', { name: /注册并登录/ }).click()
  await page.waitForURL(/\/today/, { timeout: 20000 })
  await page.waitForLoadState('networkidle', { timeout: 20000 })
  await page.waitForFunction(
    () => !document.body.innerText.includes('正在准备今日建议'),
    null,
    { timeout: 30000 },
  )
  return { username, email, password }
}

async function loginAccount(page, { email, password }) {
  await page.goto(`${appUrl}/today`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.evaluate(() => localStorage.removeItem('motion-analysis-token'))
  await page.goto(`${appUrl}/login`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.locator('input[autocomplete="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /^登录$/ }).click()
  await page.waitForURL(/\/today/, { timeout: 20000 })
  await page.waitForLoadState('networkidle', { timeout: 20000 })
  return { email }
}

async function exerciseManualActivity(page, state) {
  const activityName = `Codex 巡检跑 ${Date.now()}`

  await page.goto(`${appUrl}/record`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByRole('button', { name: '填写运动' }).click()
  await page.waitForSelector('.manual-form', { timeout: 8000 })
  await page.getByLabel('运动名称').fill(activityName)
  await page.getByLabel('运动类型').selectOption('running')
  await page.getByLabel('开始时间').fill('2026-07-02T07:30')
  await page.getByLabel('地点').fill('服务器 UI 巡检')
  await page.getByLabel('距离 (m)').fill('5200')
  await page.getByLabel('时长 (s)').fill('1800')
  await page.getByLabel('卡路里').fill('380')
  await page.getByLabel('平均心率').fill('142')
  await page.getByLabel('最大心率').fill('168')
  await page.getByLabel('训练负荷').fill('52')
  await page.locator('.manual-form').getByRole('button', { name: '保存' }).click()
  await page.waitForURL(/\/activities\/\d+/, { timeout: 20000 })
  await page.waitForLoadState('networkidle', { timeout: 20000 })
  state.manualActivityPath = new URL(page.url()).pathname
  await page.waitForFunction(
    (savedActivityName) => document.body.innerText.includes(savedActivityName),
    activityName,
    { timeout: 15000 },
  )

  const text = await page.locator('body').innerText()
  if (!text.includes(activityName)) {
    throw new Error('Manual activity did not appear on the saved detail page')
  }
}

async function exerciseLiveWorkout(page) {
  const context = page.context()
  await context.grantPermissions(['geolocation'], { origin: appUrl })
  await context.setGeolocation({ latitude: 31.2304, longitude: 121.4737, accuracy: 12 })

  await page.goto(`${appUrl}/record`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByText('手机定位记录').waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: /^开始$/ }).click()
  await page.getByText(/定位中|定位正常|精度偏低/).waitFor({ timeout: 15000 })
  await page.waitForTimeout(1200)

  await context.setGeolocation({ latitude: 31.231, longitude: 121.4744, accuracy: 10 })
  await page.waitForFunction(
    () => /[1-9]\s*点/.test(document.body.innerText),
    null,
    { timeout: 15000 },
  )
  await page.waitForFunction(
    () => {
      const button = [...document.querySelectorAll('button')]
        .find((candidate) => candidate.textContent?.includes('结束并保存'))
      return Boolean(button && !button.disabled)
    },
    null,
    { timeout: 15000 },
  )

  await page.getByRole('button', { name: '结束并保存' }).click()
  await page.getByText('运动已保存').waitFor({ timeout: 20000 })
}

async function exerciseShoeFlow(page) {
  const name = `Codex巡检鞋${Date.now()}`

  await page.goto(`${appUrl}/me/shoes`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByRole('button', { name: '添加跑鞋' }).first().click()
  await page.getByPlaceholder('名称（必填）').fill(name)
  await page.getByPlaceholder('品牌').fill('MotionCare')
  await page.getByPlaceholder('型号').fill('Smoke')
  await page.getByPlaceholder('目标里程 (km)').fill('800')
  await page.getByPlaceholder('初始里程 (km)').fill('10')
  await page.locator('.shoe-form').getByRole('button', { name: '保存' }).click()
  await page.getByText(name).waitFor({ timeout: 15000 })

  const card = page.locator('.shoe-card').filter({ hasText: name })
  await card.click()
  await page.getByText(`${name} 的活动记录`).waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: '关闭' }).click()

  page.once('dialog', (dialog) => dialog.accept())
  await card.getByRole('button', { name: '删除' }).click()
  await page.getByText(name).waitFor({ state: 'detached', timeout: 15000 }).catch(async () => {
    const remaining = await page.locator('.shoe-card').filter({ hasText: name }).count()
    if (remaining > 0) throw new Error('Smoke-created shoe was not deleted')
  })
}

async function exerciseSettingsFlow(page) {
  await page.goto(`${appUrl}/me/settings`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByLabel('个人介绍').fill('半马训练中 · UI巡检')
  await page.getByLabel('距离单位').selectOption('km')
  await page.getByLabel('体重单位').selectOption('kg')
  await page.getByLabel('默认隐私').selectOption('private')
  await page.getByRole('button', { name: '保存设置' }).click()
  await page.getByText('设置已保存。').waitFor({ timeout: 15000 })
}

async function exerciseAdminUserFlow(page) {
  const timestamp = `${Date.now()}${process.pid}`
  const username = `Codex管理员巡检${timestamp}`
  const email = `codex_admin_flow_${timestamp}@motioncare.local`
  const password = `MotionCareAdmin${timestamp}!`

  await page.goto(`${appUrl}/me/admin`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码').fill(password)
  await page.getByLabel('角色').selectOption('user')
  await page.getByRole('button', { name: '添加用户' }).click()

  const createdCard = page.locator('.admin-user-card').filter({ hasText: email })
  await createdCard.waitFor({ timeout: 15000 })
  await createdCard.getByRole('button', { name: '停用账号' }).click()
  await page.getByRole('button', { name: /^停用$/ }).click()
  await createdCard.getByRole('button', { name: '账号已停用' }).waitFor({ timeout: 15000 })
}

async function auditRoute(page, route, index, state) {
  const targetPath = routePath(route, state)
  await page.goto(`${appUrl}${targetPath}`, { waitUntil: 'networkidle', timeout: 25000 })
  await page.waitForSelector(route.selector, { timeout: 10000 })
  await page.waitForTimeout(300)

  const metrics = await page.evaluate(() => {
    const frame = document.querySelector('.phone-frame')
    const frameRect = frame?.getBoundingClientRect()
    return {
      href: window.location.pathname,
      viewport: window.innerWidth,
      docWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      pageFrameScrollWidth: frame?.scrollWidth || 0,
      pageFrameClientWidth: frame?.clientWidth || 0,
      frameWidth: frameRect ? Math.round(frameRect.width) : null,
    }
  })
  const text = await page.locator('body').innerText()
  const issues = []

  if (Math.max(metrics.docWidth, metrics.bodyWidth) > metrics.viewport + 2) {
    issues.push(`body-overflow:${Math.max(metrics.docWidth, metrics.bodyWidth)}>${metrics.viewport}`)
  }
  if (metrics.pageFrameScrollWidth > metrics.pageFrameClientWidth + 2) {
    issues.push(`page-overflow:${metrics.pageFrameScrollWidth}>${metrics.pageFrameClientWidth}`)
  }
  if (/NaN|undefined/.test(text)) issues.push('bad-placeholder-text')
  if (route.requiredText) {
    for (const label of route.requiredText) {
      if (!text.includes(label)) issues.push(`missing-text:${label}`)
    }
  }
  if (route.requiredAnyText && !route.requiredAnyText.some((label) => text.includes(label))) {
    issues.push(`missing-any-text:${route.requiredAnyText.join('|')}`)
  }

  const screenshot = path.join(screenshotDir, `${String(index).padStart(2, '0')}-${route.name}.png`)
  await page.screenshot({ path: screenshot, fullPage: true })
  return { route: targetPath, name: route.name, metrics, issues, screenshot }
}

async function run() {
  await mkdir(screenshotDir, { recursive: true })

  const browserExecutable = resolveBrowserExecutable()
  const browser = await chromium.launch({
    headless: true,
    executablePath: browserExecutable,
  })
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } })
  const events = await collectBrowserEvents(page)
  const state = { manualActivityPath: '' }
  let badgeText = ''
  let account = null
  let adminAccount = null
  let routeResults = []

  try {
    await page.goto(`${appUrl}/login`, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForSelector('.server-health-badge', { timeout: 8000 })
    await page.screenshot({ path: path.join(screenshotDir, 'login.png'), fullPage: true })

    badgeText = await page.locator('.server-health-badge').innerText()
    if (!badgeText.includes('服务在线') || !badgeText.includes('数据可用')) {
      throw new Error(`Server health badge did not report online state: ${badgeText}`)
    }

    if (shouldRegister) {
      account = await registerAccount(page)
      if (shouldExerciseGps) {
        await exerciseLiveWorkout(page)
      }
      await exerciseManualActivity(page, state)
      await exerciseShoeFlow(page)
      await exerciseSettingsFlow(page)
    }

    if (shouldAuditRoutes) {
      let counter = 1
      for (const route of authRoutes) {
        routeResults.push(await auditRoute(page, route, counter++, state))
      }

      if (adminEmail && adminPassword) {
        adminAccount = await loginAccount(page, { email: adminEmail, password: adminPassword })
        await exerciseAdminUserFlow(page)
        for (const route of adminRoutes) {
          routeResults.push(await auditRoute(page, route, counter++, state))
        }
      } else if (shouldRequireAdminAudit) {
        throw new Error('Admin route audit requires UI_SMOKE_ADMIN_EMAIL and UI_SMOKE_ADMIN_PASSWORD')
      }
    }
  } finally {
    await browser.close()
  }

  if (events.length) {
    throw new Error(`Browser reported errors:\n${events.join('\n')}`)
  }

  const routeIssues = routeResults.flatMap((result) => result.issues.map((issue) => `${result.name}:${issue}`))
  if (routeIssues.length) {
    throw new Error(`UI route audit failed:\n${routeIssues.join('\n')}`)
  }

  console.log(JSON.stringify({
    ok: true,
    url: appUrl,
    badge: badgeText,
    account: account ? { username: account.username, email: account.email } : null,
    adminAccount: adminAccount ? { email: adminAccount.email } : null,
    manualActivityPath: state.manualActivityPath || null,
    routesChecked: routeResults.length,
    screenshots: screenshotDir,
  }, null, 2))
}

run().catch((error) => {
  console.error(redact(error.stack || error.message))
  process.exit(1)
})
