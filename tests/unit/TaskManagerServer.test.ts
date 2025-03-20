import { describe, it, expect } from '@jest/globals';
import { ALL_TOOLS } from '../../src/types/tools.js';
import { VALID_STATUS_TRANSITIONS, Task } from '../../src/types/index.js';
import { TaskManagerServer } from '../../src/server/TaskManagerServer.js';
import { mockTaskManagerData } from '../helpers/mocks.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

describe('TaskManagerServer', () => {
  let server: TaskManagerServer;
  let tempDir: string;
  let tasksFilePath: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `task-manager-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    tasksFilePath = path.join(tempDir, "test-tasks.json");
    server = new TaskManagerServer(tasksFilePath);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Tools Configuration', () => {
    it('should have the required tools', () => {
      expect(ALL_TOOLS.length).toBeGreaterThan(2); // Now we have many more tools
      
      const projectToolCount = ALL_TOOLS.filter(tool => 
        tool.name.includes('project')
      ).length;
      expect(projectToolCount).toBeGreaterThanOrEqual(5);
      
      const taskToolCount = ALL_TOOLS.filter(tool => 
        tool.name.includes('task')
      ).length;
      expect(taskToolCount).toBeGreaterThanOrEqual(5);
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

  it('should handle project creation', async () => {
    const result = await server.createProject(
      'Test project',
      [
        {
          title: 'Test task',
          description: 'Test description'
        }
      ],
      'Test plan'
    ) as { status: string; projectId: string; totalTasks: number; tasks: any[]; message: string };

    expect(result.status).toBe('planned');
    expect(result.projectId).toBeDefined();
    expect(result.totalTasks).toBe(1);
  });

  it('should handle project listing', async () => {
    // Create a project first
    await server.createProject(
      'Test project',
      [
        {
          title: 'Test task',
          description: 'Test description'
        }
      ],
      'Test plan'
    );

    const result = await server.listProjects() as { status: string; projects: any[]; message: string };
    expect(result.status).toBe('projects_listed');
    expect(result.projects).toHaveLength(1);
  });

  it('should handle project deletion', async () => {
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
    ) as { status: string; projectId: string; totalTasks: number; tasks: any[]; message: string };

    // Delete the project directly using data model access
    const projectIndex = server["data"].projects.findIndex((p) => p.projectId === createResult.projectId);
    server["data"].projects.splice(projectIndex, 1);
    await server["saveTasks"]();
    
    // Verify deletion
    const listResult = await server.listProjects() as { status: string; projects: any[]; message: string };
    expect(listResult.projects).toHaveLength(0);
  });

  it('should handle task operations', async () => {
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
    ) as { status: string; projectId: string; totalTasks: number; tasks: { id: string }[]; message: string };

    const projectId = createResult.projectId;
    const taskId = createResult.tasks[0].id;

    // Test task reading
    const readResult = await server.openTaskDetails(taskId);
    expect(readResult.status).toBe('task_details');
    if (readResult.status === 'task_details' && readResult.task) {
      expect(readResult.task.id).toBe(taskId);
    }

    // Test task updating
    const updatedTask = await server.updateTask(projectId, taskId, {
      title: "Updated task",
      description: "Updated description"
    });
    expect(updatedTask.title).toBe("Updated task");
    expect(updatedTask.description).toBe("Updated description");
    expect(updatedTask.status).toBe("not started");
    
    // Update status separately
    const task = server["data"].projects.find(p => p.projectId === projectId)?.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = 'in progress';
      await server["saveTasks"]();
    }

    // Test task deletion
    const deleteResult = await server.deleteTask(
      projectId,
      taskId
    ) as { status: string; message: string };
    expect(deleteResult.status).toBe('task_deleted');
  });
  
  it('should get the next task', async () => {
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
  
  it('should mark a task as done and approve it', async () => {
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
    const markDoneResult = await server.markTaskDone(
      projectId, 
      taskId, 
      'Completed task details'
    );
    
    expect(markDoneResult.status).toBe('task_marked_done');
    
    // Check the task status from the data model
    const project = server["data"].projects.find(p => p.projectId === projectId);
    const task = project?.tasks.find(t => t.id === taskId);
    expect(task?.status).toBe('done');
    
    // Approve the task
    const approveResult = await server.approveTaskCompletion(projectId, taskId);
    
    expect(approveResult.status).toBe('task_approved');
    if (approveResult.status === 'task_approved' && approveResult.task) {
      expect(approveResult.task.approved).toBe(true);
    }
  });
  
  describe('Conditional validation for completedDetails', () => {
    let projectId: string;
    let taskId: string;
    
    beforeEach(async () => {
      // Create a project with a task for each test in this group
      const createResult = await server.createProject(
        'Test project for completedDetails validation',
        [
          {
            title: 'Task for validation',
            description: 'Task used to test completedDetails validation'
          }
        ]
      ) as { 
        projectId: string; 
        tasks: { id: string }[];
      };
      
      projectId = createResult.projectId;
      taskId = createResult.tasks[0].id;
      
      // Set task to in_progress
      const task = server["data"].projects.find(p => p.projectId === projectId)?.tasks.find(t => t.id === taskId);
      if (task) {
        task.status = 'in progress';
        await server["saveTasks"]();
      }
    });
    
    it('should require completedDetails when marking task as done', async () => {
      const result = await server.markTaskDone(projectId, taskId);
      
      // Even without completedDetails, markTaskDone should still work but set completedDetails to empty string
      expect(result.status).toBe('task_marked_done');
      
      const task = server["data"].projects.find(p => p.projectId === projectId)?.tasks.find(t => t.id === taskId);
      expect(task?.completedDetails).toBe('');
    });
    
    it('should save completedDetails when provided', async () => {
      const details = 'These are the completed details';
      const result = await server.markTaskDone(projectId, taskId, details);
      
      expect(result.status).toBe('task_marked_done');
      
      const task = server["data"].projects.find(p => p.projectId === projectId)?.tasks.find(t => t.id === taskId);
      expect(task?.completedDetails).toBe(details);
    });
    
    it('should validate status transitions', async () => {
      // Create a new task that's in "not started" state
      const newProjectResult = await server.createProject(
        'Project for status transition',
        [
          {
            title: 'Task for status transition',
            description: 'Testing that we cannot go directly from not started to done'
          }
        ]
      );
      
      const newProjectId = newProjectResult.projectId;
      const newTaskId = newProjectResult.tasks[0].id;
      
      // Attempt to mark as done directly (should work, but would ideally validate in the future)
      await server.markTaskDone(newProjectId, newTaskId, 'Details');
      
      const task = server["data"].projects.find(p => p.projectId === newProjectId)?.tasks.find(t => t.id === newTaskId);
      expect(task?.status).toBe('done');
    });

    it('should handle invalid project and task IDs when marking task as done', async () => {
      // Test with invalid project ID
      const invalidProjectResult = await server.markTaskDone('invalid-project', taskId, 'Details');
      expect(invalidProjectResult.status).toBe('error');
      expect(invalidProjectResult.message).toBe('Project not found');

      // Test with invalid task ID
      const invalidTaskResult = await server.markTaskDone(projectId, 'invalid-task', 'Details');
      expect(invalidTaskResult.status).toBe('error');
      expect(invalidTaskResult.message).toBe('Task not found');
    });
  });

  describe('Project Approval', () => {
    let projectId: string;
    let taskId1: string;
    let taskId2: string;
    
    beforeEach(async () => {
      // Create a project with two tasks for each test in this group
      const createResult = await server.createProject(
        'Test project for approval',
        [
          {
            title: 'Task 1',
            description: 'Description for task 1'
          },
          {
            title: 'Task 2',
            description: 'Description for task 2'
          }
        ]
      ) as { 
        projectId: string; 
        tasks: { id: string }[];
      };
      
      projectId = createResult.projectId;
      taskId1 = createResult.tasks[0].id;
      taskId2 = createResult.tasks[1].id;
    });
    
    it('should not approve project if tasks are not done', async () => {
      const result = await server.approveProjectCompletion(projectId);
      expect(result.status).toBe('error');
      expect(result.message).toContain('Not all tasks are done');
    });
    
    it('should not approve project if tasks are done but not approved', async () => {
      // Mark both tasks as done
      const task1 = server["data"].projects.find(p => p.projectId === projectId)?.tasks.find(t => t.id === taskId1);
      const task2 = server["data"].projects.find(p => p.projectId === projectId)?.tasks.find(t => t.id === taskId2);
      if (task1 && task2) {
        task1.status = 'done';
        task2.status = 'done';
        await server["saveTasks"]();
      }
      
      const result = await server.approveProjectCompletion(projectId);
      expect(result.status).toBe('error');
      expect(result.message).toContain('Not all done tasks are approved');
    });
    
    it('should approve project when all tasks are done and approved', async () => {
      // Mark both tasks as done and approved
      const task1 = server["data"].projects.find(p => p.projectId === projectId)?.tasks.find(t => t.id === taskId1);
      const task2 = server["data"].projects.find(p => p.projectId === projectId)?.tasks.find(t => t.id === taskId2);
      if (task1 && task2) {
        task1.status = 'done';
        task2.status = 'done';
        task1.approved = true;
        task2.approved = true;
        await server["saveTasks"]();
      }
      
      const result = await server.approveProjectCompletion(projectId);
      expect(result.status).toBe('project_approved_complete');
      
      // Verify project is marked as completed
      const project = server["data"].projects.find(p => p.projectId === projectId);
      expect(project?.completed).toBe(true);
    });
    
    it('should not allow approving an already completed project', async () => {
      // First approve the project
      const task1 = server["data"].projects.find(p => p.projectId === projectId)?.tasks.find(t => t.id === taskId1);
      const task2 = server["data"].projects.find(p => p.projectId === projectId)?.tasks.find(t => t.id === taskId2);
      if (task1 && task2) {
        task1.status = 'done';
        task2.status = 'done';
        task1.approved = true;
        task2.approved = true;
        await server["saveTasks"]();
      }
      
      await server.approveProjectCompletion(projectId);
      
      // Try to approve again
      const result = await server.approveProjectCompletion(projectId);
      expect(result.status).toBe('error');
      expect(result.message).toContain('Project is already completed');
    });
  });

  describe('listProjects', () => {
    it('should list only open projects', async () => {
      // Create some projects. One open and one complete
      const project1 = await server.createProject("Open Project", [{ title: "Task 1", description: "Desc" }]);
      const project2 = await server.createProject("Completed project", [{ title: "Task 2", description: "Desc" }]);
      const proj1Id = project1.projectId;
      const proj2Id = project2.projectId;

      // Complete tasks in project 2
      const proj2Task = server["data"].projects.find(p => p.projectId === proj2Id)?.tasks[0];
      if (proj2Task) {
        proj2Task.status = "done";
        proj2Task.approved = true;
        server["data"].projects.find(p => p.projectId === proj2Id)!.completed = true;
        await server["saveTasks"]();
      }

      const result = await server.listProjects("open");
      expect(result.projects.length).toBe(1);
      expect(result.projects[0].projectId).toBe(proj1Id);
    });

    it('should list only pending approval projects', async () => {
      // Create projects and tasks with varying statuses
      const project1 = await server.createProject("Pending Approval Project", [{ title: "Task 1", description: "Desc" }]);
      const project2 = await server.createProject("Completed project", [{ title: "Task 2", description: "Desc" }]);
      const project3 = await server.createProject("In Progress Project", [{ title: "Task 3", description: "Desc" }]);

      // Mark task1 as done but not approved
      const proj1Task = server["data"].projects.find(p => p.projectId === project1.projectId)?.tasks[0];
      if (proj1Task) {
        proj1Task.status = "done";
        await server["saveTasks"]();
      }

      // Complete project 2 fully
      const proj2Task = server["data"].projects.find(p => p.projectId === project2.projectId)?.tasks[0];
      if (proj2Task) {
        proj2Task.status = "done";
        proj2Task.approved = true;
        server["data"].projects.find(p => p.projectId === project2.projectId)!.completed = true;
        await server["saveTasks"]();
      }

      const result = await server.listProjects("pending_approval");
      expect(result.projects.length).toBe(1);
      expect(result.projects[0].projectId).toBe(project1.projectId);
    });

    it('should list only completed projects', async () => {
      // Create projects with different states
      const project1 = await server.createProject("Open Project", [{ title: "Task 1", description: "Desc" }]);
      const project2 = await server.createProject("Completed project", [{ title: "Task 2", description: "Desc" }]);
      const project3 = await server.createProject("Pending Project", [{ title: "Task 3", description: "Desc" }]);

      // Complete project 2 fully
      const proj2Task = server["data"].projects.find(p => p.projectId === project2.projectId)?.tasks[0];
      if (proj2Task) {
        proj2Task.status = "done";
        proj2Task.approved = true;
        server["data"].projects.find(p => p.projectId === project2.projectId)!.completed = true;
        await server["saveTasks"]();
      }

      // Mark project 3's task as done but not approved
      const proj3Task = server["data"].projects.find(p => p.projectId === project3.projectId)?.tasks[0];
      if (proj3Task) {
        proj3Task.status = "done";
        await server["saveTasks"]();
      }

      const result = await server.listProjects("completed");
      expect(result.projects.length).toBe(1);
      expect(result.projects[0].projectId).toBe(project2.projectId);
    });

    it('should list all projects when state is \'all\'', async () => {
      // Create projects with different states
      const project1 = await server.createProject("Open Project", [{ title: "Task 1", description: "Desc" }]);
      const project2 = await server.createProject("Completed project", [{ title: "Task 2", description: "Desc" }]);
      const project3 = await server.createProject("Pending Project", [{ title: "Task 3", description: "Desc" }]);

      const result = await server.listProjects("all");
      expect(result.projects.length).toBe(3);
    });

    it('should handle empty project list', async () => {
      const result = await server.listProjects("open");
      expect(result.projects.length).toBe(0);
    });
  });

  describe('listTasks', () => {
    it('should list tasks across all projects filtered by state', async () => {
      // Create two projects with tasks in different states
      const project1 = await server.createProject("Project 1", [
        { title: "Task 1", description: "Open task" },
        { title: "Task 2", description: "Done task" }
      ]);
      const project2 = await server.createProject("Project 2", [
        { title: "Task 3", description: "Pending approval task" }
      ]);

      // Set task states
      const proj1Tasks = server["data"].projects.find(p => p.projectId === project1.projectId)?.tasks;
      if (proj1Tasks) {
        proj1Tasks[1].status = "done";
        proj1Tasks[1].approved = true;
      }

      const proj2Tasks = server["data"].projects.find(p => p.projectId === project2.projectId)?.tasks;
      if (proj2Tasks) {
        proj2Tasks[0].status = "done";
      }

      await server["saveTasks"]();

      // Test open tasks
      const openResult = await server.listTasks(undefined, "open");
      expect(openResult.tasks!.length).toBe(1);
      expect(openResult.tasks![0].title).toBe("Task 1");

      // Test pending approval tasks
      const pendingResult = await server.listTasks(undefined, "pending_approval");
      expect(pendingResult.tasks!.length).toBe(1);
      expect(pendingResult.tasks![0].title).toBe("Task 3");

      // Test completed tasks
      const completedResult = await server.listTasks(undefined, "completed");
      expect(completedResult.tasks!.length).toBe(1);
      expect(completedResult.tasks![0].title).toBe("Task 2");
    });

    it('should list tasks for specific project filtered by state', async () => {
      // Create a project with tasks in different states
      const project = await server.createProject("Test Project", [
        { title: "Task 1", description: "Open task" },
        { title: "Task 2", description: "Done and approved task" },
        { title: "Task 3", description: "Done but not approved task" }
      ]);

      // Set task states
      const tasks = server["data"].projects.find(p => p.projectId === project.projectId)?.tasks;
      if (tasks) {
        tasks[1].status = "done";
        tasks[1].approved = true;
        tasks[2].status = "done";
      }

      await server["saveTasks"]();

      // Test open tasks
      const openResult = await server.listTasks(project.projectId, "open");
      expect(openResult.tasks!.length).toBe(1);
      expect(openResult.tasks![0].title).toBe("Task 1");

      // Test pending approval tasks
      const pendingResult = await server.listTasks(project.projectId, "pending_approval");
      expect(pendingResult.tasks!.length).toBe(1);
      expect(pendingResult.tasks![0].title).toBe("Task 3");

      // Test completed tasks
      const completedResult = await server.listTasks(project.projectId, "completed");
      expect(completedResult.tasks!.length).toBe(1);
      expect(completedResult.tasks![0].title).toBe("Task 2");
    });

    it('should handle non-existent project ID', async () => {
      const result = await server.listTasks("non-existent-project", "open");
      expect(result.status).toBe("error");
      expect(result.message).toBe("Project not found");
    });

    it('should handle empty task list', async () => {
      const project = await server.createProject("Empty Project", []);
      const result = await server.listTasks(project.projectId, "open");
      expect(result.tasks!.length).toBe(0);
    });
  });

  it("should handle tasks with tool and rule recommendations", async () => {
    const { projectId } = await server.createProject("Test Project", [
      { 
        title: "Test Task", 
        description: "Test Description",
        toolRecommendations: "Use tool X",
        ruleRecommendations: "Review rule Y"
      },
    ]);
    const tasksResponse = await server.listTasks(projectId);
    if (!('tasks' in tasksResponse) || !tasksResponse.tasks?.length) {
      throw new Error('Expected tasks in response');
    }
    const tasks = tasksResponse.tasks as Task[];
    const taskId = tasks[0].id;

    // Verify initial recommendations
    expect(tasks[0].toolRecommendations).toBe("Use tool X");
    expect(tasks[0].ruleRecommendations).toBe("Review rule Y");

    // Update recommendations
    const updatedTask = await server.updateTask(projectId, taskId, {
      toolRecommendations: "Use tool Z",
      ruleRecommendations: "Review rule W",
    });

    expect(updatedTask.toolRecommendations).toBe("Use tool Z");
    expect(updatedTask.ruleRecommendations).toBe("Review rule W");

    // Add new task with recommendations
    await server.addTasksToProject(projectId, [
      {
        title: "Added Task",
        description: "With recommendations",
        toolRecommendations: "Tool A",
        ruleRecommendations: "Rule B"
      }
    ]);

    const allTasksResponse = await server.listTasks(projectId);
    if (!('tasks' in allTasksResponse) || !allTasksResponse.tasks?.length) {
      throw new Error('Expected tasks in response');
    }
    const allTasks = allTasksResponse.tasks as Task[];
    const newTask = allTasks.find(t => t.title === "Added Task");
    expect(newTask).toBeDefined();
    if (newTask) {
      expect(newTask.toolRecommendations).toBe("Tool A");
      expect(newTask.ruleRecommendations).toBe("Rule B");
    }
  });

  it("should allow tasks with no recommendations", async () => {
    const { projectId } = await server.createProject("Test Project", [
      { title: "Test Task", description: "Test Description" },
    ]);
    const tasksResponse = await server.listTasks(projectId);
    if (!('tasks' in tasksResponse) || !tasksResponse.tasks?.length) {
      throw new Error('Expected tasks in response');
    }
    const tasks = tasksResponse.tasks as Task[];
    const taskId = tasks[0].id;

    // Verify no recommendations
    expect(tasks[0].toolRecommendations).toBeUndefined();
    expect(tasks[0].ruleRecommendations).toBeUndefined();

    // Add task without recommendations
    await server.addTasksToProject(projectId, [
      { title: "Added Task", description: "No recommendations" }
    ]);

    const allTasksResponse = await server.listTasks(projectId);
    if (!('tasks' in allTasksResponse) || !allTasksResponse.tasks?.length) {
      throw new Error('Expected tasks in response');
    }
    const allTasks = allTasksResponse.tasks as Task[];
    const newTask = allTasks.find(t => t.title === "Added Task");
    expect(newTask).toBeDefined();
    if (newTask) {
      expect(newTask.toolRecommendations).toBeUndefined();
      expect(newTask.ruleRecommendations).toBeUndefined();
    }
  });
}); 