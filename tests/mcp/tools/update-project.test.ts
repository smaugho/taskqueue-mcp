import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  setupTestContext,
  teardownTestContext,
  verifyCallToolResult,
  createTestProjectInFile,
  verifyProjectInFile,
  TestContext,
  verifyToolExecutionError,
  verifyToolSuccessResponse,
  verifyProtocolError
} from '../test-helpers.js';
import { CallToolResult, McpError } from '@modelcontextprotocol/sdk/types.js';

describe('update_project Tool', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestContext();
  });

  afterAll(async () => {
    await teardownTestContext(context);
  });

  describe('Success Cases', () => {
    it('should update only initialPrompt in a project', async () => {
      // Create test data directly in file
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Original Prompt",
        projectPlan: "Original Plan",
        completed: false
      });

      // Update project initialPrompt
      const result = await context.client.callTool({
        name: "update_project",
        arguments: {
          projectId: project.projectId,
          initialPrompt: "Updated Prompt"
        }
      }) as CallToolResult;

      // Verify response format
      verifyCallToolResult(result);
      expect(result.isError).toBeFalsy();

      // Verify response content
      const data = verifyToolSuccessResponse(result);
      expect(data).toHaveProperty('projectId', project.projectId);
      expect(data).toHaveProperty('initialPrompt', 'Updated Prompt');
      expect(data).toHaveProperty('projectPlan', 'Original Plan');
      
      // Verify file was updated correctly
      await verifyProjectInFile(context.testFilePath, project.projectId, {
        initialPrompt: "Updated Prompt",
        projectPlan: "Original Plan"
      });
    });

    it('should update only projectPlan in a project', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Original Prompt",
        projectPlan: "Original Plan",
        completed: false
      });

      const result = await context.client.callTool({
        name: "update_project",
        arguments: {
          projectId: project.projectId,
          projectPlan: "Updated Plan"
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      expect(result.isError).toBeFalsy();

      const data = verifyToolSuccessResponse(result);
      expect(data).toHaveProperty('projectId', project.projectId);
      expect(data).toHaveProperty('initialPrompt', 'Original Prompt');
      expect(data).toHaveProperty('projectPlan', 'Updated Plan');
      
      await verifyProjectInFile(context.testFilePath, project.projectId, {
        initialPrompt: "Original Prompt",
        projectPlan: "Updated Plan"
      });
    });

    it('should update both initialPrompt and projectPlan in a project', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Original Prompt",
        projectPlan: "Original Plan",
        completed: false
      });

      const result = await context.client.callTool({
        name: "update_project",
        arguments: {
          projectId: project.projectId,
          initialPrompt: "Updated Prompt",
          projectPlan: "Updated Plan"
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      expect(result.isError).toBeFalsy();

      const data = verifyToolSuccessResponse(result);
      expect(data).toHaveProperty('projectId', project.projectId);
      expect(data).toHaveProperty('initialPrompt', 'Updated Prompt');
      expect(data).toHaveProperty('projectPlan', 'Updated Plan');
      
      await verifyProjectInFile(context.testFilePath, project.projectId, {
        initialPrompt: "Updated Prompt",
        projectPlan: "Updated Plan"
      });
    });
  });

  describe('Error Cases', () => {
    it('should return error for non-existent project', async () => {
      const result = await context.client.callTool({
        name: "update_project",
        arguments: {
          projectId: "non_existent_project",
          initialPrompt: "New Prompt"
        }
      }) as CallToolResult;

      verifyToolExecutionError(result, /Project non_existent_project not found/);
    });

    it('should return error when trying to update a completed project', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Completed Project",
        projectPlan: "Completed Plan",
        completed: true
      });

      const result = await context.client.callTool({
        name: "update_project",
        arguments: {
          projectId: project.projectId,
          initialPrompt: "New Prompt"
        }
      }) as CallToolResult;

      verifyToolExecutionError(result, /Project is already completed/);
    });

    it('should return error when neither initialPrompt nor projectPlan is provided', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Test Project",
        projectPlan: "Test Plan",
        completed: false
      });

      // Use expect().rejects.toThrowError() to assert that the promise rejects
      // with an error matching the expected message.
      await expect(context.client.callTool({
        name: "update_project",
        arguments: {
          projectId: project.projectId
          // Missing both initialPrompt and projectPlan
        }
      })).rejects.toThrowError(/At least one of initialPrompt or projectPlan must be provided/);
    });
  });
}); 