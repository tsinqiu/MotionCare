# Garmin 新数据前后端改造说明

本文档说明 MotionCare 增加 Garmin 新数据后，下载脚本、数据库、后端接口和前端页面需要怎么调整。

## 数据范围

需要接入：

- 全天心率时序
- 全天压力时序
- 全天步数时序
- 强度分钟
- 睡眠阶段时序
- 睡眠心率时序
- 睡眠压力时序
- 睡眠动作 / restless
- HRV 采样点
- 训练状态
- 比赛预测
- 乳酸阈值
- 骑行 FTP

不需要接入：

- Garmin 饮水 hydration
- Garmin 天气 weather
- Garmin 装备 gear
- Garmin 体脂率
- Garmin 肌肉量
- Garmin 体脂秤身体成分数据
- Body Battery 时序
- 呼吸时序
- 血氧时序

天气继续使用项目现有外部接口。跑鞋和装备继续使用项目自己的 `Shoes` 模块。

## 下载脚本改造

修改文件：

- `database/scripts/download_garmin_connect.py`

现有 `HEALTH_FETCHERS` 只拉：

- `daily`
- `sleep`
- `rhr`
- `stress`
- `weight`

建议扩展为：

```python
HEALTH_FETCHERS = {
    "daily": lambda client, day: client.get_stats_and_body(day),
    "sleep": lambda client, day: client.get_sleep_data(day),
    "rhr": lambda client, day: client.get_rhr_day(day),
    "stress": lambda client, day: client.get_stress_data(day),
    "heart_rates": lambda client, day: client.get_heart_rates(day),
    "steps": lambda client, day: client.get_steps_data(day),
    "intensity_minutes": lambda client, day: client.get_intensity_minutes_data(day),
    "hrv": lambda client, day: client.get_hrv_data(day),
    "training_status": lambda client, day: client.get_training_status(day),
    "race_predictions": lambda client, day: client.get_race_predictions(),
    "lactate_threshold": lambda client, day: client.get_lactate_threshold(),
    "cycling_ftp": lambda client, day: client.get_cycling_ftp(),
}
```

注意：

- 中国区账号必须使用 `--cn`，也就是 `Garmin(is_cn=True)`。
- `race_predictions`、`lactate_threshold`、`cycling_ftp` 不一定严格按日期返回，但可以跟当天同步结果一起保存。
- 不再下载 `weight` 里的体脂秤身体成分，体重走手动填写。
- 不下载 hydration、weather、gear。

## 数据库改造

建议新增一个迁移文件，例如：

- `database/sql/14_garmin_analysis_timeseries.sql`

### 1. `SleepSummaries`

新增 HRV 状态：

```sql
ALTER TABLE SleepSummaries
  ADD COLUMN hrv_status VARCHAR(40) NULL AFTER avg_hrv;
```

### 2. `HeartRateSamples`

保存全天心率和睡眠心率。

