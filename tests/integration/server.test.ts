import { ALL_TOOLS } from '../../src/types/tools.js';
import { TaskManagerServer } from '../../src/server/TaskManagerServer.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

describe('TaskManagerServer Integration', () => {
  let server: TaskManagerServer;
  let tempDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = path.join(os.tmpdir(), `task-manager-integration-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`);
    await fs.mkdir(tempDir, { recursive: true });
    testFilePath = path.join(tempDir, 'test-tasks.json');
    
    // Initialize the server with the test file path
    server = new TaskManagerServer(testFilePath);
  });

  afterEach(async () => {
    // Clean up temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error('Error cleaning up temp directory:', err);
    }
  });

  it('should have all required tools', () => {
    const toolNames = ALL_TOOLS.map(tool => tool.name);
    expect(toolNames).toContain('project');
    expect(toolNames).toContain('task');
  });

  it('should handle project tool actions', async () => {
    const projectTool = ALL_TOOLS.find(tool => tool.name === 'project');
    expect(projectTool).toBeDefined();
    expect(projectTool?.inputSchema.required).toContain('action');

    // Test project creation
    const createResult = await server.handleProjectTool('create', {
      initialPrompt: 'Test project',
      projectPlan: 'Test plan',
      tasks: [
        {
          title: 'Test task',
          description: 'Test description'
        }
      ]
    }) as { 
      status: string; 
      projectId: string; 
      totalTasks: number; 
      tasks: { id: string; title: string; description: string }[];
      message: string 
    };

    expect(createResult.status).toBe('planned');
    expect(createResult.projectId).toBeDefined();
    expect(createResult.totalTasks).toBe(1);

    // Test project listing
    const listResult = await server.handleProjectTool('list', {}) as {
      status: string;
      message: string;
      projects: { projectId: string; initialPrompt: string; totalTasks: number; completedTasks: number; approvedTasks: number }[];
    };
    expect(listResult.status).toBe('projects_listed');
    expect(listResult.projects).toHaveLength(1);

    // Test project deletion
    const deleteResult = await server.handleProjectTool('delete', {
      projectId: createResult.projectId
    }) as { 
      status: string; 
      message: string 
    };
    expect(deleteResult.status).toBe('project_deleted');

    // Verify deletion
    const listAfterDelete = await server.handleProjectTool('list', {}) as {
      status: string;
      message: string;
      projects: { projectId: string; initialPrompt: string; totalTasks: number; completedTasks: number; approvedTasks: number }[];
    };
    expect(listAfterDelete.projects).toHaveLength(0);
  });

  it('should handle task tool actions', async () => {
    // Create a project first
    const createResult = await server.handleProjectTool('create', {
      initialPrompt: 'Test project',
      projectPlan: 'Test plan',
      tasks: [
        {
          title: 'Test task',
          description: 'Test description'
        }
      ]
    }) as { 
      status: string; 
      projectId: string; 
      totalTasks: number; 
      tasks: { id: string; title: string; description: string }[];
      message: string 
    };

    const projectId = createResult.projectId;
    const taskId = createResult.tasks[0].id;

    // Test task reading
    const readResult = await server.handleTaskTool('read', { taskId }) as {
      status: string;
      projectId: string;
      task?: {
        id: string;
        title: string;
        description: string;
        status: string;
        approved: boolean;
        completedDetails: string;
      };
      message?: string;
    };
    expect(readResult.status).toBe('task_details');
    expect(readResult.task?.id).toBe(taskId);

    // Test task updating
    const updateResult = await server.handleTaskTool('update', {
      projectId,
      taskId,
      title: 'Updated task',
      description: 'Updated description',
      status: 'in progress'
    }) as {
      status: string;
      message: string;
      task?: {
        id: string;
        title: string;
        description: string;
        status: string;
        approved: boolean;
        completedDetails: string;
      };
    };
    expect(updateResult.status).toBe('task_updated');

    // Test task deletion
    const deleteResult = await server.handleTaskTool('delete', {
      projectId,
      taskId
    }) as {
      status: string;
      message: string;
    };
    expect(deleteResult.status).toBe('task_deleted');

    // Verify deletion
    const readAfterDelete = await server.handleTaskTool('read', { taskId }) as {
      status: string;
      message?: string;
    };
    expect(readAfterDelete.status).toBe('task_not_found');
  });
}); 