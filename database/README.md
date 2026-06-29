# Database

默认数据库名：

```text
MotionAnalysis
```

## 普通协作者

直接导入共享 Garmin 数据包，不要每个人都爬 Garmin：

```powershell
.\database\scripts\import_shared_seed.ps1
```

导入内容来自：

```text
database/shared/garmin_seed.sql.gz
database/shared/uploads.zip
```

导入后登录：

```text
demo@example.com / 123456
```

注意：这个脚本会重建本地 `MotionAnalysis`。

## 更新共享数据包

只由负责维护数据的人执行：

```powershell
.\database\scripts\export_shared_seed.ps1
```

导出的文件仍然是：

```text
database/shared/garmin_seed.sql.gz
database/shared/uploads.zip
```

## 重要脚本

```text
database/scripts/import_shared_seed.ps1       导入共享 seed
database/scripts/export_shared_seed.ps1       导出共享 seed
database/scripts/download_garmin_connect.py   爬 Garmin
database/scripts/import_fit_files.py          FIT/活动 JSON 转 SQL
database/scripts/import_garmin_health.py      健康 JSON 转 SQL
```

## 重要 SQL

```text
database/sql/01_schema.sql              基础表
database/sql/15_garmin_timeseries.sql   Garmin 时序表
```
