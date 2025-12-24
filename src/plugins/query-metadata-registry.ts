import { QueryBuilder } from 'typeorm';
import { QueryHookPlugin } from '../index';
import { extractTablesFromBuilder } from './table-extractor';
import { queryContextStore } from '../context-store';

/**
 * Extended query type (includes DDL, transactions, etc.)
 * This is separate from TypeORM's limited queryType
 */
export type ExtendedQueryType = 
  | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
  | 'CREATE' | 'ALTER' | 'DROP' | 'TRUNCATE'
  | 'BEGIN' | 'COMMIT' | 'ROLLBACK'
  | 'WITH' | 'OTHER';

/**
 * Metadata associated with a query
 */
export interface QueryMetadata {
  tables: string[];
  timestamp: Date;
  queryType?: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'; // TypeORM's limited type
  queryTypeExtended?: ExtendedQueryType; // Extended type from QueryTypeDetector
  builder?: QueryBuilder<any>;
}

/**
 * Registry that maps SQL strings to their metadata
 * This allows Logger implementations to look up table information from raw SQL
 */
class QueryMetadataRegistry {
  private registry = new Map<string, QueryMetadata>();
  private maxSize = 10000; // Prevent memory leaks
  private cleanupThreshold = 60000; // 1 minute

  /**
   * Normalize SQL for consistent lookup
   * Removes extra whitespace and normalizes case
   */
  private normalizeSQL(sql: string): string {
    // More aggressive normalization to handle edge cases:
    // 1. Convert to lowercase
    // 2. Replace all whitespace (including newlines, tabs) with single space
    // 3. Remove spaces around punctuation
    // 4. Trim
    return sql
      .toLowerCase()
      .replace(/\s+/g, ' ')  // All whitespace to single space
      .replace(/\s*([(),;])\s*/g, '$1')  // Remove spaces around punctuation
      .trim();
  }

  /**
   * Register metadata for a SQL query
   */
  register(sql: string, metadata: QueryMetadata): void {
    const key = this.normalizeSQL(sql);
    this.registry.set(key, metadata);

    // Cleanup old entries if registry gets too large
    if (this.registry.size > this.maxSize) {
      this.cleanup();
    }
  }

  /**
   * Retrieve metadata for a SQL query
   */
  get(sql: string): QueryMetadata | undefined {
    const key = this.normalizeSQL(sql);
    return this.registry.get(key);
  }

  /**
   * Get tables from SQL query
   * Returns empty array if not found
   */
  getTables(sql: string): string[] {
    const metadata = this.get(sql);
    return metadata?.tables || [];
  }

  /**
   * Get query type from SQL query
   */
  getQueryType(sql: string): string | undefined {
    const metadata = this.get(sql);
    return metadata?.queryType;
  }

  /**
   * Check if metadata exists for a query
   */
  has(sql: string): boolean {
    const key = this.normalizeSQL(sql);
    return this.registry.has(key);
  }

  /**
   * Remove old entries to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];

    this.registry.forEach((metadata, key) => {
      const age = now - metadata.timestamp.getTime();
      if (age > this.cleanupThreshold) {
        entriesToDelete.push(key);
      }
    });

    entriesToDelete.forEach(key => this.registry.delete(key));

    // If still too large, remove oldest entries
    if (this.registry.size > this.maxSize) {
      const entries = Array.from(this.registry.entries())
        .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());
      
      const toRemove = entries.slice(0, this.registry.size - this.maxSize);
      toRemove.forEach(([key]) => this.registry.delete(key));
    }
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.registry.clear();
  }

  /**
   * Get registry size
   */
  size(): number {
    return this.registry.size;
  }
}

/**
 * Global singleton instance
 */
export const queryMetadataRegistry = new QueryMetadataRegistry();

/**
 * Determine query type from QueryBuilder
 */
function getQueryType(builder: QueryBuilder<any>): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | undefined {
  const type = (builder as any).expressionMap?.queryType;
  if (type) {
    return type.toUpperCase();
  }
  
  // Fallback: check constructor name
  const constructorName = builder.constructor.name;
  if (constructorName.includes('Select')) return 'SELECT';
  if (constructorName.includes('Insert')) return 'INSERT';
  if (constructorName.includes('Update')) return 'UPDATE';
  if (constructorName.includes('Delete')) return 'DELETE';
  
  return undefined;
}

/**
 * Plugin that automatically registers query metadata in the global registry
 * This allows TypeORM Logger implementations to look up table information
 */
