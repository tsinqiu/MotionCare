# 运动记录与跑鞋照片功能修改方案

本方案给后续 AI 或开发者执行。原则是最小改动：不新建复杂照片表，活动和跑鞋各存一张照片路径；跑鞋里程直接从绑定活动汇总，不维护第二份里程状态。

## 目标

1. 运动记录支持编辑名称。
2. 运动记录支持体感程度 `1-10` 分。
3. 运动记录支持添加照片。
4. 跑鞋支持添加照片。
5. 跑鞋页面显示绑定活动后的对应里程。
6. 点击跑鞋卡片后，显示该跑鞋绑定的活动记录列表。

## 数据库修改

修改：

- `database/sql/01_schema.sql`
- 新增迁移文件，例如 `database/sql/11_activity_shoe_photos_effort.sql`

给 `Activities` 增加字段：

```sql
perceived_effort TINYINT NULL,
photo_path VARCHAR(1000) NULL,
photo_original_name VARCHAR(260) NULL,
photo_mime_type VARCHAR(120) NULL,
photo_size_bytes BIGINT NULL
```

给 `Shoes` 增加字段：

```sql
photo_path VARCHAR(1000) NULL,
photo_original_name VARCHAR(260) NULL,
photo_mime_type VARCHAR(120) NULL,
photo_size_bytes BIGINT NULL
```

体感分在后端校验 `1-10` 即可，不必加复杂 `CHECK` 约束。

## 后端修改

主要文件：

- `backend/src/config.js`
- `backend/src/services/activityService.js`
- `backend/src/routes/activityRoutes.js`
- `backend/src/services/shoeService.js`
- `backend/src/routes/shoeRoutes.js`

复用项目已有的 `multer` 和 `/uploads` 静态目录，不新增依赖。

### 上传目录

在 `config.uploads` 中增加：

```js
activityImagesDir: resolveBackendPath(process.env.ACTIVITY_IMAGE_UPLOAD_DIR, 'uploads/activity-images'),
shoeImagesDir: resolveBackendPath(process.env.SHOE_IMAGE_UPLOAD_DIR, 'uploads/shoe-images'),
```

照片上传的文件名生成、文件大小限制、`image/*` 校验，可直接参考 `backend/src/routes/communityRoutes.js`。

### activityService

在 `listActivities()` 的 SELECT 中增加：

```sql
a.perceived_effort AS perceivedEffort,
a.photo_path AS photoPath
```

在 `getActivityById()` 的 SELECT 中也增加：

```sql
a.perceived_effort AS perceivedEffort,
a.photo_path AS photoPath,
a.photo_original_name AS photoOriginalName,
a.photo_mime_type AS photoMimeType,
a.photo_size_bytes AS photoSizeBytes
```

新增 `updateActivityMeta(user, activityId, payload)`：

- 允许 `admin` 或 `owner_user_id === user.id` 修改。
- 支持更新 `activity_name`。
- 支持更新 `perceived_effort`。
- `perceived_effort` 为空时存 `NULL`。
- 非空时必须是 `1-10` 的整数。

新增 `updateActivityPhoto(user, activityId, fileInfo)`：

- 权限同上。
- 更新照片字段。
- 返回更新后的活动详情。

### activityRoutes

引入 `authenticate`。

新增接口：

```http
PATCH /api/activities/:id
```

请求体：

```json
{
  "activityName": "晨跑",
  "perceivedEffort": 7
}
```

新增接口：

```http
POST /api/activities/:id/photo
```

要求：

- 登录后才能上传。
- `multipart/form-data`
- 字段名使用 `photo`
- 只接受图片文件。
- 保存路径形如 `/uploads/activity-images/xxx.jpg`。

### shoeService

`list(userId)` 不要把展示里程依赖在 `Shoes.distance_km` 上，改成从绑定活动汇总：

```sql
ROUND(COALESCE(SUM(js.distance_m), 0) / 1000, 2) AS boundDistanceKm
```

JOIN 结构：

```sql
LEFT JOIN Activities a ON a.shoe_id = s.id
LEFT JOIN ActivitySummaries js ON js.activity_id = a.id
```

SELECT 增加：

```sql
s.photo_path AS photoPath
```

新增 `getActivities(userId, shoeId)`：

- 先确认跑鞋属于当前用户。
- 返回这双鞋绑定的活动列表。
- 字段尽量与活动卡片需要的字段一致：`id`、`activityName`、`activityType`、`localStartTime`、`distanceM`、`durationS`、`calories`、`avgSpeedMps`、`perceivedEffort`、`photoPath`。

