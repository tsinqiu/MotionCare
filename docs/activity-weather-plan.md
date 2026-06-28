# 活动天气指标实施方案

本方案用于给后续 AI 或开发者执行。目标是在每次运动活动中显示当时的天气、温度、湿度、体感温度，并支持通过历史天气 API 自动补全。按最小可用改动处理：天气数据直接存到 `Activities`，自动补全只按活动开始时间和起点经纬度取最近一小时天气。

## 目标

1. 每条运动记录支持天气指标。
2. 活动详情页显示天气、温度、湿度、体感温度。
3. 活动列表卡片可以简要显示天气和温度。
4. 后端 API 返回这些字段。
5. 支持根据活动时间和经纬度，通过历史天气 API 自动补全。

## 历史天气 API 选择

推荐使用 Open-Meteo Historical Weather API：

- 文档：https://open-meteo.com/en/docs/historical-weather-api
- API 地址：`https://archive-api.open-meteo.com/v1/archive`
- 优点：不需要 API key，支持全球经纬度，支持历史逐小时天气。
- 本项目需要的变量：`temperature_2m`、`relative_humidity_2m`、`apparent_temperature`、`weather_code`。

请求示例：

```http
GET https://archive-api.open-meteo.com/v1/archive?latitude=31.23&longitude=121.47&start_date=2026-06-20&end_date=2026-06-20&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code&timezone=auto
```

返回中重点读取：

```json
{
  "hourly": {
    "time": ["2026-06-20T07:00", "2026-06-20T08:00"],
    "temperature_2m": [23.1, 24.0],
    "relative_humidity_2m": [71, 68],
    "apparent_temperature": [24.2, 25.4],
    "weather_code": [3, 2]
  }
}
```

后端按活动开始时间选择最近一小时的数据。例如活动开始于 `2026-06-20 07:34`，就在 `07:00` 和 `08:00` 中选时间差更小的一条。

## 数据库修改

修改：

- `database/sql/01_schema.sql`
- 新增迁移文件，例如 `database/sql/12_activity_weather.sql`

给 `Activities` 增加字段：

```sql
weather_condition VARCHAR(80) NULL,
temperature_c DOUBLE NULL,
humidity_percent TINYINT NULL,
feels_like_c DOUBLE NULL,
weather_source VARCHAR(40) NULL,
weather_updated_at TIMESTAMP NULL
```

字段说明：

- `weather_condition`：天气文字，例如 `晴`、`多云`、`小雨`。
- `temperature_c`：实际温度，摄氏度。
- `humidity_percent`：湿度，`0-100`。
- `feels_like_c`：体感温度，摄氏度。
- `weather_source`：来源，例如 `manual`、`open_meteo`。
- `weather_updated_at`：天气字段最后更新时间。

迁移文件建议写成幂等形式，参考现有 `04_auth_manual_upload.sql` / `07_profile_follow_explore_uploads.sql` 中通过 `information_schema.COLUMNS` 判断字段是否存在的写法。

## 后端修改

主要文件：

- `backend/src/services/activityService.js`
- `backend/src/services/weatherService.js`
- `backend/src/routes/activityRoutes.js`
- `backend/test/app.test.js`

### activityService

在 `listActivities()` 的 SELECT 中增加：

```sql
a.weather_condition AS weatherCondition,
a.temperature_c AS temperatureC,
a.humidity_percent AS humidityPercent,
a.feels_like_c AS feelsLikeC
```

在 `getActivityById()` 的 SELECT 中增加：

```sql
a.weather_condition AS weatherCondition,
a.temperature_c AS temperatureC,
a.humidity_percent AS humidityPercent,
a.feels_like_c AS feelsLikeC,
a.weather_source AS weatherSource,
a.weather_updated_at AS weatherUpdatedAt
```

新增 `updateActivityWeather(user, activityId, payload, source = 'manual')`：

