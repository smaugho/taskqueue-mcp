import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { TaskManagerServer } from '../../src/server/TaskManagerServer.js';
import { mockFs, mockFileData, resetMocks } from '../helpers/mocks.js';

// Mock fs module
jest.mock('node:fs/promises', () => ({
  readFile: () => mockFs.readFile(),
  writeFile: () => mockFs.writeFile(),
}));

describe('TaskManagerServer', () => {
  let taskManagerServer: TaskManagerServer;

  beforeEach(() => {
    resetMocks();
    taskManagerServer = new TaskManagerServer();
  });

  describe('requestPlanning', () => {
    it('should create a new request with tasks', async () => {
      const originalRequest = 'Test planning request';
      const tasks = [
        { title: 'Task 1', description: 'Description 1' },
        { title: 'Task 2', description: 'Description 2' },
      ];

      const result = await taskManagerServer.requestPlanning(originalRequest, tasks);

      expect(result.status).toBe('planned');
      expect(result.requestId).toBeDefined();
      expect(result.totalTasks).toBe(2);
      expect(result.tasks.length).toBe(2);
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('getNextTask', () => {
    it('should retrieve the next undone task', async () => {
      const result = await taskManagerServer.getNextTask('req-1');

      expect(result.status).toBe('next_task');
      expect(result.task).toBeDefined();
      expect(result.task?.id).toBe('task-1');
    });

    it('should return error for non-existent request', async () => {
      const result = await taskManagerServer.getNextTask('non-existent-req');

      expect(result.status).toBe('error');
      expect(result.message).toContain('Request not found');
    });
  });

  describe('markTaskDone', () => {
    it('should mark a task as done', async () => {
      const result = await taskManagerServer.markTaskDone('req-1', 'task-1', 'Completed successfully');

      expect(result.status).toBe('task_marked_done');
      expect(result.task).toBeDefined();
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should return error for non-existent task', async () => {
      const result = await taskManagerServer.markTaskDone('req-1', 'non-existent-task', '');

      expect(result.status).toBe('error');
      expect(result.message).toContain('Task not found');
    });
  });

  describe('approveTaskCompletion', () => {
    it('should approve a completed task', async () => {
      // First mark the task as done
      await taskManagerServer.markTaskDone('req-1', 'task-1', '');
      const result = await taskManagerServer.approveTaskCompletion('req-1', 'task-1');

      expect(result.status).toBe('task_approved');
      expect(result.task).toBeDefined();
      expect(result.task?.approved).toBeTruthy();
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should return error if task not done', async () => {
      // Using a fresh instance where task-1 is not marked done
      taskManagerServer = new TaskManagerServer();
      const result = await taskManagerServer.approveTaskCompletion('req-1', 'task-1');

      expect(result.status).toBe('error');
      expect(result.message).toContain('Task not done yet');
    });
  });

  describe('approveRequestCompletion', () => {
    it('should mark a request as completed when all tasks are done and approved', async () => {
      // Setup: Mark all tasks as done and approved
      await taskManagerServer.markTaskDone('req-1', 'task-1', '');
      await taskManagerServer.approveTaskCompletion('req-1', 'task-1');
      // Task 2 is already done and approved in our mock

      const result = await taskManagerServer.approveRequestCompletion('req-1');

      expect(result.status).toBe('request_approved_complete');
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should return error if not all tasks are done', async () => {
      const result = await taskManagerServer.approveRequestCompletion('req-1');

      expect(result.status).toBe('error');
      expect(result.message).toContain('Not all tasks are done');
    });
  });

  describe('listRequests', () => {
    it('should list all requests', async () => {
      const result = await taskManagerServer.listRequests();

      expect(result.status).toBe('requests_listed');
      expect(result.requests).toBeDefined();
      expect(result.requests.length).toBe(1);
      expect(result.requests[0].requestId).toBe('req-1');
    });
  });

  describe('addTasksToRequest', () => {
    it('should add new tasks to an existing request', async () => {
      const tasks = [
        { title: 'New Task 1', description: 'New Description 1' },
        { title: 'New Task 2', description: 'New Description 2' },
      ];

      const result = await taskManagerServer.addTasksToRequest('req-1', tasks);

      expect(result.status).toBe('tasks_added');
      expect(result.newTasks).toBeDefined();
      expect(result.newTasks?.length).toBe(2);
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should return error for non-existent request', async () => {
      const tasks = [{ title: 'Task', description: 'Description' }];
      const result = await taskManagerServer.addTasksToRequest('non-existent-req', tasks);

      expect(result.status).toBe('error');
      expect(result.message).toContain('Request not found');
    });
  });

  describe('updateTask', () => {
    it('should update a task\'s title and description', async () => {
      const updates = {
        title: 'Updated Title',
        description: 'Updated Description',
      };

      const result = await taskManagerServer.updateTask('req-1', 'task-1', updates);

      expect(result.status).toBe('task_updated');
      expect(result.task).toBeDefined();
      expect(result.task?.title).toBe('Updated Title');
      expect(result.task?.description).toBe('Updated Description');
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should return error for completed task', async () => {
      const updates = { title: 'Updated' };
      const result = await taskManagerServer.updateTask('req-1', 'task-2', updates);

      expect(result.status).toBe('error');
      expect(result.message).toContain('Cannot update completed task');
    });
  });

  describe('deleteTask', () => {
    it('should delete a task from a request', async () => {
      const result = await taskManagerServer.deleteTask('req-1', 'task-1');

      expect(result.status).toBe('task_deleted');
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should return error for completed task', async () => {
      const result = await taskManagerServer.deleteTask('req-1', 'task-2');

      expect(result.status).toBe('error');
      expect(result.message).toContain('Cannot delete completed task');
    });
  });

  describe('openTaskDetails', () => {
    it('should return details for a specific task', async () => {
      const result = await taskManagerServer.openTaskDetails('task-1');

      expect(result.status).toBe('task_details');
      expect(result.task).toBeDefined();
      expect(result.task?.id).toBe('task-1');
      expect(result.requestId).toBe('req-1');
    });

    it('should return not found for non-existent task', async () => {
      const result = await taskManagerServer.openTaskDetails('non-existent-task');

      expect(result.status).toBe('task_not_found');
    });
  });
}); 