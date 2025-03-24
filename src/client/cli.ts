#!/usr/bin/env node

import { Command } from "commander";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import chalk from "chalk";
import { TaskManagerFile, ErrorCode } from "../types/index.js";
import { createError, normalizeError } from "../utils/errors.js";
import { formatCliError } from "./errors.js";

const program = new Command();
const DEFAULT_PATH = path.join(os.homedir(), "Documents", "tasks.json");
const TASK_FILE_PATH = process.env.TASK_MANAGER_FILE_PATH || DEFAULT_PATH;

/**
 * Reads task data from the JSON file
 * @returns {Promise<TaskManagerFile>} The task manager data
 */
async function readData(): Promise<TaskManagerFile> {
  try {
    console.log(chalk.blue(`Reading task data from: ${TASK_FILE_PATH}`));
    
    try {
      await fs.access(TASK_FILE_PATH);
    } catch (error) {
      console.warn(chalk.yellow(`Task file does not exist yet. Will create a new one.`));
      return { projects: [] };
    }
    
    const data = await fs.readFile(TASK_FILE_PATH, "utf-8");
    try {
      return JSON.parse(data);
    } catch (error) {
      throw createError(
        ErrorCode.FileParseError,
        "Failed to parse task file",
        { originalError: error }
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      return { projects: [] };
    }
    throw createError(
      ErrorCode.FileReadError,
      "Failed to read task file",
      { originalError: error }
    );
  }
}

/**
 * Writes task data to the JSON file
 * @param {TaskManagerFile} data The task manager data to write
 * @returns {Promise<void>}
 */
async function writeData(data: TaskManagerFile): Promise<void> {
  try {
    console.log(chalk.blue(`Writing task data to: ${TASK_FILE_PATH}`));
    
    // Ensure the directory exists
    const directory = path.dirname(TASK_FILE_PATH);
    await fs.mkdir(directory, { recursive: true });
    
    await fs.writeFile(TASK_FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
    console.log(chalk.green('Data saved successfully'));
  } catch (error) {
    throw createError(
      ErrorCode.FileWriteError,
      "Failed to write task file",
      { originalError: error }
    );
  }
}

program
  .name("task-manager-cli")
  .description("CLI for the Task Manager MCP Server")
  .version("1.0.0");

program
  .command("approve")
  .description("Approve a completed task")
  .argument("<projectId>", "Project ID")
  .argument("<taskId>", "Task ID")
  .option('-f, --force', 'Force approval even if task is not marked as done')
  .action(async (projectId, taskId, options) => {
    try {
      console.log(chalk.blue(`Approving task ${chalk.bold(taskId)} in project ${chalk.bold(projectId)}...`));
      
      const data = await readData();
      
      // Check if we have any projects
      if (data.projects.length === 0) {
        console.error(chalk.red(`No projects found. The task file is empty or just initialized.`));
        process.exit(1);
      }
      
      const project = data.projects.find(p => p.projectId === projectId);
      
      if (!project) {
        console.error(chalk.red(`Project ${chalk.bold(projectId)} not found.`));
        console.log(chalk.yellow('Available projects:'));
        data.projects.forEach(p => {
          console.log(`  - ${p.projectId}: ${p.initialPrompt.substring(0, 50)}${p.initialPrompt.length > 50 ? '...' : ''}`);
        });
        process.exit(1);
      }

      const task = project.tasks.find(t => t.id === taskId);
      if (!task) {
        console.error(chalk.red(`Task ${chalk.bold(taskId)} not found in project ${chalk.bold(projectId)}.`));
        console.log(chalk.yellow('Available tasks in this project:'));
        project.tasks.forEach(t => {
          console.log(`  - ${t.id}: ${t.title} (Status: ${t.status}, Approved: ${t.approved ? 'Yes' : 'No'})`);
        });
        process.exit(1);
      }

      if (task.status !== "done" && !options.force) {
        console.error(chalk.red(`Task ${chalk.bold(taskId)} is not marked as done yet. Current status: ${chalk.bold(task.status)}`));
        console.log(chalk.yellow(`Use the --force flag to approve anyway, or wait for the task to be marked as done.`));
        process.exit(1);
      }
      
      if (task.approved) {
        console.log(chalk.yellow(`Task ${chalk.bold(taskId)} is already approved.`));
        process.exit(0);
      }

      task.approved = true;
      await writeData(data);
      console.log(chalk.green(`✅ Task ${chalk.bold(taskId)} in project ${chalk.bold(projectId)} has been approved.`));
      
      // Show task info
      console.log(chalk.cyan('\n📋 Task details:'));
      console.log(`  - ${chalk.bold('Title:')} ${task.title}`);
      console.log(`  - ${chalk.bold('Description:')} ${task.description}`);
      console.log(`  - ${chalk.bold('Status:')} ${task.status === 'done' ? chalk.green('Done ✓') : task.status === 'in progress' ? chalk.yellow('In Progress ⟳') : chalk.blue('Not Started ○')}`);
      console.log(`  - ${chalk.bold('Completed details:')} ${task.completedDetails || chalk.gray("None")}`);
      console.log(`  - ${chalk.bold('Approved:')} ${task.approved ? chalk.green('Yes ✓') : chalk.red('No ✗')}`);

      // Show progress info
      const totalTasks = project.tasks.length;
      const completedTasks = project.tasks.filter(t => t.status === "done").length;
      const approvedTasks = project.tasks.filter(t => t.approved).length;
      
      console.log(chalk.cyan(`\n📊 Progress: ${chalk.bold(`${approvedTasks}/${completedTasks}/${totalTasks}`)} (approved/completed/total)`));
      
      // Create a progress bar
      const bar = '▓'.repeat(approvedTasks) + '▒'.repeat(completedTasks - approvedTasks) + '░'.repeat(totalTasks - completedTasks);
      console.log(`  ${bar}`);
      
      if (completedTasks === totalTasks && approvedTasks === totalTasks) {
        console.log(chalk.green('\n🎉 All tasks are completed and approved!'));
        console.log(chalk.blue('The project can now be finalized.'));
      } else {
        console.log(chalk.yellow(`\n${totalTasks - completedTasks} tasks remaining to be completed.`));
        console.log(chalk.yellow(`${completedTasks - approvedTasks} tasks remaining to be approved.`));
      }
    } catch (error) {
      console.error(chalk.red(formatCliError(normalizeError(error))));
      process.exit(1);
    }
  });

program
  .command("finalize")
  .description("Mark a project as complete")
  .argument("<projectId>", "Project ID")
  .action(async (projectId) => {
    try {
      console.log(chalk.blue(`Approving project ${chalk.bold(projectId)}...`));

      const data = await readData();

      // Check if we have any projects
      if (data.projects.length === 0) {
        console.error(chalk.red(`No projects found. The task file is empty or just initialized.`));
        process.exit(1);
      }

      const project = data.projects.find(p => p.projectId === projectId);

      if (!project) {
        console.error(chalk.red(`Project ${chalk.bold(projectId)} not found.`));
        console.log(chalk.yellow('Available projects:'));
        data.projects.forEach(p => {
          console.log(`  - ${p.projectId}: ${p.initialPrompt.substring(0, 50)}${p.initialPrompt.length > 50 ? '...' : ''}`);
        });
        process.exit(1);
      }

      // Check if all tasks are done & approved
      const allDone = project.tasks.every(t => t.status === "done");
      if (!allDone) {
        console.error(chalk.red(`Not all tasks in project ${chalk.bold(projectId)} are marked as done.`));
        console.log(chalk.yellow('\nPending tasks:'));
        project.tasks.filter(t => t.status !== "done").forEach(t => {
          console.log(`  - ${chalk.bold(t.id)}: ${t.title} (Status: ${t.status})`);
        });
        process.exit(1);
      }

      const allApproved = project.tasks.every(t => t.approved);
      if (!allApproved) {
        console.error(chalk.red(`Not all tasks in project ${chalk.bold(projectId)} are approved yet.`));
        console.log(chalk.yellow('\nUnapproved tasks:'));
        project.tasks.filter(t => !t.approved).forEach(t => {
          console.log(`  - ${chalk.bold(t.id)}: ${t.title}`);
        });
        process.exit(1);
      }

      if (project.completed) {
        console.log(chalk.yellow(`Project ${chalk.bold(projectId)} is already approved and completed.`));
        process.exit(0);
      }

      project.completed = true;
      await writeData(data);
      console.log(chalk.green(`✅ Project ${chalk.bold(projectId)} has been approved and marked as complete.`));

      // Show project info
      console.log(chalk.cyan('\n📋 Project details:'));
      console.log(`  - ${chalk.bold('Initial Prompt:')} ${project.initialPrompt}`);
      if (project.projectPlan && project.projectPlan !== project.initialPrompt) {
        console.log(`  - ${chalk.bold('Project Plan:')} ${project.projectPlan}`);
      }
      console.log(`  - ${chalk.bold('Status:')} ${chalk.green('Completed ✓')}`);

      // Show progress info
      const totalTasks = project.tasks.length;
      const completedTasks = project.tasks.filter(t => t.status === "done").length;
      const approvedTasks = project.tasks.filter(t => t.approved).length;
      
      console.log(chalk.cyan(`\n📊 Final Progress: ${chalk.bold(`${approvedTasks}/${completedTasks}/${totalTasks}`)} (approved/completed/total)`));
      
      // Create a progress bar
      const bar = '▓'.repeat(approvedTasks) + '▒'.repeat(completedTasks - approvedTasks) + '░'.repeat(totalTasks - completedTasks);
      console.log(`  ${bar}`);

      console.log(chalk.green('\n🎉 Project successfully completed and approved!'));
      console.log(chalk.gray('You can view the project details anytime using:'));
      console.log(chalk.blue(`  task-manager-cli list -p ${projectId}`));

    } catch (error) {
      console.error(chalk.red(formatCliError(normalizeError(error))));
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List all projects and their tasks")
  .option('-p, --project <projectId>', 'Show details for a specific project')
  .option('-s, --state <state>', "Filter by task/project state (open, pending_approval, completed, all)")
  .action(async (options) => {
    try {
      // Validate state option if provided
      if (options.state && !['open', 'pending_approval', 'completed', 'all'].includes(options.state)) {
        console.error(chalk.red(`Invalid state value: ${options.state}`));
        console.log(chalk.yellow('Valid states are: open, pending_approval, completed, all'));
        process.exit(1);
      }

      const data = await readData();
      
      if (data.projects.length === 0) {
        console.log(chalk.yellow('No projects found.'));
        return;
      }

      if (options.project) {
        // Show details for a specific project
        const project = data.projects.find(p => p.projectId === options.project);
        if (!project) {
          console.error(chalk.red(`Project ${chalk.bold(options.project)} not found.`));
          console.log(chalk.yellow('Available projects:'));
          data.projects.forEach(p => {
            console.log(`  - ${p.projectId}: ${p.initialPrompt.substring(0, 50)}${p.initialPrompt.length > 50 ? '...' : ''}`);
          });
          process.exit(1);
        }

        // Filter tasks by state if specified
        let tasks = project.tasks;
        if (options.state && options.state !== "all") {
          tasks = project.tasks.filter(task => {
            switch (options.state) {
              case "open":
                return task.status !== "done";
              case "pending_approval":
                return task.status === "done" && !task.approved;
              case "completed":
                return task.status === "done" && task.approved;
              default:
                return true;
            }
          });
        }

        console.log(chalk.cyan(`\n📋 Project ${chalk.bold(options.project)} details:`));
        console.log(`  - ${chalk.bold('Initial Prompt:')} ${project.initialPrompt}`);
        if (project.projectPlan && project.projectPlan !== project.initialPrompt) {
          console.log(`  - ${chalk.bold('Project Plan:')} ${project.projectPlan}`);
        }
        console.log(`  - ${chalk.bold('Status:')} ${project.completed ? chalk.green('Completed ✓') : chalk.yellow('In Progress')}`);

        // Show progress info
        const totalTasks = project.tasks.length;
        const completedTasks = project.tasks.filter(t => t.status === "done").length;
        const approvedTasks = project.tasks.filter(t => t.approved).length;
        
        console.log(chalk.cyan(`\n📊 Progress: ${chalk.bold(`${approvedTasks}/${completedTasks}/${totalTasks}`)} (approved/completed/total)`));
        
        // Create a progress bar
        const bar = '▓'.repeat(approvedTasks) + '▒'.repeat(completedTasks - approvedTasks) + '░'.repeat(totalTasks - completedTasks);
        console.log(`  ${bar}`);

        if (tasks.length > 0) {
          console.log(chalk.cyan('\n📝 Tasks:'));
          tasks.forEach(t => {
            const status = t.status === 'done' ? chalk.green('Done ✓') : t.status === 'in progress' ? chalk.yellow('In Progress ⟳') : chalk.blue('Not Started ○');
            const approved = t.approved ? chalk.green('Yes ✓') : chalk.red('No ✗');
            console.log(`  - ${chalk.bold(t.id)}: ${t.title}`);
            console.log(`    Status: ${status}, Approved: ${approved}`);
            console.log(`    Description: ${t.description}`);
            if (t.completedDetails) {
              console.log(`    Completed Details: ${t.completedDetails}`);
            }
            if (t.toolRecommendations) {
              console.log(`    Tool Recommendations: ${t.toolRecommendations}`);
            }
            if (t.ruleRecommendations) {
              console.log(`    Rule Recommendations: ${t.ruleRecommendations}`);
            }
          });
        } else {
          console.log(chalk.yellow('\nNo tasks match the specified state filter.'));
        }
      } else {
        // List all projects
        let projectsToList = data.projects;

        if (options.state && options.state !== "all") {
          projectsToList = data.projects.filter(project => {
            switch (options.state) {
              case "open":
                return !project.completed && project.tasks.some(task => task.status !== "done");
              case "pending_approval":
                return project.tasks.some(task => task.status === "done" && !task.approved);
              case "completed":
                return project.completed && project.tasks.every(task => task.status === "done" && task.approved);
              default:
                return true;
            }
          });
        }

        if (projectsToList.length === 0) {
          console.log(chalk.yellow('No projects match the specified state filter.'));
          return;
        }

        console.log(chalk.cyan('\n📋 Projects List:'));
        projectsToList.forEach(p => {
          const totalTasks = p.tasks.length;
          const completedTasks = p.tasks.filter(t => t.status === "done").length;
          const approvedTasks = p.tasks.filter(t => t.approved).length;
          const status = p.completed ? chalk.green('Completed ✓') : chalk.yellow('In Progress');
          
          console.log(`\n${chalk.bold(p.projectId)}: ${status}`);
          console.log(`  Initial Prompt: ${p.initialPrompt.substring(0, 100)}${p.initialPrompt.length > 100 ? '...' : ''}`);
          console.log(`  Progress: ${chalk.bold(`${approvedTasks}/${completedTasks}/${totalTasks}`)} (approved/completed/total)`);
          
          // Create a progress bar
          const bar = '▓'.repeat(approvedTasks) + '▒'.repeat(completedTasks - approvedTasks) + '░'.repeat(totalTasks - completedTasks);
          console.log(`  ${bar}`);
        });
      }
    } catch (error) {
      console.error(chalk.red(formatCliError(normalizeError(error))));
      process.exit(1);
    }
  });

program.parse(process.argv); 