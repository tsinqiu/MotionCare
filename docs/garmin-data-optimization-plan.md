# Garmin 数据补充说明

本文档说明 MotionCare 后续准备补充的 Garmin 数据范围，供接手的 AI 或开发者使用。

## 当前结论

已经通过本地同步和 `garminconnect` 方法探测确认，以下数据可以作为后续补充目标：

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

后续不要接入：

- Garmin 饮水 hydration
- Garmin 天气 weather
- Garmin 装备 gear
- Garmin 体脂率
- Garmin 肌肉量
- Garmin 体脂秤身体成分数据
- Body Battery 时序
- 呼吸时序
- 血氧时序

天气继续使用项目现有外部接口。跑鞋和装备继续使用项目自己的 `Shoes` 模块。体重只做用户手动填写。

## 已有基础数据

项目当前已经有：

- 运动记录：`Activities`
- 运动摘要：`ActivitySummaries`
- 心率/功率区间：`ActivityZones`
- lap：`Laps`
- 轨迹点：`TrackPoints`
- 每日健康摘要：`DailyHealthSummaries`
- 睡眠摘要：`SleepSummaries`

这些数据不需要重复建表：

- 每日步数汇总
- 每日距离
- 热量和活跃热量
- 楼层
- 中高强度分钟汇总
- 静息心率
- 睡眠总时长
- 深睡、浅睡、REM、清醒总时长
- 睡眠评分
- 睡眠平均心率
- 睡眠平均压力
- 睡眠平均呼吸
- 心率区间时长
- 功率区间时长
- 平均功率、最大功率、标准化功率

后续主要补“时序明细”和“训练表现类指标”。

## 准备补充的数据

### 1. 全天心率时序

来源方法：

```text
get_heart_rates(date)
```

已确认返回字段：

```text
heartRateValues
heartRateValueDescriptors
```

用途：

- 今日心率曲线
- 运动外心率波动分析
- 疲劳和恢复辅助判断

建议落库：

- `HeartRateSamples`

### 2. 全天压力时序

来源方法：

```text
get_stress_data(date)
get_all_day_stress(date)
```

已确认返回字段：

```text
stressValuesArray
stressValueDescriptorsDTOList
```

用途：

- 今日压力曲线
- 高压力时段识别
- 睡眠和训练恢复辅助分析

建议落库：

- `StressSamples`

### 3. 全天步数时序

来源方法：

```text
get_steps_data(date)
```

已确认返回字段：

```text
startGMT
endGMT
steps
primaryActivityLevel
activityLevelConstant
```

用途：

- 今日步数分布
- 活跃时段分析
- 久坐/活动节律判断

建议落库：

- `StepSamples`

### 4. 强度分钟

来源方法：

```text
get_intensity_minutes_data(date)
```

已确认返回字段：

```text
moderateMinutes
vigorousMinutes
imValuesArray
weeklyModerate
weeklyVigorous
weeklyTotal
weekGoal
```

用途：

- 今日/本周运动强度统计
- 中等强度和高强度活动分析
- 与训练负荷做对照

建议落库：

- 汇总继续写入 `DailyHealthSummaries`
- 如果需要时序，再新增 `IntensityMinuteSamples`

### 5. 睡眠阶段时序

来源方法：

```text
get_sleep_data(date)
```

已确认返回字段：

```text
sleepLevels
```

每段通常包含：

```text
startGMT
endGMT
activityLevel
```

用途：

- 睡眠阶段图
- 深睡/浅睡/REM/清醒时间线
- 睡眠质量分析

建议落库：

- `SleepStageSamples`

### 6. 睡眠心率时序

来源方法：

```text
get_sleep_data(date)
```

已确认返回字段：

```text
sleepHeartRate
```

用途：

- 夜间心率曲线
- 睡眠恢复分析
- 与 HRV、睡眠压力对照

建议落库：

- 可以写入 `HeartRateSamples`
- 用 `source = 'sleep'` 区分全天心率

### 7. 睡眠压力时序

来源方法：

```text
get_sleep_data(date)
```

已确认返回字段：

```text
sleepStress
```

用途：

- 夜间压力曲线
- 睡眠恢复质量分析

建议落库：

- 可以写入 `StressSamples`
- 用 `source = 'sleep'` 区分全天压力

### 8. 睡眠动作 / restless

来源方法：

```text
get_sleep_data(date)
```

已确认返回字段：

```text
sleepMovement
sleepRestlessMoments
restlessMomentsCount
```

用途：

- 夜间翻动/不安稳分析
- 睡眠连续性分析
- 与睡眠阶段图叠加展示

建议落库：

- `SleepMovementSamples`

### 9. HRV 采样点

来源方法：

```text
get_sleep_data(date)
get_hrv_data(date)
```

已确认返回字段：

```text
sleep.hrvData
hrvReadings
avgOvernightHrv
hrvStatus
```

用途：

- 夜间 HRV 曲线
- 恢复状态分析
- AI 训练建议

建议落库：

- `SleepSummaries.avg_hrv`
- `SleepSummaries.hrv_status`
- `HrvSamples`

### 10. 训练状态

来源方法：

```text
get_training_status(date)
```

已确认返回字段：

```text
mostRecentVO2Max
mostRecentTrainingLoadBalance
mostRecentTrainingStatus
heatAltitudeAcclimationDTO
```

用途：

- Garmin 官方训练状态展示
- 与项目自己的 CTL/ATL/TSB 对照
- 训练建议生成

建议落库：

- `TrainingStatusSnapshots`

### 11. 比赛预测

来源方法：

```text
get_race_predictions()
```

已确认返回字段：

```text
time5K
time10K
timeHalfMarathon
timeMarathon
calendarDate
```

用途：

- 跑步能力展示
- 训练成果趋势
- 目标管理

建议落库：

- `RacePredictions`

### 12. 乳酸阈值

来源方法：

```text
get_lactate_threshold()
```

已确认返回字段：

```text
speed_and_heart_rate
power
```

用途：

- 阈值心率
- 阈值配速
- 阈值功率
- 训练区间辅助分析

建议落库：

- `LactateThresholds`

### 13. 骑行 FTP

来源方法：

```text
get_cycling_ftp()
```

已确认返回字段：

```text
functionalThresholdPower
calendarDate
sport
biometricSourceType
```

用途：

- 骑行能力展示
- 功率训练区间
- 与骑行活动功率数据对照

建议落库：

- `CyclingFtpSnapshots`

## 建议数据表

### `HeartRateSamples`

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

### `StressSamples`

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

### `StepSamples`

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

### `IntensityMinuteSamples`

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

### `SleepStageSamples`

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

### `SleepMovementSamples`

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

### `HrvSamples`

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

### `TrainingStatusSnapshots`

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

### `RacePredictions`

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

### `LactateThresholds`

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

### `CyclingFtpSnapshots`

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

## 接手说明

继续复用现有脚本和同步框架：

- `database/scripts/download_garmin_connect.py`
- `database/scripts/import_garmin_health.py`
- `database/scripts/import_fit_files.py`
- `backend/src/services/syncService.js`

注意中国区账号登录需要 `is_cn=True`，项目已有 `--cn` 参数，后续探测或脚本调用时要保持一致。

新增数据时只结构化页面和分析真正要用的字段，其余放在 `raw_json`。
