import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { Task, RequestEntry, TaskManagerFile } from "../types/index.js";

const DEFAULT_PATH = path.join(os.homedir(), "Documents", "tasks.json");
const TASK_FILE_PATH = process.env.TASK_MANAGER_FILE_PATH || DEFAULT_PATH;

export class TaskManagerServer {
  private requestCounter = 0;
  private taskCounter = 0;
  private data: TaskManagerFile = { requests: [] };

  constructor() {
    this.loadTasks();
  }

  private async loadTasks() {
    try {
      const data = await fs.readFile(TASK_FILE_PATH, "utf-8");
      this.data = JSON.parse(data);
      const allTaskIds: number[] = [];
      const allRequestIds: number[] = [];

      for (const req of this.data.requests) {
        const reqNum = Number.parseInt(req.requestId.replace("req-", ""), 10);
        if (!Number.isNaN(reqNum)) {
          allRequestIds.push(reqNum);
        }
        for (const t of req.tasks) {
          const tNum = Number.parseInt(t.id.replace("task-", ""), 10);
          if (!Number.isNaN(tNum)) {
            allTaskIds.push(tNum);
          }
        }
      }

      this.requestCounter =
        allRequestIds.length > 0 ? Math.max(...allRequestIds) : 0;
      this.taskCounter = allTaskIds.length > 0 ? Math.max(...allTaskIds) : 0;
    } catch (error) {
      this.data = { requests: [] };
    }
  }

  private async saveTasks() {
    try {
      await fs.writeFile(
        TASK_FILE_PATH,
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

  private formatTaskProgressTable(requestId: string): string {
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return "Request not found";

    let table = "\nProgress Status:\n";
    table += "| Task ID | Title | Description | Status | Approval |\n";
    table += "|----------|----------|------|------|----------|\n";

    for (const task of req.tasks) {
      const status = task.done ? "✅ Done" : "🔄 In Progress";
      const approved = task.approved ? "✅ Approved" : "⏳ Pending";
      table += `| ${task.id} | ${task.title} | ${task.description} | ${status} | ${approved} |\n`;
    }

    return table;
  }

  private formatRequestsList(): string {
    let output = "\nRequests List:\n";
    output +=
      "| Request ID | Original Request | Total Tasks | Completed | Approved |\n";
    output +=
      "|------------|------------------|-------------|-----------|----------|\n";

    for (const req of this.data.requests) {
      const totalTasks = req.tasks.length;
      const completedTasks = req.tasks.filter((t) => t.done).length;
      const approvedTasks = req.tasks.filter((t) => t.approved).length;
      output += `| ${req.requestId} | ${req.originalRequest.substring(0, 30)}${req.originalRequest.length > 30 ? "..." : ""} | ${totalTasks} | ${completedTasks} | ${approvedTasks} |\n`;
    }

    return output;
  }

  public async requestPlanning(
    originalRequest: string,
    tasks: { title: string; description: string }[],
    splitDetails?: string
  ) {
    await this.loadTasks();
    this.requestCounter += 1;
    const requestId = `req-${this.requestCounter}`;

    const newTasks: Task[] = [];
    for (const taskDef of tasks) {
      this.taskCounter += 1;
      newTasks.push({
        id: `task-${this.taskCounter}`,
        title: taskDef.title,
        description: taskDef.description,
        done: false,
        approved: false,
        completedDetails: "",
      });
    }

    this.data.requests.push({
      requestId,
      originalRequest,
      splitDetails: splitDetails || originalRequest,
      tasks: newTasks,
      completed: false,
    });

    await this.saveTasks();

    const progressTable = this.formatTaskProgressTable(requestId);

    return {
      status: "planned",
      requestId,
      totalTasks: newTasks.length,
      tasks: newTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
      })),
      message: `Tasks have been successfully added. Please use 'get_next_task' to retrieve the first task.\n${progressTable}`,
    };
  }

