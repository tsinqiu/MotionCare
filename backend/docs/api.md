# Backend API

Base URL for local frontend development:

```text
http://localhost:8089/api
```

## Auth

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
```

Register and login return:

```json
{
  "data": {
    "user": {
      "id": 2,
      "username": "tester",
      "email": "tester@example.com",
      "role": "user"
    },
    "token": "jwt-token"
  },
  "meta": {}
}
```

Write APIs require:

```text
Authorization: Bearer <token>
```

## Activities

```text
GET /api/activities?page=1&page_size=20&activity_type=running&keyword=无锡&start_date=2026-06-01&end_date=2026-06-09&sort_by=avg_pace&sort_order=asc
GET /api/activities/:id
GET /api/activities/:id/track-points?limit=1000&offset=0
GET /api/activities/:id/heart-rate?limit=2000&offset=0
GET /api/activities/:id/speed?limit=2000&offset=0
GET /api/activities/:id/laps
GET /api/activities/:id/zones
```

`GET /api/activities` returns paged data:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 138,
    "totalPages": 7
  }
}
```

Supported query parameters:

- `page`, `page_size`: preferred pagination.
- `limit`, `offset`: backwards-compatible pagination.
- `activity_type`: activity type such as `running`; `all` is treated as no activity-type filter for frontend compatibility.
- `start_date`, `end_date`: local date range in `YYYY-MM-DD`; if both are provided, the range must be 1095 days or less.
- `keyword`: searches activity name, location, activity type, activity key, and Garmin activity id; maximum length is 100 characters.
- `source`: `garmin_import`, `manual_upload`, or `live_workout`.
- `owner`: defaults to `mine` for every logged-in user. Normal users are always restricted to `mine`; administrators may explicitly request `all` or `admin` in management views.
- `sort_by`: `local_start_time`, `distance_m`, `duration_s`, `avg_heart_rate_bpm`, `max_heart_rate_bpm`, `avg_pace`, `activity_training_load`.
- `sort_order`: `asc` or `desc`.

`page_size` is capped at 200. Track point, heart-rate, and speed endpoints keep their own higher `limit` caps so the frontend can request chart data without loading the full table.

## AI Assistant

All AI endpoints require:

```text
Authorization: Bearer <token>
```

```text
GET  /api/ai/health
POST /api/ai/chat
GET  /api/ai/daily-brief
POST /api/ai/activity-analysis
```

The backend supports DeepSeek, Ollama, and rule fallback. Recommended local
development values:

```text
AI_PROVIDER=auto
AI_PROVIDER_ORDER=deepseek,ollama
AI_DEEPSEEK_MODEL=deepseek-chat
AI_DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=your_deepseek_key
AI_OLLAMA_MODEL=qwen2.5:1.5b-instruct
AI_OLLAMA_BASE_URL=http://127.0.0.1:11434
```

Cloud servers with limited memory should use DeepSeek only:

```text
AI_PROVIDER=deepseek
AI_DEEPSEEK_MODEL=deepseek-chat
AI_DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=your_deepseek_key
```

When the configured provider is unavailable and `AI_FALLBACK_RULES=true`,
responses keep the same shape and include fallback metadata:

```json
{
  "data": {},
  "meta": {
    "ai": {
      "provider": "rules",
      "fallback": true,
      "reason": "AI_PROVIDER_UNAVAILABLE"
    }
  }
}
```

`POST /api/ai/chat` accepts:

```json
{
  "message": "今天适合训练吗？"
}
```

`POST /api/ai/activity-analysis` accepts:

```json
{
  "activityId": 123
}
```

`GET /api/ai/daily-brief` returns rule/AI advice plus the coach model signal under `data.ml`.
The frontend treats `trainingIndexScore` and `trainingIndexLabel` as the user-facing training index while keeping `readinessScore` for backwards compatibility:

```json
{
  "data": {
    "ml": {
      "readinessScore": 38,
      "trainingIndexScore": 38,
      "trainingIndexLabel": "恢复优先",
      "readinessLevel": "low",
      "riskLevel": "orange",
      "loadAction": "reduce",
      "modelVersion": "coach-v1",
      "provider": "rules",
      "fallback": true
    }
  },
  "meta": {}
}
```

