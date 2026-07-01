# MotionCare 服务端安全加固

## 安全边界

本次加固覆盖 Express API、个人健康数据、运动活动数据、登录防暴力破解和认证审计。
它不修改前端 UI、业务算法、JWT 的 localStorage 存储方式、密码哈希格式或登录产品流程。

主要威胁包括：匿名读取个人健康数据、通过 activity ID 读取他人轨迹和心率、普通用户请求全局统计、登录撞库、高频 API 请求、过大 JSON 请求体，以及默认响应头暴露服务端实现。

## API 防护

- `/api/health` 保持公开，只报告数据库为 `connected` 或 `unavailable`，不返回连接异常详情。
- `/api/health/*` 的个人数据接口、活动列表与详情、活动轨迹/心率/速度/圈段/区域、统计、训练和仪表盘数据均要求 Bearer token。
- 普通用户的活动 owner 始终归一化为 `mine`；管理员可使用 `all`、`mine` 或 `admin`。
- 活动不存在或不属于当前普通用户时统一返回 `404 ACTIVITY_NOT_FOUND`，避免泄露资源是否存在。
- Helmet 启用常规安全响应头，CSP 暂时关闭，`Cross-Origin-Resource-Policy` 为 `cross-origin`，以兼容现有地图、图表和 `/uploads` 图片。
- `/api` 使用全局 IP 限流；`/api/auth/login` 另有更严格的 IP 限流。
- JSON 请求体默认最多 1 MB，超限返回 `413 PAYLOAD_TOO_LARGE`。

## 上传文件防护

- 活动、跑鞋、社区图片以及探索图片/视频先经过 Multer 的声明类型与大小限制，再由 `file-type` 根据文件签名识别真实类型；客户端文件名和 `Content-Type` 不作为最终信任依据。
- 识别结果必须属于对应的 `image/*` 或 `video/*` 类别，未知格式、伪造类型和 SVG 等无法可靠识别的内容统一返回 `400 INVALID_UPLOAD`。
- 服务端使用识别出的 MIME，并将磁盘文件扩展名归一化为识别结果；校验、请求字段处理或后续业务写入失败时删除临时文件。
- 文件签名识别属于纵深防御而非恶意内容扫描。生产环境仍应限制上传目录权限、保持 `/uploads` 不可执行，并可在风险升高时接入独立的恶意软件扫描服务。

## 登录防护与审计

登录前按规范化 email 和 Express 解析后的客户端 IP 查询 `LoginAttempts`：

1. 若存在仍在封禁期内的 `LOGIN_BLOCKED` 标记，记录 `SecurityEvents.LOGIN_BLOCKED` 并返回 429；该请求不会写入新的封禁标记，因此不会延长封禁期。
2. 否则统计失败窗口内、最近一次成功登录或封禁标记之后的凭据失败；封禁标记本身不参与失败次数统计，到期后会重置旧失败计数。
3. 达到阈值后的下一次请求写入一个 `LOGIN_BLOCKED` 标记和安全事件，并返回 `429 LOGIN_BLOCKED`。
4. 登录成功写入成功 attempt 和 `LOGIN_SUCCESS`；登录失败写入失败 attempt 和 `LOGIN_FAILED`。

审计写入为同步、失败关闭：迁移未应用或安全表不可用时不签发 token。日志只记录 email、用户 ID、IP、截断后的 User-Agent、结果和安全原因，不记录密码或 JWT。

## 配置

| 变量 | 默认值 | 说明 |
| --- | ---: | --- |
| `TRUST_PROXY` | `false` | 仅在应用确实位于可信反向代理之后时设为 `true`；启用后只信任一层代理。 |
| `JSON_BODY_LIMIT` | `1mb` | JSON 请求体上限。 |
| `GLOBAL_RATE_LIMIT_WINDOW_MS` | `900000` | 全局 API 限流窗口。 |
| `GLOBAL_RATE_LIMIT_MAX` | `600` | 每个 IP 在全局窗口内的最大请求数。 |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `900000` | 登录 IP 限流窗口。 |
| `AUTH_RATE_LIMIT_MAX` | `30` | 每个 IP 在认证窗口内的最大登录请求数。 |
| `LOGIN_FAILURE_WINDOW_MS` | `600000` | email + IP 凭据失败统计窗口。 |
| `LOGIN_FAILURE_MAX` | `5` | 写入临时封禁标记前允许的失败次数。 |
| `LOGIN_BLOCK_MINUTES` | `10` | 持久化封禁标记有效时间。 |

