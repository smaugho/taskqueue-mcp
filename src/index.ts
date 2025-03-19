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

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name } = request.params;
    const args = request.params.arguments || {};

    // For validation, ensure args is an object when expected
    if (name !== "list_projects" && name !== "list_tasks" && Object.keys(args).length === 0) {
      throw new Error("Invalid arguments: expected object with parameters");
    }

    switch (name) {
      // Project tools
      case "list_projects": {
        const result = await taskManagerServer.listProjects();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "read_project": {
        const projectId = String(args.projectId);
        if (!projectId) {
          throw new Error("Missing required parameter: projectId");
        }
        const result = await taskManagerServer.getNextTask(projectId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "create_project": {
        const initialPrompt = String(args.initialPrompt || "");
        if (!initialPrompt || !args.tasks || !Array.isArray(args.tasks)) {
          throw new Error("Missing required parameters: initialPrompt and/or tasks");
        }
        const projectPlan = args.projectPlan ? String(args.projectPlan) : undefined;
        
        const result = await taskManagerServer.createProject(
          initialPrompt,
          args.tasks,
          projectPlan
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "delete_project": {
        const projectId = String(args.projectId);
        if (!projectId) {
          throw new Error("Missing required parameter: projectId");
        }
        const projectIndex = taskManagerServer["data"].projects.findIndex((p) => p.projectId === projectId);
        if (projectIndex === -1) {
          return { 
            content: [{ type: "text", text: JSON.stringify({ status: "error", message: "Project not found" }, null, 2) }],
          };
        }
        
        taskManagerServer["data"].projects.splice(projectIndex, 1);
        await taskManagerServer["saveTasks"]();
        return { 
          content: [{ type: "text", text: JSON.stringify({ 
            status: "project_deleted", 
            message: `Project ${projectId} has been deleted.`
          }, null, 2) }],
        };
      }

      case "add_tasks_to_project": {
        const projectId = String(args.projectId);
        if (!projectId || !args.tasks || !Array.isArray(args.tasks)) {
          throw new Error("Missing required parameters: projectId and/or tasks");
        }
        const result = await taskManagerServer.addTasksToProject(projectId, args.tasks);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "finalize_project": {
        const projectId = String(args.projectId);
        if (!projectId) {
          throw new Error("Missing required parameter: projectId");
        }
        const result = await taskManagerServer.approveProjectCompletion(projectId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      // Task tools
      case "list_tasks": {
        // TODO: Implement a proper list tasks function that supports filtering
        // For now, return a nicer error message
        return {
          content: [{ type: "text", text: JSON.stringify({ 
            status: "error", 
            message: "list_tasks functionality to be implemented in future version"
          }, null, 2) }],
        };
      }

      case "read_task": {
        const taskId = String(args.taskId);
        if (!taskId) {
          throw new Error("Missing required parameter: taskId");
        }
        const result = await taskManagerServer.openTaskDetails(taskId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "create_task": {
        const projectId = String(args.projectId);
        const title = String(args.title || "");
        const description = String(args.description || "");
        
        if (!projectId || !title || !description) {
          throw new Error("Missing required parameters: projectId, title, and/or description");
        }
        
        const result = await taskManagerServer.addTasksToProject(projectId, [{
          title,
          description
        }]);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "update_task": {
        const projectId = String(args.projectId);
        const taskId = String(args.taskId);
        
        if (!projectId || !taskId) {
          throw new Error("Missing required parameters: projectId and/or taskId");
        }
        
        const proj = taskManagerServer["data"].projects.find((p) => p.projectId === projectId);
        if (!proj) {
          return { 
            content: [{ type: "text", text: JSON.stringify({ 
              status: "error", 
              message: `Project not found: ${projectId}` 
            }, null, 2) }],
          };
        }
        
        const task = proj.tasks.find((t) => t.id === taskId);
        if (!task) {
          return { 
            content: [{ type: "text", text: JSON.stringify({ 
              status: "error", 
              message: `Task not found: ${taskId} in project ${projectId}` 
            }, null, 2) }],
          };
        }
        
        // Skip update if approved
        if (task.approved) {
          return { 
            content: [{ type: "text", text: JSON.stringify({ 
              status: "error", 
              message: `Cannot update an approved task: ${taskId}` 
            }, null, 2) }],
          };
        }
        
        // Validate status if provided
        const status = args.status as "not started" | "in progress" | "done" | undefined;
        
        // Validate conditional requirement: completedDetails if status is 'done'
        if (status === "done" && !args.completedDetails) {
          return { 
            content: [{ type: "text", text: JSON.stringify({ 
              status: "error", 
              message: "completedDetails is required when setting status to 'done'" 
            }, null, 2) }],
          };
        }
        
        // Handle status transitions
        if (status && task.status !== status) {
          // Check if this is a valid transition
          const validNextStates = {
            "not started": ["in progress"],
            "in progress": ["done", "not started"],
            "done": ["in progress"]
          };
          
          const allowedTransitions = validNextStates[task.status] || [];
          if (!allowedTransitions.includes(status)) {
            return {
              content: [{ type: "text", text: JSON.stringify({
                status: "error",
                message: `Invalid status transition from '${task.status}' to '${status}'. Allowed transitions: ${allowedTransitions.join(", ")}`
              }, null, 2) }],
            };
          }
        }
        
        // Apply updates
        const updates: { title?: string; description?: string } = {};
        if (args.title !== undefined) updates.title = String(args.title);
        if (args.description !== undefined) updates.description = String(args.description);
        
        const result = await taskManagerServer.updateTask(projectId, taskId, updates);
        
        // Additionally set status and completedDetails if provided
        if (status !== undefined) {
          task.status = status;
          if (status === "done" && args.completedDetails) {
            task.completedDetails = String(args.completedDetails);
          }
          await taskManagerServer["saveTasks"]();
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "delete_task": {
        const projectId = String(args.projectId);
        const taskId = String(args.taskId);
        
        if (!projectId || !taskId) {
          throw new Error("Missing required parameters: projectId and/or taskId");
        }
        const result = await taskManagerServer.deleteTask(projectId, taskId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "approve_task": {
        const projectId = String(args.projectId);
        const taskId = String(args.taskId);
        
        if (!projectId || !taskId) {
          throw new Error("Missing required parameters: projectId and/or taskId");
        }
        const result = await taskManagerServer.approveTaskCompletion(projectId, taskId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_next_task": {
        const projectId = String(args.projectId);
        if (!projectId) {
          throw new Error("Missing required parameter: projectId");
        }
        const result = await taskManagerServer.getNextTask(projectId);
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