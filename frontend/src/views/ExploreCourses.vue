<template>
  <div class="page-stack course-page">
    <header class="course-header">
      <h2>常用训练计划</h2>
      <p>选择经典模板，或创建自己的长距离和课表计划。</p>
    </header>

    <div class="course-layout">
      <nav class="course-rail" aria-label="课程分类">
        <button v-for="filter in filters" :key="filter.key" type="button" :class="{ active: activeFilter === filter.key }" @click="activeFilter = filter.key">
          <component :is="filter.icon" :size="24" aria-hidden="true" />
          <span>{{ filter.label }}</span>
        </button>
      </nav>

      <main class="course-content">
        <section class="course-list">
          <article v-for="course in filteredTemplates" :key="course.id" class="course-card">
            <span class="course-card__icon" :style="{ '--course-color': course.color }">
              <component :is="course.icon" :size="26" aria-hidden="true" />
            </span>
            <div>
              <h3>{{ course.name }}</h3>
              <p>{{ course.typeLabel }} · {{ course.duration }} · {{ course.frequency }}</p>
              <small>{{ course.summary }}</small>
              <ol>
                <li v-for="item in course.plan" :key="item">{{ item }}</li>
              </ol>
              <button type="button" class="secondary-link" @click="addCourse(course)">加入我的课程</button>
            </div>
          </article>
        </section>
      </main>
    </div>

    <section class="my-course-panel">
      <div class="section-heading">
        <div>
          <p class="overline">My Plans</p>
          <h2>我的课程</h2>
        </div>
        <span class="status-chip good">{{ myCourses.length }} 个</span>
      </div>
      <div class="my-course-list">
        <article v-if="!myCourses.length" class="tool-empty-card">
          <strong>暂无课程</strong>
          <span>从模板加入，或在下方创建自己的课程。</span>
        </article>
        <article v-for="course in myCourses" :key="course.id" class="my-course-row">
          <div>
            <strong>{{ course.name }}</strong>
            <span>{{ course.typeLabel || typeLabel(course.type) }} · {{ course.duration }} · {{ course.frequency }}</span>
          </div>
          <button type="button" class="danger-link" @click="removeCourse(course.id)">移除</button>
        </article>
      </div>
    </section>

    <form class="course-form-card" @submit.prevent="saveCustomCourse">
      <div class="section-heading">
        <div>
          <p class="overline">Custom</p>
          <h2>自定义课程</h2>
        </div>
      </div>
      <div class="course-form-grid">
        <label>
          <span>课程名称</span>
          <input v-model.trim="draft.name" type="text" placeholder="例如 10周长距离" required />
        </label>
        <label>
          <span>运动类型</span>
          <select v-model="draft.type">
            <option value="running">跑步</option>
            <option value="cycling">骑行</option>
            <option value="swimming">游泳</option>
          </select>
        </label>
        <label>
          <span>周期</span>
          <input v-model.trim="draft.duration" type="text" placeholder="例如 8周" />
        </label>
        <label>
          <span>每周训练日</span>
          <input v-model.trim="draft.frequency" type="text" placeholder="例如 每周4练" />
        </label>
        <label class="course-form-wide">
          <span>目标</span>
          <input v-model.trim="draft.summary" type="text" placeholder="例如 完成首次半马" />
        </label>
        <label class="course-form-wide">
          <span>课程说明</span>
          <textarea v-model.trim="draft.description" rows="3" placeholder="填写长距离、间歇、恢复日等安排" />
        </label>
      </div>
      <button class="primary-link" type="submit">保存课程</button>
    </form>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { showToast } from 'vant'
import { Activity, Bike, Grid2X2, Waves } from '@lucide/vue'

const STORAGE_KEY = 'motioncare-my-courses'

const filters = [
  { key: 'all', label: 'All', icon: Grid2X2 },
  { key: 'running', label: '跑步', icon: Activity },
  { key: 'cycling', label: '骑行', icon: Bike },
  { key: 'swimming', label: '游泳', icon: Waves },
]

const templates = [
  {
    id: 'run-8w-beginner',
    name: '8周入门跑步',
    type: 'running',
    typeLabel: '跑步',
    duration: '8周',
    frequency: '每周3-4练',
    summary: '从跑走结合过渡到连续轻松跑。',
    plan: ['前2周跑走结合', '中期建立30分钟轻松跑', '后期加入短节奏跑'],
    icon: Activity,
    color: '#16a34a',
  },
  {
    id: 'run-12w-half',
    name: '12周首次半马',
    type: 'running',
    typeLabel: '跑步',
    duration: '12周',
    frequency: '每周4练',
    summary: '逐步拉长周末长距离，目标完成半程马拉松。',
    plan: ['1次长距离', '1次节奏跑', '2次轻松跑或恢复跑'],
    icon: Activity,
    color: '#16a34a',
  },
  {
    id: 'run-16w-sub4',
    name: '16周全马 Sub 4:00',
    type: 'running',
    typeLabel: '跑步',
    duration: '16周',
    frequency: '每周5练',
    summary: '围绕马拉松配速、长距离和恢复周构建。',
    plan: ['长距离递进', '马配训练', '间歇与恢复周交替'],
    icon: Activity,
    color: '#16a34a',
  },
  {
    id: 'ride-8w-beginner',
    name: '8周入门骑行',
    type: 'cycling',
    typeLabel: '骑行',
    duration: '8周',
    frequency: '每周3练',
    summary: '提升踩踏稳定性与基础有氧。',
    plan: ['短距离通勤强度', '周末耐力骑', '低强度恢复骑'],
    icon: Bike,
    color: '#f59e0b',
  },
  {
    id: 'ride-10w-century',
    name: '10周百公里骑行',
    type: 'cycling',
    typeLabel: '骑行',
    duration: '10周',
    frequency: '每周3-4练',
    summary: '逐步建立完成100公里骑行的耐力。',
    plan: ['周中节奏骑', '周末长距离', '补给与爬坡练习'],
    icon: Bike,
    color: '#f59e0b',
  },
  {
    id: 'swim-20-session-endurance',
    name: '20次游泳耐力',
    type: 'swimming',
    typeLabel: '游泳',
    duration: '20次',
    frequency: '每周2-3练',
    summary: '从技术稳定到1500m连续游。',
    plan: ['技术分解', '主项间歇', '连续游距离递进'],
    icon: Waves,
    color: '#0ea5e9',
  },
]

