import { jest, describe, it, expect } from '@jest/globals';
import { TaskManager } from '../../src/server/TaskManager.js';
import { toolExecutorMap } from '../../src/server/toolExecutors.js';
import { ErrorCode } from '../../src/types/index.js';
import { Task } from '../../src/types/index.js';
import { ApproveTaskSuccessData } from '../../src/types/index.js';

// Mock TaskManager
jest.mock('../../src/server/TaskManager.js');

type SaveTasksFn = () => Promise<void>;

describe('Tool Executors', () => {
  let taskManager: jest.Mocked<TaskManager>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Create a new mock instance
    taskManager = {
      listProjects: jest.fn(),
      createProject: jest.fn(),
      getNextTask: jest.fn(),
      updateTask: jest.fn(),
      readProject: jest.fn(),
      deleteProject: jest.fn(),
      addTasksToProject: jest.fn(),
      approveProjectCompletion: jest.fn(),
      listTasks: jest.fn(),
      openTaskDetails: jest.fn(),
      deleteTask: jest.fn(),
      approveTaskCompletion: jest.fn()
    } as unknown as jest.Mocked<TaskManager>;
  });

  // Utility Function Tests
  describe('Utility Functions', () => {
    describe('validateProjectId', () => {
      it('should throw error for missing projectId', async () => {
        const executor = toolExecutorMap.get('read_project')!;
        await expect(executor.execute(taskManager, {}))
          .rejects
          .toMatchObject({
            code: ErrorCode.MissingParameter,
            message: expect.stringContaining('projectId')
          });
      });

      it('should throw error for non-string projectId', async () => {
        const executor = toolExecutorMap.get('read_project')!;
        await expect(executor.execute(taskManager, { projectId: 123 }))
          .rejects
          .toMatchObject({
            code: ErrorCode.MissingParameter,
            message: expect.stringContaining('projectId')
          });
      });
    });

    describe('validateTaskId', () => {
      it('should throw error for missing taskId', async () => {
        const executor = toolExecutorMap.get('read_task')!;
        await expect(executor.execute(taskManager, {}))
          .rejects
          .toMatchObject({
            code: ErrorCode.MissingParameter,
            message: expect.stringContaining('taskId')
          });
      });

      it('should throw error for non-string taskId', async () => {
        const executor = toolExecutorMap.get('read_task')!;
        await expect(executor.execute(taskManager, { taskId: 123 }))
          .rejects
          .toMatchObject({
            code: ErrorCode.MissingParameter,
            message: expect.stringContaining('taskId')
          });
      });
    });

    describe('validateTaskList', () => {
      it('should throw error for missing tasks', async () => {
        const executor = toolExecutorMap.get('create_project')!;
        await expect(executor.execute(taskManager, { initialPrompt: 'test' }))
          .rejects
          .toMatchObject({
            code: ErrorCode.MissingParameter,
            message: expect.stringContaining('tasks')
          });
      });

      it('should throw error for non-array tasks', async () => {
        const executor = toolExecutorMap.get('create_project')!;
        await expect(executor.execute(taskManager, { initialPrompt: 'test', tasks: 'not an array' }))
          .rejects
          .toMatchObject({
            code: ErrorCode.MissingParameter,
            message: expect.stringContaining('tasks')
          });
      });
    });
  });

  // Tool Executor Tests
  describe('listProjects Tool Executor', () => {
    it('should call taskManager.listProjects with no state', async () => {
      const executor = toolExecutorMap.get('list_projects')!;
      taskManager.listProjects.mockResolvedValue({
        status: 'success',
        data: {
          message: 'Projects listed successfully',
          projects: []
        }
      });
      
      await executor.execute(taskManager, {});
      
      expect(taskManager.listProjects).toHaveBeenCalledWith(undefined);
    });

    it('should call taskManager.listProjects with valid state', async () => {
      const executor = toolExecutorMap.get('list_projects')!;
      taskManager.listProjects.mockResolvedValue({
        status: 'success',
        data: {
          message: 'Projects listed successfully',
          projects: []
        }
      });
      
      await executor.execute(taskManager, { state: 'open' });
      
      expect(taskManager.listProjects).toHaveBeenCalledWith('open');
    });

    it('should throw error for invalid state', async () => {
      const executor = toolExecutorMap.get('list_projects')!;
      
      await expect(executor.execute(taskManager, { state: 'invalid' }))
        .rejects
        .toMatchObject({
          code: ErrorCode.InvalidArgument,
          message: expect.stringContaining('state')
        });
    });
  });

  describe('createProject Tool Executor', () => {
    const validTask = {
      title: 'Test Task',
      description: 'Test Description'
    };

    it('should create project with minimal valid input', async () => {
      const executor = toolExecutorMap.get('create_project')!;
      taskManager.createProject.mockResolvedValue({
        status: 'success',
        data: {
          projectId: 'test-proj',
          totalTasks: 1,
          tasks: [{ id: 'task-1', ...validTask }],
          message: 'Project created successfully'
        }
      });
      
      await executor.execute(taskManager, {
        initialPrompt: 'Test Prompt',
        tasks: [validTask]
      });
      
      expect(taskManager.createProject).toHaveBeenCalledWith(
        'Test Prompt',
        [validTask],
        undefined,
        false
      );
    });

    it('should create project with all optional fields', async () => {
      const executor = toolExecutorMap.get('create_project')!;
      const taskWithRecommendations = {
        ...validTask,
        toolRecommendations: 'Use tool X',
        ruleRecommendations: 'Follow rule Y'
      };
      
      taskManager.createProject.mockResolvedValue({
        status: 'success',
        data: {
          projectId: 'test-proj',
          totalTasks: 1,
          tasks: [{ id: 'task-1', ...taskWithRecommendations }],
          message: 'Project created successfully'
        }
      });
      
      await executor.execute(taskManager, {
        initialPrompt: 'Test Prompt',
        projectPlan: 'Test Plan',
        tasks: [taskWithRecommendations]
      });
      
      expect(taskManager.createProject).toHaveBeenCalledWith(
        'Test Prompt',
        [taskWithRecommendations],
        'Test Plan',
        false
      );
    });

    it('should throw error for invalid task object', async () => {
      const executor = toolExecutorMap.get('create_project')!;
      
      await expect(executor.execute(taskManager, {
        initialPrompt: 'Test Prompt',
        tasks: [{ title: 'Missing Description' }]
      }))
        .rejects
        .toMatchObject({
          code: ErrorCode.MissingParameter,
          message: expect.stringContaining('description')
        });
    });
  });

  describe('getNextTask Tool Executor', () => {
    it('should get next task successfully', async () => {
      const executor = toolExecutorMap.get('get_next_task')!;
      const mockTask: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test Description',
        status: 'not started',
        approved: false,
        completedDetails: ''
      };
      
      taskManager.getNextTask.mockResolvedValue({
        status: 'next_task',
        data: mockTask
      });
      
      const result = await executor.execute(taskManager, { projectId: 'proj-1' });
      
      expect(taskManager.getNextTask).toHaveBeenCalledWith('proj-1');
      expect(result.content[0].text).toContain('task-1');
    });

    it('should handle no next task', async () => {
      const executor = toolExecutorMap.get('get_next_task')!;
      taskManager.getNextTask.mockResolvedValue({
        status: 'all_tasks_done',
        data: { message: 'All tasks completed' }
      });
      
      const result = await executor.execute(taskManager, { projectId: 'proj-1' });
      
      expect(taskManager.getNextTask).toHaveBeenCalledWith('proj-1');
      expect(result.content[0].text).toContain('all_tasks_done');
    });
  });

  describe('updateTask Tool Executor', () => {
    const mockTask: Task = {
      id: 'task-1',
      title: 'Test Task',
      description: 'Test Description',
      status: 'not started',
      approved: false,
      completedDetails: ''
    };

    it('should update task with valid status transition', async () => {
      const executor = toolExecutorMap.get('update_task')!;
      taskManager.updateTask.mockResolvedValue({
        status: 'success',
        data: { ...mockTask, status: 'in progress' }
      });
      
      await executor.execute(taskManager, {
        projectId: 'proj-1',
        taskId: 'task-1',
        status: 'in progress'
      });
      
      expect(taskManager.updateTask).toHaveBeenCalledWith('proj-1', 'task-1', {
        status: 'in progress'
      });
    });

    it('should require completedDetails when status is done', async () => {
      const executor = toolExecutorMap.get('update_task')!;
      
      await expect(executor.execute(taskManager, {
        projectId: 'proj-1',
        taskId: 'task-1',
        status: 'done'
      }))
        .rejects
        .toMatchObject({
          code: ErrorCode.MissingParameter,
          message: expect.stringContaining('completedDetails')
        });
    });

    it('should update task with all optional fields', async () => {
      const executor = toolExecutorMap.get('update_task')!;
      taskManager.updateTask.mockResolvedValue({
        status: 'success',
        data: {
          ...mockTask,
          title: 'New Title',
          description: 'New Description',
          toolRecommendations: 'New Tools',
          ruleRecommendations: 'New Rules'
        }
      });
      
      await executor.execute(taskManager, {
        projectId: 'proj-1',
        taskId: 'task-1',
        title: 'New Title',
        description: 'New Description',
        toolRecommendations: 'New Tools',
        ruleRecommendations: 'New Rules'
      });
      
      expect(taskManager.updateTask).toHaveBeenCalledWith('proj-1', 'task-1', {
        title: 'New Title',
        description: 'New Description',
        toolRecommendations: 'New Tools',
        ruleRecommendations: 'New Rules'
      });
    });
  });

  describe('readProject Tool Executor', () => {
    it('should read project successfully', async () => {
      const executor = toolExecutorMap.get('read_project')!;
      const mockProject = {
        projectId: 'proj-1',
        initialPrompt: 'Test Project',
        projectPlan: '',
        completed: false,
        tasks: [] as Task[]
      };
      
      taskManager.readProject.mockResolvedValue({
        status: 'success',
        data: mockProject
      });
      
      const result = await executor.execute(taskManager, { projectId: 'proj-1' });
      
      expect(taskManager.readProject).toHaveBeenCalledWith('proj-1');
      expect(result.content[0].text).toContain('proj-1');
    });
  });

  describe('deleteProject Tool Executor', () => {
    it('should delete project successfully', async () => {
      const executor = toolExecutorMap.get('delete_project')!;
      taskManager['data'] = {
        projects: [{
          projectId: 'proj-1',
          initialPrompt: 'Test Project',
          projectPlan: '',
          completed: false,
          tasks: []
        }]
      };
      taskManager['saveTasks'] = jest.fn(async () => Promise.resolve());
      
      const result = await executor.execute(taskManager, { projectId: 'proj-1' });
      
      expect(taskManager['saveTasks']).toHaveBeenCalled();
      expect(result.content[0].text).toContain('project_deleted');
    });

    it('should handle non-existent project', async () => {
      const executor = toolExecutorMap.get('delete_project')!;
      taskManager['data'] = {
        projects: []
      };
      
      const result = await executor.execute(taskManager, { projectId: 'non-existent' });
      
      expect(result.content[0].text).toContain('Project not found');
    });
  });

  describe('addTasksToProject Tool Executor', () => {
    const validTasks = [
      { title: 'Task 1', description: 'Description 1' },
      { title: 'Task 2', description: 'Description 2', toolRecommendations: 'Tool X', ruleRecommendations: 'Rule Y' }
    ];

    it('should add tasks successfully', async () => {
      const executor = toolExecutorMap.get('add_tasks_to_project')!;
      taskManager.addTasksToProject.mockResolvedValue({
        status: 'success',
        data: {
          message: 'Tasks added successfully',
          newTasks: [
            { id: 'task-1', title: 'Task 1', description: 'Description 1' }
          ]
        }
      });
      
      await executor.execute(taskManager, {
        projectId: 'proj-1',
        tasks: validTasks
      });
      
      expect(taskManager.addTasksToProject).toHaveBeenCalledWith('proj-1', validTasks);
    });

    it('should throw error for invalid task in array', async () => {
      const executor = toolExecutorMap.get('add_tasks_to_project')!;
      const invalidTasks = [
        { title: 'Task 1' } // missing description
      ];
      
      await expect(executor.execute(taskManager, {
        projectId: 'proj-1',
        tasks: invalidTasks
      }))
        .rejects
        .toMatchObject({
          code: ErrorCode.MissingParameter,
          message: expect.stringContaining('description')
        });
    });
  });

  describe('finalizeProject Tool Executor', () => {
    it('should finalize project successfully', async () => {
      const executor = toolExecutorMap.get('finalize_project')!;
      taskManager.approveProjectCompletion.mockResolvedValue({
        status: 'success',
        data: {
          projectId: 'proj-1',
          message: 'Project finalized successfully'
        }
      });
      
      await executor.execute(taskManager, { projectId: 'proj-1' });
      
      expect(taskManager.approveProjectCompletion).toHaveBeenCalledWith('proj-1');
    });
  });

  describe('listTasks Tool Executor', () => {
    it('should list tasks with no filters', async () => {
      const executor = toolExecutorMap.get('list_tasks')!;
      taskManager.listTasks.mockResolvedValue({
        status: 'success',
        data: {
          message: 'Tasks listed successfully',
          tasks: []
        }
      });
      
      await executor.execute(taskManager, {});
      
      expect(taskManager.listTasks).toHaveBeenCalledWith(undefined, undefined);
    });

    it('should list tasks with projectId filter', async () => {
      const executor = toolExecutorMap.get('list_tasks')!;
      await executor.execute(taskManager, { projectId: 'proj-1' });
      expect(taskManager.listTasks).toHaveBeenCalledWith('proj-1', undefined);
    });

    it('should list tasks with state filter', async () => {
      const executor = toolExecutorMap.get('list_tasks')!;
      await executor.execute(taskManager, { state: 'open' });
      expect(taskManager.listTasks).toHaveBeenCalledWith(undefined, 'open');
    });

    it('should throw error for invalid state', async () => {
      const executor = toolExecutorMap.get('list_tasks')!;
      await expect(executor.execute(taskManager, { state: 'invalid' }))
        .rejects
        .toMatchObject({
          code: ErrorCode.InvalidArgument,
          message: expect.stringContaining('state')
        });
    });
  });

  describe('readTask Tool Executor', () => {
    it('should read task successfully', async () => {
      const executor = toolExecutorMap.get('read_task')!;
      const mockTask = {
        projectId: 'proj-1',
        initialPrompt: 'Test Project',
        projectPlan: '',
        completed: false,
        task: {
          id: 'task-1',
          title: 'Test Task',
          description: 'Test Description',
          status: 'not started' as const,
          approved: false,
          completedDetails: ''
        }
      };
      
      taskManager.openTaskDetails.mockResolvedValue({
        status: 'success',
        data: mockTask
      });
      
      const result = await executor.execute(taskManager, { taskId: 'task-1' });
      
      expect(taskManager.openTaskDetails).toHaveBeenCalledWith('task-1');
      expect(result.content[0].text).toContain('task-1');
    });
  });

  describe('createTask Tool Executor', () => {
    it('should create task successfully', async () => {
      const executor = toolExecutorMap.get('create_task')!;
      const taskData = {
        title: 'New Task',
        description: 'Task Description',
        toolRecommendations: 'Tool X',
        ruleRecommendations: 'Rule Y'
      };
      
      taskManager.addTasksToProject.mockResolvedValue({
        status: 'success',
        data: {
          message: 'Task created successfully',
          newTasks: [
            { id: 'task-1', title: 'New Task', description: 'Task Description' }
          ]
        }
      });
      
      await executor.execute(taskManager, {
        projectId: 'proj-1',
        ...taskData
      });
      
      expect(taskManager.addTasksToProject).toHaveBeenCalledWith('proj-1', [taskData]);
    });

    it('should throw error for missing title', async () => {
      const executor = toolExecutorMap.get('create_task')!;
      await expect(executor.execute(taskManager, {
        projectId: 'proj-1',
        description: 'Description'
      }))
        .rejects
        .toMatchObject({
          code: ErrorCode.MissingParameter,
          message: expect.stringContaining('title')
        });
    });

    it('should throw error for missing description', async () => {
      const executor = toolExecutorMap.get('create_task')!;
      await expect(executor.execute(taskManager, {
        projectId: 'proj-1',
        title: 'Title'
      }))
        .rejects
        .toMatchObject({
          code: ErrorCode.MissingParameter,
          message: expect.stringContaining('description')
        });
    });
  });

  describe('deleteTask Tool Executor', () => {
    it('should delete task successfully', async () => {
      const executor = toolExecutorMap.get('delete_task')!;
      taskManager.deleteTask.mockResolvedValue({
        status: 'success',
        data: { message: 'Task deleted successfully' }
      });
      
      await executor.execute(taskManager, {
        projectId: 'proj-1',
        taskId: 'task-1'
      });
      
      expect(taskManager.deleteTask).toHaveBeenCalledWith('proj-1', 'task-1');
    });
  });

  describe('approveTask Tool Executor', () => {
    it('should approve task successfully', async () => {
      const executor = toolExecutorMap.get('approve_task')!;
      // Mock data matching ApproveTaskSuccessData interface
      const mockSuccessData: ApproveTaskSuccessData = {
        projectId: 'proj-1',
        task: {
          id: 'task-1',
          title: 'Test Task',
          description: 'Test Description',
          completedDetails: 'Completed successfully',
          approved: true
        }
      };
      taskManager.approveTaskCompletion.mockResolvedValue({
        status: 'success',
        data: mockSuccessData
      });
      
      await executor.execute(taskManager, {
        projectId: 'proj-1',
        taskId: 'task-1'
      });
      
      expect(taskManager.approveTaskCompletion).toHaveBeenCalledWith('proj-1', 'task-1');
    });
  });
}); 