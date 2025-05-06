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
import { formatStatusFileContent } from '../../../src/utils/statusFileFormatter.js';

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
        completed: false,
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
        completedDetails: taskDetails.completedDetails || '',
    };
    const createdTask = await createTestTaskInFile(activeContext.testFilePath, createdProject.projectId, taskInput);
    
    const fullProject = await activeContext.fileService.loadAndInitializeTasks().then(data => data.data.projects.find(p => p.projectId === createdProject.projectId)!);
    const fullTask = fullProject.tasks.find(t=>t.id === createdTask.id)!;

    return { project: fullProject, task: fullTask };
  };
  
  describe('Feature Inactive (CURRENT_PROJECT_PATH not set for server)', () => {
    it('should NOT create or modify current_status.mdc when a task is set to in progress', async () => {
      const { project, task } = await setupProjectAndTaskInFile(contextInactive);

      await contextInactive.client.callTool({
        name: "update_task",
        arguments: { projectId: project.projectId, taskId: task.id, status: 'in progress' }
      });
      await assertFileDoesNotExist(getStatusFilePath(currentProjectPath));
    });

    it('should NOT create or modify current_status.mdc when a project is finalized', async () => {
      const { project, task } = await setupProjectAndTaskInFile(contextInactive, {}, {status: 'in progress'});
      await contextInactive.client.callTool({
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: task.id, status: 'done', completedDetails: 'Done' }
      });
      await contextInactive.client.callTool({
          name: "approve_task",
          arguments: { projectId: project.projectId, taskId: task.id }
      });

      await contextInactive.client.callTool({
        name: "finalize_project",
        arguments: { projectId: project.projectId }
      });
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
        const { project, task } = await setupProjectAndTaskInFile(contextActive);
        await ensureDirExists(getRulesDir(currentProjectPath)); 

        await contextActive.client.callTool({
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: task.id, status: 'in progress' }
        });
        
        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        const taskResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: task.id }}) as CallToolResult;
        const updatedTask = (verifyToolSuccessResponse<any>(taskResult)).task;

        expect(content).toEqual(formatStatusFileContent(project, updatedTask));
      });

      it('should create .cursor/rules directory if it does not exist when creating current_status.mdc', async () => {
        const { project, task } = await setupProjectAndTaskInFile(contextActive);

        await contextActive.client.callTool({
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: task.id, status: 'in progress' }
        });

        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        const taskResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: task.id }}) as CallToolResult;
        const updatedTask = (verifyToolSuccessResponse<any>(taskResult)).task;
        expect(content).toEqual(formatStatusFileContent(project, updatedTask));
      });
    });

    describe('Task Status: "in progress"', () => {
      it('should update Project and Task sections when task becomes "in progress"', async () => {
        const { project, task } = await setupProjectAndTaskInFile(contextActive,
            { initialPrompt: "P1", projectPlan: "P1 Plan Details" },
            { title: "T1", description: "T1 Description Details" }
        );
        await ensureDirExists(getRulesDir(currentProjectPath));
        await fs.writeFile(getStatusFilePath(currentProjectPath), formatStatusFileContent(null,null));

        await contextActive.client.callTool({
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: task.id, status: 'in progress' }
        });

        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        const projResult = await contextActive.client.callTool({name: "read_project", arguments: { projectId: project.projectId }}) as CallToolResult;
        const updatedProj = verifyToolSuccessResponse<Project>(projResult);
        const taskResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: task.id }}) as CallToolResult;
        const updatedTask = (verifyToolSuccessResponse<any>(taskResult)).task;
        expect(content).toEqual(formatStatusFileContent(updatedProj, updatedTask));
      });

      it('should overwrite existing content when task becomes "in progress"', async () => {
        const { project, task } = await setupProjectAndTaskInFile(contextActive);
        await ensureDirExists(getRulesDir(currentProjectPath));
        await fs.writeFile(getStatusFilePath(currentProjectPath), "Some other pre-existing content");

        await contextActive.client.callTool({
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: task.id, status: 'in progress' }
        });

        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        const taskResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: task.id }}) as CallToolResult;
        const updatedTask = (verifyToolSuccessResponse<any>(taskResult)).task;
        expect(content).toEqual(formatStatusFileContent(project, updatedTask));
      });
    });

    describe('Task Status: "not started"', () => {
      it('should update Task section to "None" when task becomes "not started", leaving Project section intact', async () => {
        const { project, task: initialTask } = await setupProjectAndTaskInFile(contextActive, {}, {status: 'in progress'});
        
        await ensureDirExists(getRulesDir(currentProjectPath));
        const projResult = await contextActive.client.callTool({name: "read_project", arguments: { projectId: project.projectId }}) as CallToolResult;
        const projectForInitialWrite = verifyToolSuccessResponse<Project>(projResult);
        const taskResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: initialTask.id }}) as CallToolResult;
        const taskForInitialWrite = (verifyToolSuccessResponse<any>(taskResult)).task;
        await fs.writeFile(getStatusFilePath(currentProjectPath), formatStatusFileContent(projectForInitialWrite, taskForInitialWrite));

        await contextActive.client.callTool({
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: initialTask.id, status: 'not started' }
        });

        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        expect(content).toEqual(formatStatusFileContent(projectForInitialWrite, null));
      });
    });

    describe('Project Finalization', () => {
      it('should update Project section to "None" when project is finalized', async () => {
        const { project, task } = await setupProjectAndTaskInFile(contextActive, {}, {status: 'in progress'});
        
        await ensureDirExists(getRulesDir(currentProjectPath));
        const projResult = await contextActive.client.callTool({name: "read_project", arguments: { projectId: project.projectId }}) as CallToolResult;
        const projectForInitialWrite = verifyToolSuccessResponse<Project>(projResult);
        const taskResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: task.id }}) as CallToolResult;
        const taskForInitialWrite = (verifyToolSuccessResponse<any>(taskResult)).task;
        await fs.writeFile(getStatusFilePath(currentProjectPath), formatStatusFileContent(projectForInitialWrite, taskForInitialWrite));

        await contextActive.client.callTool({
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: task.id, status: 'done', completedDetails: 'Done for finalization' }
        });
        await contextActive.client.callTool({
          name: "approve_task",
          arguments: { projectId: project.projectId, taskId: task.id }
        });
        await contextActive.client.callTool({
          name: "finalize_project",
          arguments: { projectId: project.projectId }
        });

        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        expect(content).toEqual(formatStatusFileContent(null, null)); 
      });
    });

    describe('Switching Projects/Tasks', () => {
      it('should update Project and Task sections when a task in a *different* project becomes "in progress"', async () => {
        const { project: p1, task: t1 } = await setupProjectAndTaskInFile(contextActive, { initialPrompt: "Project One", projectPlan: "Plan One Details" }, { title: "Task One", description: "Desc One Details" });
        const { project: p2, task: t2 } = await setupProjectAndTaskInFile(contextActive, { initialPrompt: "Project Two", projectPlan: "Plan Two Details" }, { title: "Task Two", description: "Desc Two Details" });

        await ensureDirExists(getRulesDir(currentProjectPath));
        const proj1Result = await contextActive.client.callTool({name: "read_project", arguments: { projectId: p1.projectId }}) as CallToolResult;
        const p1Data = verifyToolSuccessResponse<Project>(proj1Result);
        const task1Result = await contextActive.client.callTool({name: "read_task", arguments: { projectId: p1.projectId, taskId: t1.id }}) as CallToolResult;
        const t1Data = (verifyToolSuccessResponse<any>(task1Result)).task;
        await fs.writeFile(getStatusFilePath(currentProjectPath), formatStatusFileContent(p1Data, t1Data));
        
        await contextActive.client.callTool({
          name: "update_task",
          arguments: { projectId: p2.projectId, taskId: t2.id, status: 'in progress' }
        });

        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        const proj2Result = await contextActive.client.callTool({name: "read_project", arguments: { projectId: p2.projectId }}) as CallToolResult;
        const p2Data = verifyToolSuccessResponse<Project>(proj2Result);
        const task2Result = await contextActive.client.callTool({name: "read_task", arguments: { projectId: p2.projectId, taskId: t2.id }}) as CallToolResult;
        const t2DataUpdated = (verifyToolSuccessResponse<any>(task2Result)).task;
        expect(content).toEqual(formatStatusFileContent(p2Data, t2DataUpdated));
      });
    });

    describe('Task details propagation (Title and Description)', () => {
      it('should correctly write Title and Description to current_status.mdc when task is set to in progress', async () => {
        const projectDetails = { initialPrompt: 'Project Alpha', projectPlan: 'Plan for Alpha with\nmultiple lines in plan.' };
        const taskDetails = { title: 'Task One Title', description: 'Task One Description with\\nmultiple lines.\\nAnd a third line.' };
        const { project, task } = await setupProjectAndTaskInFile(contextActive, projectDetails, taskDetails);
        await ensureDirExists(getRulesDir(currentProjectPath));

        await contextActive.client.callTool({
          name: "update_task",
          arguments: { projectId: project.projectId, taskId: task.id, status: 'in progress' }
        });

        const content = await readFileIfExists(getStatusFilePath(currentProjectPath));
        const projResult = await contextActive.client.callTool({name: "read_project", arguments: { projectId: project.projectId }}) as CallToolResult;
        const currentProject = verifyToolSuccessResponse<Project>(projResult);
        const taskResult = await contextActive.client.callTool({name: "read_task", arguments: { projectId: project.projectId, taskId: task.id }}) as CallToolResult;
        const currentTask = (verifyToolSuccessResponse<any>(taskResult)).task;

        expect(content).toEqual(formatStatusFileContent(currentProject, currentTask));
      });
    });
  });
}); 