import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { TaskManager } from "./TaskManager.js";
import { ErrorCode } from "../types/index.js";
import { createError, normalizeError } from "../utils/errors.js";

// ---------------------- PROJECT TOOLS ----------------------

// List Projects
const listProjectsTool: Tool = {
  name: "list_projects",
  description: "List all projects in the system and their basic information (ID, initial prompt, task counts), optionally filtered by state (open, pending_approval, completed, all).",
  inputSchema: {
    type: "object",
    properties: {
      state: {
        type: "string",
        enum: ["open", "pending_approval", "completed", "all"],
        description: "Filter projects by state. 'open' (any incomplete task), 'pending_approval' (any tasks awaiting approval), 'completed' (all tasks done and approved), or 'all' to skip filtering.",
      },
    },
    required: [],
  },
};

// Read Project
const readProjectTool: Tool = {
  name: "read_project",
  description: "Read all information for a given project, by its ID, including its tasks' statuses.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "The ID of the project to read (e.g., proj-1).",
      },
    },
    required: ["projectId"],
  },
};

// Create Project
const createProjectTool: Tool = {
  name: "create_project",
  description: "Create a new project with an initial prompt and a list of tasks. This is typically the first step in any workflow.",
  inputSchema: {
    type: "object",
    properties: {
      initialPrompt: {
        type: "string",
        description: "The initial prompt or goal for the project.",
      },
      projectPlan: {
        type: "string",
        description: "A more detailed plan for the project. If not provided, the initial prompt will be used.",
      },
      tasks: {
        type: "array",
        description: "An array of task objects.",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "The title of the task.",
            },
            description: {
              type: "string",
              description: "A detailed description of the task.",
            },
            toolRecommendations: {
              type: "string",
              description: "Recommendations for tools to use to complete the task.",
            },
            ruleRecommendations: {
              type: "string",
              description: "Recommendations for relevant rules to review when completing the task.",
            },
          },
          required: ["title", "description"],
        },
      },
      autoApprove: {
        type: "boolean",
        description: "If true, tasks will be automatically approved when marked as done. If false or not provided, tasks require manual approval.",
      },
    },
    required: ["initialPrompt", "tasks"],
  },
};

// Delete Project
const deleteProjectTool: Tool = {
  name: "delete_project",
  description: "Delete a project and all its associated tasks.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "The ID of the project to delete (e.g., proj-1).",
      },
    },
    required: ["projectId"],
  },
};

// Add Tasks to Project
const addTasksToProjectTool: Tool = {
  name: "add_tasks_to_project",
  description: "Add new tasks to an existing project.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "The ID of the project to add tasks to (e.g., proj-1).",
      },
      tasks: {
        type: "array",
        description: "An array of task objects to add.",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "The title of the task.",
            },
            description: {
              type: "string",
              description: "A detailed description of the task.",
            },
            toolRecommendations: {
              type: "string",
              description: "Recommendations for tools to use to complete the task.",
            },
            ruleRecommendations: {
              type: "string",
              description: "Recommendations for relevant rules to review when completing the task.",
            },
          },
          required: ["title", "description"],
        },
      },
    },
    required: ["projectId", "tasks"],
  },
};

// Finalize Project (Mark as Complete)
const finalizeProjectTool: Tool = {
  name: "finalize_project",
  description: "Mark a project as complete. Can only be called when all tasks are both done and approved. This is typically the last step in a project workflow.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "The ID of the project to finalize (e.g., proj-1).",
      },
    },
    required: ["projectId"],
  },
};

// ---------------------- TASK TOOLS ----------------------

// List Tasks
const listTasksTool: Tool = {
  name: "list_tasks",
  description: "List all tasks, optionally filtered by project ID and/or state (open, pending_approval, completed, all). Tasks may include tool and rule recommendations to guide their completion.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "The ID of the project to list tasks from. If omitted, list all tasks.",
      },
      state: {
        type: "string",
        enum: ["open", "pending_approval", "completed", "all"],
        description: "Filter tasks by state. 'open' (not started/in progress), 'pending_approval', 'completed', or 'all' to skip filtering.",
      },
    },
    required: [], // Neither projectId nor state is required, both are optional filters
  },
};

// Read Task
const readTaskTool: Tool = {
  name: "read_task",
  description: "Get details of a specific task by its ID. The task may include toolRecommendations and ruleRecommendations fields that should be used to guide task completion.",
  inputSchema: {
    type: "object",
    properties: {
      taskId: {
        type: "string",
        description: "The ID of the task to read (e.g., task-1).",
      },
    },
    required: ["taskId"],
  },
};

