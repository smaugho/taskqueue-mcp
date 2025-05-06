import os from 'os';

// Interface for project data passed to the formatter
export interface StatusFileProjectData {
  initialPrompt: string;
  projectPlan: string;
  isFinalized?: boolean; 
  completedTasks?: number; 
  totalTasks?: number; 
}

// Interface for task data passed to the formatter
export interface StatusFileTaskData {
  title: string;
  description: string;
  status: "not started" | "in progress" | "done";
  approved?: boolean;
  completedDetails: string;
}

// Helper function for consistent multi-line indentation
function indentMultiLine(text: string | undefined | null, indentation = '   '): string {
  if (!text || text.trim() === '') return '';
  // Normalize line endings to \n for consistent splitting, then join with os.EOL for final output
  // Indent all lines
  return text.replace(/\r\n|\r|\n/g, '\n').split('\n').map(line => indentation + line).join(os.EOL);
}

export function formatStatusFileContent(
  project: StatusFileProjectData | null,
  task: StatusFileTaskData | null
): string {
  let projectSection = "None";
  if (project && typeof project.initialPrompt === 'string') {
    let projectDetails = `Project Name: ${project.initialPrompt}`;
    if (typeof project.projectPlan === 'string' && project.projectPlan.trim() !== '') {
      projectDetails += `${os.EOL}Project Detail:${os.EOL}${indentMultiLine(project.projectPlan)}`;
    }
    
    const completed = project.completedTasks ?? 0;
    const total = project.totalTasks ?? 0;
    const statusText = project.isFinalized ? `Finalized (${completed}/${total} tasks completed)` : `In Progress (${completed}/${total} tasks completed)`;
    projectDetails += `${os.EOL}Status: ${statusText}`;
    projectSection = projectDetails;
  }
  
  let taskSection = "None";
  if (task && typeof task.title === 'string') {
    let taskDetails = `Title: ${task.title}`;
    
    const displayStatus = task.approved ? 'approved' : task.status;
    taskDetails += `${os.EOL}Status: ${displayStatus}`;
    
    if (typeof task.description === 'string' && task.description.trim() !== '') {
      taskDetails += `${os.EOL}Description:${os.EOL}${indentMultiLine(task.description)}`;
    }
    
    if (typeof task.completedDetails === 'string' && task.completedDetails.trim() !== '') {
      taskDetails += `${os.EOL}Completed Details:${os.EOL}${indentMultiLine(task.completedDetails)}`;
    }
    taskSection = taskDetails;
  }
  
  const parts = [
    `---`,
    `description: Status of the current task`,
    `globs:`,
    `alwaysApply: true`,
    `---`,
    ``,
    `# Project`,
    ``,
    projectSection,
    ``,
    `# Task`,
    ``,
    taskSection
  ];
  return parts.join(os.EOL);
} 