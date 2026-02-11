# Token Optimization & Dev-Agent Usage

## Decision Logic (Automatic)

**I automatically decide when to spawn dev-agents based on task complexity:**

### Use Kimi K2.5 (Main Session) Directly
- Simple edits (1-2 files)
- Server restarts
- Status checks
- Configuration updates
- Quick troubleshooting
- **Why:** Faster, less overhead, better reasoning for complex logic

### Spawn Pony Alpha (Dev-Agent)
- Multi-file changes (3+ files)
- Repetitive coding tasks
- Large refactoring jobs
- Tasks expected to take 5+ minutes
- **Why:** FREE (OpenRouter), can run up to 10 minutes with new timeout

### Fallback Strategy
1. Try Pony Alpha first for complex tasks
2. If timeout/failure → I complete with Kimi K2.5
3. If result quality insufficient → Retry with Kimi K2.5 directly

## Token-Saving Rules

| Task Type | Model | Est. Cost |
|-----------|-------|-----------|
| Simple file edit | Kimi | ~$0.001-0.01 |
| Server restart | Kimi | ~$0.001 |
| Multi-file feature | Pony Alpha | FREE |
| Complex debugging | Kimi | ~$0.01-0.05 |
| RAG creation | Kimi | ~$0.01-0.05 |

## Timeout Configuration

```json
{
  "agents": {
    "defaults": {
      "timeoutSeconds": 600,
      "subagents": {
        "archiveAfterMinutes": 60
      }
    }
  }
}
```

- **Agent timeout:** 10 minutes (was 5 min)
- **Session archive:** 60 minutes (was 30 min)

## Current Setup

**Primary:** Kimi K2.5 (Moonshot) - Fast, good reasoning, logged for sensitive data
**Secondary:** Pony Alpha (OpenRouter) - Free, logged, good for dev tasks
**Fallback:** Llama 3.2 local - For cron jobs only (describes tasks instead of executing)

## Best Practices

1. **Batch simple tasks** → Do directly (saves spawn overhead)
2. **Use Pony Alpha for bulk work** → Free, can handle long tasks
3. **Fallback gracefully** → Never leave task incomplete
4. **Monitor timeouts** → If Pony times out, take over with Kimi

## Model Characteristics

**Kimi K2.5 (Moonshot)**
- ✅ Fast responses
- ✅ Excellent reasoning
- ✅ Good for complex logic
- ✅ Not logged by OpenRouter
- ❌ Costs money (~$0.001-0.01 per task)

**Pony Alpha (OpenRouter)**
- ✅ FREE
- ✅ 200K context window
- ✅ Good for coding tasks
- ❌ All prompts logged (don't use for sensitive data)
- ❌ Slower than Kimi
- ❌ Can timeout on very complex tasks

## When to Override

**Say "use Kimi" or "use Pony Alpha" to override automatic decision:**
- "Use Pony Alpha for this refactor" → Spawns dev-agent
- "Use Kimi for this" → I handle directly

**Default:** Automatic decision based on task complexity
