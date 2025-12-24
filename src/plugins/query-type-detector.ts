import { QueryHookPlugin, QueryHookContext, QueryExecutionContext } from '../index';
import { queryMetadataRegistry } from './query-metadata-registry';

/**
 * SQL Query Types
 */
export type QueryType = 
  | 'SELECT' 
  | 'INSERT' 
  | 'UPDATE' 
  | 'DELETE'
  | 'CREATE'
  | 'ALTER'
  | 'DROP'
  | 'TRUNCATE'
  | 'BEGIN'
  | 'COMMIT'
  | 'ROLLBACK'
  | 'WITH'
  | 'OTHER';

/**
 * Context for query type detection
 */
export interface QueryTypeContext {
  builder: any;
  sql: string;
  timestamp: Date;
  parameters?: any[];
  queryType: QueryType; // Our extended QueryType, not TypeORM's limited one
  methodName?: string;
  executionTime?: number;
}

/**
 * Configuration options for QueryTypeDetector plugin
 */
export interface QueryTypeDetectorOptions {
  /**
   * Called when any query is detected
   */
  onQueryType?: (context: QueryTypeContext) => void;

  /**
   * Called specifically for SELECT queries
   */
  onSelect?: (context: QueryTypeContext) => void;

  /**
   * Called specifically for INSERT queries
   */
  onInsert?: (context: QueryTypeContext) => void;

  /**
   * Called specifically for UPDATE queries
   */
  onUpdate?: (context: QueryTypeContext) => void;

  /**
   * Called specifically for DELETE queries
   */
  onDelete?: (context: QueryTypeContext) => void;

  /**
   * Called for DDL operations (CREATE, ALTER, DROP, TRUNCATE)
   */
  onDDL?: (context: QueryTypeContext) => void;

  /**
   * Called for transaction control (BEGIN, COMMIT, ROLLBACK)
   */
  onTransaction?: (context: QueryTypeContext) => void;

  /**
   * Enable logging of query types
   */
  enableLogging?: boolean;

  /**
   * Only monitor specific query types
   */
  monitorTypes?: QueryType[];
}

/**
 * Extract query type from QueryBuilder's expressionMap (preferred method)
 * This is more reliable than string parsing because it uses TypeORM's internal state
 * 
 * For QueryBuilder queries, TypeORM's expressionMap.queryType provides:
 * - SELECT, INSERT, UPDATE, DELETE (always available from expressionMap)
 * 
 * For DDL and transaction control, we check the generated SQL since TypeORM's
 * expressionMap doesn't distinguish these types.
 * 
 * @param builder - The QueryBuilder instance
 * @returns The query type
 * 
 * @example
 * ```typescript
 * const repo = dataSource.getRepository(User);
 * 
 * // SELECT query
 * const qb1 = repo.createQueryBuilder('user').where('user.id = :id', { id: 1 });
 * extractQueryTypeFromBuilder(qb1); // "SELECT"
 * 
 * // INSERT query
 * const qb2 = repo.createQueryBuilder().insert().into(User).values({ name: 'John' });
 * extractQueryTypeFromBuilder(qb2); // "INSERT"
 * 
 * // UPDATE query
 * const qb3 = repo.createQueryBuilder().update(User).set({ name: 'Jane' });
 * extractQueryTypeFromBuilder(qb3); // "UPDATE"
 * 
 * // DELETE query
 * const qb4 = repo.createQueryBuilder().delete().from(User);
 * extractQueryTypeFromBuilder(qb4); // "DELETE"
 * ```
 */