- 允许 `admin` 或 `owner_user_id === user.id` 修改。
- `weatherCondition` 最多 80 字符，空字符串存 `NULL`。
- `temperatureC` 可为空，非空时限制在 `-80` 到 `80`。
- `humidityPercent` 可为空，非空时必须是 `0-100` 的整数。
- `feelsLikeC` 可为空，非空时限制在 `-100` 到 `100`。
- 更新 `weather_source = source`。
- 更新 `weather_updated_at = CURRENT_TIMESTAMP`。

SQL 示例：

```sql
UPDATE Activities
SET weather_condition = ?,
    temperature_c = ?,
    humidity_percent = ?,
    feels_like_c = ?,
    weather_source = ?,
    weather_updated_at = CURRENT_TIMESTAMP
WHERE id = ?
```

### weatherService

新增 `backend/src/services/weatherService.js`。

职责：

1. 根据活动 `id` 读取活动开始时间和起点经纬度。
2. 调用 Open-Meteo 历史天气接口。
3. 找到最接近活动开始时间的 hourly 数据。
4. 把 `weather_code` 映射成中文天气文字。
5. 返回可写入 `Activities` 的天气 payload。

如果缺少 `start_latitude`、`start_longitude` 或 `local_start_time`，直接抛出 400，例如 `activity location and start time are required`。

Node 实现时使用内置 `fetch`，不要新增依赖：

```js
const url = new URL('https://archive-api.open-meteo.com/v1/archive')
url.searchParams.set('latitude', activity.startLatitude)
url.searchParams.set('longitude', activity.startLongitude)
url.searchParams.set('start_date', activity.localStartTime.slice(0, 10))
url.searchParams.set('end_date', activity.localStartTime.slice(0, 10))
url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code')
url.searchParams.set('timezone', 'auto')

const response = await fetch(url)
if (!response.ok) throw new ApiError(502, 'weather api request failed', 'WEATHER_API_ERROR')
const data = await response.json()
```

天气代码映射先覆盖常见值即可：

```js
const WEATHER_CODE_LABELS = {
  0: '晴',
  1: '大部晴朗',
  2: '局部多云',
  3: '多云',
  45: '雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '大毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  80: '小阵雨',
  81: '阵雨',
  82: '强阵雨',
  95: '雷暴'
}
```

Open-Meteo 返回空数据时返回 404 或 502 都可以，建议用 502：外部天气数据不可用。

ponytail: 先只取活动开始时间附近的一小时天气；如果以后需要长距离路线天气变化，再新增逐点天气表。

### activityRoutes

引入 `authenticate`。

手动更新接口：

```http
PATCH /api/activities/:id/weather
```

请求体：

```json
{
  "weatherCondition": "多云",
  "temperatureC": 24.5,
  "humidityPercent": 68,
  "feelsLikeC": 26.1
}
```

自动获取接口：

```http
POST /api/activities/:id/weather/fetch
```

流程：

1. 登录校验。
2. 调用 `weatherService.fetchHistoricalWeatherForActivity(activityId)`。
3. 调用 `activityService.updateActivityWeather(user, activityId, payload, 'open_meteo')`。
4. 返回更新后的活动详情。

不要把天气更新混进活动名称编辑接口里。天气字段是独立模块，单独接口更清楚，也方便以后自动补全复用。

## 前端修改

主要文件：

- `frontend/src/services/activities.js`
- `frontend/src/views/ActivityDetail.vue`
- `frontend/src/components/ActivityCard.vue`
- `frontend/src/components/SessionDetails.vue`

### activities.js

`normalizeActivity()` 增加：

```js
weather_condition: firstDefined(row.weather_condition, row.weatherCondition),
temperature_c: toNumber(firstDefined(row.temperature_c, row.temperatureC)),
humidity_percent: toNumber(firstDefined(row.humidity_percent, row.humidityPercent)),
feels_like_c: toNumber(firstDefined(row.feels_like_c, row.feelsLikeC)),
weather_source: firstDefined(row.weather_source, row.weatherSource),
weather_updated_at: firstDefined(row.weather_updated_at, row.weatherUpdatedAt),
```

