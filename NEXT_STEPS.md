# OpenLess — NEXT_STEPS

> 基线：`v0.3` in-memory prototype（`core/` + `demo/`）  
> 参考：`PROJECT_STATE.md`、`ARCHITECTURE.md`  
> 更新：2026-05-17

本文档为**工程路线图**，仅依据仓库内已有代码与已识别缺口推导阶段划分。未实现的能力一律标为缺失，不预设具体技术选型（除 README 已提及项）。

---

## 代码归属速查

| 归属 | 路径 | 说明 |
|------|------|------|
| **core runtime** | `core/*.ts` | 可复用运行时；当前无 `index` 导出 |
| **demo-only** | `demo/*.ts` | 集成示例；**非**稳定公共 API |
| **占位** | `schemas/*.ts`（0 字节）、`agents/`（空） | 无运行时代码 |
| **依赖** | `package.json` | `zod` 已安装未使用 |

**demo-only 行为（须下沉或删除后才能进入 Phase 3+）：**

- `demo/multi-node-demo.ts`：`wireEngineInboundSync` 重写 `DeltaSyncer.handleInboundMessage`
- `demo/multi-node-demo.ts`：`applyAndPublish` 组合 Engine + Syncer（**推荐模式**，但未固化在 core）
- `demo/delta-sync-demo.ts`：使用 `broadcastDiff`（绕过 `TransitionEngine`）

---

## 阶段总览

```
Phase 1  Runtime stabilization     [BLOCKER — 当前]
    |
    v
Phase 2  Persistence + WAL         [BLOCKER for 生产态 / 跨重启]
    |
    +------------------+
    v                  v
Phase 3  Real transport          Phase 4  Process / daemon
    |                  |
    +--------+---------+
             v
Phase 5  Agent runtime
             |
             v
Phase 6  Multi-process distributed runtime
```

| Phase | 是否 blocker | 阻塞对象 |
|-------|----------------|----------|
| 1 | **是** | Phase 2–6 全部 |
| 2 | **是**（跨重启、可靠 recovery） | Phase 4–6 的生产可用性 |
| 3 | **是**（跨进程同步） | Phase 4、6 的跨机能力 |
| 4 | 部分 | 长期运行、多进程部署 |
| 5 | 部分 | `agents/` 任何实现 |
| 6 | 否（汇总阶段） | 依赖 1–5 交付物 |

---

# Phase 1 — Runtime stabilization

## 目标

将 `core/` 固化为**单一写入契约**的可测试库：所有状态变更经 `TransitionEngine`（或等价 core 门面），`DeltaSyncer` 只负责协议与 fan-out；demo 不再依赖 monkey-patch。

## 当前缺失（相对 core）

| 项 | 现状 |
|----|------|
| 统一写入路径 | `DeltaSyncer.broadcastDiff` / `receiveDiff` / `applyFullSync` 直写 `StateStore` |
| Inbound pipeline | `multi-node-demo` 补丁逻辑不在 core |
| Schema | `schemas/global-state.ts`、`schemas/state-diff.ts` 为空 |
| 测试 | `npm test` 未配置；无 version / full-sync / recovery 用例 |
| 公共 API | 无 `index.ts`；`package.json` `main` 指向不存在的 `index.js` |
| 工程卫生 | `node_modules` 被 git 跟踪 |

## 技术风险

- 重构 `DeltaSyncer` 破坏现有三个 demo 的假设（尤其 `delta-sync-demo` 的 `broadcastDiff`）
- `applyFullSync` 经 Engine 后是否发 `state:update` / 是否走 recovery 规则 — 需显式定契约
- 无测试时改动 `version === local + 1` 逻辑易引入静默不同步

## 不应该提前做的事情

- 接入 Redis / Kafka / WebSocket（Phase 3）
- 实现 WAL / DB（Phase 2）
- 编写 `agents/` 或 HTTP API（Phase 5+）
- 继续扩展 demo 层 patch 代替 core 修复

## 推荐顺序

1. 添加 `.gitignore`（`node_modules`）与测试框架（如 `node:test` 或 vitest）
2. **Core：** 新增 `OpenLessNode`（或 `Runtime`）门面：`applyLocal(diff)` → `engine.applyTransition` + `syncer.publishDiff`；`handleInbound(message, peerId)` → version 判断 → `engine` 或 full-sync
3. **Core：** 将 `broadcastDiff` 标为 deprecated / 内部测试用，或改为调用门面（不再公开直写 Store）
4. **Core：** 入站 `diff` 与 `full-sync` 路径文档化并单测
5. 填充 `schemas/`，在 `TransitionEngine.validateDiff` 前增加 zod parse
6. 导出 `index.ts`（Bus / Store / Engine / Syncer / 类型 / 门面）
7. 重写 demo：删除 `handleInboundMessage` 猴子补丁；`delta-sync-demo` 改走门面
8. 回归：`npx ts-node demo/*.ts` + CI `npm test`

