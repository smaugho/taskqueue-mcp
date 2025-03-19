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
    expect(toolNames).toContain('list_projects');
    expect(toolNames).toContain('create_project');
    expect(toolNames).toContain('delete_project');
    expect(toolNames).toContain('add_tasks_to_project');
    expect(toolNames).toContain('finalize_project');
    expect(toolNames).toContain('read_project');
    
    expect(toolNames).toContain('read_task');
    expect(toolNames).toContain('update_task');
    expect(toolNames).toContain('delete_task');
    expect(toolNames).toContain('approve_task');
    expect(toolNames).toContain('get_next_task');
  });

  it('should handle project tool actions', async () => {
    // Test project creation
    const createResult = await server.createProject(
      'Test project',
      [
        {
          title: 'Test task',
          description: 'Test description'
        }
      ],
      'Test plan'
    ) as { 
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
    const listResult = await server.listProjects() as {
      status: string;
      message: string;
      projects: { projectId: string; initialPrompt: string; totalTasks: number; completedTasks: number; approvedTasks: number }[];
    };
    expect(listResult.status).toBe('projects_listed');
    expect(listResult.projects).toHaveLength(1);

    // Test project deletion
    const projectId = createResult.projectId;
    const projectIndex = server["data"].projects.findIndex((p) => p.projectId === projectId);
    server["data"].projects.splice(projectIndex, 1);
    await server["saveTasks"]();
    
    // Verify deletion
    const listAfterDelete = await server.listProjects() as {
      status: string;
      message: string;
      projects: { projectId: string; initialPrompt: string; totalTasks: number; completedTasks: number; approvedTasks: number }[];
    };
    expect(listAfterDelete.projects).toHaveLength(0);
  });

  it('should handle task tool actions', async () => {
    // Create a project first
    const createResult = await server.createProject(
      'Test project',
      [
        {
          title: 'Test task',
          description: 'Test description'
        }
      ],
      'Test plan'
    ) as { 
      status: string; 
      projectId: string; 
      totalTasks: number; 
      tasks: { id: string; title: string; description: string }[];
      message: string 
    };

    const projectId = createResult.projectId;
    const taskId = createResult.tasks[0].id;

    // Test task reading
    const readResult = await server.openTaskDetails(taskId);
    expect(readResult.status).toBe('task_details');
    if (readResult.status === 'task_details' && readResult.task) {
      expect(readResult.task.id).toBe(taskId);
    }

    // Test task updating
    const updateResult = await server.updateTask(
      projectId,
      taskId,
      {
        title: 'Updated task',
        description: 'Updated description'
      }
    );
    expect(updateResult.status).toBe('task_updated');
    
    // Also update the status directly 
    const task = server["data"].projects.find(p => p.projectId === projectId)?.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = 'in progress';
      await server["saveTasks"]();
    }

    // Test task deletion
    const deleteResult = await server.deleteTask(
      projectId,
      taskId
    ) as {
      status: string;
      message: string;
    };
    expect(deleteResult.status).toBe('task_deleted');

    // Verify deletion
    const readAfterDelete = await server.openTaskDetails(taskId) as {
      status: string;
      message?: string;
    };
    expect(readAfterDelete.status).toBe('task_not_found');
  });
  
  it('should get the next task in a project', async () => {
    // Create a project with multiple tasks
    const createResult = await server.createProject(
      'Test project with multiple tasks',
      [
        {
          title: 'Task 1',
          description: 'Description 1'
        },
        {
          title: 'Task 2',
          description: 'Description 2'
        }
      ]
    ) as { 
      projectId: string; 
      tasks: { id: string }[];
    };

    const projectId = createResult.projectId;
    
    // Get the next task
    const nextTaskResult = await server.getNextTask(projectId);
    
    expect(nextTaskResult.status).toBe('next_task');
    if (nextTaskResult.status === 'next_task' && nextTaskResult.task) {
      expect(nextTaskResult.task.id).toBe(createResult.tasks[0].id);
    }
  });
  
  it('should approve a completed task', async () => {
    // Create a project with a task
    const createResult = await server.createProject(
      'Test project for approval',
      [
        {
          title: 'Task to approve',
          description: 'Description of task to approve'
        }
      ]
    ) as { 
      projectId: string; 
      tasks: { id: string }[];
    };

    const projectId = createResult.projectId;
    const taskId = createResult.tasks[0].id;
    
    // Mark the task as done
    const task = server["data"].projects.find(p => p.projectId === projectId)?.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = 'done';
      task.completedDetails = 'Completed task details';
      await server["saveTasks"]();
    }
    
    // Approve the task
    const approveResult = await server.approveTaskCompletion(projectId, taskId);
    
    expect(approveResult.status).toBe('task_approved');
    if (approveResult.status === 'task_approved' && approveResult.task) {
      expect(approveResult.task.approved).toBe(true);
    }
  });
  
  it('should execute a complete project workflow', async () => {
    // 1. Create a project with multiple tasks
    const createResult = await server.createProject(
      'Complete workflow project',
      [
        {
          title: 'Task 1',
          description: 'Description of task 1'
        },
        {
          title: 'Task 2',
          description: 'Description of task 2'
        }
      ],
      'Detailed plan for complete workflow'
    );
    
    expect(createResult.status).toBe('planned');
    expect(createResult.projectId).toBeDefined();
    expect(createResult.totalTasks).toBe(2);
    
    const projectId = createResult.projectId;
    const taskId1 = createResult.tasks[0].id;
    const taskId2 = createResult.tasks[1].id;
    
    // 2. Get the next task (first task)
    const nextTaskResult = await server.getNextTask(projectId);
    expect(nextTaskResult.status).toBe('next_task');
    if (nextTaskResult.status === 'next_task' && nextTaskResult.task) {
      expect(nextTaskResult.task.id).toBe(taskId1);
    }
    
    // 3. Mark the first task as in progress
    const task1 = server["data"].projects.find(p => p.projectId === projectId)?.tasks.find(t => t.id === taskId1);
    if (task1) {
      task1.status = 'in progress';
      await server["saveTasks"]();
    }
    
    // 4. Mark the first task as done
    const markDoneResult = await server.markTaskDone(projectId, taskId1, 'Task 1 completed details');
    expect(markDoneResult.status).toBe('task_marked_done');
    
    // 5. Approve the first task
    const approveResult = await server.approveTaskCompletion(projectId, taskId1);
    expect(approveResult.status).toBe('task_approved');
    
    // 6. Get the next task (second task)
    const nextTaskResult2 = await server.getNextTask(projectId);
    expect(nextTaskResult2.status).toBe('next_task');
    if (nextTaskResult2.status === 'next_task' && nextTaskResult2.task) {
      expect(nextTaskResult2.task.id).toBe(taskId2);
    }
    
    // 7. Mark the second task as in progress
    const task2 = server["data"].projects.find(p => p.projectId === projectId)?.tasks.find(t => t.id === taskId2);
    if (task2) {
      task2.status = 'in progress';
      await server["saveTasks"]();
    }
    
    // 8. Mark the second task as done
    const markDoneResult2 = await server.markTaskDone(projectId, taskId2, 'Task 2 completed details');
    expect(markDoneResult2.status).toBe('task_marked_done');
    
    // 9. Approve the second task
    const approveResult2 = await server.approveTaskCompletion(projectId, taskId2);
    expect(approveResult2.status).toBe('task_approved');
    
    // 10. Now all tasks should be done, check with getNextTask
    const allDoneResult = await server.getNextTask(projectId);
    expect(allDoneResult.status).toBe('all_tasks_done');
    
    // 11. Finalize the project
    const finalizeResult = await server.approveProjectCompletion(projectId);
    expect(finalizeResult.status).toBe('project_approved_complete');
    
    // 12. Verify the project is marked as completed
    const project = server["data"].projects.find(p => p.projectId === projectId);
    expect(project?.completed).toBe(true);
  });

  it('should handle project approval workflow', async () => {
    // 1. Create a project with multiple tasks
    const createResult = await server.createProject(
      'Project for approval workflow',
      [
        {
          title: 'Task 1',
          description: 'Description of task 1'
        },
        {
          title: 'Task 2',
          description: 'Description of task 2'
        }
      ]
    ) as { 
      projectId: string; 
      tasks: { id: string }[];
    };

    const projectId = createResult.projectId;
    const taskId1 = createResult.tasks[0].id;
    const taskId2 = createResult.tasks[1].id;

    // 2. Try to approve project before tasks are done (should fail)
    const earlyApprovalResult = await server.approveProjectCompletion(projectId);
    expect(earlyApprovalResult.status).toBe('error');
    expect(earlyApprovalResult.message).toContain('Not all tasks are done');

    // 3. Mark tasks as done
    await server.markTaskDone(projectId, taskId1, 'Task 1 completed details');
    await server.markTaskDone(projectId, taskId2, 'Task 2 completed details');

    // 4. Try to approve project before tasks are approved (should fail)
    const preApprovalResult = await server.approveProjectCompletion(projectId);
    expect(preApprovalResult.status).toBe('error');
    expect(preApprovalResult.message).toContain('Not all done tasks are approved');

    // 5. Approve tasks
    await server.approveTaskCompletion(projectId, taskId1);
    await server.approveTaskCompletion(projectId, taskId2);

    // 6. Now approve the project (should succeed)
    const approvalResult = await server.approveProjectCompletion(projectId);
    expect(approvalResult.status).toBe('project_approved_complete');

    // 7. Verify project state
    const project = server["data"].projects.find(p => p.projectId === projectId);
    expect(project?.completed).toBe(true);
    expect(project?.tasks.every(t => t.status === 'done')).toBe(true);
    expect(project?.tasks.every(t => t.approved)).toBe(true);

    // 8. Try to approve again (should fail)
    const reapprovalResult = await server.approveProjectCompletion(projectId);
    expect(reapprovalResult.status).toBe('error');
    expect(reapprovalResult.message).toContain('Project is already completed');

    // 9. Verify project is still listed
    const listResult = await server.listProjects();
    const listedProject = listResult.projects?.find(p => p.projectId === projectId);
    expect(listedProject).toBeDefined();
    expect(listedProject?.initialPrompt).toBe('Project for approval workflow');
    expect(listedProject?.totalTasks).toBe(2);
    expect(listedProject?.completedTasks).toBe(2);
    expect(listedProject?.approvedTasks).toBe(2);
  });
}); 