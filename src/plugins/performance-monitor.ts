import { QueryHookPlugin, QueryExecutionContext, RawQueryContext } from '../index';

/**
 * Options for PerformanceMonitorPlugin
 */
export interface PerformanceMonitorOptions {
  /**
   * Threshold in milliseconds for slow query detection (default: 500)
   */
  slowQueryThreshold?: number;
  
  /**
   * Callback when a slow query is detected
   */
  onSlowQuery?: (context: QueryExecutionContext) => void;
  
  /**
   * Callback for all query completions (for custom metrics)
   */
  onMetric?: (context: QueryExecutionContext) => void;
  
  /**
   * Enable console logging for this plugin (default: false)
   * When true, the plugin will log query completions, slow queries, and errors to console
   */
  enableLogging?: boolean;
}

/**
 * Plugin for monitoring query performance
 * Tracks execution time and detects slow queries
 * 
 * @example
 * ```typescript
 * import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
 * import { PerformanceMonitorPlugin } from 'typeorm-query-hooks/plugins/performance-monitor';
 * 
 * enableQueryHooks();
 * 
 * registerPlugin(PerformanceMonitorPlugin({
 *   slowQueryThreshold: 300,  // custom threshold (default: 500ms)
 *   enableLogging: true,      // log to console (default: false)
 *   onSlowQuery: (context) => {
 *     console.warn(`Slow query detected: ${context.executionTime}ms`, {
 *       sql: context.sql.substring(0, 200)
 *     });
 *   }
 * }));
 * ```
 */
export function PerformanceMonitorPlugin(options: PerformanceMonitorOptions = {}): QueryHookPlugin {
  const {
    slowQueryThreshold = 500, // default 500ms
    onSlowQuery,
    onMetric,
    enableLogging = false
  } = options;

  return {
    name: 'PerformanceMonitor',

    onQueryComplete: (context: QueryExecutionContext) => {
      if (enableLogging) {
        console.log(`[PerformanceMonitor] Query completed in ${context.executionTime}ms`);
      }

      // Call custom metric callback
      if (onMetric) {
        onMetric(context);
      }

      // Check if this is a slow query based on threshold
      if (context.executionTime && context.executionTime > slowQueryThreshold) {
        if (enableLogging) {
          console.warn(`[PerformanceMonitor] 🐌 SLOW QUERY (${context.executionTime}ms):`, {
            method: context.methodName,
            sql: context.sql.substring(0, 200) + (context.sql.length > 200 ? '...' : ''),
            threshold: `${slowQueryThreshold}ms`
          });
        }

        // Call custom slow query callback
        if (onSlowQuery) {
          onSlowQuery(context);
        }
      }
    },

    onQueryError: (context) => {
      if (enableLogging) {
        console.error(`[PerformanceMonitor] ❌ Query failed after ${context.executionTime}ms:`, {
          error: context.error.message,
          sql: context.sql.substring(0, 200)
        });
      }
    },

    // Monitor raw SQL queries
    onRawQueryComplete: (context: RawQueryContext & { executionTime: number }) => {
      try {
        if (enableLogging) {
          console.log(`[PerformanceMonitor] Raw SQL completed in ${context.executionTime}ms`);
        }

        // Create a pseudo-context for callbacks
        const pseudoContext: QueryExecutionContext = {
          builder: null as any,
          sql: context.sql,
          timestamp: context.timestamp,
          parameters: context.parameters,
          executionTime: context.executionTime,
          methodName: 'query' // Raw SQL via dataSource.query()
        };

        // Call custom metric callback
        if (onMetric) {
          onMetric(pseudoContext);
        }

        // Check if this is a slow query based on threshold
        if (context.executionTime > slowQueryThreshold) {
          if (enableLogging) {
            console.warn(`[PerformanceMonitor] 🐌 SLOW RAW SQL (${context.executionTime}ms):`, {
              sql: context.sql.substring(0, 200) + (context.sql.length > 200 ? '...' : ''),
              threshold: `${slowQueryThreshold}ms`
            });
          }

          // Call custom slow query callback
          if (onSlowQuery) {
            onSlowQuery(pseudoContext);
          }
        }
      } catch (error) {
        console.error('[PerformanceMonitor] Error in onRawQueryComplete:', error);
      }
    },

    onRawQueryError: (context: RawQueryContext & { error: Error }) => {
      try {
        if (enableLogging) {
          console.error(`[PerformanceMonitor] ❌ Raw SQL failed:`, {
            error: context.error.message,
            sql: context.sql.substring(0, 200)
          });
        }
      } catch (error) {
        console.error('[PerformanceMonitor] Error in onRawQueryError:', error);
      }
    }
  };
}