## Blocker

**是。** 不完成 Phase 1，后续阶段的持久化与真实传输会在错误写入路径上叠加复杂度。

---

# Phase 2 — Persistence + WAL

## 目标

进程重启后仍可恢复 `GlobalState`；本地 mutation 可审计、可顺序回放；与现有 `version` / `VersionedDiff` 语义对齐。

## 当前缺失

| 项 | 现状 |
|----|------|
| 持久化后端 | `StateStore` 仅内存 |
| Append log | 无 |
| Snapshot | 无；README roadmap 仅文字提及 |
| Replay | 无；`recovering` 规则存在但无自动 replay 流程 |
| Log 与 full-sync 边界 | full-sync 后 log epoch 未定义 |

## 技术风险

- 在 Phase 1 完成前写 WAL → 可能记录「未经 Engine 的 diff」，replay 与规则不一致
- `applyFullSync` → `resetState` 与 log 截断策略不一致 → 副本与本地 log 分叉
- 双写：内存 Store 与 DB 不一致时的恢复顺序
- `structuredClone` 快照大对象时的性能（当前 `data: Record<string, any>` 无界）

## 不应该提前做的事情

- 真实跨进程传输（Phase 3）
- 多副本冲突合并、CRDT、leader 选举（当前代码无此概念）
- 在 `DeltaSyncer` 内直接调用数据库
- Agent 调度或外部工作流引擎（Phase 5）

## 推荐顺序

1. 定义 `StateBackend` 接口：`load()` / `saveSnapshot(state)` / `append(entry)` / `readLog(fromVersion)`
2. 默认实现：`MemoryBackend`（包装现有逻辑）+ `FileBackend`（JSON snapshot + JSONL log，便于 demo）
3. 挂钩点：**仅**在统一门面（Phase 1）`applyDiff` 成功后 `append({ version, diff, timestamp })`
4. 启动：`load snapshot` → replay log（经 `applyTransition` 或只读 replay 模式）→ 再对外服务
5. full-sync：定义 epoch / `truncateLog`；`applyFullSync` 后写 snapshot + 截断
6. 测试：崩溃恢复、gap 后 full-sync 与 log 一致性
7. （可选）`relay-demo` 扩展：从 `recovering` + log replay 启动

## Blocker

- 对 **Phase 3–6 的「生产可用」**：**是**（无持久化则 daemon / 分布式无意义）
- 对 **Phase 3 本地开发**：**否**（可用内存 + 单测验证传输适配器）

---

# Phase 3 — Real transport layer

## 目标

实现至少一种 **`SyncPeer` 的生产级适配器**，使两个**独立 OS 进程**中的 `DeltaSyncer` 能通过 `handleInboundMessage` 交换现有 `SyncMessage` 协议。

## 当前缺失

| 项 | 现状 |
|----|------|
| 网络传输 | 仅 `InMemorySyncPeer` + `InMemorySyncHub`（同进程同步回调） |
| 序列化 | 无；对象引用直传 |
| 连接生命周期 | `connectPeer` / `disconnectPeer` 无真实连接管理 |
| 适配器测试 | 无跨进程集成测试 |

## 技术风险

- Phase 1 未统一入站路径 → 网络上「同步成功但规则未执行」
- 消息乱序 / 重复投递：当前协议仅 `version + 1`，无 dedup id
- full-sync 大状态包：无分片、无压缩
- 注释中的 Redis / NATS / Kafka **均未实现**；选型错误会导致返工

## 不应该提前做的事情

- 多区域、多租户、服务网格
- 替换 `SyncMessage` 协议（应先让现有三类型消息跑通）
- 在 transport 层实现业务规则或 version 递增
- Phase 6 的 membership / 选主（本阶段仅点对点或静态 peer 列表）

## 推荐顺序

1. 定义 `SyncPeer` 适配器契约测试（mock + 双进程 harness）
2. 实现 **一种** 传输（建议优先：**WebSocket** 双向或 **Redis Pub/Sub** 频道 per peer）
3. JSON 序列化 `SyncMessage`（与 `GlobalState` 可 JSON 化字段对齐）
4. 进程 A/B 启动脚本：各跑一个 node，静态配置 peer URL / channel
5. 移植 `multi-node-demo` 场景为 **跨进程** e2e（非 `InMemorySyncHub`）
6. 文档化：超时、断连重连、重连后 full-sync 策略（实现最小集即可）

