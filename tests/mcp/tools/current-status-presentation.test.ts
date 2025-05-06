import { describe, it, expect } from '@jest/globals';
import os from 'os';
import { formatStatusFileContent, StatusFileProjectData, StatusFileTaskData } from '../../../src/utils/statusFileFormatter.js';

describe('Current Status Rule File Formatting', () => {
  const EOL = os.EOL;

  describe('Project Formatting', () => {
    it('should correctly format a project with all new details (finalized, task counts)', () => {
      // Arrange
      const project: StatusFileProjectData = {
        initialPrompt: 'Test Project Finalized',
        projectPlan: 'This is the project plan for a finalized project.',
        isFinalized: true,
        completedTasks: 5,
        totalTasks: 10,
      };

      // Act
      const content = formatStatusFileContent(project, null);

      // Assert
      expect(content).toContain(`Project Name: ${project.initialPrompt}`);
      expect(content).toContain(`Project Detail:${EOL}   ${project.projectPlan.replace(/\n/g, `${EOL}   `)}`);
      expect(content).toContain(`Status: Finalized (${project.completedTasks}/${project.totalTasks} tasks completed)`);
      expect(content).toContain(`${EOL}# Task${EOL}${EOL}None`);
    });

    it('should correctly format a project (not finalized, with task counts)', () => {
      // Arrange
      const project: StatusFileProjectData = {
        initialPrompt: 'Another Project In Progress',
        projectPlan: 'Plan details here for in-progress project.',
        isFinalized: false, 
        completedTasks: 2,
        totalTasks: 5,
      };

      // Act
      const content = formatStatusFileContent(project, null);

      // Assert
      expect(content).toContain(`Project Name: ${project.initialPrompt}`);
      expect(content).toContain(`Project Detail:${EOL}   ${project.projectPlan.replace(/\n/g, `${EOL}   `)}`);
      expect(content).toContain(`Status: In Progress (${project.completedTasks}/${project.totalTasks} tasks completed)`);
      expect(content).toContain(`${EOL}# Task${EOL}${EOL}None`);
    });

    it('should correctly format a project (not finalized, undefined task counts treated as 0/0)', () => {
      // Arrange
      const project: StatusFileProjectData = {
        initialPrompt: 'Project Undefined Counts',
        projectPlan: 'Plan details with undefined counts.',
        // isFinalized, completedTasks, totalTasks are optional and will be undefined here
      };

      // Act
      const content = formatStatusFileContent(project, null);

      // Assert
      expect(content).toContain(`Project Name: ${project.initialPrompt}`);
      expect(content).toContain(`Project Detail:${EOL}   ${project.projectPlan.replace(/\n/g, `${EOL}   `)}`);
      expect(content).toContain('Status: In Progress (0/0 tasks completed)'); 
      expect(content).toContain(`${EOL}# Task${EOL}${EOL}None`);
    });

    it('should handle multi-line projectPlan with correct indentation', () => {
      // Arrange
      const project: StatusFileProjectData = {
        initialPrompt: 'Multi-line Plan Project',
        projectPlan: 'First line of plan.\nSecond line of plan.\nThird line.',
        isFinalized: false,
        completedTasks: 1,
        totalTasks: 2,
      };
      const expectedPlanIndented = `   ${project.projectPlan.replace(/\n/g, `${EOL}   `)}`;

      // Act
      const content = formatStatusFileContent(project, null);

      // Assert
      expect(content).toContain(`Project Name: ${project.initialPrompt}`);
      expect(content).toContain(`Project Detail:${EOL}${expectedPlanIndented}`);
      expect(content).toContain(`Status: In Progress (${project.completedTasks}/${project.totalTasks} tasks completed)`);
    });
  });

  describe('Task Formatting', () => {
    it('should display task status as "approved" when task.approved is true', () => {
      // Arrange
      const task: StatusFileTaskData = {
        title: 'Approved Task Title',
        description: 'This task is definitely approved.',
        status: 'done', 
        approved: true,
        completedDetails: "Approved task details", // Must be string
      };

      // Act
      const content = formatStatusFileContent(null, task);

      // Assert
      expect(content).toContain(`${EOL}# Project${EOL}${EOL}None`);
      expect(content).toContain(`Title: ${task.title}`);
      expect(content).toContain('Status: approved');
      expect(content).toContain(`Description:${EOL}   ${task.description.replace(/\n/g, `${EOL}   `)}`);
      expect(content).toContain(`Completed Details:${EOL}   ${task.completedDetails.replace(/\n/g, `${EOL}   `)}`);
    });

    it('should include and correctly indent task.completedDetails when present and not empty', () => {
      // Arrange
      const task: StatusFileTaskData = {
        title: 'Task With Completed Details',
        description: 'Regular description for completed task.',
        status: 'done',
        approved: true,
        completedDetails: 'All work is meticulously done.',
      };
      const expectedDescIndented = `   ${task.description.replace(/\n/g, `${EOL}   `)}`;
      const expectedCompletedDetailsIndented = `   ${task.completedDetails.replace(/\n/g, `${EOL}   `)}`;

      // Act
      const content = formatStatusFileContent(null, task);

      // Assert
      expect(content).toContain(`Title: ${task.title}`);
      expect(content).toContain('Status: approved');
      expect(content).toContain(`Description:${EOL}${expectedDescIndented}`);
      expect(content).toContain(`Completed Details:${EOL}${expectedCompletedDetailsIndented}`);
    });

    it('should NOT display Completed Details section if task.completedDetails is an empty string', () => {
      // Arrange
      const task: StatusFileTaskData = {
        title: 'Task With Empty Details',
        description: 'Description here.',
        status: 'done',
        approved: true,
        completedDetails: ' ', // Empty string (after trim)
      };

      // Act
      const content = formatStatusFileContent(null, task);

      // Assert
      expect(content).toContain(`Title: ${task.title}`);
      expect(content).toContain('Status: approved');
      expect(content).toContain(`Description:${EOL}   ${task.description.replace(/\n/g, `${EOL}   `)}`);
      expect(content).not.toContain('Completed Details:');
    });

    it('should handle multi-line task.description with correct indentation', () => {
      // Arrange
      const task: StatusFileTaskData = {
        title: 'Multi-line Task Description',
        description: 'First line of task desc.\nSecond line, which should be indented.',
        status: 'in progress',
        approved: false,
        completedDetails: "", // Must be string
      };
      const expectedDescIndented = `   ${task.description.replace(/\n/g, `${EOL}   `)}`;

      // Act
      const content = formatStatusFileContent(null, task);

      // Assert
      expect(content).toContain(`Title: ${task.title}`);
      expect(content).toContain(`Status: ${task.status}`);
      expect(content).toContain(`Description:${EOL}${expectedDescIndented}`);
    });

    it('should handle multi-line task.completedDetails with correct indentation', () => {
      // Arrange
      const task: StatusFileTaskData = {
        title: 'Task with Multi-line Completion Details',
        description: 'Simple task description.',
        status: 'done',
        approved: true,
        completedDetails: 'Completion detail line 1.\nCompletion detail line 2, also should be indented.',
      };
      const expectedDescIndented = `   ${task.description.replace(/\n/g, `${EOL}   `)}`;
      const expectedCompletedDetailsIndented = `   ${task.completedDetails.replace(/\n/g, `${EOL}   `)}`;

      // Act
      const content = formatStatusFileContent(null, task);

      // Assert
      expect(content).toContain(`Title: ${task.title}`);
      expect(content).toContain('Status: approved');
      expect(content).toContain(`Description:${EOL}${expectedDescIndented}`);
      expect(content).toContain(`Completed Details:${EOL}${expectedCompletedDetailsIndented}`);
    });

    it('should show "in progress" status correctly for a task', () => {
        // Arrange
        const task: StatusFileTaskData = {
            title: 'Task Currently In Progress',
            description: 'Work is actively ongoing for this task.',
            status: 'in progress',
            approved: false,
            completedDetails: "", // Must be string
        };
        const expectedDescIndented = `   ${task.description.replace(/\n/g, `${EOL}   `)}`;

        // Act
        const content = formatStatusFileContent(null, task);

        // Assert
        expect(content).toContain(`Title: ${task.title}`);
        expect(content).toContain(`Status: ${task.status}`);
        expect(content).toContain(`Description:${EOL}${expectedDescIndented}`);
    });

    it('should show "not started" status correctly for a task', () => {
        // Arrange
        const task: StatusFileTaskData = {
            title: 'Task Not Yet Started',
            description: 'This task is pending and has not been started.',
            status: 'not started',
            approved: false,
            completedDetails: "", // Must be string
        };
        const expectedDescIndented = `   ${task.description.replace(/\n/g, `${EOL}   `)}`;

        // Act
        const content = formatStatusFileContent(null, task);

        // Assert
        expect(content).toContain(`Title: ${task.title}`);
        expect(content).toContain(`Status: ${task.status}`);
        expect(content).toContain(`Description:${EOL}${expectedDescIndented}`);
    });
  });

  describe('Combined Project and Task Formatting', () => {
    it('should correctly format with both project and task details, including all enhancements', () => {
      // Arrange
      const project: StatusFileProjectData = {
        initialPrompt: 'Full Project Example',
        projectPlan: 'Project plan line 1 for full example.\nProject plan line 2 for full example.',
        isFinalized: false,
        completedTasks: 3,
        totalTasks: 7,
      };
      const task: StatusFileTaskData = {
        title: 'Key Task in Full Example',
        description: 'Task description line 1 for full example.\nTask description line 2 for full example.',
        status: 'done',
        approved: true,
        completedDetails: 'Completion detail line 1 for full example.\nCompletion detail line 2 for full example.',
      };
      const expectedProjectPlanIndented = `   ${project.projectPlan.replace(/\n/g, `${EOL}   `)}`;
      const expectedTaskDescIndented = `   ${task.description.replace(/\n/g, `${EOL}   `)}`;
      const expectedTaskCompletedIndented = `   ${task.completedDetails.replace(/\n/g, `${EOL}   `)}`;

      // Act
      const content = formatStatusFileContent(project, task);

      // Assert
      expect(content).toContain(`Project Name: ${project.initialPrompt}`);
      expect(content).toContain(`Project Detail:${EOL}${expectedProjectPlanIndented}`);
      expect(content).toContain(`Status: In Progress (${project.completedTasks}/${project.totalTasks} tasks completed)`);
      expect(content).toContain(`Title: ${task.title}`);
      expect(content).toContain('Status: approved');
      expect(content).toContain(`Description:${EOL}${expectedTaskDescIndented}`);
      expect(content).toContain(`Completed Details:${EOL}${expectedTaskCompletedIndented}`);
    });
  });

  describe('Edge Cases and Null Handling', () => {
    it('should display "None" for project and task if both are null', () => {
      // Arrange (nothing to arrange)
      
      // Act
      const content = formatStatusFileContent(null, null);
      
      // Assert
      const expectedProjectNone = `# Project${EOL}${EOL}None`;
      const expectedTaskNone = `# Task${EOL}${EOL}None`;
      expect(content).toContain(expectedProjectNone);
      expect(content).toContain(expectedTaskNone);
    });

    it('should display "None" for task if task is null and project is present', () => {
      // Arrange
      const project: StatusFileProjectData = {
        initialPrompt: 'Project Only Example',
        projectPlan: 'Plan here for project-only example.',
        isFinalized: true,
        completedTasks: 1,
        totalTasks: 1,
      };
      const expectedProjectPlanIndented = `   ${project.projectPlan.replace(/\n/g, `${EOL}   `)}`;

      // Act
      const content = formatStatusFileContent(project, null);

      // Assert
      expect(content).toContain(`Project Name: ${project.initialPrompt}`);
      expect(content).toContain(`Project Detail:${EOL}${expectedProjectPlanIndented}`);
      expect(content).toContain(`Status: Finalized (${project.completedTasks}/${project.totalTasks} tasks completed)`);
      expect(content).toContain(`${EOL}# Task${EOL}${EOL}None`);
    });

    it('should display "None" for project if project is null and task is present', () => {
      // Arrange
      const task: StatusFileTaskData = {
        title: 'Task Only Example',
        description: 'Description here for task-only example.',
        status: 'not started',
        approved: false,
        completedDetails: "", // Must be string
      };
      const expectedTaskDescIndented = `   ${task.description.replace(/\n/g, `${EOL}   `)}`;

      // Act
      const content = formatStatusFileContent(null, task);

      // Assert
      expect(content).toContain(`${EOL}# Project${EOL}${EOL}None`);
      expect(content).toContain(`Title: ${task.title}`);
      expect(content).toContain(`Status: ${task.status}`);
      expect(content).toContain(`Description:${EOL}${expectedTaskDescIndented}`);
    });
  });
}); 