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

  describe('Rule Excerpt Formatting', () => {
    it('should add Relevant Rule Excerpt section when filename and excerpt are provided', () => {
      // Arrange
      const task: StatusFileTaskData = {
        title: 'Task with Rule', 
        description: '[some_rule.mdc](mdc:./.cursor/rules/some_rule.mdc)', 
        status: 'in progress', 
        approved: false, 
        completedDetails: "",
        relevantRuleFilename: 'some_rule.mdc',
        relevantRuleExcerpt: 'Rule line 1\nRule line 2'
      };
      const expectedExcerptIndented = task.relevantRuleExcerpt 
        ? `   ${task.relevantRuleExcerpt.replace(/\n/g, `${EOL}   `)}` 
        : ''; 

      // Act
      const content = formatStatusFileContent(null, task);

      // Assert
      // Make assertion more specific: check for header AND indented content together
      const expectedSection = `# Relevant Rule Excerpt (${task.relevantRuleFilename})${EOL}${EOL}${expectedExcerptIndented}`;
      expect(content).toContain(expectedSection);
    });

    it('should NOT add Relevant Rule Excerpt section if excerpt is missing', () => {
      // Arrange
      const task: StatusFileTaskData = {
        title: 'Task without Excerpt', 
        description: 'No rule ref', 
        status: 'in progress', 
        approved: false, 
        completedDetails: "",
        relevantRuleFilename: 'some_rule.mdc', 
        // relevantRuleExcerpt: undefined 
      };

      // Act
      const content = formatStatusFileContent(null, task);

      // Assert
      expect(content).not.toContain('# Relevant Rule Excerpt');
    });

    it('should NOT add Relevant Rule Excerpt section if filename is missing', () => {
      // Arrange
      const task: StatusFileTaskData = {
        title: 'Task without Filename', 
        description: 'No rule ref', 
        status: 'in progress', 
        approved: false, 
        completedDetails: "",
        // relevantRuleFilename: undefined,
        relevantRuleExcerpt: 'Some excerpt text'
      };

      // Act
      const content = formatStatusFileContent(null, task);

      // Assert
      expect(content).not.toContain('# Relevant Rule Excerpt');
    });

    it('should correctly indent multi-line rule excerpts', () => {
      // Arrange
      const task: StatusFileTaskData = {
        title: 'Task with Multi-line Rule', 
        description: '[multi_line_rule.mdc](mdc:./.cursor/rules/multi_line_rule.mdc)', 
        status: 'done', 
        approved: true, 
        completedDetails: "Done",
        relevantRuleFilename: 'multi_line_rule.mdc',
        relevantRuleExcerpt: 'First rule line.\nSecond rule line.\n  Indented third rule line.'
      };
      const expectedExcerptIndented = task.relevantRuleExcerpt 
        ? `   ${task.relevantRuleExcerpt.replace(/\n/g, `${EOL}   `)}`
        : '';

      // Act
      const content = formatStatusFileContent(null, task);

      // Assert
      // Make assertion more specific: check for header AND indented content together
      const expectedSection = `# Relevant Rule Excerpt (${task.relevantRuleFilename})${EOL}${EOL}${expectedExcerptIndented}`;
      expect(content).toContain(expectedSection);
    });
  });

  describe('Project and Task ID Formatting', () => {
    it('should include Project ID when projectId is provided in project data', () => {
      // Arrange
      const project: StatusFileProjectData = {
        projectId: 'proj-123',
        initialPrompt: 'Project With ID',
        projectPlan: 'Plan for project with ID.',
      };
      
      // Act
      const content = formatStatusFileContent(project, null);
      
      // Assert
      expect(content).toContain(`Project ID: proj-123${EOL}Project Name: Project With ID`);
    });

    it('should include Task ID when taskId is provided in task data', () => {
      // Arrange
      const task: StatusFileTaskData = {
        taskId: 'task-456',
        title: 'Task With ID',
        description: 'Description for task with ID.',
        status: 'in progress',
        approved: false,
        completedDetails: "",
      };
      
      // Act
      const content = formatStatusFileContent(null, task);
      
      // Assert
      expect(content).toContain(`Task ID: task-456${EOL}Title: Task With ID`);
    });

    it('should include both Project ID and Task ID when both are provided', () => {
      // Arrange
      const project: StatusFileProjectData = {
        projectId: 'proj-789',
        initialPrompt: 'Project Alpha',
        projectPlan: 'Plan Alpha.',
      };
      const task: StatusFileTaskData = {
        taskId: 'task-101',
        title: 'Task Beta',
        description: 'Description Beta.',
        status: 'done',
        approved: true,
        completedDetails: "Done Beta",
      };
      
      // Act
      const content = formatStatusFileContent(project, task);
      
      // Assert
      expect(content).toContain(`Project ID: proj-789${EOL}Project Name: Project Alpha`);
      expect(content).toContain(`Task ID: task-101${EOL}Title: Task Beta`);
    });

    it('should correctly format project details without projectId if not provided', () => {
      // Arrange
      const project: StatusFileProjectData = {
        initialPrompt: 'Project No ID',
        projectPlan: 'Plan for project with no ID.',
      };
      
      // Act
      const content = formatStatusFileContent(project, null);
      
      // Assert
      expect(content).not.toContain('Project ID:');
      expect(content).toContain(`Project Name: Project No ID`);
    });

    it('should correctly format task details without taskId if not provided', () => {
      // Arrange
      const task: StatusFileTaskData = {
        title: 'Task No ID',
        description: 'Description for task with no ID.',
        status: 'not started',
        approved: false,
        completedDetails: "",
      };
      
      // Act
      const content = formatStatusFileContent(null, task);
      
      // Assert
      expect(content).not.toContain('Task ID:');
      expect(content).toContain(`Title: Task No ID`);
    });
  });
}); 