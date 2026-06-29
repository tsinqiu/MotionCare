# Garmin 本地数据协作说明

这份文档给协作开发的人看。项目代码可以共享，但 Garmin 原始数据、登录 token、MySQL 数据库都是本地的，不会跟着 git 走。

## 本地数据放在哪里

项目根目录：

```powershell
cd C:\school\course\3.2\MotionCare\MotionCare
```

主要目录：

```text
database/data/                       # Garmin 下载出来的 JSON / FIT / 临时 SQL，本地文件，不提交
database/.garmin_tokens/             # Garmin 登录 token，本地文件，不提交
database/sql/                        # 建表和迁移 SQL，可提交
database/scripts/                    # 下载和导入脚本，可提交
backend/.env                         # 本地数据库和脚本路径配置，不提交
```

数据库名默认是：

```text
MotionAnalysis
```

账号密码看本机 `backend/.env`，不要写进文档或提交到仓库。

## 相关脚本

Garmin 下载脚本：

```text
database/scripts/download_garmin_connect.py
```

作用：

- 下载 Garmin 活动 JSON
- 下载 Garmin 活动 FIT
- 下载 Garmin 每日健康 JSON
- 中国区账号需要加 `--cn`
- token 默认缓存到 `database/.garmin_tokens/`

FIT / 活动导入脚本：

```text
database/scripts/import_fit_files.py
```

作用：

- 读取 Garmin FIT 和活动 JSON
- 生成可导入 MySQL 的 SQL
- 主要写入 `Activities`、`ActivitySummaries`、`TrackPoints`、`Laps`、`ActivityZones`

健康数据导入脚本：

```text
database/scripts/import_garmin_health.py
```

作用：

- 读取每日健康 JSON
- 生成可导入 MySQL 的 SQL
- 主要写入每日健康、睡眠、全天采样、训练状态等表

本地一键导入基础 SQL 的 PowerShell 脚本：

```text
database/scripts/import_to_mysql.ps1
```

作用：

- 初始化或导入项目已有 SQL
- 适合新电脑第一次搭本地库时使用

## 需要先建的表

新库从头搭时，先导入基础 schema 和已有数据 SQL。更具体的初始化流程见：

```text
database/README.md
```

这次 Garmin 全天采样和训练指标相关的新表在：

```text
database/sql/15_garmin_timeseries.sql
```

已有数据库只需要执行一次：

```powershell
Get-Content database\sql\15_garmin_timeseries.sql | mysql -uroot -p MotionAnalysis
```

如果本机 MySQL 命令不在 PATH，就把 `mysql` 换成本机 mysql.exe 的完整路径。

## Python 依赖

第一次运行 Garmin 脚本前安装依赖：

```powershell
python -m pip install -r database\requirements.txt
```

## Garmin 登录

中国区账号先验证登录：

```powershell
python database\scripts\download_garmin_connect.py `
  --login-only `
  --cn `
  --token-dir database\.garmin_tokens\users\1\garmin
```

第一次会要求 Garmin 邮箱、密码，可能还会要求验证码。登录成功后 token 会缓存在本地。

如果之后提示 token 过期，重新跑上面的 `--login-only` 或任意下载命令即可。

## 只同步健康数据

示例：回填 2026-04-01 到 2026-06-29 的健康数据。

```powershell
python database\scripts\download_garmin_connect.py `
  --health-only `
  --include-health `
  --start-date 2026-04-01 `
  --end-date 2026-06-29 `
  --out-dir database\data\garmin_sync\user-1\backfill-20260401 `
  --token-dir database\.garmin_tokens\users\1\garmin `
  --cn `
  --sleep 1 `
  --retries 1
```

下载完成后，把健康 JSON 转成 SQL：

```powershell
python database\scripts\import_garmin_health.py `
  --health-dir database\data\garmin_sync\user-1\backfill-20260401\health `
  --user-id 1 `
  --out database\data\garmin_sync\user-1\backfill-20260401\health_import.sql
```

导入 MySQL：

```powershell
Get-Content database\data\garmin_sync\user-1\backfill-20260401\health_import.sql | mysql -uroot -p MotionAnalysis
```

如果要覆盖已经下载过的同名健康 JSON，再给下载命令加 `--force`。平时不要随手加，避免把可用的本地文件覆盖掉。

## 同步活动数据

示例：下载 2026-06-01 到 2026-06-08 的活动数据。

```powershell
python database\scripts\download_garmin_connect.py `
  --start-date 2026-06-01 `
  --end-date 2026-06-08 `
  --out-dir database\data\garmin_sync\user-1\job-manual-20260608 `
  --token-dir database\.garmin_tokens\users\1\garmin `
  --cn `
  --sleep 1 `
  --retries 1
```

把 FIT / 活动 JSON 转成 SQL：

