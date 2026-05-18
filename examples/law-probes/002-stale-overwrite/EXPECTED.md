# Expected Observations

## Observed Behavior

- Both writes succeed locally
- Final map has one winner for conflicting slot id

## Stable Behavior

- 100% message loss rate (1 of 2) in chat-thread stale pairs

## Semantic Outcome

- One writer intent absent from final state

## Protocol Outcome

- Checksums match; LWW convergence
