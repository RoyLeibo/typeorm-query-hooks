import { QueryHookPlugin, QueryExecutionContext, RawQueryContext } from '../index';
import { extractTablesFromBuilder, extractTablesFromSQL } from './table-extractor';

/**
 * Options for CacheInvalidationPlugin
 */
export interface CacheInvalidationOptions {
  /**
   * Callback to invalidate cache for specific tables (required)
   * This function should clear your cache (Redis, memory, etc.) for the affected tables
   * 
   * @param tables - Array of table names that were modified
   * @param context - Full query execution context
   * 
   * @example
   * ```typescript
   * onInvalidate: async (tables, context) => {
   *   for (const table of tables) {
   *     await redis.del(`cache:${table}:*`);
   *   }
   * }
   * ```
   */
  onInvalidate: (tables: string[], context: QueryExecutionContext) => void | Promise<void>;
  
  /**
   * Query types that should trigger cache invalidation (default: ['INSERT', 'UPDATE', 'DELETE'])
   * Only these query types will trigger cache invalidation
   * 
   * @example ['INSERT', 'UPDATE'] - Only invalidate on inserts and updates, not deletes
   */
  invalidateOnTypes?: Array<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'select' | 'insert' | 'update' | 'delete'>;
  
  /**
   * Specific tables to monitor for cache invalidation (default: [] - all tables)
   * If empty array, all tables will trigger cache invalidation
   * If provided, only these tables will trigger cache invalidation
   * 
   * @example ['users', 'products'] - Only invalidate cache when users or products are modified
   */
  monitorTables?: string[];
  
  /**
   * Enable console logging for this plugin (default: false)
   * When true, logs cache invalidation events to console
   */
  enableLogging?: boolean;
}

/**
 * Plugin for automatic cache invalidation based on query execution
 * Invalidates cache when INSERT, UPDATE, or DELETE queries are executed
 * 
 * 🔥 Priority: HIGH - Essential for maintaining cache consistency
 * 
 * @example
 * ```typescript
 * import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
 * import { CacheInvalidationPlugin } from 'typeorm-query-hooks/plugins/cache-invalidation';
 * import Redis from 'ioredis';
 * 
 * const redis = new Redis();
 * 
 * enableQueryHooks();
 * 
 * // Basic usage: Invalidate cache for all tables on write operations
 * registerPlugin(CacheInvalidationPlugin({
 *   onInvalidate: async (tables) => {
 *     for (const table of tables) {
 *       await redis.del(`cache:${table}:*`);
 *       console.log(`Cache invalidated for table: ${table}`);
 *     }
 *   }
 * }));
 * 
 * // Advanced: Only invalidate specific tables
 * registerPlugin(CacheInvalidationPlugin({
 *   monitorTables: ['users', 'products', 'orders'],
 *   invalidateOnTypes: ['INSERT', 'UPDATE'], // Don't invalidate on DELETE
 *   enableLogging: true,
 *   onInvalidate: async (tables, context) => {
 *     for (const table of tables) {
 *       await redis.del(`cache:${table}:*`);
 *       // Also invalidate related caches
 *       if (table === 'users') {
 *         await redis.del('cache:user_stats:*');
 *       }
 *     }
 *   }
 * }));
 * ```
 */
export function CacheInvalidationPlugin(options: CacheInvalidationOptions): QueryHookPlugin {
  const {
    onInvalidate,
    invalidateOnTypes = ['INSERT', 'UPDATE', 'DELETE', 'insert', 'update', 'delete'],
    monitorTables = [], // Empty = all tables
    enableLogging = false
  } = options;

  if (!onInvalidate) {
    throw new Error('CacheInvalidationPlugin requires onInvalidate callback');
  }

  return {
    name: 'CacheInvalidation',

    onQueryComplete: async (context: QueryExecutionContext) => {
      const queryType = context.queryType ? String(context.queryType).toUpperCase() : undefined;
      
      // Only invalidate for specified query types
      if (!queryType || !invalidateOnTypes.some(type => type.toUpperCase() === queryType)) {
        return;
      }

      // Extract tables from the query
      const tables = extractTablesFromBuilder(context.builder);
      
      // Filter to monitored tables if specified
      const tablesToInvalidate = monitorTables.length > 0
        ? tables.filter((table: string) => monitorTables.includes(table))
        : tables;

      if (tablesToInvalidate.length === 0) {
        return;
      }

      if (enableLogging) {
        console.log(`[CacheInvalidation] 🗑️  Invalidating cache for tables:`, tablesToInvalidate, {
          queryType,
          method: context.methodName
        });
      }

      try {
        await onInvalidate(tablesToInvalidate, context);
        
        if (enableLogging) {
          console.log(`[CacheInvalidation] ✅ Cache invalidated successfully`);
        }
      } catch (error) {
        console.error(`[CacheInvalidation] ❌ Failed to invalidate cache:`, error);
      }
    },

    // Monitor raw SQL queries for cache invalidation
    onRawQueryComplete: async (context: RawQueryContext & { executionTime: number; result?: any }) => {
      try {
        // Determine query type from SQL
        const sql = context.sql.toUpperCase().trim();
        let queryType: string | undefined;
        
        if (sql.startsWith('INSERT')) {
          queryType = 'INSERT';
        } else if (sql.startsWith('UPDATE')) {
          queryType = 'UPDATE';
        } else if (sql.startsWith('DELETE')) {
          queryType = 'DELETE';
        } else if (sql.startsWith('SELECT')) {
          queryType = 'SELECT';
        }
        
        // Only invalidate for specified query types
        if (!queryType || !invalidateOnTypes.some(type => type.toUpperCase() === queryType)) {
          return;
        }

          // Extract tables from raw SQL
        const tables = extractTablesFromSQL(context.sql);
        
        // Filter to monitored tables if specified
        const tablesToInvalidate = monitorTables.length > 0
          ? tables.filter((table: string) => monitorTables.includes(table))
          : tables;

        if (tablesToInvalidate.length === 0) {
          return;
        }

        if (enableLogging) {
          console.log(`[CacheInvalidation] 🗑️  Invalidating cache for tables (raw SQL):`, tablesToInvalidate, {
            queryType,
            sql: context.sql.substring(0, 100) + '...'
          });
        }

        // Create pseudo-context for callback
        const pseudoContext: QueryExecutionContext = {
          builder: null as any,
          sql: context.sql,
          timestamp: context.timestamp,
          parameters: context.parameters,
          executionTime: context.executionTime,
          methodName: 'query'
        };

        try {
          await onInvalidate(tablesToInvalidate, pseudoContext);
          
          if (enableLogging) {
            console.log(`[CacheInvalidation] ✅ Cache invalidated successfully (raw SQL)`);
          }
        } catch (error) {
          console.error(`[CacheInvalidation] ❌ Failed to invalidate cache (raw SQL):`, error);
        }
      } catch (error) {
        console.error('[CacheInvalidation] Error in onRawQueryComplete:', error);
      }
    }
  };
}




