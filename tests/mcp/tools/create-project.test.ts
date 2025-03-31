import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  setupTestContext,
  teardownTestContext,
  verifyCallToolResult,
  verifyProjectInFile,
  verifyTaskInFile,
  readTaskManagerFile,
  TestContext
} from '../test-helpers.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

describe('create_project Tool', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestContext();
  });

  afterAll(async () => {
    await teardownTestContext(context);
  });

  describe('Success Cases', () => {
    it('should create a project with minimal parameters', async () => {
      const result = await context.client.callTool({
        name: "create_project",
        arguments: {
          initialPrompt: "Test Project",
          tasks: [
            { title: "Task 1", description: "First test task" }
          ]
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      expect(result.isError).toBeFalsy();

      // Parse and verify response
      const responseData = JSON.parse((result.content[0] as { text: string }).text);
      expect(responseData.data).toHaveProperty('projectId');
      const projectId = responseData.data.projectId;

      // Verify project was created in file
      await verifyProjectInFile(context.testFilePath, projectId, {
        initialPrompt: "Test Project",
        completed: false
      });

      // Verify task was created
      await verifyTaskInFile(context.testFilePath, projectId, responseData.data.tasks[0].id, {
        title: "Task 1",
        description: "First test task",
        status: "not started",
        approved: false
      });
    });

    it('should create a project with multiple tasks', async () => {
      const result = await context.client.callTool({
        name: "create_project",
        arguments: {
          initialPrompt: "Multi-task Project",
          tasks: [
            { title: "Task 1", description: "First task" },
            { title: "Task 2", description: "Second task" },
            { title: "Task 3", description: "Third task" }
          ]
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      const responseData = JSON.parse((result.content[0] as { text: string }).text);
      const projectId = responseData.data.projectId;

      // Verify all tasks were created
      const data = await readTaskManagerFile(context.testFilePath);
      const project = data.projects.find(p => p.projectId === projectId);
      expect(project?.tasks).toHaveLength(3);
      expect(project?.tasks.map(t => t.title)).toEqual([
        "Task 1",
        "Task 2",
        "Task 3"
      ]);
    });

    it('should create a project with auto-approve enabled', async () => {
      const result = await context.client.callTool({
        name: "create_project",
        arguments: {
          initialPrompt: "Auto-approve Project",
          tasks: [
            { title: "Auto Task", description: "This task will be auto-approved" }
          ],
          autoApprove: true
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      const responseData = JSON.parse((result.content[0] as { text: string }).text);
      const projectId = responseData.data.projectId;

      // Verify project was created with auto-approve
      const data = await readTaskManagerFile(context.testFilePath);
      const project = data.projects.find(p => p.projectId === projectId);
      expect(project).toHaveProperty('autoApprove', true);
    });

    it('should create a project with project plan', async () => {
      const result = await context.client.callTool({
        name: "create_project",
        arguments: {
          initialPrompt: "Planned Project",
          projectPlan: "Detailed plan for the project execution",
          tasks: [
            { title: "Planned Task", description: "Task with a plan" }
          ]
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      const responseData = JSON.parse((result.content[0] as { text: string }).text);
      const projectId = responseData.data.projectId;

      await verifyProjectInFile(context.testFilePath, projectId, {
        initialPrompt: "Planned Project",
        projectPlan: "Detailed plan for the project execution"
      });
    });

    it('should create tasks with tool and rule recommendations', async () => {
      const result = await context.client.callTool({
        name: "create_project",
        arguments: {
          initialPrompt: "Project with Recommendations",
          tasks: [{
            title: "Task with Recommendations",
            description: "Task description",
            toolRecommendations: "Use tool X and Y",
            ruleRecommendations: "Follow rules A and B"
          }]
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      const responseData = JSON.parse((result.content[0] as { text: string }).text);
      const projectId = responseData.data.projectId;
      const taskId = responseData.data.tasks[0].id;

      await verifyTaskInFile(context.testFilePath, projectId, taskId, {
        toolRecommendations: "Use tool X and Y",
        ruleRecommendations: "Follow rules A and B"
      });
    });
  });

  describe('Error Cases', () => {
    it('should return error for missing required parameters', async () => {
      const result = await context.client.callTool({
        name: "create_project",
        arguments: {
          // Missing initialPrompt and tasks
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Missing required parameter');
    });

    it('should return error for empty tasks array', async () => {
      const result = await context.client.callTool({
        name: "create_project",
        arguments: {
          initialPrompt: "Empty Project",
          tasks: []
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Project must have at least one task');
    });

    it('should return error for invalid task data', async () => {
      const result = await context.client.callTool({
        name: "create_project",
        arguments: {
          initialPrompt: "Invalid Task Project",
          tasks: [
            { title: "Task 1" } // Missing required description
          ]
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Missing required task parameter: description');
    });

    it('should return error for duplicate task titles', async () => {
      const result = await context.client.callTool({
        name: "create_project",
        arguments: {
          initialPrompt: "Duplicate Tasks Project",
          tasks: [
            { title: "Same Title", description: "First task" },
            { title: "Same Title", description: "Second task" }
          ]
        }
      }) as CallToolResult;

      verifyCallToolResult(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Duplicate task title');
    });
  });
}); 