import { jest } from '@jest/globals';
import { TaskManagerFile } from '../../src/types/index.js';

// Mock for file system operations
export const mockFileData: TaskManagerFile = {
  requests: [
    {
      requestId: 'req-1',
      originalRequest: 'Test request',
      splitDetails: 'Test split details',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'Description for task 1',
          done: false,
          approved: false,
          completedDetails: '',
        },
        {
          id: 'task-2',
          title: 'Task 2',
          description: 'Description for task 2',
          done: true,
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