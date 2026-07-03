import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

const [
  appCss,
  coachView,
  adminView,
  mainSource,
  statusView,
  todayView,
  trainingLoadView,
  activitiesView,
  activityCard,
  manualActivityModal,
  activityDetailView,
  lapTable,
  sessionDetails,
  zoneDistribution,
  healthDetailView,
  recordsView,
  recordActivityView,
  calendarView,
  statisticsView,
  startWorkoutView,
  meView,
  securityView,
  settingsView,
  syncView,
  shoesView,
  loginView,
  registerView,
  appShell,
] = await Promise.all([
  source('src/assets/app.css'),
  source('src/views/Coach.vue'),
  source('src/views/Admin.vue'),
  source('src/main.js'),
  source('src/views/Status.vue'),
  source('src/views/Today.vue'),
  source('src/views/TrainingLoad.vue'),
  source('src/views/Activities.vue'),
  source('src/components/ActivityCard.vue'),
  source('src/components/ManualActivityModal.vue'),
  source('src/views/ActivityDetail.vue'),
  source('src/components/LapTable.vue'),
  source('src/components/SessionDetails.vue'),
  source('src/components/ZoneDistribution.vue'),
  source('src/views/HealthDetail.vue'),
  source('src/views/Records.vue'),
  source('src/views/RecordActivity.vue'),
  source('src/views/Calendar.vue'),
  source('src/views/Statistics.vue'),
  source('src/views/StartWorkout.vue'),
  source('src/views/Me.vue'),
  source('src/views/Security.vue'),
  source('src/views/Settings.vue'),
  source('src/views/Sync.vue'),
  source('src/views/Shoes.vue'),
  source('src/views/Login.vue'),
  source('src/views/Register.vue'),
  source('src/components/AppShell.vue'),
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

test('admin page opens as a mobile permission operations dashboard', () => {
  assert.match(adminView, /权限总览/)
  assert.match(adminView, /账号运营/)
  assert.match(adminView, /可用账号/)
  assert.match(adminView, /管理员/)
  assert.match(adminView, /停用保护/)
  assert.match(adminView, /admin-rq-panel/)
  assert.match(adminView, /admin-metric-grid/)
  assert.match(adminView, /admin-create-card/)
  assert.match(adminView, /admin-users-panel/)
  assert.match(adminView, /\.admin-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(adminView, /\.admin-metric-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(adminView, /\.admin-create-card\s*\{[\s\S]*?border-top:\s*4px solid/)
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

test('mobile shell follows a green runner-analytics app direction', () => {
  assert.match(appCss, /--app-green:\s*#15b66a/)
  assert.match(appCss, /--app-top-green:\s*#2e681d/)
  assert.match(appCss, /\.app-navbar\.van-nav-bar\s*\{[\s\S]*?background:\s*var\(--app-top-green\)/)
  assert.match(appCss, /\.phone-frame\s+\.page-frame\s*\{[\s\S]*?linear-gradient\(180deg,\s*var\(--app-top-green\)\s*0\s*28px/)
  assert.doesNotMatch(appCss, /\.rq-page-tabs/)
  assert.match(appCss, /\.app-tabbar\.van-tabbar\s*\{[\s\S]*?border-top:\s*1px solid color-mix\(in srgb, var\(--app-green\) 18%, transparent\)/)
})

test('global top bar stays brand-only without cross-page action links', () => {
  assert.match(appShell, /<van-nav-bar class="app-navbar" title="MotionCare"\s*\/>/)
  assert.doesNotMatch(appShell, /<template\s+#right/)
  assert.doesNotMatch(appShell, /app-navbar-action/)
  assert.doesNotMatch(appShell, /CirclePlus/)
})

test('primary tabbar exposes realtime workout recording as a first-level app function', () => {
  assert.match(appShell, /record:\s*MapPin/)
  assert.match(appShell, /app-tabbar-item--record/)
  assert.match(appCss, /\.app-tabbar-item--record\s+\.van-tabbar-item__icon\s*\{[\s\S]*?background:\s*var\(--app-green\)/)
})

test('status page exposes body, running power, and technique analysis sections', () => {
  assert.match(statusView, /体能/)
  assert.match(statusView, /跑力/)
  assert.match(statusView, /技术/)
  assert.match(statusView, /analysis-category-grid/)
})

test('status page includes an RQ-style running power score band', () => {
  assert.match(statusView, /当前跑力/)
  assert.match(statusView, /跑力等级/)
  assert.match(statusView, /rq-score-panel/)
  assert.match(statusView, /score-band/)
  assert.match(appCss, /\.rq-score-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(appCss, /\.score-band__marker\s*\{[\s\S]*?left:\s*var\(--score-position\)/)
})

test('status page mirrors runner five-power analysis with radar and load bars', () => {
  assert.match(statusView, /跑步五力/)
  assert.match(statusView, /五力分析图/)
  assert.match(statusView, /rq-five-power-panel/)
  assert.match(statusView, /rq-five-power-radar/)
  assert.match(statusView, /rq-load-bars/)
  assert.match(statusView, /rqPowerAxes/)
  assert.match(statusView, /recentLoadBars/)
  assert.match(statusView, /耐力/)
  assert.match(statusView, /速度/)
  assert.match(statusView, /技术/)
  assert.match(statusView, /肌力/)
  assert.match(statusView, /稳定/)
  assert.match(appCss, /\.rq-five-power-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(appCss, /\.rq-five-power-radar\s*\{[\s\S]*?aspect-ratio:\s*1/)
  assert.match(appCss, /\.rq-load-bars\s+i\s*\{[\s\S]*?height:\s*var\(--bar-height\)/)
})

test('today page uses RQ-style training overview and daily advice panels', () => {
  assert.match(todayView, /训练总览/)
  assert.match(todayView, /每日建议/)
  assert.match(todayView, /当前训练指数/)
  assert.match(todayView, /rq-overview-panel/)
  assert.match(todayView, /rq-daily-advice/)
  assert.match(appCss, /\.rq-overview-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
})

test('main product pages stay focused without duplicate secondary navigation or cross-page CTAs', () => {
  for (const view of [todayView, activitiesView, statusView, coachView, statisticsView]) {
    assert.doesNotMatch(view, /rq-page-tabs/)
  }

  for (const view of [todayView, statusView, coachView, statisticsView]) {
    assert.doesNotMatch(view, /<RouterLink/)
    assert.doesNotMatch(view, /action-label="记录运动"/)
    assert.doesNotMatch(view, /router\.push\('\/record'\)/)
  }

  assert.doesNotMatch(todayView, /rq-date-strip/)
  assert.doesNotMatch(todayView, /dateStripDays/)
  assert.doesNotMatch(statusView, /continue-panel/)
  assert.match(trainingLoadView, /训练指数/)
  assert.match(trainingLoadView, /配速区间/)
})

test('status subpages stay page-scoped without old secondary navigation or cross-page CTAs', () => {
  const statusSubpageViews = [healthDetailView, trainingLoadView, calendarView, recordsView]

  for (const view of statusSubpageViews) {
    assert.doesNotMatch(view, /rq-page-tabs/)
    assert.doesNotMatch(view, /to="\/record"|router\.push\('\/record'\)|action-label="记录运动"/)
    assert.doesNotMatch(view, /to="\/me\/sync"|router\.push\('\/me\/sync'\)|action-label="前往同步"/)
  }

  assert.doesNotMatch(healthDetailView, /health-empty-actions/)
})

test('unframed main page headers sit in clean white panels below the green top band', () => {
  assert.match(activitiesView, /\.activities-head\s*\{[\s\S]*?padding:\s*var\(--space-5\)[\s\S]*?background:\s*var\(--panel\)/)
  assert.match(coachView, /\.coach-head\s*\{[\s\S]*?padding:\s*var\(--space-5\)[\s\S]*?background:\s*var\(--panel\)/)
})

test('today page exposes an RQ-style weekly training rhythm panel', () => {
  assert.match(todayView, /本周训练节奏/)
  assert.match(todayView, /周负荷/)
  assert.match(todayView, /训练日/)
  assert.match(todayView, /完成度/)
  assert.match(todayView, /microcycle-panel/)
  assert.match(todayView, /microcycle-bars/)
  assert.match(todayView, /weeklyLoadBars/)
  assert.match(todayView, /weekSummary/)
  assert.match(todayView, /\.microcycle-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(todayView, /\.microcycle-bars\s+i\s*\{[\s\S]*?height:\s*var\(--bar-height\)/)
})

test('today empty state still looks like a runner analysis dashboard', () => {
  assert.match(todayView, /today-empty-rq-panel/)
  assert.match(todayView, /新手跑力/)
  assert.match(todayView, /训练节奏/)
  assert.match(todayView, /数据同步/)
  assert.match(todayView, /emptyLoadBars/)
  assert.match(todayView, /\.today-empty-rq-panel,\s*\.today-empty-plan\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(todayView, /\.today-empty-bars\s+i::before\s*\{[\s\S]*?height:\s*var\(--bar-height\)/)
})

test('training load page presents training index and pace zones like a runner analysis tool', () => {
  assert.match(trainingLoadView, /训练指数/)
  assert.match(trainingLoadView, /配速区间/)
  assert.match(trainingLoadView, /training-index-panel/)
  assert.match(trainingLoadView, /pace-zone-panel/)
  assert.match(trainingLoadView, /load-score-band/)
  assert.match(trainingLoadView, /formatLoadDateLabel/)
  assert.match(trainingLoadView, /containLabel:\s*true/)
  assert.match(trainingLoadView, /showMaxLabel:\s*false/)
  assert.match(trainingLoadView, /hideOverlap:\s*true/)
})

test('training load copy uses user-facing metric labels instead of raw platform abbreviations', () => {
  for (const source of [todayView, statusView, trainingLoadView]) {
    assert.doesNotMatch(source, /\b(?:CTL|ATL|TSB)\b/)
  }

  assert.match(todayView, /体能储备/)
  assert.match(todayView, /疲劳负荷/)
  assert.match(todayView, /状态余量/)
  assert.match(statusView, /体能储备/)
  assert.match(statusView, /疲劳负荷/)
  assert.match(statusView, /状态余量/)
  assert.match(trainingLoadView, /体能储备/)
  assert.match(trainingLoadView, /疲劳负荷/)
  assert.match(trainingLoadView, /状态余量/)
})

test('health and training pages avoid raw metric abbreviations in visible copy', () => {
  const rawVisibleMetric = /(?:>|label=|title=|eyebrow=|value:|label:|name:)\s*["'`{]?[^\n<]*\b(?:HRV|VO2max|FTP|RPE|bpm)\b/

  for (const source of [todayView, statusView, trainingLoadView, healthDetailView, coachView]) {
    assert.doesNotMatch(source, rawVisibleMetric)
  }

  assert.match(todayView, /心率变异/)
  assert.match(statusView, /心率变异/)
  assert.match(healthDetailView, /心率变异/)
  assert.match(coachView, /心率变异/)
  assert.match(trainingLoadView, /最大摄氧量/)
  assert.match(trainingLoadView, /骑行阈值功率/)
  assert.match(trainingLoadView, /体感强度/)
  assert.match(trainingLoadView, /次\/分/)
})

test('release activity and status copy avoids reference-source labels and raw units', () => {
  const rqReferenceCopy = /(?:>|aria-label=|title=)\s*["'`{]?[^\n<]*(?:RQ五力|RQrun|Qrun)/
  const rawVisibleUnit = /(?:>|:value=|label=|title=|eyebrow=|unit:\s*|value:\s*|label:\s*|return\s+`)[^\n<`]*(?:\bbpm\b|\bW\b)/

  assert.doesNotMatch(statusView, rqReferenceCopy)
  assert.match(statusView, /跑步五力/)
  assert.match(statusView, /五力雷达/)

  for (const source of [
    activityDetailView,
    lapTable,
    sessionDetails,
    zoneDistribution,
    startWorkoutView,
    statisticsView,
  ]) {
    assert.doesNotMatch(source, rawVisibleUnit)
  }

  assert.match(activityDetailView, /次\/分/)
  assert.match(lapTable, /次\/分/)
  assert.match(sessionDetails, /次\/分/)
  assert.match(zoneDistribution, /次\/分/)
  assert.match(zoneDistribution, /瓦/)
  assert.doesNotMatch(startWorkoutView, /心率|次\/分/)
})

test('training load empty state never renders NaN in the score header', () => {
  assert.match(trainingLoadView, /currentLoadDisplay/)
  assert.match(trainingLoadView, /isCurrentLoadAvailable/)
  assert.match(trainingLoadView, /training-index-panel--empty/)
  assert.doesNotMatch(trainingLoadView, /<h2>\{\{\s*currentLoad\s*\}\}<\/h2>/)
})

test('status empty state keeps RQ-style analysis affordances visible', () => {
  assert.match(statusView, /status-empty-rq-panel/)
  assert.match(statusView, /等待跑力/)
  assert.match(statusView, /恢复概览/)
  assert.match(statusView, /训练负荷/)
  assert.match(statusView, /空态也保留/)
  assert.match(statusView, /\.status-empty-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
})

test('activity feed uses compact RQ-style training record cards', () => {
  assert.match(activitiesView, /训练记录/)
  assert.match(activitiesView, /最后一笔训练/)
  assert.match(activitiesView, /latest-training-panel/)
  assert.match(activityCard, /rq-activity-card/)
  assert.match(appCss, /\.rq-activity-card\s*\{[\s\S]*?border-left:\s*4px solid var\(--sport-color\)/)
})

test('activity detail opens with RQ-style training analysis and split panels', () => {
  assert.match(activityDetailView, /训练分析/)
  assert.match(activityDetailView, /训练负荷/)
  assert.match(activityDetailView, /配速稳定/)
  assert.match(activityDetailView, /class="detail-hero__title"/)
  assert.match(activityDetailView, /rq-detail-summary/)
  assert.match(activityDetailView, /rq-detail-splits/)
  assert.match(appCss, /\.detail-hero\s*>\s*div:first-child\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0/)
  assert.match(appCss, /\.detail-hero__title\s*\{[\s\S]*?overflow:\s*hidden[\s\S]*?text-overflow:\s*ellipsis[\s\S]*?white-space:\s*nowrap/)
  assert.match(appCss, /\.rq-detail-summary\s*\{[\s\S]*?border-top:\s*4px solid var\(--sport-color\)/)
  assert.match(appCss, /\.rq-detail-summary__score\s+strong\s*\{[\s\S]*?font-variant-numeric:\s*tabular-nums[\s\S]*?white-space:\s*nowrap/)
})

test('activity detail hero actions stay page-scoped without cross-page CTAs', () => {
  assert.match(activityDetailView, /detail-action-bar/)
  assert.match(activityDetailView, /detail-action detail-action--edit/)
  assert.match(activityDetailView, /detail-action detail-action--danger/)
  assert.doesNotMatch(activityDetailView, /detail-action--back/)
  assert.doesNotMatch(activityDetailView, /返回列表|>\s*返回\s*</)
  assert.doesNotMatch(activityDetailView, /to="\/activities"/)
  assert.match(activityDetailView, /\.detail-action-bar\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(activityDetailView, /\.detail-action\s*\{[\s\S]*?min-height:\s*44px/)
  assert.match(activityDetailView, /\.detail-action--danger\s*\{[\s\S]*?border-color:\s*color-mix\(in srgb,\s*var\(--red\) 36%,\s*transparent\)/)
})

test('coach page frames AI chat as a MotionCare training guidance workspace', () => {
  assert.match(coachView, /智能教练/)
  assert.match(coachView, /训练建议/)
  assert.match(coachView, /恢复建议/)
  assert.match(coachView, /coach-insight-panel/)
  assert.match(coachView, /coach-prescription-grid/)
})

test('primary app pages avoid template-like English eyebrow copy', () => {
  const localizedViews = [
    todayView,
    coachView,
    activityDetailView,
    syncView,
    statisticsView,
    lapTable,
    sessionDetails,
    zoneDistribution,
  ]
  const visibleTextPattern = (copy) => new RegExp(`>\\s*${copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<`)

  for (const copy of [
    'Training Rhythm',
    'AI Coach',
    'Daily Brief',
    'Local Coach Model',
    'Subjective Input',
    'Readiness',
    'Split Preview',
    'AI Analysis',
    'Account',
    'Sign in',
    'History',
    'Activity',
    'Achievements',
    'Laps',
    'Zones',
    'Session',
  ]) {
    for (const view of localizedViews) {
      assert.doesNotMatch(view, visibleTextPattern(copy))
    }
  }

  assert.match(todayView, /训练节奏/)
  assert.match(coachView, /智能教练/)
  assert.match(coachView, /每日简报/)
  assert.match(coachView, /本地教练模型/)
  assert.match(activityDetailView, /分段预览/)
  assert.match(activityDetailView, /智能分析/)
  assert.match(syncView, /账号状态/)
  assert.match(syncView, /绑定账号/)
  assert.match(syncView, /同步历史/)
  assert.match(syncView, /同步动态/)
  assert.match(statisticsView, /成就统计/)
})

test('health detail page shows an RQ-style recovery dashboard before raw metrics', () => {
  assert.match(healthDetailView, /恢复看板/)
  assert.match(healthDetailView, /身体电量/)
  assert.match(healthDetailView, /睡眠质量/)
  assert.match(healthDetailView, /health-date-selector/)
  assert.match(healthDetailView, /health-date-chip/)
  assert.match(healthDetailView, /formattedSelectedDate/)
  assert.match(healthDetailView, /CalendarDays/)
  assert.match(healthDetailView, /ChevronLeft/)
  assert.match(healthDetailView, /ChevronRight/)
  assert.match(healthDetailView, /health-rq-panel/)
  assert.match(healthDetailView, /recovery-gauge/)
  assert.doesNotMatch(healthDetailView, /\.date-input/)
  assert.match(appCss, /\.health-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
})

test('health detail empty state keeps the recovery dashboard structure', () => {
  assert.match(healthDetailView, /health-empty-rq-panel/)
  assert.match(healthDetailView, /等待身体数据/)
  assert.match(healthDetailView, /恢复概览/)
  assert.match(healthDetailView, /睡眠质量/)
  assert.match(healthDetailView, /设备同步后自动呈现/)
  assert.doesNotMatch(healthDetailView, /同步 Garmin/)
  assert.doesNotMatch(healthDetailView, /记录运动/)
  assert.match(healthDetailView, /\.health-empty-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.doesNotMatch(healthDetailView, /\.health-empty-actions/)
})

test('records page presents personal bests as a compact ability profile', () => {
  assert.match(recordsView, /能力档案/)
  assert.match(recordsView, /成绩曲线/)
  assert.match(recordsView, /最佳配速/)
  assert.match(recordsView, /record-power-panel/)
  assert.match(recordsView, /record-profile-grid/)
  assert.match(appCss, /\.record-power-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
})

test('record page works as an RQ-style training entry hub', () => {
  assert.match(recordActivityView, /训练入口/)
  assert.match(recordActivityView, /实时记录/)
  assert.match(recordActivityView, /补记训练/)
  assert.match(recordActivityView, /开始记录/)
  assert.match(recordActivityView, /scrollToLiveRecorder/)
  assert.match(recordActivityView, /record-rq-panel/)
  assert.match(recordActivityView, /record-action-grid/)
  assert.match(recordActivityView, /record-choice-grid/)
  assert.match(recordActivityView, /record-choice__icon/)
  assert.match(recordActivityView, /record-choice--live/)
  assert.match(recordActivityView, /StartWorkout/)
  assert.doesNotMatch(recordActivityView, /<RouterLink/)
  assert.match(appCss, /\.record-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(recordActivityView, /\.record-choice-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(recordActivityView, /\.record-choice\s*\{[\s\S]*?padding:\s*16px/)
})

test('manual activity modal opens as a training capture panel', () => {
  assert.match(manualActivityModal, /训练采集/)
  assert.match(manualActivityModal, /关键指标/)
  assert.match(manualActivityModal, /运动负荷/)
  assert.match(manualActivityModal, /manual-rq-modal/)
  assert.match(manualActivityModal, /manual-capture-panel/)
  assert.match(manualActivityModal, /manual-capture-grid/)
  assert.match(manualActivityModal, /manual-form-section/)
  assert.match(manualActivityModal, /manual-form-actions/)
  assert.match(manualActivityModal, /\.manual-rq-modal\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(manualActivityModal, /\.manual-capture-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(manualActivityModal, /\.manual-form-section\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
})

test('calendar page leads with monthly training continuity like a runner log', () => {
  assert.match(calendarView, /本月训练/)
  assert.match(calendarView, /训练连续性/)
  assert.match(calendarView, /月跑量/)
  assert.match(calendarView, /calendar-rq-panel/)
  assert.match(calendarView, /calendar-summary-grid/)
  assert.match(appCss, /\.calendar-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
})

test('statistics page reframes charts as a training trend dashboard', () => {
  assert.match(statisticsView, /统计控制/)
  assert.match(statisticsView, /statistics-control-panel/)
  assert.match(statisticsView, /statistics-period-toggle/)
  assert.match(statisticsView, /statistics-sport-strip/)
  assert.match(statisticsView, /statistics-month-switch/)
  assert.match(statisticsView, /currentPeriodLabel/)
  assert.doesNotMatch(statisticsView, /<SportTabs/)
  assert.match(statisticsView, /训练趋势/)
  assert.match(statisticsView, /月度跑量/)
  assert.match(statisticsView, /负荷走势/)
  assert.match(statisticsView, /statistics-rq-panel/)
  assert.match(statisticsView, /stat-focus-grid/)
  assert.match(appCss, /\.statistics-control-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(appCss, /\.statistics-period-toggle\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(appCss, /\.statistics-sport-strip\s*\{[\s\S]*?overflow-x:\s*auto/)
  assert.match(appCss, /\.statistics-month-switch\s*\{[\s\S]*?grid-template-columns:\s*44px minmax\(0,\s*1fr\) 44px/)
  assert.match(appCss, /\.statistics-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
})

test('start workout page feels like a live RQ-style workout recorder', () => {
  assert.match(startWorkoutView, /实时训练/)
  assert.match(startWorkoutView, /当前配速/)
  assert.match(startWorkoutView, /训练采样/)
  assert.match(startWorkoutView, /navigator\.geolocation\.watchPosition/)
  assert.match(startWorkoutView, /latitude/)
  assert.match(startWorkoutView, /longitude/)
  assert.match(startWorkoutView, /appendWorkoutTrackPoints/)
  assert.doesNotMatch(startWorkoutView, /当前不读取 GPS 坐标/)
  assert.match(startWorkoutView, /workout-rq-panel/)
  assert.match(startWorkoutView, /workout-telemetry-grid/)
  assert.match(appCss, /\.workout-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
})

test('profile page presents the account as a runner profile dashboard', () => {
  assert.match(meView, /跑者档案/)
  assert.doesNotMatch(meView, /目标赛事|targetRace|getRaceCountdown|race-card/)
  assert.match(meView, /个人服务/)
  assert.match(meView, /数据同步/)
  assert.match(meView, /跑鞋/)
  assert.match(meView, /profile-rq-panel/)
  assert.match(meView, /runner-profile-grid/)
  assert.match(appCss, /\.profile-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
})

test('profile, settings, and security pages contain long account text gracefully', () => {
  assert.match(meView, /profile-head__main/)
  assert.match(meView, /class="profile-meta__name"/)
  assert.match(meView, /\.profile-meta__name\s*\{[\s\S]*?overflow:\s*hidden[\s\S]*?text-overflow:\s*ellipsis[\s\S]*?white-space:\s*nowrap/)
  assert.match(appCss, /\.profile-head\s*\{[\s\S]*?display:\s*grid/)
  assert.match(appCss, /\.profile-head__main\s*\{[\s\S]*?grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/)
  assert.match(appCss, /\.runner-profile-grid\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/)
  assert.match(settingsView, /account-summary__body/)
  assert.match(appCss, /\.account-summary__body\s*\{[\s\S]*?min-width:\s*0/)
  assert.match(appCss, /\.account-summary__body\s+:is\(strong,\s*span,\s*small\)\s*\{[\s\S]*?overflow:\s*hidden[\s\S]*?text-overflow:\s*ellipsis[\s\S]*?white-space:\s*nowrap/)
  assert.match(securityView, /security-log-list/)
  assert.match(securityView, /security-log-list__value/)
  assert.match(appCss, /\.security-log-list__value\s*\{[\s\S]*?overflow-wrap:\s*anywhere/)
})

test('security page opens as a runner data protection dashboard', () => {
  assert.match(securityView, /数据保护/)
  assert.match(securityView, /保护指数/)
  assert.match(securityView, /登录状态/)
  assert.match(securityView, /数据范围/)
  assert.match(securityView, /设备保护/)
  assert.match(securityView, /退出设备/)
  assert.match(securityView, /security-rq-panel/)
  assert.match(securityView, /security-protection-score/)
  assert.match(securityView, /security-protection-grid/)
  assert.match(securityView, /security-device-card/)
  assert.match(appCss, /\.security-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(appCss, /\.security-protection-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
})

test('settings page opens as a runner preference dashboard', () => {
  assert.match(settingsView, /设置偏好/)
  assert.match(settingsView, /资料完整度/)
  assert.match(settingsView, /训练单位/)
  assert.match(settingsView, /隐私策略/)
  assert.match(settingsView, /保存偏好/)
  assert.match(settingsView, /账号状态/)
  assert.match(settingsView, /accountStatusLabel/)
  assert.doesNotMatch(settingsView, /状态：\{\{\s*authSession\.user\?\.status/)
  assert.doesNotMatch(settingsView, /'active'/)
  assert.match(settingsView, /settings-rq-panel/)
  assert.match(settingsView, /settings-preference-grid/)
  assert.match(settingsView, /settings-save-card/)
  assert.match(appCss, /\.settings-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(appCss, /\.settings-preference-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
})

test('sync page leads with a data source health panel', () => {
  assert.match(syncView, /数据源状态/)
  assert.match(syncView, /连接健康/)
  assert.match(syncView, /导入记录/)
  assert.match(syncView, /sync-rq-panel/)
  assert.match(syncView, /sync-health-grid/)
  assert.match(syncView, /sync-connect-form/)
  assert.match(syncView, /sync-connection-panel/)
  assert.match(syncView, /sync-layout--connected/)
  assert.match(syncView, /v-if="account\.exists"[\s\S]*sync-connection-panel/)
  assert.doesNotMatch(syncView, /sync-status-line/)
  assert.doesNotMatch(syncView, /provider-meta/)
  assert.doesNotMatch(syncView, /没有本地 Garmin 记录/)
  assert.match(appCss, /\.sync-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(appCss, /\.sync-connect-form\s*\{[\s\S]*?border-top:\s*4px solid color-mix\(in srgb,\s*var\(--app-green\) 78%,\s*var\(--border\)\)/)
  assert.match(appCss, /\.sync-connection-summary\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
})

test('sync page disabled actions keep mobile breathing room', () => {
  assert.match(syncView, /v-if="account\.exists"[\s\S]*class="sync-actions"/)
  assert.match(syncView, /class="primary-link sync-action-primary"/)
  assert.match(syncView, /class="danger-link sync-action-danger"/)
  assert.doesNotMatch(syncView, /:disabled="busy \|\| !account\.exists"/)
  assert.match(appCss, /\.sync-actions\s*\{[\s\S]*?padding-bottom:\s*var\(--space-4\)/)
})

test('shoes page acts as an equipment mileage dashboard', () => {
  assert.match(shoesView, /装备看板/)
  assert.match(shoesView, /总里程/)
  assert.match(shoesView, /服役跑鞋/)
  assert.match(shoesView, /shoe-rq-panel/)
  assert.match(shoesView, /shoe-mileage-grid/)
  assert.match(appCss, /\.shoe-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
})

test('shoes empty state keeps an equipment readiness panel', () => {
  assert.match(shoesView, /当前还没有绑定跑鞋/)
  assert.match(shoesView, /装备健康/)
  assert.match(shoesView, /磨损预警/)
  assert.match(shoesView, /下一双跑鞋/)
  assert.match(shoesView, /shoe-empty-stage/)
  assert.match(shoesView, /shoe-empty-track/)
  assert.match(shoesView, /shoe-empty-grid/)
  assert.doesNotMatch(shoesView, /先记录运动/)
  assert.doesNotMatch(shoesView, /to="\/record"/)
  assert.match(shoesView, /\.shoe-empty-stage\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(shoesView, /\.shoe-empty-track__bar i\s*\{[\s\S]*?width:\s*42%/)
  assert.match(shoesView, /\.shoe-empty-actions\s*\{[\s\S]*?grid-template-columns:\s*1fr/)
})

test('login page is quiet, elegant, and free of fake readiness metrics', () => {
  assert.match(loginView, /auth-card--quiet/)
  assert.match(loginView, /auth-login-mark/)
  assert.match(loginView, /欢迎回来/)
  assert.match(loginView, /训练记录与恢复状态/)
  assert.doesNotMatch(loginView, /今日跑力/)
  assert.doesNotMatch(loginView, /auth-rq-panel/)
  assert.doesNotMatch(loginView, /auth-runner-grid/)
  assert.doesNotMatch(loginView, />68</)
  assert.match(appCss, /\.auth-card--quiet\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-top-green\)/)
  assert.match(appCss, /\.auth-login-mark\s*\{[\s\S]*?background:\s*linear-gradient\(135deg,\s*var\(--app-top-green\)/)
})

test('register page frames onboarding as a runner profile setup', () => {
  assert.match(registerView, /建立跑者档案/)
  assert.match(registerView, /数据源/)
  assert.match(registerView, /训练目标/)
  assert.match(registerView, /auth-setup-panel/)
  assert.match(registerView, /auth-setup-grid/)
  assert.match(appCss, /\.auth-setup-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(appCss, /\.auth-setup-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
})
