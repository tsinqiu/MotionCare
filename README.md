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
name@motioncare.com / 123456
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
后端: http://127.0.0.1:8089/api
前端: http://localhost:5173/
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8089/api/health
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

## ML 本地模型

ML 训练脚本在 `backend/ml/`，当前包含三类输出：

- `running-v1`：单次跑步训练负荷等级、疲劳风险预测。
- `coach-v1`：训练指数/恢复建议模型，缺少本地模型产物时自动回退到规则。
- `performance-v1`：跑力、五力、训练指数画像服务，不需要 `.joblib`，可读取 FitRec 聚合参考报告做校准。

首次训练先安装 Python 依赖：

```powershell
cd backend
python -m pip install -r ml\requirements.txt
```

生成本地模型产物：

```powershell
python ml\train_running_model.py
python ml\train_coach_model.py
```

模型产物会写到 `backend/ml/models/`，不要提交 `.joblib` 或本地模型元数据。演示环境需要模型时，在本机重新运行训练脚本即可。

如果本机有 FitRec/Endomondo HR 原始文件，可以生成小型聚合参考报告：

```powershell
python ml\analyze_fitrec_reference.py --input ..\database\data\FitRec\endomondoHR.json.gz
```

只提交 `backend/ml/reference/fitrec_reference_report.json` 这类聚合报告；不要提交 `database/data/` 下的原始数据。

ML 相关接口见：

```text
GET  /api/ml/health
POST /api/ml/running-prediction
GET  /api/ml/performance-profile
```

## 文档

```text
database/README.md                    数据库和共享 seed
docs/garmin-local-db-collaboration.md 只给负责更新 Garmin 数据的人看
backend/docs/api.md                   API 简表
```
