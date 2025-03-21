import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { Task, Project, TaskManagerFile, TaskState } from "../types/index.js";

// Get platform-appropriate app data directory
const getAppDataDir = () => {
  const platform = process.platform;
  
  if (platform === 'darwin') {
    // macOS: ~/Library/Application Support/taskqueue-mcp
    return path.join(os.homedir(), 'Library', 'Application Support', 'taskqueue-mcp');
  } else if (platform === 'win32') {
    // Windows: %APPDATA%\taskqueue-mcp (usually C:\Users\<user>\AppData\Roaming\taskqueue-mcp)
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'taskqueue-mcp');
  } else {
    // Linux/Unix/Others: Use XDG Base Directory if available, otherwise ~/.local/share/taskqueue-mcp
    const xdgDataHome = process.env.XDG_DATA_HOME;
    const linuxDefaultDir = path.join(os.homedir(), '.local', 'share', 'taskqueue-mcp');
    return xdgDataHome ? path.join(xdgDataHome, 'taskqueue-mcp') : linuxDefaultDir;
  }
};

// Default path follows platform-specific conventions
const DEFAULT_PATH = path.join(getAppDataDir(), "tasks.json");

const TASK_FILE_PATH = process.env.TASK_MANAGER_FILE_PATH || DEFAULT_PATH;

export class TaskManagerServer {
  private projectCounter = 0;
  private taskCounter = 0;
  private data: TaskManagerFile = { projects: [] };
  private filePath: string;
  private initialized: Promise<void>;

  constructor(testFilePath?: string) {
    this.filePath = testFilePath || TASK_FILE_PATH;
    this.initialized = this.loadTasks();
  }

  private async loadTasks() {
    try {
      const data = await fs.readFile(this.filePath, "utf-8");
      this.data = JSON.parse(data);
      
      const allTaskIds: number[] = [];
      const allProjectIds: number[] = [];

      for (const proj of this.data.projects) {
        const projNum = Number.parseInt(proj.projectId.replace("proj-", ""), 10);
        if (!Number.isNaN(projNum)) {
          allProjectIds.push(projNum);
        }
        for (const t of proj.tasks) {
          const tNum = Number.parseInt(t.id.replace("task-", ""), 10);
          if (!Number.isNaN(tNum)) {
            allTaskIds.push(tNum);
          }
        }
      }

      this.projectCounter =
        allProjectIds.length > 0 ? Math.max(...allProjectIds) : 0;
      this.taskCounter = allTaskIds.length > 0 ? Math.max(...allTaskIds) : 0;
    } catch (error) {
      this.data = { projects: [] };
    }
  }

  private async ensureInitialized() {
    await this.initialized;
  }

  private async saveTasks() {
    try {
      // Ensure directory exists before writing
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(
        this.filePath,
        JSON.stringify(this.data, null, 2),
        "utf-8"
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("EROFS")) {
        console.error("EROFS: read-only file system. Cannot save tasks.");
        throw error;
      }
      throw error;
    }
  }

  private formatTaskProgressTable(projectId: string): string {
    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) return "Project not found";

    let table = "\nProgress Status:\n";
    table += "| Task ID | Title | Description | Status | Approval | Tools | Rules |\n";
    table += "|----------|----------|------|------|----------|--------|--------|\n";

    for (const task of proj.tasks) {
      const status = task.status === "done" ? "✅ Done" : (task.status === "in progress" ? "🔄 In Progress" : "⏳ Not Started");
      const approved = task.approved ? "✅ Approved" : "⏳ Pending";
      const tools = task.toolRecommendations ? "✓" : "-";
      const rules = task.ruleRecommendations ? "✓" : "-";
      table += `| ${task.id} | ${task.title} | ${task.description} | ${status} | ${approved} | ${tools} | ${rules} |\n`;
    }

