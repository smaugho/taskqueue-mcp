import { Tool } from "@modelcontextprotocol/sdk/types.js";

// Helper function to create tools with similar properties
function createTool(
  name: string,
  description: string,
  properties: Record<string, any>,
  required: string[] = []
): Tool {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties,
      required,
    },
  };
}

// Project tool definition
export const PROJECT_TOOL = createTool(
  "project",
  "Manage high-level task projects with multiple actions. Available actions:\n" +
  "- list: List all projects in the system\n" +
  "- create: Create a new project with tasks\n" +
  "- delete: Remove a project\n" +
  "- add_tasks: Add new tasks to an existing project\n" +
  "- finalize: Finalize a project after all tasks are done and approved",
  {
    action: { 
      type: "string",
      enum: ["list", "create", "delete", "add_tasks", "finalize"]
    },
    arguments: {
      type: "object",
      properties: {
        // Properties vary by action, validated at runtime
      }
    }
  },
  ["action", "arguments"]
);

// Task tool definition
export const TASK_TOOL = createTool(
  "task",
  "Manage individual tasks within projects. Available actions:\n" +
  "- read: Get details of a specific task\n" +
  "- update: Modify a task's properties (title, description, status)\n" +
  "- delete: Remove a task from a project\n\n" +
  "Note: When updating a task status to 'done', completedDetails must be provided.",
  {
    action: {
      type: "string",
      enum: ["read", "update", "delete"]
    },
    arguments: {
      type: "object",
      properties: {
        // Properties vary by action, validated at runtime
      }
    }
  },
  ["action", "arguments"]
);

// Export all tools as an array for convenience
export const ALL_TOOLS = [
  PROJECT_TOOL,
  TASK_TOOL
];