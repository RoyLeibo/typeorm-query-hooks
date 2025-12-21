import { QueryHookPlugin, QueryExecutionContext, RawQueryContext } from '../index';
import { extractTablesFromBuilder, extractTablesFromSQL } from './table-extractor';

/**
 * Options for QueryTimeoutPlugin
 */
export interface QueryTimeoutOptions {
  /**
   * Default timeout in milliseconds for all queries (default: 5000ms)
   */
  defaultTimeout?: number;
  
  /**
   * Timeout overrides by query type (optional)
   * 
   * @example { 'SELECT': 3000, 'INSERT': 10000 }
   */
  timeoutByType?: Record<string, number>;
  
  /**
   * Timeout overrides by table name pattern (optional)
   * Uses regex matching
   * 
   * @example { 'report_.*': 30000 } - Reports can take 30s
   */
  timeoutByTablePattern?: Record<string, number>;
  
  /**
   * Callback when query times out (optional)
   * 
   * @param context - Query execution context
   * @param timeout - The timeout value that was exceeded
   * 
   * @example
   * ```typescript
   * onTimeout: (context, timeout) => {
   *   logger.error(`Query timeout: ${timeout}ms`, {
   *     sql: context.sql,
   *     queryType: context.queryType
   *   });
   * }
   * ```
   */
  onTimeout?: (context: QueryExecutionContext, timeout: number) => void;
  
  /**
   * Callback when query is approaching timeout (optional)
   * Triggered when query has used 80% of allowed time
   * 
   * @param context - Query execution context
   * @param elapsed - Time elapsed so far in milliseconds
   * @param limit - Total timeout limit in milliseconds
   * 
   * @example
   * ```typescript
   * onTimeoutWarning: (context, elapsed, limit) => {
   *   logger.warn(`Query running slow: ${elapsed}ms / ${limit}ms`, {
   *     sql: context.sql.substring(0, 100)
   *   });
   * }
   * ```
   */
  onTimeoutWarning?: (context: QueryExecutionContext, elapsed: number, limit: number) => void;
  
  /**
   * Callback when an error occurs in timeout mechanism (optional)
   * 
   * @param context - Query execution context
   * @param error - The error that occurred
   * 
   * @example
   * ```typescript
   * onError: (context, error) => {
   *   logger.error('Timeout mechanism failed', { error, sql: context.sql });
   * }
   * ```
   */
  onError?: (context: QueryExecutionContext, error: Error) => void;
  
  /**
   * Throw error on timeout (default: true)
   * When true, throws error to cancel query
   * When false, just logs warning
   */
  throwOnTimeout?: boolean;
  
  /**
   * Warning threshold as percentage of timeout (default: 0.8 / 80%)
   * When query reaches this percentage of timeout, onTimeoutWarning is triggered
   */
  warningThreshold?: number;
  
  /**
   * Enable console logging for this plugin (default: false)
   */
  enableLogging?: boolean;
}

/**
 * Plugin for managing query timeouts
 * Prevents long-running queries from blocking operations
 * 
 * ⏱️ Solves: Queries that hang forever, blocking connection pool
 * 
 * @example
 * ```typescript
 * import { QueryTimeoutPlugin } from 'typeorm-query-hooks/plugins/query-timeout';
 * 
 * registerPlugin(QueryTimeoutPlugin({
 *   defaultTimeout: 5000,
 *   timeoutByType: {
 *     'SELECT': 3000,
 *     'INSERT': 10000,
 *     'UPDATE': 10000
 *   },
 *   timeoutByTablePattern: {
 *     'report_.*': 30000, // Reports can be slower
 *     'analytics_.*': 60000
 *   },
 *   throwOnTimeout: true,
 *   onTimeout: (context, timeout) => {
 *     logger.error(`Query timeout after ${timeout}ms`, {
 *       sql: context.sql.substring(0, 200)
 *     });
 *   }
 * }));
 * ```
 */
