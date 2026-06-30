# MotionCare

多人协作入口。详细规划不放这里，只保留能把项目跑起来的必要信息。

## 目录

```text
backend/   Express API
frontend/  Vue 3 + Vite
database/  MySQL schema、Garmin 脚本、共享数据包
docs/      少量专项说明
```

## 不要提交

```text
backend/.env
frontend/.env
database/data/
database/.garmin_tokens/
backend/uploads/
backend/ml/models/
*.log
*.err
```

共享 Garmin 数据只提交：

```text
database/shared/garmin_seed.sql.gz
database/shared/uploads.zip
```

## 本地配置

复制后端配置：

```powershell
Copy-Item backend\.env.example backend\.env
```

主要填这些：

```text
DB_NAME=MotionAnalysis
DB_USER=root
DB_PASSWORD=你的 MySQL 密码

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=你的本地管理员密码

GARMIN_EMAIL=你的 Garmin 邮箱
GARMIN_PASSWORD=你的 Garmin 密码
GARMIN_NON_INTERACTIVE=0
```

`ADMIN_EMAIL/ADMIN_PASSWORD` 是登录 MotionCare 前端的账号。  
`GARMIN_EMAIL/GARMIN_PASSWORD` 只用于爬 Garmin 数据，普通协作者通常不用。

## 初始化数据库

普通协作者不要反复爬 Garmin，直接导入共享数据包：

```powershell
.\database\scripts\import_shared_seed.ps1
```

这个脚本会重建本地 `MotionAnalysis` 并导入共享数据。
如果存在 `database/shared/uploads.zip`，也会自动解压图片到 `backend/uploads/`。

导入后演示账号：

```text
demo@example.com / 123456
```

## 启动服务

安装依赖：

```powershell
cd backend
npm install

cd ..\frontend
npm install
```

一键启动（后端 + 前端）：

```powershell
.\start-services.ps1
```

或分别启动：

```powershell
# 后端
cd backend
npm start

# 前端（新开终端）
cd frontend
npm run dev -- --host 0.0.0.0
```

地址：

```text
后端: http://127.0.0.1:8080/api
前端: http://localhost:5173/
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/health
```

## 常用命令

前端构建：

```powershell
cd frontend
npm run build
```

后端测试：

```powershell
cd backend
npm test
```

## 文档

```text
database/README.md                    数据库和共享 seed
docs/garmin-local-db-collaboration.md 只给负责更新 Garmin 数据的人看
backend/docs/api.md                   API 简表
```
