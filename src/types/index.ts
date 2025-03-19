import { z } from "zod";

// Task and Project Interfaces
export interface Task {
  id: string;
  title: string;
  description: string;
  status: "not started" | "in progress" | "done";
  approved: boolean;
  completedDetails: string;
}

export interface Project {
  projectId: string;
  initialPrompt: string;
  projectPlan: string;
  tasks: Task[];
  completed: boolean;
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

// Tool schemas
// Project action schemas
const ListProjectActionSchema = z.object({
  action: z.literal("list"),
  arguments: z.object({}).strict()
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
