import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  setupTestContext,
  teardownTestContext,
  verifyToolResponse,
  createTestProjectInFile,
  createTestTaskInFile,
  verifyTaskInFile,
  TestContext,
  ToolResponse
} from '../test-helpers.js';

describe('approve_task Tool', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestContext();
  });

  afterAll(async () => {
    await teardownTestContext(context);
  });

  describe('Success Cases', () => {
    it('should approve a completed task', async () => {
      // Create a project with a completed task
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Test Project"
      });
      const task = await createTestTaskInFile(context.testFilePath, project.projectId, {
        title: "Test Task",
        status: "done",
        completedDetails: "Task completed in test"
      });

      // Approve the task
      const result = await context.client.callTool({
        name: "approve_task",
        arguments: {
          projectId: project.projectId,
          taskId: task.id
        }
      }) as ToolResponse;

      // Verify response
      verifyToolResponse(result);
      expect(result.isError).toBeFalsy();

      // Verify task was approved in file
      await verifyTaskInFile(context.testFilePath, project.projectId, task.id, {
        approved: true,
        status: "done"
      });
    });

    it('should handle auto-approved tasks', async () => {
      // Create a project with auto-approve enabled
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Auto-approve Project",
        autoApprove: true
      });
      const task = await createTestTaskInFile(context.testFilePath, project.projectId, {
        title: "Auto Task",
        status: "done",
        completedDetails: "Auto-approved task completed"
      });

      // Try to approve an auto-approved task
      const result = await context.client.callTool({
        name: "approve_task",
        arguments: {
          projectId: project.projectId,
          taskId: task.id
        }
      }) as ToolResponse;

      verifyToolResponse(result);
      expect(result.isError).toBeFalsy();

      // Verify task was auto-approved
      await verifyTaskInFile(context.testFilePath, project.projectId, task.id, {
        approved: true,
        status: "done"
      });
    });

    it('should allow approving multiple tasks in sequence', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Multi-task Project"
      });

      // Create and approve multiple tasks
      const tasks = await Promise.all([
        createTestTaskInFile(context.testFilePath, project.projectId, {
          title: "Task 1",
          status: "done",
          completedDetails: "First task done"
        }),
        createTestTaskInFile(context.testFilePath, project.projectId, {
          title: "Task 2",
          status: "done",
          completedDetails: "Second task done"
        })
      ]);

      // Approve tasks in sequence
      for (const task of tasks) {
        const result = await context.client.callTool({
          name: "approve_task",
          arguments: {
            projectId: project.projectId,
            taskId: task.id
          }
        }) as ToolResponse;

        verifyToolResponse(result);
        expect(result.isError).toBeFalsy();

        await verifyTaskInFile(context.testFilePath, project.projectId, task.id, {
          approved: true
        });
      }
    });
  });

  describe('Error Cases', () => {
    it('should return error for non-existent project', async () => {
      const result = await context.client.callTool({
        name: "approve_task",
        arguments: {
          projectId: "non_existent_project",
          taskId: "task-1"
        }
      }) as ToolResponse;

      verifyToolResponse(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Project non_existent_project not found');
    });

    it('should return error for non-existent task', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Test Project"
      });

      const result = await context.client.callTool({
        name: "approve_task",
        arguments: {
          projectId: project.projectId,
          taskId: "non_existent_task"
        }
      }) as ToolResponse;

      verifyToolResponse(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Task non_existent_task not found');
    });

    it('should return error when approving incomplete task', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Test Project"
      });
      const task = await createTestTaskInFile(context.testFilePath, project.projectId, {
        title: "Incomplete Task",
        status: "in progress"
      });

      const result = await context.client.callTool({
        name: "approve_task",
        arguments: {
          projectId: project.projectId,
          taskId: task.id
        }
      }) as ToolResponse;

      verifyToolResponse(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Cannot approve incomplete task');
    });

    it('should return error when approving already approved task', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Test Project"
      });
      const task = await createTestTaskInFile(context.testFilePath, project.projectId, {
        title: "Approved Task",
        status: "done",
        approved: true,
        completedDetails: "Already approved"
      });

      const result = await context.client.callTool({
        name: "approve_task",
        arguments: {
          projectId: project.projectId,
          taskId: task.id
        }
      }) as ToolResponse;

      verifyToolResponse(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Task is already approved');
    });
  });
}); 