# OpenLess — Architecture

> 版本：**Phase 1 frozen**（`OpenLessNode` + invariant tests）  
> 代码根目录：`core/`、`index.ts`、`test/`、`demo/`  
> 部署形态：无长期驻留进程；`npx ts-node demo/*.ts` 或 `npm test`

本文档描述**当前仓库中已实现**的运行时结构。未在代码中出现的组件不视为已存在。

---

## 1. OpenLess Runtime Architecture

每个逻辑节点由 **`OpenLessNode`** 组装，对外唯一 runtime 入口为 `applyLocal` / `handleInbound`：

```text
transport (SyncPeer)
  ↓
OpenLessNode.handleInbound() / applyLocal()
  ↓
DeltaSyncer          (protocol only — sequencing, fan-out, gap / full-sync signals)
  ↓
TransitionEngine     (applyTransition | applyFullSync)
  ↓
StateStore
```

```
+------------------------------------------------------------------+
|                      OpenLessNode (façade)                       |
|  applyLocal(diff)  |  handleInbound(SyncMessage, fromPeerId)     |
+------------------------------------------------------------------+
         |                              |
         v                              v
+------------------+          +------------------+
| TransitionEngine |          |   DeltaSyncer    |
| validate + rules |          | publish / signal |
+--------+---------+          +--------+---------+
         |                              |
         v                              | SyncPeer.send
+--------+---------+                    v
|   StateStore     |          (remote OpenLessNode.handleInbound)
|   EventBus       |
+------------------+
```

| 层级 | 职责 |
|------|------|
| **OpenLessNode** | 唯一 runtime entry；编排 Engine + Syncer |
| **StateStore** | 持有 `GlobalState`；仅 Engine 在 runtime 路径写入 |
| **TransitionEngine** | `applyTransition`、`applyFullSync`（结构校验 + diff 规则） |
| **DeltaSyncer** | 协议原语：OCC 判断、fan-out、gap / full-sync **信令**（不写 Store） |
| **EventBus** | 模块间解耦通知 |
| **SyncPeer** | Transport 适配器边界 |

**仓库布局：**

```
openless/
├── index.ts            # 公共导出
├── core/
│   ├── openless-node.ts
│   ├── delta-syncer.ts
│   ├── transition-engine.ts
│   ├── state-store.ts
│   └── event-bus.ts
├── test/               # runtime invariant tests
├── demo/               # 示例（非稳定 API）
├── schemas/            # 占位
└── agents/             # 空
```

---

## 2. Runtime Invariants（Phase 1 — frozen）

以下不变量在 `test/openless-node.test.ts` 中锁定；**不得**在 Phase 2 前以「小重构」破坏，除非测试证明 invariant bug。

| Invariant | 含义 |
|-----------|------|
| **Single inbound path** | 所有入站 `SyncMessage` 经 `OpenLessNode.handleInbound` |
| **Single local path** | 所有本地业务写入经 `OpenLessNode.applyLocal` |
| **No direct Store mutation from sync** | `DeltaSyncer` 不调用 `applyDiff` / `resetState` |
| **DeltaSyncer owns no runtime state** | 仅协议与事件；版本/状态通过只读回调读取 |
| **Transport cannot call Engine** | `SyncPeer` 回调必须指向 `handleInbound`，不得 `engine.applyTransition` |
| **Same pipeline for diff and full-sync** | 二者均经 `TransitionEngine`（`applyTransition` / `applyFullSync`）后落 Store |
| **OCC on inbound diff** | `incoming.version === local.version + 1` 才 `applyTransition`；否则 gap → full-sync |
| **Recovery via Engine** | `status === recovering` 时非法 diff → `error:transition`，Store 不变 |

**已删除的违反路径（勿恢复）：**

- `DeltaSyncer.broadcastDiff` / `receiveDiff` / `handleInboundMessage`
- Demo `wireEngineInboundSync` 猴子补丁
- Transport 直写 `StateStore`

---

## 3. 核心模块关系

