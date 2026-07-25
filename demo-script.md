# Adversarial Demo Script (2:30)

Timing guide for the System Grounding demo. Full narrative lives in README.

| Time | Beat | What to show |
|------|------|--------------|
| 0:00–0:30 | Hallucination | Ungrounded AI guesses a React/package version |
| 0:30–1:00 | Grounded fix | Same query answers from DynamoDB-verified state |
| 1:00–1:30 | Boundary awareness | Confidence drops when data is stale or missing |
| 1:30–2:00 | Live change detection | Dashboard shows real-time diff tracking |
| 2:00–2:30 | MCP reveal | Cursor IDE uses the MCP server for grounded replies |

**Note:** Dashboard `/api/ask` may return a simulated LLM answer; swap in a real provider for production demos.
