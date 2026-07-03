<template>
  <div class="modal-backdrop" role="presentation" @click.self="$emit('close')">
    <section class="modal-panel manual-rq-modal" role="dialog" aria-modal="true" aria-labelledby="manual-activity-title">
      <header class="modal-header manual-rq-header">
        <div>
          <p class="overline">训练采集</p>
          <h2 id="manual-activity-title">{{ activity ? '编辑手动运动' : '手动添加运动' }}</h2>
        </div>
        <button class="icon-button" type="button" aria-label="关闭" @click="$emit('close')">×</button>
      </header>

      <section class="manual-capture-panel">
        <span class="manual-capture-panel__icon" aria-hidden="true">
          <FilePlus2 :size="22" />
        </span>
        <div>
          <p class="overline">已完成的运动</p>
          <h3>补齐一次训练记录</h3>
          <p>先填时间、距离和时长，再补充心率与训练负荷，保存后会进入训练分析。</p>
        </div>
      </section>

      <div class="manual-capture-grid">
        <span><small>关键指标</small><b>距离 / 时长</b></span>
        <span><small>运动负荷</small><b>心率 / 负荷</b></span>
        <span><small>保存后</small><b>进入分析</b></span>
      </div>

      <form class="manual-form" @submit.prevent="submit">
        <p class="manual-form-title">基础信息</p>
        <div class="manual-form-section">
          <label>
            <span>运动名称</span>
            <input v-model="form.activityName" required maxlength="80" />
          </label>
          <label>
            <span>运动类型</span>
            <select v-model="form.activityType">
              <option value="running">跑步</option>
              <option value="cycling">骑行</option>
              <option value="swimming">游泳</option>
              <option value="strength_training">力量训练</option>
              <option value="other">其他</option>
            </select>
          </label>
          <label>
            <span>开始时间</span>
            <input v-model="form.localStartTime" type="datetime-local" required />
          </label>
          <label>
            <span>地点</span>
            <input v-model="form.locationName" maxlength="80" />
          </label>
        </div>

        <p class="manual-form-title">关键指标</p>
        <div class="manual-form-section">
          <label>
            <span>距离 (m)</span>
            <input v-model.number="form.distanceM" type="number" min="0" step="1" />
          </label>
          <label>
            <span>时长 (s)</span>
            <input v-model.number="form.durationS" type="number" min="0" step="1" required />
          </label>
          <label>
            <span>卡路里</span>
            <input v-model.number="form.calories" type="number" min="0" step="1" />
          </label>
        </div>

        <p class="manual-form-title">运动负荷</p>
        <div class="manual-form-section">
          <label>
            <span>平均心率</span>
            <input v-model.number="form.avgHeartRateBpm" type="number" min="0" step="1" />
          </label>
          <label>
            <span>最大心率</span>
            <input v-model.number="form.maxHeartRateBpm" type="number" min="0" step="1" />
          </label>
          <label>
            <span>训练负荷</span>
            <input v-model.number="form.activityTrainingLoad" type="number" min="0" step="1" />
          </label>
        </div>

        <p v-if="error" class="form-error">{{ error }}</p>
        <div class="modal-actions manual-form-actions">
          <button class="secondary-link" type="button" @click="$emit('close')">取消</button>
          <button class="primary-link" type="submit" :disabled="saving">{{ saving ? '保存中' : '保存' }}</button>
        </div>
      </form>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { FilePlus2 } from '@lucide/vue'

const props = defineProps({
  activity: {
    type: Object,
    default: null,
  },
  save: {
    type: Function,
    required: true,
  },
})

const emit = defineEmits(['close', 'saved'])
const saving = ref(false)
const error = ref('')

const form = reactive({
  activityName: '',
  activityType: 'running',
  localStartTime: '',
  locationName: '',
  distanceM: 0,
  durationS: 1800,
  calories: 0,
  avgHeartRateBpm: null,
  maxHeartRateBpm: null,
  activityTrainingLoad: null,
})

function fillForm(activity) {
  form.activityName = activity?.activity_name || ''
  form.activityType = activity?.raw_activity_type || 'running'
  form.localStartTime = (activity?.local_start_time || localDateTimeValue()).replace(' ', 'T').slice(0, 16)
  form.locationName = activity?.location_name || ''
  form.distanceM = activity?.total_distance_m || 0
  form.durationS = activity?.total_timer_time_s || 1800
  form.calories = activity?.total_calories || 0
  form.avgHeartRateBpm = activity?.avg_heart_rate_bpm || null
  form.maxHeartRateBpm = activity?.max_heart_rate_bpm || null
  form.activityTrainingLoad = activity?.activity_training_load || null
}

function localDateTimeValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

watch(() => props.activity, fillForm, { immediate: true })

async function submit() {
  saving.value = true
  error.value = ''
  try {
    const payload = {
      ...form,
      localStartTime: form.localStartTime.replace('T', ' '),
    }
    const result = await props.save(payload)
    emit('saved', result)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.manual-rq-modal {
  display: grid;
  gap: 14px;
  border-top: 4px solid var(--app-green);
}

.manual-rq-header {
  margin-bottom: 0;
}

.manual-capture-panel {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--app-green) 14%, var(--border));
  background: linear-gradient(180deg, color-mix(in srgb, var(--app-green) 8%, var(--panel)) 0%, var(--panel-soft) 100%);
}

.manual-capture-panel__icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-green) 14%, white);
  color: var(--app-green-dark);
}

.manual-capture-panel h3 {
  margin: 2px 0 6px;
  color: var(--text);
  font-size: 20px;
  line-height: 1.12;
}

.manual-capture-panel p:not(.overline) {
  margin: 0;
  color: var(--muted);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.manual-capture-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.manual-capture-grid span {
  min-width: 0;
  padding: 11px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-green) 7%, white);
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
}

.manual-capture-grid small {
  display: block;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.manual-capture-grid b {
  display: block;
  margin-top: 6px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.manual-form {
  display: grid;
  gap: 10px;
}

.manual-form-title {
  margin: 4px 0 0;
  color: var(--app-green-dark);
  font-size: 13px;
  font-weight: 800;
}

.manual-form-section {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.manual-form-section label {
  min-width: 0;
}

.manual-form-actions {
  margin-top: 2px;
}

@container phone-frame (max-width: 374px) {
  .manual-capture-panel,
  .manual-capture-grid,
  .manual-form-section {
    grid-template-columns: 1fr;
  }
}
</style>
