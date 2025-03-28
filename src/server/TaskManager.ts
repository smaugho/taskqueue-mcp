import * as path from "node:path";
import { Task, TaskManagerFile, TaskState, StandardResponse, ErrorCode, Project } from "../types/index.js";
import { createError, createSuccessResponse } from "../utils/errors.js";
import { generateObject, jsonSchema } from "ai";
import { formatTaskProgressTable, formatProjectsList } from "./taskFormattingUtils.js";
import { FileSystemService } from "./FileSystemService.js";

// Default path follows platform-specific conventions
const DEFAULT_PATH = path.join(FileSystemService.getAppDataDir(), "tasks.json");
const TASK_FILE_PATH = process.env.TASK_MANAGER_FILE_PATH || DEFAULT_PATH;

export class TaskManager {
  private projectCounter = 0;
  private taskCounter = 0;
  private data: TaskManagerFile = { projects: [] };
  private fileSystemService: FileSystemService;
  private initialized: Promise<void>;

  constructor(testFilePath?: string) {
    this.fileSystemService = new FileSystemService(testFilePath || TASK_FILE_PATH);
    this.initialized = this.loadTasks();
  }

  private async loadTasks() {
    const { data, maxProjectId, maxTaskId } = await this.fileSystemService.loadAndInitializeTasks();
    this.data = data;
    this.projectCounter = maxProjectId;
    this.taskCounter = maxTaskId;
  }

  private async ensureInitialized() {
    await this.initialized;
  }

  /**
   * Reloads data from disk
   * This is helpful when the task file might have been modified by another process
   * Used internally before read operations
   */
  public async reloadFromDisk(): Promise<void> {
    const data = await this.fileSystemService.reloadTasks();
    this.data = data;
    const { maxProjectId, maxTaskId } = this.fileSystemService.calculateMaxIds(data);
    this.projectCounter = maxProjectId;
    this.taskCounter = maxTaskId;
  }

  private async saveTasks() {
    await this.fileSystemService.saveTasks(this.data);
  }

