import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import {
  setupTestContext,
  teardownTestContext,
  createTestProjectInFile,
  createTestTaskInFile,
  TestContext,
  verifyToolSuccessResponse,
  readFileIfExists,
  assertFileDoesNotExist,
  ensureDirExists,
} from '../test-helpers.js';
import { Project, Task } from '../../../src/types/data.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { formatStatusFileContent, StatusFileProjectData, StatusFileTaskData } from '../../../src/utils/statusFileFormatter.js';

const createTempCurrentProjectPath = async (): Promise<string> => {
  const tempDir = path.join(tmpdir(), 'current_status_tests', Date.now().toString() + Math.random().toString().substring(2));
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
};

const getRulesDir = (currentProjectPath: string): string => path.join(currentProjectPath, '.cursor', 'rules');
const getStatusFilePath = (currentProjectPath: string): string => path.join(getRulesDir(currentProjectPath), 'current_status.mdc');

describe('current_status.mdc Updates Feature (E2E Acceptance)', () => {
  let contextInactive: TestContext;
  let currentProjectPath: string;

  beforeEach(async () => {
    contextInactive = await setupTestContext(); 
    currentProjectPath = await createTempCurrentProjectPath();
  });

  afterEach(async () => {
    await teardownTestContext(contextInactive);
    if (currentProjectPath) {
      await fs.rm(currentProjectPath, { recursive: true, force: true });
    }
  });

  const setupProjectAndTaskInFile = async (
    activeContext: TestContext, 
    projectDetails: Partial<Project> = {},
    taskDetails: Partial<Task> = {}
  ) => {
    const projectInput: Partial<Project> = {
        projectId: projectDetails.projectId || `proj-${Date.now()}`,
        initialPrompt: projectDetails.initialPrompt || 'Test Project',
        projectPlan: projectDetails.projectPlan || projectDetails.initialPrompt || 'Test Project Plan',
        completed: projectDetails.completed === undefined ? false : projectDetails.completed,
        autoApprove: projectDetails.autoApprove === undefined ? false : projectDetails.autoApprove,
        tasks: [],
    };
    const createdProject = await createTestProjectInFile(activeContext.testFilePath, projectInput);

    const taskInput: Partial<Task> = {
        id: taskDetails.id || `task-${Date.now() + 1}`,
        title: taskDetails.title || 'Test Task',
        description: taskDetails.description || 'Test Description',
        status: taskDetails.status || 'not started',
        approved: taskDetails.approved === undefined ? false : taskDetails.approved,
        completedDetails: taskDetails.completedDetails || "",
    };
    const createdTask = await createTestTaskInFile(activeContext.testFilePath, createdProject.projectId, taskInput);
    
    const fullProject = await activeContext.fileService.loadAndInitializeTasks().then(data => data.data.projects.find(p => p.projectId === createdProject.projectId)!);
    const fullTask = fullProject.tasks.find(t=>t.id === createdTask.id)!;

    return { project: fullProject, task: fullTask };
  };
  
  describe('Feature Inactive (CURRENT_PROJECT_PATH not set for server)', () => {
    it('should NOT create or modify current_status.mdc when a task is set to in progress', async () => {
      // Arrange
      const { project, task } = await setupProjectAndTaskInFile(contextInactive);

      // Act
      await contextInactive.client.callTool({
        name: "update_task",
        arguments: { projectId: project.projectId, taskId: task.id, status: 'in progress' }
      });

      // Assert
      await assertFileDoesNotExist(getStatusFilePath(currentProjectPath));
    });

    it('should NOT create or modify current_status.mdc when a project is finalized', async () => {
      // Arrange
      const { project, task } = await setupProjectAndTaskInFile(contextInactive, {}, {status: 'in progress'});
      await contextInactive.client.callTool({
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: task.id, status: 'done', completedDetails: 'Done' }
      });
      await contextInactive.client.callTool({
          name: "approve_task",
          arguments: { projectId: project.projectId, taskId: task.id }
      });

      // Act
      await contextInactive.client.callTool({
        name: "finalize_project",
        arguments: { projectId: project.projectId }
      });

      // Assert
      await assertFileDoesNotExist(getStatusFilePath(currentProjectPath));
    });
  });

  describe('Feature Active (CURRENT_PROJECT_PATH is set for server)', () => {
    let contextActive: TestContext;

    beforeEach(async () => {
      contextActive = await setupTestContext(undefined, false, { CURRENT_PROJECT_PATH: currentProjectPath });
    });

    afterEach(async () => {
      await teardownTestContext(contextActive);
    });

    describe('File Creation', () => {
      it('should create current_status.mdc with correct content if it does not exist when task becomes in progress', async () => {
        // Arrange
        const { project, task } = await setupProjectAndTaskInFile(contextActive);
        await ensureDirExists(getRulesDir(currentProjectPath)); 

        // Act
        await contextActive.client.callTool({
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: task.id, status: 'in progress' }
        });
        
        // Assert
        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        const taskResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: task.id }}) as CallToolResult;
        const updatedTask = (verifyToolSuccessResponse<any>(taskResult)).task as Task;

        const projectForFormatter: StatusFileProjectData = {
          projectId: project.projectId,
          initialPrompt: project.initialPrompt,
          projectPlan: project.projectPlan,
        };
        const taskForFormatter: StatusFileTaskData = {
          ...updatedTask,
          taskId: updatedTask.id,
          status: updatedTask.status,
        };
        const expectedContent = formatStatusFileContent(
          { ...projectForFormatter, completedTasks: 0, totalTasks: 1 },
          taskForFormatter
        );
        expect(content).toEqual(expectedContent);
      });

      it('should create .cursor/rules directory if it does not exist when creating current_status.mdc', async () => {
        // Arrange
        const { project, task } = await setupProjectAndTaskInFile(contextActive);

        // Act
        await contextActive.client.callTool({
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: task.id, status: 'in progress' }
        });

        // Assert
        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        const taskResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: task.id }}) as CallToolResult;
        const updatedTask = (verifyToolSuccessResponse<any>(taskResult)).task as Task;
        
        const projectForFormatter: StatusFileProjectData = {
          projectId: project.projectId,
          initialPrompt: project.initialPrompt,
          projectPlan: project.projectPlan,
        };
        const taskForFormatter: StatusFileTaskData = {
          ...updatedTask,
          taskId: updatedTask.id,
          status: updatedTask.status,
        };
        const expectedContent = formatStatusFileContent(
          { ...projectForFormatter, completedTasks: 0, totalTasks: 1 },
          taskForFormatter
        );
        expect(content).toEqual(expectedContent);
      });
    });

    describe('Task Status: "in progress"', () => {
      it('should update Project and Task sections when task becomes "in progress"', async () => {
        // Arrange
        const { project, task } = await setupProjectAndTaskInFile(contextActive,
            { initialPrompt: "P1", projectPlan: "P1 Plan Details" },
            { title: "T1", description: "T1 Description Details" }
        );
        await ensureDirExists(getRulesDir(currentProjectPath));
        await fs.writeFile(getStatusFilePath(currentProjectPath), formatStatusFileContent(null,null));

        // Act
        await contextActive.client.callTool({
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: task.id, status: 'in progress' }
        });

        // Assert
        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        const projResult = await contextActive.client.callTool({name: "read_project", arguments: { projectId: project.projectId }}) as CallToolResult;
        const updatedProj = verifyToolSuccessResponse<Project>(projResult);
        const taskResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: task.id }}) as CallToolResult;
        const updatedTask = (verifyToolSuccessResponse<any>(taskResult)).task as Task;

        const projectForFormatter: StatusFileProjectData = {
          projectId: updatedProj.projectId,
          initialPrompt: updatedProj.initialPrompt,
          projectPlan: updatedProj.projectPlan,
        };
        const taskForFormatter: StatusFileTaskData = {
          ...updatedTask,
          taskId: updatedTask.id,
          status: updatedTask.status,
        };
        const expectedContent = formatStatusFileContent(
          { ...projectForFormatter, completedTasks: 0, totalTasks: 1 },
          taskForFormatter
        );
        expect(content).toEqual(expectedContent);
      });

      it('should overwrite existing content when task becomes "in progress"', async () => {
        // Arrange
        const { project, task } = await setupProjectAndTaskInFile(contextActive);
        await ensureDirExists(getRulesDir(currentProjectPath));
        await fs.writeFile(getStatusFilePath(currentProjectPath), "Some other pre-existing content");

        // Act
        await contextActive.client.callTool({
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: task.id, status: 'in progress' }
        });

        // Assert
        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        const taskResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: task.id }}) as CallToolResult;
        const updatedTask = (verifyToolSuccessResponse<any>(taskResult)).task as Task;

        const projectForFormatter: StatusFileProjectData = {
          projectId: project.projectId,
          initialPrompt: project.initialPrompt,
          projectPlan: project.projectPlan,
        };
        const taskForFormatter: StatusFileTaskData = {
          ...updatedTask,
          taskId: updatedTask.id,
          status: updatedTask.status,
        };
        const expectedContent = formatStatusFileContent(
          { ...projectForFormatter, completedTasks: 0, totalTasks: 1 },
          taskForFormatter
        );
        expect(content).toEqual(expectedContent);
      });
    });

    describe('Switching Projects/Tasks', () => {
      it('should update Project and Task sections when a task in a *different* project becomes "in progress"', async () => {
        // Arrange
        const { project: p1, task: t1_details } = await setupProjectAndTaskInFile(contextActive, { initialPrompt: "Project One", projectPlan: "Plan One Details" }, { title: "Task One", description: "Desc One Details", completedDetails: "" });
        const { project: p2, task: t2_details } = await setupProjectAndTaskInFile(contextActive, { initialPrompt: "Project Two", projectPlan: "Plan Two Details" }, { title: "Task Two", description: "Desc Two Details", completedDetails: "" });

        await ensureDirExists(getRulesDir(currentProjectPath));
        
        const p1DataForFormatter: StatusFileProjectData = { initialPrompt: p1.initialPrompt, projectPlan: p1.projectPlan };
        const t1_as_task = t1_details as Task; 
        const t1DataForFormatter: StatusFileTaskData = { 
            ...t1_as_task, 
            taskId: t1_as_task.id, 
            status: t1_as_task.status
        };     
        await fs.writeFile(getStatusFilePath(currentProjectPath), formatStatusFileContent(p1DataForFormatter, t1DataForFormatter));
        
        // Act
        await contextActive.client.callTool({
          name: "update_task",
          arguments: { projectId: p2.projectId, taskId: t2_details.id, status: 'in progress' }
        });

        // Assert
        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        const proj2Result = await contextActive.client.callTool({name: "read_project", arguments: { projectId: p2.projectId }}) as CallToolResult;
        const p2Data = verifyToolSuccessResponse<Project>(proj2Result);
        const task2Result = await contextActive.client.callTool({name: "read_task", arguments: { projectId: p2.projectId, taskId: t2_details.id }}) as CallToolResult;
        const t2DataUpdated = (verifyToolSuccessResponse<any>(task2Result)).task as Task;

        const p2DataForFormatter: StatusFileProjectData = {
          projectId: p2Data.projectId,
          initialPrompt: p2Data.initialPrompt,
          projectPlan: p2Data.projectPlan,
        };
        const t2DataUpdatedForFormatter: StatusFileTaskData = {
          ...t2DataUpdated,
          taskId: t2DataUpdated.id,
          status: t2DataUpdated.status,
        };
        const expectedContent = formatStatusFileContent(
          { ...p2DataForFormatter, completedTasks: 0, totalTasks: 1 },
          t2DataUpdatedForFormatter
        );
        expect(content).toEqual(expectedContent);
      });
    });

    describe('Rule Excerpt Expansion (E2E)', () => {
      it('should read a linked rule file and include its content in current_status.mdc', async () => {
        // Arrange
        const ruleFileName = 'test-rule.mdc';
        const ruleFileContent = 'This is the content of the test rule.';
        const taskDescriptionWithRuleLink = `Task description linking to [${ruleFileName}](mdc:.cursor/rules/${ruleFileName}).`;

        const rulesDirPath = getRulesDir(currentProjectPath);
        await ensureDirExists(rulesDirPath);
        const ruleFilePath = path.join(rulesDirPath, ruleFileName);
        await fs.writeFile(ruleFilePath, ruleFileContent);

        const { project, task } = await setupProjectAndTaskInFile(contextActive, 
          { initialPrompt: "Rule Test Proj", projectPlan: "Rule Test Plan" }, 
          { title: "Rule Test Task", description: taskDescriptionWithRuleLink }
        );

        // Act
        await contextActive.client.callTool({
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: task.id, status: 'in progress' }
        });

        // Assert
        const statusFileContent = await readFileIfExists(getStatusFilePath(currentProjectPath));
        
        const projResult = await contextActive.client.callTool({name: "read_project", arguments: { projectId: project.projectId }}) as CallToolResult;
        const updatedProj = verifyToolSuccessResponse<Project>(projResult);
        const taskResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: task.id }}) as CallToolResult;
        const updatedTask = (verifyToolSuccessResponse<any>(taskResult)).task as Task;

        const projectForFormatter: StatusFileProjectData = {
          projectId: updatedProj.projectId,
          initialPrompt: updatedProj.initialPrompt,
          projectPlan: updatedProj.projectPlan,
          completedTasks: 0,
          totalTasks: 1,
        };
        const taskForFormatter: StatusFileTaskData = {
          ...updatedTask,
          taskId: updatedTask.id,
          status: updatedTask.status,
          relevantRuleFilename: ruleFileName,
          relevantRuleExcerpt: ruleFileContent,
        };
        
        const expectedContent = formatStatusFileContent(
          projectForFormatter,
          taskForFormatter
        );
        expect(statusFileContent).toEqual(expectedContent);
      });
    });

    describe('Refined current_status.mdc Trigger Logic', () => {
      it('should NOT update current_status.mdc if a task description is updated but status remains "not started" (file initially present with other content)', async () => {
        // Arrange
        const { project, task } = await setupProjectAndTaskInFile(contextActive, {}, { status: 'not started' });
        const initialContent = "# Current Status\nProject: Other Project\nTask: Other Task";
        await ensureDirExists(getRulesDir(currentProjectPath));
        await fs.writeFile(getStatusFilePath(currentProjectPath), initialContent);

        // Act
        await contextActive.client.callTool({
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: task.id, description: 'New Description' }
        });

        // Assert
        const finalContent = await readFileIfExists(getStatusFilePath(currentProjectPath));
        expect(finalContent).toEqual(initialContent);
      });
      
      it('should update current_status.mdc when an "in progress" task description is modified', async () => {
        // Arrange
        const { project, task: taskInProgress_details } = await setupProjectAndTaskInFile(contextActive, 
          { initialPrompt: "UpdateTestProject", projectPlan: "Plan for update test" }, 
          { title: "InProgressTask", description: "Initial Desc", status: 'not started' }
        );
        
        await contextActive.client.callTool({ // Initial status update to 'in progress'
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: taskInProgress_details.id, status: 'in progress' } 
        });
        const newDescription = "Updated Description";

        // Act
        await contextActive.client.callTool({
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: taskInProgress_details.id, description: newDescription }
        });

        // Assert
        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        const taskResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: taskInProgress_details.id }}) as CallToolResult;
        const updatedTaskData = (verifyToolSuccessResponse<any>(taskResult)).task as Task; 

        const projectForFormatter: StatusFileProjectData = { 
            projectId: project.projectId, 
            initialPrompt: project.initialPrompt, 
            projectPlan: project.projectPlan 
        };
        const taskForFormatter: StatusFileTaskData = {
          taskId: updatedTaskData.id,
          title: updatedTaskData.title,
          description: newDescription,
          status: updatedTaskData.status,
          completedDetails: updatedTaskData.completedDetails
        };
        
        const projRead = await contextActive.client.callTool({name: "read_project", arguments: {projectId: project.projectId}}) as CallToolResult;
        const projDetails = verifyToolSuccessResponse<Project>(projRead);

        const expectedContent = formatStatusFileContent(
          { ...projectForFormatter, completedTasks: projDetails.tasks.filter(t=>t.status === 'done').length, totalTasks: projDetails.tasks.length }, 
          taskForFormatter
        );
        expect(content).toEqual(expectedContent);
      });

      it('should show the "in progress" task in current_status.mdc if a task becomes "done" while another is "in progress"', async () => {
        // Arrange
        const { project, task: taskA_setup_details } = await setupProjectAndTaskInFile(contextActive, 
            { initialPrompt: "MultiTaskProject" }, 
            { id: 'task-A', title: "Task A", status: 'not started' }
        );
        // Start Task B as 'in progress' directly
        const taskB_setup_details = await createTestTaskInFile(contextActive.testFilePath, project.projectId,
            { id: 'task-B', title: "Task B", status: 'in progress', completedDetails: '' } 
        );

        await contextActive.client.callTool({ // Task A to 'in progress'
            name: "update_task", 
            arguments: { projectId: project.projectId, taskId: taskA_setup_details.id, status: 'in progress' } 
        });
        
        // Act
        await contextActive.client.callTool({ // Task B becomes done: in progress -> done
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: taskB_setup_details.id, status: 'done', completedDetails: 'Task B finished' }
        });

        // Assert
        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        const taskAResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: taskA_setup_details.id }}) as CallToolResult;
        const taskAData = (verifyToolSuccessResponse<any>(taskAResult)).task as Task;

        const projectForFormatter: StatusFileProjectData = { 
            projectId: project.projectId, 
            initialPrompt: project.initialPrompt, 
            projectPlan: project.projectPlan 
        };
        const taskAForFormatter: StatusFileTaskData = {
          taskId: taskAData.id,
          title: taskAData.title,
          description: taskAData.description,
          status: taskAData.status,
          completedDetails: taskAData.completedDetails
        };
        
        const projRead = await contextActive.client.callTool({name: "read_project", arguments: {projectId: project.projectId}}) as CallToolResult;
        const projDetails = verifyToolSuccessResponse<Project>(projRead);

        const expectedContent = formatStatusFileContent(
          { ...projectForFormatter, completedTasks: projDetails.tasks.filter(t=>t.status === 'done').length, totalTasks: projDetails.tasks.length }, 
          taskAForFormatter 
        );
        expect(content).toEqual(expectedContent);
      });

      it('should show the "in progress" task in current_status.mdc if a "done" task is updated while another is "in progress"', async () => {
        // Arrange
        const { project, task: taskA_setup_details } = await setupProjectAndTaskInFile(contextActive, 
            { initialPrompt: "MultiTaskProjectDoneUpdate" }, 
            { id: 'task-A', title: "Task A", status: 'not started' }
        );
        const taskB_setup_details = await createTestTaskInFile(contextActive.testFilePath, project.projectId,
            { id: 'task-B', title: "Task B", status: 'done', completedDetails: 'Done initially' }
        );
        
        await contextActive.client.callTool({ // Initial status update for Task A
            name: "update_task", 
            arguments: { projectId: project.projectId, taskId: taskA_setup_details.id, status: 'in progress' } 
        });

        // Act
        await contextActive.client.callTool({ // Update already done Task B
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: taskB_setup_details.id, description: 'Updated description for done task' }
        });

        // Assert
        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        const taskAResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: taskA_setup_details.id }}) as CallToolResult;
        const taskAData = (verifyToolSuccessResponse<any>(taskAResult)).task as Task;

        const projectForFormatter: StatusFileProjectData = { 
            projectId: project.projectId, 
            initialPrompt: project.initialPrompt, 
            projectPlan: project.projectPlan
        };
        const taskAForFormatter: StatusFileTaskData = {
          taskId: taskAData.id,
          title: taskAData.title,
          description: taskAData.description,
          status: taskAData.status,
          completedDetails: taskAData.completedDetails
        };
        
        const projRead = await contextActive.client.callTool({name: "read_project", arguments: {projectId: project.projectId}}) as CallToolResult;
        const projDetails = verifyToolSuccessResponse<Project>(projRead);
        
        const expectedContent = formatStatusFileContent(
          { ...projectForFormatter, completedTasks: projDetails.tasks.filter(t=>t.status === 'done').length, totalTasks: projDetails.tasks.length }, 
          taskAForFormatter
        );
        expect(content).toEqual(expectedContent);
      });

      it('should update current_status.mdc to the "done" task if it becomes "done" and no other task is "in progress"', async () => {
        // Arrange
        const { project, task: task_setup_details } = await setupProjectAndTaskInFile(contextActive,
            { initialPrompt: "SingleDoneTaskProject"}, 
            { title: "My Only Task", status: 'not started'}
        );

        await contextActive.client.callTool({ // Initial status update to 'in progress'
            name: "update_task", 
            arguments: { projectId: project.projectId, taskId: task_setup_details.id, status: 'in progress' } 
        });

        // Act
        await contextActive.client.callTool({ // Task becomes 'done'
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: task_setup_details.id, status: 'done', completedDetails: 'All finished' }
        });

        // Assert
        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        const taskResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: task_setup_details.id }}) as CallToolResult;
        const updatedTaskData = (verifyToolSuccessResponse<any>(taskResult)).task as Task;

        const projectForFormatter: StatusFileProjectData = { 
            projectId: project.projectId, 
            initialPrompt: project.initialPrompt, 
            projectPlan: project.projectPlan 
        };
        const taskForFormatter: StatusFileTaskData = {
          taskId: updatedTaskData.id,
          title: updatedTaskData.title,
          description: updatedTaskData.description,
          status: updatedTaskData.status,
          completedDetails: updatedTaskData.completedDetails
        };
        
        const projRead = await contextActive.client.callTool({name: "read_project", arguments: {projectId: project.projectId}}) as CallToolResult;
        const projDetails = verifyToolSuccessResponse<Project>(projRead);

        const expectedContent = formatStatusFileContent(
          { ...projectForFormatter, completedTasks: projDetails.tasks.filter(t=>t.status === 'done').length, totalTasks: projDetails.tasks.length },
          taskForFormatter
        );
        expect(content).toEqual(expectedContent);
      });

      it('should update current_status.mdc to the "done" task if a "done" task is updated and no other task is "in progress"', async () => {
        // Arrange
        // Start the task as 'in progress' directly
        const { project, task: task_setup_details } = await setupProjectAndTaskInFile(contextActive,
            { initialPrompt: "UpdateSingleDoneTaskProject"}, 
            { title: "My Updated Done Task", status: 'in progress', completedDetails: '' } 
        );
        
        await contextActive.client.callTool({ // Initial status update to 'done': in progress -> done
            name: "update_task", 
            arguments: { projectId: project.projectId, taskId: task_setup_details.id, status: 'done', completedDetails: 'Initially done' } 
        });

        // Act
        await contextActive.client.callTool({ // Update the 'done' task's description
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: task_setup_details.id, description: 'New description for done task' }
        });

        // Assert
        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        const taskResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: task_setup_details.id }}) as CallToolResult;
        const updatedTaskData = (verifyToolSuccessResponse<any>(taskResult)).task as Task;

        const projectForFormatter: StatusFileProjectData = { 
            projectId: project.projectId, 
            initialPrompt: project.initialPrompt, 
            projectPlan: project.projectPlan
        };
        const taskForFormatter: StatusFileTaskData = {
          taskId: updatedTaskData.id,
          title: updatedTaskData.title,
          description: updatedTaskData.description, 
          status: updatedTaskData.status,
          completedDetails: updatedTaskData.completedDetails
        };
        
        const projRead = await contextActive.client.callTool({name: "read_project", arguments: {projectId: project.projectId}}) as CallToolResult;
        const projDetails = verifyToolSuccessResponse<Project>(projRead);

        const expectedContent = formatStatusFileContent(
          { ...projectForFormatter, completedTasks: projDetails.tasks.filter(t=>t.status === 'done').length, totalTasks: projDetails.tasks.length }, 
          taskForFormatter
        );
        expect(content).toEqual(expectedContent);
      });
    });

    it('should create/update current_status.mdc when get_next_task returns a pre-existing \'in progress\' task', async () => {
      // Arrange
      const projectDetails = { initialPrompt: "ProjectWithInProgressTask", projectPlan: "Plan for in-progress" };
      const taskDetails = { title: "AlreadyInProgressTask", description: "This task starts in progress", status: 'in progress' as const };
      
      // Directly create project and task with status 'in progress' in the test file
      const { project, task } = await setupProjectAndTaskInFile(contextActive, projectDetails, taskDetails);

      // Act: Call get_next_task
      const getNextTaskResult = await contextActive.client.callTool({
        name: "get_next_task",
        arguments: { projectId: project.projectId }
      }) as CallToolResult;
      const nextTaskData = verifyToolSuccessResponse<{task: Task}>(getNextTaskResult);

      // Assert: current_status.mdc should now reflect the in-progress task
      const statusFileContent = await readFileIfExists(getStatusFilePath(currentProjectPath));
      
      const projectForFormatter: StatusFileProjectData = {
        projectId: project.projectId,
        initialPrompt: project.initialPrompt,
        projectPlan: project.projectPlan,
      };
      // Use the task details as fetched by get_next_task
      const taskForFormatter: StatusFileTaskData = {
        ...nextTaskData.task, // task object from get_next_task response
        taskId: nextTaskData.task.id,
      };

      const projRead = await contextActive.client.callTool({name: "read_project", arguments: {projectId: project.projectId}}) as CallToolResult;
      const projDetails = verifyToolSuccessResponse<Project>(projRead);

      const expectedContent = formatStatusFileContent(
        { ...projectForFormatter, completedTasks: projDetails.tasks.filter(t => t.status === 'done').length, totalTasks: projDetails.tasks.length },
        taskForFormatter
      );
      expect(statusFileContent).toEqual(expectedContent);
    });
  });
}); 