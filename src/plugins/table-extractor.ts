import {
  QueryBuilder,
  SelectQueryBuilder,
  InsertQueryBuilder,
  UpdateQueryBuilder,
  DeleteQueryBuilder
} from 'typeorm';
import { QueryHookPlugin } from '../index';

/**
 * Recursively extract table names from a QueryBuilder's internal expressionMap
 * @param builder - The QueryBuilder instance
 * @returns Array of table names involved in the query
 */
export function extractTablesFromBuilder(builder: QueryBuilder<any>): string[] {
  const tables = new Set<string>();
  const expressionMap = (builder as any).expressionMap;

  if (!expressionMap) {
    return [];
  }

  // Helper function to extract table name from an alias object
  const extractTableFromAlias = (alias: any) => {
    if (!alias) return;
    
    if (alias.metadata?.tableName) {
      tables.add(alias.metadata.tableName);
    } else if (alias.tablePath) {
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
   * Show warning when no tables are extracted from a query (default: true)
   */
  warnOnEmptyTables?: boolean;
  
  /**
   * Enable console logging (default: false)
   */
  enableLogging?: boolean;
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
 *   warnOnEmptyTables: true,
 *   enableLogging: false
 * }));
 * ```
 */
export function createTableExtractorPlugin(options: TableExtractorOptions = {}): QueryHookPlugin {
  const {
    warnOnEmptyTables = true,
    enableLogging = false
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
    },

    onQueryBuild: (context) => {
      // Extract tables and notify listeners
      const tables = extractTablesFromBuilder(context.builder);
      
      // Warn if no tables were extracted (if warnings are enabled)
      if (warnOnEmptyTables && tables.length === 0) {
        const operationType = context.queryType ? String(context.queryType).toUpperCase() : 'UNKNOWN';
        console.warn(
          `[TableExtractor] ⚠️  No tables extracted from ${operationType} query. ` +
          `This might indicate an issue with table extraction or a raw query without table metadata.`,
          {
            queryType: operationType,
            sqlPreview: context.sql.substring(0, 150) + (context.sql.length > 150 ? '...' : '')
          }
        );
      }

      if (enableLogging && tables.length > 0) {
        console.log(`[TableExtractor] Extracted ${tables.length} table(s):`, tables);
      }
      
      tableExtractorListeners.forEach(listener => {
        try {
          listener(tables, context.builder, context.sql);
        } catch (err) {
          console.warn('[TableExtractorPlugin] Listener failed:', err);
        }
      });
    }
  };
}

/**
 * Default Table Extractor Plugin (for backward compatibility)
 * Uses default options: warnOnEmptyTables = true, enableLogging = false
 */
export const TableExtractorPlugin: QueryHookPlugin = createTableExtractorPlugin();

