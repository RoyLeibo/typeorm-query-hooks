import { QueryHookPlugin, QueryExecutionContext } from '../index';

/**
 * Query execution plan from EXPLAIN
 */
export interface QueryExecutionPlan {
  raw: string;
  parsed?: any;
  hasSeqScan?: boolean;
  estimatedCost?: number;
  estimatedRows?: number;
}

/**
 * Options for SlowQueryAnalyzerPlugin
 */
export interface SlowQueryAnalyzerOptions {
  /**
   * Threshold in milliseconds for running EXPLAIN (default: 1000ms)
   * Queries slower than this will automatically get analyzed
   */
  threshold?: number;
  
  /**
   * Run EXPLAIN ANALYZE (default: false)
   * When true, runs actual query to get real execution stats
   * ⚠️ Warning: EXPLAIN ANALYZE actually executes the query
   */
  runAnalyze?: boolean;
  
  /**
   * Database type for EXPLAIN syntax (default: 'postgres')
   * Different databases have different EXPLAIN syntax
   */
  databaseType?: 'postgres' | 'mysql' | 'mariadb' | 'sqlite' | 'mssql';
  
  /**
   * Callback when analysis is complete (optional)
   * 
   * @param context - Query execution context
   * @param plan - Parsed execution plan
   * 
   * @example
   * ```typescript
   * onAnalysis: (context, plan) => {
   *   if (plan.hasSeqScan) {
   *     logger.warn('Sequential scan detected - missing index?', {
   *       sql: context.sql,
   *       plan: plan.raw
   *     });
   *   }
   * }
   * ```
   */
  onAnalysis?: (context: QueryExecutionContext, plan: QueryExecutionPlan) => void | Promise<void>;
  
  /**
   * Enable console logging for this plugin (default: false)
   * When true, logs execution plans for slow queries
   */
  enableLogging?: boolean;
}

/**
 * Plugin for automatic query execution plan analysis
 * Automatically runs EXPLAIN on slow queries to identify issues
 * 
 * 🔬 Solves: Manual copy-paste of SQL to run EXPLAIN in DB tool
 * 
 * **The Problem:**
 * 1. Slow query alert fires
 * 2. You copy the SQL
 * 3. Open pgAdmin/DBeaver
 * 4. Paste and run EXPLAIN ANALYZE
 * 5. Look for issues (seq scans, missing indexes, etc.)
 * 
 * **The Solution:**
 * Automatically runs EXPLAIN when query is slow and shows you the plan immediately
 * 
 * @example
 * ```typescript
 * import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
 * import { SlowQueryAnalyzerPlugin } from 'typeorm-query-hooks/plugins/slow-query-analyzer';
 * 
 * enableQueryHooks();
 * 
 * // Basic usage: Auto-analyze slow queries
 * registerPlugin(SlowQueryAnalyzerPlugin({
 *   threshold: 1000,      // Analyze queries > 1s
 *   runAnalyze: false,    // Don't run EXPLAIN ANALYZE (safer)
 *   databaseType: 'postgres',
 *   enableLogging: true
 * }));
 * 
 * // Advanced: Detect missing indexes
 * registerPlugin(SlowQueryAnalyzerPlugin({
 *   threshold: 500,
 *   databaseType: 'postgres',
 *   onAnalysis: async (context, plan) => {
 *     // Check for sequential scans (indicates missing index)
 *     if (plan.hasSeqScan) {
 *       logger.error('🔍 MISSING INDEX DETECTED:', {
 *         sql: context.sql.substring(0, 200),
 *         executionTime: context.executionTime,
 *         estimatedCost: plan.estimatedCost,
 *         plan: plan.raw,
 *         suggestion: 'Consider adding an index to improve performance'
 *       });
 *       
 *       // Send to monitoring
 *       monitoring.alert({
 *         type: 'missing_index_detected',
 *         severity: 'high',
 *         details: plan
 *       });
 *     }
 *   }
 * }));
 * ```
 */
