import { QueryHookPlugin, QueryResultContext } from '../index';
import { extractTablesFromBuilder } from './table-extractor';

/**
 * Options for ResultValidatorPlugin
 */
export interface ResultValidatorOptions {
  /**
   * Threshold for large result set warning (default: 1000 rows)
   */
  largeResultThreshold?: number;
  
  /**
   * Callback when a query returns no results
   */
  onEmptyResult?: (context: QueryResultContext) => void;
  
  /**
   * Callback when a query returns a large result set
   */
  onLargeResult?: (context: QueryResultContext) => void;
  
  /**
   * Table names to monitor for empty results (default: [] - monitors all tables)
   * Provide specific table names to only monitor those tables: ['users', 'orders']
   */
  monitorTables?: string[];
  
  /**
   * Enable console logging for this plugin (default: false)
   * When true, the plugin will log empty results, large results, and general query results to console
   */
  enableLogging?: boolean;
}

/**
 * Plugin for validating and monitoring query results
 * Detects empty results and large result sets
 * 
 * @example
 * ```typescript
 * import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
 * import { ResultValidatorPlugin } from 'typeorm-query-hooks/plugins/result-validator';
 * 
 * enableQueryHooks();
 * 
 * registerPlugin(ResultValidatorPlugin({
 *   largeResultThreshold: 5000,        // custom threshold (default: 1000)
 *   monitorTables: ['users', 'orders'], // specific tables (default: [] = all)
 *   enableLogging: true,                // log to console (default: false)
 *   onEmptyResult: (context) => {
 *     // Alert if critical queries return nothing
 *     console.warn('Empty result detected', {
 *       sql: context.sql.substring(0, 100),
 *       method: context.methodName
 *     });
 *   },
 *   onLargeResult: (context) => {
 *     // Alert on large result sets (pagination needed)
 *     console.warn(`Large result: ${context.rowCount} rows`);
 *   }
 * }));
 * ```
 */
export function ResultValidatorPlugin(options: ResultValidatorOptions = {}): QueryHookPlugin {
  const {
    largeResultThreshold = 1000,
    onEmptyResult,
    onLargeResult,
    monitorTables = [],
    enableLogging = false
  } = options;

  return {
    name: 'ResultValidator',

    onEmptyResult: (context: QueryResultContext) => {
      // Only trigger if result is actually empty
      if (!context.isEmpty) {
        return;
      }

      // Check if this query involves monitored tables
      const tables = extractTablesFromBuilder(context.builder);
      const isMonitored = monitorTables.length === 0 || 
                          tables.some((table: string) => monitorTables.includes(table));

      if (isMonitored && enableLogging) {
        console.warn(`[ResultValidator] ⚠️  Empty result for ${context.methodName}()`, {
          tables,
          sql: context.sql.substring(0, 150) + (context.sql.length > 150 ? '...' : '')
        });
      }

      if (isMonitored && onEmptyResult) {
        onEmptyResult(context);
      }
    },

    onLargeResult: (context: QueryResultContext) => {
      // Check if result exceeds threshold
      if (context.rowCount !== undefined && context.rowCount > largeResultThreshold) {
        if (enableLogging) {
          console.warn(`[ResultValidator] 📊 Large result set detected:`, {
            rowCount: context.rowCount,
            threshold: largeResultThreshold,
            method: context.methodName,
            sql: context.sql.substring(0, 150) + (context.sql.length > 150 ? '...' : ''),
            suggestion: 'Consider adding pagination (take/skip)'
          });
        }

        if (onLargeResult) {
          onLargeResult(context);
        }
      }
    },

    onQueryResult: (context: QueryResultContext) => {
      // General result inspection
      if (enableLogging && context.rowCount !== undefined) {
        console.log(`[ResultValidator] Query returned ${context.rowCount} row(s)`);
      }
    }
  };
}

