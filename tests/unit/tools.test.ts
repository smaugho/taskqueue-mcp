import { jest, describe, it, expect } from '@jest/globals';
import { ALL_TOOLS } from '../../src/types/tools.js';

describe('MCP Tools', () => {
  it('should have all expected tools defined', () => {
    expect(ALL_TOOLS.length).toBe(10);
    
    const toolNames = ALL_TOOLS.map(tool => tool.name);
    expect(toolNames).toContain('request_planning');
    expect(toolNames).toContain('get_next_task');
    expect(toolNames).toContain('mark_task_done');
    expect(toolNames).toContain('approve_task_completion');
    expect(toolNames).toContain('approve_request_completion');
    expect(toolNames).toContain('open_task_details');
    expect(toolNames).toContain('list_requests');
    expect(toolNames).toContain('add_tasks_to_request');
    expect(toolNames).toContain('update_task');
    expect(toolNames).toContain('delete_task');
  });

  it('should have required properties for each tool', () => {
    ALL_TOOLS.forEach(tool => {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    });
  });

  it('should have proper input schemas with required fields', () => {
    const requestPlanningTool = ALL_TOOLS.find(tool => tool.name === 'request_planning');
    expect(requestPlanningTool).toBeDefined();
    expect(requestPlanningTool?.inputSchema.required).toContain('originalRequest');
    expect(requestPlanningTool?.inputSchema.required).toContain('tasks');
    
    const getNextTaskTool = ALL_TOOLS.find(tool => tool.name === 'get_next_task');
    expect(getNextTaskTool).toBeDefined();
    expect(getNextTaskTool?.inputSchema.required).toContain('requestId');
    
    const markTaskDoneTool = ALL_TOOLS.find(tool => tool.name === 'mark_task_done');
    expect(markTaskDoneTool).toBeDefined();
    expect(markTaskDoneTool?.inputSchema.required).toContain('requestId');
    expect(markTaskDoneTool?.inputSchema.required).toContain('taskId');
  });
}); 