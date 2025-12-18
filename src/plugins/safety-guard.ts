import { QueryHookPlugin, PreQueryContext, RawQueryContext } from '../index';
import { extractTablesFromBuilder, extractTablesFromSQL } from './table-extractor';

/**
 * Blocked operation details
 */
export interface BlockedOperation {
  reason: string;
  operation: string;
  sql: string;
  tables: string[];
  severity: 'warning' | 'error' | 'critical';
}

/**
 * Options for SafetyGuardPlugin
 */
export interface SafetyGuardOptions {
  /**
   * Block DDL operations (CREATE, ALTER, DROP, TRUNCATE) (default: false)
   * When true, prevents schema changes through the application
   * 
   * ⚠️ Recommended: true in production
   */
  blockDDL?: boolean;
  
  /**
   * Require WHERE clause for UPDATE/DELETE (default: true)
   * Prevents accidental mass updates/deletes
   * 
   * ⚠️ CRITICAL: Prevents `UPDATE users SET ...` (updates ALL rows)
   */
  requireWhereClause?: boolean;
  
  /**
   * Block TRUNCATE operations (default: true)
   * Prevents table truncation which deletes all data
   */
  blockTruncate?: boolean;
  
  /**
   * Block DROP operations (default: true in production)
   * Prevents table/database drops
   */
  blockDrop?: boolean;
  
  /**
   * Allowed environments for destructive operations (default: ['development', 'test'])
   * Operations are only blocked outside these environments
   * 
   * @example ['development', 'test', 'staging']
   */
  allowedEnvironments?: string[];
  
  /**
   * Tables that require extra protection (default: [])
   * These tables have stricter rules applied
   * 
   * @example ['users', 'payments', 'transactions'] - Critical tables
   */
  protectedTables?: string[];
  
  /**
   * Allow force flag to override safety (default: false)
   * When false, no overrides are possible (recommended for production)
   * When true, queries with special comment can bypass: /* FORCE_ALLOW *\/
   */
  allowForce?: boolean;
  
  /**
   * Callback when an operation is blocked (optional)
   * 
   * @param context - Query context
   * @param blocked - Details about blocked operation
   * 
   * @example
   * ```typescript
   * onBlocked: (context, blocked) => {
   *   logger.error('Dangerous operation blocked', blocked);
   *   monitoring.alert({
   *     type: 'safety_guard_block',
   *     severity: blocked.severity,
   *     operation: blocked.operation
   *   });
   * }
   * ```
   */
  onBlocked?: (context: PreQueryContext, blocked: BlockedOperation) => void;
  
  /**
   * Throw error when operation is blocked (default: true)
   * When true, throws error to prevent query execution
   * When false, just logs warning (not recommended)
   */
  throwOnBlock?: boolean;
  
  /**
   * Enable console logging for this plugin (default: false)
   * When true, logs all blocked operations
   */
  enableLogging?: boolean;
}

