# MotionCare ML + RAG 模型变更记录

本文记录 MotionCare AI 教练相关模型与 RAG 链路的主要实现变更，便于后续维护、论文描述和演示说明。

## 当前架构定位

系统采用的是“结构化数据检索 + 本地传统机器学习 + DeepSeek 总结”的混合架构。

- MySQL 保存 Garmin 运动、训练负荷、睡眠、HRV、压力、Body Battery、天气和用户反馈数据。
- 后端通过 SQL 检索近期结构化数据，生成隐藏上下文。
- 本地 ML 模型输出恢复状态、负荷动作、天气风险、建议类型等结构化判断。
- DeepSeek 负责把结构化判断和 RAG 摘要转成自然语言建议。
- 规则引擎始终保留为安全兜底，不允许 ML 或 LLM 推翻高风险红线。

严格来说，当前 RAG 主要是基于时间窗口和 SQL 聚合的结构化 RAG，不是向量数据库式 RAG。这样更适合当前的运动健康时序数据。

## 本地 ML 模型

模型文件和训练入口：

```text
backend/ml/train_coach_model.py
backend/ml/predict_coach.py
backend/ml/feature_schema.json
backend/ml/models/coach_model.joblib
backend/ml/models/coach_model_metadata.json
backend/ml/models/coach_training_report.json
```

模型职责：

- 输出 `readinessScore`、`readinessLevel`、`recoveryRisk`。
- 输出 `riskLevel`、`loadAction`、`trainingModifier`、`weatherRisk`。
- 输出 `primaryRecommendation` 和 `recommendationTypes`。
- 输出 `topFactors`、`confidence`、`modelVersion`、`dataCompleteness`。

训练标签来源已经从单纯规则伪标签升级为弱监督组合：

- 用户真实反馈优先，例如晨间状态、建议反馈、训练后 RPE。
- 次日恢复变化作为延迟客观标签。
- 规则伪标签作为冷启动兜底。
- 训练样本权重：用户反馈高于延迟标签，延迟标签高于规则伪标签。

因此当前 ML 仍有规则冷启动成分，但已经预留并接入了真实标签闭环。

## RAG v2 改进

本轮 v2 改动重点是稳定性、个性化和可扩展检索。

### DeepSeek JSON Mode

`daily-brief` 的 DeepSeek 请求已增加：

```json
{
  "response_format": { "type": "json_object" }
}
```

作用：

- 减少模型输出 Markdown、解释文本导致 JSON 解析失败的情况。
- 保留后端 JSON 解析兜底。
- 返回内容仍经过后端字段白名单合并，DeepSeek 不能覆盖内部 ML 原始特征。

### 反馈偏好记忆

`getRagContext` 新增最近 `AiCoachFeedback` 摘要读取，默认读取最近 5 条反馈。

统计字段包括：

- `helpful`
- `too_conservative`
- `too_aggressive`
- `not_matching_body`

反馈偏好会进入隐藏 system prompt，让 DeepSeek 调整表达方式。例如用户近期多次反馈“太保守”，在风险不高时可以给出更积极的可选训练方案。

安全限制：

- 当 `riskLevel` 为 `orange` 或 `red` 时，不能因为用户嫌保守而建议高强度。
- 当 `weatherRisk` 为 `high` 时，必须提醒降强度、补水和避开高温时段。
- 用户反馈只影响表达风格和安全范围内的方案倾向，不覆盖规则红线。

### 受控上下文策略

聊天接口新增轻量意图分类，决定本次 RAG 使用的上下文策略：

```text
today_readiness      今日训练适配
load_recovery        负荷恢复分析
long_range_summary   长周期总结
balanced_recent      默认近期上下文
```

当前仍然由后端受控选择 SQL 检索和摘要方式，不让 DeepSeek 直接访问数据库，也暂不启用自由 Tool Calling。

## Hidden Prompt 结构

DeepSeek 的 system prompt 中新增稳定 JSON 段，包含：

```text
contextStrategy
mlDecision
rulesBaseline
learnedSignals
labelSourceSummary
feedbackPreference
```

这些内容只在后端注入给 DeepSeek，前端和 API 响应不会返回完整 system prompt、完整隐藏摘要、完整特征向量或数据库字段名。

用户消息仍保持为原始问题，避免把隐藏上下文拼到 user message 中。

## API 响应扩展

保持现有接口兼容：

```text
GET  /api/ai/health
GET  /api/ai/daily-brief
POST /api/ai/chat
POST /api/ai/activity-analysis
POST /api/ai/feedback
POST /api/ai/morning-readiness
```

AI meta 新增字段：

```text
meta.ai.contextStrategy
meta.ai.feedbackPreference
meta.ai.jsonMode
meta.ai.contextSignals.feedbackCount
```

`feedbackPreference` 只返回统计摘要，不返回用户备注原文和隐藏 prompt。

## ML 缓存调整

本地 ML 仍使用 Node.js 调用 Python 脚本推理，暂不改 ONNX 或 FastAPI。

缓存键已从：

```text
userId + latestDate + modelMtime
```

扩展为：

```text
userId + latestDate + modelMtime + dataSignals
```

`dataSignals` 包含近期运动、健康、睡眠、训练状态、天气样本和反馈数量。这样同一天新增关键数据或反馈后，缓存能自动失效。

`GET /api/ai/health` 的 coach 信息增加缓存状态：

```text
cache.enabled
cache.ttlMs
cache.size
cache.keyIncludes
```

## 验证记录

本轮变更已通过：

```powershell
npm test
npm run build
```

验证点包括：

- `daily-brief` 请求体包含 DeepSeek JSON Mode。
- DeepSeek 返回非法 JSON 时回退规则建议。
- RAG system prompt 包含 ML 输出和反馈偏好。
- user message 只包含用户原始问题。
- API 响应不泄露隐藏 prompt、完整上下文或用户反馈备注。
- 长周期问题会选择 `long_range_summary` 策略。
- ML 缓存键会随数据 signals 变化而变化。

## 后续可选方向

短期优先：

- 继续积累晨间状态、RPE 和建议反馈，降低规则伪标签占比。
- 在训练报告中持续观察真实标签比例和类别分布。
- 根据实际响应延迟评估是否需要把 Python ML 改成 FastAPI 常驻服务。

中长期再考虑：

- 向量库只保存周总结、活动洞察、用户反馈和异常恢复事件，不保存原始时序数值。
- DeepSeek Tool Calling 可以作为受控查询层的下一步，但仍应由后端白名单工具执行 SQL。
- ONNX 适合模型稳定后再做低延迟推理优化。

