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
  ConfigurationError = 'ERR_1003',

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

// Define the structure for createProject success data
export interface ProjectCreationSuccessData {
  projectId: string;
  totalTasks: number;
  tasks: Array<{ id: string; title: string; description: string }>;
  message: string;
}

// --- NEW Success Data Interfaces ---

export interface ApproveTaskSuccessData {
  projectId: string;
  task: {
    id: string;
    title: string;
    description: string;
    completedDetails: string;
    approved: boolean;
  };
}

export interface ApproveProjectSuccessData {
  projectId: string;
  message: string;
}

export interface OpenTaskSuccessData {
  projectId: string;
  initialPrompt: string;
  projectPlan: string;
  completed: boolean;
  task: Task; // Use the full Task type
}

export interface ListProjectsSuccessData {
  message: string;
  projects: Array<{
    projectId: string;
    initialPrompt: string;
    totalTasks: number;
    completedTasks: number;
    approvedTasks: number;
  }>;
}

export interface ListTasksSuccessData {
  message: string;
  tasks: Task[]; // Use the full Task type
}

export interface AddTasksSuccessData {
  message: string;
  newTasks: Array<{ id: string; title: string; description: string }>;
}

export interface DeleteTaskSuccessData {
  message: string;
}

export interface ReadProjectSuccessData {
  projectId: string;
  initialPrompt: string;
  projectPlan: string;
  completed: boolean;
  tasks: Task[]; // Use the full Task type
}

// --- End NEW Success Data Interfaces ---

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