export function extractQueryTypeFromBuilder(builder: any): QueryType {
  try {
    const expressionMap = builder.expressionMap;
    if (!expressionMap) {
      return 'OTHER';
    }

    // Try to get TypeORM's queryType first (works for SELECT, INSERT, UPDATE, DELETE)
    if (expressionMap.queryType) {
      const typeOrm = String(expressionMap.queryType).toUpperCase();
      
      switch (typeOrm) {
        case 'SELECT':
          return 'SELECT';
        case 'INSERT':
          return 'INSERT';
        case 'UPDATE':
          return 'UPDATE';
        case 'DELETE':
          return 'DELETE';
      }
    }

    // For other query types (DDL, transactions), try to get SQL and parse it
    // TypeORM's QueryBuilder doesn't typically generate DDL or transaction control,
    // but if someone is using it in a custom way, we can detect it from SQL
    try {
      if (typeof builder.getQuery === 'function') {
        const sql = builder.getQuery();
        if (sql) {
          const trimmed = sql.trim().toUpperCase();
          
          // DDL operations
          if (trimmed.startsWith('CREATE')) return 'CREATE';
          if (trimmed.startsWith('ALTER')) return 'ALTER';
          if (trimmed.startsWith('DROP')) return 'DROP';
          if (trimmed.startsWith('TRUNCATE')) return 'TRUNCATE';
          
          // Transaction control
          if (trimmed.startsWith('BEGIN')) return 'BEGIN';
          if (trimmed.startsWith('COMMIT')) return 'COMMIT';
          if (trimmed.startsWith('ROLLBACK')) return 'ROLLBACK';
          
          // WITH clause (CTE)
          if (trimmed.startsWith('WITH')) return 'WITH';
        }
      }
    } catch (err) {
      // getQuery() might fail, that's okay
    }
  } catch (err) {
    // If expressionMap access fails completely
  }
  
  return 'OTHER';
}

/**
 * Extract query type from SQL string (fallback method)
 * Used when QueryBuilder's expressionMap is not available (e.g., raw SQL queries)
 * 
 * @param query - The SQL query string
 * @returns The query type
 * 
 * @example
 * ```typescript
 * const type = extractQueryTypeFromSQL('SELECT * FROM users'); // "SELECT"
 * const type = extractQueryTypeFromSQL('CREATE INDEX ...'); // "CREATE"
 * ```
 */
export function extractQueryTypeFromSQL(query: string): QueryType {
  const trimmedQuery = query.trim().toUpperCase();

  // Common DML operations
  if (trimmedQuery.startsWith('SELECT')) return 'SELECT';
  if (trimmedQuery.startsWith('INSERT')) return 'INSERT';
  if (trimmedQuery.startsWith('UPDATE')) return 'UPDATE';
  if (trimmedQuery.startsWith('DELETE')) return 'DELETE';
  if (trimmedQuery.startsWith('WITH')) return 'WITH';

  // DDL operations
  if (trimmedQuery.startsWith('CREATE')) return 'CREATE';
  if (trimmedQuery.startsWith('ALTER')) return 'ALTER';
  if (trimmedQuery.startsWith('DROP')) return 'DROP';
  if (trimmedQuery.startsWith('TRUNCATE')) return 'TRUNCATE';

  // Transaction control
  if (trimmedQuery.startsWith('BEGIN')) return 'BEGIN';
  if (trimmedQuery.startsWith('COMMIT')) return 'COMMIT';
  if (trimmedQuery.startsWith('ROLLBACK')) return 'ROLLBACK';

  return 'OTHER';
}

/**
 * Get query type from context (uses expressionMap first, falls back to SQL parsing)
 * This is the preferred method as it tries expressionMap first
 * 
 * @param context - Query hook context
 * @returns The query type
 */