// Create Task
const createTaskTool: Tool = {
  name: "create_task",
  description: "Create a new task within an existing project. You can optionally include tool and rule recommendations to guide task completion.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "The ID of the project to add the task to (e.g., proj-1).",
      },
      title: {
        type: "string",
        description: "The title of the task.",
      },
      description: {
        type: "string",
        description: "A detailed description of the task.",
      },
      toolRecommendations: {
        type: "string",
        description: "Recommendations for tools to use to complete the task.",
      },
      ruleRecommendations: {
        type: "string",
        description: "Recommendations for relevant rules to review when completing the task.",
      }
    },
    required: ["projectId", "title", "description"]
  }
};

// Update Task
const updateTaskTool: Tool = {
  name: "update_task",
  description: "Modify a task's properties. Note: (1) completedDetails are required when setting status to 'done', (2) approved tasks cannot be modified, (3) status must follow valid transitions: not started → in progress → done. You can also update tool and rule recommendations to guide task completion.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "The ID of the project containing the task (e.g., proj-1).",
      },
      taskId: {
        type: "string",
        description: "The ID of the task to update (e.g., task-1).",
      },
      title: {
        type: "string",
        description: "The new title for the task (optional).",
      },
      description: {
        type: "string",
        description: "The new description for the task (optional).",
      },
      status: {
        type: "string",
        enum: ["not started", "in progress", "done"],
        description: "The new status for the task (optional).",
      },
      completedDetails: {
        type: "string",
        description: "Details about the task completion (required if status is set to 'done').",
      },
      toolRecommendations: {
        type: "string",
        description: "Recommendations for tools to use to complete the task.",
      },
      ruleRecommendations: {
        type: "string",
        description: "Recommendations for relevant rules to review when completing the task.",
      }
    },
    required: ["projectId", "taskId"], // title, description, status are optional, but completedDetails is conditionally required
  },
};

// Delete Task
const deleteTaskTool: Tool = {
  name: "delete_task",
  description: "Remove a task from a project.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "The ID of the project containing the task (e.g., proj-1).",
      },
      taskId: {
        type: "string",
        description: "The ID of the task to delete (e.g., task-1).",
      },
    },
    required: ["projectId", "taskId"],
  },
};

// Approve Task
const approveTaskTool: Tool = {
  name: "approve_task",
  description: "Approve a completed task. Tasks must be marked as 'done' with completedDetails before approval. Note: This is a CLI-only operation that requires human intervention.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "The ID of the project containing the task (e.g., proj-1).",
      },
      taskId: {
        type: "string",
        description: "The ID of the task to approve (e.g., task-1).",
      }
    },
    required: ["projectId", "taskId"]
  }
};

// Get Next Task
const getNextTaskTool: Tool = {
  name: "get_next_task",
  description: "Get the next task to be done in a project. Returns the first non-approved task in sequence, regardless of status. The task may include toolRecommendations and ruleRecommendations fields that should be used to guide task completion.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "The ID of the project to get the next task from (e.g., proj-1).",
      },
    },
    required: ["projectId"],
  },
};

// Export all tools as an array
export const ALL_TOOLS: Tool[] = [
  listProjectsTool,
  readProjectTool,
  createProjectTool,
  deleteProjectTool,
  addTasksToProjectTool,
  finalizeProjectTool,

  listTasksTool,
  readTaskTool,
  createTaskTool,
  updateTaskTool,
  deleteTaskTool,
  approveTaskTool,
  getNextTaskTool,
];