## Blocker

- 对 **Phase 4、6（跨进程）**：**是**
- 对 **Phase 2**：**否**（可并行，但 e2e 建议有 file WAL 便于断言）

---

# Phase 4 — Process runtime / daemon

## 目标

提供**长期驻留**的 Node 进程：加载配置、启动单节点 runtime（Store + Engine + Syncer + Transport）、处理信号优雅退出，可选暴露最小 health/readiness。

## 当前缺失

| 项 | 现状 |
|----|------|
| Daemon 入口 | 无；仅 `ts-node demo/*.ts` 一次性脚本 |
| 配置 | 无 `nodeId`、peer 列表、存储路径的配置文件 |
| 生命周期 | 无 SIGTERM 刷盘、无 graceful shutdown |
| 多进程模型 | 单进程内多节点（demo mesh）≠ 多进程部署 |
| 可观测性 | 无 metrics / structured log 约定 |

## 技术风险

- 无 Phase 2 → daemon 重启丢状态
- 无 Phase 3 → daemon 只能本机多实例内存 hub，无法真实分布式
- EventBus 同步派发阻塞传输回调 → 需明确是否在 adapter 层异步化
- 双实例同 `nodeId` 未防护

## 不应该提前做的事情

- Kubernetes Operator / 完整编排平台
- HTTP 业务 API 层（非 health 以外）
- Agent 任务队列（Phase 5）
- 自动扩缩容与动态 peer discovery（Phase 6）

## 推荐顺序

1. `bin/openless-node`（或 `src/cli.ts`）：解析配置 → 构造 Phase 1 门面 + Phase 2 backend + Phase 3 adapter
2. 启动：连接 peers → 可选 catch-up full-sync → 进入 idle（订阅 Bus 或轮询）
3. SIGINT/SIGTERM：flush snapshot + 关闭 transport
4. 最小 HTTP `/health`（可选，`http.Server` 单路由）
5. 将 demo 逻辑迁入 `examples/`，与 daemon 二进制分离
6. 文档：单节点 vs 多节点部署拓扑（静态 peer 表）

## Blocker

- 对 **可运维部署**：**是**（依赖 Phase 1；生产另依赖 2、3）
- 对 **Phase 5 Agent**：**部分**（Agent 需要稳定宿主进程）

---

# Phase 5 — Agent runtime

## 目标

在稳定 runtime 之上，让 **`agents/`** 成为可挂载的「状态驱动执行单元」：订阅 `EventBus`，根据 `GlobalState` / `state:update` 发出 `StateDiff`（经 Phase 1 门面），而不是旁路写 Store。

## 当前缺失

| 项 | 现状 |
|----|------|
| Agent 模块 | `agents/` 空目录 |
| 执行模型 | 无 task、无调度、无与 Engine 规则集成的约定 |
| Schema 约束 | `data` 仍为 `any`；agent payload 无结构 |
| 隔离 | 无 sandbox；agent 错误可拖垮同进程 EventEmitter |
| 与 sync 关系 | 未定义 agent 是否可多节点、如何幂等 |

## 技术风险

- Agent 直接调用 `store.applyDiff` 或 `broadcastDiff` → 复现 Phase 1 前的双路径问题
- 与 `recovering` 规则交互未定义（agent 是否在 recovery 期间停写）
- 无持久化时 agent 崩溃无法恢复 in-flight 意图
- 无鉴权时任意代码可注册为 agent

## 不应该提前做的事情

- 通用 LLM 编排平台、UI 工作台
- 跨租户 SaaS
- 在 agent 内实现分布式共识（属于 Phase 6 基础设施）
- 未定义 schema 前大规模 agent 类型爆炸

## 推荐顺序

1. 定义 `Agent` 接口：`id`、`onStateUpdate(payload)`、可选 `onSyncComplete`
2. `AgentHost`（core 或 `agents/runtime.ts`）：注册 agent、转发 Bus 事件、提供 `proposeDiff(diff)` → 门面
3. 示例 agent：counter / recovery 协助（仅写 `recovery.*` keys）
4. 规则：agent 禁止直接持有 `StateStore` 引用（仅 Host 注入）
5. 测试：agent 提议被拒时收到 `error:transition`
6. 文档：agent 与 `TransitionRule` 的分工（rule = 门禁，agent = 提议者）