```
                    ┌─────────────────┐
                    │  OpenLessNode   │
                    └────────┬────────┘
              ┌──────────────┼──────────────┐
              v              v              v
     TransitionEngine   DeltaSyncer    EventBus
              │              │
              │ applyDiff    │ read version/state (callbacks)
              │ resetState   │ publishDiff / sync signals
              v              │
       ┌──────────────┐      │
       │  StateStore  │◄─────┘ (no write from Syncer)
       └──────────────┘
              ▲
              │ SyncPeer → peer.handleInbound
```

**依赖规则：**

| 模块 | 依赖 | 不依赖 |
|------|------|--------|
| `StateStore` | 无 | Bus、Engine、Syncer、Node |
| `EventBus` | Node `events` | Store |
| `TransitionEngine` | Store, Bus | Syncer |
| `DeltaSyncer` | Bus, 只读 version/state 回调 | Engine、Store 写入 |
| `OpenLessNode` | Store, Bus, Engine, Syncer | — |
| `InMemorySyncHub` | `InboundHandler`（通常为 OpenLessNode） | Engine 直接调用 |

---

## 4. 数据流

### 4.1 核心类型

```ts
interface GlobalState {
  version: number;
  data: Record<string, any>;
  status: "active" | "recovering" | "error";
}

interface StateDiff {
  mutation: Partial<GlobalState>;
  timestamp: number;
}

interface VersionedDiff {
  version: number;   // 发送方 apply 后的目标 version
  diff: StateDiff;
}
```

### 4.2 本地 mutation 合并（StateStore）

`applyDiff` 行为（`core/state-store.ts`）：

```
mutation.version  -->  忽略（Store 自行 version + 1）
mutation.status   -->  覆盖（若提供）
mutation.data     -->  浅合并到 state.data
```

### 4.3 端到端数据流

**本地：**

```
OpenLessNode.applyLocal(diff)
    → TransitionEngine.applyTransition
    → StateStore.applyDiff (version++)
    → emit state:update
    → DeltaSyncer.publishDiff(diff, version)
    → SyncPeer.send({ type: "diff", payload: VersionedDiff })
```

**入站 diff（sequenced）：**

```
SyncPeer → OpenLessNode.handleInbound
    → DeltaSyncer.isSequenced
    → TransitionEngine.applyTransition
    → emit diff:received(applied=true)
```

**入站 gap：**

```
handleInbound(diff) → not sequenced
    → diff:received(applied=false)
    → requestFullSync → peer respondFullSync
    → handleInbound(full-sync)
    → TransitionEngine.applyFullSync
    → emit sync:complete
```

---

## 5. Transition Flow

```
applyTransition(diff)
        |
        v
+------------------+
| validateDiff     |--fail--> emit error:transition --> return false
+------------------+
        | ok
        v
+------------------+
| runRules         |  for each rule where condition(state, diff)
|                  |  action throws --> emit error:transition --> false
+------------------+
        | ok
        v
+------------------+
| store.applyDiff  |  version++
+------------------+
        |
        v
 emit state:update { state, diff, previousState }
        |
        return true
```

**内置校验（`validateDiff`）：**

- `diff` / `mutation` 必须为 object
- `timestamp` 为有限 number
- `mutation.status` ∈ `{ active, recovering, error }`（若提供）
- `mutation.data` 若为 object
- `mutation.version` 若提供须为 number（**不会写入 Store**）

**规则执行：**

- 仅当 `rule.condition(state, diff) === true` 时执行 `rule.action`
- 默认构造器注入 `createRecoveryRule()`（见 §9）

---

## 6. Delta Sync Flow（协议层）

### 6.1 出站

```
OpenLessNode.applyLocal 已成功
    → DeltaSyncer.publishDiff(diff, version)
    → emit diff:broadcast
    → for each SyncPeer: send({ type: "diff", payload: VersionedDiff })
```

### 6.2 入站 diff（由 OpenLessNode 编排）

```
handleInbound(diff)
    → isSequenced(incoming, local) ?
         yes → engine.applyTransition → emitDiffReceived(applied)
         no  → emitDiffReceived(false) → requestFullSync
```

### 6.3 Full-sync 子流程

