import { TaskManager } from "./TaskManager.js";

/**
 * Interface defining the contract for tool executors.
 * Each tool executor is responsible for executing a specific tool's logic
 * and handling its input validation.
 */
interface ToolExecutor {
  /** The name of the tool this executor handles */
  name: string;
  
  /**
   * Executes the tool's logic with the given arguments
   * @param taskManager The TaskManager instance to use for task-related operations
   * @param args The arguments passed to the tool as a key-value record
   * @returns A promise that resolves to the raw data from TaskManager
   */
  execute: (
    taskManager: TaskManager,
    args: Record<string, unknown>
  ) => Promise<unknown>;
}

// ---------------------- UTILITY FUNCTIONS ----------------------

/**
 * Throws a JSON-RPC error if a required parameter is not present or not a string.
 */
function validateRequiredStringParam(param: unknown, paramName: string): string {
  if (typeof param !== "string" || !param) {
    const message = `Invalid or missing required parameter: ${paramName} (Expected string)`;
    const error = new Error(message);
    // Tag as a protocol error (Invalid Params)
    (error as any).jsonRpcCode = -32602;
    throw error;
  }
  return param;
}

/**
 * Validates that a project ID parameter exists and is a string.
 */
function validateProjectId(projectId: unknown): string {
  return validateRequiredStringParam(projectId, "projectId");
}

/**
 * Validates that a task ID parameter exists and is a string.
 */
function validateTaskId(taskId: unknown): string {
  return validateRequiredStringParam(taskId, "taskId");
}

/**
 * Throws a JSON-RPC error if tasks is not defined or not an array.
 */
function validateTaskList(tasks: unknown): void {
  if (!Array.isArray(tasks)) {
    const message = "Invalid or missing required parameter: tasks (Expected array)";
    const error = new Error(message);
    // Tag as a protocol error (Invalid Params)
    (error as any).jsonRpcCode = -32602;
    throw error;
  }
}

/**
 * Validates an optional "state" parameter against the allowed states.
 */
function validateOptionalStateParam(
  state: unknown,
  validStates: Array<string>
): string | undefined {
  if (state === undefined) return undefined;
  if (typeof state === "string" && validStates.includes(state)) return state;
  const message = `Invalid state parameter. Must be one of: ${validStates.join(", ")}`;
  const error = new Error(message);
  // Tag as a protocol error (Invalid Params)
  (error as any).jsonRpcCode = -32602;
  throw error;
}

/**
 * Validates an array of task objects, ensuring each has required fields.
 */
function validateTaskObjects(
  tasks: unknown,
  errorPrefix?: string
): Array<{
  title: string;
  description: string;
  toolRecommendations?: string;
  ruleRecommendations?: string;
}> {
  validateTaskList(tasks);
  const taskArray = tasks as Array<unknown>;

  return taskArray.map((task, index) => {
    if (!task || typeof task !== "object") {
      const message = `${errorPrefix || "Task"} at index ${index} must be an object`;
      const error = new Error(message);
      // Tag as a protocol error (Invalid Params)
      (error as any).jsonRpcCode = -32602;
      throw error;
    }

    const t = task as Record<string, unknown>;
    const title = validateRequiredStringParam(t.title, `title in task at index ${index}`);
    const description = validateRequiredStringParam(t.description, `description in task at index ${index}`);

    return {
      title,
      description,
      toolRecommendations: t.toolRecommendations ? String(t.toolRecommendations) : undefined,
      ruleRecommendations: t.ruleRecommendations ? String(t.ruleRecommendations) : undefined,
    };
  });
}

// ---------------------- TOOL EXECUTOR MAP ----------------------

export const toolExecutorMap: Map<string, ToolExecutor> = new Map();

// ---------------------- TOOL EXECUTORS ----------------------

/**
 * Tool executor for listing projects with optional state filtering
 */
const listProjectsToolExecutor: ToolExecutor = {
  name: "list_projects",
  async execute(taskManager, args) {
    // 1. Argument Validation
    const state = validateOptionalStateParam(args.state, [
      "open",
      "pending_approval",
      "completed",
      "all",
    ]);

    // 2. Core Logic Execution
    const resultData = await taskManager.listProjects(state as any);

    // 3. Return raw success data
    return resultData;
  },
};
toolExecutorMap.set(listProjectsToolExecutor.name, listProjectsToolExecutor);

