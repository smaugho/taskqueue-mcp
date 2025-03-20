import { Tool } from "@modelcontextprotocol/sdk/types.js";

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
export const ALL_TOOLS = [
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