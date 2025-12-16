import { QueryHookPlugin, QueryExecutionContext } from '../index';
import { extractTablesFromBuilder } from './table-extractor';

/**
 * Audit log entry structure
 */
export interface AuditLogEntry {
  timestamp: Date;
  userId?: string | number;
  action: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | string;
  tables: string[];
  sql: string;
  parameters?: any[];
  executionTime?: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Options for AuditLoggingPlugin
 */
export interface AuditLoggingOptions {
  /**
   * Callback to log audit entries (required)
   * This function should persist the audit log (database, file, external service, etc.)
   * 
   * @param entry - The audit log entry to persist
   * 
   * @example
   * ```typescript
   * onAudit: async (entry) => {
   *   await auditLogRepository.save({
   *     userId: entry.userId,
   *     action: entry.action,
   *     tables: entry.tables.join(','),
   *     timestamp: entry.timestamp
   *   });
   * }
   * ```
   */
  onAudit: (entry: AuditLogEntry) => void | Promise<void>;
  
  /**
   * Function to get current user ID for audit logs (default: undefined)
   * Should return the currently authenticated user's ID
   * 
   * @example () => getCurrentUser()?.id
   */
  getUserId?: () => string | number | undefined;
  
  /**
   * Query types to audit (default: ['INSERT', 'UPDATE', 'DELETE'] - only write operations)
   * Specify which query types should be logged
   * 
   * @example ['INSERT', 'UPDATE', 'DELETE', 'SELECT'] - Audit all queries including reads
   */
  auditTypes?: Array<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'select' | 'insert' | 'update' | 'delete'>;
  
  /**
   * Specific tables to audit (default: [] - all tables)
   * If empty array, all tables will be audited
   * If provided, only these tables will be audited
   * 
   * @example ['users', 'financial_records', 'sensitive_data'] - Only audit sensitive tables
   */
  auditTables?: string[];
  
  /**
   * Include SQL query in audit log (default: true)
   * When false, only table names and action are logged (better for privacy)
   */
  includeSql?: boolean;
  
  /**
   * Include query parameters in audit log (default: false)
   * When true, logs the actual values used in the query (may contain sensitive data)
   */
  includeParameters?: boolean;
  
  /**
   * Additional metadata to include in audit logs (default: undefined)
   * Can be static object or function that returns dynamic metadata
   * 
   * @example () => ({ environment: process.env.NODE_ENV, serverIp: getServerIP() })
   */
  metadata?: Record<string, any> | (() => Record<string, any>);
  
