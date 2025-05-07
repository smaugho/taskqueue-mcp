import * as path from "node:path";
import {
  Task,
  TaskManagerFile,
  TaskState,
  Project
} from "../types/data.js";
import {
  ProjectCreationSuccessData,
  ApproveTaskSuccessData,
  ApproveProjectSuccessData,
  OpenTaskSuccessData,
  ListProjectsSuccessData,
  ListTasksSuccessData,
  AddTasksSuccessData,
  DeleteTaskSuccessData,
  ReadProjectSuccessData,
} from "../types/response.js";
import { AppError, AppErrorCode } from "../types/errors.js";
import { FileSystemService } from "./FileSystemService.js";
import { generateObject, jsonSchema } from "ai";
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { formatStatusFileContent, StatusFileProjectData, StatusFileTaskData } from '../utils/statusFileFormatter.js';

// Default path follows platform-specific conventions
const DEFAULT_PATH = path.join(FileSystemService.getAppDataDir(), "tasks.json");
const TASK_FILE_PATH = process.env.TASK_MANAGER_FILE_PATH || DEFAULT_PATH;

interface ProjectPlanOutput {
  projectPlan: string;
  tasks: Array<{
    title: string;
    description: string;
    toolRecommendations?: string;
    ruleRecommendations?: string;
  }>;
}

export class TaskManager {
  private projectCounter = 0;
  private taskCounter = 0;
  private data: TaskManagerFile = { projects: [] };
  private fileSystemService: FileSystemService;
  private initialized: Promise<void>;

  constructor(testFilePath?: string) {
    this.fileSystemService = new FileSystemService(testFilePath || TASK_FILE_PATH);
    this.initialized = this.loadTasks().catch(error => {
      console.error('Failed to initialize TaskManager:', error);
      // Set default values for failed initialization
      this.data = { projects: [] };
      this.projectCounter = 0;
      this.taskCounter = 0;
    });
  }

  private async loadTasks() {
    try {
      const { data, maxProjectId, maxTaskId } = await this.fileSystemService.loadAndInitializeTasks();
      this.data = data;
      this.projectCounter = maxProjectId;
      this.taskCounter = maxTaskId;
    } catch (error) {
      // Propagate the error to be handled by the constructor
      throw new AppError('Failed to load tasks from disk', AppErrorCode.FileReadError, error);
    }
  }

  private async ensureInitialized() {
    try {
      await this.initialized;
    } catch (error) {
      // If initialization failed, throw an AppError that can be handled by the tool executor
      throw new AppError(
        'Failed to initialize task manager',
        AppErrorCode.FileReadError,
        error
      );
    }
  }