## Blocker

- 对 **Phase 6**：**部分**（若「分布式 runtime」包含 autonomous agents）
- 对 **core 稳定**：**是**（依赖 Phase 1；可靠 agent 依赖 Phase 2、4）

---

# Phase 6 — OpenLess OS / distributed runtime

## 目标

在 **多进程、多机** 环境下，复用现有 `SyncMessage` + OCC + full-sync 协议，形成可重复部署的「多节点 runtime 集群」运维模型；**不**引入当前代码库中不存在的新一致性原语，除非先经过 Phase 1–3 验证。

## 当前缺失

| 项 | 现状 |
|----|------|
| 跨机部署 | 仅同进程 `InMemorySyncHub.mesh` |
| Peer 发现 | 静态 `connectPeer`；无动态 membership |
| 拓扑 | Demo 全 mesh；无 hub-spoke / 分区设计 |
| 运维 | 无滚动重启、备份、版本升级流程 |
| 一致性保证 | 仅 sequential version + full-sync；无 quorum、无 leader |
| 「OS」层 | 无命名空间、无资源隔离、无全局调度 — **仓库内无实现** |

## 技术风险

- 将 demo 全 mesh 直接扩展到 N 机 → 消息 fan-out 与 full-sync 风暴
- 脑裂：两节点同时 `applyTransition` 无协调 → 依赖 version 分叉后 full-sync，可能丢并发写
- 无 membership 时错误 peer 接入可 `resetState` 覆盖数据
- Phase 5 agent 多副本同时写同一 key → 未定义冲突策略

## 不应该提前做的事情

- 宣称 CRDT / Raft / 全球一致存储（代码未实现）
- 构建完整「操作系统」抽象（进程、文件系统、驱动）— 超出当前项目范围
- 跳过 Phase 3 用自定义 RPC 替代 `SyncPeer`
- 在无 Phase 2 情况下做「生产级多活」

## 推荐顺序

1. **固化协议：** 冻结 `SyncMessage` + `VersionedDiff` 版本字段（协议 v1 文档）
2. 部署拓扑 v1：静态 N 节点 full mesh 或星型（一个 relay 节点，减少 demo 式全连接）
3. 运维手册：启动顺序、断网恢复、full-sync 触发条件、备份 snapshot
4. 混沌测试：kill 单节点、延迟消息、重复 `diff` 投递（验证 `version + 1` 与 full-sync）
5. 评估是否需要 **显式单写者**（配置层 leader nodeId，非新协议）— 仅当 OCC 不足时
6. Agent 多实例：约定单写节点或 agent 分片 key 前缀
7. 再评估是否引入 membership 服务（新组件，需单独设计文档）

## Blocker

- **否**（汇总阶段）；实质阻塞来自 Phase 1–5 未完成项
- 对「跨机可用分布式 runtime」：**是**（依赖 Phase 1 + 3，建议 2 + 4）

---

## 跨阶段依赖矩阵

|  | P1 | P2 | P3 | P4 | P5 | P6 |
|--|:--:|:--:|:--:|:--:|:--:|:--:|
| **P1** | — | 建议先 | 必须 | 必须 | 必须 | 必须 |
| **P2** | | — | 可选并行 | 生产需要 | 建议 | 生产需要 |
| **P3** | | | — | 跨进程需要 | 可选 | 必须 |
| **P4** | | | | — | 宿主 | 运维需要 |
| **P5** | | | | | — | 可选 |
| **P6** | | | | | | — |

---

## 与 README roadmap 对齐

| README 项 | 阶段 |
|-----------|------|
| `StateStore` DB snapshot | Phase 2 |
| `SyncPeer` Redis / WebSocket / NATS / Kafka | Phase 3（择一先行） |
| `TransitionEngine.addRule` | Phase 1 稳定后持续使用（已存在 API） |
| Zod schema on `applyTransition` | Phase 1 |

---

## 当前建议执行焦点

```
[ NOW ]  Phase 1 — 统一写入 + 测试 + schema + 去掉 demo patch
[ NEXT ] Phase 2 — FileBackend snapshot + log（验证 replay）
[ THEN ] Phase 3 — 单传输适配器 + 双进程 e2e
```

完成 Phase 1 前，**不要**开新传输或 `agents/` 目录下的实现代码。

---

## 验证命令（基线）

```bash
npm install
npx ts-node demo/relay-demo.ts
npx ts-node demo/delta-sync-demo.ts
npx ts-node demo/multi-node-demo.ts
# Phase 1 完成后应增加: npm test
```
