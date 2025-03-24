import { ErrorCategory, ErrorCode, StandardError, SuccessResponse } from '../types/index.js';

/**
 * Creates a standardized error object
 */
export function createError(
  code: ErrorCode,
  message: string,
  details?: unknown
): StandardError {
  const category = getCategoryFromCode(code);
  return {
    status: "error",
    code,
    category,
    message,
    details
  };
}

/**
 * Creates a standardized success response
 */
export function createSuccessResponse<T>(data: T): SuccessResponse<T> {
  return {
    status: "success",
    data
  };
}

/**
 * Gets the error category from an error code
 */
function getCategoryFromCode(code: ErrorCode): ErrorCategory {
  const codeNum = parseInt(code.split('_')[1]);
  if (codeNum >= 1000 && codeNum < 2000) return ErrorCategory.Validation;
  if (codeNum >= 2000 && codeNum < 3000) return ErrorCategory.ResourceNotFound;
  if (codeNum >= 3000 && codeNum < 4000) return ErrorCategory.StateTransition;
  if (codeNum >= 4000 && codeNum < 5000) return ErrorCategory.FileSystem;
  if (codeNum >= 5000 && codeNum < 6000) return ErrorCategory.TestAssertion;
  return ErrorCategory.Unknown;
}

/**
 * Converts any error to a StandardError
 */
export function normalizeError(error: unknown): StandardError {
  if (error instanceof Error) {
    // Try to parse error code from message if it exists
    const codeMatch = error.message.match(/\[([A-Z_]+)\]/);
    if (codeMatch && Object.values(ErrorCode).includes(codeMatch[1] as ErrorCode)) {
      return createError(
        codeMatch[1] as ErrorCode,
        error.message.replace(`[${codeMatch[1]}]`, '').trim(),
        { stack: error.stack }
      );
    }
    
    // Default to unknown error
    return createError(
      ErrorCode.InvalidArgument,
      error.message,
      { stack: error.stack }
    );
  }
  
  return createError(
    ErrorCode.Unknown,
    typeof error === 'string' ? error : 'An unknown error occurred',
    { originalError: error }
  );
} 