```powershell
python database\scripts\import_fit_files.py `
  --fit-dir database\data\garmin_sync\user-1\job-manual-20260608\fit `
  --json-dir database\data\garmin_sync\user-1\job-manual-20260608\json `
  --out database\data\garmin_sync\user-1\job-manual-20260608\activity_import.sql
```

导入 MySQL：

```powershell
Get-Content database\data\garmin_sync\user-1\job-manual-20260608\activity_import.sql | mysql -uroot -p MotionAnalysis
```

## 当前会处理的 Garmin 健康数据

健康导入脚本会尽量处理这些数据，Garmin 返回了才会入库：

- 全天心率时序：`HeartRateSamples`，`source = monitoring`
- 全天压力时序：`StressSamples`，`source = monitoring`
- 全天步数分段：`StepSamples`
- 强度分钟采样：`IntensityMinuteSamples`
- 睡眠阶段时序：`SleepStageSamples`
- 睡眠心率时序：`HeartRateSamples`，`source = sleep`
- 睡眠压力时序：`StressSamples`，`source = sleep`
- 睡眠动作 / restless：`SleepMovementSamples`
- HRV 采样点：`HrvSamples`
- 训练状态：`TrainingStatusSnapshots`
- 比赛预测：`RacePredictions`
- 乳酸阈值：`LactateThresholds`
- 骑行 FTP：`CyclingFtpSnapshots`

下面这些目前不要接入：

- 体脂率
- 肌肉量
- Garmin 饮水
- Garmin 天气
- Garmin 装备
- Body Battery 时序
- 呼吸时序
- 血氧时序

原因很简单：没有采样设备的数据不强求；天气继续用项目已有外部接口；装备继续用项目自己的鞋子模块。

## 没有数据时怎么处理

Garmin 某些接口会返回空值、缺字段，或者只有最近几天有数据。这是正常情况。

协作开发时按这个规则来：

- 数据库表为空就展示空状态，不要造假数据
- API 返回 `null` 或空数组时，前端不要报错
- `IntensityMinuteSamples`、`CyclingFtpSnapshots` 这类表为空也正常
- 不确定某天有没有数据，先看 `database/data/garmin_sync/.../health/YYYY-MM-DD.json`

## 快速检查数据

查看核心表数量：

```powershell
mysql -uroot -p MotionAnalysis --table --execute="
SELECT 'Activities' table_name, COUNT(*) rows_count FROM Activities
UNION ALL SELECT 'DailyHealthSummaries', COUNT(*) FROM DailyHealthSummaries
UNION ALL SELECT 'SleepSummaries', COUNT(*) FROM SleepSummaries
UNION ALL SELECT 'HeartRateSamples', COUNT(*) FROM HeartRateSamples
UNION ALL SELECT 'StressSamples', COUNT(*) FROM StressSamples
UNION ALL SELECT 'StepSamples', COUNT(*) FROM StepSamples
UNION ALL SELECT 'SleepStageSamples', COUNT(*) FROM SleepStageSamples
UNION ALL SELECT 'SleepMovementSamples', COUNT(*) FROM SleepMovementSamples
UNION ALL SELECT 'HrvSamples', COUNT(*) FROM HrvSamples
UNION ALL SELECT 'TrainingStatusSnapshots', COUNT(*) FROM TrainingStatusSnapshots
UNION ALL SELECT 'RacePredictions', COUNT(*) FROM RacePredictions
UNION ALL SELECT 'LactateThresholds', COUNT(*) FROM LactateThresholds
UNION ALL SELECT 'CyclingFtpSnapshots', COUNT(*) FROM CyclingFtpSnapshots;
"
```

查看某天有没有全天采样：

```powershell
mysql -uroot -p MotionAnalysis --table --execute="
SELECT DATE(sample_time_utc) utc_date, source, COUNT(*) count
FROM HeartRateSamples
GROUP BY DATE(sample_time_utc), source
ORDER BY utc_date DESC, source;
"
```

注意：数据库里采样时间存 UTC，前端和接口按中国时区展示自然日，所以 SQL 里看到跨一天是正常的。

## 后端同步入口

后端本身不写死脚本路径，路径在 `backend/.env` 里配置：

```text
GARMIN_DOWNLOAD_SCRIPT=../database/scripts/download_garmin_connect.py
GARMIN_IMPORT_SCRIPT=../database/scripts/import_fit_files.py
GARMIN_HEALTH_IMPORT_SCRIPT=../database/scripts/import_garmin_health.py
GARMIN_TOKEN_BASE_DIR=../database/.garmin_tokens/users
GARMIN_SYNC_WORK_DIR=../database/data/garmin_sync
```

前端点同步时，后端会调用这些脚本。协作者如果本地没有数据库、没有 token、没有 Garmin 文件，同步功能就只能跑到登录或空数据状态，这是正常的。

## 不要提交的东西

确认这些文件不要进 git：

```text
backend/.env
database/data/
database/.garmin_tokens/
*.log
*.err
```

协作时只提交脚本、SQL、前后端代码和文档。数据由每个人在自己的本地库里跑。
