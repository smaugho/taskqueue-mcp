import { ErrorCode } from '../types/index.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

/**
 * Normalizes any error into a consistent format for Tool Execution Errors.
 * This is primarily used for formatting isError:true responses.
 */
export function normalizeError(error: unknown): McpError {
  if (error instanceof Error) {
    const err = error as any; // Allow access to potential custom props
    // Use JsonRpcErrorCode for McpError, but keep original code for internal use
    const mcpCode = err.jsonRpcCode || JsonRpcErrorCode.ServerError; // Default to ServerError if no JSON-RPC code
    const message = err.jsonRpcCode ? err.message : // Keep original message for JSON-RPC errors if logging
                    err.code ? err.message.replace(`[${err.code}] `, '') : err.message; // Clean internal code prefix
    return new McpError(
      mcpCode,
      message,
      err.details || { stack: err.stack } // Include stack for debugging
    );
  } else {
    // Handle strings or other unknowns
    return new McpError(
      JsonRpcErrorCode.ServerError,
      typeof error === 'string' ? error : 'An unknown tool execution error occurred',
      { originalError: error }
    );
  }
}

/**
 * Creates an internal error with our custom error codes.
 * Use this for TaskManager internal errors that don't need jsonRpcCode.
 */
export function createInternalError(code: ErrorCode, message: string, details?: unknown): Error {
  const error = new Error(`[${code}] ${message}`);
  (error as any).code = code; // Internal code, NOT jsonRpcCode
  if (details) {
    (error as any).details = details;
  }
  return error;
}

// JSON-RPC Error Codes
export const JsonRpcErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  // -32000 to -32099 is reserved for implementation-defined server errors
  ServerError: -32000
} as const; 