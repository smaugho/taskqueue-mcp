import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { TaskManagerFile, ErrorCode } from "../types/index.js";
import { createError } from "../utils/errors.js";

export interface InitializedTaskData {
  data: TaskManagerFile;
  maxProjectId: number;
  maxTaskId: number;
}

export class FileSystemService {
  private filePath: string;
  // Simple in-memory queue to prevent concurrent file operations
  private operationInProgress: boolean = false;
  private operationQueue: (() => void)[] = [];

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Gets the platform-appropriate app data directory
   */
  public static getAppDataDir(): string {
    const platform = process.platform;
    
    if (platform === 'darwin') {
      // macOS: ~/Library/Application Support/taskqueue-mcp
      return join(homedir(), 'Library', 'Application Support', 'taskqueue-mcp');
    } else if (platform === 'win32') {
      // Windows: %APPDATA%\taskqueue-mcp (usually C:\Users\<user>\AppData\Roaming\taskqueue-mcp)
      return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'taskqueue-mcp');
    } else {
      // Linux/Unix/Others: Use XDG Base Directory if available, otherwise ~/.local/share/taskqueue-mcp
      const xdgDataHome = process.env.XDG_DATA_HOME;
      const linuxDefaultDir = join(homedir(), '.local', 'share', 'taskqueue-mcp');
      return xdgDataHome ? join(xdgDataHome, 'taskqueue-mcp') : linuxDefaultDir;
    }
  }

  /**
   * Queue a file operation to prevent concurrent access
   * @param operation The operation to perform
   * @returns Promise that resolves when the operation completes
   */
  private async queueOperation<T>(operation: () => Promise<T>): Promise<T> {
    // If another operation is in progress, wait for it to complete
    if (this.operationInProgress) {
      return new Promise<T>((resolve, reject) => {
        this.operationQueue.push(() => {
          this.executeOperation(operation).then(resolve).catch(reject);
        });
      });
    }

    return this.executeOperation(operation);
  }

  /**
   * Execute a file operation with mutex protection
   * @param operation The operation to perform
   * @returns Promise that resolves when the operation completes
   */
  private async executeOperation<T>(operation: () => Promise<T>): Promise<T> {
    this.operationInProgress = true;
    try {
      return await operation();
    } finally {
      this.operationInProgress = false;
      // Process the next operation in the queue, if any
      const nextOperation = this.operationQueue.shift();
      if (nextOperation) {
        nextOperation();
      }
    }
  }

  /**
   * Loads and initializes task data from the JSON file
   */
  public async loadAndInitializeTasks(): Promise<InitializedTaskData> {
    return this.queueOperation(async () => {
      const data = await this.loadTasks();
      const { maxProjectId, maxTaskId } = this.calculateMaxIds(data);
      
      return {
        data,
        maxProjectId,
        maxTaskId
      };
    });
  }

  /**
   * Explicitly reloads task data from the disk
   * This is useful when the file may have been changed by another process
   * @returns The latest task data from disk
   */
  public async reloadTasks(): Promise<TaskManagerFile> {
    return this.queueOperation(async () => {
      return this.loadTasks();
    });
  }

  /**
   * Calculate max IDs from task data
   */
  public calculateMaxIds(data: TaskManagerFile): { maxProjectId: number; maxTaskId: number } {
    const allTaskIds: number[] = [];
    const allProjectIds: number[] = [];

    for (const proj of data.projects) {
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

    return {
      maxProjectId: allProjectIds.length > 0 ? Math.max(...allProjectIds) : 0,
      maxTaskId: allTaskIds.length > 0 ? Math.max(...allTaskIds) : 0
    };
  }

  /**
   * Loads raw task data from the JSON file
   */
  private async loadTasks(): Promise<TaskManagerFile> {
    try {
      const data = await readFile(this.filePath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      // Initialize with empty data for any initialization error
      // This includes file not found, permission issues, invalid JSON, etc.
      return { projects: [] };
    }
  }

  /**
   * Saves task data to the JSON file with an in-memory mutex to prevent concurrent writes
   */
  public async saveTasks(data: TaskManagerFile): Promise<void> {
    return this.queueOperation(async () => {
      try {
        // Ensure directory exists before writing
        const dir = dirname(this.filePath);
        await mkdir(dir, { recursive: true });
        
        // Write to the file
        await writeFile(
          this.filePath,
          JSON.stringify(data, null, 2),
          "utf-8"
        );
      } catch (error) {
        if (error instanceof Error && error.message.includes("EROFS")) {
          throw createError(
            ErrorCode.ReadOnlyFileSystem,
            "Cannot save tasks: read-only file system",
            { originalError: error }
          );
        }
        throw createError(
          ErrorCode.FileWriteError,
          "Failed to save tasks file",
          { originalError: error }
        );
      }
    });
  }
} 