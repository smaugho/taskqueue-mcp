#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { TaskManagerServer } from "./src/server/TaskManagerServer.js";
import { ALL_TOOLS } from "./src/types/tools.js";

// Initialize the server
const server = new McpServer({
  name: "task-manager-server",
  version: "1.0.0"
});

const taskManager = new TaskManagerServer();

// Register all tools with their predefined schemas and descriptions
for (const tool of ALL_TOOLS) {
  // Convert JSON schema properties to Zod schema
  const zodSchema: { [key: string]: z.ZodType<any> } = {};
  
  if (tool.inputSchema.properties) {
    for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
      if (typeof prop === 'object' && prop !== null) {
        const schemaProp = prop as { type: string; enum?: string[]; description?: string };
        if (schemaProp.type === "string") {
          zodSchema[key] = schemaProp.enum 
            ? z.enum(schemaProp.enum as [string, ...string[]])
            : z.string();
          if (!Array.isArray(tool.inputSchema.required) || !tool.inputSchema.required.includes(key)) {
            zodSchema[key] = zodSchema[key].optional();
          }
        }
      }
    }
  }

  server.tool(
    tool.name,
    zodSchema,
    async (params: any) => {
      let result;
      switch (tool.name) {
        case "list_projects":
          result = await taskManager.listProjects(params.state);
          break;
        case "read_project":
          result = await taskManager.openTaskDetails(params.projectId);
          break;
        case "create_project":
          result = await taskManager.createProject(params.initialPrompt, params.tasks, params.projectPlan);
          break;
        case "delete_project":
          const projectIndex = taskManager["data"].projects.findIndex(
            (p) => p.projectId === params.projectId
          );
          if (projectIndex === -1) {
            return { content: [{ type: "text", text: JSON.stringify({ error: "Project not found" }) }] };
          }
          taskManager["data"].projects.splice(projectIndex, 1);
          await taskManager["saveTasks"]();
          result = { message: "Project has been deleted" };
          break;
        case "add_tasks_to_project":
          result = await taskManager.addTasksToProject(params.projectId, params.tasks);
          break;
        case "finalize_project":
          result = await taskManager.approveProjectCompletion(params.projectId);
          break;
        case "list_tasks":
          result = await taskManager.listTasks(params.projectId, params.state);
          break;
        case "read_task":
          result = await taskManager.openTaskDetails(params.taskId);
          break;
        case "create_task":
          result = await taskManager.addTasksToProject(params.projectId, [{
            title: params.title,
            description: params.description,
            toolRecommendations: params.toolRecommendations,
            ruleRecommendations: params.ruleRecommendations
          }]);
          break;
        case "update_task":
          if (params.status === "done") {
            if (!params.completedDetails) {
              return { content: [{ type: "text", text: JSON.stringify({ error: "completedDetails is required when setting status to 'done'" }) }] };
            }
            await taskManager.markTaskDone(params.projectId, params.taskId, params.completedDetails);
          }
          const updates: any = {};
          if (params.title) updates.title = params.title;
          if (params.description) updates.description = params.description;
          if (params.toolRecommendations) updates.toolRecommendations = params.toolRecommendations;
          if (params.ruleRecommendations) updates.ruleRecommendations = params.ruleRecommendations;
          if (Object.keys(updates).length > 0) {
            result = await taskManager.updateTask(params.projectId, params.taskId, updates);
          } else {
            result = { message: "Task updated" };
          }
          break;
        case "delete_task":
          result = await taskManager.deleteTask(params.projectId, params.taskId);
          break;
        case "approve_task":
          result = await taskManager.approveTaskCompletion(params.projectId, params.taskId);
          break;
        case "get_next_task":
          result = await taskManager.getNextTask(params.projectId);
          break;
      }
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );
}

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
