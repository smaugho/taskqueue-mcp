import { jest } from '@jest/globals';
import { TaskManagerFile } from '../../src/types/index.js';

// Mock for file system operations
export const mockFileData: TaskManagerFile = {
  projects: [
    {
      projectId: 'proj-1',
      initialPrompt: 'Test project',
      projectPlan: 'Test split details',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'Description for task 1',
          status: 'not started',
          approved: false,
          completedDetails: '',
        },
        {
          id: 'task-2',
          title: 'Task 2',
          description: 'Description for task 2',
          status: 'done',
          approved: true,
          completedDetails: 'Task completed',
        },
      ],
      completed: false,
    },
  ],
};

// Define mock functions with proper types
export const mockFs = {
  readFile: jest.fn(async () => JSON.stringify(mockFileData)),
  writeFile: jest.fn(async () => undefined),
};

// Reset mocks between tests
export function resetMocks() {
  mockFs.readFile.mockClear();
  mockFs.writeFile.mockClear();
}

export const mockTaskManagerData = {
  projects: [
    {
      projectId: 'proj-1',
      initialPrompt: 'Test project',
      projectPlan: 'Test project plan',
      tasks: [
        {
          id: 'task-1',
          title: 'Test task 1',
          description: 'Test description 1',
          status: 'not started',
          approved: false,
          completedDetails: ''
        }
      ],
      completed: false
    }
  ]
}; 