export function SlowQueryAnalyzerPlugin(options: SlowQueryAnalyzerOptions = {}): QueryHookPlugin {
  const {
    threshold = 1000,
    runAnalyze = false,
    databaseType = 'postgres',
    onAnalysis,
    enableLogging = false
  } = options;

  /**
   * Generate EXPLAIN query based on database type
   */
  function generateExplainQuery(sql: string, analyze: boolean): string {
    switch (databaseType) {
      case 'postgres':
        return `EXPLAIN ${analyze ? 'ANALYZE ' : ''}(FORMAT JSON) ${sql}`;
      case 'mysql':
      case 'mariadb':
        return `EXPLAIN ${analyze ? 'ANALYZE ' : ''}FORMAT=JSON ${sql}`;
      case 'sqlite':
        return `EXPLAIN QUERY PLAN ${sql}`;
      case 'mssql':
        return `SET SHOWPLAN_TEXT ON; ${sql}; SET SHOWPLAN_TEXT OFF;`;
      default:
        return `EXPLAIN ${sql}`;
    }
  }

  /**
   * Parse execution plan
   */
  function parseExecutionPlan(raw: string, dbType: string): QueryExecutionPlan {
    const plan: QueryExecutionPlan = { raw };

    try {
      // Try to parse JSON for Postgres/MySQL
      if (dbType === 'postgres' || dbType === 'mysql' || dbType === 'mariadb') {
        const parsed = JSON.parse(raw);
        plan.parsed = parsed;

        // Postgres specific parsing
        if (dbType === 'postgres' && Array.isArray(parsed) && parsed[0]?.Plan) {
          const queryPlan = parsed[0].Plan;
          plan.estimatedCost = queryPlan['Total Cost'];
          plan.estimatedRows = queryPlan['Plan Rows'];
          
          // Check for sequential scan
          const planStr = JSON.stringify(parsed).toLowerCase();
          plan.hasSeqScan = planStr.includes('seq scan');
        }
      }
    } catch (error) {
      // If parsing fails, just use raw
      plan.hasSeqScan = plan.raw.toLowerCase().includes('seq scan') || 
                        plan.raw.toLowerCase().includes('table scan');
    }

    return plan;
  }

  /**
   * Run EXPLAIN on query
   */
  async function runExplain(context: QueryExecutionContext): Promise<QueryExecutionPlan | null> {
    try {
      const builder = context.builder;
      const connection = (builder as any).connection;
      
      if (!connection) {
        if (enableLogging) {
          console.warn('[SlowQueryAnalyzer] No connection available');
        }
        return null;
      }

      const explainQuery = generateExplainQuery(context.sql, runAnalyze);
      
      if (enableLogging) {
        console.log('[SlowQueryAnalyzer] Running EXPLAIN:', explainQuery.substring(0, 100));
      }

      // Execute EXPLAIN query
      const result = await connection.query(explainQuery, context.parameters);
      
      // Parse result
      let raw: string;
      if (typeof result === 'string') {
        raw = result;
      } else if (Array.isArray(result)) {
        raw = JSON.stringify(result, null, 2);
      } else {
        raw = JSON.stringify(result, null, 2);
      }

      return parseExecutionPlan(raw, databaseType);
    } catch (error) {
      if (enableLogging) {
        console.error('[SlowQueryAnalyzer] Failed to run EXPLAIN:', error);
      }
      return null;
    }
  }

  return {
    name: 'SlowQueryAnalyzer',

    onQueryComplete: async (context: QueryExecutionContext) => {
      // Only analyze slow queries
      if (!context.executionTime || context.executionTime < threshold) {
        return;
      }

      if (enableLogging) {
        console.log(
          `[SlowQueryAnalyzer] 🔬 Analyzing slow query (${context.executionTime}ms)...`
        );
      }

      const plan = await runExplain(context);
      
      if (!plan) {
        return;
      }

      if (enableLogging) {
        console.log(
          `[SlowQueryAnalyzer] 📊 Execution Plan:\n` +
          `  Execution Time: ${context.executionTime}ms\n` +
          `  Estimated Cost: ${plan.estimatedCost || 'N/A'}\n` +
          `  Estimated Rows: ${plan.estimatedRows || 'N/A'}\n` +
          `  Has Sequential Scan: ${plan.hasSeqScan ? 'YES ⚠️' : 'NO'}\n` +
          `  SQL: ${context.sql.substring(0, 100)}...\n` +
          `\nFull Plan:\n${plan.raw}\n`
        );
      }

      if (onAnalysis) {
        try {
          await onAnalysis(context, plan);
        } catch (error) {
          console.error('[SlowQueryAnalyzer] onAnalysis callback failed:', error);
        }
      }
    },

    onEnable: () => {
      if (enableLogging) {
        console.log('[SlowQueryAnalyzer] 🔬 Auto-EXPLAIN enabled', {
          threshold: `${threshold}ms`,
          databaseType,
          runAnalyze
        });
      }
    }
  };
}



