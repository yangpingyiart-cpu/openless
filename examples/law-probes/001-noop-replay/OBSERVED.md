# Observed (representative run)

**Command:** `npm run law-probe:001`

| Classification | Result |
|----------------|--------|
| Observed Behavior | `applyLocal` noop diff twice: v0→v2; data unchanged |
| Stable Behavior | Matches chat-thread LR5 and local duplicate patterns |
| Semantic Outcome | No meaningful state evolution |
| Protocol Outcome | Replicas converged (writer=v2 replica=v2) |
