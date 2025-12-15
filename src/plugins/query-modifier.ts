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
    enableLogging = false
  } = options;

  return {
    name: 'QueryModifier',

    onBeforeQuery: (context: PreQueryContext) => {
      // Check if query should be executed
      if (shouldExecute) {
        const shouldRun = shouldExecute(context);
        if (!shouldRun) {
          if (enableLogging) {
            console.warn('[QueryModifier] 🚫 Query execution blocked by shouldExecute callback');
          }
          return false;
        }
      }

      // Modify SQL
      if (modifySql) {
        const newSql = modifySql(context);
        if (newSql && newSql !== context.sql) {
          if (enableLogging) {
            console.log('[QueryModifier] ✏️  SQL modified:', {
              original: context.sql.substring(0, 100) + '...',
              modified: newSql.substring(0, 100) + '...'
            });
          }
          context.setSql(newSql);
        }
      }

      // Modify parameters
      if (modifyParameters) {
        const newParams = modifyParameters(context);
        if (newParams && newParams !== context.parameters) {
          if (enableLogging) {
            console.log('[QueryModifier] 🔧 Parameters modified');
          }
          context.setParameters(newParams);
        }
      }

      return true; // Allow execution
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

