// MCP server for Cursor IDE integration - provides system state information to AI
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

interface SystemState {
  nodeVersion: string;
  npmVersion: string;
  cwd: string;
  timestamp: string;
}

async function collectSystemState(): Promise<SystemState> {
  const { execSync } = await import('child_process');
  
  return {
    nodeVersion: execSync('node --version').toString().trim(),
    npmVersion: execSync('npm --version').toString().trim(),
    cwd: process.cwd(),
    timestamp: new Date().toISOString(),
  };
}

const server = new Server(
  {
    name: 'system-grounding-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_system_state',
        description: 'Get current system state including Node.js version, npm version, and working directory',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'get_system_state') {
    const state = await collectSystemState();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(state, null, 2),
        },
      ],
    };
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('System Grounding MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