不要仅因收到外部 `X-Forwarded-For` 就开启 `TRUST_PROXY`。错误配置会让攻击者伪造限流使用的客户端 IP。

## 生产部署安全

- 使用仍在安全支持期内的 Node.js；当前后端依赖要求 Node.js 22 或更高版本。
- MySQL 只监听内网或本机地址，并通过主机防火墙、安全组或云防火墙禁止公网访问 3306。
- Node API 设置 `HOST=127.0.0.1`，不直接监听公网网卡；只允许 Nginx 代理访问后端端口。
- 使用 `backend/docs/nginx-motion-analysis.conf` 作为反向代理基础，生产环境由 Nginx 对外提供 HTTPS，并转发到 `127.0.0.1:8089`。
- 仅在 Node 前方确实只有一层可信 Nginx 时设置 `TRUST_PROXY=true`；不要信任客户端直接提供的转发头。
- 生产数据库使用 `motion_api` 等专用最小权限账号，禁止后端使用 MySQL `root` 账号。
- `JWT_SECRET` 必须配置为不可预测的高强度随机值；为空时不得上线。管理员密码和数据库密码同样必须通过部署环境注入。
- `.env`、数据库密码、Garmin token、AI Key、私钥和运行日志不得提交到 Git。仓库 `.gitignore` 已忽略 `.env*`、`database/.garmin_tokens/` 和常见密钥文件，但提交前仍需执行敏感值检查。
- 生产服务器应限制 `.env` 和 Garmin token 目录的文件权限，并定期轮换数据库密码、JWT 密钥和外部 API Key。

## 依赖漏洞检查

每次发布前在 `backend` 目录执行：

```powershell
npm audit
npm audit --omit=dev
```

先评估修复是否包含破坏性主版本升级，不要无审查运行 `npm audit fix --force`。

## 部署顺序

1. 备份数据库。
2. 从 `backend` 目录执行：

   ```powershell
   node scripts/applyMigration.js ..\database\sql\17_security_hardening.sql
   ```

3. 使用非 root 数据库账号并配置 `JWT_SECRET` 等生产安全变量；仅在可信单层 Nginx 后启用 `TRUST_PROXY=true`。
4. 发布并启动后端，检查 `/api/health`、安全响应头和认证限流。
5. 查询 `LoginAttempts` 与 `SecurityEvents`，确认成功、失败和封禁事件正常落库。

`import_shared_seed.ps1` 每次重建数据库后都会自动执行 17 号迁移；其他导入或手工重建方式仍必须在启动后端前手动执行该迁移，否则安全表缺失会使登录失败。

## 状态码与兼容性

| 场景 | 状态码与错误码 |
| --- | --- |
| 未登录访问个人数据 | `401 AUTH_REQUIRED` |
| 活动不存在或越权 | `404 ACTIVITY_NOT_FOUND` |
| email + IP 临时封禁 | `429 LOGIN_BLOCKED` |
| 登录 IP 限流 | `429 AUTH_RATE_LIMITED` |
| 全局 API 限流 | `429 RATE_LIMITED` |
| JSON 请求体超限 | `413 PAYLOAD_TOO_LARGE` |

成功响应结构保持不变。现有 `frontend/src/services/dashboard.js` 和 `frontend/src/views/HealthDetail.vue` 使用裸 `fetch('/api/dashboard/health...')`，不会附加 Bearer token；本安全分支不修改前端，后续必须改用现有 `apiClient`，否则这些请求会收到 401。

PR 描述必须保留上述兼容性说明，避免后续前端联调把 401 误判为健康接口故障。
