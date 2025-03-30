import { describe, it, expect } from '@jest/globals';
// Note: We might need strip-ansi if chalk colors interfere with snapshot testing, but basic string checks should be okay.
import { formatTaskProgressTable, formatProjectsList } from '../../src/client/taskFormattingUtils.js';
import { Project, Task, ListProjectsSuccessData } from '../../src/types/index.js';

describe('taskFormattingUtils', () => {

  describe('formatTaskProgressTable', () => {
    const baseProject: Project = {
      projectId: 'proj-1',
      initialPrompt: 'Test prompt',
      projectPlan: 'Test plan',
      completed: false,
      autoApprove: false,
      tasks: [],
    };

    it('should return "Project not found" if project is undefined', () => {
      expect(formatTaskProgressTable(undefined)).toBe('Project not found');
    });

    it('should format an empty task list correctly', () => {
      const project: Project = { ...baseProject, tasks: [] };
      const result = formatTaskProgressTable(project);
      // Use toMatch with .* to handle potential ANSI codes from chalk.bold()
      expect(result).toMatch(/📋 Project .*proj-1.* details:/);
      expect(result).toContain('No tasks in this project.');
      expect(result).toContain('ID');
    });

    it('should format a single task correctly (not started)', () => {
      const task: Task = { id: 'task-1', title: 'Task One', description: 'Desc One', status: 'not started', approved: false, completedDetails: '' };
      const project: Project = { ...baseProject, tasks: [task] };
      const result = formatTaskProgressTable(project);
      // Use toMatch with .* to handle potential ANSI codes from chalk.bold()
      expect(result).toMatch(/📋 Project .*proj-1.* details:/);
      expect(result).toContain('task-1');
      expect(result).toContain('Task One');
      expect(result).toContain('Desc One');
      expect(result).toContain('Pending'); // Status text
      expect(result).toContain('No');      // Approved text
      expect(result).toContain('[-]');     // Tools/Rules text
    });

    it('should format a task in progress with recommendations', () => {
      const task: Task = {
        id: 'task-2',
        title: 'Task Two',
        description: 'Desc Two',
        status: 'in progress',
        approved: false,
        completedDetails: '',
        toolRecommendations: 'Tool A',
        ruleRecommendations: 'Rule B'
      };
      const project: Project = { ...baseProject, tasks: [task] };
      const result = formatTaskProgressTable(project);
      expect(result).toContain('task-2');
      expect(result).toContain('In Prog'); // Status text
      expect(result).toContain('No');       // Approved text
      expect(result).toContain('[+]');      // Tools/Rules text
    });

    it('should format a completed and approved task', () => {
      const task: Task = { id: 'task-3', title: 'Task Three', description: 'Desc Three', status: 'done', approved: true, completedDetails: 'Done details' };
      const project: Project = { ...baseProject, tasks: [task] };
      const result = formatTaskProgressTable(project);
      expect(result).toContain('task-3');
      expect(result).toContain('Done');    // Status text
      expect(result).toContain('Yes');     // Approved text
      expect(result).toContain('[-]');     // Tools/Rules text
    });

    it('should format a completed but not approved task', () => {
        const task: Task = { id: 'task-4', title: 'Task Four', description: 'Desc Four', status: 'done', approved: false, completedDetails: 'Done details' };
        const project: Project = { ...baseProject, tasks: [task] };
        const result = formatTaskProgressTable(project);
        expect(result).toContain('task-4');
        expect(result).toContain('Done');    // Status text
        expect(result).toContain('No');      // Approved text
        expect(result).toContain('[-]');     // Tools/Rules text
    });

    it('should handle long descriptions with word wrap', () => {
      // No longer testing manual truncation, just presence of the text
      const longDescription = 'This is a very long description that definitely exceeds the forty character width set for the description column and should wrap.';
      const task: Task = { id: 'task-5', title: 'Long Desc Task', description: longDescription, status: 'not started', approved: false, completedDetails: '' };
      const project: Project = { ...baseProject, tasks: [task] };
      const result = formatTaskProgressTable(project);
      expect(result).toContain('task-5');
      expect(result).toContain('Long Desc Task');
      // Check for the start of the long description, acknowledging it will be wrapped by the library
      expect(result).toContain('This is a very long description that');
      // Removed the check for 'column and should wrap.' as wrapping can make specific substring checks fragile.
      expect(result).toContain('Pending');
    });

    it('should format multiple tasks', () => {
      const task1: Task = { id: 'task-1', title: 'Task One', description: 'Desc One', status: 'not started', approved: false, completedDetails: '' };
      const task2: Task = { id: 'task-2', title: 'Task Two', description: 'Desc Two', status: 'done', approved: true, completedDetails: '' };
      const project: Project = { ...baseProject, tasks: [task1, task2] };
      const result = formatTaskProgressTable(project);
      // Check for elements of both tasks
      expect(result).toContain('task-1');
      expect(result).toContain('Task One');
      expect(result).toContain('Pending');
      expect(result).toContain('No');
      expect(result).toContain('[-]');

      expect(result).toContain('task-2');
      expect(result).toContain('Task Two');
      expect(result).toContain('Done');
      expect(result).toContain('Yes');
      expect(result).toContain('[-]');
    });
  });

  describe('formatProjectsList', () => {
    type ProjectSummary = ListProjectsSuccessData["projects"][0];

    it('should format an empty project list correctly', () => {
      const projects: ProjectSummary[] = [];
      const result = formatProjectsList(projects);
      // Check for the main header and the empty message within the table structure
      expect(result).toContain('Projects List:');
      expect(result).toContain('No projects found.'); // Use simpler text check
      expect(result).toContain('Project ID'); // Check if header is present
    });

    it('should format a single project correctly', () => {
      const projectSummary: ProjectSummary = {
        projectId: 'proj-1', initialPrompt: 'Short prompt', totalTasks: 2, completedTasks: 1, approvedTasks: 1
      };
      const result = formatProjectsList([projectSummary]);
      // Check for key data points within the formatted row
      expect(result).toContain('proj-1');
      expect(result).toContain('Short prompt');
      expect(result).toContain(' 2 '); // Check for counts with padding
      expect(result).toContain(' 1 ');
      expect(result).toContain(' 1 '); // Need trailing space if aligned right/center
    });

    it('should format multiple projects', () => {
      const project1: ProjectSummary = {
        projectId: 'proj-1', initialPrompt: 'Prompt 1', totalTasks: 1, completedTasks: 0, approvedTasks: 0
      };
      const project2: ProjectSummary = {
        projectId: 'proj-2', initialPrompt: 'Prompt 2', totalTasks: 3, completedTasks: 2, approvedTasks: 1
      };
      const result = formatProjectsList([project1, project2]);
      // Check for elements of both projects
      expect(result).toContain('proj-1');
      expect(result).toContain('Prompt 1');
      expect(result).toContain(' 1 ');
      expect(result).toContain(' 0 ');

      expect(result).toContain('proj-2');
      expect(result).toContain('Prompt 2');
      expect(result).toContain(' 3 ');
      expect(result).toContain(' 2 ');
      expect(result).toContain(' 1 '); // Approved count for proj-2
    });

    it('should truncate long initial prompts', () => {
      // This test remains similar as we kept manual truncation for prompts
      const longPrompt = 'This is a very long initial prompt that should be truncated based on the substring logic in the function.';
      // Correct the expected start
      const truncatedStart = 'This is a very long initial prompt';
      const ellipsis = '...'; // Check for the ellipsis separately due to potential wrapping
      const project: ProjectSummary = {
        projectId: 'proj-long', initialPrompt: longPrompt, totalTasks: 1, completedTasks: 0, approvedTasks: 0
      };
      const result = formatProjectsList([project]);
      expect(result).toContain('proj-long');
      expect(result).toContain(truncatedStart); // Check for the corrected start of the truncated string
      expect(result).toContain(ellipsis);       // Check for the ellipsis
      expect(result).not.toContain('in the function.'); // Ensure the original end is cut off
    });

     it('should correctly display pre-calculated completed and approved tasks counts', () => {
      const project: ProjectSummary = {
        projectId: 'proj-counts', initialPrompt: 'Counts Test', totalTasks: 4, completedTasks: 2, approvedTasks: 1
      };
      const result = formatProjectsList([project]);
      // Check for the specific counts formatted in the table
      expect(result).toContain('proj-counts');
      expect(result).toContain('Counts Test');
      expect(result).toContain(' 4 ');
      expect(result).toContain(' 2 ');
      expect(result).toContain(' 1 ');
    });
  });
});