AI output is for training reference only and is not a medical diagnosis. Chat
history, prompts, and model responses are not persisted in MySQL.

## Manual Upload

```text
POST   /api/manual-activities
GET    /api/manual-activities/:id
PUT    /api/manual-activities/:id
DELETE /api/manual-activities/:id
```

Manual upload only stores summary data. It does not automatically run ML prediction. `distanceM` may be `0` for non-distance activities such as strength training, but `durationS` must be greater than `0`.
Logged-in users can create and manage their own manual activities. Administrators can manage all manual activities. Missing and unauthorized activity ids both return `404 ACTIVITY_NOT_FOUND`.

Example body:

```json
{
  "activityType": "running",
  "activityName": "Manual Test Run",
  "localStartTime": "2026-06-09 08:00:00",
  "distanceM": 5000,
  "durationS": 1800,
  "movingDurationS": 1780,
  "elapsedDurationS": 1850,
  "avgSpeedMps": 2.8,
  "maxSpeedMps": 4.5,
  "avgHeartRateBpm": 150,
  "maxHeartRateBpm": 175,
  "avgCadenceSpm": 165,
  "maxCadenceSpm": 190,
  "elevationGainM": 30,
  "elevationLossM": 30,
  "avgStrideLengthCm": 100,
  "normalizedPowerW": 220
}
```

## Stats

```text
GET /api/stats/summary
GET /api/stats/activity-types
GET /api/stats/timeline?group_by=month
GET /api/stats/metric-trend?metric=avg_heart_rate_bpm&range=6m
GET /api/stats/calendar?month=2026-06
GET /api/stats/heart-rate-zones
GET /api/stats/personal-bests
```

Stats endpoints support the same filters as activities where relevant: `activity_type`, `start_date`, `end_date`, `keyword`, `source`, and `owner`.

`GET /api/stats/summary` also supports:

- `range=month&date=2026-06`
- `range=year&date=2026`
- `range=all`

Summary includes total count, `totalDistanceM`, `totalDistanceKm`, `totalDurationS`, `totalDurationMin`, moving duration, total calories, `fatKg`, average pace, average heart rate, average speed, longest distance, fastest pace, total training load, and `byActivityType`.

`GET /api/stats/metric-trend` supports:

```text
avg_cadence_spm
avg_heart_rate_bpm
max_heart_rate_bpm
avg_speed_mps
avg_pace_sec_per_km
distance_m
duration_s
calories
activity_training_load
vo2max
body_battery_delta
```

Trend ranges are `42d`, `3m`, `6m`, `1y`, and `2y`. Unsupported metrics return `400 UNSUPPORTED_METRIC`.

`GET /api/stats/calendar` returns one entry for each day in the requested month, including activity count, activity types, top-level totals, a `totals` object, and activity summaries. Days without activities return `activityCount=0` and `activities=[]`.

Stats endpoints are cached in memory. Cache keys include route, query parameters, and user identity. Manual activity create/update/delete clears this cache. The default TTL is configured by:

```text
STATS_CACHE_TTL_SECONDS=60
```

Heart-rate zones return professional labels:

```text
Zone 1: 轻松
Zone 2: 有氧
Zone 3: 节奏
Zone 4: 阈值
Zone 5: 高强度
```

Personal bests are grouped into `steps`, `running`, `cycling`, `swimming`, and `overall`. Groups without reliable data return an empty array; the backend does not synthesize fake records.

## Training

```text
GET /api/training/load-balance?range=3m&end_date=2026-06-10
```

`range` supports `42d`, `3m`, `6m`, `1y`, and `2y`. The endpoint returns daily training load plus CTL, ATL, and TSB values calculated from existing training load data. Each point includes the activities for that day.

Example response:

```json
{
  "data": [
    {
      "date": "2026-06-01",
      "dailyTrainingLoad": 120,
      "ctl": 82.34,
      "atl": 101.2,
      "tsb": -18.86,
      "activities": []
    }
  ],
  "meta": {
    "cache": {
      "hit": false
    }
  }
}
```

## Dashboard

```text
GET /api/dashboard/overview
```

Returns recent activities, monthly summary, yearly summary, recent training load, and personal best summaries for the first screen.

