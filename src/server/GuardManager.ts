import * as path from 'node:path';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { Project, Task } from '../types/data.js';
import { AppError, AppErrorCode } from '../types/errors.js';

const REVIEW_FILE_NAME = '.taskqueue.review.md';
const POLLING_INTERVAL_MS = 1000;

export class GuardManager {

  constructor() {
    // Constructor might be empty if stateless or can take dependencies if needed later
  }

  /**
   * Checks if a specific task approval guard is active based on environment variables.
   * @param guardName The name of the guard to check ('DONE' or 'APPROVE').
   * @param currentEnv The environment variables to check (defaults to process.env).
   * @returns True if the guard is active, false otherwise.
   */
  public isGuardActive(guardName: 'DONE' | 'APPROVE', currentEnv: NodeJS.ProcessEnv = process.env): boolean {
    const guardEnvVar =
      guardName === 'DONE'
        ? currentEnv.DONE_TASKS_GUARD
        : currentEnv.APPROVE_TASKS_GUARD;
    const currentProjectPath = currentEnv.CURRENT_PROJECT_PATH;
    return !!currentProjectPath && guardEnvVar?.toLowerCase() === 'true';
  }

  /**
   * Formats the content for the .taskqueue.review.md file.
   * @param project The project context for the review.
   * @param task The task context for the review.
   * @param operationType The type of operation being guarded ('Mark Task as Done' or 'Approve Task').
   * @param updates Optional updates, currently used for 'completedDetails' for 'Mark Task as Done'.
   * @returns A string formatted for the review file.
   */
  private formatReviewFileContent(
    project: Project,
    task: Task,
    operationType: "Mark Task as Done" | "Approve Task",
    updates?: { completedDetails?: string } 
  ): string {
    const formatMultiLine = (text: string | undefined | null, indent = '  ') => {
      if (!text || text.trim() === '') return `${indent}(empty)`;
      return text.replace(/\r\n|\r|\n/g, '\n').split('\n').map(line => `${indent}${line}`).join('\n');
    };
    let taskDetailsContent = `## Task Details for '${operationType}'
- **Task ID:** ${task.id}
- **Title:** ${task.title}
- **Description:**
${formatMultiLine(task.description)}
`;
    if (operationType === "Mark Task as Done") {
      taskDetailsContent += `- **Proposed Completed Details:**\n${formatMultiLine(updates?.completedDetails || task.completedDetails || "")}\n`;
    } else { 
      taskDetailsContent += `- **Current Status:** ${task.status}\n`;
      taskDetailsContent += `- **Completed Details:**\n${formatMultiLine(task.completedDetails || "")}\n`;
    }
    let projectPlanSummary = '';
    if (project.projectPlan && project.projectPlan.trim() !== '') {
      const planExcerpt = project.projectPlan.length > 300 
        ? project.projectPlan.substring(0, 297) + "..." 
        : project.projectPlan;
      projectPlanSummary = `\n## Project Plan Summary:\n${formatMultiLine(planExcerpt)}\n`;
    }
    return `# Task Approval Guard: ${operationType}
## Project Details
- **Project ID:** ${project.projectId}
- **Initial Prompt (Project Name):** ${project.initialPrompt}
${projectPlanSummary}
${taskDetailsContent}
---
Approval required (remove # and save file for approving)
# YES
`;
  }
  
  /**
   * Handles the file-based approval process for a guarded operation.
   * @param reviewFilePath Full path to the .taskqueue.review.md file.
   * @throws {AppError} If approval is rejected, times out, or a file read error occurs.
   */
  private async handleApprovalPolling(reviewFilePath: string): Promise<void> {
    while (true) {
      try {
        const content = await readFile(reviewFilePath, 'utf-8');
        const lines = content.split('\n').map(line => line.trim());
        const approvalPromptIndex = lines.findIndex(line => 
          line.startsWith('Approval required (remove # and save file for approving)')
        );
        if (approvalPromptIndex !== -1 && approvalPromptIndex + 1 < lines.length) {
          if (lines[approvalPromptIndex + 1].toLowerCase() === 'yes') {
            await unlink(reviewFilePath); 
            return; 
          }
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          throw new AppError('Approval rejected by file deletion.', AppErrorCode.ApprovalRejected, error);
        }
        console.error(`Error reading review file ${reviewFilePath} during polling:`, error); 
        throw new AppError(`Error reading review file: ${error.message}`, AppErrorCode.FileReadError, error);
      }
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
    }
  }

  /**
   * Main public method to process an approval request if a guard is active.
   * Creates the review file and then handles the polling for approval.
   * @param project The project context.
   * @param task The task context.
   * @param operationType The type of operation being guarded.
   * @param updates Optional task updates (e.g., completedDetails for 'done' operation).
   * @param currentEnv The environment variables to check (defaults to process.env).
   * @throws {AppError} Propagates errors from file operations or polling.
   */
  public async processApprovalRequest(
    project: Project,
    task: Task,
    operationType: 'DONE' | 'APPROVE',
    updates?: { completedDetails?: string },
    currentEnv: NodeJS.ProcessEnv = process.env
  ): Promise<void> {
    const opTypeString = operationType === 'DONE' ? "Mark Task as Done" : "Approve Task";
    if (this.isGuardActive(operationType, currentEnv)) {
      const currentProjectPath = currentEnv.CURRENT_PROJECT_PATH!;
      const reviewFilePath = path.join(currentProjectPath, REVIEW_FILE_NAME);
      const taskForReview = operationType === 'DONE' ? { ...task, completedDetails: updates?.completedDetails ?? task.completedDetails } : task;
      const reviewFileContent = this.formatReviewFileContent(project, taskForReview, opTypeString, updates); 
      
      try {
        await writeFile(reviewFilePath, reviewFileContent, 'utf-8');
        await this.handleApprovalPolling(reviewFilePath);
      } catch (e) {
        throw e;
      }
    }
  }
} 