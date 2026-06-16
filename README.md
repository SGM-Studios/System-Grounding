# System Grounding

System Grounding is a developer environment intelligence layer that grounds AI queries in verified local system state, eliminating hallucinations about package versions, configs, and services. By combining AWS DynamoDB for state storage, a Next.js dashboard for visualization, and an MCP server for Cursor IDE integration, it provides a single source of truth for your development environment's actual configuration.

## Quick Start

```bash
# Deploy AWS infrastructure
aws cloudformation deploy --template-file template.yaml --stack-name system-grounding

# Install dashboard dependencies
cd dashboard && npm install && npm run dev

# Install MCP server
cd mcp && npm install && npm run build

# Run agent to collect local state
python agent/agent.py
```
