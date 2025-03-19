#!/usr/bin/env node

import { Command } from "commander";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { TaskManagerFile } from "./types/index.js";
import chalk from "chalk";

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
      throw new Error(`Failed to parse JSON data: ${error instanceof Error ? error.message : String(error)}`);
    }
  } catch (error) {
    console.error(chalk.red(`Error reading task file: ${error instanceof Error ? error.message : String(error)}`));
    return { projects: [] };
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
    console.error(chalk.red(`Error writing to task file: ${error instanceof Error ? error.message : String(error)}`));
    throw error;
  }
}

program
  .name("task-manager-cli")
  .description("CLI for the Task Manager MCP Server")
  .version("1.0.0");

program
  .command("approve-task")
  .description("Approve a completed task")
  .argument("<projectId>", "ID of the project containing the task")
  .argument("<taskId>", "ID of the task to approve")
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
      console.error(chalk.red(`An error occurred: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command("approve-project")
  .description("Approve project completion")
  .argument("<projectId>", "ID of the project to approve")
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
      console.error(chalk.red(`An error occurred: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List all projects and their tasks")
  .option('-p, --project <projectId>', 'Show details for a specific project')
  .action(async (options) => {
    try {
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
        
        console.log(chalk.cyan(`\n📋 Project: ${chalk.bold(project.projectId)}`));
        console.log(`  - ${chalk.bold('Initial Prompt:')} ${project.initialPrompt}`);
        console.log(`  - ${chalk.bold('Status:')} ${project.completed ? chalk.green('Completed ✓') : chalk.yellow('In Progress ⟳')}`);
        
        console.log(chalk.cyan(`\n📋 Tasks:`));
        if (project.tasks.length === 0) {
          console.log(chalk.yellow('  No tasks found for this project.'));
        } else {
          project.tasks.forEach(task => {
            console.log(`  - ${chalk.bold(task.id)}: ${task.title}`);
            console.log(`    ${chalk.dim('Description:')} ${task.description}`);
            console.log(`    ${chalk.dim('Status:')} ${task.status === 'done' ? chalk.green('Done ✓') : task.status === 'in progress' ? chalk.yellow('In Progress ⟳') : chalk.blue('Not Started ○')}`);
            console.log(`    ${chalk.dim('Approved:')} ${task.approved ? chalk.green('Yes ✓') : chalk.red('No ✗')}`);
            if (task.status === 'done') {
              console.log(`    ${chalk.dim('Completed Details:')} ${task.completedDetails || chalk.gray("None")}`);
            }
            console.log();
          });
        }
      } else {
        // List all projects
        console.log(chalk.cyan(`\n📋 All Projects:`));
        data.projects.forEach(project => {
          const totalTasks = project.tasks.length;
          const completedTasks = project.tasks.filter(t => t.status === "done").length;
          const approvedTasks = project.tasks.filter(t => t.approved).length;
          
          console.log(`  - ${chalk.bold(project.projectId)}: ${project.initialPrompt.substring(0, 50)}${project.initialPrompt.length > 50 ? '...' : ''}`);
          console.log(`    ${chalk.dim('Status:')} ${project.completed ? chalk.green('Completed ✓') : chalk.yellow('In Progress ⟳')}`);
          console.log(`    ${chalk.dim('Progress:')} ${chalk.bold(`${approvedTasks}/${completedTasks}/${totalTasks}`)} (approved/completed/total)`);
          console.log();
        });
        
        console.log(chalk.blue(`Use '${chalk.bold('task-manager-cli list -p <projectId>')}' for detailed information about a specific project.`));
      }
    } catch (error) {
      console.error(chalk.red(`An error occurred: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program.parse(); 