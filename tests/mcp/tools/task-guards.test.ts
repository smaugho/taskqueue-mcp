import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  setupTestContext,
  teardownTestContext,
  TestContext,
  createTestProjectInFile,
  createTestTaskInFile,
  verifyTaskInFile,
  readFileIfExists,
  assertFileDoesNotExist,
  verifyToolExecutionError,
  createTempCurrentProjectPath,
  removeTempDir,
  verifyToolSuccessResponse,
} from '../test-helpers.js';
import { Task } from '../../../src/types/data.js';
import { AppErrorCode } from '../../../src/types/errors.js';

const REVIEW_FILE_NAME = '.taskqueue.review.md';
const APPROVAL_TEXT = 'YES';
const PROMPT_TEXT = 'Approval required (remove # and save file for approving)';

// Helper to write to the review file
async function writeReviewFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8');
}

// Helper to modify the approval line in the review file
async function approveInReviewFile(filePath: string): Promise<void> {
  const fileContent = await fs.readFile(filePath, 'utf-8');
  const lines = fileContent.split('\n');
  const promptLineIndex = lines.findIndex(line => line.includes(PROMPT_TEXT));

  if (promptLineIndex !== -1 && promptLineIndex + 1 < lines.length) {
    const lineToModify = lines[promptLineIndex + 1];
    // Check if the line to modify is indeed "# YES" (allowing for possible leading/trailing whitespace on the line)
    if (lineToModify.trim() === `# ${APPROVAL_TEXT}`) {
      // Replace the content of that specific line, preserving potential leading/trailing spaces around "# YES"
      lines[promptLineIndex + 1] = lineToModify.replace(`# ${APPROVAL_TEXT}`, APPROVAL_TEXT);
    }
  }
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
}