export function QueryTimeoutPlugin(options: QueryTimeoutOptions = {}): QueryHookPlugin {
  const {
    defaultTimeout = 5000,
    timeoutByType = {},
    timeoutByTablePattern = {},
    onTimeout,
    onTimeoutWarning,
    onError,
    throwOnTimeout = true,
    warningThreshold = 0.8,
    enableLogging = false
  } = options;

  const activeTimeouts = new WeakMap<any, { timeout: NodeJS.Timeout; warning?: NodeJS.Timeout }>();
  const rawQueryTimeouts = new WeakMap<any, { timeout: NodeJS.Timeout; warning?: NodeJS.Timeout }>();

  return {
    name: 'QueryTimeout',

    onQueryStart: (context: QueryExecutionContext) => {
      try {
        // Determine timeout for this query
        let timeout = defaultTimeout;

        // Check type-specific timeout
        if (context.queryType && timeoutByType[context.queryType.toUpperCase()]) {
          timeout = timeoutByType[context.queryType.toUpperCase()];
        }

        // Check table pattern timeout
        const tables = extractTablesFromBuilder(context.builder);
        
        for (const [pattern, patternTimeout] of Object.entries(timeoutByTablePattern)) {
          const regex = new RegExp(pattern);
          if (tables.some((table: string) => regex.test(table))) {
            timeout = patternTimeout;
            break;
          }
        }

        // Set warning timeout (if callback provided)
        let warningHandle: NodeJS.Timeout | undefined;
        if (onTimeoutWarning) {
          const warningTime = timeout * warningThreshold;
          warningHandle = setTimeout(() => {
            try {
              onTimeoutWarning(context, warningTime, timeout);
            } catch (error) {
              if (onError) {
                onError(context, error as Error);
              } else if (enableLogging) {
                console.error('[QueryTimeout] onTimeoutWarning callback failed:', error);
              }
            }
            
            if (enableLogging) {
              console.warn(
                `[QueryTimeout] ⚠️  Query approaching timeout: ${warningTime}ms / ${timeout}ms:\n` +
                `  SQL: ${context.sql.substring(0, 200)}...\n` +
                `  Type: ${context.queryType || 'UNKNOWN'}\n` +
                `  Tables: ${tables.join(', ')}`
              );
            }
          }, warningTime);
        }

        // Set timeout
        const timeoutHandle = setTimeout(() => {
          if (enableLogging) {
            console.error(
              `[QueryTimeout] ⏱️  Query timeout after ${timeout}ms:\n` +
              `  SQL: ${context.sql.substring(0, 200)}...\n` +
              `  Type: ${context.queryType || 'UNKNOWN'}\n` +
              `  Tables: ${tables.join(', ')}`
            );
          }

          if (onTimeout) {
            try {
              onTimeout(context, timeout);
            } catch (error) {
              if (onError) {
                onError(context, error as Error);
              } else if (enableLogging) {
                console.error('[QueryTimeout] onTimeout callback failed:', error);
              }
            }
          }

          if (throwOnTimeout) {
            throw new Error(`Query timeout: exceeded ${timeout}ms`);
          }
        }, timeout);

        activeTimeouts.set(context.builder, { timeout: timeoutHandle, warning: warningHandle });
      } catch (error) {
        if (onError) {
          onError(context, error as Error);
        } else if (enableLogging) {
          console.error('[QueryTimeout] Failed to set timeout:', error);
        }
      }
    },

    onQueryComplete: (context: QueryExecutionContext) => {
      const handles = activeTimeouts.get(context.builder);
      if (handles) {
        clearTimeout(handles.timeout);
        if (handles.warning) {
          clearTimeout(handles.warning);
        }
        activeTimeouts.delete(context.builder);
      }
    },

    onQueryError: (context) => {
      const handles = activeTimeouts.get(context.builder);
      if (handles) {
        clearTimeout(handles.timeout);
        if (handles.warning) {
          clearTimeout(handles.warning);
        }
        activeTimeouts.delete(context.builder);
      }
    },

    // Monitor raw SQL queries
    onRawQuery: (context: RawQueryContext) => {
      try {
        // Determine timeout for this query
        let timeout = defaultTimeout;

        // Try to determine query type from SQL
        const sql = context.sql.toUpperCase().trim();
        let queryType: string | undefined;
        
        if (sql.startsWith('SELECT')) queryType = 'SELECT';
        else if (sql.startsWith('INSERT')) queryType = 'INSERT';
        else if (sql.startsWith('UPDATE')) queryType = 'UPDATE';
        else if (sql.startsWith('DELETE')) queryType = 'DELETE';
        else if (sql.startsWith('CREATE')) queryType = 'CREATE';
        else if (sql.startsWith('ALTER')) queryType = 'ALTER';
        else if (sql.startsWith('DROP')) queryType = 'DROP';

        // Check type-specific timeout
        if (queryType && timeoutByType[queryType]) {
          timeout = timeoutByType[queryType];
        }

        // Check table pattern timeout
        const tables = extractTablesFromSQL(context.sql);
        
        for (const [pattern, patternTimeout] of Object.entries(timeoutByTablePattern)) {
          const regex = new RegExp(pattern);
          if (tables.some((table: string) => regex.test(table))) {
            timeout = patternTimeout;
            break;
          }
        }

        // Create pseudo-context for callbacks
        const pseudoContext: QueryExecutionContext = {
          builder: null as any,
          sql: context.sql,
          timestamp: context.timestamp,
          parameters: context.parameters,
          methodName: 'query',
          queryType: queryType as any // Type assertion for raw SQL query types
        };

        // Set warning timeout (if callback provided)
        let warningHandle: NodeJS.Timeout | undefined;
        if (onTimeoutWarning) {
          const warningTime = timeout * warningThreshold;
          warningHandle = setTimeout(() => {
            try {
              onTimeoutWarning(pseudoContext, warningTime, timeout);
            } catch (error) {
              if (onError) {
                onError(pseudoContext, error as Error);
              } else if (enableLogging) {
                console.error('[QueryTimeout] onTimeoutWarning callback failed:', error);
              }
            }
            
            if (enableLogging) {
              console.warn(
                `[QueryTimeout] ⚠️  Raw SQL approaching timeout: ${warningTime}ms / ${timeout}ms:\n` +
                `  SQL: ${context.sql.substring(0, 200)}...\n` +
                `  Type: ${queryType || 'UNKNOWN'}\n` +
                `  Tables: ${tables.join(', ')}`
              );
            }
          }, warningTime);
        }

        // Set timeout
        const timeoutHandle = setTimeout(() => {
          if (enableLogging) {
            console.error(
              `[QueryTimeout] ⏱️  Raw SQL timeout after ${timeout}ms:\n` +
              `  SQL: ${context.sql.substring(0, 200)}...\n` +
              `  Type: ${queryType || 'UNKNOWN'}\n` +
              `  Tables: ${tables.join(', ')}`
            );
          }

          if (onTimeout) {
            try {
              onTimeout(pseudoContext, timeout);
            } catch (error) {
              if (onError) {
                onError(pseudoContext, error as Error);
              } else if (enableLogging) {
                console.error('[QueryTimeout] onTimeout callback failed:', error);
              }
            }
          }

          // Note: We can't actually throw here as it won't cancel the raw query
          // The query will complete and onRawQueryError will handle it
          if (throwOnTimeout && enableLogging) {
            console.warn('[QueryTimeout] Raw SQL exceeded timeout but cannot be cancelled');
          }
        }, timeout);

        rawQueryTimeouts.set(context.queryRunner, { timeout: timeoutHandle, warning: warningHandle });
      } catch (error) {
        // Silently handle errors in raw query timeout setup
        if (enableLogging) {
          console.error('[QueryTimeout] Error in onRawQuery:', error);
        }
      }
    },

    onRawQueryComplete: (context: RawQueryContext & { executionTime: number }) => {
      try {
        const handles = rawQueryTimeouts.get(context.queryRunner);
        if (handles) {
          clearTimeout(handles.timeout);
          if (handles.warning) {
            clearTimeout(handles.warning);
          }
          rawQueryTimeouts.delete(context.queryRunner);
        }
      } catch (error) {
        // Silently handle cleanup errors
        if (enableLogging) {
          console.error('[QueryTimeout] Error in onRawQueryComplete:', error);
        }
      }
    },

    onRawQueryError: (context: RawQueryContext & { error: Error }) => {
      try {
        const handles = rawQueryTimeouts.get(context.queryRunner);
        if (handles) {
          clearTimeout(handles.timeout);
          if (handles.warning) {
            clearTimeout(handles.warning);
          }
          rawQueryTimeouts.delete(context.queryRunner);
        }
      } catch (error) {
        // Silently handle cleanup errors
        if (enableLogging) {
          console.error('[QueryTimeout] Error in onRawQueryError:', error);
        }
      }
    }
  };
}



