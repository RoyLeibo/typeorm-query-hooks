import {
  QueryBuilder,
  SelectQueryBuilder,
  InsertQueryBuilder,
  UpdateQueryBuilder,
  DeleteQueryBuilder
} from 'typeorm';
import { QueryHookPlugin, QueryHookContext } from '../index';

/**
 * Extract table names from raw SQL string
 * Handles SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, TRUNCATE
 * @param sql - Raw SQL string
 * @returns Array of table names found in the SQL
 */
export function extractTablesFromSQL(sql: string): string[] {
  const tables = new Set<string>();
  const upperSQL = sql.toUpperCase();
  
  // Regular expressions for different SQL operations
  const patterns = [
    // SELECT ... FROM table_name
    /FROM\s+([`"]?)(\w+)\1/gi,
    // JOIN table_name
    /JOIN\s+([`"]?)(\w+)\1/gi,
    // INSERT INTO table_name
    /INSERT\s+INTO\s+([`"]?)(\w+)\1/gi,
    // UPDATE table_name
    /UPDATE\s+([`"]?)(\w+)\1/gi,
    // DELETE FROM table_name
    /DELETE\s+FROM\s+([`"]?)(\w+)\1/gi,
    // CREATE TABLE table_name
    /CREATE\s+(?:TABLE|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:UNIQUE\s+)?(?:[`"]?)(\w+)(?:[`"]?)\s+ON\s+([`"]?)(\w+)\2/gi,
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"]?)(\w+)\1/gi,
    // ALTER TABLE table_name
    /ALTER\s+TABLE\s+([`"]?)(\w+)\1/gi,
    // DROP TABLE table_name
    /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([`"]?)(\w+)\1/gi,
    // TRUNCATE table_name
    /TRUNCATE\s+(?:TABLE\s+)?([`"]?)(\w+)\1/gi,
    // CREATE INDEX ... ON table_name
    /\s+ON\s+([`"]?)(\w+)\1\s*\(/gi
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(sql)) !== null) {
      // Get the last captured group (table name)
      const tableName = match[match.length - 1];
      if (tableName && tableName !== 'TABLE' && tableName !== 'EXISTS') {
        tables.add(tableName);
      }
    }
  });
  
  return Array.from(tables);
}

/**
 * Recursively extract table names from a QueryBuilder's internal expressionMap
 * @param builder - The QueryBuilder instance
 * @returns Array of table names involved in the query
 */
export function extractTablesFromBuilder(builder: QueryBuilder<any>): string[] {
  // Wrap entire function in try-catch to ensure we never crash the application
  try {
    const tables = new Set<string>();
    const expressionMap = (builder as any).expressionMap;

    if (!expressionMap) {
      return [];
    }

    // Helper function to extract table name from an alias object
    const extractTableFromAlias = (alias: any) => {
      if (!alias) return;
      
      // Try to get metadata - wrap in try-catch because TypeORM's getter
      // throws an error for dummy aliases (used in EXISTS queries, subqueries, etc.)
      try {
        if (alias.metadata?.tableName) {
          tables.add(alias.metadata.tableName);
          return; // Success, exit early
        }
      } catch (error) {
        // Alias doesn't have valid entity metadata (e.g., dummy_table for EXISTS queries)
        // This is fine, continue to fallback methods
      }
      
      // Fallback methods for extracting table name
      if (alias.tablePath) {
        tables.add(alias.tablePath);
      } else if (alias.tableName) {
        tables.add(alias.tableName);
      } else if (alias.target) {
        // Handle entity constructor references
        if (typeof alias.target === 'function' && alias.target.name) {
          // Try to get metadata from the connection
          const connection = (builder as any).connection;
          if (connection && connection.entityMetadatas) {
            const metadata = connection.entityMetadatas.find((m: any) => m.target === alias.target);
            if (metadata?.tableName) {
              tables.add(metadata.tableName);
            }
          }
        }
      }
    };

    // 1. Main Table (FROM / INTO / UPDATE / DELETE)
    if (expressionMap.mainAlias) {
      extractTableFromAlias(expressionMap.mainAlias);
    }

    // 2. All Aliases (includes FROM and additional sources)
    if (expressionMap.aliases && Array.isArray(expressionMap.aliases)) {
      expressionMap.aliases.forEach((alias: any) => {
        extractTableFromAlias(alias);
      });
    }

    // 3. Joins (LEFT JOIN, INNER JOIN, RIGHT JOIN, FULL JOIN)
    if (expressionMap.joinAttributes && Array.isArray(expressionMap.joinAttributes)) {
      expressionMap.joinAttributes.forEach((join: any) => {
        extractTableFromAlias(join);
        
        // Also check if join has an alias property
        if (join.alias) {
          extractTableFromAlias(join.alias);
        }
      });
    }

    // 4. Relation metadata (specific relation query cases)
    // Note: relationMetadata is only available on SELECT queries
    try {
      if (expressionMap.relationMetadata?.entityMetadata?.tableName) {
        tables.add(expressionMap.relationMetadata.entityMetadata.tableName);
      }
    } catch (error) {
      // Ignore errors accessing relationMetadata on non-SELECT queries
    }

    // 5. Common Table Expressions (CTEs) - WITH clauses
    if (expressionMap.commonTableExpressions && Array.isArray(expressionMap.commonTableExpressions)) {
      expressionMap.commonTableExpressions.forEach((cte: any) => {
        // CTE alias is the virtual table name
        if (cte.alias || cte.name) {
          tables.add(cte.alias || cte.name);
        }
        
        // If CTE has a queryBuilder, recursively extract tables
        if (cte.queryBuilder) {
          const cteTables = extractTablesFromBuilder(cte.queryBuilder);
          cteTables.forEach(t => tables.add(t));
        }
      });
    }

    // 6. Subqueries in SELECT, WHERE, FROM, etc.
    // Check for subQuery in various places
    if (expressionMap.selects && Array.isArray(expressionMap.selects)) {
      expressionMap.selects.forEach((select: any) => {
        if (select.queryBuilder) {
          const subTables = extractTablesFromBuilder(select.queryBuilder);
          subTables.forEach(t => tables.add(t));
        }
      });
    }

    // 7. INSERT from SELECT
    if (expressionMap.insertQueryBuilder) {
      const insertTables = extractTablesFromBuilder(expressionMap.insertQueryBuilder);
      insertTables.forEach(t => tables.add(t));
    }

    // 8. Subqueries in WHERE/HAVING conditions
    if (expressionMap.wheres && Array.isArray(expressionMap.wheres)) {
      expressionMap.wheres.forEach((where: any) => {
        if (where.queryBuilder) {
          const whereTables = extractTablesFromBuilder(where.queryBuilder);
          whereTables.forEach(t => tables.add(t));
        }
      });
    }

    // 9. Additional FROM sources (less common but possible)
    if (expressionMap.fromExpression) {
      extractTableFromAlias(expressionMap.fromExpression);
    }

    return Array.from(tables);
  } catch (error) {
    // If anything goes wrong, log the error and return empty array
    // This ensures the library doesn't crash, just returns no tables
    console.error('[TableExtractor] Error extracting tables from QueryBuilder:', error);
    return [];
  }
}

/**
 * Type augmentation to add getInvolvedTables() method to all QueryBuilder types
 */
declare module 'typeorm' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface SelectQueryBuilder<Entity> {
    /**
     * Get list of table names involved in this query
     * @returns Array of table names
     */
    getInvolvedTables(): string[];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface InsertQueryBuilder<Entity> {
    /**
     * Get list of table names involved in this query
     * @returns Array of table names
     */
    getInvolvedTables(): string[];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface UpdateQueryBuilder<Entity> {
    /**
     * Get list of table names involved in this query
     * @returns Array of table names
     */
    getInvolvedTables(): string[];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface DeleteQueryBuilder<Entity> {
    /**
     * Get list of table names involved in this query
     * @returns Array of table names
     */
    getInvolvedTables(): string[];
  }
}

/**
 * Callback type for table extraction events
 */
export type TableExtractorCallback = (tables: string[], builder: QueryBuilder<any>, sql: string) => void;

/**
 * Listeners for table extraction events
 */
const tableExtractorListeners: TableExtractorCallback[] = [];

/**
 * Register a listener to be called whenever tables are extracted from a query
 * @param callback - Function to call with extracted tables
 */
export function onTablesExtracted(callback: TableExtractorCallback): void {
  tableExtractorListeners.push(callback);
}

/**
 * Remove a registered listener
 * @param callback - The callback to remove
 */
export function offTablesExtracted(callback: TableExtractorCallback): boolean {
  const index = tableExtractorListeners.indexOf(callback);
  if (index !== -1) {
    tableExtractorListeners.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Options for TableExtractorPlugin
 */
export interface TableExtractorOptions {
  /**
   * Show warning when no tables are extracted from a query (default: false)
   * When true, warns about queries that don't have extractable table metadata
   * 
   * @deprecated Use onEmptyTables callback instead for custom handling
   */
  warnOnEmptyTables?: boolean;
  
  /**
   * Enable console logging for this plugin (default: false)
   * When true, the plugin will log extracted table names to console
   */
  enableLogging?: boolean;
  
  /**
   * Callback when tables are extracted from a query (optional)
   * 
   * @param tables - Array of extracted table names
   * @param context - Query context
   * 
   * @example
   * ```typescript
   * onTablesExtracted: (tables, context) => {
   *   logger.info(`Query involves tables: ${tables.join(', ')}`);
   * }
   * ```
   */
  onTablesExtracted?: (tables: string[], context: QueryHookContext) => void;
  
  /**
   * Callback when no tables are extracted from a query (optional)
   * Use this instead of warnOnEmptyTables for custom warning handling
   * 
   * @param context - Query context
   * 
   * @example
   * ```typescript
   * onEmptyTables: (context) => {
   *   logger.warn('No tables extracted', {
   *     sql: context.sql,
   *     queryType: context.queryType
   *   });
   * }
   * ```
   */
  onEmptyTables?: (context: QueryHookContext) => void;
  
  /**
   * Callback when a warning occurs during table extraction (optional)
   * 
   * @param message - Warning message
   * @param context - Query context
   * 
   * @example
   * ```typescript
   * onWarning: (message, context) => {
   *   logger.warn(`[TableExtractor] ${message}`);
   * }
   * ```
   */
  onWarning?: (message: string, context: QueryHookContext) => void;
  
  /**
   * Callback when an error occurs during table extraction (optional)
   * 
   * @param error - The error that occurred
   * @param context - Query context
   * 
   * @example
   * ```typescript
   * onError: (error, context) => {
   *   logger.error('Table extraction failed', { error, sql: context.sql });
   * }
   * ```
   */
  onError?: (error: Error, context: QueryHookContext) => void;
}

/**
 * Table Extractor Plugin
 * Adds the ability to extract table names from QueryBuilder instances
 * 
 * @example
 * ```typescript
 * import { registerPlugin } from 'typeorm-query-hooks';
 * import { createTableExtractorPlugin } from 'typeorm-query-hooks/plugins/table-extractor';
 * 
 * registerPlugin(createTableExtractorPlugin({
 *   warnOnEmptyTables: true,  // warn when no tables found (default: false)
 *   enableLogging: false      // log to console (default: false)
 * }));
 * ```
 */
export function createTableExtractorPlugin(options: TableExtractorOptions = {}): QueryHookPlugin {
  const {
    warnOnEmptyTables = false, // default false - only warn if explicitly enabled (deprecated)
    enableLogging = false,
    onTablesExtracted,
    onEmptyTables,
    onWarning,
    onError
  } = options;

  return {
    name: 'TableExtractor',

    onEnable: () => {
      // Add getInvolvedTables method to all QueryBuilder prototypes
      const builders = [
        SelectQueryBuilder,
        InsertQueryBuilder,
        UpdateQueryBuilder,
        DeleteQueryBuilder
      ];

      builders.forEach((BuilderClass) => {
        // Only add if not already present (avoid double-patching)
        if (!(BuilderClass.prototype as any).getInvolvedTables) {
          (BuilderClass.prototype as any).getInvolvedTables = function () {
            return extractTablesFromBuilder(this);
          };
        }
      });
      
      if (enableLogging) {
        console.log('[TableExtractor] Enabled - will capture both QueryBuilder and raw SQL queries');
      }
    },

    // Handle raw SQL queries (DDL, migrations, etc.)
    onRawQuery: (context) => {
      try {
        // Extract tables from raw SQL
        const tables = extractTablesFromSQL(context.sql);
        
        // Call onTablesExtracted callback if provided
        // Create a pseudo-context compatible with the existing callback
        if (onTablesExtracted) {
          try {
            const pseudoContext = {
              builder: null as any, // No builder for raw queries
              sql: context.sql,
              timestamp: context.timestamp,
              parameters: context.parameters,
              queryType: undefined
            };
            onTablesExtracted(tables, pseudoContext);
          } catch (err) {
            if (onError) {
              onError(err as Error, {
                builder: null as any,
                sql: context.sql,
                timestamp: context.timestamp,
                parameters: context.parameters
              });
            } else if (enableLogging) {
              console.error('[TableExtractor] onTablesExtracted callback failed:', err);
            }
          }
        }
        
        // Handle empty tables
        if (tables.length === 0) {
          const message = `No tables extracted from raw SQL query. SQL: ${context.sql.substring(0, 100)}`;
          
          // Call onEmptyTables callback if provided
          if (onEmptyTables) {
            try {
              onEmptyTables({
                builder: null as any,
                sql: context.sql,
                timestamp: context.timestamp,
                parameters: context.parameters
              });
            } catch (err) {
              if (onError) {
                onError(err as Error, {
                  builder: null as any,
                  sql: context.sql,
                  timestamp: context.timestamp,
                  parameters: context.parameters
                });
              } else if (enableLogging) {
                console.error('[TableExtractor] onEmptyTables callback failed:', err);
              }
            }
          }
          
          // Call onWarning callback if provided
          if (onWarning) {
            try {
              onWarning(message, {
                builder: null as any,
                sql: context.sql,
                timestamp: context.timestamp,
                parameters: context.parameters
              });
            } catch (err) {
              if (onError) {
                onError(err as Error, {
                  builder: null as any,
                  sql: context.sql,
                  timestamp: context.timestamp,
                  parameters: context.parameters
                });
              } else if (enableLogging) {
                console.error('[TableExtractor] onWarning callback failed:', err);
              }
            }
          }
          
          // Deprecated: warnOnEmptyTables
          if (warnOnEmptyTables && !onEmptyTables && !onWarning) {
            console.warn(`[TableExtractor] ⚠️  ${message}`);
          }
        }

        if (enableLogging) {
          if (tables.length > 0) {
            console.log(`[TableExtractor] Raw SQL - Extracted ${tables.length} table(s):`, tables);
          } else {
            console.log(`[TableExtractor] Raw SQL - No tables extracted from:`, context.sql.substring(0, 100));
          }
        }
      } catch (err) {
        // Handle extraction errors
        if (onError) {
          onError(err as Error, {
            builder: null as any,
            sql: context.sql,
            timestamp: context.timestamp,
            parameters: context.parameters
          });
        } else if (enableLogging) {
          console.error('[TableExtractor] Raw SQL table extraction failed:', err);
        }
      }
    },

    onQueryBuild: (context) => {
      try {
        // Extract tables and notify listeners
        const tables = extractTablesFromBuilder(context.builder);
        
        // Call onTablesExtracted callback if provided
        if (onTablesExtracted) {
          try {
            onTablesExtracted(tables, context);
          } catch (err) {
            if (onError) {
              onError(err as Error, context);
            } else if (enableLogging) {
              console.error('[TableExtractor] onTablesExtracted callback failed:', err);
            }
          }
        }
        
        // Handle empty tables
        if (tables.length === 0) {
          const operationType = context.queryType ? String(context.queryType).toUpperCase() : 'UNKNOWN';
          const message = `No tables extracted from ${operationType} query. ` +
            `This might indicate an issue with table extraction or a raw query without table metadata.`;
          
          // Call onEmptyTables callback if provided
          if (onEmptyTables) {
            try {
              onEmptyTables(context);
            } catch (err) {
              if (onError) {
                onError(err as Error, context);
              } else if (enableLogging) {
                console.error('[TableExtractor] onEmptyTables callback failed:', err);
              }
            }
          }
          
          // Call onWarning callback if provided
          if (onWarning) {
            try {
              onWarning(message, context);
            } catch (err) {
              if (onError) {
                onError(err as Error, context);
              } else if (enableLogging) {
                console.error('[TableExtractor] onWarning callback failed:', err);
              }
            }
          }
          
          // Deprecated: warnOnEmptyTables (kept for backward compatibility)
          if (warnOnEmptyTables && !onEmptyTables && !onWarning) {
            console.warn(
              `[TableExtractor] ⚠️  ${message}`,
              {
                queryType: operationType,
                sqlPreview: context.sql.substring(0, 150) + (context.sql.length > 150 ? '...' : '')
              }
            );
          }
        }

        if (enableLogging && tables.length > 0) {
          console.log(`[TableExtractor] Extracted ${tables.length} table(s):`, tables);
        }
        
        // Notify global listeners (backward compatibility)
        tableExtractorListeners.forEach(listener => {
          try {
            listener(tables, context.builder, context.sql);
          } catch (err) {
            if (onError) {
              onError(err as Error, context);
            } else if (enableLogging) {
              console.warn('[TableExtractor] Global listener failed:', err);
            }
          }
        });
      } catch (err) {
        // Handle extraction errors
        if (onError) {
          onError(err as Error, context);
        } else if (enableLogging) {
          console.error('[TableExtractor] Table extraction failed:', err);
        }
      }
    }
  };
}

/**
 * Default Table Extractor Plugin (for backward compatibility)
 * Uses default options: warnOnEmptyTables = true, enableLogging = false
 */
export const TableExtractorPlugin: QueryHookPlugin = createTableExtractorPlugin();