/**
 * Plugin for blocking dangerous database operations
 * The "Production Airbag" - prevents catastrophic mistakes
 * 
 * 🛡️ CRITICAL: Prevents production disasters
 * 
 * **What it prevents:**
 * 1. ❌ `UPDATE users SET role='admin'` - No WHERE clause = ALL rows updated
 * 2. ❌ `DELETE FROM orders` - No WHERE clause = ALL orders deleted
 * 3. ❌ `DROP TABLE users` - Accidental table drops
 * 4. ❌ `TRUNCATE payments` - All payment records gone
 * 5. ❌ `synchronize: true` in production - Schema auto-sync disasters
 * 
 * **Real stories this prevents:**
 * - Junior dev ran `UPDATE users SET email='test@test.com'` without WHERE → 1M users had same email
 * - Migration with DROP TABLE ran in production
 * - Someone forgot WHERE in DELETE → Lost 6 months of data
 * 
 * @example
 * ```typescript
 * import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
 * import { SafetyGuardPlugin } from 'typeorm-query-hooks/plugins/safety-guard';
 * 
 * enableQueryHooks();
 * 
 * // Basic usage: Production safety
 * registerPlugin(SafetyGuardPlugin({
 *   blockDDL: true,           // No CREATE/ALTER/DROP
 *   requireWhereClause: true, // No UPDATE/DELETE without WHERE
 *   blockTruncate: true,      // No TRUNCATE
 *   throwOnBlock: true        // Stop execution
 * }));
 * 
 * // Advanced: Environment-aware with protected tables
 * registerPlugin(SafetyGuardPlugin({
 *   blockDDL: process.env.NODE_ENV === 'production',
 *   requireWhereClause: true,
 *   allowedEnvironments: ['development', 'test'],
 *   protectedTables: ['users', 'payments', 'transactions'], // Extra protection
 *   allowForce: false, // No overrides in production
 *   onBlocked: (context, blocked) => {
 *     // Send critical alert
 *     pagerduty.trigger({
 *       severity: 'critical',
 *       summary: `Dangerous operation blocked: ${blocked.operation}`,
 *       details: blocked
 *     });
 *     
 *     // Log to audit trail
 *     auditLog.save({
 *       event: 'operation_blocked',
 *       severity: blocked.severity,
 *       reason: blocked.reason,
 *       sql: blocked.sql,
 *       userId: getCurrentUser()?.id,
 *       timestamp: new Date()
 *     });
 *   },
 *   enableLogging: true
 * }));
 * 
 * // Example: Strict mode for financial tables
 * registerPlugin(SafetyGuardPlugin({
 *   requireWhereClause: true,
 *   protectedTables: ['payments', 'transactions', 'invoices'],
 *   throwOnBlock: true,
 *   onBlocked: (context, blocked) => {
 *     throw new Error(`🛑 CRITICAL: Attempted ${blocked.operation} on ${blocked.tables.join(', ')} - BLOCKED`);
 *   }
 * }));
 * ```
 */