/**
 * Tool executor for creating new projects with tasks
 */
const createProjectToolExecutor: ToolExecutor = {
  name: "create_project",
  async execute(taskManager, args) {
    // 1. Argument Validation (throws tagged Error for protocol errors)
    const initialPrompt = validateRequiredStringParam(args.initialPrompt, "initialPrompt");
    const validatedTasks = validateTaskObjects(args.tasks); // Throws tagged error if invalid
    const projectPlan = args.projectPlan !== undefined ? String(args.projectPlan) : undefined;
    const autoApprove = args.autoApprove === true;

    if (args.projectPlan !== undefined && typeof args.projectPlan !== 'string') {
      const error = new Error("Invalid type for optional parameter 'projectPlan' (Expected string)");
      (error as any).jsonRpcCode = -32602;
      throw error;
    }
    if (args.autoApprove !== undefined && typeof args.autoApprove !== 'boolean') {
      const error = new Error("Invalid type for optional parameter 'autoApprove' (Expected boolean)");
      (error as any).jsonRpcCode = -32602;
      throw error;
    }

    // 2. Core Logic Execution (Can throw *untagged* errors for execution failures)
    // TaskManager now returns raw data or throws its internal errors
    const resultData = await taskManager.createProject(
      initialPrompt,
      validatedTasks,
      projectPlan,
      autoApprove
    );

    // 3. Return raw success data - NO try/catch or formatting here
    return resultData;
  },
};
toolExecutorMap.set(createProjectToolExecutor.name, createProjectToolExecutor);

/**
 * Tool executor for generating project plans using an LLM
 */
const generateProjectPlanToolExecutor: ToolExecutor = {
  name: "generate_project_plan",
  async execute(taskManager, args) {
    // 1. Argument Validation
    const prompt = validateRequiredStringParam(args.prompt, "prompt");
    const provider = validateRequiredStringParam(args.provider, "provider");
    const model = validateRequiredStringParam(args.model, "model");

    // Validate provider is one of the allowed values
    if (!["openai", "google", "deepseek"].includes(provider)) {
      const error = new Error(`Invalid provider: ${provider}. Must be one of: openai, google, deepseek`);
      (error as any).jsonRpcCode = -32602;
      throw error;
    }

    // Check that the corresponding API key is set
    const envKey = `${provider.toUpperCase()}_API_KEY`;
    if (!process.env[envKey]) {
      const error = new Error(`Missing ${envKey} environment variable required for ${provider}`);
      (error as any).jsonRpcCode = -32602;
      throw error;
    }

    // Validate optional attachments
    let attachments: string[] = [];
    if (args.attachments !== undefined) {
      if (!Array.isArray(args.attachments)) {
        const error = new Error("Invalid attachments: must be an array of strings");
        (error as any).jsonRpcCode = -32602;
        throw error;
      }
      attachments = args.attachments.map((att, index) => {
        if (typeof att !== "string") {
          const error = new Error(`Invalid attachment at index ${index}: must be a string`);
          (error as any).jsonRpcCode = -32602;
          throw error;
        }
        return att;
      });
    }

    // 2. Core Logic Execution
    const resultData = await taskManager.generateProjectPlan({
      prompt,
      provider,
      model,
      attachments,
    });

    // 3. Return raw success data
    return resultData;
  },
};
toolExecutorMap.set(generateProjectPlanToolExecutor.name, generateProjectPlanToolExecutor);

/**
 * Tool executor for getting the next task in a project
 */
const getNextTaskToolExecutor: ToolExecutor = {
  name: "get_next_task",
  async execute(taskManager, args) {
    // 1. Argument Validation
    const projectId = validateProjectId(args.projectId);

    // 2. Core Logic Execution
    const resultData = await taskManager.getNextTask(projectId);

    // 3. Return raw success data
    return resultData;
  },
};
toolExecutorMap.set(getNextTaskToolExecutor.name, getNextTaskToolExecutor);

