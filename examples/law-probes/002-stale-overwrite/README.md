# 002 — Stale Overwrite

**Law:** LAW-001 (LWW Convergence Dominates Semantic Intent)

Two writers append from the same stale snapshot to a shared `items` map.

```bash
npm run law-probe:002
```
