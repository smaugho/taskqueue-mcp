import { describe, it, expect } from '@jest/globals';
import { ALL_TOOLS } from '../../src/server/tools.js';
import { VALID_STATUS_TRANSITIONS, Task } from '../../src/types/index.js';
import { TaskManager } from '../../src/server/TaskManager.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

describe('TaskManager', () => {
  let server: TaskManager;
  let tempDir: string;
  let tasksFilePath: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `task-manager-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    tasksFilePath = path.join(tempDir, "test-tasks.json");
    server = new TaskManager(tasksFilePath);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Configuration and Constants', () => {
    describe('Tools Configuration', () => {
      it('should have the required tools', () => {
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
  });

  describe('Basic Project Operations', () => {
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
      );

      expect(result.status).toBe('success');
      expect(result.data.projectId).toBeDefined();
      expect(result.data.totalTasks).toBe(1);
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

      const result = await server.listProjects();
      expect(result.status).toBe('success');
      expect(result.data.projects).toHaveLength(1);
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
      );

      // Delete the project directly using data model access
      const projectIndex = server["data"].projects.findIndex((p) => p.projectId === createResult.data.projectId);
      server["data"].projects.splice(projectIndex, 1);
      await server["saveTasks"]();
      
      // Verify deletion
      const listResult = await server.listProjects();
      expect(listResult.data.projects).toHaveLength(0);
    });
  });

  describe('Basic Task Operations', () => {
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
      );

      const projectId = createResult.data.projectId;
      const taskId = createResult.data.tasks[0].id;

      // Test task reading
      const readResult = await server.openTaskDetails(taskId);
      expect(readResult.status).toBe('success');
      if (readResult.status === 'success' && readResult.data.task) {
        expect(readResult.data.task.id).toBe(taskId);
      }

      // Test task updating
      const updatedTask = await server.updateTask(projectId, taskId, {
        title: "Updated task",
        description: "Updated description"
      });
      expect(updatedTask.status).toBe('success');
      expect(updatedTask.data.title).toBe("Updated task");
      expect(updatedTask.data.description).toBe("Updated description");
      expect(updatedTask.data.status).toBe("not started");
      
      // Test status update
      const updatedStatusTask = await server.updateTask(projectId, taskId, {
        status: 'in progress'
      });
      expect(updatedStatusTask.status).toBe('success');
      expect(updatedStatusTask.data.status).toBe('in progress');

      // Test task deletion
      const deleteResult = await server.deleteTask(
        projectId,
        taskId
      );
      expect(deleteResult.status).toBe('success');
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
      );

      const projectId = createResult.data.projectId;
      
      // Get the next task
      const nextTaskResult = await server.getNextTask(projectId);
      
      expect(nextTaskResult.status).toBe('next_task');
      if (nextTaskResult.status === 'next_task') {
        expect(nextTaskResult.data.id).toBe(createResult.data.tasks[0].id);
      }
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
      );
      
      projectId = createResult.data.projectId;
      taskId1 = createResult.data.tasks[0].id;
      taskId2 = createResult.data.tasks[1].id;
    });
    
    it('should not approve project if tasks are not done', async () => {
      await expect(server.approveProjectCompletion(projectId)).rejects.toMatchObject({
        code: 'ERR_3003',
        message: 'Not all tasks are done'
      });
    });
    
    it('should not approve project if tasks are done but not approved', async () => {
      // Mark both tasks as done
      await server.updateTask(projectId, taskId1, {
        status: 'done',
        completedDetails: 'Task 1 completed details'
      });
      await server.updateTask(projectId, taskId2, {
        status: 'done',
        completedDetails: 'Task 2 completed details'
      });
      
      await expect(server.approveProjectCompletion(projectId)).rejects.toMatchObject({
        code: 'ERR_3004',
        message: 'Not all done tasks are approved'
      });
    });
    
    it('should approve project when all tasks are done and approved', async () => {
      // Mark both tasks as done and approved
      await server.updateTask(projectId, taskId1, {
        status: 'done',
        completedDetails: 'Task 1 completed details'
      });
      await server.updateTask(projectId, taskId2, {
        status: 'done',
        completedDetails: 'Task 2 completed details'
      });
      
      // Approve tasks
      await server.approveTaskCompletion(projectId, taskId1);
      await server.approveTaskCompletion(projectId, taskId2);
      
      const result = await server.approveProjectCompletion(projectId);
      expect(result.status).toBe('success');
      
      // Verify project is marked as completed
      const project = server["data"].projects.find(p => p.projectId === projectId);
      expect(project?.completed).toBe(true);
    });
    
    it('should not allow approving an already completed project', async () => {
      // First approve the project
      await server.updateTask(projectId, taskId1, {
        status: 'done',
        completedDetails: 'Task 1 completed details'
      });
      await server.updateTask(projectId, taskId2, {
        status: 'done',
        completedDetails: 'Task 2 completed details'
      });
      await server.approveTaskCompletion(projectId, taskId1);
      await server.approveTaskCompletion(projectId, taskId2);
      
      await server.approveProjectCompletion(projectId);
      
      // Try to approve again
      await expect(server.approveProjectCompletion(projectId)).rejects.toMatchObject({
        code: 'ERR_3001',
        message: 'Project is already completed'
      });
    });
  });

  describe('Task and Project Filtering', () => {
    describe('listProjects', () => {
      it('should list only open projects', async () => {
        // Create some projects. One open and one complete
        const project1 = await server.createProject("Open Project", [{ title: "Task 1", description: "Desc" }]);
        const project2 = await server.createProject("Completed project", [{ title: "Task 2", description: "Desc" }]);
        const proj1Id = project1.data.projectId;
        const proj2Id = project2.data.projectId;

        // Complete tasks in project 2
        await server.updateTask(proj2Id, project2.data.tasks[0].id, {
          status: 'done',
          completedDetails: 'Completed task details'
        });
        await server.approveTaskCompletion(proj2Id, project2.data.tasks[0].id);
        
        // Approve project 2
        await server.approveProjectCompletion(proj2Id);

        const result = await server.listProjects("open");
        expect(result.status).toBe('success');
        expect(result.data.projects.length).toBe(1);
        expect(result.data.projects[0].projectId).toBe(proj1Id);
      });

      it('should list only pending approval projects', async () => {
        // Create projects and tasks with varying statuses
        const project1 = await server.createProject("Pending Approval Project", [{ title: "Task 1", description: "Desc" }]);
        const project2 = await server.createProject("Completed project", [{ title: "Task 2", description: "Desc" }]);
        const project3 = await server.createProject("In Progress Project", [{ title: "Task 3", description: "Desc" }]);

        // Mark task1 as done but not approved
        await server.updateTask(project1.data.projectId, project1.data.tasks[0].id, {
          status: 'done',
          completedDetails: 'Completed task details'
        });

        // Complete project 2 fully
        await server.updateTask(project2.data.projectId, project2.data.tasks[0].id, {
          status: 'done',
          completedDetails: 'Completed task details'
        });
        await server.approveTaskCompletion(project2.data.projectId, project2.data.tasks[0].id);
        await server.approveProjectCompletion(project2.data.projectId);

        const result = await server.listProjects("pending_approval");
        expect(result.status).toBe('success');
        expect(result.data.projects.length).toBe(1);
        expect(result.data.projects[0].projectId).toBe(project1.data.projectId);
      });

      it('should list only completed projects', async () => {
        // Create projects with different states
        const project1 = await server.createProject("Open Project", [{ title: "Task 1", description: "Desc" }]);
        const project2 = await server.createProject("Completed project", [{ title: "Task 2", description: "Desc" }]);
        const project3 = await server.createProject("Pending Project", [{ title: "Task 3", description: "Desc" }]);

        // Complete project 2 fully
        await server.updateTask(project2.data.projectId, project2.data.tasks[0].id, {
          status: 'done',
          completedDetails: 'Completed task details'
        });
        await server.approveTaskCompletion(project2.data.projectId, project2.data.tasks[0].id);
        await server.approveProjectCompletion(project2.data.projectId);

        // Mark project 3's task as done but not approved
        await server.updateTask(project3.data.projectId, project3.data.tasks[0].id, {
          status: 'done',
          completedDetails: 'Completed task details'
        });

        const result = await server.listProjects("completed");
        expect(result.status).toBe('success');
        expect(result.data.projects.length).toBe(1);
        expect(result.data.projects[0].projectId).toBe(project2.data.projectId);
      });

      it('should list all projects when state is \'all\'', async () => {
        // Create projects with different states
        const project1 = await server.createProject("Open Project", [{ title: "Task 1", description: "Desc" }]);
        const project2 = await server.createProject("Completed project", [{ title: "Task 2", description: "Desc" }]);
        const project3 = await server.createProject("Pending Project", [{ title: "Task 3", description: "Desc" }]);

        const result = await server.listProjects("all");
        expect(result.status).toBe('success');
        expect(result.data.projects.length).toBe(3);
      });

      it('should handle empty project list', async () => {
        const result = await server.listProjects("open");
        expect(result.status).toBe('success');
        expect(result.data.projects.length).toBe(0);
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
        await server.updateTask(project1.data.projectId, project1.data.tasks[1].id, {
          status: 'done',
          completedDetails: 'Task 2 completed details'
        });
        await server.approveTaskCompletion(project1.data.projectId, project1.data.tasks[1].id);

        await server.updateTask(project2.data.projectId, project2.data.tasks[0].id, {
          status: 'done',
          completedDetails: 'Task 3 completed details'
        });

        // Test open tasks
        const openResult = await server.listTasks(undefined, "open");
        expect(openResult.status).toBe('success');
        expect(openResult.data.tasks!.length).toBe(1);
        expect(openResult.data.tasks![0].title).toBe("Task 1");

        // Test pending approval tasks
        const pendingResult = await server.listTasks(undefined, "pending_approval");
        expect(pendingResult.status).toBe('success');
        expect(pendingResult.data.tasks!.length).toBe(1);
        expect(pendingResult.data.tasks![0].title).toBe("Task 3");

        // Test completed tasks
        const completedResult = await server.listTasks(undefined, "completed");
        expect(completedResult.status).toBe('success');
        expect(completedResult.data.tasks!.length).toBe(1);
        expect(completedResult.data.tasks![0].title).toBe("Task 2");
      });

      it('should list tasks for specific project filtered by state', async () => {
        // Create a project with tasks in different states
        const project = await server.createProject("Test Project", [
          { title: "Task 1", description: "Open task" },
          { title: "Task 2", description: "Done and approved task" },
          { title: "Task 3", description: "Done but not approved task" }
        ]);

        // Set task states
        await server.updateTask(project.data.projectId, project.data.tasks[1].id, {
          status: 'done',
          completedDetails: 'Task 2 completed details'
        });
        await server.approveTaskCompletion(project.data.projectId, project.data.tasks[1].id);
        
        await server.updateTask(project.data.projectId, project.data.tasks[2].id, {
          status: 'done',
          completedDetails: 'Task 3 completed details'
        });

        // Test open tasks
        const openResult = await server.listTasks(project.data.projectId, "open");
        expect(openResult.status).toBe('success');
        expect(openResult.data.tasks!.length).toBe(1);
        expect(openResult.data.tasks![0].title).toBe("Task 1");

        // Test pending approval tasks
        const pendingResult = await server.listTasks(project.data.projectId, "pending_approval");
        expect(pendingResult.status).toBe('success');
        expect(pendingResult.data.tasks!.length).toBe(1);
        expect(pendingResult.data.tasks![0].title).toBe("Task 3");

        // Test completed tasks
        const completedResult = await server.listTasks(project.data.projectId, "completed");
        expect(completedResult.status).toBe('success');
        expect(completedResult.data.tasks!.length).toBe(1);
        expect(completedResult.data.tasks![0].title).toBe("Task 2");
      });

      it('should handle non-existent project ID', async () => {
        await expect(server.listTasks("non-existent-project", "open")).rejects.toMatchObject({
          code: 'ERR_2000',
          message: 'Project non-existent-project not found'
        });
      });

      it('should handle empty task list', async () => {
        const project = await server.createProject("Empty Project", []);
        const result = await server.listTasks(project.data.projectId, "open");
        expect(result.status).toBe('success');
        expect(result.data.tasks!.length).toBe(0);
      });
    });
  });

  describe('Task Recommendations', () => {
    it("should handle tasks with tool and rule recommendations", async () => {
      const createResult = await server.createProject("Test Project", [
        { 
          title: "Test Task", 
          description: "Test Description",
          toolRecommendations: "Use tool X",
          ruleRecommendations: "Review rule Y"
        },
      ]);
      const projectId = createResult.data.projectId;
      const tasksResponse = await server.listTasks(projectId);
      if (tasksResponse.status !== 'success' || !tasksResponse.data.tasks?.length) {
        throw new Error('Expected tasks in response');
      }
      const tasks = tasksResponse.data.tasks as Task[];
      const taskId = tasks[0].id;

      // Verify initial recommendations
      expect(tasks[0].toolRecommendations).toBe("Use tool X");
      expect(tasks[0].ruleRecommendations).toBe("Review rule Y");

      // Update recommendations
      const updatedTask = await server.updateTask(projectId, taskId, {
        toolRecommendations: "Use tool Z",
        ruleRecommendations: "Review rule W",
      });

      expect(updatedTask.status).toBe('success');
      expect(updatedTask.data.toolRecommendations).toBe("Use tool Z");
      expect(updatedTask.data.ruleRecommendations).toBe("Review rule W");

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
      if (allTasksResponse.status !== 'success' || !allTasksResponse.data.tasks?.length) {
        throw new Error('Expected tasks in response');
      }
      const allTasks = allTasksResponse.data.tasks as Task[];
      const newTask = allTasks.find(t => t.title === "Added Task");
      expect(newTask).toBeDefined();
      if (newTask) {
        expect(newTask.toolRecommendations).toBe("Tool A");
        expect(newTask.ruleRecommendations).toBe("Rule B");
      }
    });

    it("should handle tasks with no recommendations", async () => {
      const createResult = await server.createProject("Test Project", [
        { title: "Test Task", description: "Test Description" },
      ]);
      const projectId = createResult.data.projectId;
      const tasksResponse = await server.listTasks(projectId);
      if (tasksResponse.status !== 'success' || !tasksResponse.data.tasks?.length) {
        throw new Error('Expected tasks in response');
      }
      const tasks = tasksResponse.data.tasks as Task[];
      const taskId = tasks[0].id;

      // Verify no recommendations
      expect(tasks[0].toolRecommendations).toBeUndefined();
      expect(tasks[0].ruleRecommendations).toBeUndefined();

      // Add task without recommendations
      await server.addTasksToProject(projectId, [
        { title: "Added Task", description: "No recommendations" }
      ]);

      const allTasksResponse = await server.listTasks(projectId);
      if (allTasksResponse.status !== 'success' || !allTasksResponse.data.tasks?.length) {
        throw new Error('Expected tasks in response');
      }
      const allTasks = allTasksResponse.data.tasks as Task[];
      const newTask = allTasks.find(t => t.title === "Added Task");
      expect(newTask).toBeDefined();
      if (newTask) {
        expect(newTask.toolRecommendations).toBeUndefined();
        expect(newTask.ruleRecommendations).toBeUndefined();
      }
    });
  });

  describe('Auto-approval of tasks', () => {
    it('should auto-approve tasks when updating status to done and autoApprove is enabled', async () => {
      // Create a project with autoApprove enabled
      const createResult = await server.createProject(
        'Auto-approval for updateTask',
        [
          {
            title: 'Task to update',
            description: 'This task should be auto-approved when status is updated to done'
          }
        ],
        'Test plan',
        true // autoApprove parameter
      );
      
      const projectId = createResult.data.projectId;
      const taskId = createResult.data.tasks[0].id;
      
      // Update the task status to done
      const updatedTask = await server.updateTask(projectId, taskId, {
        status: 'done',
        completedDetails: 'Task completed via updateTask'
      });
      
      // The task should be automatically approved
      expect(updatedTask.status).toBe('success');
      expect(updatedTask.data.status).toBe('done');
      expect(updatedTask.data.approved).toBe(true);
      
      // Verify that we can complete the project without explicitly approving the task
      const approveResult = await server.approveProjectCompletion(projectId);
      expect(approveResult.status).toBe('success');
    });
    
    it('should not auto-approve tasks when updating status to done and autoApprove is disabled', async () => {
      // Create a project with autoApprove disabled
      const createResult = await server.createProject(
        'Manual-approval for updateTask',
        [
          {
            title: 'Task to update manually',
            description: 'This task should not be auto-approved when status is updated to done'
          }
        ],
        'Test plan',
        false // autoApprove parameter
      );
      
      const projectId = createResult.data.projectId;
      const taskId = createResult.data.tasks[0].id;
      
      // Update the task status to done
      const updatedTask = await server.updateTask(projectId, taskId, {
        status: 'done',
        completedDetails: 'Task completed via updateTask'
      });
      
      // The task should not be automatically approved
      expect(updatedTask.status).toBe('success');
      expect(updatedTask.data.status).toBe('done');
      expect(updatedTask.data.approved).toBe(false);
      
      // Verify that we cannot complete the project without explicitly approving the task
      await expect(server.approveProjectCompletion(projectId)).rejects.toMatchObject({
        code: 'ERR_3004',
        message: 'Not all done tasks are approved'
      });
    });
    
    it('should make autoApprove false by default if not specified', async () => {
      // Create a project without specifying autoApprove
      const createResult = await server.createProject(
        'Default-approval Project',
        [
          {
            title: 'Default-approved task',
            description: 'This task should follow the default approval behavior'
          }
        ]
      );
      
      const projectId = createResult.data.projectId;
      const taskId = createResult.data.tasks[0].id;
      
      // Update the task status to done
      const updatedTask = await server.updateTask(projectId, taskId, {
        status: 'done',
        completedDetails: 'Task completed via updateTask'
      });
      
      // The task should not be automatically approved by default
      expect(updatedTask.status).toBe('success');
      expect(updatedTask.data.status).toBe('done');
      expect(updatedTask.data.approved).toBe(false);
    });
  });
}); 