/**
 * Tool executor for updating a task
 */
const updateTaskToolExecutor: ToolExecutor = {
  name: "update_task",
  async execute(taskManager, args) {
    // 1. Argument Validation
    const projectId = validateProjectId(args.projectId);
    const taskId = validateTaskId(args.taskId);

    const updates: Record<string, string> = {};

    // Optional fields
    if (args.title !== undefined) {
      updates.title = validateRequiredStringParam(args.title, "title");
    }
    if (args.description !== undefined) {
      updates.description = validateRequiredStringParam(args.description, "description");
    }
    if (args.toolRecommendations !== undefined) {
      if (typeof args.toolRecommendations !== "string") {
        const error = new Error("Invalid toolRecommendations: must be a string");
        (error as any).jsonRpcCode = -32602;
        throw error;
      }
      updates.toolRecommendations = args.toolRecommendations;
    }
    if (args.ruleRecommendations !== undefined) {
      if (typeof args.ruleRecommendations !== "string") {
        const error = new Error("Invalid ruleRecommendations: must be a string");
        (error as any).jsonRpcCode = -32602;
        throw error;
      }
      updates.ruleRecommendations = args.ruleRecommendations;
    }

    // Status transitions
    if (args.status !== undefined) {
      const status = args.status;
      if (
        typeof status !== "string" ||
        !["not started", "in progress", "done"].includes(status)
      ) {
        const error = new Error("Invalid status: must be one of 'not started', 'in progress', 'done'");
        (error as any).jsonRpcCode = -32602;
        throw error;
      }
      if (status === "done") {
        updates.completedDetails = validateRequiredStringParam(
          args.completedDetails,
          "completedDetails (required when status = 'done')"
        );
      }
      updates.status = status;
    }

    // 2. Core Logic Execution
    const resultData = await taskManager.updateTask(projectId, taskId, updates);

    // 3. Return raw success data
    return resultData;
  },
};
toolExecutorMap.set(updateTaskToolExecutor.name, updateTaskToolExecutor);

/**
 * Tool executor for reading project details
 */
const readProjectToolExecutor: ToolExecutor = {
  name: "read_project",
  async execute(taskManager, args) {
    // 1. Argument Validation
    const projectId = validateProjectId(args.projectId);

    // 2. Core Logic Execution
    const resultData = await taskManager.readProject(projectId);

    // 3. Return raw success data
    return resultData;
  },
};
toolExecutorMap.set(readProjectToolExecutor.name, readProjectToolExecutor);

/**
 * Tool executor for deleting projects
 */
const deleteProjectToolExecutor: ToolExecutor = {
  name: "delete_project",
  async execute(taskManager, args) {
    // 1. Argument Validation
    const projectId = validateProjectId(args.projectId);

    // 2. Core Logic Execution
    const projectIndex = taskManager["data"].projects.findIndex(
      (p) => p.projectId === projectId
    );
    if (projectIndex === -1) {
      return {
        status: "error",
        message: "Project not found",
      };
    }

    // Remove project and save
    taskManager["data"].projects.splice(projectIndex, 1);
    await taskManager["saveTasks"]();

    // 3. Return raw success data
    return {
      status: "project_deleted",
      message: `Project ${projectId} has been deleted.`,
    };
  },
};
toolExecutorMap.set(deleteProjectToolExecutor.name, deleteProjectToolExecutor);

/**
 * Tool executor for adding tasks to a project
 */
const addTasksToProjectToolExecutor: ToolExecutor = {
  name: "add_tasks_to_project",
  async execute(taskManager, args) {
    // 1. Argument Validation
    const projectId = validateProjectId(args.projectId);
    const tasks = validateTaskObjects(args.tasks);

    // 2. Core Logic Execution
    const resultData = await taskManager.addTasksToProject(projectId, tasks);

    // 3. Return raw success data
    return resultData;
  },
};
toolExecutorMap.set(addTasksToProjectToolExecutor.name, addTasksToProjectToolExecutor);

/**
 * Tool executor for finalizing (completing) projects
 */
