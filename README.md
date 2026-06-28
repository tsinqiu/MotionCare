# MotionCare
MotionCare 是一个基于可穿戴设备运动数据的运动状态分析与训练建议系统。

本项目由原数据库课程大作业 `Motion_Analysis` 继续迭代而来。原项目已经完成 Garmin FIT / JSON 数据导入、MySQL 关系建模、Express 后端 API、Vue 前端展示和基础统计分析。当前仓库将其升级为软件综合设计项目，转向面向用户的运动健康软件。

项目希望解决的问题是：用户在长期运动过程中，如何看懂自己的运动状态、训练负荷和恢复情况，并获得更合理的训练建议。同时，系统也考虑账号、轨迹、健康指标等个人数据的安全保护。关于具体的UI、功能的布局可以借鉴Keep软件的设计，已上传到仓库，名为“软件综合设计.pdf”

---

## 1. 项目定位
MotionCare 面向跑步、骑行等运动场景的用户，围绕 Garmin 等可穿戴设备采集的运动数据与用户上传的身高，体重等其他数据，提供运动记录、状态分析、训练负荷、AI 教练建议和安全防护能力。

系统关注运动训练场景中的疲劳状态、负荷变化和恢复建议，用于辅助用户安排训练。

### 项目完整题目
> 基于可穿戴设备数据的运动疲劳风险预警与智能训练干预系统
>

### 产品侧名称
```latex
MotionCare
```

产品界面中尽量使用简短自然的名称，例如“今日”“运动”“状态”“教练”“我的”，避免把“风险预警”“智能干预”等报告语言直接放到用户界面上。

---

## 2. 项目来源与迭代目标
本仓库 fork 自原数据库大作业仓库，并在其基础上继续开发。

### V1：数据库课程设计基础
原项目已经完成：

+ Garmin FIT / JSON 运动数据解析与导入
+ MySQL 数据库 `MotionAnalysis` 建模
+ 活动、轨迹点、分段、心率、速度、训练负荷等数据存储
+ Node.js + Express 后端 API
+ Vue 3 + Vite 前端页面
+ 注册登录、运动记录、运动详情、统计分析、日历、最佳记录
+ Garmin 同步、社区、探索、设置、开始运动等扩展功能
+ AI 助手与训练负荷分析的初步实现

### V2：软件综合设计升级方向
当前仓库重点升级为：

+ 贴近真实 App 的产品结构，UI 及整体结构对用户友好，借鉴 Keep 的优点，远离 AI 版本的粗糙
+ 今日状态与训练建议
+ 训练负荷与恢复状态分析
+ 单次运动分析与风险提示
+ AI 教练建议
+ 用户目标管理
+ 账号安全、防暴力破解、接口权限控制和服务器安全设计
+ Web App / PWA / 移动端适配方向

---

## 3. 系统架构
已实现部分同数据库大作业，未实现部分不做束缚。

---

## 4. 技术栈
已实现部分同数据库大作业，未实现部分不做束缚。

---

## 5. 核心功能
### 5.1 今日
首页面向用户展示当天最关心的信息：

+ 今日状态
+ 最近运动
+ 本月运动概览
+ 训练负荷摘要
+ AI 智能运动简报
+ 今日训练建议

界面文案尽量采用用户能直接理解的表达，例如“今天宜轻松训练”“最近疲劳略高”“建议安排恢复日”，禁止直接堆技术术语和加一堆小字注释。

### 5.2 运动
运动记录模块用于查看用户历史运动数据：

+ 活动列表
+ 运动类型筛选
+ 日期范围筛选
+ 排序与分页
+ 单次运动详情
+ 轨迹点、心率、速度、分段和区间数据展示
+ 支持分享功能：通过保存为图片实现

### 5.3 状态
状态模块用于分析长期训练变化：

+ 训练负荷
+ 体能 CTL
+ 疲劳 ATL
+ 恢复状态 TSB
+ 心率趋势
+ 距离、时长、消耗、VO2max 等指标趋势
+ 运动日历和月度统计

技术上可以使用 CTL、ATL、TSB 等指标，但产品界面中优先展示为“体能”“疲劳”“恢复”“近期状态”。

### 5.4 教练
教练模块基于用户近期运动数据提供建议：

+ 今日是否适合训练
+ 下一次训练如何安排
+ 最近训练负荷是否偏高
+ 单次运动后的恢复建议
+ 基于规则或 ML 模型的和 AI 的简短回答

