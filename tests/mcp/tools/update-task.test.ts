import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  setupTestContext,
  teardownTestContext,
  verifyCallToolResult,
  createTestProjectInFile,
  createTestTaskInFile,
  verifyTaskInFile,
  TestContext,
  verifyProtocolError
} from '../test-helpers.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { verifyToolExecutionError } from '../test-helpers.js';

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
      }) as CallToolResult;

      // Verify response
      verifyCallToolResult(result);
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
      }) as CallToolResult;

      verifyCallToolResult(result);
      expect(result.isError).toBeFalsy();

      await verifyTaskInFile(context.testFilePath, project.projectId, task.id, {
        status: "done",
        completedDetails: "Task completed in test"
      });
    });

    it('should return reminder message when marking task done in a project requiring approval', async () => {
      // Create a project that requires approval
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Project Requiring Approval",
        autoApprove: false // Explicitly set for clarity
      });
      const task = await createTestTaskInFile(context.testFilePath, project.projectId, {
        title: "Task to be Approved",
        status: "in progress"
      });

      // Mark the task as done
      const result = await context.client.callTool({
        name: "update_task",
        arguments: {
          projectId: project.projectId,
          taskId: task.id,
          status: "done",
          completedDetails: "Task finished, awaiting approval."
        }
      }) as CallToolResult;

      // Verify the response includes the approval reminder within the JSON structure
      verifyCallToolResult(result); // Basic verification
      expect(result.isError).toBeFalsy();
      const responseText = (result.content[0] as { text: string }).text;
      // Parse the JSON response
      const responseData = JSON.parse(responseText);
      
      // Check the message property
      expect(responseData).toHaveProperty('message');
      const expectedMessage = `Task marked as done but requires approval.\nTo approve, run: npx taskqueue approve-task -- ${project.projectId} ${task.id}`;
      expect(responseData.message).toBe(expectedMessage);
      
      // Check that the core task data is present under the 'task' key
      expect(responseData).toHaveProperty('task');
      expect(responseData.task.id).toBe(task.id);
      expect(responseData.task.status).toBe('done');
      expect(responseData.task.completedDetails).toBe("Task finished, awaiting approval.");

      // Also verify the task state in the file
      await verifyTaskInFile(context.testFilePath, project.projectId, task.id, {
        status: "done",
        completedDetails: "Task finished, awaiting approval.",
        approved: false // Should not be approved yet
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
      }) as CallToolResult;

      verifyCallToolResult(result);
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

      try {
        await context.client.callTool({
          name: "update_task",
          arguments: {
            projectId: project.projectId,
            taskId: task.id,
            status: "invalid_status"  // Invalid status value
          }
        });
        fail('Expected error was not thrown');
      } catch (error) {
        verifyProtocolError(error, -32602, "Invalid status: must be one of 'not started', 'in progress', 'done'");
      }
    });

    it('should return error when marking task as done without completedDetails', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Test Project"
      });
      const task = await createTestTaskInFile(context.testFilePath, project.projectId, {
        title: "Test Task",
        status: "in progress"
      });

      try {
        await context.client.callTool({
          name: "update_task",
          arguments: {
            projectId: project.projectId,
            taskId: task.id,
            status: "done"
            // Missing required completedDetails
          }
        });
        fail('Expected error was not thrown');
      } catch (error) {
        verifyProtocolError(error, -32602, "Invalid or missing required parameter: completedDetails (required when status = 'done') (Expected string)");
      }
    });

    it('should return error for non-existent project', async () => {
      const result = await context.client.callTool({
        name: "update_task",
        arguments: {
          projectId: "non_existent_project",
          taskId: "task-1",
          status: "in progress"
        }
      }) as CallToolResult;

      verifyToolExecutionError(result, /Project non_existent_project not found/);
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
      }) as CallToolResult;

      verifyToolExecutionError(result, /Task non_existent_task not found/);
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
      }) as CallToolResult;

      verifyToolExecutionError(result, /Cannot modify an approved task/);
    });
  });
}); 