import { Project } from "../types/index.js";

/**
 * Formats a progress table for the tasks within a given project.
 * @param project - The project object containing the tasks.
 * @returns A markdown string representing the task progress table.
 */
export function formatTaskProgressTable(project: Project | undefined): string {
  if (!project) return "Project not found";

  let table = "\nProgress Status:\n";
  table += "| Task ID | Title | Description | Status | Approval | Tools | Rules |\n";
  table += "|----------|----------|-------------|--------|----------|-------|-------|\n"; // Adjusted description column width

  for (const task of project.tasks) {
    const status = task.status === "done" ? "✅ Done" : (task.status === "in progress" ? "🔄 In Progress" : "⏳ Not Started");
    const approved = task.approved ? "✅ Approved" : "⏳ Pending";
    const tools = task.toolRecommendations ? "✓" : "-";
    const rules = task.ruleRecommendations ? "✓" : "-";
    // Truncate long descriptions for table view
    const shortDesc = task.description.length > 50 ? task.description.substring(0, 47) + " ..." : task.description;
    table += `| ${task.id} | ${task.title} | ${shortDesc} | ${status} | ${approved} | ${tools} | ${rules} |\n`;
  }

  return table;
}

/**
 * Formats a list of projects into a markdown table.
 * @param projects - An array of project objects.
 * @returns A markdown string representing the projects list table.
 */
export function formatProjectsList(projects: Project[]): string {
  let output = "\nProjects List:\n";
  output +=
    "| Project ID | Initial Prompt | Total Tasks | Completed | Approved |\n";
  output +=
    "|------------|------------------|-------------|-----------|----------|\n";

  for (const proj of projects) {
    const totalTasks = proj.tasks.length;
    const completedTasks = proj.tasks.filter((t) => t.status === "done").length;
    const approvedTasks = proj.tasks.filter((t) => t.approved).length;
    // Truncate long initial prompts
    const shortPrompt = proj.initialPrompt.length > 30 ? proj.initialPrompt.substring(0, 27) + "..." : proj.initialPrompt;
    output += `| ${proj.projectId} | ${shortPrompt} | ${totalTasks} | ${completedTasks} | ${approvedTasks} |\n`;
  }

  return output;
}