`GET /api/dashboard/overview?training_load_range=3m` may request a longer training-load series for chart pages. Supported values are `42d`, `3m`, `6m`, `1y`, and `2y`. If this parameter is omitted, the endpoint keeps the compact first-screen behavior and returns only the latest 30 training-load points.

## Extension Modules

These modules persist real backend state. Garmin Connect is the only sync
provider currently exposed by the API; unimplemented providers are rejected
instead of appearing as placeholder integrations.

Sync APIs require login:

```text
GET  /api/sync/providers
PUT  /api/sync/providers/:provider/settings
GET  /api/sync/providers/:provider/account
POST /api/sync/providers/:provider/authorize
POST /api/sync/providers/:provider/disconnect
POST /api/sync/jobs
GET  /api/sync/jobs?page=1&page_size=20
GET  /api/sync/logs?page=1&page_size=20
```

Garmin account status:

```http
GET /api/sync/providers/garmin/account
Authorization: Bearer <token>
```

Example response:

```json
{
  "data": {
    "provider": "garmin",
    "exists": true,
    "status": "connected",
    "email": "runner@example.com",
    "isCn": false,
    "lastSyncAt": "2026-06-13 16:12:10.263",
    "connectedAt": "2026-06-13 16:08:00.000"
  },
  "meta": {}
}
```

Bind Garmin to the currently logged-in app user:

```http
POST /api/sync/providers/garmin/authorize
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "runner@example.com",
  "password": "garmin-password",
  "mfaCode": "123456",
  "isCn": false
}
```

`mfaCode` is only required when Garmin asks for MFA. The backend does not store
the Garmin password; it stores connection state in `SyncProviderConnections` and
Garmin token files in the configured token directory.

Start a Garmin sync:

```http
POST /api/sync/jobs
Authorization: Bearer <token>
Content-Type: application/json

{
  "provider": "garmin",
  "jobType": "manual_sync"
}
```

Garmin sync checks activities from March 1 of the current year through today,
skips activity ids already present in `Activities.garmin_activity_id`, imports
new FIT/JSON data into MySQL, sets `owner_user_id` to the current app user, and
writes `SyncJobs`/`SyncLogs` rows. `activityCount` is the number of newly
imported activities.

Community read APIs are public; write APIs require login:

```text
GET    /api/community/posts?page=1&page_size=20
POST   /api/community/posts
GET    /api/community/posts/:id/comments
POST   /api/community/posts/:id/comments
POST   /api/community/posts/:id/like
DELETE /api/community/posts/:id/like
POST   /api/community/posts/:id/share
```

`GET /api/community/posts` returns paged posts. When a post is linked to an
activity, the response also includes the activity summary used by the MotionCare
feed:

```json
{
  "data": {
    "items": [
      {
        "id": 1,
        "username": "demo",
        "content": "分享了一次运动",
        "activityId": 234,
        "activityName": "无锡市 跑步",
        "activityType": "running",
        "activityLocalStartTime": "2026-07-01 16:01:00",
        "activityLocationName": "无锡市",
        "distanceM": 14020,
        "durationS": 3825,
        "elevationGainM": 64,
        "activityTrainingLoad": 239,
        "weatherCondition": "多云",
        "temperatureC": 28,
        "imageUrl": "",
        "likeCount": 0,
        "commentCount": 0,
        "shareCount": 0,
        "likedByMe": false,
        "followedByMe": false,
        "createdAt": "2026-07-05 17:00:00"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "meta": {}
}
```

`POST /api/community/posts` accepts `multipart/form-data`:

```text
content      required, max 2000 chars
visibility   private | followers | public, defaults to public
activityId   optional activity id owned by the current user
image        optional image file
```

Activity-detail sharing uses `content="分享了一次运动"` plus `activityId`. The
frontend treats this as an automatic activity share: it hides the repeated
content line, shows distance, computed pace and duration, and renders the
activity map when no uploaded image is present. Training load is still returned
by the API for compatibility, but it is not shown on the feed card.

Explore article APIs are public:

```text
GET /api/explore/articles?type=course&keyword=base
GET /api/explore/articles/:id
GET /api/explore/recommendations
```

User settings require login:

```text
GET /api/settings
PUT /api/settings
```

Live workout APIs require login:

