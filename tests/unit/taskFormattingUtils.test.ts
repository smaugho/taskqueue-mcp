import { describe, it, expect } from '@jest/globals';
import { formatTaskProgressTable, formatProjectsList } from '../../src/server/taskFormattingUtils.js';
import { Project, Task } from '../../src/types/index.js';

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
      const expectedHeader = "| Task ID | Title | Description | Status | Approval | Tools | Rules |\n";
      const expectedSeparator = "|----------|----------|-------------|--------|----------|-------|-------|\n";
      const result = formatTaskProgressTable(project);
      expect(result).toContain("\nProgress Status:\n");
      expect(result).toContain(expectedHeader);
      expect(result).toContain(expectedSeparator);
      // Check that there are no task rows
      expect(result.split('\n').length).toBe(5); // Title, Header, Separator, Blank line at start, Blank line at end
    });

    it('should format a single task correctly (not started)', () => {
      const task: Task = { id: 'task-1', title: 'Task One', description: 'Desc One', status: 'not started', approved: false, completedDetails: '' };
      const project: Project = { ...baseProject, tasks: [task] };
      const result = formatTaskProgressTable(project);
      expect(result).toContain('| task-1 | Task One | Desc One | ⏳ Not Started | ⏳ Pending | - | - |');
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
      expect(result).toContain('| task-2 | Task Two | Desc Two | 🔄 In Progress | ⏳ Pending | ✓ | ✓ |');
    });

    it('should format a completed and approved task', () => {
      const task: Task = { id: 'task-3', title: 'Task Three', description: 'Desc Three', status: 'done', approved: true, completedDetails: 'Done details' };
      const project: Project = { ...baseProject, tasks: [task] };
      const result = formatTaskProgressTable(project);
      expect(result).toContain('| task-3 | Task Three | Desc Three | ✅ Done | ✅ Approved | - | - |');
    });

    it('should format a completed but not approved task', () => {
        const task: Task = { id: 'task-4', title: 'Task Four', description: 'Desc Four', status: 'done', approved: false, completedDetails: 'Done details' };
        const project: Project = { ...baseProject, tasks: [task] };
        const result = formatTaskProgressTable(project);
        expect(result).toContain('| task-4 | Task Four | Desc Four | ✅ Done | ⏳ Pending | - | - |');
    });

    it('should truncate long descriptions', () => {
      const longDescription = 'This is a very long description that definitely exceeds the fifty character limit imposed by the formatting function.';
      const truncatedDescription = 'This is a very long description that definitely ...';
      const task: Task = { id: 'task-5', title: 'Long Desc Task', description: longDescription, status: 'not started', approved: false, completedDetails: '' };
      const project: Project = { ...baseProject, tasks: [task] };
      const result = formatTaskProgressTable(project);
      expect(result).toContain(`| task-5 | Long Desc Task | ${truncatedDescription} | ⏳ Not Started | ⏳ Pending | - | - |`);
    });

    it('should format multiple tasks', () => {
      const task1: Task = { id: 'task-1', title: 'Task One', description: 'Desc One', status: 'not started', approved: false, completedDetails: '' };
      const task2: Task = { id: 'task-2', title: 'Task Two', description: 'Desc Two', status: 'done', approved: true, completedDetails: '' };
      const project: Project = { ...baseProject, tasks: [task1, task2] };
      const result = formatTaskProgressTable(project);
      expect(result).toContain('| task-1 | Task One | Desc One | ⏳ Not Started | ⏳ Pending | - | - |');
      expect(result).toContain('| task-2 | Task Two | Desc Two | ✅ Done | ✅ Approved | - | - |');
    });
  });

  describe('formatProjectsList', () => {
    const baseTask: Task = { id: 'task-1', title: 'T1', description: 'D1', status: 'not started', approved: false, completedDetails: '' };

    it('should format an empty project list correctly', () => {
      const projects: Project[] = [];
      const expectedHeader = "| Project ID | Initial Prompt | Total Tasks | Completed | Approved |\n";
      const expectedSeparator = "|------------|------------------|-------------|-----------|----------|\n";
      const result = formatProjectsList(projects);
      expect(result).toContain("\nProjects List:\n");
      expect(result).toContain(expectedHeader);
      expect(result).toContain(expectedSeparator);
      // Check that there are no project rows
      expect(result.split('\n').length).toBe(5); // Title, Header, Separator, Blank line at start, Blank line at end
    });

    it('should format a single project correctly', () => {
      const project: Project = {
        projectId: 'proj-1',
        initialPrompt: 'Short prompt',
        projectPlan: 'Plan',
        completed: false,
        autoApprove: false,
        tasks: [
          { ...baseTask, status: 'done', approved: true },
          { ...baseTask, id: 'task-2', status: 'in progress' }
        ]
      };
      const result = formatProjectsList([project]);
      expect(result).toContain('| proj-1 | Short prompt | 2 | 1 | 1 |');
    });

    it('should format multiple projects', () => {
      const project1: Project = {
        projectId: 'proj-1', initialPrompt: 'Prompt 1', projectPlan: 'P1', completed: false, autoApprove: false, tasks: [{ ...baseTask }]
      };
      const project2: Project = {
        projectId: 'proj-2', initialPrompt: 'Prompt 2', projectPlan: 'P2', completed: true, autoApprove: false, tasks: [{ ...baseTask, status: 'done', approved: true }]
      };
      const result = formatProjectsList([project1, project2]);
      expect(result).toContain('| proj-1 | Prompt 1 | 1 | 0 | 0 |');
      expect(result).toContain('| proj-2 | Prompt 2 | 1 | 1 | 1 |');
    });

    it('should truncate long initial prompts', () => {
      const longPrompt = 'This is a very long initial prompt that should be truncated in the list view.';
      const truncatedPrompt = 'This is a very long initial...';
      const project: Project = {
        projectId: 'proj-long', initialPrompt: longPrompt, projectPlan: 'Plan', completed: false, autoApprove: false, tasks: [{ ...baseTask }]
      };
      const result = formatProjectsList([project]);
      expect(result).toContain(`| proj-long | ${truncatedPrompt} | 1 | 0 | 0 |`);
    });

     it('should correctly count completed and approved tasks', () => {
      const project: Project = {
        projectId: 'proj-counts',
        initialPrompt: 'Counts Test',
        projectPlan: 'Plan',
        completed: false,
        autoApprove: false,
        tasks: [
          { ...baseTask, id: 't1', status: 'done', approved: true }, // Done, Approved
          { ...baseTask, id: 't2', status: 'done', approved: false }, // Done, Not Approved
          { ...baseTask, id: 't3', status: 'in progress' }, // In Progress
          { ...baseTask, id: 't4', status: 'not started' } // Not Started
        ]
      };
      const result = formatProjectsList([project]);
      // Expect Total=4, Completed=2, Approved=1
      expect(result).toContain('| proj-counts | Counts Test | 4 | 2 | 1 |');
    });
  });
});
