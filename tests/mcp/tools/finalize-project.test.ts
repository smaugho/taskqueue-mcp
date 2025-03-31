import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  setupTestContext,
  teardownTestContext,
  verifyToolResponse,
  createTestProjectInFile,
  createTestTaskInFile,
  verifyProjectInFile,
  TestContext,
  ToolResponse
} from '../test-helpers.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

describe('finalize_project Tool', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestContext();
  });

  afterAll(async () => {
    await teardownTestContext(context);
  });

  describe('Success Cases', () => {
    it('should finalize a project with all tasks completed and approved', async () => {
      // Create a project with completed and approved tasks
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Test Project",
        completed: false
      });

      // Add completed and approved tasks
      await Promise.all([
        createTestTaskInFile(context.testFilePath, project.projectId, {
          title: "Task 1",
          description: "First task",
          status: "done",
          approved: true,
          completedDetails: "Task 1 completed"
        }),
        createTestTaskInFile(context.testFilePath, project.projectId, {
          title: "Task 2",
          description: "Second task",
          status: "done",
          approved: true,
          completedDetails: "Task 2 completed"
        })
      ]);

      // Finalize the project
      const result = await context.client.callTool({
        name: "finalize_project",
        arguments: {
          projectId: project.projectId
        }
      }) as ToolResponse;

      // Verify response
      verifyToolResponse(result);
      expect(result.isError).toBeFalsy();
      
      // Verify project state in file
      await verifyProjectInFile(context.testFilePath, project.projectId, {
        completed: true
      });
    });

    it('should finalize a project with auto-approved tasks', async () => {
      // Create a project with auto-approve enabled
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Auto-approve Project",
        autoApprove: true,
        completed: false
      });

      // Add completed tasks (they should be auto-approved)
      await Promise.all([
        createTestTaskInFile(context.testFilePath, project.projectId, {
          title: "Auto Task 1",
          description: "First auto-approved task",
          status: "done",
          approved: true,
          completedDetails: "Auto task 1 completed"
        }),
        createTestTaskInFile(context.testFilePath, project.projectId, {
          title: "Auto Task 2",
          description: "Second auto-approved task",
          status: "done",
          approved: true,
          completedDetails: "Auto task 2 completed"
        })
      ]);

      const result = await context.client.callTool({
        name: "finalize_project",
        arguments: {
          projectId: project.projectId
        }
      }) as ToolResponse;

      verifyToolResponse(result);
      expect(result.isError).toBeFalsy();
      
      await verifyProjectInFile(context.testFilePath, project.projectId, {
        completed: true,
        autoApprove: true
      });
    });
  });

  describe('Error Cases', () => {
    it('should return error when project has incomplete tasks', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Incomplete Project"
      });

      // Add mix of complete and incomplete tasks
      await Promise.all([
        createTestTaskInFile(context.testFilePath, project.projectId, {
          title: "Done Task",
          description: "Completed task",
          status: "done",
          approved: true,
          completedDetails: "This task is done"
        }),
        createTestTaskInFile(context.testFilePath, project.projectId, {
          title: "Pending Task",
          description: "Not done yet",
          status: "not started"
        })
      ]);

      const result = await context.client.callTool({
        name: "finalize_project",
        arguments: {
          projectId: project.projectId
        }
      }) as ToolResponse;

      verifyToolResponse(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Cannot finalize project: not all tasks are completed');
      
      // Verify project remains incomplete
      await verifyProjectInFile(context.testFilePath, project.projectId, {
        completed: false
      });
    });

    it('should return error when project has unapproved tasks', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Unapproved Tasks Project"
      });

      // Add completed but unapproved tasks
      await Promise.all([
        createTestTaskInFile(context.testFilePath, project.projectId, {
          title: "Unapproved Task 1",
          description: "Done but not approved",
          status: "done",
          approved: false,
          completedDetails: "Needs approval"
        }),
        createTestTaskInFile(context.testFilePath, project.projectId, {
          title: "Unapproved Task 2",
          description: "Also done but not approved",
          status: "done",
          approved: false,
          completedDetails: "Also needs approval"
        })
      ]);

      const result = await context.client.callTool({
        name: "finalize_project",
        arguments: {
          projectId: project.projectId
        }
      }) as ToolResponse;

      verifyToolResponse(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Cannot finalize project: not all tasks are approved');
      
      await verifyProjectInFile(context.testFilePath, project.projectId, {
        completed: false
      });
    });

    it('should return error when project is already completed', async () => {
      const project = await createTestProjectInFile(context.testFilePath, {
        initialPrompt: "Already Completed Project",
        completed: true
      });

      // Add completed and approved tasks
      await createTestTaskInFile(context.testFilePath, project.projectId, {
        title: "Done Task",
        description: "Already done",
        status: "done",
        approved: true,
        completedDetails: "Completed in the past"
      });

      const result = await context.client.callTool({
        name: "finalize_project",
        arguments: {
          projectId: project.projectId
        }
      }) as ToolResponse;

      verifyToolResponse(result);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Project is already completed');
    });

    it('should return error for non-existent project', async () => {
      try {
        await context.client.callTool({
          name: "finalize_project",
          arguments: {
            projectId: "non_existent_project"
          }
        });
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        const mcpError = error as McpError;
        expect(mcpError.code).toBe(-32602); // Invalid params error code
        expect(mcpError.message).toContain('Project non_existent_project not found');
      }
    });

    it('should return error for invalid project ID format', async () => {
      try {
        await context.client.callTool({
          name: "finalize_project",
          arguments: {
            projectId: "invalid-format"
          }
        });
        fail('Expected error was not thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        const mcpError = error as McpError;
        expect(mcpError.code).toBe(-32602); // Invalid params error code
        expect(mcpError.message).toContain('Invalid project ID format');
      }
    });
  });
}); 