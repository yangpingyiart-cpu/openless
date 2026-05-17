# OpenLess — PROJECT_STATE

> 更新：2026-05-17  
> 版本标签：**Phase 1 frozen**（`OpenLessNode` + runtime invariant tests）

---

## 1. 当前目标

进程内可运行的 stateful runtime 原型，**单一写入路径**经 `OpenLessNode` → `TransitionEngine` → `StateStore`；`DeltaSyncer` 仅协议层。

**非目标（当前阶段）：** 生产部署、真实消息总线、持久化、Agent 编排、对外 HTTP API。

---

## 2. Milestone 状态

| 项 | 状态 |
|----|------|
| `OpenLessNode` 统一 entry | ✅ |
| `DeltaSyncer` 协议原语（不写 Store） | ✅ |
| Recovery 规则 | ✅ |
| Delta 同步 + full-sync | ✅ |
| `InMemorySyncHub` demo / test | ✅ |
| Runtime invariant tests (`npm test`) | ✅ |
| `index.ts` 公共导出 | ✅ |
| `.gitignore` | ✅ |
| Zod schema | ❌（Phase 2+） |
| 真实 `SyncPeer` 传输 | ❌（Phase 3） |
| 持久化 | ❌（Phase 2） |

---

## 3. 公共 API

自 `index.ts` 导出：`OpenLessNode`、`DeltaSyncer`、`TransitionEngine`、`StateStore`、`InMemorySyncHub`（及类型/事件常量）。

**已移除：** `broadcastDiff`、`receiveDiff`、`DeltaSyncer.handleInboundMessage`。

---

## 4. 验证

```bash
npm test
npm run demo:relay
npm run demo:delta-sync
npm run demo:multi-node
```

---

## 5. 技术债（记录，非 Phase 1）

- `node_modules` 若曾被 git 跟踪：需 `git rm -r --cached node_modules`
- `relay-demo` 未使用 `OpenLessNode`（单节点，可接受）
- full-sync 不跑 transition rules（peer 快照权威）
- 无 message-id 显式 dedup

详见 `ARCHITECTURE.md` §2 Runtime Invariants、`NEXT_STEPS.md`。