  public async getNextTask(requestId: string) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) {
      return { status: "error", message: "Request not found" };
    }
    if (req.completed) {
      return {
        status: "already_completed",
        message: "Request already completed.",
      };
    }
    const nextTask = req.tasks.find((t) => !t.done);
    if (!nextTask) {
      // all tasks done?
      const allDone = req.tasks.every((t) => t.done);
      if (allDone && !req.completed) {
        const progressTable = this.formatTaskProgressTable(requestId);
        return {
          status: "all_tasks_done",
          message: `All tasks have been completed. Awaiting request completion approval.\n${progressTable}`,
        };
      }
      return { status: "no_next_task", message: "No undone tasks found." };
    }

    const progressTable = this.formatTaskProgressTable(requestId);
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
    requestId: string,
    taskId: string,
    completedDetails?: string
  ) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    const task = req.tasks.find((t) => t.id === taskId);
    if (!task) return { status: "error", message: "Task not found" };
    if (task.done)
      return {
        status: "already_done",
        message: "Task is already marked done.",
      };

    task.done = true;
    task.completedDetails = completedDetails || "";
    await this.saveTasks();
    return {
      status: "task_marked_done",
      requestId: req.requestId,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        completedDetails: task.completedDetails,
        approved: task.approved,
      },
    };
  }

  public async approveTaskCompletion(requestId: string, taskId: string) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    const task = req.tasks.find((t) => t.id === taskId);
    if (!task) return { status: "error", message: "Task not found" };
    if (!task.done) return { status: "error", message: "Task not done yet." };
    if (task.approved)
      return { status: "already_approved", message: "Task already approved." };

    task.approved = true;
    await this.saveTasks();
    return {
      status: "task_approved",
      requestId: req.requestId,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        completedDetails: task.completedDetails,
        approved: task.approved,
      },
    };
  }

  public async approveRequestCompletion(requestId: string) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };

    // Check if all tasks are done and approved
    const allDone = req.tasks.every((t) => t.done);
    if (!allDone) {
      return { status: "error", message: "Not all tasks are done." };
    }
    const allApproved = req.tasks.every((t) => t.done && t.approved);
    if (!allApproved) {
      return { status: "error", message: "Not all done tasks are approved." };
    }

    req.completed = true;
    await this.saveTasks();
    return {
      status: "request_approved_complete",
      requestId: req.requestId,
      message: "Request is fully completed and approved.",
    };
  }

  public async openTaskDetails(taskId: string) {
    await this.loadTasks();
    for (const req of this.data.requests) {
      const target = req.tasks.find((t) => t.id === taskId);
      if (target) {
        return {
          status: "task_details",
          requestId: req.requestId,
          originalRequest: req.originalRequest,
          splitDetails: req.splitDetails,
          completed: req.completed,
          task: {
            id: target.id,
            title: target.title,
            description: target.description,
            done: target.done,
            approved: target.approved,
            completedDetails: target.completedDetails,
          },
        };
      }
    }
    return { status: "task_not_found", message: "No such task found" };
  }

  public async listRequests() {
    await this.loadTasks();
    const requestsList = this.formatRequestsList();
    return {
      status: "requests_listed",
      message: `Current requests in the system:\n${requestsList}`,
      requests: this.data.requests.map((req) => ({
        requestId: req.requestId,
        originalRequest: req.originalRequest,
        totalTasks: req.tasks.length,
        completedTasks: req.tasks.filter((t) => t.done).length,
        approvedTasks: req.tasks.filter((t) => t.approved).length,
      })),
    };
  }

  public async addTasksToRequest(
    requestId: string,
    tasks: { title: string; description: string }[]
  ) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    if (req.completed)
      return {
        status: "error",
        message: "Cannot add tasks to completed request",
      };

    const newTasks: Task[] = [];
    for (const taskDef of tasks) {
      this.taskCounter += 1;
      newTasks.push({
        id: `task-${this.taskCounter}`,
        title: taskDef.title,
        description: taskDef.description,
        done: false,
        approved: false,
        completedDetails: "",
      });
    }

    req.tasks.push(...newTasks);
    await this.saveTasks();

    const progressTable = this.formatTaskProgressTable(requestId);
    return {
      status: "tasks_added",
      message: `Added ${newTasks.length} new tasks to request.\n${progressTable}`,
      newTasks: newTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
      })),
    };
  }

  public async updateTask(
    requestId: string,
    taskId: string,
    updates: { title?: string; description?: string }
  ) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };

    const task = req.tasks.find((t) => t.id === taskId);
    if (!task) return { status: "error", message: "Task not found" };
    if (task.done)
      return { status: "error", message: "Cannot update completed task" };

    if (updates.title) task.title = updates.title;
    if (updates.description) task.description = updates.description;

    await this.saveTasks();

    const progressTable = this.formatTaskProgressTable(requestId);
    return {
      status: "task_updated",
      message: `Task ${taskId} has been updated.\n${progressTable}`,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
      },
    };
  }

  public async deleteTask(requestId: string, taskId: string) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };

    const taskIndex = req.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) return { status: "error", message: "Task not found" };
    if (req.tasks[taskIndex].done)
      return { status: "error", message: "Cannot delete completed task" };

    req.tasks.splice(taskIndex, 1);
    await this.saveTasks();

    const progressTable = this.formatTaskProgressTable(requestId);
    return {
      status: "task_deleted",
      message: `Task ${taskId} has been deleted.\n${progressTable}`,
    };
  }
} 