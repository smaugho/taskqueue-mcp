import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  setupTestContext,
  teardownTestContext,
  verifyCallToolResult,
  verifyProtocolError,
  createTestProject,
  getFirstTaskId,
  TestContext
} from '../test-helpers.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
describe('list_projects Tool', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestContext();
  });

  afterAll(async () => {
    await teardownTestContext(context);
  });

  describe('Success Cases', () => {
    it('should list projects with no filters', async () => {
      // Create a test project first
      const projectId = await createTestProject(context.client);

      // Test list_projects
      const result = await context.client.callTool({
        name: "list_projects",
        arguments: {}
      }) as CallToolResult;

      // Verify response format
      verifyCallToolResult(result);
      expect(result.isError).toBeFalsy();

      // Parse and verify response data
      const responseData = JSON.parse((result.content[0] as { text: string }).text);
      expect(responseData).toHaveProperty('data');
      expect(responseData.data).toHaveProperty('projects');
      expect(Array.isArray(responseData.data.projects)).toBe(true);
      
      // Verify our test project is in the list
      const projects = responseData.data.projects;
      const testProject = projects.find((p: any) => p.projectId === projectId);
      expect(testProject).toBeDefined();
      expect(testProject).toHaveProperty('initialPrompt');
      expect(testProject).toHaveProperty('taskCount');
    });

    it('should filter projects by state', async () => {
      // Create two projects with different states
      const openProjectId = await createTestProject(context.client, {
        initialPrompt: "Open Project",
        tasks: [{ title: "Open Task", description: "This task will remain open" }]
      });

      const completedProjectId = await createTestProject(context.client, {
        initialPrompt: "Completed Project",
        tasks: [{ title: "Done Task", description: "This task will be completed" }],
        autoApprove: true
      });

      // Complete the second project's task
      const taskId = await getFirstTaskId(context.client, completedProjectId);
      await context.client.callTool({
        name: "update_task",
        arguments: {
          projectId: completedProjectId,
          taskId,
          status: "done",
          completedDetails: "Task completed in test"
        }
      });

      // Test filtering by 'open' state
      const openResult = await context.client.callTool({
        name: "list_projects",
        arguments: { state: "open" }
      }) as CallToolResult;

      verifyCallToolResult(openResult);
      const openData = JSON.parse((openResult.content[0] as { text: string }).text);
      const openProjects = openData.data.projects;
      expect(openProjects.some((p: any) => p.projectId === openProjectId)).toBe(true);
      expect(openProjects.some((p: any) => p.projectId === completedProjectId)).toBe(false);

      // Test filtering by 'completed' state
      const completedResult = await context.client.callTool({
        name: "list_projects",
        arguments: { state: "completed" }
      }) as CallToolResult;

      verifyCallToolResult(completedResult);
      const completedData = JSON.parse((completedResult.content[0] as { text: string }).text);
      const completedProjects = completedData.data.projects;
      expect(completedProjects.some((p: any) => p.projectId === completedProjectId)).toBe(true);
      expect(completedProjects.some((p: any) => p.projectId === openProjectId)).toBe(false);
    });
  });

  describe('Error Cases', () => {
    it('should handle invalid state parameter', async () => {
      try {
        await context.client.callTool({
          name: "list_projects",
          arguments: { state: "invalid_state" }
        });
        fail('Expected error was not thrown');
      } catch (error: any) {
        verifyProtocolError(error, -32602, "Invalid parameter: state");
      }
    });

    it('should handle server errors gracefully', async () => {
      // Simulate a server error by using an invalid file path
      const transport = context.transport as any;
      transport.env = {
        ...transport.env,
        TASK_MANAGER_FILE_PATH: '/invalid/path/that/does/not/exist'
      };

      const result = await context.client.callTool({
        name: "list_projects",
        arguments: {}
      }) as CallToolResult;

      verifyCallToolResult(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Error: (ENOENT|Failed to read)/);

      // Reset the file path
      transport.env.TASK_MANAGER_FILE_PATH = context.testFilePath;
    });
  });
}); 