```
requestFullSync(peer)
    → emit sync:request
    → peer.send({ type: "full-sync-request", ... })

Remote handleInbound(full-sync-request)
    → respondFullSync (read-only getLocalState)

Local handleInbound(full-sync)
    → TransitionEngine.applyFullSync(remoteState)
    → store.resetState + emit state:update
    → emitSyncComplete
```

**注意：** full-sync **经** `TransitionEngine.applyFullSync`（结构校验）；**不**执行 recovery 等业务 rules（peer 快照权威）。与 diff 共用同一 runtime pipeline，非 Store 直写。

---

## 7. Multi-node Sync Flow

当前多节点仅存在于 **同一 OS 进程** 内，由 `InMemorySyncHub.mesh()` 建立全连接：

```
  NODE_A <----------------> NODE_B
    ^    \                  /    ^
    |     \                /     |
    |      -------> NODE_C <-----+
    |
  (each link = bidirectional InMemorySyncPeer pair)
```

**消息路径（单跳逻辑，mesh 下为多 peer 广播）：**

```
NODE_A: applyLocal(diff)
           |
           +----SyncMessage(diff)----> NODE_B.handleInbound
           |
           +----SyncMessage(diff)----> NODE_C.handleInbound
```

**版本缺口示例（demo Step 2）：**

```
NODE_C: resetState(version=0)
NODE_B: send VersionedDiff(version=2)   # gap: local=0, incoming=2
NODE_C: handleInbound(diff) --> gap --> sync:request --> full-sync from B
NODE_C: resetState(peer state)         # 与 B 对齐，非 replay diff v2
```

---

## 8. OCC / Version Control

OpenLess 使用 **单调递增的整数 `version`** 作为乐观并发版本号。

### 7.1 本地写入

```
applyDiff:  version' = version + 1   (始终由 StateStore 执行)
            mutation.version 被忽略
```

### 7.2 副本接收

```
接受条件:  incoming.version === local.version + 1
否则:      拒绝 apply，触发 full-sync
```

### 7.3 语义边界

| 场景 | 行为 |
|------|------|
| 连续 diff 顺序到达 | 逐条 apply，`version` 同步 +1 |
| 跳号（如 local=0, incoming=2） | 不 apply；full-sync |
| 重复/旧 version | 同上（不满足 +1） |
| full-sync | `resetState` 直接设置 peer 的 `version` |

**未实现：** 基于 `mutation.version` 的冲突合并、vector clock、leader 序列化、并发双写检测。

```
Timeline (单节点):

  v0 --diff--> v1 --diff--> v2 --diff--> v3

Replica:

  v0 --v1 ok--> v1 --v3 skip--> full-sync --> v2 (peer snapshot)
```

---

## 9. Event Model

`EventBus` 为 Node `EventEmitter` 的 typed 薄封装。事件名为 string，payload 由发射方定义。

### 8.1 Transition 域（`transition-engine.ts`）

| 事件 | 常量 | 触发时机 | Payload 要点 |
|------|------|----------|----------------|
| 状态更新 | `state:update` | `applyTransition` 成功 | `state`, `diff`, `previousState` |
| 转换失败 | `error:transition` | 校验失败或 rule 抛错 | `state`, `diff`, `reason`, `rule?` |

### 8.2 Sync 域（`delta-syncer.ts`）

| 事件 | 常量 | 触发时机 | Payload 要点 |
|------|------|----------|----------------|
| Diff 已广播 | `diff:broadcast` | `publishDiff` | `nodeId`, `versioned`, `peerIds` |
| Diff 已接收 | `diff:received` | 入站 diff 处理结束 | `applied: boolean` |
| 请求全量同步 | `sync:request` | 版本不匹配 | `localVersion`, `incomingVersion` |
| 全量同步完成 | `sync:complete` | `applyFullSync` 后 | `state` |

### 8.3 订阅约定

- Core **不**内置订阅者；由 demo 或上层注册
- `unsubscribe` 需传入与 `subscribe` **相同函数引用**
- 事件同步派发，无队列、无重试、无持久化

```
EventBus (in-process, sync)

  TransitionEngine ----state:update----------> handlers
                  \---error:transition-----> handlers

  DeltaSyncer -------diff:broadcast--------> handlers
                  \---diff:received--------> handlers
                  \---sync:request--------> handlers
                  \---sync:complete-------> handlers
```