新增：

```js
export async function updateActivityWeather(id, payload) {
  const envelope = await mutateEnvelope('patch', `/activities/${id}/weather`, payload, { normalizer: normalizeActivity })
  return envelope.data
}

export async function fetchActivityWeather(id) {
  const envelope = await mutateEnvelope('post', `/activities/${id}/weather/fetch`, {}, { normalizer: normalizeActivity })
  return envelope.data
}
```

### ActivityDetail.vue

在活动详情页增加天气区块，放在基础指标后面即可。

展示内容：

- 天气：`activity.weather_condition || '--'`
- 温度：`activity.temperature_c != null ? activity.temperature_c + '°C' : '--'`
- 湿度：`activity.humidity_percent != null ? activity.humidity_percent + '%' : '--'`
- 体感：`activity.feels_like_c != null ? activity.feels_like_c + '°C' : '--'`

编辑表单：

- 天气文字输入框。
- 温度数字输入框，`step="0.1"`。
- 湿度数字输入框，`min="0"`，`max="100"`，`step="1"`。
- 体感温度数字输入框，`step="0.1"`。
- 保存按钮调用 `updateActivityWeather()`。
- 自动获取按钮调用 `fetchActivityWeather()`。

自动获取按钮只在活动有 `start_latitude` / `start_longitude` 和 `local_start_time` 时可用。如果后端返回缺少地点，前端提示“该活动缺少起点经纬度，请手动填写天气”。

### ActivityCard.vue

活动卡片中只做简要显示，避免卡片太挤。

建议显示：

```vue
<span v-if="activity.weather_condition || activity.temperature_c !== null">
  <small>天气</small>
  <b>{{ weatherText }}</b>
</span>
```

`weatherText`：

```js
const weatherText = computed(() => {
  const condition = props.activity.weather_condition || '--'
  const temp = props.activity.temperature_c
  return temp === null || temp === undefined ? condition : `${condition} ${Math.round(temp)}°C`
})
```

### SessionDetails.vue

如果该组件负责展示活动详情字段，也可以把天气指标放进去。不要在 `ActivityDetail.vue` 和 `SessionDetails.vue` 重复展示一模一样的大块内容，选一个位置即可。

## 最小测试

后端：

1. `PATCH /api/activities/:id/weather` 可以保存天气、温度、湿度、体感温度。
2. `humidityPercent=-1` 返回 400。
3. `humidityPercent=101` 返回 400。
4. 非登录用户不能修改天气。
5. `GET /api/activities/:id` 返回天气字段。
6. `GET /api/activities` 返回列表卡片需要的天气字段。
7. `POST /api/activities/:id/weather/fetch` 会调用 Open-Meteo 并写回 `weather_source = 'open_meteo'`。
8. 缺少经纬度的活动调用自动获取时返回 400。

前端手测：

1. 打开活动详情页，填写天气指标并保存。
2. 刷新页面后天气指标仍显示。
3. 返回活动列表，卡片显示天气和温度。
4. 清空某个天气字段后保存，页面显示 `--`。
5. 选择有经纬度的活动点击自动获取，能写回并刷新显示。

## 注意事项

- 不要为天气单独建表，当前需求是一条活动对应一组天气指标，直接放 `Activities` 最简单。
- 不要先做定时任务批量补全。课程项目优先完成可见功能，自动补全按钮足够。
- 不要新增天气图标库。先用文字展示，之后如果 UI 需要再加现有图标。
- 摄氏度统一用 `°C`，湿度统一用 `%`。
- Open-Meteo 历史天气对当天或很新的数据可能有延迟；返回空数据时允许用户手动填写。

## 参考资料

- Open-Meteo Historical Weather API：https://open-meteo.com/en/docs/historical-weather-api
- Open-Meteo 首页：https://open-meteo.com/