describe('Task Approval Guards E2E Tests', () => {
  // Variables will be scoped within each nested describe

  describe('Guards Inactive (DONE_TASKS_GUARD=\'false\', APPROVE_TASKS_GUARD=\'false\')', () => {
    let context: TestContext;
    let projectId: string;
    let taskId: string;
    let currentProjectPath: string;
    let reviewFilePath: string;

    beforeEach(async () => {
      currentProjectPath = await createTempCurrentProjectPath();
      reviewFilePath = path.join(currentProjectPath, REVIEW_FILE_NAME);
      context = await setupTestContext(undefined, false, { 
        DONE_TASKS_GUARD: 'false', 
        APPROVE_TASKS_GUARD: 'false',
        CURRENT_PROJECT_PATH: currentProjectPath 
      });
      const project = await createTestProjectInFile(context.testFilePath, { initialPrompt: 'Guards Off Project' });
      projectId = project.projectId;
      const task = await createTestTaskInFile(context.testFilePath, projectId, { title: 'Guards Off Task', status: 'in progress' });
      taskId = task.id;
    });

    afterEach(async () => {
      await teardownTestContext(context);
      await removeTempDir(currentProjectPath);
    });

    it('DONE_TASKS_GUARD: should proceed normally', async () => {
      // Arrange
      // Test context, projectId, taskId are set in beforeEach

      // Act
      const result = await context.client.callTool({
        name: 'update_task',
        arguments: { projectId, taskId, status: 'done', completedDetails: 'Done (guard explicitly false)' },
      }) as CallToolResult;
      
      // Assert
      const updatedTask = verifyToolSuccessResponse<Task>(result);
      expect(updatedTask.status).toBe('done');
      expect(updatedTask.id).toBe(taskId);
      await assertFileDoesNotExist(reviewFilePath);
    });

    it('APPROVE_TASKS_GUARD: should proceed normally', async () => {
      // Arrange
      await context.client.callTool({
        name: 'update_task',
        arguments: { projectId, taskId, status: 'done', completedDetails: 'Ready for approval (guards off)' },
      });
      await verifyTaskInFile(context.testFilePath, projectId, taskId, { status: 'done', approved: false });

      // Act
      const result = await context.client.callTool({
        name: 'approve_task',
        arguments: { projectId, taskId },
      }) as CallToolResult;
      
      // Assert
      const approvalData = verifyToolSuccessResponse<{ task: Partial<Task> }>(result);
      expect(approvalData.task.approved).toBe(true);
      await verifyTaskInFile(context.testFilePath, projectId, taskId, { approved: true });
      await assertFileDoesNotExist(reviewFilePath);
    });
  });

  describe('Guards Inactive (CURRENT_PROJECT_PATH not set)', () => {
    let context: TestContext;
    let projectId: string;
    let taskId: string;
    // No currentProjectPath or reviewFilePath needed here as they won't be used by TaskManager

    beforeEach(async () => {
      context = await setupTestContext(undefined, false, { 
        DONE_TASKS_GUARD: 'true',
        APPROVE_TASKS_GUARD: 'true'
        // CURRENT_PROJECT_PATH is NOT passed in customEnv
      });
      const project = await createTestProjectInFile(context.testFilePath, { initialPrompt: 'No CPP Project' });
      projectId = project.projectId;
      const task = await createTestTaskInFile(context.testFilePath, projectId, { title: 'No CPP Task', status: 'in progress' });
      taskId = task.id;
    });

    afterEach(async () => {
      await teardownTestContext(context);
    });

    it('DONE_TASKS_GUARD: should proceed normally', async () => {
      // Arrange
      // Test context, projectId, taskId are set in beforeEach

      // Act
      const result = await context.client.callTool({
        name: 'update_task',
        arguments: { projectId, taskId, status: 'done', completedDetails: 'Done (no CURR_PROJ_PATH)' },
      }) as CallToolResult;
      
      // Assert
      const updatedTask = verifyToolSuccessResponse<Task>(result);
      expect(updatedTask.status).toBe('done');
    });

    it('APPROVE_TASKS_GUARD: should proceed normally', async () => {
      // Arrange
      await context.client.callTool({
        name: 'update_task',
        arguments: { projectId, taskId, status: 'done', completedDetails: 'Ready for approval (no CURR_PROJ_PATH)' },
      });
      await verifyTaskInFile(context.testFilePath, projectId, taskId, { status: 'done', approved: false });

      // Act
      const result = await context.client.callTool({
        name: 'approve_task',
        arguments: { projectId, taskId },
      }) as CallToolResult;
      
      // Assert
      const approvalData = verifyToolSuccessResponse<{ task: Partial<Task> }>(result);
      expect(approvalData.task.approved).toBe(true);
      await verifyTaskInFile(context.testFilePath, projectId, taskId, { approved: true });
    });
  });

  describe('DONE_TASKS_GUARD Active (CURRENT_PROJECT_PATH set)', () => {
    let context: TestContext;
    let projectId: string;
    let taskId: string;
    let currentProjectPath: string;
    let reviewFilePath: string;
    let POLLING_TIMEOUT_MS_FROM_TASK_MANAGER = 5 * 60 * 1000; // Align with TaskManager.ts
    let POLLING_INTERVAL_MS_FROM_TASK_MANAGER = 1000; // Align with TaskManager.ts

    beforeEach(async () => {
      currentProjectPath = await createTempCurrentProjectPath();
      reviewFilePath = path.join(currentProjectPath, REVIEW_FILE_NAME);
      context = await setupTestContext(undefined, false, {
        DONE_TASKS_GUARD: 'true',
        APPROVE_TASKS_GUARD: 'false',
        CURRENT_PROJECT_PATH: currentProjectPath,
      });
      const project = await createTestProjectInFile(context.testFilePath, { initialPrompt: 'Done Guard Test Project' });
      projectId = project.projectId;
      const task = await createTestTaskInFile(context.testFilePath, projectId, { title: 'Done Guard Task', status: 'in progress' });
      taskId = task.id;
    });

    afterEach(async () => {
      await teardownTestContext(context);
      await removeTempDir(currentProjectPath);
    });

    it('should create review file, wait for approval, then complete task and delete file', async () => {
      // Arrange
      // Test context, projectId, taskId, reviewFilePath are set in beforeEach
      const updatePromise = context.client.callTool({
        name: 'update_task',
        arguments: { projectId, taskId, status: 'done', completedDetails: 'Done by test' },
      }) as Promise<CallToolResult>;
      
      // Act
      // Allow time for initial file creation attempt & task to pause (simulated)
      await new Promise(resolve => setTimeout(resolve, 500)); 
      const reviewFileContentBeforeApproval = await readFileIfExists(reviewFilePath);
      await approveInReviewFile(reviewFilePath); // Simulate manual approval
      const result = await updatePromise; // Now the original operation should complete
      
      // Assert
      expect(reviewFileContentBeforeApproval).not.toBeNull();
      expect(reviewFileContentBeforeApproval).toContain(`- **Project ID:** ${projectId}`);
      expect(reviewFileContentBeforeApproval).toContain(`- **Task ID:** ${taskId}`);
      expect(reviewFileContentBeforeApproval).toContain(PROMPT_TEXT);
      expect(reviewFileContentBeforeApproval).toContain(`# ${APPROVAL_TEXT}`);
      // Task status check before approval is tricky here due to async nature.
      // The main confirmation is that it proceeds to done only after file approval.

      const updatedTask = verifyToolSuccessResponse<Task>(result);
      expect(updatedTask.status).toBe('done');
      expect(updatedTask.completedDetails).toBe('Done by test');
      await assertFileDoesNotExist(reviewFilePath);
    }, 15000);

    it('should fail if review file is deleted externally', async () => {
      // Arrange
      const updatePromise = context.client.callTool({
        name: 'update_task',
        arguments: { projectId, taskId, status: 'done', completedDetails: 'Done by test' },
      }) as Promise<CallToolResult>;
      
      // Act
      await new Promise(resolve => setTimeout(resolve, 500)); // Allow file creation attempt
      const reviewFileExistsInitially = await readFileIfExists(reviewFilePath);
      await fs.rm(reviewFilePath, { force: true }); // Simulate external deletion
      const result = await updatePromise;
      
      // Assert
      expect(reviewFileExistsInitially).not.toBeNull(); // Check it was created
      verifyToolExecutionError(result, /Approval rejected by file deletion/);
      await verifyTaskInFile(context.testFilePath, projectId, taskId, { status: 'in progress' });
    }, 15000);
  });

  describe('APPROVE_TASKS_GUARD Active (CURRENT_PROJECT_PATH set)', () => {
    let context: TestContext;
    let projectId: string;
    let taskId: string;
    let currentProjectPath: string;
    let reviewFilePath: string;
    let POLLING_TIMEOUT_MS_FROM_TASK_MANAGER = 5 * 60 * 1000;
    let POLLING_INTERVAL_MS_FROM_TASK_MANAGER = 1000;

    beforeEach(async () => {
      currentProjectPath = await createTempCurrentProjectPath();
      reviewFilePath = path.join(currentProjectPath, REVIEW_FILE_NAME);
      context = await setupTestContext(undefined, false, {
        DONE_TASKS_GUARD: 'false',
        APPROVE_TASKS_GUARD: 'true',
        CURRENT_PROJECT_PATH: currentProjectPath,
      });
      const project = await createTestProjectInFile(context.testFilePath, { initialPrompt: 'Approve Guard Test Project' });
      projectId = project.projectId;
      // Task must be 'done' to be approved
      const task = await createTestTaskInFile(context.testFilePath, projectId, { title: 'Approve Guard Task', status: 'done', completedDetails: 'Ready for approval' });
      taskId = task.id;
    });

    afterEach(async () => {
      await teardownTestContext(context);
      await removeTempDir(currentProjectPath);
    });

    it('should create review file, wait for approval, then approve task and delete file', async () => {
      // Arrange
      const approvePromise = context.client.callTool({
        name: 'approve_task',
        arguments: { projectId, taskId },
      }) as Promise<CallToolResult>;

      // Act
      await new Promise(resolve => setTimeout(resolve, 500)); // Allow file creation attempt
      const reviewFileContentBeforeApproval = await readFileIfExists(reviewFilePath);
      await approveInReviewFile(reviewFilePath); // Simulate manual approval
      const result = await approvePromise;
      
      // Assert
      expect(reviewFileContentBeforeApproval).not.toBeNull();
      expect(reviewFileContentBeforeApproval).toContain(`- **Project ID:** ${projectId}`);
      expect(reviewFileContentBeforeApproval).toContain(`- **Task ID:** ${taskId}`);
      expect(reviewFileContentBeforeApproval).toContain(PROMPT_TEXT);
      expect(reviewFileContentBeforeApproval).toContain(`# ${APPROVAL_TEXT}`);
      // Task should not have been approved before file interaction
      // This is implicitly tested by the final verifyTaskInFile({ approved: true })
      
      const approvalData = verifyToolSuccessResponse<{ task: Partial<Task> }>(result);
      expect(approvalData.task.approved).toBe(true);
      await assertFileDoesNotExist(reviewFilePath);
    }, 15000);

    it('should fail if review file is deleted externally', async () => {
      // Arrange
      const approvePromise = context.client.callTool({
        name: 'approve_task',
        arguments: { projectId, taskId },
      }) as Promise<CallToolResult>;
      
      // Act
      await new Promise(resolve => setTimeout(resolve, 500)); // Allow file creation attempt
      const reviewFileExistsInitially = await readFileIfExists(reviewFilePath);
      await fs.rm(reviewFilePath, { force: true }); // Simulate external deletion
      const result = await approvePromise;
      
      // Assert
      expect(reviewFileExistsInitially).not.toBeNull();
      verifyToolExecutionError(result, /Approval rejected by file deletion/);
      await verifyTaskInFile(context.testFilePath, projectId, taskId, { approved: false });
    }, 15000);
  });
}); 