---

## 10. Recovery Model

### 9.1 当前（已实现）

Recovery 是 **`TransitionEngine` 层的规则门禁**，不是独立子系统。

**状态：** `GlobalState.status === "recovering"`

**规则：** `createRecoveryRule()` — 当 `status === "recovering"` 时，仅允许：

| mutation 字段 | 允许值 |
|---------------|--------|
| `status` | `active` 或 `error`（或未改） |
| `data` keys | `recovery` 或 `recovery.*` 前缀 |

违反 → `TransitionValidationError` → `error:transition`，**不** `applyDiff`。

**演示：** `demo/relay-demo.ts` 以 `StateStore({ status: "recovering" })` 启动，依次 apply 合法/非法 recovery diff。

**未实现（代码中不存在）：**

- 自动进入 `recovering` 的故障检测
- checkpoint / WAL replay
- 跨节点 recovery 协调
- `recovering` 期间入站 full-sync 与 recovery rules 的交互策略（Phase 2）

### 9.2 后续（仅架构缺口说明，无实现）

README 将持久化列为 roadmap；与 recovery 相关的自然扩展是：

- 启动时从 snapshot 加载 `GlobalState`，可选设 `status: recovering`
- 在 Engine 规则之前回放持久化的 `StateDiff` 序列

当前 runtime **没有** 上述钩子；添加前需先统一 §3 的写入路径，避免 replay 绕过规则。

---

## 11. SyncPeer Abstraction

### 10.1 接口

```ts
interface SyncPeer {
  readonly id: string;
  send(message: SyncMessage): void;
}
```

`SyncMessage` 联合类型：

```
| { type: "diff";              payload: VersionedDiff }
| { type: "full-sync-request"; payload: { requesterId: string } }
| { type: "full-sync";         payload: { state: GlobalState } }
```

### 11.2 入站统一入口

```
transport adapter
      |
      |  decode bytes -> SyncMessage
      v
OpenLessNode.handleInbound(message, fromPeerId)
```

`fromPeerId` 由适配器提供，用于 `diff:received` / `sync:*` 事件与 `requestFullSync` 路由。

### 10.3 适配器职责边界

| 适配器负责 | Core 负责 |
|------------|-----------|
| 连接管理、序列化、投递 | 版本判断、apply/reset |
| 将 `fromPeerId` 传入 `handleInbound` | 由 Node 编排协议与 Engine |
| 实现 `SyncPeer.send` | `connectPeer` / `disconnectPeer` |

Core **不** 定义 TLS、认证、背压、消息去重。

---

## 12. 当前 Transport 架构

**唯一可用实现：** `InMemorySyncPeer` + `InMemorySyncHub`（`core/delta-syncer.ts`）。

```
InMemorySyncHub.link(A, B):

  A.connectPeer( InMemorySyncPeer(B.id, msg => B.handleInbound(msg, A.id)) )
  B.connectPeer( InMemorySyncPeer(A.id, msg => A.handleInbound(msg, B.id)) )

InMemorySyncHub.mesh([...]):  对任意 (i,j) 调用 link
```

```
+----------+    send()     +------------------+
| Syncer A | ------------> | callback on B    |
+----------+               | B.handleInbound  |
                           +------------------+
        (same process, synchronous call stack)
```

| 特性 | 当前值 |
|------|--------|
| 网络 | 无 |
| 序列化 | 无（对象引用直传） |
| 异步 | 同步回调 |
| 拓扑 | 全 mesh（demo） |
| 丢包/乱序 | 不发生 |

代码注释提及 Redis / WebSocket / NATS / Kafka 为**替换 `InMemorySyncPeer` 的候选**，仓库内 **无** 对应实现。

---

## 13. Runtime Boundary

