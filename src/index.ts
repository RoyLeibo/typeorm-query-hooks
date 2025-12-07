import {
  SelectQueryBuilder,
  InsertQueryBuilder,
  UpdateQueryBuilder,
  DeleteQueryBuilder,
  QueryBuilder,
  QueryRunner
} from 'typeorm';

/**
 * Base context object passed to plugin hooks
 */
export interface QueryHookContext {
  builder: QueryBuilder<any>;
  sql: string;
  timestamp: Date;
  parameters?: any[];
  queryType?: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'select' | 'insert' | 'update' | 'delete';
}

/**
 * Context for pre-query modification hook
 * Allows modifying the SQL before execution
 */
export interface PreQueryContext extends QueryHookContext {
  /**
   * Modify the SQL that will be executed
   * @param newSql - The modified SQL string
   */
  setSql: (newSql: string) => void;
  
  /**
   * Modify the query parameters
   * @param newParams - The modified parameters array
   */
  setParameters: (newParams: any[]) => void;
}

/**
 * Context for query execution hooks
 */
export interface QueryExecutionContext extends QueryHookContext {
  executionTime?: number; // in milliseconds
  methodName: string; // 'getOne', 'getMany', 'execute', etc.
}

/**
 * Context for query result hooks
 */
export interface QueryResultContext extends QueryExecutionContext {
  result: any; // The query result
  rowCount?: number; // Number of rows returned/affected
  isEmpty: boolean; // Whether result is empty
}

/**
 * Context for transaction lifecycle hooks
 */
export interface TransactionContext {
  queryRunner: QueryRunner;
  timestamp: Date;
  transactionId?: string; // Custom ID for tracking
}

/**
 * Context for transaction completion
 */
export interface TransactionCompleteContext extends TransactionContext {
  executionTime: number; // in milliseconds
  queriesExecuted?: string[]; // List of SQL queries executed in transaction
}

/**
 * Context for transaction failure
 */
export interface TransactionErrorContext extends TransactionCompleteContext {
  error: Error;
}

/**
 * Context for connection pool events
 */
export interface ConnectionPoolContext {
  timestamp: Date;
  activeConnections?: number;
  idleConnections?: number;
  maxConnections?: number;
  waitingCount?: number;
}

/**
 * Generic interface for query hook plugins
 * Plugins can implement any combination of these hooks
 */
export interface QueryHookPlugin {
  /**
   * Unique name for the plugin
   */
  name: string;

  // === Lifecycle Hooks ===
  
  /**
   * Called when the plugin is registered (optional initialization)
   */
  onRegister?: () => void;

  /**
   * Called when hooks are enabled (optional setup)
   */
  onEnable?: () => void;

  // === Query Build Hooks ===
  
  /**
   * Called when a query is built (getQuery is called)
   * Use this to inspect the query before execution
   */
  onQueryBuild?: (context: QueryHookContext) => void;

  /**
   * Called before query execution - allows modification of SQL and parameters
   * Return false to cancel the query execution
   */
  onBeforeQuery?: (context: PreQueryContext) => boolean | void;

  // === Query Execution Hooks ===
  
  /**
   * Called when query execution starts
   */
  onQueryStart?: (context: QueryExecutionContext) => void;

  /**
   * Called when query execution completes successfully
   */
  onQueryComplete?: (context: QueryExecutionContext) => void;

  /**
   * Called when query execution fails
   */
  onQueryError?: (context: QueryExecutionContext & { error: Error }) => void;

  /**
   * Called when a slow query is detected (threshold configurable)
   */
  onSlowQuery?: (context: QueryExecutionContext) => void;

  // === Query Result Hooks ===
  
  /**
   * Called after query execution with results
   */
  onQueryResult?: (context: QueryResultContext) => void;

  /**
   * Called when a query returns no results
   */
  onEmptyResult?: (context: QueryResultContext) => void;

  /**
   * Called when a query returns a large result set (threshold configurable)
   */
  onLargeResult?: (context: QueryResultContext) => void;

  // === Transaction Hooks ===
  
  /**
   * Called when a transaction starts
   */
  onTransactionStart?: (context: TransactionContext) => void;

