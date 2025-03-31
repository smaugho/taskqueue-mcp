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

describe('update_task Tool', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestContext();
  });

  afterAll(async () => {
    await teardownTestContext(context);
  });

  describe('Success Cases', () => {
    it('should update task status to in progress', async () => {
      // Create test data directly in file
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Test Project"
      });
      const task = await createTestTaskInFile(context.testFilePath, project.projectId, {
        title: "Test Task",
        status: "not started"
      });

      // Update task status
      const result = await context.client.callTool({
        name: "update_task",
        arguments: {
          projectId: project.projectId,
          taskId: task.id,
          status: "in progress"
        }
      }) as ToolResponse;

      // Verify response
      verifyToolResponse(result);
      expect(result.isError).toBeFalsy();

      // Verify file was updated
      await verifyTaskInFile(context.testFilePath, project.projectId, task.id, {
        status: "in progress"
      });
    });

    it('should update task to done with completedDetails', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Test Project"
      });
      const task = await createTestTaskInFile(context.testFilePath, project.projectId, {
        title: "Test Task",
        status: "in progress"
      });

      const result = await context.client.callTool({
        name: "update_task",
        arguments: {
          projectId: project.projectId,
          taskId: task.id,
          status: "done",
          completedDetails: "Task completed in test"
        }
      }) as ToolResponse;

      verifyToolResponse(result);
      expect(result.isError).toBeFalsy();

      await verifyTaskInFile(context.testFilePath, project.projectId, task.id, {
        status: "done",
        completedDetails: "Task completed in test"
      });
    });

    it('should update task title and description', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Test Project"
      });
      const task = await createTestTaskInFile(context.testFilePath, project.projectId, {
        title: "Original Title",
        description: "Original Description"
      });

      const result = await context.client.callTool({
        name: "update_task",
        arguments: {
          projectId: project.projectId,
          taskId: task.id,
          title: "Updated Title",
          description: "Updated Description"
        }
      }) as ToolResponse;

      verifyToolResponse(result);
      expect(result.isError).toBeFalsy();

      await verifyTaskInFile(context.testFilePath, project.projectId, task.id, {
        title: "Updated Title",
        description: "Updated Description"
      });
    });
  });

  describe('Error Cases', () => {
    it('should return error for invalid status value', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Test Project"
      });
      const task = await createTestTaskInFile(context.testFilePath, project.projectId, {
        title: "Test Task"
      });

      const result = await context.client.callTool({
        name: "update_task",
        arguments: {
          projectId: project.projectId,
          taskId: task.id,
          status: "invalid_status"  // Invalid status value
        }
      }) as ToolResponse;

      verifyToolResponse(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Invalid status: must be one of');
    });

    it('should return error when marking task as done without completedDetails', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Test Project"
      });
      const task = await createTestTaskInFile(context.testFilePath, project.projectId, {
        title: "Test Task",
        status: "in progress"
      });

      const result = await context.client.callTool({
        name: "update_task",
        arguments: {
          projectId: project.projectId,
          taskId: task.id,
          status: "done"
          // Missing required completedDetails
        }
      }) as ToolResponse;

      verifyToolResponse(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Missing or invalid required parameter: completedDetails');
    });

    it('should return error for non-existent project', async () => {
      const result = await context.client.callTool({
        name: "update_task",
        arguments: {
          projectId: "non_existent_project",
          taskId: "task-1",
          status: "in progress"
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
        name: "update_task",
        arguments: {
          projectId: project.projectId,
          taskId: "non_existent_task",
          status: "in progress"
        }
      }) as ToolResponse;

      verifyToolResponse(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Task non_existent_task not found');
    });

    it('should return error when updating approved task', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Test Project"
      });
      const task = await createTestTaskInFile(context.testFilePath, project.projectId, {
        title: "Test Task",
        status: "done",
        approved: true,
        completedDetails: "Already completed"
      });

      const result = await context.client.callTool({
        name: "update_task",
        arguments: {
          projectId: project.projectId,
          taskId: task.id,
          title: "New Title"
        }
      }) as ToolResponse;

      verifyToolResponse(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Cannot modify approved task');
    });
  });
}); 