```
+-------------------------------------------------------------+
|  IN SCOPE (core/ + index.ts)                                 |
|  - OpenLessNode (唯一 runtime entry)                         |
|  - StateStore, EventBus, TransitionEngine, DeltaSyncer       |
|  - SyncPeer, InMemorySyncPeer, InMemorySyncHub               |
|  - test/openless-node.test.ts (runtime invariants)           |
+-------------------------------------------------------------+
|  DEMO LAYER (demo/) — 非稳定公共 API                         |
|  - 日志与场景脚本；经 OpenLessNode 调用                      |
+-------------------------------------------------------------+
|  OUT OF SCOPE (Phase 2+)                                     |
|  - HTTP/gRPC、daemon、真实 transport、持久化/WAL             |
|  - Zod schemas/、agents/ 编排                                |
+-------------------------------------------------------------+
```

**进程边界：** 一个 Node 进程可承载多个逻辑节点（demo / test）；**无** 跨进程隔离。

**写入边界（Phase 1 已统一）：**

| 路径 | Engine | Store |
|------|--------|-------|
| `OpenLessNode.applyLocal` | `applyTransition` | yes |
| `handleInbound` diff (sequenced) | `applyTransition` | yes |
| `handleInbound` full-sync | `applyFullSync` | `resetState` |
| `DeltaSyncer` | — | **no** |

---

## 14. 当前缺失模块（Phase 2+）

| 模块 | 路径 | 状态 |
|------|------|------|
| Schema 校验 | `schemas/*.ts` | 空文件 |
| Agent 层 | `agents/` | 空目录 |
| 真实 SyncPeer | — | 未实现 |
| 持久化 / WAL | — | 未实现 |
| 从 git 移除 `node_modules` | `.gitignore` 已添加 | 需 `git rm -r --cached`（运维操作） |

---

## 15. 后续 Persistence / WAL 设计方向

> 本节为 **未实现** 的扩展方向，用于约束未来改动；不构成当前 API。

与 README roadmap（`StateStore` 接入 DB snapshot）一致，建议保持 Store 为唯一 mutation 落点，避免 Syncer/Engine 各自写库。

### 14.1 分层

```
                    +------------------+
                    | TransitionEngine |
                    +--------+---------+
                             |
                    +--------v---------+
                    |   StateStore     |  <-- 唯一 mutation API
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
     +--------v--------+           +--------v--------+
     | MemoryBackend   |           | PersistBackend  |
     | (current)       |           | snapshot + log  |
     +-----------------+           +-----------------+
```

### 14.2 建议职责划分

| 组件 | 职责 |
|------|------|
| **Snapshot** | 周期性或 shutdown 时持久化完整 `GlobalState` |
| **Append log** | 在 `applyDiff` 成功后追加 `{ version, diff, timestamp }`（与 `VersionedDiff` 对齐） |
| **Replay** | 启动时：load snapshot → 按 version 顺序 replay log → 再设 `status`（含 `recovering`） |
| **Full-sync** | 仍走 `resetState`；持久化层记录 snapshot 边界，不混用 diff log 修补跳号 |

### 14.3 与现有协议的关系

```
Local write:
  Engine.applyTransition --> Store.applyDiff --> Log.append(entry)

Inbound (target state):
  version+1 match --> same as local write path (Engine + Log)
  gap             --> full-sync --> Snapshot.replace + Log.truncate or new epoch
```

### 14.4 实施前置条件

1. **保持 Phase 1 写入路径**（§2 invariants）：经 `OpenLessNode` / Engine 后再写 log  
2. **定义 log epoch**：full-sync 后是否截断 log、如何标记 `version` 连续性  
3. **测试**：version 单调、gap → full-sync、recovery 规则与 replay 顺序

当前代码 **无** `PersistBackend` 接口、**无** WAL 文件格式；实现前不应在 `DeltaSyncer` 内嵌 DB 调用。

---

## 附录：Demo 与 Core 对照

| Demo | 写入路径 | 同步 |
|------|----------|------|
| `relay-demo.ts` | `TransitionEngine`（单节点，无 `OpenLessNode`） | 无 |
| `delta-sync-demo.ts` | `OpenLessNode.applyLocal` / `handleInbound` | mesh |
| `multi-node-demo.ts` | `OpenLessNode.applyLocal` / `handleInbound` | mesh |

```bash
npm test
npm run demo:relay
npm run demo:delta-sync
npm run demo:multi-node
```

相关状态记录见 `PROJECT_STATE.md`。