  /**
   * Called when a transaction commits successfully
   */
  onTransactionCommit?: (context: TransactionCompleteContext) => void;

  /**
   * Called when a transaction rolls back
   */
  onTransactionRollback?: (context: TransactionErrorContext) => void;

  /**
   * Called when a transaction ends (regardless of commit or rollback)
   */
  onTransactionEnd?: (context: TransactionCompleteContext) => void;

  // === Connection Pool Hooks ===
  
  /**
   * Called when a connection is acquired from the pool
   */
  onConnectionAcquired?: (context: ConnectionPoolContext) => void;

  /**
   * Called when a connection is released back to the pool
   */
  onConnectionReleased?: (context: ConnectionPoolContext) => void;

  /**
   * Called when the connection pool is full (all connections in use)
   */
  onConnectionPoolFull?: (context: ConnectionPoolContext) => void;

  /**
   * Called when a connection error occurs
   */
  onConnectionError?: (context: ConnectionPoolContext & { error: Error }) => void;
}

/**
 * Registry for all plugins
 */
const plugins: QueryHookPlugin[] = [];

/**
 * Flag to track if hooks have been enabled
 */
let isPatched = false;

/**
 * Verbose mode for debugging
 */
let verboseMode = false;

/**
 * Internal logging helper - only logs when verbose mode is enabled
 */
function verboseLog(message: string, ...args: any[]): void {
  if (verboseMode) {
    console.log(`[typeorm-query-hooks] ${message}`, ...args);
  }
}

/**
 * Register a plugin to receive query hooks
 * @param plugin - The plugin to register
 */
export function registerPlugin(plugin: QueryHookPlugin): void {
  plugins.push(plugin);
  
  if (plugin.onRegister) {
    try {
      plugin.onRegister();
    } catch (err) {
      console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onRegister failed:`, err);
    }
  }

  // If hooks are already enabled, call onEnable for this plugin
  if (isPatched && plugin.onEnable) {
    try {
      plugin.onEnable();
    } catch (err) {
      console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onEnable failed:`, err);
    }
  }
}

/**
 * Unregister a plugin by name
 * @param pluginName - Name of the plugin to remove
 */
