<template>
  <main class="download-page">
    <section class="download-shell">
      <div class="download-brand">
        <img class="download-brand__icon" src="/icons/motioncare-icon.svg" alt="" />
        <strong>MotionCare</strong>
      </div>

      <div class="download-hero">
        <p class="overline">安卓应用</p>
        <h1>下载 MotionCare</h1>
        <p>在手机上记录运动、同步训练数据，并查看恢复状态。</p>
      </div>

      <ServerHealthBadge />

      <a class="download-primary" href="/downloads/motioncare-release.apk" download>
        <DownloadIcon :size="20" />
        <span>
          <strong>下载安卓版 APK</strong>
          <small>来自当前 MotionCare 服务器</small>
        </span>
      </a>

      <RouterLink class="download-return" to="/today">
        <ArrowLeft :size="16" aria-hidden="true" />
        <span>返回主页</span>
      </RouterLink>

      <p class="download-note">请在安卓手机浏览器打开本页后下载并安装。</p>
    </section>
  </main>
</template>

<script setup>
import { ArrowLeft, Download as DownloadIcon } from '@lucide/vue'

import ServerHealthBadge from '@/components/ServerHealthBadge.vue'
</script>

<style scoped>
.download-return {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--download-green) 18%, var(--border));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--download-green) 7%, var(--panel));
  color: var(--download-green);
  font-weight: 800;
  text-decoration: none;
}
</style>
