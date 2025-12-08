import { QueryHookPlugin, QueryHookContext, QueryExecutionContext } from '../index';
import * as path from 'path';

/**
 * Source location information
 */
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  function?: string;
  relativePath: string;
}

/**
 * Extended context with source location
 */
export interface QueryContextWithSource extends QueryHookContext {
  sourceLocation?: SourceLocation;
  stackTrace?: string;
}

/**
 * Options for QuerySourceTracerPlugin
 */
export interface QuerySourceTracerOptions {
  /**
   * Base path to filter stack traces (default: process.cwd())
   * Only show stack frames from this directory
   * 
   * @example '/src' - Only show files from src directory
   * @example process.cwd() + '/app' - Only show files from app directory
   */
  basePath?: string;
  
  /**
   * Attach source location to query context (default: true)
   * Makes context.sourceLocation available to other plugins
   */
  attachToQueryContext?: boolean;
  
  /**
   * Include full stack trace (default: false)
   * When true, includes complete stack trace, not just the source location
   */
  includeFullStackTrace?: boolean;
  
  /**
   * Paths to ignore in stack traces (default: ['node_modules'])
   * Patterns to exclude from stack trace analysis
   * 
   * @example ['node_modules', 'dist', '.webpack']
   */
  ignorePaths?: string[];
  
  /**
   * Callback when query is logged with source information (optional)
   * 
   * @param context - Query context with source location
   * @param location - Parsed source location
   * 
   * @example
   * ```typescript
   * onQueryLogged: (context, location) => {
   *   logger.info(`Query from ${location.relativePath}:${location.line}`);
   * }
   * ```
   */
  onQueryLogged?: (context: QueryContextWithSource, location: SourceLocation) => void;
  
  /**
   * Enable console logging for this plugin (default: false)
   * When true, logs source location for every query
   */
  enableLogging?: boolean;
}

/**
 * Plugin for tracing query source location in your code
 * Answers the question: "Which line of code executed this query?"
 * 
 * 🎯 Solves: TypeORM's default logger shows SQL but not WHERE in your code it came from
 * 
 * **The Problem:**
 * You see a slow query in logs: `SELECT * FROM users WHERE email = '...'`
 * You have 50 places querying users. Which one is slow? You don't know!
 * 
 * **The Solution:**
 * Captures stack trace when query is built and shows the exact file:line that caused it
 * 
 * @example
 * ```typescript
 * import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
 * import { QuerySourceTracerPlugin } from 'typeorm-query-hooks/plugins/query-source-tracer';
 * 
 * enableQueryHooks();
 * 
 * // Basic usage: Show source for all queries
 * registerPlugin(QuerySourceTracerPlugin({
 *   basePath: process.cwd() + '/src', // Only show files from src/
 *   enableLogging: true
 * }));
 * 
 * // Now your logs show:
 * // Query: SELECT * FROM users WHERE email = ?
 * // Source: src/services/UserService.ts:45:12 in UserService.findByEmail
 * 
 * // Advanced: Integrate with slow query detection
 * registerPlugin(QuerySourceTracerPlugin({
 *   basePath: '/src',
 *   attachToQueryContext: true,
 *   onQueryLogged: (context, location) => {
 *     // Available to other plugins via context.sourceLocation
 *     if (context.executionTime && context.executionTime > 1000) {
 *       logger.error('Slow query detected:', {
 *         duration: context.executionTime,
 *         sql: context.sql.substring(0, 100),
 *         source: `${location.relativePath}:${location.line}`,
 *         function: location.function
 *       });
 *     }
 *   }
 * }));
 * 
 * // Combine with PerformanceMonitor:
 * registerPlugin(PerformanceMonitorPlugin({
 *   onSlowQuery: (context) => {
 *     const source = (context as QueryContextWithSource).sourceLocation;
 *     console.error(`Slow query in ${source?.relativePath}:${source?.line}`);
 *   }
 * }));
 * ```
 */
export function QuerySourceTracerPlugin(options: QuerySourceTracerOptions = {}): QueryHookPlugin {
  const {
    basePath = process.cwd(),
    attachToQueryContext = true,
    includeFullStackTrace = false,
    ignorePaths = ['node_modules'],
    onQueryLogged,
    enableLogging = false
  } = options;

  /**
   * Parse stack trace to find source location
   */
  function parseStackTrace(stack: string): SourceLocation | null {
    const lines = stack.split('\n');
    
    for (const line of lines) {
      // Skip lines that should be ignored
      if (ignorePaths.some(ignorePath => line.includes(ignorePath))) {
        continue;
      }

      // Skip typeorm-query-hooks internal files
      if (line.includes('typeorm-query-hooks') || line.includes('typeorm/')) {
        continue;
      }

      // Parse stack line format: "at FunctionName (path/to/file.ts:line:column)"
      // or: "at path/to/file.ts:line:column"
      const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
      
      if (match) {
        const functionName = match[1]?.trim();
        const file = match[2];
        const lineNum = parseInt(match[3], 10);
        const column = parseInt(match[4], 10);

        // Check if file is within basePath
        if (file.includes(basePath) || path.isAbsolute(file)) {
          const relativePath = file.includes(basePath)
            ? path.relative(basePath, file)
            : file;

          return {
            file,
            line: lineNum,
            column,
            function: functionName,
            relativePath
          };
        }
      }
    }

    return null;
  }

  /**
   * Capture current stack trace
   */
  function captureStackTrace(): string {
    const error = new Error();
    Error.captureStackTrace(error, captureStackTrace);
    return error.stack || '';
  }

  return {
    name: 'QuerySourceTracer',

    onQueryBuild: (context: QueryHookContext) => {
      const stack = captureStackTrace();
      const location = parseStackTrace(stack);

      if (location) {
        // Attach to context for other plugins
        if (attachToQueryContext) {
          (context as QueryContextWithSource).sourceLocation = location;
          if (includeFullStackTrace) {
            (context as QueryContextWithSource).stackTrace = stack;
          }
        }

        // Log if enabled
        if (enableLogging) {
          console.log(
            `[QuerySourceTracer] 📍 Query Source:\n` +
            `  File: ${location.relativePath}\n` +
            `  Line: ${location.line}:${location.column}\n` +
            (location.function ? `  Function: ${location.function}\n` : '') +
            `  SQL: ${context.sql.substring(0, 100)}${context.sql.length > 100 ? '...' : ''}`
          );
        }

        // Call custom callback
        if (onQueryLogged) {
          try {
            onQueryLogged(context as QueryContextWithSource, location);
          } catch (error) {
            console.error('[QuerySourceTracer] onQueryLogged callback failed:', error);
          }
        }
      } else if (enableLogging) {
        console.log('[QuerySourceTracer] ⚠️  Could not determine query source');
      }
    },

    onEnable: () => {
      if (enableLogging) {
        console.log('[QuerySourceTracer] 📍 Query source tracing enabled', {
          basePath,
          ignorePaths
        });
      }
    }
  };
}

/**
 * Helper to format source location for logging
 */
export function formatSourceLocation(location: SourceLocation | undefined): string {
  if (!location) return 'Unknown';
  
  return `${location.relativePath}:${location.line}:${location.column}` +
    (location.function ? ` in ${location.function}` : '');
}