  public async createProject(
    initialPrompt: string,
    tasks: { title: string; description: string; toolRecommendations?: string; ruleRecommendations?: string }[],
    projectPlan?: string,
    autoApprove?: boolean
  ) {
    await this.ensureInitialized();
    // Reload before creating to ensure counters are up-to-date
    await this.reloadFromDisk();
    this.projectCounter += 1;
    const projectId = `proj-${this.projectCounter}`;

    const newTasks: Task[] = [];
    for (const taskDef of tasks) {
      this.taskCounter += 1;
      newTasks.push({
        id: `task-${this.taskCounter}`,
        title: taskDef.title,
        description: taskDef.description,
        status: "not started",
        approved: false,
        completedDetails: "",
        toolRecommendations: taskDef.toolRecommendations,
        ruleRecommendations: taskDef.ruleRecommendations,
      });
    }

    const newProject: Project = {
      projectId,
      initialPrompt,
      projectPlan: projectPlan || initialPrompt,
      tasks: newTasks,
      completed: false,
      autoApprove: autoApprove === true ? true : false,
    };

    this.data.projects.push(newProject);

    await this.saveTasks();

    const progressTable = formatTaskProgressTable(newProject);

    return createSuccessResponse({
      projectId,
      totalTasks: newTasks.length,
      tasks: newTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
      })),
      message: `Project ${projectId} created with ${newTasks.length} tasks.\n${progressTable}`,
    });
  }

  public async generateProjectPlan({
    prompt,
    provider,
    model,
    attachments,
  }: {
    prompt: string;
    provider: string;
    model: string;
    attachments: string[];
  }): Promise<StandardResponse> {
    await this.ensureInitialized();

    // Wrap prompt and attachments in XML tags
    let llmPrompt = `<prompt>${prompt}</prompt>`;
    for (const att of attachments) {
      llmPrompt += `\n<attachment>${att}</attachment>`;
    }

    // Import and configure the appropriate provider
    let modelProvider;
    switch (provider) {
      case "openai":
        const { openai } = await import("@ai-sdk/openai");
        modelProvider = openai(model);
        break;
      case "google":
        const { google } = await import("@ai-sdk/google");
        modelProvider = google(model);
        break;
      case "deepseek":
        const { deepseek } = await import("@ai-sdk/deepseek");
        modelProvider = deepseek(model);
        break;
      default:
        throw createError(
          ErrorCode.InvalidArgument,
          `Invalid provider: ${provider}`
        );
    }

    // Define the schema for the LLM's response using jsonSchema helper
    const projectPlanSchema = jsonSchema<ProjectPlanOutput>({
      type: "object",
      properties: {
        projectPlan: { type: "string" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              toolRecommendations: { type: "string" },
              ruleRecommendations: { type: "string" },
            },
            required: ["title", "description"],
          },
        },
      },
      required: ["projectPlan", "tasks"],
    });

    interface ProjectPlanOutput {
      projectPlan: string;
      tasks: Array<{
        title: string;
        description: string;
        toolRecommendations?: string;
        ruleRecommendations?: string;
      }>;
    }

    try {
      // Call the LLM to generate the project plan
      const { object } = await generateObject<ProjectPlanOutput>({
        model: modelProvider,
        schema: projectPlanSchema,
        prompt: llmPrompt,
      });

      // Create a new project with the generated plan and tasks
      const result = await this.createProject(
        prompt,
        object.tasks,
        object.projectPlan
      );

      return result;
    } catch (err) {
      // Handle specific AI SDK errors
      if (err instanceof Error) {
        if (err.name === 'NoObjectGeneratedError') {
          throw createError(
            ErrorCode.InvalidResponseFormat,
            "The LLM failed to generate a valid project plan. Please try again with a clearer prompt.",
            { originalError: err }
          );
        }
        if (err.name === 'InvalidJSONError') {
          throw createError(
            ErrorCode.InvalidResponseFormat,
            "The LLM generated invalid JSON. Please try again.",
            { originalError: err }
          );
        }
        if (err.message.includes('rate limit') || err.message.includes('quota')) {
          throw createError(
            ErrorCode.ConfigurationError,
            "Rate limit or quota exceeded for the LLM provider. Please try again later.",
            { originalError: err }
          );
        }
        if (err.message.includes('authentication') || err.message.includes('unauthorized')) {
          throw createError(
            ErrorCode.ConfigurationError,
            "Invalid API key or authentication failed. Please check your environment variables.",
            { originalError: err }
          );
        }
      }

      // For unknown errors, preserve the original error but wrap it
      throw createError(
        ErrorCode.InvalidResponseFormat,
        "Failed to generate project plan",
        { originalError: err }
      );
    }
  }

  public async getNextTask(projectId: string): Promise<StandardResponse> {
    await this.ensureInitialized();
    // Reload from disk to ensure we have the latest data
    await this.reloadFromDisk();
    
    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) {
      throw createError(
        ErrorCode.ProjectNotFound,
        `Project ${projectId} not found`
      );
    }
    if (proj.completed) {
      throw createError(
        ErrorCode.ProjectAlreadyCompleted,
        "Project is already completed"
      );
    }
    const nextTask = proj.tasks.find((t) => t.status !== "done");
    if (!nextTask) {
      // all tasks done?
      const allDone = proj.tasks.every((t) => t.status === "done");
      if (allDone && !proj.completed) {
        const progressTable = formatTaskProgressTable(proj);
        return {
          status: "all_tasks_done",
          data: {
            message: `All tasks have been completed. Awaiting project completion approval.\n${progressTable}`
          }
        };
      }
      throw createError(
        ErrorCode.TaskNotFound,
        "No undone tasks found"
      );
    }

    const progressTable = formatTaskProgressTable(proj);
    return {
      status: "next_task",
      data: {
        id: nextTask.id,
        title: nextTask.title,
        description: nextTask.description,
        message: `Next task is ready. Task approval will be required after completion.\n${progressTable}`
      }
    };
  }

  public async approveTaskCompletion(projectId: string, taskId: string) {
    await this.ensureInitialized();
    // Reload before modifying
    await this.reloadFromDisk();
    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) {
      throw createError(
        ErrorCode.ProjectNotFound,
        `Project ${projectId} not found`
      );
    }
    const task = proj.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw createError(
        ErrorCode.TaskNotFound,
        `Task ${taskId} not found`
      );
    }
    if (task.status !== "done") {
      throw createError(
        ErrorCode.TaskNotDone,
        "Task not done yet"
      );
    }
    if (task.approved) {
      return createSuccessResponse({ message: "Task already approved." });
    }

    task.approved = true;
    await this.saveTasks();
    return createSuccessResponse({
      projectId: proj.projectId,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        completedDetails: task.completedDetails,
        approved: task.approved,
      },
    });
  }

  public async approveProjectCompletion(projectId: string) {
    await this.ensureInitialized();
    // Reload before modifying
    await this.reloadFromDisk();
    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) {
      throw createError(
        ErrorCode.ProjectNotFound,
        `Project ${projectId} not found`
      );
    }

    // Check if project is already completed
    if (proj.completed) {
      throw createError(
        ErrorCode.ProjectAlreadyCompleted,
        "Project is already completed"
      );
    }

    // Check if all tasks are done and approved
    const allDone = proj.tasks.every((t) => t.status === "done");
    if (!allDone) {
      throw createError(
        ErrorCode.TasksNotAllDone,
        "Not all tasks are done"
      );
    }
    const allApproved = proj.tasks.every((t) => t.status === "done" && t.approved);
    if (!allApproved) {
      throw createError(
        ErrorCode.TasksNotAllApproved,
        "Not all done tasks are approved"
      );
    }

    proj.completed = true;
    await this.saveTasks();
    return createSuccessResponse({
      projectId: proj.projectId,
      message: "Project is fully completed and approved.",
    });
  }

  public async openTaskDetails(taskId: string) {
    await this.ensureInitialized();
    // Reload from disk to ensure we have the latest data
    await this.reloadFromDisk();
    
    for (const proj of this.data.projects) {
      const target = proj.tasks.find((t) => t.id === taskId);
      if (target) {
        return createSuccessResponse({
          projectId: proj.projectId,
          initialPrompt: proj.initialPrompt,
          projectPlan: proj.projectPlan,
          completed: proj.completed,
          task: {
            id: target.id,
            title: target.title,
            description: target.description,
            status: target.status,
            approved: target.approved,
            completedDetails: target.completedDetails,
          },
        });
      }
    }
    throw createError(
      ErrorCode.TaskNotFound,
      `Task ${taskId} not found`
    );
  }

  public async listProjects(state?: TaskState) {
    await this.ensureInitialized();
    // Reload from disk to ensure we have the latest data
    await this.reloadFromDisk();

    let filteredProjects = [...this.data.projects];

    if (state && state !== "all") {
      filteredProjects = filteredProjects.filter((proj) => {
        switch (state) {
          case "open":
            return !proj.completed && proj.tasks.some((task) => task.status !== "done");
          case "pending_approval":
            return proj.tasks.some((task) => task.status === "done" && !task.approved);
          case "completed":
            return proj.completed && proj.tasks.every((task) => task.status === "done" && task.approved);
          default:
            return true; // Should not happen due to type safety
        }
      });
    }

    const projectsList = formatProjectsList(filteredProjects);
    return createSuccessResponse({
      message: `Current projects in the system:\n${projectsList}`,
      projects: filteredProjects.map((proj) => ({
        projectId: proj.projectId,
        initialPrompt: proj.initialPrompt,
        totalTasks: proj.tasks.length,
        completedTasks: proj.tasks.filter((task) => task.status === "done").length,
        approvedTasks: proj.tasks.filter((task) => task.approved).length,
      })),
    });
  }

  public async listTasks(projectId?: string, state?: TaskState) {
    await this.ensureInitialized();
    // Reload from disk to ensure we have the latest data
    await this.reloadFromDisk();
    
    // If projectId is provided, verify the project exists
    if (projectId) {
      const project = this.data.projects.find((p) => p.projectId === projectId);
      if (!project) {
        throw createError(
          ErrorCode.ProjectNotFound,
          `Project ${projectId} not found`
        );
      }
    }

    // Flatten all tasks from all projects if no projectId is given
    let tasks = projectId
      ? this.data.projects.find((p) => p.projectId === projectId)?.tasks || []
      : this.data.projects.flatMap((p) => p.tasks);

    // Apply state filtering
    if (state && state !== "all") {
      tasks = tasks.filter((task) => {
        switch (state) {
          case "open":
            return task.status !== "done";
          case "pending_approval":
            return task.status === "done" && !task.approved;
          case "completed":
            return task.status === "done" && task.approved;
          default:
            return true; // Should not happen due to type safety
        }
      });
    }

    return createSuccessResponse({
      message: `Tasks in the system${projectId ? ` for project ${projectId}` : ""}:\n${tasks.length} tasks found.`,
      tasks: tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        approved: task.approved,
        completedDetails: task.completedDetails,
        toolRecommendations: task.toolRecommendations,
        ruleRecommendations: task.ruleRecommendations
      }))
    });
  }

  public async addTasksToProject(
    projectId: string,
    tasks: { title: string; description: string; toolRecommendations?: string; ruleRecommendations?: string }[]
  ) {
    await this.ensureInitialized();
    // Reload before modifying
    await this.reloadFromDisk();
    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) {
      throw createError(
        ErrorCode.ProjectNotFound,
        `Project ${projectId} not found`
      );
    }

    const newTasks: Task[] = [];
    for (const taskDef of tasks) {
      this.taskCounter += 1;
      newTasks.push({
        id: `task-${this.taskCounter}`,
        title: taskDef.title,
        description: taskDef.description,
        status: "not started",
        approved: false,
        completedDetails: "",
        toolRecommendations: taskDef.toolRecommendations,
        ruleRecommendations: taskDef.ruleRecommendations,
      });
    }

    proj.tasks.push(...newTasks);
    await this.saveTasks();

    const progressTable = formatTaskProgressTable(proj);
    return createSuccessResponse({
      message: `Added ${newTasks.length} new tasks to project ${projectId}.\n${progressTable}`,
      newTasks: newTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
      })),
    });
  }

  public async updateTask(
    projectId: string,
    taskId: string,
    updates: {
      title?: string;
      description?: string;
      toolRecommendations?: string;
      ruleRecommendations?: string;
      status?: "not started" | "in progress" | "done";
      completedDetails?: string;
    }
  ) {
    await this.ensureInitialized();
    // Reload before modifying
    await this.reloadFromDisk();
    const project = this.data.projects.find((p) => p.projectId === projectId);
    if (!project) {
      throw createError(
        ErrorCode.ProjectNotFound,
        `Project ${projectId} not found`
      );
    }

    const taskIndex = project.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
      throw createError(
        ErrorCode.TaskNotFound,
        `Task ${taskId} not found`
      );
    }

    // Update the task with the provided updates
    project.tasks[taskIndex] = { ...project.tasks[taskIndex], ...updates };

    // Check if status was updated to 'done' and if project has autoApprove enabled
    if (updates.status === 'done' && project.autoApprove) {
      project.tasks[taskIndex].approved = true;
    }

    await this.saveTasks();
    return createSuccessResponse(project.tasks[taskIndex]);
  }

  public async deleteTask(projectId: string, taskId: string) {
    await this.ensureInitialized();
    // Reload before modifying
    await this.reloadFromDisk();
    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) {
      throw createError(
        ErrorCode.ProjectNotFound,
        `Project ${projectId} not found`
      );
    }

    const taskIndex = proj.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
      throw createError(
        ErrorCode.TaskNotFound,
        `Task ${taskId} not found`
      );
    }
    if (proj.tasks[taskIndex].status === "done") {
      throw createError(
        ErrorCode.CannotDeleteCompletedTask,
        "Cannot delete completed task"
      );
    }

    proj.tasks.splice(taskIndex, 1);
    await this.saveTasks();

    const progressTable = formatTaskProgressTable(proj);
    return createSuccessResponse({
      message: `Task ${taskId} has been deleted from project ${projectId}.\n${progressTable}`,
    });
  }

  public async readProject(projectId: string): Promise<StandardResponse<{
    projectId: string;
    initialPrompt: string;
    projectPlan: string;
    completed: boolean;
    tasks: Task[];
  }>> {
    await this.ensureInitialized();
    // Reload from disk to ensure we have the latest data
    await this.reloadFromDisk();
    
    const project = this.data.projects.find(p => p.projectId === projectId);
    if (!project) {
      throw createError(
        ErrorCode.ProjectNotFound,
        `Project ${projectId} not found`
      );
    }
    return createSuccessResponse({
      projectId: project.projectId,
      initialPrompt: project.initialPrompt,
      projectPlan: project.projectPlan,
      completed: project.completed,
      tasks: project.tasks
    });
  }
} 