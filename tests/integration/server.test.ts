import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { TaskManagerServer } from '../../src/server/TaskManagerServer.js';
import { ALL_TOOLS } from '../../src/types/tools.js';
import { mockFs, resetMocks } from '../helpers/mocks.js';

// Mock fs module
jest.mock('node:fs/promises', () => ({
  readFile: () => mockFs.readFile(),
  writeFile: () => mockFs.writeFile(),
}));

// Mock MCP SDK server
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    setRequestHandler: jest.fn(),
    connect: jest.fn().mockReturnValue(Promise.resolve()),
  })),
}));

describe('MCP Server Integration', () => {
  let taskManagerServer: TaskManagerServer;

  beforeEach(() => {
    resetMocks();
    taskManagerServer = new TaskManagerServer();
  });

  it('should initialize server functionality', () => {
    expect(taskManagerServer).toBeDefined();
  });

  it('should handle request planning correctly', async () => {
    const originalRequest = 'Test planning request';
    const tasks = [
      { title: 'Task 1', description: 'Description 1' },
      { title: 'Task 2', description: 'Description 2' },
    ];

    const result = await taskManagerServer.requestPlanning(originalRequest, tasks);

    expect(result.status).toBe('planned');
    expect(result.requestId).toBeDefined();
    expect(result.totalTasks).toBe(2);
  });

  it('should handle task lifecycle correctly', async () => {
    // 1. Plan a request with tasks
    const planResult = await taskManagerServer.requestPlanning('Test lifecycle', [
      { title: 'Lifecycle Task', description: 'Task for lifecycle testing' },
    ]);
    const requestId = planResult.requestId;
    const taskId = planResult.tasks[0].id;

    // 2. Get the next task
    const nextTaskResult = await taskManagerServer.getNextTask(requestId);
    expect(nextTaskResult.status).toBe('next_task');
    expect(nextTaskResult.task?.id).toBe(taskId);

    // 3. Mark the task as done
    const markDoneResult = await taskManagerServer.markTaskDone(
      requestId,
      taskId,
      'Completed during lifecycle test'
    );
    expect(markDoneResult.status).toBe('task_marked_done');

    // 4. Approve the task completion
    const approveTaskResult = await taskManagerServer.approveTaskCompletion(requestId, taskId);
    expect(approveTaskResult.status).toBe('task_approved');

    // 5. All tasks should be done now
    const allDoneResult = await taskManagerServer.getNextTask(requestId);
    expect(allDoneResult.status).toBe('all_tasks_done');

    // 6. Approve request completion
    const approveRequestResult = await taskManagerServer.approveRequestCompletion(requestId);
    expect(approveRequestResult.status).toBe('request_approved_complete');
  });

  it('should provide all required tools', () => {
    expect(ALL_TOOLS.length).toBe(10);
    
    // Verify tool names and required properties
    ALL_TOOLS.forEach(tool => {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
    });
  });
}); 