const activeFilter = ref('all')
const myCourses = ref(loadItems())
const draft = reactive({
  name: '',
  type: 'running',
  duration: '',
  frequency: '',
  summary: '',
  description: '',
})

const filteredTemplates = computed(() => {
  if (activeFilter.value === 'all') return templates
  return templates.filter((course) => course.type === activeFilter.value)
})

function loadItems() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return []
  }
}

function persist() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(myCourses.value))
}

function typeLabel(type) {
  return filters.find((filter) => filter.key === type)?.label || '课程'
}

function addCourse(course) {
  if (myCourses.value.some((item) => item.id === course.id)) {
    showToast('课程已在我的课程中')
    return
  }
  myCourses.value.unshift({ ...course })
  persist()
  showToast('已加入我的课程')
}

function removeCourse(id) {
  myCourses.value = myCourses.value.filter((course) => course.id !== id)
  persist()
}

function saveCustomCourse() {
  if (!draft.name) {
    showToast('请填写课程名称')
    return
  }
  const item = {
    ...draft,
    id: `custom-course-${Date.now()}`,
    typeLabel: typeLabel(draft.type),
    icon: draft.type === 'cycling' ? Bike : draft.type === 'swimming' ? Waves : Activity,
    color: draft.type === 'cycling' ? '#f59e0b' : draft.type === 'swimming' ? '#0ea5e9' : '#16a34a',
    plan: draft.description ? draft.description.split(/[;\n，。]/).map((item) => item.trim()).filter(Boolean).slice(0, 3) : [],
  }
  myCourses.value.unshift(item)
  persist()
  Object.assign(draft, { name: '', type: 'running', duration: '', frequency: '', summary: '', description: '' })
  showToast('课程已保存')
}
</script>

<style scoped>
.course-page { gap: 16px; }
.course-header {
  display: grid;
  gap: 6px;
  padding: 10px 2px 0;
  text-align: center;
}
.course-header h2 { margin: 0; color: var(--text); font-size: 26px; line-height: 1.15; }
.course-header p { margin: 0; color: var(--muted); line-height: 1.5; }
.course-layout {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
.course-rail {
  position: sticky;
  top: 10px;
  overflow: hidden;
  display: grid;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--panel-soft) 80%, var(--panel));
  border: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
}
.course-rail button {
  min-height: 82px;
  display: grid;
  place-items: center;
  gap: 6px;
  border: 0;
  border-left: 4px solid transparent;
  background: transparent;
  color: var(--muted);
  font-weight: 900;
}
.course-rail button.active {
  border-left-color: var(--app-green);
  background: color-mix(in srgb, var(--app-green) 12%, var(--panel));
  color: var(--app-green-dark);
}
.course-content,
.course-list,
.my-course-list { display: grid; gap: 12px; }
.course-card {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--panel);
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
  box-shadow: var(--shadow-sm);
}
.course-card__icon {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--course-color) 12%, #f8fafc);
  color: var(--course-color);
}
.course-card h3 { margin: 0; color: var(--text); font-size: 18px; line-height: 1.25; }
.course-card p,
.course-card small { display: block; margin: 5px 0 0; color: var(--muted); line-height: 1.4; }
.course-card ol {
  margin: 10px 0 12px;
  padding-left: 18px;
  color: var(--text);
  line-height: 1.5;
  font-size: 13px;
  font-weight: 700;
}
.my-course-panel,
.course-form-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--panel);
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
  box-shadow: var(--shadow-sm);
}
.tool-empty-card {
  display: grid;
  gap: 5px;
  padding: 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-green) 6%, var(--panel));
  color: var(--muted);
}
.tool-empty-card strong { color: var(--text); }
.my-course-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 12px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--panel-soft) 64%, var(--panel));
}
.my-course-row div { min-width: 0; display: grid; gap: 4px; }
.my-course-row strong { color: var(--text); }
.my-course-row span { color: var(--muted); font-size: 13px; }
.course-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.course-form-grid label { display: grid; gap: 6px; min-width: 0; }
.course-form-grid span { color: var(--muted); font-size: 12px; font-weight: 800; }
.course-form-grid :is(input, select, textarea) {
  width: 100%;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel) 82%, var(--panel-soft));
  color: var(--text);
  font: inherit;
  padding: 10px 12px;
}
.course-form-wide { grid-column: 1 / -1; }
@container phone-frame (max-width: 390px) {
  .course-layout { grid-template-columns: 74px minmax(0, 1fr); gap: 9px; }
  .course-rail button { min-height: 72px; font-size: 12px; }
  .course-card { grid-template-columns: 1fr; }
  .course-form-grid,
  .my-course-row { grid-template-columns: 1fr; }
}
</style>
