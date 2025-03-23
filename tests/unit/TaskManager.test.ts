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
      
      // Test status update
      const updatedStatusTask = await server.updateTask(projectId, taskId, {
        status: 'in progress'
      });
      expect(updatedStatusTask.status).toBe('in progress');

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
      await server.updateTask(projectId, taskId1, {
        status: 'done',
        completedDetails: 'Task 1 completed details'
      });
      await server.updateTask(projectId, taskId2, {
        status: 'done',
        completedDetails: 'Task 2 completed details'
      });
      
      const result = await server.approveProjectCompletion(projectId);
      expect(result.status).toBe('error');
      expect(result.message).toContain('Not all done tasks are approved');
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
      expect(result.status).toBe('project_approved_complete');
      
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
      const result = await server.approveProjectCompletion(projectId);
      expect(result.status).toBe('error');
      expect(result.message).toContain('Project is already completed');
    });
  });

  describe('Task and Project Filtering', () => {
    describe('listProjects', () => {
      it('should list only open projects', async () => {
        // Create some projects. One open and one complete
        const project1 = await server.createProject("Open Project", [{ title: "Task 1", description: "Desc" }]);
        const project2 = await server.createProject("Completed project", [{ title: "Task 2", description: "Desc" }]);
        const proj1Id = project1.projectId;
        const proj2Id = project2.projectId;

        // Complete tasks in project 2
        await server.updateTask(proj2Id, project2.tasks[0].id, {
          status: 'done',
          completedDetails: 'Completed task details'
        });
        await server.approveTaskCompletion(proj2Id, project2.tasks[0].id);
        
        // Approve project 2
        await server.approveProjectCompletion(proj2Id);

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
        await server.updateTask(project1.projectId, project1.tasks[0].id, {
          status: 'done',
          completedDetails: 'Completed task details'
        });

        // Complete project 2 fully
        await server.updateTask(project2.projectId, project2.tasks[0].id, {
          status: 'done',
          completedDetails: 'Completed task details'
        });
        await server.approveTaskCompletion(project2.projectId, project2.tasks[0].id);
        await server.approveProjectCompletion(project2.projectId);

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
        await server.updateTask(project2.projectId, project2.tasks[0].id, {
          status: 'done',
          completedDetails: 'Completed task details'
        });
        await server.approveTaskCompletion(project2.projectId, project2.tasks[0].id);
        await server.approveProjectCompletion(project2.projectId);

        // Mark project 3's task as done but not approved
        await server.updateTask(project3.projectId, project3.tasks[0].id, {
          status: 'done',
          completedDetails: 'Completed task details'
        });

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
        await server.updateTask(project1.projectId, project1.tasks[1].id, {
          status: 'done',
          completedDetails: 'Task 2 completed details'
        });
        await server.approveTaskCompletion(project1.projectId, project1.tasks[1].id);

        await server.updateTask(project2.projectId, project2.tasks[0].id, {
          status: 'done',
          completedDetails: 'Task 3 completed details'
        });

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
        await server.updateTask(project.projectId, project.tasks[1].id, {
          status: 'done',
          completedDetails: 'Task 2 completed details'
        });
        await server.approveTaskCompletion(project.projectId, project.tasks[1].id);
        
        await server.updateTask(project.projectId, project.tasks[2].id, {
          status: 'done',
          completedDetails: 'Task 3 completed details'
        });

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
  });

  describe('Task Recommendations', () => {
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
      ) as { 
        projectId: string; 
        tasks: { id: string }[];
      };
      
      const projectId = createResult.projectId;
      const taskId = createResult.tasks[0].id;
      
      // Update the task status to done
      const updatedTask = await server.updateTask(projectId, taskId, {
        status: 'done',
        completedDetails: 'Task completed via updateTask'
      });
      
      // The task should be automatically approved
      expect(updatedTask.status).toBe('done');
      expect(updatedTask.approved).toBe(true);
      
      // Verify that we can complete the project without explicitly approving the task
      const approveResult = await server.approveProjectCompletion(projectId);
      expect(approveResult.status).toBe('project_approved_complete');
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
      ) as { 
        projectId: string; 
        tasks: { id: string }[];
      };
      
      const projectId = createResult.projectId;
      const taskId = createResult.tasks[0].id;
      
      // Update the task status to done
      const updatedTask = await server.updateTask(projectId, taskId, {
        status: 'done',
        completedDetails: 'Task completed via updateTask'
      });
      
      // The task should not be automatically approved
      expect(updatedTask.status).toBe('done');
      expect(updatedTask.approved).toBe(false);
      
      // Verify that we cannot complete the project without explicitly approving the task
      const approveResult = await server.approveProjectCompletion(projectId);
      expect(approveResult.status).toBe('error');
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
      ) as { 
        projectId: string; 
        tasks: { id: string }[];
      };
      
      const projectId = createResult.projectId;
      const taskId = createResult.tasks[0].id;
      
      // Update the task status to done
      const updatedTask = await server.updateTask(projectId, taskId, {
        status: 'done',
        completedDetails: 'Task completed via updateTask'
      });
      
      // The task should not be automatically approved by default
      expect(updatedTask.status).toBe('done');
      expect(updatedTask.approved).toBe(false);
    });
  });
}); 