# System Grounding

Ground AI queries in verified local system state to eliminate hallucinations about packages, configs, and services.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐     ┌────────────┐
│   Agent     │────▶│  API Gateway │────▶│  Lambda   │────▶│ DynamoDB   │
│ (Python)    │     │  (Ingest)    │     │ (Ingest)  │     │ (State)    │
└─────────────┘     └──────────────┘     └───────────┘     └─────┬──────┘
                                                                 │
                    ┌──────────────┐                             │
                    │ Diff Processor│◀────────────────────────────┘
                    │ (Lambda)      │  (DynamoDB Streams)
                    └──────────────┘
                          │
                          ▼
                    ┌──────────────┐
                    │ CHANGE#      │
                    │ Records      │
                    └──────────────┘

┌─────────────┐     ┌──────────────┐
│  Dashboard  │────▶│  DynamoDB    │
│  (Next.js)  │     │  (Query)     │
└─────────────┘     └──────────────┘

┌─────────────┐     ┌──────────────┐
│     MCP     │────▶│  DynamoDB    │
│  (Cursor)   │     │  (Query)     │
└─────────────┘     └──────────────┘
```

**Flow:**
1. **Agent → API Gateway → Lambda → DynamoDB**: Python agent collects system state (packages, configs, env vars, services) and sends to ingestion API
2. **DynamoDB ↔ Diff Processor**: DynamoDB Streams trigger Lambda to compute diffs and write `CHANGE#` records for audit trail
3. **Dashboard / MCP → DynamoDB**: Next.js dashboard and Cursor MCP server query verified state for grounded AI responses

## Features

- **🎯 Grounded Queries**: AI responses backed by verified system state from DynamoDB
- **📊 Live Diff Tracking**: Automatic change detection via DynamoDB Streams with `CHANGE#` records
- **🔌 MCP Integration**: Cursor IDE integration via Model Context Protocol server
- **🔒 Least-Privilege Security**: IAM policies restrict dashboard to read-only + PutItem, deny DeleteItem/Scan
- **⏰ TTL Management**: Configurable time-to-live for records with automatic expiration
- **🚫 Denylist Filtering**: Sensitive environment variables (SECRET, TOKEN, PASSWORD, AWS_*) automatically excluded

## Quick Start

### Step 1: Deploy CloudFormation Stack

```bash
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name system-grounding \
  --capabilities CAPABILITY_IAM
```

This creates:
- DynamoDB table (`SystemState`) with single-table design
- Ingestion API (API Gateway + Lambda)
- Diff Processor Lambda (triggered by DynamoDB Streams)
- IAM user with least-privilege access for Vercel dashboard

### Step 2: Set Vercel Environment Variables

After deployment, get the outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name system-grounding \
  --query 'Stacks[0].Outputs'
```

Set these in your Vercel project:

| Variable | Value From Output |
|----------|-------------------|
| `DYNAMODB_TABLE_NAME` | `TableName` |
| `AWS_ACCESS_KEY_ID` | `VercelAccessKeyId` |
| `AWS_SECRET_ACCESS_KEY` | `VercelSecretAccessKey` |
| `AWS_REGION` | Your AWS region (e.g., `us-east-1`) |

### Step 3: Deploy Vercel Dashboard

```bash
cd dashboard
npm install

# Option A: Deploy via Vercel CLI
vercel deploy --prod

# Option B: Push to GitHub and connect via Vercel UI
git push origin main
```

### Step 4: Run the Local Agent

```bash
# Get the ingest API URL from CloudFormation outputs
INGEST_URL=$(aws cloudformation describe-stacks \
  --stack-name system-grounding \
  --query 'Stacks[0].Outputs[?OutputKey==`IngestApiUrl`].OutputValue' \
  --output text)

# Run the agent
python agent/agent.py \
  --device-id "framework-13" \
  --api-url "$INGEST_URL" \
  --interval 60
```

## Configuration

### TTL (Time-To-Live)

Records automatically expire based on TTL. Configure via CloudFormation parameter:

```bash
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name system-grounding \
  --parameter-overrides ChangeRecordTTLDays=7 \
  --capabilities CAPABILITY_IAM
```

- **Default**: 30 days for change records
- **Per-record**: Agents can set `stalenessThresholdSeconds` (default: 86400 = 24 hours)

### Denylist

Environment variables matching these patterns are automatically excluded:

```python
ENV_DENYLIST_PATTERNS = [
    r"SECRET", r"TOKEN", r"PASSWORD",
    r"AWS_", r"GITHUB_", r"NPM_TOKEN", r"DOCKER_PASSWORD"
]
```

### Adding New Record Types

To collect a new type of system state:

1. **Add collection function** in `agent/agent.py`:

```python
def collect_services() -> list[dict[str, Any]]:
    records = []
    # ... collection logic ...
    records.append({
        "recordType": "SERVICE",
        "id": name,
        "data": {"name": name, "status": "active"},
        "stalenessThresholdSeconds": 300,
    })
    return records
```

2. **Call it in `main()`**:

```python
all_records.extend(collect_services())
```

3. **Add intent mapping** in `dashboard/pages/api/ask.js`:

```javascript
{ keywords: /service|systemd/i, types: ['SERVICE'] },
```

## Demo Walkthrough

See [`demo-script.md`](./demo-script.md) for the full adversarial demo script.

**Summary:**
1. **Hallucination (0:00–0:30)**: AI guesses React version without grounding
2. **Grounded Fix (0:30–1:00)**: Same query returns verified version from DynamoDB
3. **Boundary Awareness (1:00–1:30)**: Confidence drops when data is stale/missing
4. **Live Change Detection (1:30–2:00)**: Dashboard shows real-time diff tracking
5. **MCP Reveal (2:00–2:30)**: Cursor IDE uses MCP server for grounded responses

> **Note**: The LLM answer in the demo is simulated. In production, replace the simulated response in `dashboard/pages/api/ask.js` with an actual LLM API call (e.g., Anthropic, OpenAI) that receives the verified context.

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Infrastructure** | AWS CloudFormation, Lambda, API Gateway, DynamoDB |
| **Agent** | Python 3, requests, pyyaml |
| **Dashboard** | Next.js, React, AWS SDK v3 |
| **MCP Server** | TypeScript, @modelcontextprotocol/sdk |
| **Security** | IAM least-privilege policies, TTL-based expiration |

## Project Structure

```
/workspace
├── template.yaml          # CloudFormation stack
├── agent/
│   └── agent.py           # Python state collector
├── lambdas/
│   ├── ingestApi.js       # API ingestion handler
│   └── diffProcessor.js   # Stream processor for diffs
├── dashboard/
│   ├── pages/
│   │   ├── index.js       # Main dashboard UI
│   │   └── api/ask.js     # Grounded query endpoint
│   └── package.json
├── mcp/
│   ├── src/index.ts       # Cursor MCP server
│   └── package.json
└── README.md              # This file
```

## License

MIT
