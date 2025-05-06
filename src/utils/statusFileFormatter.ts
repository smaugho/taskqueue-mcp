import os from 'os';

interface StatusFileProjectData {
  initialPrompt: string;
  projectPlan: string;
}

interface StatusFileTaskData {
  title: string;
  description: string;
  status: "not started" | "in progress" | "done";
}

export function formatStatusFileContent(
  project: StatusFileProjectData | null,
  task: StatusFileTaskData | null
): string {
  let projectSection = "None";
  if (project && typeof project.initialPrompt === 'string' && typeof project.projectPlan === 'string') {
    projectSection = `Project Name: ${project.initialPrompt}\nProject Detail:\n   ${project.projectPlan.replace(/\\n/g, '\n   ')}`;
  }
  
  let taskSection = "None";
  if (task && typeof task.title === 'string' && typeof task.description === 'string' && typeof task.status === 'string') {
    const titleStr = task.title;
    const descStr = task.description;
    const statusStr = task.status;
    const indentedDesc = descStr.replace(/\\n/g, '\n   '); 
    taskSection = `Title: ${titleStr}\nStatus: ${statusStr}\nDescription:\n   ${indentedDesc}`;
  }
  
  return (`---\ndescription: Status of the current task\nglobs:\nalwaysApply: true\n---` +
         `\n\n# Project\n\n${projectSection}` +
         `\n\n# Task\n\n${taskSection}`.replace(/\\n/g, '\n')
  ).replace(/\n/g, os.EOL);
} 