新增 `updatePhoto(userId, shoeId, fileInfo)`：

- 只允许更新当前用户自己的跑鞋。
- 更新跑鞋照片字段。

`bindActivity(userId, activityId, shoeId)` 建议加一个小校验：

- `shoeId` 不为空时，确认该鞋属于当前用户。
- 再执行绑定，避免把活动绑定到别人的跑鞋。

### shoeRoutes

新增接口：

```http
GET /api/shoes/:id/activities
```

返回该跑鞋绑定的活动列表。

新增接口：

```http
POST /api/shoes/:id/photo
```

要求：

- 登录后才能上传。
- `multipart/form-data`
- 字段名使用 `photo`
- 只接受图片文件。
- 保存路径形如 `/uploads/shoe-images/xxx.jpg`。

现有 `PATCH /api/shoes/:id` 可以保持不变。

## 前端修改

主要文件：

- `frontend/src/services/activities.js`
- `frontend/src/views/ActivityDetail.vue`
- `frontend/src/components/ActivityCard.vue`
- `frontend/src/views/Shoes.vue`

### activities.js

`normalizeActivity()` 增加：

```js
perceived_effort: toNumber(firstDefined(row.perceived_effort, row.perceivedEffort)),
photo_path: firstDefined(row.photo_path, row.photoPath),
shoe_id: toNumber(firstDefined(row.shoe_id, row.shoeId)),
shoe_name: firstDefined(row.shoe_name, row.shoeName),
```

新增：

```js
export async function updateActivityMeta(id, payload) {
  const envelope = await mutateEnvelope('patch', `/activities/${id}`, payload, { normalizer: normalizeActivity })
  return envelope.data
}

export async function uploadActivityPhoto(id, file) {
  const form = new FormData()
  form.append('photo', file)
  const response = await apiClient.post(`/activities/${id}/photo`, form)
  const envelope = unwrapApiResponse(response.data)
  return normalizeActivity(envelope.data)
}
```

注意需要从 `@/services/http` 引入 `apiClient` 和 `unwrapApiResponse`，或者在 `api.js` 中增加通用上传 helper。

### ActivityDetail.vue

在详情页标题区域或详情信息区增加：

- 活动名称输入框。
- 体感程度 `1-10` 数字输入。
- 保存按钮，调用 `PATCH /activities/:id`。
- 图片上传 input，调用 `POST /activities/:id/photo`。
- 如果 `activity.photo_path` 存在，显示图片。

这次编辑名称不应只限制 `is_manual`，因为需求是“运动记录支持编辑名称”。

### ActivityCard.vue

如果 `activity.photo_path` 存在，在卡片左侧或顶部显示小图。

指标区可增加体感：

```vue
<span>
  <small>体感</small>
  <b>{{ activity.perceived_effort ? `${activity.perceived_effort}/10` : '--' }}</b>
</span>
```

### Shoes.vue

表单增加照片上传。

跑鞋卡片显示 `s.photoPath`。

里程显示改成绑定活动汇总：

```vue
{{ (s.boundDistanceKm ?? s.distanceKm ?? 0).toFixed(0) }} km
```

点击跑鞋卡片：

1. 设置 `selectedShoe = s`。
2. 请求 `GET /api/shoes/:id/activities`。
3. 在页面下方显示活动列表。
4. 复用 `ActivityCard` 展示活动。
5. 点击活动卡跳转 `/activities/:id`。

卡片上的删除、退役按钮要加 `.stop`，避免点击按钮时也打开活动列表。

## 最小测试

后端：

- `PATCH /api/activities/:id` 可以更新名称和 `perceivedEffort`。
- `perceivedEffort=0` 返回 400。
- `perceivedEffort=11` 返回 400。
- `GET /api/shoes` 返回 `boundDistanceKm`。
- `GET /api/shoes/:id/activities` 只返回当前用户这双鞋绑定的活动。
- 上传非图片文件返回 400。

前端手测：

1. 打开运动详情，修改名称和体感分，刷新后仍存在。
2. 上传活动照片，详情页和活动卡显示。
3. 添加跑鞋照片，跑鞋卡显示。
4. 给活动绑定跑鞋，回跑鞋页里程增加。
5. 点击跑鞋卡，能看到对应活动列表。

## 注意事项

- 当前项目里部分中文显示疑似编码异常，这次功能不要顺手修无关文案，避免 diff 变大。
- `Shoes.distance_km` 可以先保留，但展示优先用 `boundDistanceKm`。
- ponytail: 每个对象只存一张照片；如果以后需要多图，再新增 `ActivityPhotos` / `ShoePhotos` 表。
