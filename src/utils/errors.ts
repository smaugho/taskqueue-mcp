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
  // 1. Check if it already looks like a StandardError (duck typing)
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error && error.status === 'error' &&
    'code' in error && typeof error.code === 'string' &&
    'category' in error && typeof error.category === 'string' &&
    'message' in error && typeof error.message === 'string' &&
    Object.values(ErrorCode).includes(error.code as ErrorCode) // Verify the code is valid
  ) {
    // It already conforms to the StandardError structure, return as is.
    // We cast because TypeScript knows it's 'object', but we've verified the shape.
    return error as StandardError;
  }

  // 2. Check if it's an instance of Error
  if (error instanceof Error) {
    const codeMatch = error.message.match(/\[([A-Z_0-9]+)\]/);
    // Ensure codeMatch exists and the captured group is a valid ErrorCode
    if (codeMatch && codeMatch[1] && Object.values(ErrorCode).includes(codeMatch[1] as ErrorCode)) {
      const extractedCode = codeMatch[1] as ErrorCode;
      // Remove the code prefix "[CODE]" from the message - use the full match codeMatch[0] for replacement
      const cleanedMessage = error.message.replace(codeMatch[0], '').trim();
      return createError(
        extractedCode,
        cleanedMessage,
        { stack: error.stack } // Keep stack trace if available
      );
    }
    
    // Fallback for generic Errors without a recognized code in the message
    return createError(
      ErrorCode.InvalidArgument, // Use InvalidArgument for generic errors
      error.message,
      { stack: error.stack }
    );
  }
  
  // 3. Handle other types (string, primitive, plain object without structure)
  return createError(
    ErrorCode.Unknown,
    typeof error === 'string' ? error : 'An unknown error occurred',
    { originalError: error } // Include the original unknown error type
  );
} 