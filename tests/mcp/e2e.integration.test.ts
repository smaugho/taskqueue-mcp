import { describe, it, expect } from '@jest/globals';
import { setupTestContext, teardownTestContext, verifyToolSuccessResponse } from './test-helpers.js';
import type { TestContext } from './test-helpers.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

describe('MCP Client Integration', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestContext();
  });

  afterAll(async () => {
    await teardownTestContext(context);
  });

  it('should list available tools', async () => {
    const response = await context.client.listTools();
    expect(response).toBeDefined();
    expect(response).toHaveProperty('tools');
    expect(Array.isArray(response.tools)).toBe(true);
    expect(response.tools.length).toBeGreaterThan(0);

    // Check for essential tools
    const toolNames = response.tools.map(tool => tool.name);
    expect(toolNames).toContain('list_projects');
    expect(toolNames).toContain('create_project');
    expect(toolNames).toContain('read_project');
    expect(toolNames).toContain('get_next_task');
    expect(toolNames).toContain('update_project');
  });

  it('should verify update_project tool works in complete workflow', async () => {
    // 1. Create a project
    const createProjectResult = await context.client.callTool({
      name: "create_project",
      arguments: {
        initialPrompt: "Test E2E Project",
        projectPlan: "Original Plan",
        tasks: [
          { title: "Task 1", description: "Description 1" }
        ]
      }
    }) as CallToolResult;
    
    // Extract the project ID
    const createProjectData = verifyToolSuccessResponse<{projectId: string}>(createProjectResult);
    const projectId = createProjectData.projectId;
    
    // 2. Update the project's initial prompt
    const updatePromptResult = await context.client.callTool({
      name: "update_project",
      arguments: {
        projectId: projectId,
        initialPrompt: "Updated E2E Project"
      }
    }) as CallToolResult;
    
    // Verify update was successful
    const updatePromptData = verifyToolSuccessResponse<{initialPrompt: string, projectPlan: string}>(updatePromptResult);
    expect(updatePromptData).toHaveProperty('initialPrompt', 'Updated E2E Project');
    expect(updatePromptData).toHaveProperty('projectPlan', 'Original Plan');
    
    // 3. Update the project's plan
    const updatePlanResult = await context.client.callTool({
      name: "update_project",
      arguments: {
        projectId: projectId,
        projectPlan: "Updated Plan"
      }
    }) as CallToolResult;
    
    // Verify second update was successful
    const updatePlanData = verifyToolSuccessResponse<{initialPrompt: string, projectPlan: string}>(updatePlanResult);
    expect(updatePlanData).toHaveProperty('initialPrompt', 'Updated E2E Project');
    expect(updatePlanData).toHaveProperty('projectPlan', 'Updated Plan');
    
    // 4. Read the project to confirm it has both updates
    const readResult = await context.client.callTool({
      name: "read_project",
      arguments: {
        projectId: projectId
      }
    }) as CallToolResult;
    
    const readData = verifyToolSuccessResponse<{initialPrompt: string, projectPlan: string}>(readResult);
    expect(readData).toHaveProperty('initialPrompt', 'Updated E2E Project');
    expect(readData).toHaveProperty('projectPlan', 'Updated Plan');
  });
});