const finalizeProjectToolExecutor: ToolExecutor = {
  name: "finalize_project",
  async execute(taskManager, args) {
    // 1. Argument Validation
    const projectId = validateProjectId(args.projectId);

    // 2. Core Logic Execution
    const resultData = await taskManager.approveProjectCompletion(projectId);

    // 3. Return raw success data
    return resultData;
  },
};
toolExecutorMap.set(finalizeProjectToolExecutor.name, finalizeProjectToolExecutor);

/**
 * Tool executor for listing tasks with optional projectId and state
 */
const listTasksToolExecutor: ToolExecutor = {
  name: "list_tasks",
  async execute(taskManager, args) {
    // 1. Argument Validation
    const projectId = args.projectId !== undefined ? validateProjectId(args.projectId) : undefined;
    const state = validateOptionalStateParam(args.state, [
      "open",
      "pending_approval",
      "completed",
      "all",
    ]);

    // 2. Core Logic Execution
    const resultData = await taskManager.listTasks(projectId, state as any);

    // 3. Return raw success data
    return resultData;
  },
};
toolExecutorMap.set(listTasksToolExecutor.name, listTasksToolExecutor);

/**
 * Tool executor for reading task details
 */
const readTaskToolExecutor: ToolExecutor = {
  name: "read_task",
  async execute(taskManager, args) {
    // 1. Argument Validation
    const taskId = validateTaskId(args.taskId);

    // 2. Core Logic Execution
    const resultData = await taskManager.openTaskDetails(taskId);

    // 3. Return raw success data
    return resultData;
  },
};
toolExecutorMap.set(readTaskToolExecutor.name, readTaskToolExecutor);

/**
 * Tool executor for creating an individual task in a project
 */
const createTaskToolExecutor: ToolExecutor = {
  name: "create_task",
  async execute(taskManager, args) {
    // 1. Argument Validation
    const projectId = validateProjectId(args.projectId);
    const title = validateRequiredStringParam(args.title, "title");
    const description = validateRequiredStringParam(args.description, "description");

    if (args.toolRecommendations !== undefined && typeof args.toolRecommendations !== "string") {
      const error = new Error("Invalid type for optional parameter 'toolRecommendations' (Expected string)");
      (error as any).jsonRpcCode = -32602;
      throw error;
    }
    if (args.ruleRecommendations !== undefined && typeof args.ruleRecommendations !== "string") {
      const error = new Error("Invalid type for optional parameter 'ruleRecommendations' (Expected string)");
      (error as any).jsonRpcCode = -32602;
      throw error;
    }

    const singleTask = {
      title,
      description,
      toolRecommendations: args.toolRecommendations ? String(args.toolRecommendations) : undefined,
      ruleRecommendations: args.ruleRecommendations ? String(args.ruleRecommendations) : undefined,
    };

    // 2. Core Logic Execution
    const resultData = await taskManager.addTasksToProject(projectId, [singleTask]);

    // 3. Return raw success data
    return resultData;
  },
};
toolExecutorMap.set(createTaskToolExecutor.name, createTaskToolExecutor);

/**
 * Tool executor for deleting tasks
 */
const deleteTaskToolExecutor: ToolExecutor = {
  name: "delete_task",
  async execute(taskManager, args) {
    // 1. Argument Validation
    const projectId = validateProjectId(args.projectId);
    const taskId = validateTaskId(args.taskId);

    // 2. Core Logic Execution
    const resultData = await taskManager.deleteTask(projectId, taskId);

    // 3. Return raw success data
    return resultData;
  },
};
toolExecutorMap.set(deleteTaskToolExecutor.name, deleteTaskToolExecutor);

/**
 * Tool executor for approving completed tasks
 */
const approveTaskToolExecutor: ToolExecutor = {
  name: "approve_task",
  async execute(taskManager, args) {
    // 1. Argument Validation
    const projectId = validateProjectId(args.projectId);
    const taskId = validateTaskId(args.taskId);

    // 2. Core Logic Execution
    const resultData = await taskManager.approveTaskCompletion(projectId, taskId);

    // 3. Return raw success data
    return resultData;
  },
};
toolExecutorMap.set(approveTaskToolExecutor.name, approveTaskToolExecutor);