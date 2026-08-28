#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Configuration from environment variables
const GROUNDING_API_URL =
  process.env.GROUNDING_API_URL || "http://localhost:3000/api/ask";
const DEVICE_ID = process.env.DEVICE_ID || "framework-13";

// Session state to cache last context
let lastContext: GroundingResponse | null = null;

// Schema for grounding API response
interface GroundingResponse {
  answer: string;
  confidenceScore: number;
  contextProvided: string;
  staleRecords: string[];
  missingData: string[];
}

// Define the get_system_state tool
const getSystemStateTool: Tool = {
  name: "get_system_state",
  description:
    "Query the system grounding middleware to retrieve verified system state information. Use this to answer questions about installed packages, configuration files, environment variables, or running services. The response includes confidence scores indicating data freshness.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Natural language query about system state (e.g., 'What packages are installed?', 'Show me the portal config')",
      },
    },
    required: ["query"],
  },
};

// Define the get_confidence_report tool
const getConfidenceReportTool: Tool = {
  name: "get_confidence_report",
  description:
    "Returns the confidence report from the last grounding query, including confidence score, tier, stale records, and missing data. Use this to assess the reliability of previously retrieved system state information.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

// Create the MCP server
const server = new Server(
  {
    name: "system-grounding-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list_tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [getSystemStateTool, getConfidenceReportTool],
  };
});

// Handle call_tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "get_system_state") {
    const queryArgs = z.object({
      query: z.string(),
    });

    const parsed = queryArgs.parse(args);
    const { query } = parsed;

    try {
      // Call the grounding middleware API
      const response = await fetch(GROUNDING_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": DEVICE_ID,
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`Grounding API returned status ${response.status}`);
      }

      const result = await response.json() as GroundingResponse;

      // Cache the context for later retrieval
      lastContext = result;

      // Format the response for the LLM with clear sections
      let formattedResponse = "";

      // Add confidence indicator
      const confidenceTier =
        result.confidenceScore > 0.8
          ? "VERIFIED"
          : result.confidenceScore > 0.5
            ? "PARTIAL"
            : "UNGROUNDED";

      formattedResponse += `**CONFIDENCE: ${confidenceTier}** (score: ${result.confidenceScore.toFixed(2)})\n\n`;

      // Add verified state section
      if (result.contextProvided) {
        formattedResponse += `[VERIFIED STATE]\n${result.contextProvided}\n\n`;
      }

      // Add stale data warning if present
      if (result.staleRecords.length > 0) {
        formattedResponse += `[STALE DATA WARNING]\nThe following records may be outdated (not updated within their staleness threshold):\n`;
        result.staleRecords.forEach((record) => {
          formattedResponse += `- ${record}\n`;
        });
        formattedResponse += "\n";
      }

      // Add missing data warning if present
      if (result.missingData.length > 0) {
        formattedResponse += `[MISSING DATA]\nThe following data could not be found in the system state:\n`;
        result.missingData.forEach((item) => {
          formattedResponse += `- ${item}\n`;
        });
        formattedResponse += "\n";
      }

      // Add the LLM answer
      formattedResponse += `[ANSWER]\n${result.answer}\n\n`;

      // Add instruction to LLM about using only verified state
      formattedResponse += `**IMPORTANT**: Only provide answers based on the verified state above. If data is marked as STALE or MISSING, explicitly state this limitation to the user. Do not speculate or provide information that is not grounded in the verified system state.`;

      return {
        content: [
          {
            type: "text",
            text: formattedResponse,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      return {
        content: [
          {
            type: "text",
            text: `Error querying grounding middleware: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === "get_confidence_report") {
    if (!lastContext) {
      return {
        content: [
          {
            type: "text",
            text: "No previous grounding query has been made. Use get_system_state first to retrieve system state information.",
          },
        ],
        isError: true,
      };
    }

    // Calculate confidence tier
    const confidenceTier =
      lastContext.confidenceScore > 0.8
        ? "VERIFIED"
        : lastContext.confidenceScore > 0.5
          ? "PARTIAL"
          : "UNGROUNDED";

    // Return the cached context as a structured JSON report
    const report = {
      confidenceScore: lastContext.confidenceScore,
      confidenceTier,
      staleRecords: lastContext.staleRecords,
      missingData: lastContext.missingData,
      contextProvided: lastContext.contextProvided,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(report, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("System Grounding MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error starting MCP server:", error);
  process.exit(1);
});