### 5.5 目标
目标模块用于形成训练闭环：

+ 每周运动次数目标
+ 每周跑量目标
+ 每月运动时长目标
+ 恢复日目标
+ 目标完成度统计

目标管理使系统不只停留在“展示历史数据”，而是能够帮助用户安排后续训练。

### 5.6 安全
安全部分面向账号、接口和服务器防护：

+ 密码 bcrypt 哈希存储
+ JWT 鉴权
+ 管理员与普通用户角色区分
+ 用户数据归属校验
+ 登录失败记录与防暴力破解
+ 安全事件日志
+ API 对象级权限控制
+ 轨迹起终点隐私保护
+ `.env`、token、原始数据和服务器密钥不提交
+ 部署时 MySQL 不暴露公网

---

## 6. 数据库说明
当前数据库名：

```latex
MotionAnalysis
```

核心数据表包括：

```latex
Users
Activities
ActivitySummaries
ActivityZones
Laps
TrackPoints
DailyHealthSummaries
SleepSummaries
RestingHeartRates
BodyWeights
DailyStressSummaries
```

其中：

+ `Users` 保存用户账号、角色和状态。
+ `Activities` 保存运动活动主记录。
+ `ActivitySummaries` 保存距离、时长、心率、训练负荷、VO2max、步频、步幅、爬升等摘要指标。
+ `TrackPoints` 保存逐点轨迹、速度、心率、步频、功率等时序数据。
+ `Laps` 保存分段数据。
+ `ActivityZones` 保存心率区间、功率区间等统计信息。
+ `DailyHealthSummaries`、`SleepSummaries`、`RestingHeartRates`、`BodyWeights` 和 `DailyStressSummaries` 保存 Garmin 日常健康数据。
+ 来源追踪、FIT 原始消息和通用指标表已精简；需要保留的原始数据写入各业务表的 `raw_json`。

后续计划新增或强化：

```latex
RiskAssessments        运动状态与风险评估结果
UserGoals              用户训练目标
TrainingInterventions  训练建议与干预记录
LoginAttempts          登录失败记录
SecurityEvents         安全事件日志
```

---

## 7. API 说明
已有部分如下，未实现的不做束缚。

后端基础地址：

```latex
http://localhost:8080/api
```

主要接口包括：

```latex
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me

GET  /api/activities
GET  /api/activities/:id
GET  /api/activities/:id/track-points
GET  /api/activities/:id/heart-rate
GET  /api/activities/:id/speed
GET  /api/activities/:id/laps
GET  /api/activities/:id/zones

GET  /api/stats/summary
GET  /api/stats/activity-types
GET  /api/stats/timeline
GET  /api/stats/metric-trend
GET  /api/stats/calendar
GET  /api/stats/heart-rate-zones
GET  /api/stats/personal-bests

GET  /api/training/load-balance
GET  /api/dashboard/overview

GET  /api/ai/health
POST /api/ai/chat
GET  /api/ai/daily-brief
POST /api/ai/activity-analysis

POST /api/ml/running-prediction
```

后续建议新增：

```latex
GET  /api/risk/today
GET  /api/risk/trend
POST /api/risk/activities/:id/evaluate
GET  /api/risk/activities/:id

GET  /api/goals
POST /api/goals
PUT  /api/goals/:id
DELETE /api/goals/:id

GET  /api/security/overview
GET  /api/security/events
```

---





## 9. 本地运行
### 9.1 后端
```powershell
cd backend
npm install
Copy-Item .env.example .env
npm run seed:admin
npm run dev
```

默认地址：

```latex
http://127.0.0.1:8080
```

需要先在 `.env` 中配置 MySQL 用户名、密码、数据库名、JWT_SECRET 等信息。

