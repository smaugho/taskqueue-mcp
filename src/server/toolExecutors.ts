import { TaskManager } from "./TaskManager.js";
import { ErrorCode } from "../types/index.js";
import { createError } from "../utils/errors.js";

/**
 * Interface defining the contract for tool executors.
 * Each tool executor is responsible for executing a specific tool's logic
 * and handling its input validation and response formatting.
 */
interface ToolExecutor {
  /** The name of the tool this executor handles */
  name: string;
  
  /**
   * Executes the tool's logic with the given arguments
   * @param taskManager The TaskManager instance to use for task-related operations
   * @param args The arguments passed to the tool as a key-value record
   * @returns A promise that resolves to the tool's response, containing an array of text content
   */
  execute: (
    taskManager: TaskManager,
    args: Record<string, unknown>
  ) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
}

// ---------------------- UTILITY FUNCTIONS ----------------------

/**
 * Formats any data into the standard tool response format.
 */
function formatToolResponse(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/**
 * Throws an error if a required parameter is not present or not a string.
 */
function validateRequiredStringParam(param: unknown, paramName: string): string {
  if (typeof param !== "string" || !param) {
    throw createError(ErrorCode.MissingParameter, `Missing or invalid required parameter: ${paramName}`);
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
 * Throws an error if tasks is not defined or not an array.
 */
function validateTaskList(tasks: unknown): void {
  if (!Array.isArray(tasks)) {
    throw createError(ErrorCode.MissingParameter, "Missing required parameter: tasks");
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
  throw createError(
    ErrorCode.InvalidArgument,
    `Invalid state parameter. Must be one of: ${validStates.join(", ")}`
  );
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
      throw createError(
        ErrorCode.InvalidArgument,
        `${errorPrefix || "Task"} at index ${index} must be an object.`
      );
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
    const state = validateOptionalStateParam(args.state, [
      "open",
      "pending_approval",
      "completed",
      "all",
    ]);

    const result = await taskManager.listProjects(state as any);
    return formatToolResponse(result);
  },
};
toolExecutorMap.set(listProjectsToolExecutor.name, listProjectsToolExecutor);

/**
 * Tool executor for creating new projects with tasks
 */
const createProjectToolExecutor: ToolExecutor = {
  name: "create_project",
  async execute(taskManager, args) {
    const initialPrompt = validateRequiredStringParam(args.initialPrompt, "initialPrompt");
    const validatedTasks = validateTaskObjects(args.tasks, "Task");

    const projectPlan = args.projectPlan ? String(args.projectPlan) : undefined;
    const autoApprove = args.autoApprove === true;

    const result = await taskManager.createProject(
      initialPrompt,
      validatedTasks,
      projectPlan,
      autoApprove
    );

    return formatToolResponse(result);
  },
};
toolExecutorMap.set(createProjectToolExecutor.name, createProjectToolExecutor);

/**
 * Tool executor for generating project plans using an LLM
 */
const generateProjectPlanToolExecutor: ToolExecutor = {
  name: "generate_project_plan",
  async execute(taskManager, args) {
    // Validate required parameters
    const prompt = validateRequiredStringParam(args.prompt, "prompt");
    const provider = validateRequiredStringParam(args.provider, "provider");
    const model = validateRequiredStringParam(args.model, "model");

    // Validate provider is one of the allowed values
    if (!["openai", "google", "deepseek"].includes(provider)) {
      throw createError(
        ErrorCode.InvalidArgument,
        `Invalid provider: ${provider}. Must be one of: openai, google, deepseek`
      );
    }

    // Check that the corresponding API key is set
    const envKey = `${provider.toUpperCase()}_API_KEY`;
    if (!process.env[envKey]) {
      throw createError(
        ErrorCode.ConfigurationError,
        `Missing ${envKey} environment variable required for ${provider}`
      );
    }

    // Validate optional attachments
    let attachments: string[] = [];
    if (args.attachments !== undefined) {
      if (!Array.isArray(args.attachments)) {
        throw createError(
          ErrorCode.InvalidArgument,
          "Invalid attachments: must be an array of strings"
        );
      }
      attachments = args.attachments.map((att, index) => {
        if (typeof att !== "string") {
          throw createError(
            ErrorCode.InvalidArgument,
            `Invalid attachment at index ${index}: must be a string`
          );
        }
        return att;
      });
    }

    // Call the TaskManager method to generate the plan
    const result = await taskManager.generateProjectPlan({
      prompt,
      provider,
      model,
      attachments,
    });

    return formatToolResponse(result);
  },
};
toolExecutorMap.set(generateProjectPlanToolExecutor.name, generateProjectPlanToolExecutor);

/**
 * Tool executor for getting the next task in a project
 */
const getNextTaskToolExecutor: ToolExecutor = {
  name: "get_next_task",
  async execute(taskManager, args) {
    const projectId = validateProjectId(args.projectId);
    const result = await taskManager.getNextTask(projectId);
    return formatToolResponse(result);
  },
};
toolExecutorMap.set(getNextTaskToolExecutor.name, getNextTaskToolExecutor);

/**
 * Tool executor for updating a task
 */
const updateTaskToolExecutor: ToolExecutor = {
  name: "update_task",
  async execute(taskManager, args) {
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
        throw createError(
          ErrorCode.InvalidArgument,
          "Invalid toolRecommendations: must be a string"
        );
      }
      updates.toolRecommendations = args.toolRecommendations;
    }
    if (args.ruleRecommendations !== undefined) {
      if (typeof args.ruleRecommendations !== "string") {
        throw createError(
          ErrorCode.InvalidArgument,
          "Invalid ruleRecommendations: must be a string"
        );
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
        throw createError(
          ErrorCode.InvalidArgument,
          "Invalid status: must be one of 'not started', 'in progress', 'done'"
        );
      }
      if (status === "done") {
        updates.completedDetails = validateRequiredStringParam(
          args.completedDetails,
          "completedDetails (required when status = 'done')"
        );
      }
      updates.status = status;
    }

    const result = await taskManager.updateTask(projectId, taskId, updates);
    return formatToolResponse(result);
  },
};
toolExecutorMap.set(updateTaskToolExecutor.name, updateTaskToolExecutor);

/**
 * Tool executor for reading project details
 */
const readProjectToolExecutor: ToolExecutor = {
  name: "read_project",
  async execute(taskManager, args) {
    const projectId = validateProjectId(args.projectId);
    const result = await taskManager.readProject(projectId);
    return formatToolResponse(result);
  },
};
toolExecutorMap.set(readProjectToolExecutor.name, readProjectToolExecutor);

/**
 * Tool executor for deleting projects
 */
const deleteProjectToolExecutor: ToolExecutor = {
  name: "delete_project",
  async execute(taskManager, args) {
    const projectId = validateProjectId(args.projectId);

    const projectIndex = taskManager["data"].projects.findIndex(
      (p) => p.projectId === projectId
    );
    if (projectIndex === -1) {
      return formatToolResponse({
        status: "error",
        message: "Project not found",
      });
    }

    // Remove project and save
    taskManager["data"].projects.splice(projectIndex, 1);
    await taskManager["saveTasks"]();

    return formatToolResponse({
      status: "project_deleted",
      message: `Project ${projectId} has been deleted.`,
    });
  },
};
toolExecutorMap.set(deleteProjectToolExecutor.name, deleteProjectToolExecutor);

/**
 * Tool executor for adding tasks to a project
 */
const addTasksToProjectToolExecutor: ToolExecutor = {
  name: "add_tasks_to_project",
  async execute(taskManager, args) {
    const projectId = validateProjectId(args.projectId);
    const tasks = validateTaskObjects(args.tasks, "Task");

    const result = await taskManager.addTasksToProject(projectId, tasks);
    return formatToolResponse(result);
  },
};
toolExecutorMap.set(addTasksToProjectToolExecutor.name, addTasksToProjectToolExecutor);

/**
 * Tool executor for finalizing (completing) projects
 */
const finalizeProjectToolExecutor: ToolExecutor = {
  name: "finalize_project",
  async execute(taskManager, args) {
    const projectId = validateProjectId(args.projectId);
    const result = await taskManager.approveProjectCompletion(projectId);
    return formatToolResponse(result);
  },
};
toolExecutorMap.set(finalizeProjectToolExecutor.name, finalizeProjectToolExecutor);

/**
 * Tool executor for listing tasks with optional projectId and state
 */
const listTasksToolExecutor: ToolExecutor = {
  name: "list_tasks",
  async execute(taskManager, args) {
    const projectId = args.projectId !== undefined ? validateProjectId(args.projectId) : undefined;
    const state = validateOptionalStateParam(args.state, [
      "open",
      "pending_approval",
      "completed",
      "all",
    ]);

    const result = await taskManager.listTasks(projectId, state as any);
    return formatToolResponse(result);
  },
};
toolExecutorMap.set(listTasksToolExecutor.name, listTasksToolExecutor);

/**
 * Tool executor for reading task details
 */
const readTaskToolExecutor: ToolExecutor = {
  name: "read_task",
  async execute(taskManager, args) {
    const taskId = validateTaskId(args.taskId);
    const result = await taskManager.openTaskDetails(taskId);
    return formatToolResponse(result);
  },
};
toolExecutorMap.set(readTaskToolExecutor.name, readTaskToolExecutor);

/**
 * Tool executor for creating an individual task in a project
 */
const createTaskToolExecutor: ToolExecutor = {
  name: "create_task",
  async execute(taskManager, args) {
    const projectId = validateProjectId(args.projectId);
    const title = validateRequiredStringParam(args.title, "title");
    const description = validateRequiredStringParam(args.description, "description");

    const singleTask = {
      title,
      description,
      toolRecommendations: args.toolRecommendations ? String(args.toolRecommendations) : undefined,
      ruleRecommendations: args.ruleRecommendations ? String(args.ruleRecommendations) : undefined,
    };

    const result = await taskManager.addTasksToProject(projectId, [singleTask]);
    return formatToolResponse(result);
  },
};
toolExecutorMap.set(createTaskToolExecutor.name, createTaskToolExecutor);

/**
 * Tool executor for deleting tasks
 */
const deleteTaskToolExecutor: ToolExecutor = {
  name: "delete_task",
  async execute(taskManager, args) {
    const projectId = validateProjectId(args.projectId);
    const taskId = validateTaskId(args.taskId);

    const result = await taskManager.deleteTask(projectId, taskId);
    return formatToolResponse(result);
  },
};
toolExecutorMap.set(deleteTaskToolExecutor.name, deleteTaskToolExecutor);

/**
 * Tool executor for approving completed tasks
 */
const approveTaskToolExecutor: ToolExecutor = {
  name: "approve_task",
  async execute(taskManager, args) {
    const projectId = validateProjectId(args.projectId);
    const taskId = validateTaskId(args.taskId);

    const result = await taskManager.approveTaskCompletion(projectId, taskId);
    return formatToolResponse(result);
  },
};
toolExecutorMap.set(approveTaskToolExecutor.name, approveTaskToolExecutor);