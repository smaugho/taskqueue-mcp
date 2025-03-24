import { z } from "zod";

// Task and Project Interfaces
export interface Task {
  id: string;
  title: string;
  description: string;
  status: "not started" | "in progress" | "done";
  approved: boolean;
  completedDetails: string;
  toolRecommendations?: string;
  ruleRecommendations?: string;
}

export interface Project {
  projectId: string;
  initialPrompt: string;
  projectPlan: string;
  tasks: Task[];
  completed: boolean;
  autoApprove?: boolean;
}

export interface TaskManagerFile {
  projects: Project[];
}

// Define valid task status transitions
export const VALID_STATUS_TRANSITIONS = {
  "not started": ["in progress"],
  "in progress": ["done", "not started"],
  "done": ["in progress"]
} as const;

export type TaskState = "open" | "pending_approval" | "completed" | "all";

// Tool schemas
// Project action schemas
const ListProjectActionSchema = z.object({
  action: z.literal("list"),
  arguments: z.object({
    state: z.enum(["open", "pending_approval", "completed", "all"]).optional()
  }).strict()
});

const CreateProjectActionSchema = z.object({
  action: z.literal("create"),
  arguments: z.object({
    initialPrompt: z.string().min(1, "Initial prompt is required"),
    projectPlan: z.string().optional(),
    tasks: z.array(z.object({
      title: z.string().min(1, "Task title is required"),
      description: z.string().min(1, "Task description is required")
    })).min(1, "At least one task is required")
  }).strict()
});

const DeleteProjectActionSchema = z.object({
  action: z.literal("delete"),
  arguments: z.object({
    projectId: z.string().min(1, "Project ID is required")
  }).strict()
});

const AddTasksActionSchema = z.object({
  action: z.literal("add_tasks"),
  arguments: z.object({
    projectId: z.string().min(1, "Project ID is required"),
    tasks: z.array(z.object({
      title: z.string().min(1, "Task title is required"),
      description: z.string().min(1, "Task description is required")
    })).min(1, "At least one task is required")
  }).strict()
});

const FinalizeActionSchema = z.object({
  action: z.literal("finalize"),
  arguments: z.object({
    projectId: z.string().min(1, "Project ID is required")
  }).strict()
});

// Task action schemas
const ListTaskActionSchema = z.object({
  action: z.literal("list"),
  arguments: z.object({
    projectId: z.string().min(1, "Project ID is required").optional(),
    state: z.enum(["open", "pending_approval", "completed", "all"]).optional()
  }).strict()
});

const ReadTaskActionSchema = z.object({
  action: z.literal("read"),
  arguments: z.object({
    taskId: z.string().min(1, "Task ID is required")
  }).strict()
});

const UpdateTaskActionSchema = z.object({
  action: z.literal("update"),
  arguments: z.object({
    projectId: z.string().min(1, "Project ID is required"),
    taskId: z.string().min(1, "Task ID is required"),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["not started", "in progress", "done"]).optional(),
    completedDetails: z.string().optional()
  }).strict().refine(
    data => {
      if (data.status === 'done' && !data.completedDetails) {
        return false;
      }
      return true;
    },
    {
      message: 'completedDetails is required when status is "done"',
      path: ['completedDetails']
    }
  )
});

const DeleteTaskActionSchema = z.object({
  action: z.literal("delete"),
  arguments: z.object({
    projectId: z.string().min(1, "Project ID is required"),
    taskId: z.string().min(1, "Task ID is required")
  }).strict()
});

// Combined action schemas using discriminated unions
export const ProjectActionSchema = z.discriminatedUnion("action", [
  ListProjectActionSchema,
  CreateProjectActionSchema,
  DeleteProjectActionSchema,
  AddTasksActionSchema,
  FinalizeActionSchema
]);

export const TaskActionSchema = z.discriminatedUnion("action", [
  ListTaskActionSchema,
  ReadTaskActionSchema,
  UpdateTaskActionSchema,
  DeleteTaskActionSchema
]);

// The project tool schema
export const ProjectToolSchema = z.object({
  tool: z.literal("project"),
  params: ProjectActionSchema
});

// The task tool schema
export const TaskToolSchema = z.object({
  tool: z.literal("task"),
  params: TaskActionSchema
});

// Error Types
export enum ErrorCategory {
  Validation = 'VALIDATION',
  ResourceNotFound = 'RESOURCE_NOT_FOUND',
  StateTransition = 'STATE_TRANSITION',
  FileSystem = 'FILE_SYSTEM',
  TestAssertion = 'TEST_ASSERTION',
  Unknown = 'UNKNOWN'
}

export enum ErrorCode {
  // Validation Errors (1000-1999)
  MissingParameter = 'ERR_1000',
  InvalidState = 'ERR_1001',
  InvalidArgument = 'ERR_1002',

  // Resource Not Found Errors (2000-2999)
  ProjectNotFound = 'ERR_2000',
  TaskNotFound = 'ERR_2001',
  EmptyTaskFile = 'ERR_2002',

  // State Transition Errors (3000-3999)
  TaskNotDone = 'ERR_3000',
  ProjectAlreadyCompleted = 'ERR_3001',
  CannotDeleteCompletedTask = 'ERR_3002',
  TasksNotAllDone = 'ERR_3003',
  TasksNotAllApproved = 'ERR_3004',

  // File System Errors (4000-4999)
  FileReadError = 'ERR_4000',
  FileWriteError = 'ERR_4001',
  FileParseError = 'ERR_4002',
  ReadOnlyFileSystem = 'ERR_4003',

  // Test Assertion Errors (5000-5999)
  MissingExpectedData = 'ERR_5000',
  InvalidResponseFormat = 'ERR_5001',

  // Unknown Error (9999)
  Unknown = 'ERR_9999'
}

export interface StandardError {
  status: "error";
  code: ErrorCode;
  category: ErrorCategory;
  message: string;
  details?: unknown;
}

// Generic success response
export interface SuccessResponse<T = unknown> {
  status: "success";
  data: T;
  message?: string;
}

// Error response
export interface ErrorResponse {
  status: "error";
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

// Next task response
export interface NextTaskResponse {
  status: "next_task";
  data: {
    id: string;
    title: string;
    description: string;
    message?: string;
  };
}

// All tasks done response
export interface AllTasksDoneResponse {
  status: "all_tasks_done";
  data: {
    message: string;
  };
}

// Combined union type for all response types
export type StandardResponse<T = unknown> = 
  | SuccessResponse<T>
  | ErrorResponse
  | NextTaskResponse
  | AllTasksDoneResponse;
