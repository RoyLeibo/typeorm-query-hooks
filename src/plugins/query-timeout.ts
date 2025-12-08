import { QueryHookPlugin, QueryExecutionContext } from '../index';

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
   */
  onTimeout?: (context: QueryExecutionContext, timeout: number) => void;
  
  /**
   * Throw error on timeout (default: true)
   * When true, throws error to cancel query
   * When false, just logs warning
   */
  throwOnTimeout?: boolean;
  
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
    throwOnTimeout = true,
    enableLogging = false
  } = options;

  const activeTimeouts = new WeakMap<any, NodeJS.Timeout>();

  return {
    name: 'QueryTimeout',

    onQueryStart: (context: QueryExecutionContext) => {
      // Determine timeout for this query
      let timeout = defaultTimeout;

      // Check type-specific timeout
      if (context.queryType && timeoutByType[context.queryType.toUpperCase()]) {
        timeout = timeoutByType[context.queryType.toUpperCase()];
      }

      // Check table pattern timeout
      const { extractTablesFromBuilder } = require('./table-extractor');
      const tables = extractTablesFromBuilder(context.builder);
      
      for (const [pattern, patternTimeout] of Object.entries(timeoutByTablePattern)) {
        const regex = new RegExp(pattern);
        if (tables.some((table: string) => regex.test(table))) {
          timeout = patternTimeout;
          break;
        }
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
            console.error('[QueryTimeout] onTimeout callback failed:', error);
          }
        }

        if (throwOnTimeout) {
          throw new Error(`Query timeout: exceeded ${timeout}ms`);
        }
      }, timeout);

      activeTimeouts.set(context.builder, timeoutHandle);
    },

    onQueryComplete: (context: QueryExecutionContext) => {
      const timeoutHandle = activeTimeouts.get(context.builder);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        activeTimeouts.delete(context.builder);
      }
    },

    onQueryError: (context) => {
      const timeoutHandle = activeTimeouts.get(context.builder);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        activeTimeouts.delete(context.builder);
      }
    }
  };
}

