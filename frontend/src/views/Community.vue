<template>
  <div class="page-stack community-page">
    <section class="community-switch-panel">
      <div class="community-audience-toggle" role="tablist" aria-label="运动圈范围">
        <button
          v-for="item in scopeOptions"
          :key="item.key"
          type="button"
          :class="{ active: feedScope === item.key }"
          @click="feedScope = item.key"
        >
          <component :is="item.icon" :size="19" aria-hidden="true" />
          {{ item.label }}
        </button>
      </div>
      <div class="community-tabs" role="tablist" aria-label="动态分类">
        <button
          v-for="tab in feedTabs"
          :key="tab.key"
          type="button"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>
    </section>

    <section class="community-composer panel">
      <div class="community-composer__head">
        <div>
          <p class="overline">发布动态</p>
          <h2>分享今天的运动</h2>
        </div>
        <span class="status-chip good">图片 / 运动数据</span>
      </div>
      <form class="community-form community-form--feed" @submit.prevent="publish">
        <textarea v-model.trim="draft.content" maxlength="2000" placeholder="写下运动感受、训练目标或恢复状态" />
        <div class="community-options community-options--feed">
          <label>
            <span>关联运动</span>
            <select v-model="draft.activityId">
              <option value="">不关联</option>
              <option v-for="activity in activityOptions" :key="activity.id" :value="activity.id">
                {{ formatActivityOption(activity) }}
              </option>
            </select>
          </label>
          <label>
            <span>可见范围</span>
            <select v-model="draft.visibility">
              <option value="public">公开</option>
              <option value="followers">关注者</option>
              <option value="private">私密</option>
            </select>
          </label>
          <label class="upload-drop community-upload">
            <span>运动图片</span>
            <input :key="imageInputKey" type="file" accept="image/*" @change="handleImageChange" />
            <small><Upload :size="14" aria-hidden="true" /> {{ imageLabel }}</small>
          </label>
        </div>
        <div class="community-submit-row">
          <p v-if="activityLoadError" class="muted-copy">{{ activityLoadError }}</p>
          <button class="primary-link" type="submit" :disabled="posting || !draft.content">
            <Send :size="16" />
            {{ posting ? '发布中' : '发布动态' }}
          </button>
        </div>
      </form>
      <p v-if="notice" class="success-copy">{{ notice }}</p>
      <p v-if="actionError" class="form-error">{{ actionError }}</p>
    </section>

    <StateBlock
      v-if="loading"
      title="正在加载运动圈"
      message="正在读取运动动态。"
    />
    <StateBlock
      v-else-if="loadError"
      title="运动圈加载失败"
      :message="loadError"
      action-label="重试"
      tone="danger"
      @action="load"
    />
    <StateBlock
      v-else-if="activeTab === 'nearby'"
      title="附近动态待接入定位"
      message="当前位置和附近筛选接口尚未接入，本页先保留入口。"
    />
    <StateBlock
      v-else-if="filteredPosts.length === 0"
      :title="emptyTitle"
      :message="emptyMessage"
    />

    <div v-else class="community-feed community-feed--social">
      <article v-for="post in filteredPosts" :key="post.id" class="community-post-card">
        <header class="community-post-head">
          <span class="community-avatar">{{ post.username.slice(0, 1).toUpperCase() }}</span>
          <div>
            <strong>{{ post.username }}</strong>
            <small>
              <Activity :size="14" aria-hidden="true" />
              {{ formatDateTime(post.activityLocalStartTime || post.createdAt) }}
            </small>
            <small v-if="post.activityLocationName || post.weatherCondition">
              <MapPin :size="14" aria-hidden="true" />
              {{ formatLocation(post) }}
            </small>
          </div>
          <button
            v-if="canFollow(post)"
            class="community-follow"
            type="button"
            :disabled="busy"
            @click="toggleFollow(post)"
          >
            {{ post.followedByMe ? '已关注' : '关注' }}
          </button>
        </header>

        <div class="community-post-body">
          <h2>{{ formatPostTitle(post) }}</h2>
          <p v-if="shouldShowPostContent(post)">{{ post.content }}</p>
          <div v-if="post.activityId" class="community-stat-row">
            <span>
              <small>距离</small>
              <b>{{ formatDistance(post.distanceM) }}</b>
            </span>
            <span>
              <small>配速</small>
              <b>{{ formatPace(post) }}</b>
            </span>
            <span>
              <small>运动时间</small>
              <b>{{ formatDuration(post.durationS) }}</b>
            </span>
          </div>
        </div>

        <button
          v-if="post.imageUrl"
          class="community-media community-media--image"
          type="button"
          @click="openImagePreview(post.imageUrl, post.content || formatPostTitle(post))"
        >
          <img :src="post.imageUrl" alt="" />
        </button>
        <RoutePreview
          v-else-if="post.activityId && routePointsForPost(post).length"
          class="community-media community-route-preview"
          :points="routePointsForPost(post)"
        />
        <div v-else-if="post.activityId" class="community-media community-media--placeholder" aria-label="运动轨迹占位">
          <MapPin :size="24" aria-hidden="true" />
          <strong>{{ formatPostTitle(post) }}</strong>
          <span>{{ formatActivitySummary(post) }}</span>
        </div>

        <footer class="community-post-actions">
          <button type="button" :disabled="busy" @click="toggleLike(post)">
            <Heart :size="20" :fill="post.likedByMe ? 'currentColor' : 'none'" />
            {{ post.likeCount || '点赞' }}
          </button>
          <button type="button" :disabled="busy" @click="toggleComments(post)">
            <MessageCircle :size="20" />
            {{ post.commentCount || '评论' }}
          </button>
          <button type="button" :disabled="busy" @click="share(post)">
            <Share2 :size="20" />
            分享
          </button>
        </footer>

        <div v-if="activePostId === post.id" class="comment-panel">
          <StateBlock v-if="commentsLoading" title="正在加载评论" message="正在读取评论。" />
          <StateBlock v-else-if="currentComments.items.length === 0" title="暂无评论" message="可以添加第一条评论。" />
          <div v-else class="log-list">
            <span v-for="commentItem in currentComments.items" :key="commentItem.id">
              {{ commentItem.username }}：{{ commentItem.content }}
            </span>
          </div>
          <form class="comment-form" @submit.prevent="comment(post)">
            <input v-model.trim="commentDraft" maxlength="1000" placeholder="写评论" />
            <button class="secondary-link" type="submit" :disabled="busy || !commentDraft">发送</button>
          </form>
        </div>
      </article>
    </div>

    <div v-if="previewImage.url" class="image-lightbox" role="dialog" aria-modal="true" @click.self="closeImagePreview">
      <button class="lightbox-exit" type="button" @click="closeImagePreview">退出</button>
      <img :src="previewImage.url" :alt="previewImage.alt" />
      <p v-if="previewImage.alt">{{ previewImage.alt }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import {
  Activity,
  Heart,
  MapPin,
  MessageCircle,
  Send,
  Share2,
  Upload,
  UserRound,
  UsersRound,
} from '@lucide/vue'
import { showToast } from 'vant'

import RoutePreview from '@/components/RoutePreview.vue'
import StateBlock from '@/components/StateBlock.vue'
import { getActivities, getTrackPoints } from '@/services/activities'
import {
  createCommunityPost,
  createPostComment,
  followUser,
  getCommunityPosts,
  getPostComments,
  likePost,
  sharePost,
  unlikePost,
  unfollowUser,
} from '@/services/community'
import { authSession } from '@/stores/authStore'

const posts = ref({ items: [] })
const commentsByPost = ref({})
const activityOptions = ref([])
const routePointsByActivity = ref({})
const draft = reactive({ content: '', visibility: 'public', activityId: '' })
const commentDraft = ref('')
const imageFile = ref(null)
const imageInputKey = ref(0)
const previewImage = ref({ url: '', alt: '' })
const activePostId = ref('')
const feedScope = ref('friends')
const activeTab = ref('latest')
const loading = ref(false)
const commentsLoading = ref(false)
const posting = ref(false)
const busy = ref(false)
const loadError = ref('')
const actionError = ref('')
const notice = ref('')
const activityLoadError = ref('')
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const scopeOptions = [
  { key: 'friends', label: '好友', icon: UsersRound },
  { key: 'mine', label: '我', icon: UserRound },
]
const feedTabs = [
  { key: 'latest', label: '最新' },
  { key: 'hot', label: '热门' },
  { key: 'nearby', label: '附近' },
  { key: 'following', label: '关注' },
]

const currentUserId = computed(() => Number(authSession.user?.id || 0))
const currentComments = computed(() => commentsByPost.value[activePostId.value] || { items: [] })
const imageLabel = computed(() => {
  if (!imageFile.value) return '上传图片'
  const mb = imageFile.value.size / 1024 / 1024
  return `${imageFile.value.name} · ${mb.toFixed(1)}MB`
})
const filteredPosts = computed(() => {
  let items = [...(posts.value.items || [])]
  if (feedScope.value === 'mine') {
    items = items.filter((post) => Number(post.userId) === currentUserId.value)
  }
  if (activeTab.value === 'nearby') return []
  if (activeTab.value === 'following') {
    items = items.filter((post) => post.followedByMe || Number(post.userId) === currentUserId.value)
  }
  if (activeTab.value === 'hot') {
    items.sort((a, b) => postHeat(b) - postHeat(a))
  }
  return items
})
const emptyTitle = computed(() => (feedScope.value === 'mine' ? '还没有发布运动动态' : '暂无动态'))
const emptyMessage = computed(() => (
  feedScope.value === 'mine'
    ? '可以关联一次运动记录并上传图片，生成自己的运动圈动态。'
    : '当前分类下暂无可展示内容。'
))

function postHeat(post) {
  return Number(post.likeCount || 0) * 3 + Number(post.commentCount || 0) * 2 + Number(post.shareCount || 0)
}

function formatDateTime(value) {
  if (!value) return '--'
  return String(value).replace('T', ' ').slice(0, 16)
}

function formatActivityOption(activity) {
  const date = String(activity.local_start_time || activity.start_time_utc || '').slice(0, 10)
  return [date, activity.activity_name || activity.activity_type || `活动 ${activity.id}`].filter(Boolean).join(' · ')
}

function formatActivityType(value) {
  const raw = String(value || '').toLowerCase()
  if (raw.includes('run') || raw.includes('跑')) return '跑步'
  if (raw.includes('ride') || raw.includes('cycle') || raw.includes('骑')) return '骑行'
  if (raw.includes('swim') || raw.includes('游')) return '游泳'
  if (raw.includes('strength') || raw.includes('力量')) return '力量训练'
  return value || '运动'
}

function formatPostTitle(post) {
  if (post.activityName) return post.activityName
  if (post.activityType) return `${formatActivityType(post.activityType)}`
  return '运动动态'
}

function formatLocation(post) {
  const weather = post.weatherCondition
    ? `${post.weatherCondition}${post.temperatureC !== null && post.temperatureC !== undefined ? ` ${Math.round(post.temperatureC)}°C` : ''}`
    : ''
  return [post.activityLocationName, weather].filter(Boolean).join(' · ')
}

function formatDistance(value) {
  const meters = Number(value || 0)
  if (!meters) return '--'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(2)} km`
}

function formatElevation(value) {
  const meters = Number(value || 0)
  if (!meters) return '--'
  return `${Math.round(meters)} m`
}

function formatPace(post) {
  const distanceKm = Number(post.distanceM || 0) / 1000
  const duration = Number(post.durationS || 0)
  if (!distanceKm || !duration) return '--'
  const paceSeconds = Math.round(duration / distanceKm)
  const minutes = Math.floor(paceSeconds / 60)
  const seconds = paceSeconds % 60
  return `${minutes}'${String(seconds).padStart(2, '0')}" /km`
}

