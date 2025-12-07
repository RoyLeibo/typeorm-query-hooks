import { QueryBuilder } from 'typeorm';
import { QueryHookPlugin } from '../index';
import { extractTablesFromBuilder } from './table-extractor';

/**
 * Metadata associated with a query
 */
export interface QueryMetadata {
  tables: string[];
  timestamp: Date;
  queryType?: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
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
    console.log('[QueryMetadataRegistryPlugin] onQueryBuild called!');
    const tables = extractTablesFromBuilder(context.builder);
    const queryType = getQueryType(context.builder);

    console.log('[QueryMetadataRegistryPlugin] Storing SQL - Length:', context.sql.length);
    console.log('[QueryMetadataRegistryPlugin] SQL LAST 150 chars:', context.sql.substring(context.sql.length - 150));
    console.log('[QueryMetadataRegistryPlugin] Extracted:', { tables, queryType });

    const metadata: QueryMetadata = {
      tables,
      timestamp: context.timestamp,
      queryType,
      builder: context.builder
    };

    queryMetadataRegistry.register(context.sql, metadata);
    console.log('[QueryMetadataRegistryPlugin] Registry size now:', queryMetadataRegistry.size());
  }
};

/**
 * Utility function to get tables from SQL (for use in Logger)
 * Falls back to empty array if not found in registry
 */
export function getTablesFromSQL(sql: string): string[] {
  console.log('[getTablesFromSQL] Looking up SQL - Length:', sql.length);
  console.log('[getTablesFromSQL] SQL LAST 150 chars:', sql.substring(sql.length - 150));
  console.log('[getTablesFromSQL] Registry size:', queryMetadataRegistry.size());
  
  const tables = queryMetadataRegistry.getTables(sql);
  
  console.log('[getTablesFromSQL] Found tables:', tables);
  
  return tables;
}

/**
 * Utility function to get query type from SQL (for use in Logger)
 */
export function getQueryTypeFromSQL(sql: string): string | undefined {
  return queryMetadataRegistry.getQueryType(sql);
}

/**
 * Check if query metadata is available
 */
export function hasQueryMetadata(sql: string): boolean {
  return queryMetadataRegistry.has(sql);
}

