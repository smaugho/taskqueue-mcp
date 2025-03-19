#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";

import { TaskManagerServer } from "./server/TaskManagerServer.js";
import { ALL_TOOLS } from "./types/tools.js";
import { ProjectToolSchema, TaskToolSchema, ProjectActionSchema, TaskActionSchema } from "./types/index.js";

const DEFAULT_PATH = path.join(os.homedir(), "Documents", "tasks.json");
const TASK_FILE_PATH = process.env.TASK_MANAGER_FILE_PATH || DEFAULT_PATH;

// Initialize the server
const server = new Server(
  {
    name: "task-manager-server",
    version: "3.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const taskManagerServer = new TaskManagerServer();

// Set up request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALL_TOOLS,
}));

// Create specific schemas for CallToolRequestSchema to validate against our tool schemas
const ProjectToolCallSchema = CallToolRequestSchema.extend({
  params: z.object({
    name: z.literal("project"),
    arguments: z.object({
      action: z.string(),
      arguments: z.any()
    })
  })
});

const TaskToolCallSchema = CallToolRequestSchema.extend({
  params: z.object({
    name: z.literal("task"),
    arguments: z.object({
      action: z.string(),
      arguments: z.any()
    })
  })
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "project": {
        // Validate request against the schema
        const validationResult = ProjectToolCallSchema.safeParse(request);
        if (!validationResult.success) {
          throw new Error(`Invalid request: ${validationResult.error.message}`);
        }

        // Further validate the action and arguments
        if (!args || typeof args !== 'object') {
          throw new Error("Invalid arguments: expected object");
        }

        const { action, arguments: actionArgs } = args;
        if (!action || typeof action !== 'string') {
          throw new Error("Missing or invalid 'action' field");
        }

        // Validate against the specific action schema
        const actionSchema = ProjectActionSchema.safeParse({ action, arguments: actionArgs });
        if (!actionSchema.success) {
          throw new Error(`Invalid action parameters: ${actionSchema.error.message}`);
        }

        const result = await taskManagerServer.handleProjectTool(action, actionArgs);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "task": {
        // Validate request against the schema
        const validationResult = TaskToolCallSchema.safeParse(request);
        if (!validationResult.success) {
          throw new Error(`Invalid request: ${validationResult.error.message}`);
        }

        // Further validate the action and arguments
        if (!args || typeof args !== 'object') {
          throw new Error("Invalid arguments: expected object");
        }

        const { action, arguments: actionArgs } = args;
        if (!action || typeof action !== 'string') {
          throw new Error("Missing or invalid 'action' field");
        }

        // Validate against the specific action schema
        const actionSchema = TaskActionSchema.safeParse({ action, arguments: actionArgs });
        if (!actionSchema.success) {
          throw new Error(`Invalid action parameters: ${actionSchema.error.message}`);
        }

        const result = await taskManagerServer.handleTaskTool(action, actionArgs);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start the server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Task Manager MCP Server v3.0.0 running. Saving tasks at: ${TASK_FILE_PATH}`
  );
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
}); 