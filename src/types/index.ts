import { z } from "zod";

// Task and Request Interfaces
export interface Task {
  id: string;
  title: string;
  description: string;
  done: boolean;
  approved: boolean;
  completedDetails: string;
}

export interface RequestEntry {
  requestId: string;
  originalRequest: string;
  splitDetails: string;
  tasks: Task[];
  completed: boolean;
}

export interface TaskManagerFile {
  requests: RequestEntry[];
}

// Zod Schemas
export const RequestPlanningSchema = z.object({
  originalRequest: z.string(),
  splitDetails: z.string().optional(),
  tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
    })
  ),
});

export const GetNextTaskSchema = z.object({
  requestId: z.string(),
});

export const MarkTaskDoneSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  completedDetails: z.string().optional(),
});

export const ApproveTaskCompletionSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
});

export const ApproveRequestCompletionSchema = z.object({
  requestId: z.string(),
});

export const OpenTaskDetailsSchema = z.object({
  taskId: z.string(),
});

export const ListRequestsSchema = z.object({});

export const AddTasksToRequestSchema = z.object({
  requestId: z.string(),
  tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
    })
  ),
});

export const UpdateTaskSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});

export const DeleteTaskSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
}); 