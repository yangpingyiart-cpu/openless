# Observed (representative run)

**Command:** `npm run law-probe:002`

| Classification | Result |
|----------------|--------|
| Observed Behavior | Final `items={"1":"a","2":"from-B-stale"}` |
| Stable Behavior | Aligns with chat-thread 22/22 stale pair loss |
| Semantic Outcome | A's `from-A` erased |
| Protocol Outcome | Converged (writerA=v2 writerB=v2) |
