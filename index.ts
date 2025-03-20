#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod";

import { TaskManagerServer } from "./src/server/TaskManagerServer.js";
import { TaskState } from "./src/types/index.js";

const DEFAULT_PATH = path.join(os.homedir(), "Documents", "tasks.json");
const TASK_FILE_PATH = process.env.TASK_MANAGER_FILE_PATH || DEFAULT_PATH;

// Initialize the server
const server = new McpServer({
  name: "task-manager-server",
  version: "1.0.6"
});

const taskManager = new TaskManagerServer();

// Define our schemas
const TaskSchema = z.object({
  title: z.string(),
  description: z.string(),
  toolRecommendations: z.string().optional(),
  ruleRecommendations: z.string().optional()
});

type Task = z.infer<typeof TaskSchema>;

// Project tools
server.tool(
  "list_projects",
  {
    state: z.enum(["open", "pending_approval", "completed", "all"]).optional()
  },
  async ({ state }: { state?: TaskState }) => {
    const result = await taskManager.listProjects(state);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.tool(
  "read_project",
  {
    projectId: z.string()
  },
  async ({ projectId }: { projectId: string }) => {
    const result = await taskManager.openTaskDetails(projectId);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.tool(
  "create_project",
  {
    initialPrompt: z.string(),
    projectPlan: z.string().optional(),
    tasks: z.array(TaskSchema)
  },
  async ({ initialPrompt, tasks, projectPlan }: { 
    initialPrompt: string;
    tasks: Task[];
    projectPlan?: string;
  }) => {
    const result = await taskManager.createProject(initialPrompt, tasks, projectPlan);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.tool(
  "delete_project",
  {
    projectId: z.string()
  },
  async ({ projectId }: { projectId: string }) => {
    const projectIndex = taskManager["data"].projects.findIndex(
      (p) => p.projectId === projectId
    );
        if (projectIndex === -1) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Project not found" }) }] };
    }

    taskManager["data"].projects.splice(projectIndex, 1);
    await taskManager["saveTasks"]();
    return { content: [{ type: "text", text: JSON.stringify({ message: "Project has been deleted" }) }] };
  }
);

server.tool(
  "add_tasks_to_project",
  {
    projectId: z.string(),
    tasks: z.array(TaskSchema)
  },
  async ({ projectId, tasks }: { projectId: string; tasks: Task[] }) => {
    const result = await taskManager.addTasksToProject(projectId, tasks);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.tool(
  "finalize_project",
  {
    projectId: z.string()
  },
  async ({ projectId }: { projectId: string }) => {
    const result = await taskManager.approveProjectCompletion(projectId);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

      // Task tools
server.tool(
  "list_tasks",
  {
    projectId: z.string().optional(),
    state: z.enum(["open", "pending_approval", "completed", "all"]).optional()
  },
  async ({ projectId, state }: { projectId?: string; state?: TaskState }) => {
    const result = await taskManager.listTasks(projectId, state);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.tool(
  "read_task",
  {
    taskId: z.string()
  },
  async ({ taskId }: { taskId: string }) => {
    const result = await taskManager.openTaskDetails(taskId);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.tool(
  "create_task",
  {
    projectId: z.string(),
    title: z.string(),
    description: z.string(),
    toolRecommendations: z.string().optional(),
    ruleRecommendations: z.string().optional()
  },
  async ({ projectId, title, description, toolRecommendations, ruleRecommendations }: {
    projectId: string;
    title: string;
    description: string;
    toolRecommendations?: string;
    ruleRecommendations?: string;
  }) => {
    const result = await taskManager.addTasksToProject(projectId, [
      { title, description, toolRecommendations, ruleRecommendations }
    ]);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.tool(
  "update_task",
  {
    projectId: z.string(),
    taskId: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["not started", "in progress", "done"]).optional(),
    completedDetails: z.string().optional(),
    toolRecommendations: z.string().optional(),
    ruleRecommendations: z.string().optional()
  },
  async ({ projectId, taskId, title, description, status, completedDetails, toolRecommendations, ruleRecommendations }: {
    projectId: string;
    taskId: string;
    title?: string;
    description?: string;
    status?: "not started" | "in progress" | "done";
    completedDetails?: string;
    toolRecommendations?: string;
    ruleRecommendations?: string;
  }) => {
    // Handle status changes first
    if (status === "done") {
      if (!completedDetails) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "completedDetails is required when setting status to 'done'" }) }] };
      }
      await taskManager.markTaskDone(projectId, taskId, completedDetails);
    }

    // Update other fields if provided
    const updates: {
      title?: string;
      description?: string;
      toolRecommendations?: string;
      ruleRecommendations?: string;
    } = {};

    if (title) updates.title = title;
    if (description) updates.description = description;
    if (toolRecommendations) updates.toolRecommendations = toolRecommendations;
    if (ruleRecommendations) updates.ruleRecommendations = ruleRecommendations;

    if (Object.keys(updates).length > 0) {
      const result = await taskManager.updateTask(projectId, taskId, updates);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    return { content: [{ type: "text", text: JSON.stringify({ message: "Task updated" }) }] };
  }
);

server.tool(
  "delete_task",
  {
    projectId: z.string(),
    taskId: z.string()
  },
  async ({ projectId, taskId }: { projectId: string; taskId: string }) => {
    const result = await taskManager.deleteTask(projectId, taskId);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.tool(
  "approve_task",
  {
    projectId: z.string(),
    taskId: z.string()
  },
  async ({ projectId, taskId }: { projectId: string; taskId: string }) => {
    const result = await taskManager.approveTaskCompletion(projectId, taskId);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.tool(
  "get_next_task",
  {
    projectId: z.string()
  },
  async ({ projectId }: { projectId: string }) => {
    const result = await taskManager.getNextTask(projectId);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

// Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