function formatDuration(value) {
  const total = Math.max(0, Math.round(Number(value || 0)))
  if (!total) return '--'
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatActivitySummary(post) {
  return [
    formatDistance(post.distanceM),
    formatDuration(post.durationS),
    post.weatherCondition || '',
  ].filter((item) => item && item !== '--').join(' · ') || '已关联运动记录'
}

function shouldShowPostContent(post) {
  const content = String(post.content || '').trim()
  if (!content) return false
  if (!post.activityId) return true
  const autoSharePattern = /·\s*\d+(\.\d+)?\s*(km|m)\s*·\s*\d{1,2}:\d{2}(:\d{2})?\s*·\s*\d+'\d{2}"\s*\/km$/
  return !autoSharePattern.test(content) && content !== '分享了一次运动'
}

function handleImageChange(event) {
  const file = event.target.files?.[0] || null
  notice.value = ''
  actionError.value = ''
  if (!file) {
    imageFile.value = null
    return
  }
  if (!file.type.startsWith('image/')) {
    actionError.value = '请选择图片文件。'
    event.target.value = ''
    imageFile.value = null
    return
  }
  if (file.size > MAX_IMAGE_BYTES) {
    actionError.value = '图片文件不能超过 10MB。'
    event.target.value = ''
    imageFile.value = null
    return
  }
  imageFile.value = file
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    posts.value = await getCommunityPosts({ page: 1, page_size: 30 })
    await loadPostRoutes(posts.value.items || [])
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '运动圈加载失败'
  } finally {
    loading.value = false
  }
}

