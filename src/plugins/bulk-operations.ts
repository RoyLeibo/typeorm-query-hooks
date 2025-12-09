import { QueryHookPlugin, QueryResultContext } from '../index';
import { extractTablesFromBuilder } from './table-extractor';

/**
 * Options for BulkOperationsPlugin
 */
export interface BulkOperationsOptions {
  /**
   * Threshold for considering an operation "bulk" (default: 100 rows)
   * Operations affecting more than this many rows will trigger the onBulkOperation callback
   */
  bulkThreshold?: number;
  
  /**
   * Callback when a bulk operation is detected (optional)
   * 
   * @param context - Query result context with row count
   * @param affectedRows - Number of rows affected
   * 
   * @example
   * ```typescript
   * onBulkOperation: (context, affectedRows) => {
   *   logger.warn(`Bulk operation: ${affectedRows} rows affected`, {
   *     tables: extractTablesFromBuilder(context.builder)
   *   });
   * }
   * ```
   */
  onBulkOperation?: (context: QueryResultContext, affectedRows: number) => void | Promise<void>;
  
  /**
   * Specific tables to monitor for bulk operations (default: [] - all tables)
   * If empty array, all tables will be monitored
   * If provided, only these tables will trigger bulk operation detection
   * 
   * @example ['users', 'products'] - Only monitor bulk operations on users and products
   */
  monitorTables?: string[];
  
  /**
   * Query types to monitor (default: ['INSERT', 'UPDATE', 'DELETE'])
   * Only these query types will be checked for bulk operations
   */
  monitorTypes?: Array<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'select' | 'insert' | 'update' | 'delete'>;
  
  /**
   * Warn on bulk operations (default: true)
   * When true, console.warn will be called for bulk operations
   */
  warnOnBulk?: boolean;
  
  /**
   * Enable console logging for this plugin (default: false)
   * When true, logs all monitored operations (not just bulk) to console
   */
  enableLogging?: boolean;
}

/**
 * Plugin for detecting and monitoring bulk database operations
 * Alerts when operations affect a large number of rows
 * 
 * 🟡 Priority: MEDIUM - Useful for preventing accidental bulk operations
 * 
 * @example
 * ```typescript
 * import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
 * import { BulkOperationsPlugin } from 'typeorm-query-hooks/plugins/bulk-operations';
 * 
 * enableQueryHooks();
 * 
 * // Basic usage: Warn on operations affecting > 100 rows
 * registerPlugin(BulkOperationsPlugin({
 *   bulkThreshold: 100,
 *   warnOnBulk: true
 * }));
 * 
 * // Advanced: Monitor specific tables with custom threshold
 * registerPlugin(BulkOperationsPlugin({
 *   bulkThreshold: 50,
 *   monitorTables: ['users', 'orders'],
 *   monitorTypes: ['UPDATE', 'DELETE'], // Don't monitor INSERTs
 *   warnOnBulk: true,
 *   enableLogging: true,
 *   onBulkOperation: async (context, affectedRows) => {
 *     const tables = extractTablesFromBuilder(context.builder);
 *     
 *     // Send alert to monitoring service
 *     await monitoring.alert({
 *       type: 'bulk_operation',
 *       severity: affectedRows > 1000 ? 'high' : 'medium',
 *       tables,
 *       rowsAffected: affectedRows,
 *       query: context.sql.substring(0, 200)
 *     });
 *     
 *     // Log to audit trail
 *     logger.warn(`Bulk operation detected: ${affectedRows} rows affected`, {
 *       tables,
 *       queryType: context.queryType
 *     });
 *   }
 * }));
 * 
 * // Safety: Block bulk DELETEs in production
 * registerPlugin(BulkOperationsPlugin({
 *   bulkThreshold: 10, // Very low threshold for DELETEs
 *   monitorTypes: ['DELETE'],
 *   warnOnBulk: true,
 *   onBulkOperation: (context, affectedRows) => {
 *     if (process.env.NODE_ENV === 'production') {
 *       throw new Error(`Bulk DELETE blocked in production: ${affectedRows} rows`);
 *     }
 *   }
 * }));
 * ```
 */
export function BulkOperationsPlugin(options: BulkOperationsOptions = {}): QueryHookPlugin {
  const {
    bulkThreshold = 100,
    onBulkOperation,
    monitorTables = [], // Empty = all tables
    monitorTypes = ['INSERT', 'UPDATE', 'DELETE', 'insert', 'update', 'delete'],
    warnOnBulk = true,
    enableLogging = false
  } = options;

  return {
    name: 'BulkOperations',

    onQueryResult: async (context: QueryResultContext) => {
      const queryType = context.queryType ? String(context.queryType).toUpperCase() : undefined;
      
      // Only monitor specified query types
      if (!queryType || !monitorTypes.some(type => type.toUpperCase() === queryType)) {
        return;
      }

      // Get affected row count
      const affectedRows = context.rowCount;
      
      if (affectedRows === undefined || affectedRows === null) {
        return;
      }

      // Extract tables from the query
      const tables = extractTablesFromBuilder(context.builder);
      
      // Filter to monitored tables if specified
      const tablesToCheck = monitorTables.length > 0
        ? tables.filter((table: string) => monitorTables.includes(table))
        : tables;

      if (tablesToCheck.length === 0) {
        return;
      }

      if (enableLogging) {
        console.log(`[BulkOperations] ${queryType} affected ${affectedRows} rows on tables:`, tablesToCheck);
      }

      // Check if this is a bulk operation
      if (affectedRows > bulkThreshold) {
        if (warnOnBulk) {
          console.warn(
            `[BulkOperations] ⚠️  BULK OPERATION DETECTED:`,
            {
              queryType,
              affectedRows,
              threshold: bulkThreshold,
              tables: tablesToCheck,
              method: context.methodName,
              sqlPreview: context.sql.substring(0, 150) + (context.sql.length > 150 ? '...' : '')
            }
          );
        }

        if (onBulkOperation) {
          try {
            await onBulkOperation(context, affectedRows);
          } catch (error) {
            console.error(`[BulkOperations] ❌ onBulkOperation callback failed:`, error);
            throw error; // Re-throw to allow blocking bulk operations
          }
        }
      }
    }
  };
}