  public async reloadFromDisk(): Promise<void> {
    try {
      const data = await this.fileSystemService.reloadTasks();
      this.data = data;
      const { maxProjectId, maxTaskId } = this.fileSystemService.calculateMaxIds(data);
      this.projectCounter = maxProjectId;
      this.taskCounter = maxTaskId;
    } catch (error) {
      // Propagate as AppError to be handled by the tool executor
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        'Failed to reload tasks from disk',
        AppErrorCode.FileReadError,
        error
      );
    }
  }

  private async saveTasks() {
    await this.fileSystemService.saveTasks(this.data);
  }

  public async createProject(
    initialPrompt: string,
    tasks: { title: string; description: string; toolRecommendations?: string; ruleRecommendations?: string }[],
    projectPlan?: string,
    autoApprove?: boolean
  ): Promise<ProjectCreationSuccessData> {
    await this.ensureInitialized();
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

    return {
      projectId,
      totalTasks: newTasks.length,
      tasks: newTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
      })),
      message: `Project ${projectId} created with ${newTasks.length} tasks.`,
    };
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
  }): Promise<ProjectCreationSuccessData> {
    await this.ensureInitialized();

    // Read all attachment files
    const attachmentContents: string[] = [];
    for (const filename of attachments) {
      try {
        const content = await this.fileSystemService.readAttachmentFile(filename);
        attachmentContents.push(content);
      } catch (error) {
        throw new AppError(`Failed to read attachment file: ${filename}`, AppErrorCode.FileReadError, error);
      }
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
      required: ["tasks"],
    });

    // Wrap prompt and attachments in XML tags
    let llmPrompt = `<prompt>${prompt}</prompt>`;
    llmPrompt += `\n<outputFormat>Return your output as JSON formatted according to the following schema: ${JSON.stringify(projectPlanSchema, null, 2)}</outputFormat>`
    for (const content of attachmentContents) {
      llmPrompt += `\n<attachment>${content}</attachment>`;
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
        throw new AppError(`Invalid provider: ${provider}`, AppErrorCode.InvalidProvider);
    }

    try {
      const { object } = await generateObject({
        model: modelProvider,
        schema: projectPlanSchema,
        prompt: llmPrompt,
      });
      return await this.createProject(prompt, object.tasks, object.projectPlan);
    } catch (err: any) {
      if (err.name === 'LoadAPIKeyError' || 
          err.message.includes('API key is missing') || 
          err.message.includes('You didn\'t provide an API key') ||
          err.message.includes('unregistered callers') ||
          (err.responseBody && err.responseBody.includes('Authentication Fails'))) {
        throw new AppError(
          `Missing API key environment variable required for ${provider}`,
          AppErrorCode.ConfigurationError,
          err
        );
      }
      // Check for invalid model errors by looking at the error code, type, and message
      if ((err.data?.error?.code === 'model_not_found') && 
          err.message.includes('model')) {
        throw new AppError(
          `Invalid model: ${model} is not available for ${provider}`,
          AppErrorCode.InvalidModel,
          err
        );
      }
      // For unknown errors, preserve the original error but wrap it
      throw new AppError(
        "Failed to generate project plan due to an unexpected error",
        AppErrorCode.LLMGenerationError,
        err
      );
    }
  }

  public async getNextTask(projectId: string): Promise<OpenTaskSuccessData | { message: string }> {
    await this.ensureInitialized();
    await this.reloadFromDisk();
    
    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) {
      throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
    }
    if (proj.completed) {
      throw new AppError('Project is already completed', AppErrorCode.ProjectAlreadyCompleted);
    }

    if (!proj.tasks.length) {
      throw new AppError('Project has no tasks', AppErrorCode.TaskNotFound);
    }

    const nextTask = proj.tasks.find((t) => !(t.status === "done" && t.approved));
    if (!nextTask) {
      // all tasks done and approved?
      const allDoneAndApproved = proj.tasks.every((t) => t.status === "done" && t.approved);
      if (allDoneAndApproved && !proj.completed) {
        return {
          message: `All tasks have been completed and approved. Awaiting project completion approval.`
        };
      }
      throw new AppError('No incomplete or unapproved tasks found', AppErrorCode.TaskNotFound);
    }

    return {
      projectId: proj.projectId,
      task: { ...nextTask },
    };
  }

  public async approveTaskCompletion(projectId: string, taskId: string): Promise<ApproveTaskSuccessData> {
    await this.ensureInitialized();
    await this.reloadFromDisk();

    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) {
      throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
    }

    const task = proj.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new AppError(`Task ${taskId} not found`, AppErrorCode.TaskNotFound);
    }

    if (task.status !== "done") {
      throw new AppError('Task not done yet', AppErrorCode.TaskNotDone);
    }

    if (task.approved) {
      throw new AppError('Task is already approved', AppErrorCode.TaskAlreadyApproved);
    }

    task.approved = true;
    await this.saveTasks();

    return {
      projectId: proj.projectId,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        completedDetails: task.completedDetails ?? "",
        approved: task.approved,
      },
    };
  }

  public async approveProjectCompletion(projectId: string): Promise<ApproveProjectSuccessData> {
    await this.ensureInitialized();
    await this.reloadFromDisk();

    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) {
      throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
    }

    if (proj.completed) {
      throw new AppError('Project is already completed', AppErrorCode.ProjectAlreadyCompleted);
    }

    const allDone = proj.tasks.every((t) => t.status === "done");
    if (!allDone) {
      throw new AppError('Not all tasks are done', AppErrorCode.TasksNotAllDone);
    }

    const allApproved = proj.tasks.every((t) => t.status === "done" && t.approved);
    if (!allApproved) {
      throw new AppError('Not all done tasks are approved', AppErrorCode.TasksNotAllApproved);
    }

    proj.completed = true;
    await this._updateCurrentStatusFile(null, null);

    await this.saveTasks();

    return {
      projectId: proj.projectId,
      message: "Project is fully completed and approved.",
    };
  }

  public async openTaskDetails(projectId: string, taskId: string): Promise<OpenTaskSuccessData> {
    await this.ensureInitialized();
    await this.reloadFromDisk();

    const project = this.data.projects.find((p) => p.projectId === projectId);
    if (!project) {
      throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
    }

    const target = project.tasks.find((t) => t.id === taskId);
    if (!target) {
      throw new AppError(`Task ${taskId} not found`, AppErrorCode.TaskNotFound);
    }

    return {
      projectId: project.projectId,
      task: { ...target },
    };
  }

  public async listProjects(state?: TaskState): Promise<ListProjectsSuccessData> {
    await this.ensureInitialized();
    await this.reloadFromDisk();

    if (state && !["all", "open", "completed", "pending_approval"].includes(state)) {
      throw new AppError(`Invalid state filter: ${state}`, AppErrorCode.InvalidState);
    }

    let filteredProjects = [...this.data.projects];

    if (state && state !== "all") {
      filteredProjects = filteredProjects.filter((p) => {
        switch (state) {
          case "open":
            return !p.completed;
          case "completed":
            return p.completed;
          case "pending_approval":
            return !p.completed && p.tasks.every((t) => t.status === "done");
          default:
            return true;
        }
      });
    }

    return {
      message: `Current projects in the system:`,
      projects: filteredProjects.map((p) => ({
        projectId: p.projectId,
        initialPrompt: p.initialPrompt,
        totalTasks: p.tasks.length,
        completedTasks: p.tasks.filter((t) => t.status === "done").length,
        approvedTasks: p.tasks.filter((t) => t.approved).length,
      })),
    };
  }

  public async listTasks(projectId?: string, state?: TaskState): Promise<ListTasksSuccessData> {
    await this.ensureInitialized();
    await this.reloadFromDisk();

    if (state && !["all", "open", "completed", "pending_approval"].includes(state)) {
      throw new AppError(`Invalid state filter: ${state}`, AppErrorCode.InvalidState);
    }

    let allTasks: Task[] = [];

    if (projectId) {
      const proj = this.data.projects.find((p) => p.projectId === projectId);
      if (!proj) {
        throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
      }
      allTasks = [...proj.tasks];
    } else {
      // Collect tasks from all projects
      allTasks = this.data.projects.flatMap((p) => p.tasks);
    }

    if (state && state !== "all") {
      allTasks = allTasks.filter((task) => {
        switch (state) {
          case "open":
            return !task.approved;
          case "completed":
            return task.status === "done" && task.approved;
          case "pending_approval":
            return task.status === "done" && !task.approved;
          default:
            return true;
        }
      });
    }

    return {
      message: `Tasks in the system${projectId ? ` for project ${projectId}` : ""}:\n${allTasks.length} tasks found.`,
      tasks: allTasks,
    };
  }

  public async addTasksToProject(
    projectId: string,
    tasks: { title: string; description: string; toolRecommendations?: string; ruleRecommendations?: string }[]
  ): Promise<AddTasksSuccessData> {
    await this.ensureInitialized();
    await this.reloadFromDisk();

    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) {
      throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
    }

    if (proj.completed) {
      throw new AppError('Project is already completed', AppErrorCode.ProjectAlreadyCompleted);
    }

    const newTasks: Task[] = [];
    for (const taskDef of tasks) {
      this.taskCounter += 1;
      const newTask: Task = {
        id: `task-${this.taskCounter}`,
        title: taskDef.title,
        description: taskDef.description,
        status: "not started",
        approved: false,
        completedDetails: "",
        toolRecommendations: taskDef.toolRecommendations,
        ruleRecommendations: taskDef.ruleRecommendations,
      };
      newTasks.push(newTask);
      proj.tasks.push(newTask);
    }

    await this.saveTasks();

    return {
      newTasks: newTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
      })),
      message: `Added ${newTasks.length} tasks to project ${projectId}`,
    };
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
  ): Promise<Task> {
    await this.ensureInitialized();
    await this.reloadFromDisk();

    const projectIndex = this.data.projects.findIndex(
      (p) => p.projectId === projectId
    );
    if (projectIndex === -1) {
      throw new AppError(
        `Project ${projectId} not found`,
        AppErrorCode.ProjectNotFound
      );
    }

    const taskIndex = this.data.projects[projectIndex].tasks.findIndex(
      (t) => t.id === taskId
    );
    if (taskIndex === -1) {
      throw new AppError(
        `Task ${taskId} not found in project ${projectId}`,
        AppErrorCode.TaskNotFound
      );
    }

    const existingTask = this.data.projects[projectIndex].tasks[taskIndex];
    if (existingTask.approved) {
      throw new AppError(
        "Cannot modify an approved task",
        AppErrorCode.TaskAlreadyApproved
      );
    }

    const originalStatus = existingTask.status;

    if (updates.status) {
      const newStatus = updates.status;
      if (
        (originalStatus === "not started" && newStatus === "done") ||
        (originalStatus === "done" && newStatus === "not started")
      ) {
        throw new AppError(
          `Invalid status transition from ${originalStatus} to ${newStatus}`,
          AppErrorCode.InvalidArgument 
        );
      }
    }
    
    if (updates.status === "done" && !updates.completedDetails && !existingTask.completedDetails) {
      throw new AppError(
        "Invalid or missing required parameter: completedDetails (required when status = 'done')",
        AppErrorCode.MissingParameter, 
        "completedDetails"
      );
    }

    const updatedTask: Task = {
      ...existingTask,
      ...updates,
      completedDetails: updates.status === "done" 
        ? (updates.completedDetails || existingTask.completedDetails || "Completed") 
        : (updates.status === "not started" || updates.status === "in progress" ? "" : existingTask.completedDetails)
    };
    
    this.data.projects[projectIndex].tasks[taskIndex] = updatedTask;
    await this.saveTasks();
    
    await this._updateCurrentStatusFile(projectId, taskId, originalStatus, updatedTask.status);

    return updatedTask;
  }

  public async deleteTask(projectId: string, taskId: string): Promise<DeleteTaskSuccessData> {
    await this.ensureInitialized();
    await this.reloadFromDisk();

    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) {
      throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
    }

    if (proj.completed) {
      throw new AppError('Project is already completed', AppErrorCode.ProjectAlreadyCompleted);
    }

    const taskIndex = proj.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
      throw new AppError(`Task ${taskId} not found`, AppErrorCode.TaskNotFound);
    }

    const task = proj.tasks[taskIndex];
    if (task.approved) {
      throw new AppError('Cannot delete an approved task', AppErrorCode.CannotModifyApprovedTask);
    }

    proj.tasks.splice(taskIndex, 1);
    await this.saveTasks();

    return {
      message: `Task ${taskId} deleted from project ${projectId}`,
    };
  }

  public async readProject(projectId: string): Promise<ReadProjectSuccessData> {
    await this.ensureInitialized();
    await this.reloadFromDisk();

    const project = this.data.projects.find((p) => p.projectId === projectId);
    if (!project) {
      throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
    }

    return {
      projectId: project.projectId,
      initialPrompt: project.initialPrompt,
      projectPlan: project.projectPlan,
      completed: project.completed,
      autoApprove: project.autoApprove,
      tasks: project.tasks,
    };
  }

  /**
   * Updates a project's initialPrompt and/or projectPlan
   * @param projectId The ID of the project to update
   * @param initialPrompt Optional new initial prompt
   * @param projectPlan Optional new project plan
   * @returns The updated project data
   */
  public async updateProject(
    projectId: string,
    initialPrompt?: string,
    projectPlan?: string
  ): Promise<ReadProjectSuccessData> {
    await this.ensureInitialized();
    await this.reloadFromDisk();

    // Find the project
    const project = this.data.projects.find((p) => p.projectId === projectId);
    if (!project) {
      throw new AppError(`Project ${projectId} not found`, AppErrorCode.ProjectNotFound);
    }

    // Check if the project is already completed
    if (project.completed) {
      throw new AppError('Project is already completed', AppErrorCode.ProjectAlreadyCompleted);
    }

    // Ensure at least one update field is provided
    if (initialPrompt === undefined && projectPlan === undefined) {
      throw new AppError(
        'At least one of initialPrompt or projectPlan must be provided',
        AppErrorCode.InvalidArgument
      );
    }

    // Update the fields
    if (initialPrompt !== undefined) {
      project.initialPrompt = initialPrompt;
    }
    if (projectPlan !== undefined) {
      project.projectPlan = projectPlan;
    }

    // Save the changes
    await this.saveTasks();

    // Return the updated project
    return {
      projectId: project.projectId,
      initialPrompt: project.initialPrompt,
      projectPlan: project.projectPlan,
      completed: project.completed,
      autoApprove: project.autoApprove,
      tasks: project.tasks,
    };
  }

  /**
   * Updates the current_status.mdc file based on the provided project and task IDs.
   * Only active if CURRENT_PROJECT_PATH environment variable is set.
   */
  private async _updateCurrentStatusFile(
    targetProjectId: string | null, 
    targetTaskId: string | null, 
    originalTaskStatus?: Task['status'],
    currentTaskFinalStatus?: Task['status'] 
  ): Promise<void> {
    const currentProjectPath = process.env.CURRENT_PROJECT_PATH;
    if (!currentProjectPath) {
      return;
    }

    const rulesDir = path.join(currentProjectPath, ".cursor", "rules");
    const statusFilePath = path.join(rulesDir, "current_status.mdc");

    // If called with nulls (e.g. from finalizeProject, deleteTask), clear the file.
    if (!targetProjectId || !targetTaskId) {
      try {
        await writeFile(statusFilePath, formatStatusFileContent(null, null));
      } catch (error) {
        console.error(`Failed to clear status file ${statusFilePath}:`, error);
      }
      return;
    }

    // Fetch the project from the current in-memory state (this.data)
    const projectToShow = this.data.projects.find(p => p.projectId === targetProjectId);
    if (!projectToShow) {
        console.error(`Project ${targetProjectId} not found in _updateCurrentStatusFile. Cannot update status file.`);
        return;
    }

    // Fetch the target task (the one that was just updated) from the project.
    const currentUpdatedTask = projectToShow.tasks.find(t => t.id === targetTaskId);
    if (!currentUpdatedTask) {
        console.error(`Task ${targetTaskId} not found in project ${targetProjectId} within _updateCurrentStatusFile. Cannot update status file.`);
        return;
    }

    // Use the status from the fetched currentUpdatedTask as the definitive current status.
    // The passed currentTaskFinalStatus is used primarily for the 'not started' to 'not started' check.
    const actualCurrentStatus = currentUpdatedTask.status;

    // Requirement: Prevent status file update if a task description (or other non-status field)
    // is updated but the task's status was 'not started' and remains 'not started'.
    // We use currentTaskFinalStatus here because currentUpdatedTask.status from this.data would be 'not started',
    // and originalTaskStatus would also be 'not started'. currentTaskFinalStatus reflects the intended
    // status from the update operation itself.
    if (originalTaskStatus === "not started" && currentTaskFinalStatus === "not started") {
      return; 
    }

    let taskToDisplay = currentUpdatedTask;
    
    // Requirement: Conditional logic for 'done' tasks.
    // If the current task (that triggered the update, or was just updated) is 'done',
    // check if another task is 'in progress'. If so, display that 'in progress' task.
    // Otherwise, display the current 'done' task.
    if (actualCurrentStatus === "done") {
      const otherInProgressTask = projectToShow.tasks.find(
        (t) => t.id !== currentUpdatedTask.id && t.status === "in progress" && !t.approved
      );
      if (otherInProgressTask) {
        taskToDisplay = otherInProgressTask;
      } 
    }
    
    if (!taskToDisplay) {
        console.error(`No task determined to display for project ${targetProjectId}. Cannot update status file.`);
        return;
    }

    try {
      await mkdir(rulesDir, { recursive: true });

      const projectForFormatter: StatusFileProjectData = {
        projectId: projectToShow.projectId,
        initialPrompt: projectToShow.initialPrompt,
        projectPlan: projectToShow.projectPlan,
        completedTasks: projectToShow.tasks.filter(t => t.status === 'done').length,
        totalTasks: projectToShow.tasks.length,
      };
      
      let relevantRuleFilename: string | undefined = undefined;
      let relevantRuleExcerpt: string | undefined = undefined;

      const ruleLinkMatch = taskToDisplay.description?.match(/\[([^\]]+?\.mdc)\]\(mdc:(.*?)\)/);
      if (ruleLinkMatch && ruleLinkMatch[1] && ruleLinkMatch[2]) {
        relevantRuleFilename = ruleLinkMatch[1];
        const ruleFilePath = path.join(rulesDir, relevantRuleFilename);
        try {
          relevantRuleExcerpt = await readFile(ruleFilePath, 'utf-8');
        } catch (e) {
          console.warn(`Could not read rule file ${ruleFilePath} referenced in task ${taskToDisplay.id}`);
        }
      }

      const taskForFormatter: StatusFileTaskData = {
        taskId: taskToDisplay.id,
        title: taskToDisplay.title,
        description: taskToDisplay.description,
        status: taskToDisplay.status, 
        approved: taskToDisplay.approved,
        completedDetails: taskToDisplay.completedDetails,
        relevantRuleFilename,
        relevantRuleExcerpt,
      };
      
      const statusFileContent = formatStatusFileContent(projectForFormatter, taskForFormatter);
      await writeFile(statusFilePath, statusFileContent);
    } catch (error) {
      console.error(`Failed to update status file ${statusFilePath}:`, error);
    }
  }
} 