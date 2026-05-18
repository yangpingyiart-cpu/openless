# Law Probes — Phase 1.6

Semantic stress microscopy. **Not** pass/fail tests.

Each probe observes stable runtime behavior under repeated pressure and maps to `docs/runtime/RUNTIME_LAWS.md`.

## Run

```bash
npm run law-probes          # all
npm run law-probe:001       # single
```

## Probes

| ID | Law focus | Script |
|----|-----------|--------|
| `001-noop-replay` | LAW-002 | Semantic inactivity, version activity |
| `002-stale-overwrite` | LAW-001 | LWW silent loss |
| `003-replay-ambiguity` | LAW-003 | Deterministic but unreadable trail |
| `004-observer-recovery` | LAW-005 | Equality without history |
| `005-version-inflation` | LAW-002 | Version ≫ semantic delta |
| `006-lag-oscillation` | LAW-004 | Recovery without causal log |
| `007-semantic-divergence` | LAW-001 + OBS-001 (withheld) | Send gap vs convergence |

## Outcome vocabulary

| Term | Meaning |
|------|---------|
| **Observed Behavior** | What happened this run |
| **Stable Behavior** | Reproduces across validations |
| **Semantic Outcome** | Human/domain interpretation |
| **Protocol Outcome** | Convergence / OCC validity |

## Constraints

- `OpenLessNode` only
- No `core/` changes
- No new domains (minimal `items`/`counter` probe state only)