// Error handling wrapper for tool execution
export async function executeToolWithErrorHandling(
  toolName: string,
  args: Record<string, unknown>,
  taskManager: TaskManager
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    switch (toolName) {
      case "list_projects": {
        const result = await taskManager.listProjects();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "read_project": {
        const projectId = String(args.projectId);
        if (!projectId) {
          throw createError(
            ErrorCode.MissingParameter,
            "Missing required parameter: projectId"
          );
        }
        const result = await taskManager.readProject(projectId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "create_project": {
        const initialPrompt = String(args.initialPrompt || "");
        if (!initialPrompt || !args.tasks || !Array.isArray(args.tasks)) {
          throw createError(
            ErrorCode.MissingParameter,
            "Missing required parameters: initialPrompt and/or tasks"
          );
        }
        const projectPlan = args.projectPlan ? String(args.projectPlan) : undefined;
        const autoApprove = args.autoApprove === true;
        
        const result = await taskManager.createProject(
          initialPrompt,
          args.tasks,
          projectPlan,
          autoApprove
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "delete_project": {
        const projectId = String(args.projectId);
        if (!projectId) {
          throw createError(
            ErrorCode.MissingParameter,
            "Missing required parameter: projectId"
          );
        }
        // Use the private data and saveTasks via indexing since there's no explicit delete method
        const projectIndex = taskManager["data"].projects.findIndex((p) => p.projectId === projectId);
        if (projectIndex === -1) {
          return { 
            content: [{ type: "text", text: JSON.stringify({ status: "error", message: "Project not found" }, null, 2) }],
          };
        }
        
        taskManager["data"].projects.splice(projectIndex, 1);
        await taskManager["saveTasks"]();
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
          throw createError(
            ErrorCode.MissingParameter,
            "Missing required parameters: projectId and/or tasks"
          );
        }
        const result = await taskManager.addTasksToProject(projectId, args.tasks);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "finalize_project": {
        const projectId = String(args.projectId);
        if (!projectId) {
          throw createError(
            ErrorCode.MissingParameter,
            "Missing required parameter: projectId"
          );
        }
        const result = await taskManager.approveProjectCompletion(projectId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      // Task tools
      case "list_tasks": {
        const projectId = args.projectId ? String(args.projectId) : undefined;
        const state = args.state ? String(args.state as string) : undefined;
        const result = await taskManager.listTasks(projectId, state as any);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "read_task": {
        const taskId = String(args.taskId);
        if (!taskId) {
          throw createError(
            ErrorCode.MissingParameter,
            "Missing required parameter: taskId"
          );
        }
        const result = await taskManager.openTaskDetails(taskId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "create_task": {
        const projectId = String(args.projectId);
        const title = String(args.title || "");
        const description = String(args.description || "");
        
        if (!projectId || !title || !description) {
          throw createError(
            ErrorCode.MissingParameter,
            "Missing required parameters: projectId, title, and/or description"
          );
        }
        
        const result = await taskManager.addTasksToProject(projectId, [{
          title,
          description,
          toolRecommendations: args.toolRecommendations ? String(args.toolRecommendations) : undefined,
          ruleRecommendations: args.ruleRecommendations ? String(args.ruleRecommendations) : undefined
        }]);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "update_task": {
        const projectId = String(args.projectId);
        const taskId = String(args.taskId);
        
        if (!projectId || !taskId) {
          throw createError(
            ErrorCode.MissingParameter,
            "Missing required parameters: projectId and/or taskId"
          );
        }
        
        const updates = Object.fromEntries(
          Object.entries({
            title: args.title !== undefined ? String(args.title) : undefined,
            description: args.description !== undefined ? String(args.description) : undefined,
            status: args.status !== undefined ? String(args.status) as "not started" | "in progress" | "done" : undefined,
            completedDetails: args.completedDetails !== undefined ? String(args.completedDetails) : undefined,
            toolRecommendations: args.toolRecommendations !== undefined ? String(args.toolRecommendations) : undefined,
            ruleRecommendations: args.ruleRecommendations !== undefined ? String(args.ruleRecommendations) : undefined
          }).filter(([_, value]) => value !== undefined)
        );

        const result = await taskManager.updateTask(projectId, taskId, updates);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "delete_task": {
        const projectId = String(args.projectId);
        const taskId = String(args.taskId);
        
        if (!projectId || !taskId) {
          throw createError(
            ErrorCode.MissingParameter,
            "Missing required parameters: projectId and/or taskId"
          );
        }
        const result = await taskManager.deleteTask(projectId, taskId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "approve_task": {
        const projectId = String(args.projectId);
        const taskId = String(args.taskId);
        
        if (!projectId || !taskId) {
          throw createError(
            ErrorCode.MissingParameter,
            "Missing required parameters: projectId and/or taskId"
          );
        }
        const result = await taskManager.approveTaskCompletion(projectId, taskId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_next_task": {
        const projectId = String(args.projectId);
        if (!projectId) {
          throw createError(
            ErrorCode.MissingParameter,
            "Missing required parameter: projectId"
          );
        }
        const result = await taskManager.getNextTask(projectId);
        
        // Ensure backward compatibility with integration tests
        // by adding a task property that refers to the data
        if (result.status === "next_task" && result.data) {
          return {
            content: [{ type: "text", text: JSON.stringify({
              status: "next_task",
              task: result.data,
              message: result.data.message
            }, null, 2) }],
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw createError(
          ErrorCode.InvalidArgument,
          `Unknown tool: ${toolName}`
        );
    }
  } catch (error) {
    const standardError = normalizeError(error);
    return {
      content: [{ type: "text", text: `Error: ${standardError.message}` }],
      isError: true,
    };
  }
}