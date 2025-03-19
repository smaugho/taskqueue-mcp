import { describe, it, expect } from '@jest/globals';
import { ALL_TOOLS } from '../../src/types/tools.js';
import { VALID_STATUS_TRANSITIONS } from '../../src/types/index.js';
import { TaskManagerServer } from '../../src/server/TaskManagerServer.js';
import { mockTaskManagerData } from '../helpers/mocks.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

describe('TaskManagerServer', () => {
  let server: TaskManagerServer;
  let tempDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = path.join(os.tmpdir(), `task-manager-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`);
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

  describe('Tools Configuration', () => {
    it('should have the required tools', () => {
      expect(ALL_TOOLS.length).toBe(2);
      
      const toolNames = ALL_TOOLS.map(tool => tool.name);
      expect(toolNames).toContain('project');
      expect(toolNames).toContain('task');
    });
    
    it('should have proper tool schemas', () => {
      ALL_TOOLS.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema).toHaveProperty('type', 'object');
      });
    });
  });
  
  describe('Status Transition Rules', () => {
    it('should define valid transitions from not started status', () => {
      expect(VALID_STATUS_TRANSITIONS['not started']).toEqual(['in progress']);
    });
    
    it('should define valid transitions from in progress status', () => {
      expect(VALID_STATUS_TRANSITIONS['in progress']).toContain('done');
      expect(VALID_STATUS_TRANSITIONS['in progress']).toContain('not started');
      expect(VALID_STATUS_TRANSITIONS['in progress'].length).toBe(2);
    });
    
    it('should define valid transitions from done status', () => {
      expect(VALID_STATUS_TRANSITIONS['done']).toEqual(['in progress']);
    });
    
    it('should not allow direct transition from not started to done', () => {
      const notStartedTransitions = VALID_STATUS_TRANSITIONS['not started'];
      expect(notStartedTransitions).not.toContain('done');
    });
  });

  it('should have all required tools', () => {
    const toolNames = ALL_TOOLS.map(tool => tool.name);
    expect(toolNames).toContain('project');
  });

  it('should handle project creation', async () => {
    const result = await server.handleProjectTool('create', {
      initialPrompt: 'Test project',
      projectPlan: 'Test plan',
      tasks: [
        {
          title: 'Test task',
          description: 'Test description'
        }
      ]
    }) as { status: string; projectId: string; totalTasks: number; tasks: any[]; message: string };

    expect(result.status).toBe('planned');
    expect(result.projectId).toBeDefined();
    expect(result.totalTasks).toBe(1);
  });

  it('should handle project listing', async () => {
    // Create a project first
    await server.handleProjectTool('create', {
      initialPrompt: 'Test project',
      projectPlan: 'Test plan',
      tasks: [
        {
          title: 'Test task',
          description: 'Test description'
        }
      ]
    });

    const result = await server.handleProjectTool('list', {}) as { status: string; projects: any[]; message: string };
    expect(result.status).toBe('projects_listed');
    expect(result.projects).toHaveLength(1);
  });

  it('should handle project deletion', async () => {
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
    }) as { status: string; projectId: string; totalTasks: number; tasks: any[]; message: string };

    const result = await server.handleProjectTool('delete', {
      projectId: createResult.projectId
    }) as { status: string; message: string };

    expect(result.status).toBe('project_deleted');
    
    // Verify deletion
    const listResult = await server.handleProjectTool('list', {}) as { status: string; projects: any[]; message: string };
    expect(listResult.projects).toHaveLength(0);
  });

  it('should handle task operations', async () => {
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
    }) as { status: string; projectId: string; totalTasks: number; tasks: { id: string }[]; message: string };

    const projectId = createResult.projectId;
    const taskId = createResult.tasks[0].id;

    // Test task reading
    const readResult = await server.handleTaskTool('read', { taskId }) as { status: string; task: { id: string }; message: string };
    expect(readResult.status).toBe('task_details');
    expect(readResult.task.id).toBe(taskId);

    // Test task updating
    const updateResult = await server.handleTaskTool('update', {
      projectId,
      taskId,
      title: 'Updated task',
      description: 'Updated description',
      status: 'in progress'
    }) as { status: string; message: string };
    expect(updateResult.status).toBe('task_updated');

    // Test task deletion
    const deleteResult = await server.handleTaskTool('delete', {
      projectId,
      taskId
    }) as { status: string; message: string };
    expect(deleteResult.status).toBe('task_deleted');
  });
}); 