```sql
CREATE TABLE IF NOT EXISTS HeartRateSamples (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sample_time_utc DATETIME(3) NOT NULL,
    heart_rate_bpm INT NULL,
    source VARCHAR(40) NOT NULL DEFAULT 'monitoring',
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_HeartRateSamples_user_time_source UNIQUE (user_id, sample_time_utc, source),
    CONSTRAINT FK_HeartRateSamples_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    KEY IX_HeartRateSamples_user_time (user_id, sample_time_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`source`：

- `monitoring`：全天心率
- `sleep`：睡眠心率

### 3. `StressSamples`

保存全天压力和睡眠压力。

```sql
CREATE TABLE IF NOT EXISTS StressSamples (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sample_time_utc DATETIME(3) NOT NULL,
    stress_level INT NULL,
    source VARCHAR(40) NOT NULL DEFAULT 'monitoring',
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_StressSamples_user_time_source UNIQUE (user_id, sample_time_utc, source),
    CONSTRAINT FK_StressSamples_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    KEY IX_StressSamples_user_time (user_id, sample_time_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`source`：

- `monitoring`：全天压力
- `sleep`：睡眠压力

### 4. `StepSamples`

保存全天步数分段。

```sql
CREATE TABLE IF NOT EXISTS StepSamples (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    segment_start_utc DATETIME(3) NOT NULL,
    segment_end_utc DATETIME(3) NULL,
    steps INT NOT NULL DEFAULT 0,
    activity_level VARCHAR(80) NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_StepSamples_user_start UNIQUE (user_id, segment_start_utc),
    CONSTRAINT FK_StepSamples_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    KEY IX_StepSamples_user_time (user_id, segment_start_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 5. `IntensityMinuteSamples`

如果只展示每日/每周强度分钟，继续放 `DailyHealthSummaries` 即可。若要画日内分布，再新增：

```sql
CREATE TABLE IF NOT EXISTS IntensityMinuteSamples (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sample_time_utc DATETIME(3) NOT NULL,
    moderate_minutes DOUBLE NULL,
    vigorous_minutes DOUBLE NULL,
    source VARCHAR(40) NOT NULL DEFAULT 'garmin',
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_IntensityMinuteSamples_user_time UNIQUE (user_id, sample_time_utc),
    CONSTRAINT FK_IntensityMinuteSamples_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    KEY IX_IntensityMinuteSamples_user_time (user_id, sample_time_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 6. `SleepStageSamples`

保存睡眠阶段时序。

```sql
CREATE TABLE IF NOT EXISTS SleepStageSamples (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sleep_date DATE NOT NULL,
    stage_start_utc DATETIME(3) NOT NULL,
    stage_end_utc DATETIME(3) NOT NULL,
    stage_type VARCHAR(40) NOT NULL,
    duration_s INT NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_SleepStageSamples_user_start UNIQUE (user_id, stage_start_utc),
    CONSTRAINT FK_SleepStageSamples_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    KEY IX_SleepStageSamples_user_date (user_id, sleep_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`stage_type` 统一成：

- `deep`
- `light`
- `rem`
- `awake`
- `unknown`

### 7. `SleepMovementSamples`

保存睡眠动作和 restless。

```sql
CREATE TABLE IF NOT EXISTS SleepMovementSamples (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sleep_date DATE NOT NULL,
    segment_start_utc DATETIME(3) NOT NULL,
    segment_end_utc DATETIME(3) NULL,
    movement_level INT NULL,
    source VARCHAR(40) NOT NULL DEFAULT 'sleepMovement',
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_SleepMovementSamples_user_start_source UNIQUE (user_id, segment_start_utc, source),
    CONSTRAINT FK_SleepMovementSamples_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    KEY IX_SleepMovementSamples_user_date (user_id, sleep_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`source`：

- `sleepMovement`
- `sleepRestlessMoments`

### 8. `HrvSamples`

保存 HRV 采样点。

```sql
CREATE TABLE IF NOT EXISTS HrvSamples (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sample_time_utc DATETIME(3) NOT NULL,
    sleep_date DATE NULL,
    hrv DOUBLE NULL,
    source VARCHAR(40) NOT NULL DEFAULT 'sleep',
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_HrvSamples_user_time_source UNIQUE (user_id, sample_time_utc, source),
    CONSTRAINT FK_HrvSamples_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    KEY IX_HrvSamples_user_date (user_id, sleep_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 9. `TrainingStatusSnapshots`

```sql
CREATE TABLE IF NOT EXISTS TrainingStatusSnapshots (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    snapshot_date DATE NOT NULL,
    vo2max DOUBLE NULL,
    training_status VARCHAR(80) NULL,
    load_balance VARCHAR(80) NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_TrainingStatusSnapshots_user_date UNIQUE (user_id, snapshot_date),
    CONSTRAINT FK_TrainingStatusSnapshots_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 10. `RacePredictions`

```sql
CREATE TABLE IF NOT EXISTS RacePredictions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    prediction_date DATE NOT NULL,
    time_5k_s INT NULL,
    time_10k_s INT NULL,
    time_half_marathon_s INT NULL,
    time_marathon_s INT NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_RacePredictions_user_date UNIQUE (user_id, prediction_date),
    CONSTRAINT FK_RacePredictions_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 11. `LactateThresholds`

```sql
CREATE TABLE IF NOT EXISTS LactateThresholds (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    threshold_date DATE NOT NULL,
    heart_rate_bpm INT NULL,
    speed_mps DOUBLE NULL,
    power_w INT NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_LactateThresholds_user_date UNIQUE (user_id, threshold_date),
    CONSTRAINT FK_LactateThresholds_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 12. `CyclingFtpSnapshots`

```sql
CREATE TABLE IF NOT EXISTS CyclingFtpSnapshots (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    snapshot_date DATE NOT NULL,
    ftp_w INT NULL,
    sport VARCHAR(40) NULL,
    source VARCHAR(80) NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_CyclingFtpSnapshots_user_date UNIQUE (user_id, snapshot_date),
    CONSTRAINT FK_CyclingFtpSnapshots_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 导入脚本改造

修改文件：

- `database/scripts/import_garmin_health.py`

新增解析：

- `heart_rates.heartRateValues` -> `HeartRateSamples(source='monitoring')`
- `sleep.sleepHeartRate` -> `HeartRateSamples(source='sleep')`
- `stress.stressValuesArray` -> `StressSamples(source='monitoring')`
- `sleep.sleepStress` -> `StressSamples(source='sleep')`
- `steps[]` -> `StepSamples`
- `intensity_minutes.imValuesArray` -> `IntensityMinuteSamples`
- `sleep.sleepLevels` -> `SleepStageSamples`
- `sleep.sleepMovement` -> `SleepMovementSamples(source='sleepMovement')`
- `sleep.sleepRestlessMoments` -> `SleepMovementSamples(source='sleepRestlessMoments')`
- `sleep.hrvData` 和 `hrv.hrvReadings` -> `HrvSamples`
- `training_status` -> `TrainingStatusSnapshots`
- `race_predictions` -> `RacePredictions`
- `lactate_threshold` -> `LactateThresholds`
- `cycling_ftp` -> `CyclingFtpSnapshots`

继续保留：

- 每日摘要写入 `DailyHealthSummaries`
- 睡眠摘要写入 `SleepSummaries`

不解析：

- hydration
- weather
- gear
- body composition
- body battery samples
- respiration samples
- SpO2 samples

## 后端接口改造

建议新增：

- `backend/src/routes/healthRoutes.js`
- `backend/src/services/healthService.js`

### 今日健康接口

扩展现有：

- `GET /api/dashboard/health`

返回补充：

```js
{
  avgHrv,
  hrvStatus,
  sleepScore,
  restingHeartRateBpm,
  avgStressLevel,
  moderateIntensityMinutes,
  vigorousIntensityMinutes,
  trainingStatus,
  vo2max,
  cyclingFtp
}
```

### 健康趋势接口

新增：

- `GET /api/health/trends?metric=hrv&range=3m`
- `GET /api/health/trends?metric=resting_heart_rate&range=3m`
- `GET /api/health/trends?metric=sleep_score&range=3m`
- `GET /api/health/trends?metric=steps&range=3m`
- `GET /api/health/trends?metric=stress&range=3m`
- `GET /api/health/trends?metric=ftp&range=1y`

### 时序接口

新增：

- `GET /api/health/samples/heart-rate?date=2026-06-29&source=monitoring`
- `GET /api/health/samples/heart-rate?date=2026-06-29&source=sleep`
- `GET /api/health/samples/stress?date=2026-06-29&source=monitoring`
- `GET /api/health/samples/stress?date=2026-06-29&source=sleep`
- `GET /api/health/samples/steps?date=2026-06-29`
- `GET /api/health/samples/intensity-minutes?date=2026-06-29`
- `GET /api/health/samples/sleep-stages?date=2026-06-29`
- `GET /api/health/samples/sleep-movement?date=2026-06-29`
- `GET /api/health/samples/hrv?date=2026-06-29`

返回格式保持简单：

```js
[
  { time: '2026-06-29 00:01:00', value: 62 }
]
```

睡眠阶段返回：

```js
[
  {
    stageStartUtc: '2026-06-28 23:20:00',
    stageEndUtc: '2026-06-29 00:18:00',
    stageType: 'light',
    durationS: 3480
  }
]
```

### 训练表现接口

新增：

- `GET /api/health/training-status/latest`
- `GET /api/health/race-predictions/latest`
- `GET /api/health/lactate-threshold/latest`
- `GET /api/health/cycling-ftp/latest`

这些接口只读最新记录即可，页面不需要复杂分页。

## 前端改造

### 今日页 `Today.vue`

新增展示：

- 今日心率曲线
- 今日压力曲线
- 今日步数时序
- 强度分钟
- 昨夜睡眠阶段图
- 昨夜睡眠心率曲线
- 昨夜睡眠压力曲线
- 昨夜 HRV 曲线
- 训练状态
- 骑行 FTP

没有数据时不显示对应图表。

### 趋势页 `Trends.vue`

新增指标：

- HRV
- 静息心率
- 睡眠评分
- 步数
- 压力
- FTP

健康指标走 `/api/health/trends`。

### 训练负荷页 `TrainingLoad.vue`

新增辅助卡片：

- Garmin 训练状态
- VO2max
- 乳酸阈值
- 比赛预测
- FTP

这些数据只作为补充，不替代现有 CTL/ATL/TSB。

### 新增健康详情页

可新增页面：

- `frontend/src/views/HealthDetail.vue`

页面内容：

- 日期选择
- 全天心率曲线
- 全天压力曲线
- 步数时序
- 睡眠阶段图
- 睡眠心率曲线
- 睡眠压力曲线
- 睡眠动作/restless
- HRV 曲线

## 前端服务文件

新增：

- `frontend/src/services/health.js`

建议函数：

```js
export function getHealthTrend(params) {}
export function getHealthSamples(type, params) {}
export function getLatestTrainingStatus() {}
export function getLatestRacePredictions() {}
export function getLatestLactateThreshold() {}
export function getLatestCyclingFtp() {}
```

继续使用现有 `apiClient` 和 `unwrapApiResponse` 风格。

## 验收检查

数据库检查：

```sql
SELECT COUNT(*) FROM HeartRateSamples;
SELECT COUNT(*) FROM StressSamples;
SELECT COUNT(*) FROM StepSamples;
SELECT COUNT(*) FROM IntensityMinuteSamples;
SELECT COUNT(*) FROM SleepStageSamples;
SELECT COUNT(*) FROM SleepMovementSamples;
SELECT COUNT(*) FROM HrvSamples;
SELECT COUNT(*) FROM TrainingStatusSnapshots;
SELECT COUNT(*) FROM RacePredictions;
SELECT COUNT(*) FROM LactateThresholds;
SELECT COUNT(*) FROM CyclingFtpSnapshots;
```

接口检查：

- `GET /api/health/samples/heart-rate?date=2026-06-29&source=monitoring`
- `GET /api/health/samples/stress?date=2026-06-29&source=monitoring`
- `GET /api/health/samples/steps?date=2026-06-29`
- `GET /api/health/samples/sleep-stages?date=2026-06-29`
- `GET /api/health/samples/hrv?date=2026-06-29`
- `GET /api/health/training-status/latest`
- `GET /api/health/race-predictions/latest`
- `GET /api/health/lactate-threshold/latest`
- `GET /api/health/cycling-ftp/latest`

前端检查：

- 今日页能看到新健康图表。
- 健康详情页切换日期后能刷新曲线。
- 训练负荷页能展示 Garmin 训练状态、阈值和预测信息。
- 没数据时不报错，不展示空白大模块。

## 注意事项

- 中国区账号调用下载脚本时需要 `--cn`。
- 新增数据量比原来大，导入 SQL 要使用批量 insert。
- 所有时序表都要按 `user_id + time` 建索引。
- 原始返回保存在 `raw_json`，方便后续补字段。
