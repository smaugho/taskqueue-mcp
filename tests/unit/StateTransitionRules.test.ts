// tests/unit/StateTransitionRules.test.ts
import { describe, it, expect } from '@jest/globals';
import { VALID_STATUS_TRANSITIONS } from '../../src/types/index.js';

describe('Task Status Transition Rules', () => {
  // Test the status transition validation logic
  describe('Valid transitions', () => {
    it('should define that tasks in "not started" status can only transition to "in progress"', () => {
      const validTransitions = VALID_STATUS_TRANSITIONS['not started'];
      expect(validTransitions).toContain('in progress');
      expect(validTransitions.length).toBe(1);
    });
    
    it('should define that tasks in "in progress" status can transition to "done" or back to "not started"', () => {
      const validTransitions = VALID_STATUS_TRANSITIONS['in progress'];
      expect(validTransitions).toContain('done');
      expect(validTransitions).toContain('not started');
      expect(validTransitions.length).toBe(2);
    });
    
    it('should define that tasks in "done" status can only transition back to "in progress"', () => {
      const validTransitions = VALID_STATUS_TRANSITIONS['done'];
      expect(validTransitions).toContain('in progress');
      expect(validTransitions.length).toBe(1);
    });
  });
  
  describe('Invalid transitions', () => {
    it('should not allow direct transition from "not started" to "done"', () => {
      const validTransitions = VALID_STATUS_TRANSITIONS['not started'];
      expect(validTransitions).not.toContain('done');
    });
    
    it('should not allow direct transition from "done" to "not started"', () => {
      const validTransitions = VALID_STATUS_TRANSITIONS['done'];
      expect(validTransitions).not.toContain('not started');
    });
  });
}); 