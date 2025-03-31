// Error Codes
export enum AppErrorCode {
    // Configuration / Validation (APP-1xxx)
    MissingParameter = 'APP-1000', // General missing param (mapped to protocol -32602)
    InvalidState = 'APP-1001', // e.g., invalid state filter
    InvalidArgument = 'APP-1002', // General invalid arg (mapped to protocol -32602)
    ConfigurationError = 'APP-1003', // e.g., Missing API Key for generate_project_plan
  
    // Resource Not Found (APP-2xxx)
    ProjectNotFound = 'APP-2000',
    TaskNotFound = 'APP-2001',
    // No need for EmptyTaskFile code, handle during load
  
    // Business Logic / State Rules (APP-3xxx)
    TaskNotDone = 'APP-3000', // Cannot approve/finalize if task not done
    ProjectAlreadyCompleted = 'APP-3001',
    // No need for CannotDeleteCompletedTask, handle in logic
    TasksNotAllDone = 'APP-3003', // Cannot finalize project
    TasksNotAllApproved = 'APP-3004', // Cannot finalize project
    CannotModifyApprovedTask = 'APP-3005', // Added for clarity
    TaskAlreadyApproved = 'APP-3006', // Added for clarity
  
    // File System (APP-4xxx)
    FileReadError = 'APP-4000', // Includes not found, permission denied etc.
    FileWriteError = 'APP-4001',
    FileParseError = 'APP-4002', // If needed during JSON parsing
    ReadOnlyFileSystem = 'APP-4003',
  
    // LLM Interaction Errors (APP-5xxx)
    LLMGenerationError = 'APP-5000',
    LLMConfigurationError = 'APP-5001', // Auth, key issues specifically with LLM provider call
  
    // Unknown / Catch-all (APP-9xxx)
    Unknown = 'APP-9999'
  }
  
  // Add a base AppError class
  export class AppError extends Error {
    public readonly code: AppErrorCode;
    public readonly details?: unknown;
  
    constructor(message: string, code: AppErrorCode, details?: unknown) {
      super(message);
      this.name = this.constructor.name; // Set name to the specific error class name
      this.code = code;
      this.details = details;
    }
  }
  