    return table;
  }

  private formatProjectsList(): string {
    let output = "\nProjects List:\n";
    output +=
      "| Project ID | Initial Prompt | Total Tasks | Completed | Approved |\n";
    output +=
      "|------------|------------------|-------------|-----------|----------|\n";

    for (const proj of this.data.projects) {
      const totalTasks = proj.tasks.length;
      const completedTasks = proj.tasks.filter((t) => t.status === "done").length;
      const approvedTasks = proj.tasks.filter((t) => t.approved).length;
      output += `| ${proj.projectId} | ${proj.initialPrompt.substring(0, 30)}${proj.initialPrompt.length > 30 ? "..." : ""} | ${totalTasks} | ${completedTasks} | ${approvedTasks} |\n`;
    }

    return output;
  }

  public async createProject(
    initialPrompt: string,
    tasks: { title: string; description: string; toolRecommendations?: string; ruleRecommendations?: string }[],
    projectPlan?: string
  ) {
    await this.ensureInitialized();
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

    this.data.projects.push({
      projectId,
      initialPrompt,
      projectPlan: projectPlan || initialPrompt,
      tasks: newTasks,
      completed: false,
    });

    await this.saveTasks();

    const progressTable = this.formatTaskProgressTable(projectId);

    return {
      status: "planned",
      projectId,
      totalTasks: newTasks.length,
      tasks: newTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
      })),
      message: `Tasks have been successfully added. Please use the task tool with 'read' action to retrieve tasks.\n${progressTable}`,
    };
  }

  public async getNextTask(projectId: string) {
    await this.ensureInitialized();
    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) {
      return { status: "error", message: "Project not found" };
    }
    if (proj.completed) {
      return {
        status: "already_completed",
        message: "Project already completed.",
      };
    }
    const nextTask = proj.tasks.find((t) => t.status !== "done");
    if (!nextTask) {
      // all tasks done?
      const allDone = proj.tasks.every((t) => t.status === "done");
      if (allDone && !proj.completed) {
        const progressTable = this.formatTaskProgressTable(projectId);
        return {
          status: "all_tasks_done",
          message: `All tasks have been completed. Awaiting project completion approval.\n${progressTable}`,
        };
      }
      return { status: "no_next_task", message: "No undone tasks found." };
    }

    const progressTable = this.formatTaskProgressTable(projectId);
    return {
      status: "next_task",
      task: {
        id: nextTask.id,
        title: nextTask.title,
        description: nextTask.description,
      },
      message: `Next task is ready. Task approval will be required after completion.\n${progressTable}`,
    };
  }

  public async markTaskDone(
    projectId: string,
    taskId: string,
    completedDetails?: string
  ) {
    await this.ensureInitialized();
    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) return { status: "error", message: "Project not found" };
    const task = proj.tasks.find((t) => t.id === taskId);
    if (!task) return { status: "error", message: "Task not found" };
    if (task.status === "done")
      return {
        status: "already_done",
        message: "Task is already marked done.",
      };

    task.status = "done";
    task.completedDetails = completedDetails || "";
    await this.saveTasks();
    return {
      status: "task_marked_done",
      projectId: proj.projectId,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        completedDetails: task.completedDetails,
        approved: task.approved,
      },
    };
  }

  public async approveTaskCompletion(projectId: string, taskId: string) {
    await this.ensureInitialized();
    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) return { status: "error", message: "Project not found" };
    const task = proj.tasks.find((t) => t.id === taskId);
    if (!task) return { status: "error", message: "Task not found" };
    if (task.status !== "done") return { status: "error", message: "Task not done yet." };
    if (task.approved)
      return { status: "already_approved", message: "Task already approved." };

    task.approved = true;
    await this.saveTasks();
    return {
      status: "task_approved",
      projectId: proj.projectId,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        completedDetails: task.completedDetails,
        approved: task.approved,
      },
    };
  }

  public async approveProjectCompletion(projectId: string) {
    await this.ensureInitialized();
    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) return { status: "error", message: "Project not found" };

    // Check if project is already completed
    if (proj.completed) {
      return { status: "error", message: "Project is already completed." };
    }

    // Check if all tasks are done and approved
    const allDone = proj.tasks.every((t) => t.status === "done");
    if (!allDone) {
      return { status: "error", message: "Not all tasks are done." };
    }
    const allApproved = proj.tasks.every((t) => t.status === "done" && t.approved);
    if (!allApproved) {
      return { status: "error", message: "Not all done tasks are approved." };
    }

    proj.completed = true;
    await this.saveTasks();
    return {
      status: "project_approved_complete",
      projectId: proj.projectId,
      message: "Project is fully completed and approved.",
    };
  }

  public async openTaskDetails(taskId: string) {
    await this.ensureInitialized();
    for (const proj of this.data.projects) {
      const target = proj.tasks.find((t) => t.id === taskId);
      if (target) {
        return {
          status: "task_details",
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
        };
      }
    }
    return { status: "task_not_found", message: "No such task found" };
  }

  public async listProjects(state?: TaskState) {
    await this.ensureInitialized();

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

    const projectsList = this.formatProjectsList();
    return {
      status: "projects_listed",
      message: `Current projects in the system:\n${projectsList}`,
      projects: filteredProjects.map((proj) => ({
        projectId: proj.projectId,
        initialPrompt: proj.initialPrompt,
        totalTasks: proj.tasks.length,
        completedTasks: proj.tasks.filter((task) => task.status === "done").length,
        approvedTasks: proj.tasks.filter((task) => task.approved).length,
      })),
    };
  }

  public async listTasks(projectId?: string, state?: TaskState) {
    await this.ensureInitialized();
    
    // If projectId is provided, verify the project exists
    if (projectId) {
      const project = this.data.projects.find((p) => p.projectId === projectId);
      if (!project) {
        return {
          status: "error",
          message: "Project not found"
        };
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

    return {
      status: "tasks_listed",
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
    };
  }

  public async addTasksToProject(
    projectId: string,
    tasks: { title: string; description: string; toolRecommendations?: string; ruleRecommendations?: string }[]
  ) {
    await this.ensureInitialized();
    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) {
      return { status: "error", message: "Project not found" };
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

    const progressTable = this.formatTaskProgressTable(projectId);
    return {
      status: "tasks_added",
      message: `Added ${newTasks.length} new tasks to project.\n${progressTable}`,
      newTasks: newTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
      })),
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
    }
  ) {
    await this.ensureInitialized();
    const project = this.data.projects.find((p) => p.projectId === projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const taskIndex = project.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Update the task with the provided updates
    project.tasks[taskIndex] = { ...project.tasks[taskIndex], ...updates };

    await this.saveTasks();
    return project.tasks[taskIndex];
  }

  public async deleteTask(projectId: string, taskId: string) {
    await this.ensureInitialized();
    const proj = this.data.projects.find((p) => p.projectId === projectId);
    if (!proj) return { status: "error", message: "Project not found" };

    const taskIndex = proj.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) return { status: "error", message: "Task not found" };
    if (proj.tasks[taskIndex].status === "done")
      return { status: "error", message: "Cannot delete completed task" };

    proj.tasks.splice(taskIndex, 1);
    await this.saveTasks();

    const progressTable = this.formatTaskProgressTable(projectId);
    return {
      status: "task_deleted",
      message: `Task ${taskId} has been deleted.\n${progressTable}`,
    };
  }
} 