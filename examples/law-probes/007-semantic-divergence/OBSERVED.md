# Observed (representative run)

**Command:** `npm run law-probe:007`

| Classification | Result |
|----------------|--------|
| Observed Behavior | logicalSends=15 storeKeys=2 gap=13 |
| Stable Behavior | Same class as chat-thread long-run send-gap |
| Semantic Outcome | Protocol-correct replica hides lost append intents |
| Protocol Outcome | Checksums match across 3 replicas |
