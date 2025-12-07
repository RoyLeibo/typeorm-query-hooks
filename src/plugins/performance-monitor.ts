import { QueryHookPlugin, QueryExecutionContext } from '../index';

/**
 * Options for PerformanceMonitorPlugin
 */
export interface PerformanceMonitorOptions {
  /**
   * Threshold in milliseconds for slow query detection (default: 1000)
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
   * Enable console logging (default: false)
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
 * enableQueryHooks({ slowQueryThreshold: 500 });
 * 
 * registerPlugin(PerformanceMonitorPlugin({
 *   slowQueryThreshold: 500,
 *   enableLogging: true,
 *   onSlowQuery: (context) => {
 *     console.warn(`Slow query detected: ${context.executionTime}ms`, {
 *       sql: context.sql.substring(0, 200),
 *       tables: context.tables
 *     });
 *   }
 * }));
 * ```
 */
export function PerformanceMonitorPlugin(options: PerformanceMonitorOptions = {}): QueryHookPlugin {
  const {
    slowQueryThreshold = 1000,
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
    }
  };
}