export const QueryMetadataRegistryPlugin: QueryHookPlugin = {
  name: 'QueryMetadataRegistry',

  onQueryBuild: (context) => {
    const tables = extractTablesFromBuilder(context.builder);
    const queryType = getQueryType(context.builder);

    if (process.env.TYPEORM_QUERY_HOOKS_VERBOSE === 'true') {
      console.log('[typeorm-query-hooks] QueryMetadataRegistryPlugin - Extracted tables:', tables, 'queryType:', queryType);
    }

    const metadata: QueryMetadata = {
      tables,
      timestamp: context.timestamp,
      queryType,
      builder: context.builder
    };

    queryMetadataRegistry.register(context.sql, metadata);
  }
};

/**
 * Utility function to get tables from SQL (for use in Logger)
 * Falls back to empty array if not found in registry
 */
export function getTablesFromSQL(sql: string): string[] {
  // PRIORITY 1: Get from AsyncLocalStorage context (QueryBuilder queries)
  // This is set BEFORE execution, so it's available when logger is called
  try {
    const context = queryContextStore.getStore();
    if (context && context.tables && context.tables.length > 0) {
      if (process.env.TYPEORM_QUERY_HOOKS_VERBOSE === 'true') {
        console.log('[typeorm-query-hooks] getTablesFromSQL - Found from AsyncLocalStorage:', context.tables);
      }
      return context.tables;
    }
  } catch (err) {
    // Fallback to next method
  }
  
  // PRIORITY 2: Try registry lookup (for post-execution lookups)
  const tables = queryMetadataRegistry.getTables(sql);
  if (tables.length > 0) {
    if (process.env.TYPEORM_QUERY_HOOKS_VERBOSE === 'true') {
      console.log('[typeorm-query-hooks] getTablesFromSQL - Found from registry:', tables);
    }
    return tables;
  }
  
  // PRIORITY 3: For raw SQL queries (COMMIT, START TRANSACTION, etc.)
  // that bypass QueryBuilder entirely, return empty array
  // DON'T use extractTablesFromSQL() because it picks up SQL keywords incorrectly
  if (process.env.TYPEORM_QUERY_HOOKS_VERBOSE === 'true') {
    console.log('[typeorm-query-hooks] getTablesFromSQL - No tables found (raw SQL or not tracked)');
  }
  
  return [];
}

/**
 * Format table names as a comma-separated string with spaces
 * @param tables - Array of table names
 * @returns Formatted string like "users, posts, comments" or empty string if no tables
 * 
 * @example
 * ```typescript
 * const tables = getTablesFromSQL(sql);
 * const formatted = formatTableNames(tables); // "users, posts"
 * ```
 */
export function formatTableNames(tables: string[]): string {
  return tables.join(', ');
}

/**
 * Utility function to get query type from SQL (for use in Logger)
 * This returns TypeORM's basic query type (SELECT/INSERT/UPDATE/DELETE)
 */
export function getQueryTypeFromSQL(sql: string): string | undefined {
  return queryMetadataRegistry.getQueryType(sql);
}

/**
 * Utility function to get extended query type from SQL (for use in Logger)
 * This includes DDL, transactions, and other types beyond basic CRUD
 * 
 * @example
 * ```typescript
 * import { getExtendedQueryTypeFromSQL } from 'typeorm-query-hooks';
 * 
 * // In your logger
 * const queryType = getExtendedQueryTypeFromSQL(sql);
 * console.log(queryType); // "SELECT", "CREATE", "BEGIN", etc.
 * ```
 */
export function getExtendedQueryTypeFromSQL(sql: string): ExtendedQueryType | undefined {
  // PRIORITY 1: Get from AsyncLocalStorage context (QueryBuilder queries)
  // This is set BEFORE execution, so it's available when logger is called
  try {
    const context = queryContextStore.getStore();
    if (context && context.queryType) {
      // Convert TypeORM's queryType to ExtendedQueryType
      return context.queryType.toUpperCase() as ExtendedQueryType;
    }
  } catch (err) {
    // Fallback to next method
  }
  
  // PRIORITY 2: Try registry lookup (for post-execution lookups)
  const metadata = queryMetadataRegistry.get(sql);
  if (metadata?.queryTypeExtended) {
    return metadata.queryTypeExtended;
  }
  
  // PRIORITY 3: Return undefined for queries not tracked
  return undefined;
}

/**
 * Check if query metadata is available
 */
export function hasQueryMetadata(sql: string): boolean {
  return queryMetadataRegistry.has(sql);
}

