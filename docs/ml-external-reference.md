# 外部运动数据集辅助说明

本项目是课程设计与学术演示用途。外部公开数据只用于离线对比分析，不进入线上推理链路，也不覆盖用户真实反馈。

## 默认数据源

- FitRec / Endomondo: https://cseweb.ucsd.edu/~jmcauley/datasets/fitrec.html
- 用途：筛选相似跑者，分析跑步配速、距离、时长、心率分布。
- 限制：仅学术用途；不要把原始数据提交到仓库或随项目分发。

Garmin-RUNSAFE 作为训练负荷、伤病风险和问卷反馈设计参考，不作为本项目可下载训练集依赖。

## 离线报告

将 FitRec / Endomondo 数据准备成 JSONL 或 JSONL.GZ 后执行：

```powershell
python backend/ml/analyze_fitrec_reference.py --input path/to/endomondo.jsonl.gz --out backend/ml/models/fitrec_reference_report.json
```

报告会筛选：

- `running` 活动。
- 有距离和时长的记录。
- 训练记录数量达到阈值的用户。
- 平均配速接近高水平业余跑者的用户。

输出只用于论文、答辩和规则校准参考。最终 AI 教练判断仍按以下优先级：

```text
用户真实反馈 > 次日恢复客观标签 > 个人历史分位数伪标签 > 规则兜底 > 外部数据参考
```