```text
POST /api/workouts
GET  /api/workouts/:id
POST /api/workouts/:id/track-points
POST /api/workouts/:id/pause
POST /api/workouts/:id/resume
POST /api/workouts/:id/finish
POST /api/workouts/:id/cancel
```

Track point batches may include `accuracyM`, `bearingDeg`, `provider`,
`isAccepted`, and `rejectReason` in addition to coordinates, distance, speed, and
sensor fields. `finish` creates a real activity with `data_source="live_workout"`,
recomputes canonical distance from accepted GPS points, writes summaries, and
copies collected workout points into `TrackPoints`. Finishing a workout clears
the stats cache.

## ML Models

```text
GET  /api/ml/health
POST /api/ml/running-prediction
GET  /api/ml/performance-profile
```

MotionCare currently has three local ML/modelized outputs:

- `running-v1`: Python `joblib` model for single-run training-load level and fatigue-risk prediction.
- `coach-v1`: coach readiness model with rule fallback, personal percentile features, weather/recovery safety constraints, and optional local `coach_model.joblib`.
- `performance-v1`: explainable performance profile service for training index, running power, and five-power scores. It does not require a trained artifact and may use the offline FitRec aggregate reference report when present.

`GET /api/ml/health` is public. `POST /api/ml/running-prediction` and `GET /api/ml/performance-profile` require `Authorization: Bearer <token>`.

Health response includes running-model status and the performance-profile status:

```json
{
  "data": {
    "status": "ok",
    "modelAvailable": true,
    "scriptAvailable": true,
    "modelVersion": "running-v1",
    "supportedActivityType": "running",
    "featureNames": [
      "distanceM",
      "durationS",
      "movingDurationS",
      "elapsedDurationS",
      "avgSpeedMps",
      "maxSpeedMps",
      "avgHeartRateBpm",
      "maxHeartRateBpm",
      "avgCadenceSpm",
      "maxCadenceSpm",
      "elevationGainM",
      "elevationLossM",
      "avgStrideLengthCm",
      "normalizedPowerW"
    ],
    "performanceProfile": {
      "status": "ok",
      "modelVersion": "performance-v1",
      "provider": "local_performance_model",
      "supportedOutputs": ["trainingIndex", "runningPower", "fivePower"],
      "requiresTrainingArtifact": false,
      "referenceAvailable": true
    }
  },
  "meta": {}
}
```

### Running Prediction

Prediction is intentionally separate from upload. The frontend should show a separate button after upload if the user wants analysis.

`POST /api/ml/running-prediction` accepts numeric running metrics:

```json
{
  "distanceM": 5000,
  "durationS": 1800,
  "movingDurationS": 1780,
  "elapsedDurationS": 1850,
  "avgSpeedMps": 2.8,
  "maxSpeedMps": 4.5,
  "avgHeartRateBpm": 150,
  "maxHeartRateBpm": 175,
  "avgCadenceSpm": 165,
  "maxCadenceSpm": 190,
  "elevationGainM": 30,
  "elevationLossM": 30,
  "avgStrideLengthCm": 100,
  "normalizedPowerW": 220
}
```

For compatibility with the current activity-detail page, `maxCadenceSpm` defaults to `avgCadenceSpm` when omitted, and `normalizedPowerW` defaults to `avgPowerW` or `0` when omitted.

It returns:

```json
{
  "data": {
    "predictedTrainingLoadLevel": "medium",
    "fatigueRisk": "low",
    "recoveryAdvice": "string",
    "confidence": 0.82,
    "modelVersion": "running-v1"
  },
  "meta": {}
}
```

### Performance Profile

`GET /api/ml/performance-profile` returns the user-level modelized profile used by the Today and Status pages:

