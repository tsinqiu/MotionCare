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
后端: http://127.0.0.1:8080/api
前端: http://localhost:5173/
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/health
```

本地前端开发环境默认请求 `http://localhost:8080/api`。如果改动
`backend/.env` 里的 `PORT`，需要同步调整前端 API 配置或显式提供
`VITE_API_BASE_URL`。生产环境前端默认走同源 `/api`，由 Nginx 反向代理到后端。

## Garmin 同步依赖

Garmin 同步登录和下载由 `database/scripts/download_garmin_connect.py` 执行。
首次在服务器或本地启用数据同步前，需要安装 Python 依赖：

```powershell
python -m pip install -r database\requirements.txt
```

Linux 服务器上可使用：

```bash
python3 -m pip install -r /var/www/motion-analysis/database/requirements.txt
```

如果同步页出现 `No module named 'garminconnect'`，说明当前运行脚本的 Python
环境没有安装 `database/requirements.txt` 中的依赖。安装完成后重新点击“重试”
或重新绑定 Garmin 账号即可触发新的登录流程。

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

## 前端演示入口

底部主导航当前是：

```text
今日 / 运动 / 记录 / 探索 / 运动圈
```

- `今日`：日期切换、天气卡片、快捷入口、今日运动、训练指数和本周负荷。
- `运动`：运动记录列表，支持类型筛选，卡片展示距离、时长、配速、卡路里、训练负荷和天气。
- `记录`：移动端运动仪表盘，支持运动类型切换、距离/时长目标、跑鞋绑定和实时记录。
- `探索`：十二个快捷入口，包含运动日历、健康度、趋势、身体数据、训练计划、常用课程、状态总览、AI 教练、最佳榜单、运动路线、热门赛事和数据同步。
- `运动圈`：社区信息流，首页保留简短发布入口，进入发布页后可填写动态、关联运动记录、上传图片、点赞、评论和分享。

右上角用户图标进入个人中心 `/me`，底部不再单独放“我的”。

## 运动详情页

`/activities/:id` 使用五个页签：

```text
概览 / 图表 / 分段 / 详情 / 分析
```

- `概览`：路线预览、活动标题、核心指标、AI 教练入口、海报和分享到运动圈。
- `图表`：按数据可用性显示配速、心率、心率区间、步频、步幅、垂直振幅、海拔、功率曲线。
- `分段`：默认按 1 公里聚合，可切换 5 公里聚合；无分段时回退为全程一行。
- `详情`：常规、心率、配速、跑步动态、天气和跑鞋等辅助信息。
- `分析`：训练分析、自评量化表和活动照片。

从活动详情点击“分享”会创建一条关联该活动的运动圈动态。运动圈优先展示活动图片；没有图片时展示路线地图和少量运动指标。
海报功能会使用活动路线地图作为卡片背景，并叠加距离、时间、配速等核心信息。

## 待补足

当前前端仍有一部分能力以静态入口、本地保存或占位流程为主，后续需要继续补齐：

- `运动圈`：好友、附近、关注功能的真实关系链、筛选逻辑和后端同步。
- `探索`：大部分功能仍需补完整业务闭环，包括身体数据、训练计划、常用课程、状态总览、AI 教练、最佳榜单、运动路线、热门赛事和数据同步等。

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
