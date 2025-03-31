#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { TaskManager } from "./src/server/TaskManager.js";
import { ALL_TOOLS, executeToolAndHandleErrors } from "./src/server/tools.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Create server with capabilities BEFORE setting up handlers
const server = new Server(
  {
    name: "task-manager-server",
    version: "1.3.4"
  },
  {
    capabilities: {
      tools: {
        list: true,
        call: true
      }
    }
  }
);

// Debug logging
console.error('Server starting with env:', {
  TASK_MANAGER_FILE_PATH: process.env.TASK_MANAGER_FILE_PATH,
  NODE_ENV: process.env.NODE_ENV
});

// Create task manager instance
const taskManager = new TaskManager();

// Set up request handlers AFTER capabilities are configured
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: ALL_TOOLS
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Directly call the handler. It either returns a result object (success or isError:true)
  // OR it throws a tagged protocol error.
  return await executeToolAndHandleErrors(
    request.params.name,
    request.params.arguments || {},
    taskManager
  );
  // SDK automatically handles:
  // - Wrapping the returned value (success data or isError:true object) in `result: { ... }`
  // - Catching re-thrown protocol errors and formatting the top-level `error: { ... }`
});

// Start the server
const transport = new StdioServerTransport();
server.connect(transport);
