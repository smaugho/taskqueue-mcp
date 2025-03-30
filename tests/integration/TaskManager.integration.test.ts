import { TaskManager } from '../../src/server/TaskManager.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { Task } from '../../src/types/index.js';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

describe('TaskManager Integration', () => {
  let server: TaskManager;
  let tempDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = path.join(os.tmpdir(), `task-manager-integration-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`);
    await fs.mkdir(tempDir, { recursive: true });
    testFilePath = path.join(tempDir, 'test-tasks.json');

    // Initialize the server with the test file path
    server = new TaskManager(testFilePath);
  });

  afterEach(async () => {
    // Clean up temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error('Error cleaning up temp directory:', err);
    }
  });

  it('should handle file persistence correctly', async () => {
    // Create initial data
    const project = await server.createProject("Persistent Project", [
      { title: "Task 1", description: "Test task" }
    ]);

    // Create a new server instance pointing to the same file
    const newServer = new TaskManager(testFilePath);

    // Verify the data was loaded correctly
    const result = await newServer.listProjects("open");
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.projects.length).toBe(1);
      if (project.status === "success") {
        expect(result.data.projects[0].projectId).toBe(project.data.projectId);
      }
    }

    // Modify task state in new server
    if (project.status === "success") {
      await newServer.updateTask(
        project.data.projectId, 
        project.data.tasks[0].id, 
        { 
          status: "done",
          completedDetails: "Completed task details"
        }
      );

      // Create another server instance and verify the changes persisted
      const thirdServer = new TaskManager(testFilePath);
      const pendingResult = await thirdServer.listTasks(project.data.projectId, "pending_approval");
      expect(pendingResult.status).toBe("success");
      if (pendingResult.status === "success") {
        expect(pendingResult.data.tasks!.length).toBe(1);
      }
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
    
    expect(createResult.status).toBe('success');
    if (createResult.status === "success") {
      expect(createResult.data.projectId).toBeDefined();
      expect(createResult.data.totalTasks).toBe(2);
      
      const projectId = createResult.data.projectId;
      const taskId1 = createResult.data.tasks[0].id;
      const taskId2 = createResult.data.tasks[1].id;
      
      // 2. Get the next task (first task)
      const nextTaskResult = await server.getNextTask(projectId);
      expect(nextTaskResult.status).toBe('success');
      if (nextTaskResult.status === 'success' && 'task' in nextTaskResult.data) {
        expect(nextTaskResult.data.task.id).toBe(taskId1);
      }
      
      // 3. Mark the first task as in progress
      await server.updateTask(projectId, taskId1, {
        status: 'in progress'
      });
      
      // 4. Mark the first task as done
      const markDoneResult = await server.updateTask(projectId, taskId1, {
        status: 'done',
        completedDetails: 'Task 1 completed details'
      });
      expect(markDoneResult.status).toBe('success');
      
      // 5. Approve the first task
      const approveResult = await server.approveTaskCompletion(projectId, taskId1);
      expect(approveResult.status).toBe('success');
      
      // 6. Get the next task (second task)
      const nextTaskResult2 = await server.getNextTask(projectId);
      expect(nextTaskResult2.status).toBe('success');
      if (nextTaskResult2.status === 'success' && 'task' in nextTaskResult2.data) {
        expect(nextTaskResult2.data.task.id).toBe(taskId2);
      }
      
      // 7. Mark the second task as in progress
      await server.updateTask(projectId, taskId2, {
        status: 'in progress'
      });
      
      // 8. Mark the second task as done
      const markDoneResult2 = await server.updateTask(projectId, taskId2, {
        status: 'done',
        completedDetails: 'Task 2 completed details'
      });
      expect(markDoneResult2.status).toBe('success');
      
      // 9. Approve the second task
      const approveResult2 = await server.approveTaskCompletion(projectId, taskId2);
      expect(approveResult2.status).toBe('success');
      
      // 10. Now all tasks should be done, check with getNextTask
      const allDoneResult = await server.getNextTask(projectId);
      expect(allDoneResult.status).toBe('all_tasks_done');
      if (allDoneResult.status === 'all_tasks_done') {
        expect(allDoneResult.data.message).toContain('All tasks have been completed');
      }
      
      // 11. Finalize the project
      const finalizeResult = await server.approveProjectCompletion(projectId);
      expect(finalizeResult.status).toBe('success');
      
      // 12. Verify the project is marked as completed
      const projectState = await server.listProjects("completed");
      expect(projectState.status).toBe('success');
      if (projectState.status === "success") {
        expect(projectState.data.projects.length).toBe(1);
        expect(projectState.data.projects[0].projectId).toBe(projectId);
      }
    }
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
    );

    expect(createResult.status).toBe('success');
    if (createResult.status === "success") {
      const projectId = createResult.data.projectId;
      const taskId1 = createResult.data.tasks[0].id;
      const taskId2 = createResult.data.tasks[1].id;

      // 2. Try to approve project before tasks are done (should fail)
      await expect(server.approveProjectCompletion(projectId)).rejects.toMatchObject({
        code: 'ERR_3003',
        message: 'Not all tasks are done'
      });

      // 3. Mark tasks as done
      await server.updateTask(projectId, taskId1, { status: 'done', completedDetails: 'Task 1 completed details' });
      await server.updateTask(projectId, taskId2, { status: 'done', completedDetails: 'Task 2 completed details' });

      // 4. Try to approve project before tasks are approved (should fail)
      await expect(server.approveProjectCompletion(projectId)).rejects.toMatchObject({
        code: 'ERR_3004',
        message: 'Not all done tasks are approved'
      });

      // 5. Approve tasks
      await server.approveTaskCompletion(projectId, taskId1);
      await server.approveTaskCompletion(projectId, taskId2);

      // 6. Now approve the project (should succeed)
      const approvalResult = await server.approveProjectCompletion(projectId);
      expect(approvalResult.status).toBe('success');

      // 7. Verify project state
      const projectAfterApproval = await server.listProjects("completed");
      expect(projectAfterApproval.status).toBe('success');
      if (projectAfterApproval.status === "success") {
        const completedProject = projectAfterApproval.data.projects.find(p => p.projectId === projectId);
        expect(completedProject).toBeDefined();
      }

      // 8. Try to approve again (should fail)
      await expect(server.approveProjectCompletion(projectId)).rejects.toMatchObject({
        code: 'ERR_3001',
        message: 'Project is already completed'
      });
    }
  });

  it("should handle complex project and task state transitions", async () => {
    // Create a project with multiple tasks
    const project = await server.createProject("Complex Project", [
      { title: "Task 1", description: "First task" },
      { title: "Task 2", description: "Second task" },
      { title: "Task 3", description: "Third task" }
    ]);

    expect(project.status).toBe('success');

    if (project.status === "success") {
      const projectId = project.data.projectId;
      const taskId1 = project.data.tasks[0].id;
      const taskId2 = project.data.tasks[1].id;

      // Initially all tasks should be open
      const initialOpenTasks = await server.listTasks(projectId, "open");
      expect(initialOpenTasks.status).toBe('success');
      if (initialOpenTasks.status === "success") {
        expect(initialOpenTasks.data.tasks!.length).toBe(3);
      }

      // Mark first task as done and approved
      await server.updateTask(projectId, taskId1, { 
        status: 'done',
        completedDetails: 'Task 1 completed' 
      });
      await server.approveTaskCompletion(projectId, taskId1);

      // Should now have 2 open tasks and 1 completed
      const openTasks = await server.listTasks(projectId, "open");
      expect(openTasks.status).toBe('success');
      if (openTasks.status === "success") {
        expect(openTasks.data.tasks!.length).toBe(2);
      }

      const completedTasks = await server.listTasks(projectId, "completed");
      expect(completedTasks.status).toBe('success');
      if (completedTasks.status === "success") {
        expect(completedTasks.data.tasks!.length).toBe(1);
      }

      // Mark second task as done but not approved
      await server.updateTask(projectId, taskId2, { 
        status: 'done',
        completedDetails: 'Task 2 completed' 
      });

      // Should now have 1 open task, 1 pending approval, and 1 completed
      const finalOpenTasks = await server.listTasks(projectId, "open");
      expect(finalOpenTasks.status).toBe('success');
      if (finalOpenTasks.status === "success") {
        expect(finalOpenTasks.data.tasks!.length).toBe(1);
      }

      const pendingTasks = await server.listTasks(projectId, "pending_approval");
      expect(pendingTasks.status).toBe('success');
      if (pendingTasks.status === "success") {
        expect(pendingTasks.data.tasks!.length).toBe(1);
      }

      const finalCompletedTasks = await server.listTasks(projectId, "completed");
      expect(finalCompletedTasks.status).toBe('success');
      if (finalCompletedTasks.status === "success") {
        expect(finalCompletedTasks.data.tasks!.length).toBe(1);
      }
    }
  });

  it("should handle tool/rule recommendations end-to-end", async () => {
    // Create a project with tasks that have recommendations
    const response = await server.createProject("Test Project", [
      {
        title: "Task with Recommendations",
        description: "Test Description",
        toolRecommendations: "Use tool A",
        ruleRecommendations: "Review rule B"
      },
      {
        title: "Task without Recommendations",
        description: "Another task"
      }
    ]);

    expect(response.status).toBe('success');
    if (response.status === "success") {
      const { projectId } = response.data;

      // Verify initial state
      const tasksResponse = await server.listTasks(projectId);
      expect(tasksResponse.status).toBe('success');
      if (tasksResponse.status === "success") {
        const tasks = tasksResponse.data.tasks as Task[];
        
        const taskWithRecs = tasks.find(t => t.title === "Task with Recommendations");
        const taskWithoutRecs = tasks.find(t => t.title === "Task without Recommendations");
        
        expect(taskWithRecs).toBeDefined();
        expect(taskWithoutRecs).toBeDefined();
        
        if (taskWithRecs) {
          expect(taskWithRecs.toolRecommendations).toBe("Use tool A");
          expect(taskWithRecs.ruleRecommendations).toBe("Review rule B");
        }
        
        if (taskWithoutRecs) {
          expect(taskWithoutRecs.toolRecommendations).toBeUndefined();
          expect(taskWithoutRecs.ruleRecommendations).toBeUndefined();
        }

        // Update task recommendations
        if (taskWithoutRecs) {
          const updateResponse = await server.updateTask(projectId, taskWithoutRecs.id, {
            toolRecommendations: "Use tool X",
            ruleRecommendations: "Review rule Y"
          });

          expect(updateResponse.status).toBe('success');
          if (updateResponse.status === "success") {
            expect(updateResponse.data.toolRecommendations).toBe("Use tool X");
            expect(updateResponse.data.ruleRecommendations).toBe("Review rule Y");
          }

          // Verify the update persisted
          const updatedTasksResponse = await server.listTasks(projectId);
          expect(updatedTasksResponse.status).toBe('success');
          if (updatedTasksResponse.status === "success") {
            const updatedTasks = updatedTasksResponse.data.tasks as Task[];
            const verifyTask = updatedTasks.find(t => t.id === taskWithoutRecs.id);
            expect(verifyTask).toBeDefined();
            if (verifyTask) {
              expect(verifyTask.toolRecommendations).toBe("Use tool X");
              expect(verifyTask.ruleRecommendations).toBe("Review rule Y");
            }
          }
        }
      }

      // Add new tasks with recommendations
      const addResponse = await server.addTasksToProject(projectId, [
        {
          title: "New Task",
          description: "With recommendations",
          toolRecommendations: "Use tool C",
          ruleRecommendations: "Review rule D"
        }
      ]);

      expect(addResponse.status).toBe('success');

      const finalTasksResponse = await server.listTasks(projectId);
      expect(finalTasksResponse.status).toBe('success');
      if (finalTasksResponse.status === "success") {
        const finalTasks = finalTasksResponse.data.tasks as Task[];
        const newTask = finalTasks.find(t => t.title === "New Task");
        expect(newTask).toBeDefined();
        if (newTask) {
          expect(newTask.toolRecommendations).toBe("Use tool C");
          expect(newTask.ruleRecommendations).toBe("Review rule D");
        }
      }
    }
  });

  it("should handle auto-approval in end-to-end workflow", async () => {
    // Create a project with autoApprove enabled
    const projectResponse = await server.createProject(
      "Auto-approval Project",
      [
        { title: "Task 1", description: "First auto-approved task" },
        { title: "Task 2", description: "Second auto-approved task" }
      ],
      "Auto approval plan",
      true // Enable auto-approval
    );

    expect(projectResponse.status).toBe('success');
    if (projectResponse.status === "success") {
      const project = projectResponse.data;

      // Mark tasks as done - they should be auto-approved
      await server.updateTask(project.projectId, project.tasks[0].id, {
        status: 'done',
        completedDetails: 'Task 1 completed'
      });

      await server.updateTask(project.projectId, project.tasks[1].id, {
        status: 'done',
        completedDetails: 'Task 2 completed'
      });

      // Verify tasks are approved
      const tasksResponse = await server.listTasks(project.projectId);
      expect(tasksResponse.status).toBe('success');
      if (tasksResponse.status === "success") {
        const tasks = tasksResponse.data.tasks as Task[];
        expect(tasks[0].approved).toBe(true);
        expect(tasks[1].approved).toBe(true);
      }

      // Project should be able to be completed without explicit task approval
      const completionResult = await server.approveProjectCompletion(project.projectId);
      expect(completionResult.status).toBe('success');

      // Create a new server instance and verify persistence
      const newServer = new TaskManager(testFilePath);
      const projectState = await newServer.listProjects("completed");
      expect(projectState.status).toBe('success');
      if (projectState.status === "success") {
        expect(projectState.data.projects.find(p => p.projectId === project.projectId)).toBeDefined();
      }
    }
  });

  it("multiple concurrent server instances should synchronize data", async () => {
    // Create a unique file path just for this test
    const uniqueTestFilePath = path.join(tempDir, `concurrent-test-${Date.now()}.json`);

    // Create two server instances that would typically be in different processes
    const server1 = new TaskManager(uniqueTestFilePath);
    const server2 = new TaskManager(uniqueTestFilePath);

    // Ensure both servers are fully initialized
    await server1["initialized"];
    await server2["initialized"];

    // Create a project with server1
    const projectResponse = await server1.createProject(
      "Concurrent Test Project",
      [{ title: "Test Task", description: "Description" }]
    );

    expect(projectResponse.status).toBe('success');
    if (projectResponse.status === "success") {
      const project = projectResponse.data;

      // Update the task with server2
      await server2.updateTask(project.projectId, project.tasks[0].id, {
        status: 'in progress'
      });

      // Verify the update with server1
      const taskDetails = await server1.openTaskDetails(project.tasks[0].id);
      expect(taskDetails.status).toBe('success');
      if (taskDetails.status === "success") {
        expect(taskDetails.data.task.status).toBe('in progress');
      }

      // Complete and approve the task with server1
      await server1.updateTask(project.projectId, project.tasks[0].id, {
        status: 'done',
        completedDetails: 'Task completed'
      });
      await server1.approveTaskCompletion(project.projectId, project.tasks[0].id);

      // Verify completion with server2 (it should automatically reload latest data)
      const completedTasks = await server2.listTasks(project.projectId, "completed");
      expect(completedTasks.status).toBe('success');
      if (completedTasks.status === "success") {
        expect(completedTasks.data.tasks!.length).toBe(1);
      }

      // Complete the project with server2
      const completionResult = await server2.approveProjectCompletion(project.projectId);
      expect(completionResult.status).toBe('success');

      // Verify with server1 (it should automatically reload latest data)
      const projectState = await server1.listProjects("completed");
      expect(projectState.status).toBe('success');
      if (projectState.status === "success") {
        expect(projectState.data.projects.find(p => p.projectId === project.projectId)).toBeDefined();
      }
    }
  });

  // --- NEW API TEST ---
  // Skip this test by default, as it requires live API keys and makes external calls.
  // Remove '.skip' and ensure OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, DEEPSEEK_API_KEY are in .env to run.
  it.skip("should generate a project plan using live APIs", async () => {
    const testPrompt = "Create a plan for a simple web server using Node.js and Express.";
    const attachments: string[] = []; // Add mock attachment content if needed

    // --- Test OpenAI ---
    if (process.env.OPENAI_API_KEY) {
      console.log("Testing OpenAI API...");
      try {
        const openaiResult = await server.generateProjectPlan({
          prompt: testPrompt,
          provider: "openai",
          model: "gpt-4o-mini",
          attachments,
        });
        expect(openaiResult.status).toBe("success");
        if (openaiResult.status === "success") {
          expect(openaiResult.data.projectId).toMatch(/^proj-\d+$/);
          expect(openaiResult.data.tasks.length).toBeGreaterThan(0);
          expect(openaiResult.data.tasks[0].title).toBeDefined();
          expect(typeof openaiResult.data.tasks[0].description).toBe('string');
          expect(openaiResult.data.tasks[0].description).not.toBe('');
          expect(openaiResult.data.message).toContain("Project proj-");
          console.log(`OpenAI generated project: ${openaiResult.data.projectId}`);

          // Fetch the project to verify the plan
          const projectData = await server.readProject(openaiResult.data.projectId);
          expect(projectData.status).toBe('success');
          if (projectData.status === 'success') {
            expect(typeof projectData.data.projectPlan).toBe('string');
            expect(projectData.data.projectPlan).not.toBe('');
          }
        }
      } catch (error: any) {
        console.error("OpenAI API test failed:", error.message);
        expect(error).toBeNull();
      }
    } else {
      console.warn("Skipping OpenAI test: OPENAI_API_KEY not found in environment.");
    }

    // --- Test Google ---
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.log("Testing Google Gemini API...");
       try {
        const googleResult = await server.generateProjectPlan({
          prompt: testPrompt,
          provider: "google",
          model: "gemini-2.0-flash-001",
          attachments,
        });
        expect(googleResult.status).toBe("success");
        if (googleResult.status === "success") {
          expect(googleResult.data.projectId).toMatch(/^proj-\d+$/);
          expect(googleResult.data.tasks.length).toBeGreaterThan(0);
          expect(googleResult.data.tasks[0].title).toBeDefined();
          expect(typeof googleResult.data.tasks[0].description).toBe('string');
          expect(googleResult.data.tasks[0].description).not.toBe('');
          expect(googleResult.data.message).toContain("Project proj-");
          console.log(`Google generated project: ${googleResult.data.projectId}`);

          // Fetch the project to verify the plan
          const projectData = await server.readProject(googleResult.data.projectId);
          expect(projectData.status).toBe('success');
          if (projectData.status === 'success') {
            expect(typeof projectData.data.projectPlan).toBe('string');
            expect(projectData.data.projectPlan).not.toBe('');
          }
        }
      } catch (error: any) {
        console.error("Google API test failed:", error.message);
         expect(error).toBeNull();
      }
    } else {
      console.warn("Skipping Google test: GOOGLE_GENERATIVE_AI_API_KEY not found in environment.");
    }
    
    // --- Test DeepSeek ---
    if (process.env.DEEPSEEK_API_KEY) {
       console.log("Testing DeepSeek API...");
       try {
        const deepseekResult = await server.generateProjectPlan({
          prompt: testPrompt,
          provider: "deepseek",
          model: "deepseek-chat",
          attachments,
        });
        expect(deepseekResult.status).toBe("success");
        if (deepseekResult.status === "success") {
          expect(deepseekResult.data.projectId).toMatch(/^proj-\d+$/);
          expect(deepseekResult.data.tasks.length).toBeGreaterThan(0);
          expect(deepseekResult.data.tasks[0].title).toBeDefined();
          expect(typeof deepseekResult.data.tasks[0].description).toBe('string');
          expect(deepseekResult.data.tasks[0].description).not.toBe('');
          expect(deepseekResult.data.message).toContain("Project proj-");
          console.log(`DeepSeek generated project: ${deepseekResult.data.projectId}`);

          // Fetch the project to verify the plan
          const projectData = await server.readProject(deepseekResult.data.projectId);
          expect(projectData.status).toBe('success');
          if (projectData.status === 'success') {
            expect(typeof projectData.data.projectPlan).toBe('string');
            expect(projectData.data.projectPlan).not.toBe('');
          }
        }
      } catch (error: any) {
        console.error("DeepSeek API test failed:", error.message);
        expect(error).toBeNull();
      }
    } else {
      console.warn("Skipping DeepSeek test: DEEPSEEK_API_KEY not found in environment.");
    }

    // Add a final assertion to ensure at least one API was tested if desired
    // expect(console.warn).not.toHaveBeenCalledTimes(3); // Example

  }, 50000); // Increase timeout for API calls if needed
  // --- END NEW API TEST ---
});
