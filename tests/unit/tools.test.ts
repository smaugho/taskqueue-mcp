import { jest, describe, it, expect } from '@jest/globals';
import { ALL_TOOLS } from '../../src/types/tools.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

interface SchemaProperty {
  type: string;
  enum?: string[];
}

describe('Tools', () => {
  it('should have all required tools', () => {
    const toolNames = ALL_TOOLS.map(tool => tool.name);
    expect(toolNames).toContain('project');
    expect(toolNames).toContain('task');
  });

  it('should have project tool with correct schema', () => {
    const projectTool = ALL_TOOLS.find(tool => tool.name === 'project') as Tool;
    expect(projectTool).toBeDefined();
    expect(projectTool.inputSchema.required).toContain('action');
    
    const actionProperty = projectTool.inputSchema.properties?.action as SchemaProperty;
    expect(actionProperty).toBeDefined();
    expect(actionProperty.type).toBe('string');
    expect(actionProperty.enum).toBeDefined();
    expect(actionProperty.enum).toContain('list');
    expect(actionProperty.enum).toContain('create');
    expect(actionProperty.enum).toContain('delete');
    expect(actionProperty.enum).toContain('add_tasks');
    expect(actionProperty.enum).toContain('finalize');
  });

  it('should have task tool with correct schema', () => {
    const taskTool = ALL_TOOLS.find(tool => tool.name === 'task') as Tool;
    expect(taskTool).toBeDefined();
    expect(taskTool.inputSchema.required).toContain('action');
    
    const actionProperty = taskTool.inputSchema.properties?.action as SchemaProperty;
    expect(actionProperty).toBeDefined();
    expect(actionProperty.type).toBe('string');
    expect(actionProperty.enum).toBeDefined();
    expect(actionProperty.enum).toContain('read');
    expect(actionProperty.enum).toContain('update');
    expect(actionProperty.enum).toContain('delete');
  });
}); 