async function loadPostRoutes(items) {
  const ids = [...new Set(
    items
      .filter((post) => post.activityId && !post.imageUrl)
      .map((post) => String(post.activityId)),
  )].filter((id) => !routePointsByActivity.value[id])

  if (!ids.length) return

  const entries = await Promise.all(ids.slice(0, 12).map(async (id) => {
    try {
      return [id, await getTrackPoints(id)]
    } catch {
      return [id, []]
    }
  }))
  routePointsByActivity.value = {
    ...routePointsByActivity.value,
    ...Object.fromEntries(entries),
  }
}

function routePointsForPost(post) {
  return routePointsByActivity.value[String(post.activityId)] || []
}

async function loadActivityOptions() {
  activityLoadError.value = ''
  try {
    activityOptions.value = await getActivities({ page: 1, page_size: 50 })
  } catch (err) {
    activityLoadError.value = '关联活动列表暂不可用。'
  }
}

function openImagePreview(url, alt = '') {
  previewImage.value = { url, alt }
  document.body.classList.add('lightbox-open')
}

function closeImagePreview() {
  previewImage.value = { url: '', alt: '' }
  document.body.classList.remove('lightbox-open')
}

function handlePreviewKeydown(event) {
  if (event.key === 'Escape') closeImagePreview()
}

