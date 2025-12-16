import { QueryHookPlugin, PreQueryContext } from '../index';
import { extractTablesFromBuilder } from './table-extractor';

/**
 * Options for QueryModifierPlugin
 */
export interface QueryModifierOptions {
  /**
   * Callback to modify SQL before execution
   * Return modified SQL or undefined to keep original
   */
  modifySql?: (context: PreQueryContext) => string | undefined | void;
  
  /**
   * Callback to modify parameters before execution
   * Return modified parameters or undefined to keep original
   */
  modifyParameters?: (context: PreQueryContext) => any[] | undefined | void;
  
  /**
   * Callback to decide if query should be executed
   * Return false to cancel the query
   */
  shouldExecute?: (context: PreQueryContext) => boolean;
  
  /**
   * Callback when SQL was modified (optional)
   * Triggered after modifySql changes the query
   * 
   * @param context - Query context
   * @param originalSql - Original SQL before modification
   * @param newSql - Modified SQL
   * 
   * @example
   * ```typescript
   * onSqlModified: (context, originalSql, newSql) => {
   *   logger.info('SQL modified', {
   *     original: originalSql.substring(0, 100),
   *     modified: newSql.substring(0, 100)
   *   });
   * }
   * ```
   */
  onSqlModified?: (context: PreQueryContext, originalSql: string, newSql: string) => void;
  
  /**
   * Callback when parameters were modified (optional)
   * Triggered after modifyParameters changes the params
   * 
   * @param context - Query context
   * @param originalParams - Original parameters before modification
   * @param newParams - Modified parameters
   * 
   * @example
   * ```typescript
   * onParametersModified: (context, originalParams, newParams) => {
   *   logger.info('Parameters modified', {
   *     originalCount: originalParams.length,
   *     newCount: newParams.length
   *   });
   * }
   * ```
   */
  onParametersModified?: (context: PreQueryContext, originalParams: any[], newParams: any[]) => void;
  
  /**
   * Callback when an error occurs during modification (optional)
   * 
   * @param context - Query context
   * @param error - The error that occurred
   * 
   * @example
   * ```typescript
   * onError: (context, error) => {
   *   logger.error('Query modification failed', { error, sql: context.sql });
   * }
   * ```
   */
  onError?: (context: PreQueryContext, error: Error) => void;
  
  /**
   * Enable console logging (default: false)
   */
  enableLogging?: boolean;
}

/**
 * Plugin for modifying queries before execution
 * Allows dynamic SQL transformation, parameter modification, and query cancellation
 * 
 * @example
 * ```typescript
 * import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
 * import { QueryModifierPlugin } from 'typeorm-query-hooks/plugins/query-modifier';
 * 
 * enableQueryHooks();
 * 
 * // Example 1: Add query hints for optimization
 * registerPlugin(QueryModifierPlugin({
 *   modifySql: (context) => {
 *     if (context.sql.includes('SELECT') && context.sql.includes('users')) {
 *       // Add index hint
 *       return context.sql.replace('FROM users', 'FROM users USE INDEX (idx_email)');
 *     }
 *   }
 * }));
 * 
 * // Example 2: Inject tenant filtering for multi-tenancy
 * registerPlugin(QueryModifierPlugin({
 *   modifySql: (context) => {
 *     const tenantId = getCurrentTenantId(); // Your tenant context
 *     if (context.sql.includes('SELECT') && context.sql.includes('FROM orders')) {
 *       const modified = context.sql.replace(
 *         'FROM orders',
 *         `FROM orders WHERE tenant_id = ${tenantId}`
 *       );
 *       return modified;
 *     }
 *   },
 *   enableLogging: true
 * }));
 * 
 * // Example 3: Block dangerous queries in production
 * registerPlugin(QueryModifierPlugin({
 *   shouldExecute: (context) => {
 *     if (process.env.NODE_ENV === 'production') {
 *       // Block DELETE without WHERE clause
 *       if (context.sql.match(/DELETE\s+FROM\s+\w+\s*$/i)) {
 *         console.error('Blocked: DELETE without WHERE clause');
 *         return false;
 *       }
 *     }
 *     return true;
 *   }
 * }));
 * ```
 */