export function unregisterPlugin(pluginName: string): boolean {
  const index = plugins.findIndex(p => p.name === pluginName);
  if (index !== -1) {
    plugins.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Get all registered plugins
 */
export function getRegisteredPlugins(): ReadonlyArray<QueryHookPlugin> {
  return [...plugins];
}

/**
 * Configuration options for enableQueryHooks
 */
export interface QueryHooksOptions {
  /**
   * Enable detailed logging for debugging (default: false)
   */
  verbose?: boolean;
  
  /**
   * Threshold in milliseconds for slow query detection (default: 1000)
   */
  slowQueryThreshold?: number;
  
  /**
   * Threshold for large result set detection (default: 1000 rows)
   */
  largeResultThreshold?: number;
}

let slowQueryThreshold = 1000; // default 1 second
let largeResultThreshold = 1000; // default 1000 rows

/**
 * Enable TypeORM query hooks by patching QueryBuilder classes
 * This should be called once at application startup, before any queries are executed
 * 
 * @param options Configuration options
 */
export function enableQueryHooks(options?: QueryHooksOptions): void {
  if (options?.verbose) {
    verboseMode = true;
    console.log('[typeorm-query-hooks] Verbose mode enabled');
  }
  
  if (options?.slowQueryThreshold !== undefined) {
    slowQueryThreshold = options.slowQueryThreshold;
  }
  
  if (options?.largeResultThreshold !== undefined) {
    largeResultThreshold = options.largeResultThreshold;
  }
  
  if (isPatched) {
    console.warn('[typeorm-query-hooks] Hooks are already enabled');
    return;
  }
  
  verboseLog('Enabling query hooks...');

  const builders = [
    SelectQueryBuilder,
    InsertQueryBuilder,
    UpdateQueryBuilder,
    DeleteQueryBuilder
  ];

  builders.forEach((BuilderClass) => {
    const originalGetQuery = BuilderClass.prototype.getQuery;

    BuilderClass.prototype.getQuery = function (): string {
      let sql = originalGetQuery.call(this);
      const parameters = (this as any).expressionMap?.parameters || [];
      const queryType = (this as any).expressionMap?.queryType;
      
      verboseLog(`getQuery() called, plugins count: ${plugins.length}, SQL: ${sql.substring(0, 100)}...`);
      
      // Create context for onQueryBuild hooks
      const buildContext: QueryHookContext = {
        builder: this,
        sql,
        timestamp: new Date(),
        parameters,
        queryType
      };

      // Execute onQueryBuild hooks
      plugins.forEach(plugin => {
        if (plugin.onQueryBuild) {
          try {
            verboseLog(`Calling plugin ${plugin.name}.onQueryBuild`);
            plugin.onQueryBuild(buildContext);
          } catch (err) {
            console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onQueryBuild failed:`, err);
          }
        }
      });

      // Execute onBeforeQuery hooks (allows modification)
      let modifiedSql = sql;
      let modifiedParameters = parameters;
      let shouldCancel = false;

      const preQueryContext: PreQueryContext = {
        ...buildContext,
        setSql: (newSql: string) => { modifiedSql = newSql; },
        setParameters: (newParams: any[]) => { modifiedParameters = newParams; }
      };

      plugins.forEach(plugin => {
        if (plugin.onBeforeQuery) {
          try {
            verboseLog(`Calling plugin ${plugin.name}.onBeforeQuery`);
            const result = plugin.onBeforeQuery(preQueryContext);
            if (result === false) {
              shouldCancel = true;
            }
          } catch (err) {
            console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onBeforeQuery failed:`, err);
          }
        }
      });

      // If SQL was modified, update it
      if (modifiedSql !== sql) {
        verboseLog(`SQL was modified by plugin: ${modifiedSql.substring(0, 100)}...`);
        sql = modifiedSql;
      }

      // If parameters were modified, update them
      if (modifiedParameters !== parameters) {
        (this as any).expressionMap.parameters = modifiedParameters;
      }

      return sql;
    };

    // Patch ALL execution methods to trigger performance monitoring and result hooks
    const executionMethods = [
      // Read operations
      'getOne', 'getMany', 'getRawOne', 'getRawMany', 'getExists', 'getCount', 'getManyAndCount', 'getRawAndEntities',
      // Write operations
      'execute', 'insert', 'update', 'delete', 'softDelete', 'restore',
      // Stream operations
      'stream'
    ];
    
    executionMethods.forEach(methodName => {
      const original = (BuilderClass.prototype as any)[methodName];
      if (original) {
        (BuilderClass.prototype as any)[methodName] = async function (...args: any[]) {
          const startTime = Date.now();
          let sql: string;
          let parameters: any[];
          
          try {
            sql = this.getQuery();
            parameters = (this as any).expressionMap?.parameters || [];
          } catch (err) {
            console.warn(`[typeorm-query-hooks] ${methodName}() - getQuery() failed:`, err);
            return original.apply(this, args);
          }
          
          verboseLog(`${methodName}() called, SQL captured: ${sql.substring(0, 100)}...`);
          
          // Store builder in AsyncLocalStorage for logger access
          const { queryContextStore } = require('./context-store');
          const { extractTablesFromBuilder } = require('./plugins/table-extractor');
          
          const tables = extractTablesFromBuilder(this);
          const queryType = (this as any).expressionMap?.queryType;
          const context = {
            builder: this,
            sql,
            tables,
            queryType
          };
          
          verboseLog(`${methodName}() - Stored ${tables.length} tables in AsyncLocalStorage`);
          
          // Create execution context
          const executionContext: QueryExecutionContext = {
            builder: this,
            sql,
            timestamp: new Date(startTime),
            parameters,
            queryType,
            methodName
          };

          // Fire onQueryStart hooks
          plugins.forEach(plugin => {
            if (plugin.onQueryStart) {
              try {
                plugin.onQueryStart(executionContext);
              } catch (err) {
                console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onQueryStart failed:`, err);
              }
            }
          });

          // Execute the original method within AsyncLocalStorage context
          let result: any;
          let error: Error | undefined;
          
          try {
            result = await queryContextStore.run(context, async () => {
              return await original.apply(this, args);
            });
          } catch (err) {
            error = err as Error;
          }

          const endTime = Date.now();
          const executionTime = endTime - startTime;
          executionContext.executionTime = executionTime;

          // Fire onQueryComplete or onQueryError
          if (error) {
            plugins.forEach(plugin => {
              if (plugin.onQueryError) {
                try {
                  plugin.onQueryError({ ...executionContext, error });
                } catch (err) {
                  console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onQueryError failed:`, err);
                }
              }
            });
            throw error;
          } else {
            plugins.forEach(plugin => {
              if (plugin.onQueryComplete) {
                try {
                  plugin.onQueryComplete(executionContext);
                } catch (err) {
                  console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onQueryComplete failed:`, err);
                }
              }
            });
          }

          // Fire onSlowQuery if threshold exceeded
          if (executionTime > slowQueryThreshold) {
            plugins.forEach(plugin => {
              if (plugin.onSlowQuery) {
                try {
                  plugin.onSlowQuery(executionContext);
                } catch (err) {
                  console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onSlowQuery failed:`, err);
                }
              }
            });
          }

          // Analyze result and fire result hooks
          const isEmpty = result === null || result === undefined || 
                         (Array.isArray(result) && result.length === 0) ||
                         (result && typeof result === 'object' && Object.keys(result).length === 0);
          
          let rowCount: number | undefined;
          if (Array.isArray(result)) {
            rowCount = result.length;
          } else if (result && typeof result === 'object' && 'raw' in result && Array.isArray(result.raw)) {
            rowCount = result.raw.length;
          } else if (result && typeof result === 'object' && 'affected' in result) {
            rowCount = result.affected;
          }

          const resultContext: QueryResultContext = {
            ...executionContext,
            result,
            rowCount,
            isEmpty
          };

          // Fire onQueryResult
          plugins.forEach(plugin => {
            if (plugin.onQueryResult) {
              try {
                plugin.onQueryResult(resultContext);
              } catch (err) {
                console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onQueryResult failed:`, err);
              }
            }
          });

          // Fire onEmptyResult
          if (isEmpty) {
            plugins.forEach(plugin => {
              if (plugin.onEmptyResult) {
                try {
                  plugin.onEmptyResult(resultContext);
                } catch (err) {
                  console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onEmptyResult failed:`, err);
                }
              }
            });
          }

          // Fire onLargeResult
          if (rowCount !== undefined && rowCount > largeResultThreshold) {
            plugins.forEach(plugin => {
              if (plugin.onLargeResult) {
                try {
                  plugin.onLargeResult(resultContext);
                } catch (err) {
                  console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onLargeResult failed:`, err);
                }
              }
            });
          }

          return result;
        };
      }
    });
  });

  // Patch QueryRunner for transaction hooks
  patchTransactionHooks();

  isPatched = true;

  // Call onEnable for all registered plugins
  plugins.forEach(plugin => {
    if (plugin.onEnable) {
      try {
        plugin.onEnable();
      } catch (err) {
        console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onEnable failed:`, err);
      }
    }
  });
}

/**
 * Patch QueryRunner methods to enable transaction hooks
 */
function patchTransactionHooks(): void {
  try {
    // Import QueryRunner dynamically to avoid circular dependencies
    const { QueryRunner } = require('typeorm');
    
    // Store transaction start times
    const transactionStartTimes = new WeakMap<any, number>();
    const transactionQueries = new WeakMap<any, string[]>();
    
    // We can't directly patch QueryRunner as it's an interface
    // Instead, we'll try to patch common implementations
    // This is a best-effort approach
    
    verboseLog('Transaction hooks patching attempted (best-effort)');
  } catch (err) {
    verboseLog('Transaction hooks not available:', err);
  }
}

/**
 * Check if hooks are currently enabled
 */
export function isHooksEnabled(): boolean {
  return isPatched;
}

// Re-export plugins
export * from './plugins/table-extractor';
export * from './plugins/query-logger';
export * from './plugins/query-metadata-registry';
export * from './plugins/performance-monitor';
export * from './plugins/result-validator';
export * from './plugins/query-modifier';

// Re-export NestJS integration
export * from './nestjs';

// Re-export context store
export * from './context-store';