export function getQueryType(context: QueryHookContext | QueryExecutionContext): QueryType {
  // Priority 1: Try to get from expressionMap via builder
  if (context.builder) {
    const type = extractQueryTypeFromBuilder(context.builder);
    if (type !== 'OTHER') {
      return type;
    }
  }

  // Priority 2: Try to get from context.queryType if available
  if ('queryType' in context && context.queryType) {
    const typeStr = String(context.queryType).toUpperCase();
    if (['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(typeStr)) {
      return typeStr as QueryType;
    }
  }

  // Priority 3: Fall back to SQL string parsing
  if (context.sql) {
    return extractQueryTypeFromSQL(context.sql);
  }

  return 'OTHER';
}

/**
 * Check if query type is a DDL operation
 */
export function isDDL(queryType: QueryType): boolean {
  return ['CREATE', 'ALTER', 'DROP', 'TRUNCATE'].includes(queryType);
}

/**
 * Check if query type is a DML operation
 */
export function isDML(queryType: QueryType): boolean {
  return ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(queryType);
}

/**
 * Check if query type is a transaction control operation
 */
export function isTransaction(queryType: QueryType): boolean {
  return ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(queryType);
}

/**
 * Creates a Query Type Detector Plugin
 * 
 * This plugin detects the type of SQL query being executed using TypeORM's
 * internal expressionMap (preferred) or SQL string parsing (fallback).
 * 
 * @param options - Configuration options
 * @returns QueryHookPlugin instance
 * 
 * @example
 * ```typescript
 * import { registerPlugin, QueryTypeDetectorPlugin } from 'typeorm-query-hooks';
 * 
 * registerPlugin(QueryTypeDetectorPlugin({
 *   enableLogging: true,
 *   onSelect: (context) => {
 *     console.log('SELECT query detected:', context.sql);
 *   },
 *   onInsert: (context) => {
 *     console.log('INSERT query detected');
 *   },
 *   onDDL: (context) => {
 *     console.warn('DDL operation detected:', context.queryType);
 *   }
 * }));
 * ```
 * 
 * @example Filter specific query types
 * ```typescript
 * registerPlugin(QueryTypeDetectorPlugin({
 *   monitorTypes: ['INSERT', 'UPDATE', 'DELETE'],
 *   onQueryType: (context) => {
 *     // Only called for INSERT, UPDATE, DELETE
 *     console.log(`Write operation: ${context.queryType}`);
 *   }
 * }));
 * ```
 */
export function QueryTypeDetectorPlugin(options: QueryTypeDetectorOptions = {}): QueryHookPlugin {
  const {
    onQueryType,
    onSelect,
    onInsert,
    onUpdate,
    onDelete,
    onDDL,
    onTransaction,
    enableLogging = false,
    monitorTypes = []
  } = options;

  return {
    name: 'QueryTypeDetector',

    // Store query type in registry during query build (early capture)
    onQueryBuild: (context: QueryHookContext) => {
      const queryType = getQueryType(context);
      
      // Store in registry so getExtendedQueryTypeFromSQL() can retrieve it
      const existing = queryMetadataRegistry.get(context.sql);
      if (existing) {
        // Update existing metadata with query type
        queryMetadataRegistry.register(context.sql, {
          ...existing,
          queryTypeExtended: queryType
        });
      } else {
        // Create new metadata entry
        queryMetadataRegistry.register(context.sql, {
          tables: [],
          timestamp: context.timestamp,
          queryTypeExtended: queryType,
          builder: context.builder
        });
      }
    },

    onQueryComplete: (context: QueryExecutionContext) => {
      // Extract query type using expressionMap (preferred) or SQL parsing (fallback)
      const queryType = getQueryType(context);

      // Update registry with final query type
      const existing = queryMetadataRegistry.get(context.sql);
      if (existing) {
        queryMetadataRegistry.register(context.sql, {
          ...existing,
          queryTypeExtended: queryType
        });
      } else {
        queryMetadataRegistry.register(context.sql, {
          tables: [],
          timestamp: context.timestamp,
          queryTypeExtended: queryType,
          builder: context.builder
        });
      }

      // Check if this query type should be monitored
      const shouldMonitor = monitorTypes.length === 0 || monitorTypes.includes(queryType);
      if (!shouldMonitor) {
        return;
      }

      const typeContext: QueryTypeContext = {
        builder: context.builder,
        sql: context.sql,
        timestamp: context.timestamp,
        parameters: context.parameters,
        queryType,
        methodName: context.methodName,
        executionTime: context.executionTime
      };

      // Log if enabled
      if (enableLogging) {
        console.log(`[QueryTypeDetector] Query type: ${queryType}`, {
          method: context.methodName,
          executionTime: `${context.executionTime}ms`,
          sql: context.sql.substring(0, 100) + (context.sql.length > 100 ? '...' : '')
        });
      }

      // Call generic query type callback
      if (onQueryType) {
        onQueryType(typeContext);
      }

      // Call specific query type callbacks
      switch (queryType) {
        case 'SELECT':
          if (onSelect) onSelect(typeContext);
          break;
        case 'INSERT':
          if (onInsert) onInsert(typeContext);
          break;
        case 'UPDATE':
          if (onUpdate) onUpdate(typeContext);
          break;
        case 'DELETE':
          if (onDelete) onDelete(typeContext);
          break;
        case 'CREATE':
        case 'ALTER':
        case 'DROP':
        case 'TRUNCATE':
          if (onDDL) onDDL(typeContext);
          break;
        case 'BEGIN':
        case 'COMMIT':
        case 'ROLLBACK':
          if (onTransaction) onTransaction(typeContext);
          break;
      }
    }
  };
}

/**
 * Default Query Type Detector Plugin instance
 * Logs all query types
 */
export const DefaultQueryTypeDetector = QueryTypeDetectorPlugin({
  enableLogging: true
});