  /**
   * Enable console logging for this plugin (default: false)
   * When true, logs audit entries to console
   */
  enableLogging?: boolean;
}

/**
 * Plugin for comprehensive audit logging of database operations
 * Tracks who did what, when, and on which tables
 * 
 * 🔥 Priority: HIGH - Critical for compliance, security, and debugging
 * 
 * @example
 * ```typescript
 * import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
 * import { AuditLoggingPlugin } from 'typeorm-query-hooks/plugins/audit-logging';
 * 
 * enableQueryHooks();
 * 
 * // Basic usage: Audit all write operations
 * registerPlugin(AuditLoggingPlugin({
 *   getUserId: () => getCurrentUser()?.id,
 *   onAudit: async (entry) => {
 *     await auditLogRepository.save(entry);
 *   }
 * }));
 * 
 * // Advanced: Audit specific sensitive tables including reads
 * registerPlugin(AuditLoggingPlugin({
 *   auditTypes: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], // Audit everything
 *   auditTables: ['users', 'financial_records', 'sensitive_data'],
 *   includeSql: true,
 *   includeParameters: false, // Don't log parameters (security)
 *   getUserId: () => getCurrentUser()?.id,
 *   metadata: () => ({
 *     environment: process.env.NODE_ENV,
 *     serverIp: getServerIP(),
 *     requestId: getRequestId()
 *   }),
 *   enableLogging: true,
 *   onAudit: async (entry) => {
 *     // Save to database
 *     await auditLogRepository.save(entry);
 *     
 *     // Also send to SIEM for security monitoring
 *     if (entry.tables.includes('financial_records')) {
 *       await siem.sendEvent({
 *         type: 'database_access',
 *         severity: 'high',
 *         data: entry
 *       });
 *     }
 *   }
 * }));
 * ```
 */
export function AuditLoggingPlugin(options: AuditLoggingOptions): QueryHookPlugin {
  const {
    onAudit,
    getUserId,
    auditTypes = ['INSERT', 'UPDATE', 'DELETE', 'insert', 'update', 'delete'],
    auditTables = [], // Empty = all tables
    includeSql = true,
    includeParameters = false,
    metadata,
    enableLogging = false
  } = options;

  if (!onAudit) {
    throw new Error('AuditLoggingPlugin requires onAudit callback');
  }

  return {
    name: 'AuditLogging',

    onQueryComplete: async (context: QueryExecutionContext) => {
      const queryType = context.queryType ? String(context.queryType).toUpperCase() : 'UNKNOWN';
      
      // Only audit specified query types
      if (!auditTypes.some(type => type.toUpperCase() === queryType)) {
        return;
      }

      // Extract tables from the query
      const tables = extractTablesFromBuilder(context.builder);
      
      // Filter to audited tables if specified
      const tablesToAudit = auditTables.length > 0
        ? tables.filter((table: string) => auditTables.includes(table))
        : tables;

      if (tablesToAudit.length === 0) {
        return;
      }

      // Build audit log entry
      const entry: AuditLogEntry = {
        timestamp: context.timestamp,
        userId: getUserId ? getUserId() : undefined,
        action: queryType,
        tables: tablesToAudit,
        sql: includeSql ? context.sql : '[SQL REDACTED]',
        parameters: includeParameters ? context.parameters : undefined,
        executionTime: context.executionTime,
        success: true,
        metadata: typeof metadata === 'function' ? metadata() : metadata
      };

      if (enableLogging) {
        console.log(`[AuditLogging] 📝 Audit log:`, {
          userId: entry.userId,
          action: entry.action,
          tables: entry.tables,
          executionTime: entry.executionTime
        });
      }

      try {
        await onAudit(entry);
      } catch (error) {
        console.error(`[AuditLogging] ❌ Failed to log audit entry:`, error);
      }
    },

    onQueryError: async (context) => {
      const queryType = context.queryType ? String(context.queryType).toUpperCase() : 'UNKNOWN';
      
      // Only audit specified query types
      if (!auditTypes.some(type => type.toUpperCase() === queryType)) {
        return;
      }

      // Extract tables from the query
      const tables = extractTablesFromBuilder(context.builder);
      
      // Filter to audited tables if specified
      const tablesToAudit = auditTables.length > 0
        ? tables.filter((table: string) => auditTables.includes(table))
        : tables;

      if (tablesToAudit.length === 0) {
        return;
      }

      // Build audit log entry for failed query
      const entry: AuditLogEntry = {
        timestamp: context.timestamp,
        userId: getUserId ? getUserId() : undefined,
        action: queryType,
        tables: tablesToAudit,
        sql: includeSql ? context.sql : '[SQL REDACTED]',
        parameters: includeParameters ? context.parameters : undefined,
        executionTime: context.executionTime,
        success: false,
        error: context.error.message,
        metadata: typeof metadata === 'function' ? metadata() : metadata
      };

      if (enableLogging) {
        console.log(`[AuditLogging] ❌ Audit log (FAILED):`, {
          userId: entry.userId,
          action: entry.action,
          tables: entry.tables,
          error: entry.error
        });
      }

      try {
        await onAudit(entry);
      } catch (error) {
        console.error(`[AuditLogging] ❌ Failed to log failed query audit entry:`, error);
      }
    }
  };
}