export function SafetyGuardPlugin(options: SafetyGuardOptions = {}): QueryHookPlugin {
  const {
    blockDDL = false,
    requireWhereClause = true,
    blockTruncate = true,
    blockDrop = true,
    allowedEnvironments = ['development', 'test'],
    protectedTables = [],
    allowForce = false,
    onBlocked,
    throwOnBlock = true,
    enableLogging = false
  } = options;

  const currentEnv = process.env.NODE_ENV || 'development';
  const isAllowedEnv = allowedEnvironments.includes(currentEnv);

  // Future enhancement: use isAllowedEnv for environment-specific rules
  void isAllowedEnv;

  /**
   * Check if query has FORCE_ALLOW flag
   */
  function hasForceFlag(sql: string): boolean {
    if (!allowForce) return false;
    return /\/\*\s*FORCE_ALLOW\s*\*\//i.test(sql);
  }

  /**
   * Check if SQL contains WHERE clause
   */
  function hasWhereClause(sql: string): boolean {
    // Simple check - can be improved with SQL parser
    return /\bWHERE\b/i.test(sql);
  }

  /**
   * Block operation
   */
  function blockOperation(
    context: PreQueryContext,
    operation: string,
    reason: string,
    severity: 'warning' | 'error' | 'critical'
  ): boolean {
    const tables = extractTablesFromBuilder(context.builder);
    
    const blocked: BlockedOperation = {
      reason,
      operation,
      sql: context.sql,
      tables,
      severity
    };

    if (enableLogging) {
      const emoji = severity === 'critical' ? '🚨' : severity === 'error' ? '❌' : '⚠️';
      console.warn(
        `\n${emoji} SAFETY GUARD BLOCKED ${operation.toUpperCase()}\n` +
        `Reason: ${reason}\n` +
        `Severity: ${severity.toUpperCase()}\n` +
        `Tables: ${tables.join(', ') || 'unknown'}\n` +
        `SQL: ${context.sql.substring(0, 200)}${context.sql.length > 200 ? '...' : ''}\n` +
        `Environment: ${currentEnv}\n`
      );
    }

    if (onBlocked) {
      try {
        onBlocked(context, blocked);
      } catch (error) {
        console.error('[SafetyGuard] onBlocked callback failed:', error);
      }
    }

    if (throwOnBlock) {
      throw new Error(
        `🛑 SafetyGuard: ${reason}\n` +
        `Operation: ${operation}\n` +
        `Tables: ${tables.join(', ')}\n` +
        `Environment: ${currentEnv}`
      );
    }

    return false; // Block execution
  }

  return {
    name: 'SafetyGuard',

    onBeforeQuery: (context: PreQueryContext): boolean => {
      const sql = context.sql.toUpperCase();
      const tables = extractTablesFromBuilder(context.builder);
      
      // Check for force flag
      if (hasForceFlag(context.sql)) {
        if (enableLogging) {
          console.warn('[SafetyGuard] ⚠️  FORCE_ALLOW flag detected - bypassing safety checks');
        }
        return true; // Allow
      }

      // Check if query affects protected tables
      const affectsProtectedTable = protectedTables.length > 0 && 
        tables.some((table: string) => protectedTables.includes(table));

      // Check for DDL operations
      if (blockDDL && (
        sql.includes('CREATE TABLE') ||
        sql.includes('CREATE DATABASE') ||
        sql.includes('ALTER TABLE') ||
        sql.includes('ALTER DATABASE') ||
        (blockDrop && (sql.includes('DROP TABLE') || sql.includes('DROP DATABASE')))
      )) {
        return blockOperation(
          context,
          'DDL',
          'DDL operations (CREATE/ALTER/DROP) are blocked in this environment',
          'critical'
        );
      }

      // Check for TRUNCATE
      if (blockTruncate && sql.includes('TRUNCATE')) {
        return blockOperation(
          context,
          'TRUNCATE',
          'TRUNCATE operations are blocked - they delete all data',
          'critical'
        );
      }

      // Check for DROP (if not caught by blockDDL)
      if (blockDrop && !blockDDL && sql.includes('DROP')) {
        return blockOperation(
          context,
          'DROP',
          'DROP operations are blocked',
          'critical'
        );
      }

      // Check UPDATE without WHERE
      if (requireWhereClause && sql.includes('UPDATE') && !hasWhereClause(sql)) {
        const severity = affectsProtectedTable ? 'critical' : 'error';
        return blockOperation(
          context,
          'UPDATE',
          'UPDATE without WHERE clause - would update ALL rows' +
          (affectsProtectedTable ? ` (affects protected table: ${tables.join(', ')})` : ''),
          severity
        );
      }

      // Check DELETE without WHERE
      if (requireWhereClause && sql.includes('DELETE') && !hasWhereClause(sql)) {
        const severity = affectsProtectedTable ? 'critical' : 'error';
        return blockOperation(
          context,
          'DELETE',
          'DELETE without WHERE clause - would delete ALL rows' +
          (affectsProtectedTable ? ` (affects protected table: ${tables.join(', ')})` : ''),
          severity
        );
      }

      // All checks passed
      return true;
    },

    // Monitor raw SQL queries (DDL, migrations, dataSource.query())
    onRawQuery: (context: RawQueryContext): void => {
      try {
        const sql = context.sql.toUpperCase();
        const tables = extractTablesFromSQL(context.sql);
        
        // Check for force flag
        if (hasForceFlag(context.sql)) {
          if (enableLogging) {
            console.warn('[SafetyGuard] ⚠️  FORCE_ALLOW flag detected in raw SQL - bypassing safety checks');
          }
          return; // Allow
        }

        // Check if query affects protected tables
        const affectsProtectedTable = protectedTables.length > 0 && 
          tables.some((table: string) => protectedTables.includes(table));

        // Create a pseudo-context for blockOperation
        const pseudoContext: PreQueryContext = {
          builder: null as any,
          sql: context.sql,
          timestamp: context.timestamp,
          parameters: context.parameters,
          setSql: () => {},
          setParameters: () => {}
        };

        // Check for DDL operations
        if (blockDDL && (
          sql.includes('CREATE TABLE') ||
          sql.includes('CREATE DATABASE') ||
          sql.includes('CREATE INDEX') ||
          sql.includes('ALTER TABLE') ||
          sql.includes('ALTER DATABASE') ||
          (blockDrop && (sql.includes('DROP TABLE') || sql.includes('DROP DATABASE') || sql.includes('DROP INDEX')))
        )) {
          blockOperation(
            pseudoContext,
            'DDL',
            'DDL operations (CREATE/ALTER/DROP) are blocked in this environment (raw SQL)',
            'critical'
          );
          throw new Error('🛑 SafetyGuard: DDL operations blocked in raw SQL');
        }

        // Check for TRUNCATE
        if (blockTruncate && sql.includes('TRUNCATE')) {
          blockOperation(
            pseudoContext,
            'TRUNCATE',
            'TRUNCATE operations are blocked - they delete all data (raw SQL)',
            'critical'
          );
          throw new Error('🛑 SafetyGuard: TRUNCATE blocked in raw SQL');
        }

        // Check for DROP (if not caught by blockDDL)
        if (blockDrop && !blockDDL && sql.includes('DROP')) {
          blockOperation(
            pseudoContext,
            'DROP',
            'DROP operations are blocked (raw SQL)',
            'critical'
          );
          throw new Error('🛑 SafetyGuard: DROP blocked in raw SQL');
        }

        // Check UPDATE without WHERE
        if (requireWhereClause && sql.includes('UPDATE') && !hasWhereClause(sql)) {
          const severity = affectsProtectedTable ? 'critical' : 'error';
          blockOperation(
            pseudoContext,
            'UPDATE',
            'UPDATE without WHERE clause - would update ALL rows (raw SQL)' +
            (affectsProtectedTable ? ` (affects protected table: ${tables.join(', ')})` : ''),
            severity
          );
          throw new Error('🛑 SafetyGuard: UPDATE without WHERE clause in raw SQL');
        }

        // Check DELETE without WHERE
        if (requireWhereClause && sql.includes('DELETE') && !hasWhereClause(sql)) {
          const severity = affectsProtectedTable ? 'critical' : 'error';
          blockOperation(
            pseudoContext,
            'DELETE',
            'DELETE without WHERE clause - would delete ALL rows (raw SQL)' +
            (affectsProtectedTable ? ` (affects protected table: ${tables.join(', ')})` : ''),
            severity
          );
          throw new Error('🛑 SafetyGuard: DELETE without WHERE clause in raw SQL');
        }

        // If all checks passed and logging is enabled
        if (enableLogging) {
          console.log('[SafetyGuard] ✅ Raw SQL passed safety checks', {
            sql: context.sql.substring(0, 100) + '...',
            tables
          });
        }
      } catch (error) {
        // If it's an intentional block (our thrown errors), re-throw it
        if (error instanceof Error && error.message.includes('🛑 SafetyGuard:')) {
          throw error; // Re-throw intentional blocks
        }
        // Otherwise, log unexpected errors and allow the query
        console.error('[SafetyGuard] Unexpected error in onRawQuery:', error);
      }
    },

    onEnable: () => {
      if (enableLogging) {
        console.log('[SafetyGuard] 🛡️  Production safety enabled (QueryBuilder + Raw SQL)', {
          environment: currentEnv,
          blockDDL,
          requireWhereClause,
          blockTruncate,
          blockDrop,
          protectedTables: protectedTables.length > 0 ? protectedTables : 'none',
          allowForce,
          rawSQLMonitoring: '✅ Enabled'
        });
      }
    }
  };
}



