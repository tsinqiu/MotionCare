<template>
  <div class="page-stack">
    <section class="record-power-panel">
      <div class="section-heading">
        <div>
          <p class="overline">能力档案</p>
          <h2>成绩曲线</h2>
        </div>
        <button class="secondary-link" type="button" :disabled="isSyncing" @click="refreshRecords">
          <RefreshCw :size="17" />
          {{ isSyncing ? '刷新中' : '刷新' }}
        </button>
      </div>
      <div class="record-profile-grid">
        <span>
          <small>最佳配速</small>
          <b>{{ bestPaceText }}</b>
        </span>
        <span>
          <small>最长距离</small>
          <b>{{ longestDistanceText }}</b>
        </span>
        <span>
          <small>记录数量</small>
          <b>{{ recordCountText }}</b>
        </span>
      </div>
    </section>

    <StateBlock v-if="loading" title="正在加载最佳记录" message="正在读取最佳记录。" />
    <StateBlock v-else-if="error" title="最佳记录加载失败" :message="error" action-label="重试" tone="danger" @action="load" />
    <StateBlock
      v-else-if="!hasRecords"
      title="还没有个人纪录"
      message="完成并同步运动后，MotionCare 会根据已有活动生成个人最佳。"
    />

    <div v-else class="records-grid">
      <RecordGroup title="跑步记录" :items="filteredRecords(records.running || [])" />
      <RecordGroup title="骑行记录" :items="filteredRecords(records.cycling || [])" />
      <RecordGroup title="游泳记录" :items="filteredRecords(records.swimming || [])" />
    </div>
  </div>
</template>

<script setup>
import { computed, h, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, RefreshCw } from '@lucide/vue'

import StateBlock from '@/components/StateBlock.vue'
import { useAsyncData } from '@/composables/useAsyncData'
import { getPersonalBests } from '@/services/stats'
import { normalizePersonalBestRecord } from '@/utils/recordFormatters'

const router = useRouter()
const { data, error, load, loading } = useAsyncData(getPersonalBests, {})
const records = computed(() => data.value || {})
const hasRecords = computed(() => ['running', 'cycling', 'swimming', 'overall'].some((key) => filteredRecords(records.value[key] || []).length > 0))
const isSyncing = ref(false)
const profileRecords = computed(() => ['running', 'cycling', 'swimming']
  .flatMap((key) => filteredRecords(records.value[key] || [])))
const bestPaceRecord = computed(() => profileRecords.value.find((item) => /配速|最快|5\s?km|10\s?km|半程|马拉松/.test(item.label || '')))
const longestDistanceRecord = computed(() => profileRecords.value.find((item) => /最长|距离/.test(item.label || '')))
const bestPaceText = computed(() => formatRecordValue(bestPaceRecord.value))
const longestDistanceText = computed(() => formatRecordValue(longestDistanceRecord.value))
const recordCountText = computed(() => (profileRecords.value.length ? `${profileRecords.value.length} 项` : '--'))

async function refreshRecords() {
  isSyncing.value = true
  try {
    await load()
  } finally {
    isSyncing.value = false
  }
}

function filteredRecords(items = []) {
  return items
    .filter((item) => !['最高训练负荷', '最高平均心率', '训练负荷', '平均心率'].includes(item.label))
    .map(normalizePersonalBestRecord)
}

function formatRecordValue(item) {
  if (!item) return '--'
  return `${item.value ?? '--'}${item.unit ? ` ${item.unit}` : ''}`
}

const RecordGroup = {
  props: {
    title: String,
    items: Array,
  },
  setup(props) {
    return () => h('section', { class: 'dark-panel record-group' }, [
      h('div', { class: 'section-heading' }, [
        h('div', [h('h2', props.title)]),
      ]),
      h('div', { class: 'record-list' }, (props.items?.length ? props.items : [{ key: 'empty', label: '暂无真实记录', value: '--', unit: '' }]).map((item) =>
        h('button', {
          type: 'button',
          disabled: !item.activityId,
          onClick: () => item.activityId && router.push(`/activities/${item.activityId}`),
        }, [
          h('span', item.label),
          h('strong', `${item.value ?? '--'}${item.unit ? ` ${item.unit}` : ''}`),
          h(ChevronRight, { size: 17 }),
        ]),
      )),
    ])
  },
}
</script>
