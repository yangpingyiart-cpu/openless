# Observed (representative run)

**Command:** `npm run law-probe:004`

| Classification | Result |
|----------------|--------|
| Observed Behavior | observer sync:complete=0 state:update=1; lagged sync:complete=0 |
| Stable Behavior | Matches chat-thread observer recovery pattern |
| Semantic Outcome | Equality without reconstruction history |
| Protocol Outcome | Full-sync converged all replicas |
