# Adversarial Demo Script: System Grounding

**Duration**: 2:30  
**Audience**: Developers, engineering managers, AI/ML teams  
**Goal**: Demonstrate how System Grounding prevents AI hallucinations by grounding responses in verified local system state

---

## Beat 1: Hallucination (0:00–0:30)

### Visual
- **Screen**: Cursor IDE with a Next.js project open
- **Chat Panel**: AI assistant conversation
- **Overlay Text**: "Without Grounding"

### Voiceover
> "Meet Alex, a developer working on a Next.js dashboard. Alex asks their AI assistant: *'What version of React is installed in my project?'*"

### Action
- **Typing animation**: User types the query into Cursor chat
- **AI Response appears** (simulated):
  ```
  Based on typical setups, you're likely using React 18.2.0 
  with Next.js 14. This is the most common combination 
  for new projects.
  ```

### Voiceover
> "The AI is guessing. It has no idea what's actually installed. The real answer could be React 17, React 19, or no React at all. This is a **hallucination**—confident but unverified."

### On-Screen Callout
- 🔴 **UNGROUNDED** - No verified data source

---

## Beat 2: Grounded Fix (0:30–1:00)

### Visual
- **Screen Split**: Left = Cursor IDE, Right = System Grounding Dashboard
- **Overlay Text**: "With Grounding"

### Voiceover
> "Now let's enable System Grounding. The same query triggers a lookup in DynamoDB, where verified system state is stored."

### Action
- **Dashboard shows**: Query sent to `/api/ask` endpoint
- **Backend flow animation**:
  1. Intent detection identifies `PACKAGE` record type
  2. DynamoDB Query fetches `TYPE#PACKAGE#react` record
  3. Confidence score calculated based on staleness

### AI Response (Grounded)
```
Your project has React 18.2.0 installed.

✓ Verified from: DEVICE#framework-13 / TYPE#PACKAGE#react
✓ Last collected: 2 minutes ago
✓ Confidence: VERIFIED (98%)
```

### Voiceover
> "The response is now **grounded** in actual data. The AI didn't guess—it retrieved verified state from DynamoDB, collected by the Python agent running on Alex's machine."

### On-Screen Callout
- 🟢 **VERIFIED** - Backed by DynamoDB record

---

## Beat 3: Boundary Awareness (1:00–1:30)

### Visual
- **Dashboard**: Shows confidence tier changing
- **Query**: "What GPU drivers are installed?"

### Voiceover
> "But what happens when the system doesn't have the data? Let's ask about GPU drivers—a record type we haven't collected yet."

### Action
- **AI Response**:
  ```
  I don't have verified information about GPU drivers 
  in your system state.

  ⚠️ Missing Data: HARDWARE#gpu
  ⚠️ Confidence: UNGROUNDED (20%)
  
  To get this data, add a hardware collector to the agent.
  ```

### Voiceover
> "System Grounding knows its limits. Instead of hallucinating, it **admits uncertainty** and tells you exactly what data is missing. This is boundary awareness in action."

### On-Screen Callout
- 🔴 **UNGROUNDED** - Missing required data
- 💡 **Actionable**: Tells user how to fix

---

## Beat 4: Live Change Detection (1:30–2:00)

### Visual
- **Dashboard**: Real-time view of CHANGE# records
- **Terminal**: Agent running, collecting state
- **Action**: User installs a package (`npm install lodash`)

### Voiceover
> "System Grounding doesn't just store state—it tracks **changes over time**. When the agent collects new data, DynamoDB Streams trigger a diff processor."

### Action
- **Before**: `package.json` shows old dependencies
- **After**: `npm install lodash` completes
- **Agent**: Sends updated PACKAGE records
- **DynamoDB Stream**: Triggers Diff Processor Lambda
- **CHANGE# Record Created**:
  ```json
  {
    "PK": "CHANGE#framework-13",
    "SK": "2025-01-15T10:30:00Z#MODIFY#TYPE#PACKAGE#lodash",
    "changeType": "INSERT",
    "diff": {
      "lodash": { "old": null, "new": "4.17.21" }
    },
    "ttl": 1739529600
  }
  ```

### Voiceover
> "Every change is logged with a diff. You can audit what changed, when, and on which device. This is your **single source of truth** for environment state."

### On-Screen Callout
- 📊 **Audit Trail**: CHANGE# records track all modifications
- ⏰ **TTL**: Old records auto-expire (configurable)

---

## Beat 5: MCP Reveal (2:00–2:30)

### Visual
- **Cursor IDE**: MCP server configuration shown
- **Terminal**: `mcp` server running
- **Chat**: New query with MCP tools enabled

### Voiceover
> "Finally, let's bring this into the developer workflow. The Model Context Protocol (MCP) server integrates System Grounding directly into Cursor IDE."

### Action
- **MCP Tool Call**: `get_system_state()` invoked
- **Response**:
  ```json
  {
    "nodeVersion": "v20.11.0",
    "npmVersion": "10.2.4",
    "cwd": "/workspace/dashboard",
    "timestamp": "2025-01-15T10:35:00Z"
  }
  ```

### AI Response (via MCP)
```
I checked your system via MCP:

- Node.js: v20.11.0
- npm: 10.2.4
- Working directory: /workspace/dashboard

This data was collected live from your machine—no guessing.
```

### Voiceover
> "With MCP, the AI can **pull verified state on demand**. No more context switching between terminal and chat. Your AI assistant becomes a true pair programmer who knows your environment."

### Final Screen
```
System Grounding:
✓ No more hallucinations
✓ Real-time accuracy
✓ Developer confidence
✓ Full audit trail
```

---

## Production Note

> **Simulated LLM Responses**: In this demo, AI responses are simulated for clarity. In production, replace the simulated response in `dashboard/pages/api/ask.js` with an actual LLM API call:
>
> ```javascript
> // Example: Anthropic Claude API
> const response = await anthropic.messages.create({
>   model: 'claude-sonnet-4-20250514',
>   messages: [{
>     role: 'user',
>     content: `Answer this query using ONLY the verified context below:\n\n${context}`
>   }]
> });
> ```
>
> The grounding middleware ensures the LLM receives **only verified data**, preventing hallucinations at the source.

---

## Demo Setup Checklist

- [ ] CloudFormation stack deployed
- [ ] Vercel dashboard running locally or deployed
- [ ] Agent running with valid `--device-id` and `--api-url`
- [ ] MCP server built and configured in Cursor
- [ ] Sample data ingested (run agent once before recording)
- [ ] Screen recording software ready (OBS, QuickTime, etc.)
- [ ] Overlay graphics prepared (UNGROUNDED/VERIFIED badges)

---

## Talking Points Summary

| Concept | Key Message |
|---------|-------------|
| **Hallucination** | AI guesses without verified data |
| **Grounding** | Queries backed by DynamoDB state |
| **Confidence Tiers** | VERIFIED/PARTIAL/UNGROUNDED based on data freshness |
| **Diff Tracking** | CHANGE# records provide audit trail |
| **MCP Integration** | Bring grounding into developer workflow |
| **Security** | Least-privilege IAM, TTL expiration, denylist filtering |
