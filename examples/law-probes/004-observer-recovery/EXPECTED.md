# Expected Observations

## Observed Behavior

- Observer `state:update` may fire
- Observer often misses `sync:complete`

## Stable Behavior

- chat-thread LR4: 6/6 observer sync misses

## Semantic Outcome

- Final checksum equality provable on observer

## Protocol Outcome

- Full-sync convergence across mesh