```json
{
  "data": {
    "trainingIndex": {
      "score": 38,
      "level": "recovery",
      "label": "恢复优先",
      "recommendation": "建议今天以恢复、拉伸或轻松有氧为主。",
      "factors": ["TSB 显著偏低", "睡眠评分偏低"]
    },
    "runningPower": {
      "score": 72,
      "level": "strong",
      "label": "强劲",
      "trend": "stable",
      "factors": ["近期配速表现较好", "长距离能力较稳定"],
      "components": {
        "vo2max": 71.4,
        "bestPace": 66.2,
        "heartRatePaceEfficiency": 73.1,
        "endurance": 80.0,
        "volume28d": 54.5,
        "load28d": 68.0,
        "externalReference": 62.4
      }
    },
    "fivePower": [
      { "key": "endurance", "label": "耐力", "score": 80, "detail": "长期负荷、跑量和长距离能力" },
      { "key": "speed", "label": "速度", "score": 74, "detail": "配速表现、VO2max 和训练刺激" },
      { "key": "technique", "label": "技术", "score": 62, "detail": "配速稳定、步频、功率和动作线索" },
      { "key": "strength", "label": "肌力", "score": 70, "detail": "负荷承受、功率、爬升和力量基础" },
      { "key": "stability", "label": "稳定", "score": 48, "detail": "睡眠、HRV、压力和状态余量" }
    ],
    "dataQuality": {
      "score": 86,
      "warnings": [],
      "coverage": {
        "runningActivities28d": 12,
        "heartRateRuns": 12,
        "vo2maxDays": 3,
        "cadenceRuns": 10,
        "powerRuns": 6,
        "sleepDays14d": 9,
        "hrvDays14d": 8,
        "fitrecReference": true
      }
    },
    "keyMetrics": {
      "ctl": 238.91,
      "atl": 305.61,
      "tsb": -66.7,
      "vo2max": 58.2,
      "totalDistance28d": 120.5,
      "longestDistanceKm": 21.1
    },
    "model": {
      "modelVersion": "performance-v1",
      "provider": "local_performance_model",
      "confidence": 0.78
    }
  },
  "meta": {}
}
```

`trainingIndex` reuses the coach readiness score semantics: higher means more suitable for training, lower means recovery should be prioritized. Rule safety still caps risky situations such as red/orange risk, high heat/humidity, and poor recovery.

`runningPower` is not CTL clamped to 100. It combines VO2max, best pace, heart-rate/pace efficiency, long-distance ability, 28-day volume/load, optional FitRec reference calibration, and a fatigue penalty when TSB is very low.

### Training Scripts And Artifacts

Python dependencies live in `backend/ml/requirements.txt`. Train locally from `backend`:

```powershell
python -m pip install -r ml\requirements.txt
python ml\train_running_model.py
python ml\train_coach_model.py
```

The scripts write `.joblib` artifacts and metadata JSON under `backend/ml/models/`. Model artifacts are local runtime outputs and must not be committed.

FitRec/Endomondo HR is used only as an offline aggregate reference. Do not commit the original `database/data/FitRec/endomondoHR.json.gz`; generate or refresh the small reference report instead:

```powershell
python ml\analyze_fitrec_reference.py --input ..\database\data\FitRec\endomondoHR.json.gz
```

Training reports include classification report, macro-F1, weighted-F1, balanced accuracy, confusion matrix, class distribution, label-source summary, and warnings for low-sample classes. Single-class targets are marked `not_trainable`.

## Response Style

Successful responses use:

```json
{
  "data": {},
  "meta": {}
}
```

Stats endpoints include cache metadata:

```json
{
  "data": {},
  "meta": {
    "cache": {
      "hit": false
    }
  }
}
```

Errors return:

```json
{
  "error": {
    "code": "INVALID_QUERY",
    "message": "limit must be an integer from 1 to 200"
  }
}
```

## Database Setup

For an existing local database, apply the phase-two migration and seed the admin user:

```powershell
cd backend
npm run seed:admin
```

`database/sql/04_auth_manual_upload.sql` must be applied once before seeding if the database was created before auth/manual upload existed.

Apply the phase-three performance indexes once:

```sql
source database/sql/05_performance_indexes.sql;
```

The script is idempotent and can be re-run safely.

Apply the extension module migration before using sync, community, explore, settings, or live workout APIs:

```sql
source database/sql/06_extension_modules.sql;
```

The extension migration uses `CREATE TABLE IF NOT EXISTS` and can be re-run safely.

Apply the live workout location-quality migration before using native APK workout
recording:

```sql
source database/sql/19_live_workout_location_quality.sql;
```

The migration is idempotent and adds GPS quality metadata used for filtering,
debugging, and route display.
