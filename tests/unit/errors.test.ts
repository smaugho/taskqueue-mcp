import { normalizeError, createError } from '../../src/utils/errors.js';
import { StandardError, ErrorCode, ErrorCategory } from '../../src/types/index.js';

describe('normalizeError', () => {
  it('should return the same StandardError object if passed a StandardError', () => {
    const standardError: StandardError = {
      status: 'error',
      code: ErrorCode.ProjectNotFound,
      category: ErrorCategory.ResourceNotFound,
      message: 'Project not found',
    };

    const result = normalizeError(standardError);
    // Use 'toBe' to check for referential equality (same object)
    expect(result).toBe(standardError); 
    // Also check deep equality just in case
    expect(result).toEqual(standardError); 
  });

  it('should correctly parse a StandardError from an Error with a valid code in the message', () => {
    const originalError = new Error('[ERR_1000] Missing required parameter: userId');
    const expectedError: StandardError = {
      status: 'error',
      code: ErrorCode.MissingParameter,
      category: ErrorCategory.Validation,
      message: 'Missing required parameter: userId',
      details: { stack: originalError.stack },
    };

    const result = normalizeError(originalError);
    expect(result).toEqual(expectedError);
  });

  it('should create a StandardError with InvalidArgument code for a generic Error without a code', () => {
    const originalError = new Error('Something went wrong');
    const expectedError: StandardError = {
      status: 'error',
      code: ErrorCode.InvalidArgument, // Current fallback behavior
      category: ErrorCategory.Validation, // Derived from InvalidArgument
      message: 'Something went wrong',
      details: { stack: originalError.stack },
    };

    const result = normalizeError(originalError);
    expect(result).toEqual(expectedError);
  });

  it('should create a StandardError with Unknown code for a string input', () => {
    const errorString = 'A string error message';
    const expectedError: StandardError = {
      status: 'error',
      code: ErrorCode.Unknown,
      category: ErrorCategory.Unknown,
      message: errorString,
      details: { originalError: errorString },
    };

    const result = normalizeError(errorString);
    expect(result).toEqual(expectedError);
  });

  it('should create a StandardError with Unknown code for an object input', () => {
    const errorObject = { detail: 'Some custom error object' };
    const expectedError: StandardError = {
      status: 'error',
      code: ErrorCode.Unknown,
      category: ErrorCategory.Unknown,
      message: 'An unknown error occurred',
      details: { originalError: errorObject },
    };

    const result = normalizeError(errorObject);
    expect(result).toEqual(expectedError);
  });

  it('should handle errors created with createError correctly', () => {
    const createdError = createError(ErrorCode.FileReadError, "Could not read file", { path: "/tmp/file" });
    // When createError is used, it doesn't embed the code in the message.
    // normalizeError currently relies on finding the code *in the message* for standard Errors.
    // Let's test how normalizeError handles an error *object* that looks like a StandardError but isn't one instanceof Error.
    
    // If we pass the *object* created by createError:
    const resultFromObject = normalizeError(createdError);
    expect(resultFromObject).toBe(createdError); // Should pass through if it's already the right shape.

    // If we simulate throwing it and catching it (which might wrap it):
    // This is more complex to simulate accurately without more context on *how* it might be thrown/caught.
    // The main point is covered by the first test: if the caught object *is* a StandardError, it's passed through.
  });

});