### 9.2 前端
```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

默认地址：

```latex
http://localhost:5173
```

前端环境变量示例：

```latex
VITE_API_BASE_URL=http://localhost:8080/api
VITE_USE_MOCK=false
```

如果后端暂时不可用，可设置：

```latex
VITE_USE_MOCK=true
```

### 9.3 数据库
不做束缚

---

## 10. 部署方式
同前

---

## 11. 安全设计
由于本系统处理用户账号、运动轨迹、心率、训练负荷和同步凭证等敏感信息，因此安全设计是软件综合设计的重要部分。

### 11.1 密码安全
+ 用户密码不明文保存。
+ 使用 bcrypt 进行慢哈希存储。
+ 后续可增加 `PASSWORD_PEPPER`，将额外密钥保存在服务器环境变量中，降低数据库泄露后的离线破解风险。

### 11.2 登录防护
+ 登录失败统一返回“邮箱或密码错误”，避免账号枚举。
+ 记录登录成功、失败和被限制的事件。
+ 对同一邮箱、同一 IP 的连续失败登录进行限流。
+ 防止暴力破解和撞库攻击。

### 11.3 API 权限控制
+ 普通用户只能访问自己的运动记录和分析结果。
+ 管理员接口单独控制。
+ 所有涉及 `activity_id` 的接口都需要在服务端进行对象级权限校验。
+ 前端隐藏按钮不能代替后端鉴权。

### 11.4 数据与服务器安全
+ 前端不保存 Garmin 密码、AI API Key、数据库账号等敏感信息。
+ Garmin 密码不入库。
+ Garmin token 存放在服务器本地安全目录。
+ MySQL 不暴露公网。
+ 生产环境通过 Nginx 转发 API。
+ 真实轨迹原始文件、数据库导出文件和服务器密钥不提交 GitHub。

### 11.5 轨迹隐私
运动轨迹可能暴露用户住址、学校、宿舍和常用路线，因此系统应默认保护地图隐私：

+ 默认隐藏起终点附近轨迹。
+ 分享或公开展示时不显示精确位置。
+ 可在设置中调整轨迹隐私级别。

---

## 12. 软件综合设计重点
| 方面 | 内容 |
| --- | --- |
| 需求分析 | 运动用户希望了解状态、负荷、恢复和训练建议 |
| 数据来源 | Garmin 可穿戴设备真实运动数据 |
| 前端设计 | 类 App 页面结构，强调用户体验 |
| 后端设计 | API、鉴权、权限控制、业务逻辑 |
| 数据库设计 | 活动、轨迹、摘要、用户、安全日志等数据表 |
| 分析算法 | 训练负荷、状态趋势、风险提示 |
| AI 辅助 | 基于运动摘要生成自然语言建议 |
| 安全防护 | 密码哈希、登录限流、权限校验、服务器安全 |
| 部署方案 | Web App / PWA / 服务端部署 |


---

## 13. 开发路线
### 已完成
+ Garmin 数据导入与解析
+ MySQL 核心表结构
+ Express API 服务
+ Vue 前端页面
+ 注册登录与 JWT 鉴权
+ 运动记录与运动详情
+ 统计分析、日历、最佳记录
+ 训练负荷 CTL / ATL / TSB 分析
+ AI 助手和每日简报
+ 同步中心、社区、探索、设置等扩展页面

### 软件综合设计阶段计划
- [ ] 调整产品命名和页面文案
- [ ] 移动端优先的页面布局优化
- [ ] 新增用户目标管理
- [ ] 强化训练负荷与状态页面
- [ ] 新增单次运动状态分析卡片
- [ ] 新增风险评估结果表
- [ ] 新增训练建议记录表
- [ ] 新增登录失败限制
- [ ] 新增安全事件日志
- [ ] 强化普通用户和管理员的数据权限隔离
- [ ] 增加 PWA 支持
- [ ] 整理软件综合设计报告和答辩素材

---

## 14. 隐私与提交边界
禁止提交：

```latex
.env
node_modules/
dist/
database/data/
database/.garmin_tokens/
database/sql/02_import_data.sql
backend/ml/models/
*.fit
*.json 原始数据
*.dump
*.sql.gz
真实数据库密码
真实服务器密钥
Garmin token
AI API Key
个人精确轨迹原始文件
```

仓库中只保留：

+ 数据库结构脚本
+ 数据导入脚本
+ 示例配置
+ 前后端源码
+ 文档和报告素材
+ 不含隐私的截图或示意图

---

## 15. 说明
MotionCare 是一个课程软件综合设计项目，重点在于完整的软件系统设计与实现。项目以真实可穿戴设备运动数据为基础，结合前端交互、后端 API、数据库设计、训练状态分析、AI 建议和安全防护，探索运动健康类软件的完整实现路径。

<font style="color:rgb(51, 51, 51);">实现相关功能时，如果 GitHub / npm 上有成熟的开源方案，直接复用，不要自己实现。</font>
