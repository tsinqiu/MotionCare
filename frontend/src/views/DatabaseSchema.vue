<template>
  <div class="page-stack">
    <section class="hero-panel schema-hero">
      <div>
        <h2>数据库结构与字段字典</h2>
        <p>
          当前结构保留运动展示和同步需要的核心表，并新增 Garmin 日常健康数据表。
        </p>
      </div>
      <div class="hero-actions">
        <RouterLink class="primary-link" to="/activities">查看运动数据</RouterLink>
        <RouterLink class="secondary-link inverse" to="/statistics">统计分析</RouterLink>
      </div>
    </section>

    <div class="schema-grid">
      <MetricCard label="数据表" :value="String(schemaStats.tableCount)" />
      <MetricCard label="字段数" :value="String(schemaStats.columnCount)" />
      <MetricCard label="关系数" :value="String(schemaStats.relationCount)" />
      <MetricCard label="索引表" :value="String(schemaStats.indexedTables)" />

      <section class="panel schema-browser wide">
        <div class="panel-heading">
          <div>
            <h2>表结构导航</h2>
          </div>
          <span>点击表名查看字段</span>
        </div>
        <div class="schema-table-tabs" role="list">
          <button
            v-for="table in databaseTables"
            :key="table.name"
            type="button"
            :class="{ active: table.name === selectedTableName }"
            @click="selectedTableName = table.name"
          >
            <strong>{{ tableLabel(table.name) }}</strong>
            <span>{{ table.group }} · {{ table.columns.length }} 个字段</span>
          </button>
        </div>
      </section>

      <section v-if="selectedTable" class="panel schema-detail wide">
        <div class="panel-heading">
          <div>
            <p class="overline">{{ selectedTable.group }}</p>
            <h2>{{ tableLabel(selectedTable.name) }}</h2>
          </div>
          <span>{{ selectedTable.columns.length }} 个字段</span>
        </div>
        <p class="schema-purpose">{{ selectedTable.purpose }}</p>
        <div class="table-wrap schema-field-table">
          <table>
            <thead>
              <tr>
                <th>字段</th>
                <th>类型</th>
                <th>约束 / 索引</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="column in selectedTable.columns" :key="column[0]">
                <td><code>{{ column[0] }}</code></td>
                <td>{{ column[1] }}</td>
                <td>
                  <span v-if="column[2]" class="type-pill">{{ column[2] }}</span>
                  <span v-else class="muted-text">普通字段</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel wide">
        <div class="panel-heading">
          <div>
            <h2>核心关系链路</h2>
          </div>
        </div>
        <div class="schema-relations">
          <article v-for="relation in databaseRelations" :key="relation.join('-')">
            <strong>{{ tableLabel(relation[0]) }}</strong>
            <span>{{ relation[2] }}</span>
            <strong>{{ tableLabel(relation[1]) }}</strong>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

import MetricCard from '@/components/MetricCard.vue'
import { databaseRelations, databaseTables, schemaStats } from '@/mock/schema'

const selectedTableName = ref('Activities')

const selectedTable = computed(
  () => databaseTables.find((table) => table.name === selectedTableName.value) || databaseTables[0] || null,
)

const TABLE_LABELS = {
  Users: '用户表',
  Activities: '运动记录表',
  ActivitySummaries: '运动摘要表',
  ActivityZones: '区间表',
  Laps: '分段表',
  TrackPoints: '轨迹点表',
  DailyHealthSummaries: '每日健康表',
  SleepSummaries: '睡眠表',
}

function tableLabel(name) {
  return TABLE_LABELS[name] || name
}
</script>