async function publish() {
  posting.value = true
  actionError.value = ''
  notice.value = ''
  try {
    await createCommunityPost({
      content: draft.content,
      visibility: draft.visibility,
      activityId: draft.activityId,
      image: imageFile.value,
    })
    draft.content = ''
    draft.activityId = ''
    imageFile.value = null
    imageInputKey.value += 1
    notice.value = '动态已发布。'
    showToast('动态已发布')
    await load()
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : '动态发布失败'
  } finally {
    posting.value = false
  }
}

async function withPostAction(action, successMessage) {
  busy.value = true
  actionError.value = ''
  notice.value = ''
  try {
    await action()
    notice.value = successMessage
    showToast(successMessage)
    await load()
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : '操作失败'
  } finally {
    busy.value = false
  }
}

function toggleLike(post) {
  return withPostAction(
    () => (post.likedByMe ? unlikePost(post.id) : likePost(post.id)),
    post.likedByMe ? '已取消点赞' : '已点赞',
  )
}

function canFollow(post) {
  return post.userId && Number(post.userId) !== currentUserId.value
}

function toggleFollow(post) {
  return withPostAction(
    () => (post.followedByMe ? unfollowUser(post.userId) : followUser(post.userId)),
    post.followedByMe ? '已取消关注' : '已关注',
  )
}

function share(post) {
  return withPostAction(() => sharePost(post.id), '已记录分享')
}

async function toggleComments(post) {
  activePostId.value = activePostId.value === post.id ? '' : post.id
  if (!activePostId.value || commentsByPost.value[post.id]) return

  commentsLoading.value = true
  try {
    commentsByPost.value = {
      ...commentsByPost.value,
      [post.id]: await getPostComments(post.id, { page: 1, page_size: 20 }),
    }
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : '评论加载失败'
  } finally {
    commentsLoading.value = false
  }
}

async function comment(post) {
  await withPostAction(
    async () => {
      await createPostComment(post.id, { content: commentDraft.value })
      commentsByPost.value = {
        ...commentsByPost.value,
        [post.id]: await getPostComments(post.id, { page: 1, page_size: 20 }),
      }
      commentDraft.value = ''
    },
    '评论已发布',
  )
}

onMounted(() => {
  load()
  loadActivityOptions()
  window.addEventListener('keydown', handlePreviewKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handlePreviewKeydown)
  document.body.classList.remove('lightbox-open')
})
</script>

<style scoped>
.community-route-preview {
  padding: 0;
  overflow: hidden;
}

.community-route-preview :deep(.panel-heading) {
  display: none;
}

.community-route-preview :deep(.route-map) {
  min-height: 228px;
  border: 0;
  border-radius: 0;
}
</style>
