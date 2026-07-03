# Garmin 数据协作

普通协作者不要跑 Garmin 爬取，直接导入共享 seed：

```powershell
.\database\scripts\import_shared_seed.ps1
```

这个文档只给负责更新 Garmin 数据包的人看。

## Garmin 登录配置

在本机 `backend/.env` 填：

```text
GARMIN_EMAIL=你的 Garmin 邮箱
GARMIN_PASSWORD=你的 Garmin 密码
GARMIN_NON_INTERACTIVE=0
```

中国区账号运行脚本时加 `--cn`。

## 验证登录

```powershell
python database\scripts\download_garmin_connect.py `
  --login-only `
  --cn `
  --token-dir database\.garmin_tokens\users\1\garmin
```

token 会存在：

```text
database/.garmin_tokens/users/
```

不要提交 token。

## 爬取健康数据

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

转 SQL 并导入：

```powershell
python database\scripts\import_garmin_health.py `
  --health-dir database\data\garmin_sync\user-1\backfill-20260401\health `
  --user-id 1 `
  --out database\data\garmin_sync\user-1\backfill-20260401\health_import.sql

Get-Content database\data\garmin_sync\user-1\backfill-20260401\health_import.sql | mysql -uroot -p MotionAnalysis
```

## 爬取活动数据

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

转 SQL 并导入：

```powershell
python database\scripts\import_fit_files.py `
  --fit-dir database\data\garmin_sync\user-1\job-manual-20260608\fit `
  --json-dir database\data\garmin_sync\user-1\job-manual-20260608\json `
  --out database\data\garmin_sync\user-1\job-manual-20260608\activity_import.sql

Get-Content database\data\garmin_sync\user-1\job-manual-20260608\activity_import.sql | mysql -uroot -p MotionAnalysis
```

## 更新共享 seed

本地库确认没问题后：

```powershell
.\database\scripts\export_shared_seed.ps1
```

只提交：

```text
database/shared/garmin_seed.sql.gz
database/shared/uploads.zip
```

不要提交：

```text
database/data/
database/.garmin_tokens/
Garmin 原始 JSON/FIT
```