export function QueryModifierPlugin(options: QueryModifierOptions = {}): QueryHookPlugin {
  const {
    modifySql,
    modifyParameters,
    shouldExecute,
    onSqlModified,
    onParametersModified,
    onError,
    enableLogging = false
  } = options;

  return {
    name: 'QueryModifier',

    onBeforeQuery: (context: PreQueryContext) => {
      try {
        // Check if query should be executed
        if (shouldExecute) {
          try {
            const shouldRun = shouldExecute(context);
            if (!shouldRun) {
              if (enableLogging) {
                console.warn('[QueryModifier] 🚫 Query execution blocked by shouldExecute callback');
              }
              return false;
            }
          } catch (error) {
            if (onError) {
              onError(context, error as Error);
            } else if (enableLogging) {
              console.error('[QueryModifier] shouldExecute callback failed:', error);
            }
            throw error;
          }
        }

        // Modify SQL
        if (modifySql) {
          try {
            const originalSql = context.sql;
            const newSql = modifySql(context);
            if (newSql && newSql !== originalSql) {
              context.setSql(newSql);
              
              // Trigger onSqlModified callback
              if (onSqlModified) {
                try {
                  onSqlModified(context, originalSql, newSql);
                } catch (error) {
                  if (onError) {
                    onError(context, error as Error);
                  } else if (enableLogging) {
                    console.error('[QueryModifier] onSqlModified callback failed:', error);
                  }
                }
              }
              
              if (enableLogging) {
                console.log('[QueryModifier] ✏️  SQL modified:', {
                  original: originalSql.substring(0, 100) + '...',
                  modified: newSql.substring(0, 100) + '...'
                });
              }
            }
          } catch (error) {
            if (onError) {
              onError(context, error as Error);
            } else if (enableLogging) {
              console.error('[QueryModifier] modifySql callback failed:', error);
            }
            throw error;
          }
        }

        // Modify parameters
        if (modifyParameters) {
          try {
            const originalParams = context.parameters || [];
            const newParams = modifyParameters(context);
            if (newParams && newParams !== originalParams) {
              context.setParameters(newParams);
              
              // Trigger onParametersModified callback
              if (onParametersModified) {
                try {
                  onParametersModified(context, originalParams, newParams);
                } catch (error) {
                  if (onError) {
                    onError(context, error as Error);
                  } else if (enableLogging) {
                    console.error('[QueryModifier] onParametersModified callback failed:', error);
                  }
                }
              }
              
              if (enableLogging) {
                console.log('[QueryModifier] 🔧 Parameters modified:', {
                  originalCount: originalParams.length,
                  newCount: newParams.length
                });
              }
            }
          } catch (error) {
            if (onError) {
              onError(context, error as Error);
            } else if (enableLogging) {
              console.error('[QueryModifier] modifyParameters callback failed:', error);
            }
            throw error;
          }
        }

        return true; // Allow execution
      } catch (error) {
        if (onError) {
          onError(context, error as Error);
        } else if (enableLogging) {
          console.error('[QueryModifier] Query modification failed:', error);
        }
        throw error;
      }
    }
  };
}

/**
 * Pre-built modifier: Add tenant filtering for multi-tenancy
 * 
 * @example
 * ```typescript
 * import { TenantFilterModifier } from 'typeorm-query-hooks/plugins/query-modifier';
 * 
 * registerPlugin(TenantFilterModifier({
 *   getTenantId: () => getCurrentUser().tenantId,
 *   tables: ['orders', 'products', 'customers']
 * }));
 * ```
 */
export function TenantFilterModifier(config: {
  getTenantId: () => string | number;
  tables: string[];
  tenantColumn?: string;
}): QueryHookPlugin {
  const { getTenantId, tables, tenantColumn = 'tenant_id' } = config;

  return QueryModifierPlugin({
    modifySql: (context) => {
      const queryTables = extractTablesFromBuilder(context.builder);
      
      // Check if this query involves any tenant-filtered tables
      const needsTenantFilter = queryTables.some((table: string) => tables.includes(table));
      
      if (needsTenantFilter && context.sql.includes('SELECT')) {
        const tenantId = getTenantId();
        // Simple injection - in production, use proper parameterization
        return context.sql.replace(
          /WHERE/i,
          `WHERE ${tenantColumn} = '${tenantId}' AND `
        );
      }
    },
    enableLogging: true
  });
}

/**
 * Pre-built modifier: Block dangerous queries in production
 * 
 * @example
 * ```typescript
 * import { SafetyModifier } from 'typeorm-query-hooks/plugins/query-modifier';
 * 
 * if (process.env.NODE_ENV === 'production') {
 *   registerPlugin(SafetyModifier());
 * }
 * ```
 */
export function SafetyModifier(): QueryHookPlugin {
  return QueryModifierPlugin({
    shouldExecute: (context) => {
      // Block DELETE without WHERE
      if (context.sql.match(/DELETE\s+FROM\s+\w+\s*$/i)) {
        console.error('[SafetyModifier] 🚨 Blocked: DELETE without WHERE clause');
        return false;
      }

      // Block UPDATE without WHERE
      if (context.sql.match(/UPDATE\s+\w+\s+SET\s+.+\s*$/i) && !context.sql.includes('WHERE')) {
        console.error('[SafetyModifier] 🚨 Blocked: UPDATE without WHERE clause');
        return false;
      }

      return true;
    },
    enableLogging: true
  });
}

