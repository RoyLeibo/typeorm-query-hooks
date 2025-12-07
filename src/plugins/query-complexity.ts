import { QueryHookPlugin, QueryHookContext } from '../index';
import { extractTablesFromBuilder } from './table-extractor';

/**
 * Query complexity metrics
 */
export interface QueryComplexityMetrics {
  joinCount: number;
  tableCount: number;
  hasSubquery: boolean;
  hasCTE: boolean;
  estimatedComplexity: 'low' | 'medium' | 'high';
  warnings: string[];
}

/**
 * Options for QueryComplexityPlugin
 */
export interface QueryComplexityOptions {
  /**
   * Maximum number of joins before warning (default: 5)
   * Queries with more joins will trigger a complexity warning
   */
  maxJoins?: number;
  
  /**
   * Maximum number of tables before warning (default: 10)
   * Queries involving more tables will trigger a complexity warning
   */
  maxTables?: number;
  
  /**
   * Warn on subqueries (default: false)
   * When true, warns whenever a subquery is detected
   */
  warnOnSubqueries?: boolean;
  
  /**
   * Warn on CTEs (Common Table Expressions) (default: false)
   * When true, warns whenever a WITH clause is detected
   */
  warnOnCTEs?: boolean;
  
  /**
   * Callback when complex query is detected (optional)
   * 
   * @param metrics - Complexity metrics for the query
   * @param context - Full query context
   * 
   * @example
   * ```typescript
   * onComplexQuery: (metrics, context) => {
   *   if (metrics.estimatedComplexity === 'high') {
   *     logger.warn('Complex query detected', {
   *       joins: metrics.joinCount,
   *       tables: metrics.tableCount,
   *       warnings: metrics.warnings
   *     });
   *   }
   * }
   * ```
   */
  onComplexQuery?: (metrics: QueryComplexityMetrics, context: QueryHookContext) => void;
  
  /**
   * Enable console logging for this plugin (default: false)
   * When true, logs complexity warnings to console
   */
  enableLogging?: boolean;
}

/**
 * Plugin for detecting and warning about complex queries
 * Helps identify queries that might have performance issues
 * 
 * 🟢 Priority: LOW - Nice to have for optimization
 * 
 * @example
 * ```typescript
 * import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
 * import { QueryComplexityPlugin } from 'typeorm-query-hooks/plugins/query-complexity';
 * 
 * enableQueryHooks();
 * 
 * // Basic usage: Warn on complex queries
 * registerPlugin(QueryComplexityPlugin({
 *   maxJoins: 5,
 *   maxTables: 10,
 *   warnOnSubqueries: true,
 *   enableLogging: true
 * }));
 * 
 * // Advanced: Custom complexity handling
 * registerPlugin(QueryComplexityPlugin({
 *   maxJoins: 3,
 *   maxTables: 5,
 *   warnOnSubqueries: true,
 *   warnOnCTEs: true,
 *   enableLogging: true,
 *   onComplexQuery: (metrics, context) => {
 *     if (metrics.estimatedComplexity === 'high') {
 *       // Send to performance monitoring
 *       datadog.increment('complex_queries', {
 *         joins: metrics.joinCount,
 *         tables: metrics.tableCount
 *       });
 *       
 *       // Log for review
 *       logger.warn('Complex query needs optimization', {
 *         sql: context.sql.substring(0, 200),
 *         metrics,
 *         suggestion: 'Consider adding indexes or breaking into smaller queries'
 *       });
 *     }
 *   }
 * }));
 * ```
 */
export function QueryComplexityPlugin(options: QueryComplexityOptions = {}): QueryHookPlugin {
  const {
    maxJoins = 5,
    maxTables = 10,
    warnOnSubqueries = false,
    warnOnCTEs = false,
    onComplexQuery,
    enableLogging = false
  } = options;

  return {
    name: 'QueryComplexity',

    onQueryBuild: (context: QueryHookContext) => {
      const sql = context.sql.toUpperCase();
      const tables = extractTablesFromBuilder(context.builder);
      
      // Analyze query complexity
      const joinCount = (sql.match(/\bJOIN\b/g) || []).length;
      const hasSubquery = /\(\s*SELECT\b/.test(sql);
      const hasCTE = /\bWITH\b/.test(sql);
      
      const warnings: string[] = [];
      let estimatedComplexity: 'low' | 'medium' | 'high' = 'low';

      // Check for complexity issues
      if (joinCount > maxJoins) {
        warnings.push(`Too many joins: ${joinCount} (max: ${maxJoins})`);
        estimatedComplexity = 'high';
      }

      if (tables.length > maxTables) {
        warnings.push(`Too many tables: ${tables.length} (max: ${maxTables})`);
        estimatedComplexity = 'high';
      }

      if (warnOnSubqueries && hasSubquery) {
        warnings.push('Contains subquery (may impact performance)');
        if (estimatedComplexity === 'low') estimatedComplexity = 'medium';
      }

      if (warnOnCTEs && hasCTE) {
        warnings.push('Contains CTE (Common Table Expression)');
        if (estimatedComplexity === 'low') estimatedComplexity = 'medium';
      }

      // Determine overall complexity
      if (joinCount > maxJoins * 0.6 || tables.length > maxTables * 0.6) {
        if (estimatedComplexity === 'low') estimatedComplexity = 'medium';
      }

      // Build metrics
      const metrics: QueryComplexityMetrics = {
        joinCount,
        tableCount: tables.length,
        hasSubquery,
        hasCTE,
        estimatedComplexity,
        warnings
      };

      // Only act if there are warnings
      if (warnings.length > 0) {
        if (enableLogging) {
          console.warn(`[QueryComplexity] ⚠️  Complex query detected:`, {
            complexity: estimatedComplexity.toUpperCase(),
            joins: joinCount,
            tables: tables.length,
            warnings,
            sqlPreview: context.sql.substring(0, 150) + (context.sql.length > 150 ? '...' : '')
          });
        }

        if (onComplexQuery) {
          try {
            onComplexQuery(metrics, context);
          } catch (error) {
            console.error(`[QueryComplexity] ❌ onComplexQuery callback failed:`, error);
          }
        }
      } else if (enableLogging) {
        console.log(`[QueryComplexity] ✅ Query complexity: ${estimatedComplexity}`, {
          joins: joinCount,
          tables: tables.length
        });
      }
    }
  };
}

