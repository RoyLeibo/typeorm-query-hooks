import {
  SelectQueryBuilder,
  InsertQueryBuilder,
  UpdateQueryBuilder,
  DeleteQueryBuilder,
  QueryBuilder,
  QueryRunner,
  DataSource
} from 'typeorm';
import { queryContextStore } from './context-store';
import { extractTablesFromBuilder } from './plugins/table-extractor';

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
 * Context for raw SQL queries (executed via QueryRunner)
 * These queries bypass QueryBuilder and include DDL, raw SQL, migrations, etc.
 */
export interface RawQueryContext {
  sql: string;
  parameters?: any[];
  timestamp: Date;
  queryRunner: QueryRunner;
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

  // === Raw Query Hooks ===
  
  /**
   * Called when a raw SQL query is executed via QueryRunner
   * This captures DDL, migrations, raw SQL, and other queries that bypass QueryBuilder
   */
  onRawQuery?: (context: RawQueryContext) => void;

  /**
   * Called when a raw SQL query completes
   */
  onRawQueryComplete?: (context: RawQueryContext & { executionTime: number; result?: any }) => void;

  /**
   * Called when a raw SQL query fails
   */
  onRawQueryError?: (context: RawQueryContext & { error: Error }) => void;

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
}

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

      // Future enhancement: implement query cancellation
      // if (shouldCancel) { throw new Error('Query cancelled by plugin'); }
      void shouldCancel;

      return sql;
    };

    // Patch ALL execution methods to trigger performance monitoring and result hooks
    // NOTE: 'insert', 'update', 'delete' are BUILDER methods (return builders), not execution methods
    // Only 'execute' actually runs INSERT/UPDATE/DELETE queries
    const executionMethods = [
      // Read operations
      'getOne', 'getMany', 'getRawOne', 'getRawMany', 'getExists', 'getCount', 'getManyAndCount', 'getRawAndEntities',
      // Write operations - only 'execute' (update/delete/insert are builder methods, not execution methods)
      'execute',
      // Stream operations
      'stream'
    ];
    
    executionMethods.forEach(methodName => {
      const original = (BuilderClass.prototype as any)[methodName];
      if (original) {
        (BuilderClass.prototype as any)[methodName] = async function (...args: any[]) {
          // CRITICAL: This library should NEVER throw errors to user code
          // All hook failures should be logged but not propagate
          
          // Declare at outer scope so it's accessible in catch block
          let queryExecutionError: Error | undefined;
          let result: any;
          
          try {
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
          let tables: string[] = [];
          try {
            tables = extractTablesFromBuilder(this);
          } catch (err) {
            console.warn(`[typeorm-query-hooks] ${methodName}() - extractTablesFromBuilder failed:`, err);
            tables = []; // Continue with empty array
          }
          
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
          try {
            result = await queryContextStore.run(context, async () => {
              return await original.apply(this, args);
            });
          } catch (err) {
            queryExecutionError = err as Error;
          }

          const endTime = Date.now();
          const executionTime = endTime - startTime;
          executionContext.executionTime = executionTime;

          // Fire onQueryComplete or onQueryError
          if (queryExecutionError) {
            plugins.forEach(plugin => {
              if (plugin.onQueryError) {
                try {
                  plugin.onQueryError({ ...executionContext, error: queryExecutionError! }); // Non-null assertion since we checked above
                } catch (err) {
                  console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onQueryError failed:`, err);
                }
              }
            });
            // Re-throw the query error (not a hook error, this is the actual query failing)
            throw queryExecutionError;
          }
          
          // Query succeeded, fire onQueryComplete
          plugins.forEach(plugin => {
            if (plugin.onQueryComplete) {
              try {
                plugin.onQueryComplete(executionContext);
              } catch (err) {
                console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onQueryComplete failed:`, err);
              }
            }
          });

          // Analyze result and fire result hooks - WRAP IN TRY-CATCH FOR SAFETY
          try {
            const isEmpty = result === null || result === undefined || 
                           (Array.isArray(result) && result.length === 0) ||
                           (result && typeof result === 'object' && Object.keys(result).length === 0);
            
            let rowCount: number | undefined;
            try {
              if (Array.isArray(result)) {
                rowCount = result.length;
              } else if (result && typeof result === 'object') {
                if ('raw' in result && result.raw && Array.isArray(result.raw)) {
                  rowCount = result.raw.length;
                } else if ('affected' in result) {
                  rowCount = result.affected;
                } else if ('entities' in result && Array.isArray(result.entities)) {
                  rowCount = result.entities.length;
                }
              }
            } catch (err) {
              console.warn(`[typeorm-query-hooks] ${methodName}() - Failed to determine rowCount:`, err);
              rowCount = undefined;
            }

            const resultContext: QueryResultContext = {
              ...executionContext,
              result,
              rowCount,
              isEmpty
            };

            // Fire onQueryResult (plugins decide what to do with the result)
            plugins.forEach(plugin => {
              if (plugin.onQueryResult) {
                try {
                  plugin.onQueryResult(resultContext);
                } catch (err) {
                  console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onQueryResult failed:`, err);
                }
              }
            });

            // Fire onEmptyResult (plugins decide if they care about empty results)
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

            // Fire onLargeResult (plugins decide what is "large")
            plugins.forEach(plugin => {
              if (plugin.onLargeResult) {
                try {
                  plugin.onLargeResult(resultContext);
                } catch (err) {
                  console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onLargeResult failed:`, err);
                }
              }
            });

            // Fire onSlowQuery (plugins decide what is "slow")
            plugins.forEach(plugin => {
              if (plugin.onSlowQuery) {
                try {
                  plugin.onSlowQuery(executionContext);
                } catch (err) {
                  console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onSlowQuery failed:`, err);
                }
              }
            });
          } catch (resultProcessingError) {
            // If result processing fails, log but continue
            console.warn(`[typeorm-query-hooks] ${methodName}() - Result processing failed:`, resultProcessingError);
          }

          return result;
          } catch (hookError) {
            // CRITICAL: Determine what type of error this is to handle it correctly
            // There are three scenarios:
            // 1. Query itself failed (queryExecutionError is set, and we already threw it at line 526)
            // 2. Hook system failed BEFORE query execution (queryExecutionError is undefined, result is undefined)
            // 3. Hook system failed AFTER query execution (queryExecutionError is undefined, result is defined)
            
            const isQueryError = queryExecutionError !== undefined;
            const hasResult = result !== undefined;
            
            if (isQueryError) {
              // Scenario 1: Query failed, we already handled error hooks, just re-throw
              throw hookError;
            }
            
            if (hasResult) {
              // Scenario 3: Query succeeded but post-processing failed
              // Log the error but return the result (don't break user's query)
              console.error(`[typeorm-query-hooks] CRITICAL: Hook system error AFTER query execution in ${methodName}():`, hookError);
              console.error('[typeorm-query-hooks] Returning query result despite hook failure');
              return result;
            }
            
            // Scenario 2: Hook system failed BEFORE query execution
            // Try to execute query without hooks
            console.error(`[typeorm-query-hooks] CRITICAL: Hook system error BEFORE query execution in ${methodName}():`, hookError);
            console.error('[typeorm-query-hooks] Attempting to execute query without hooks...');
            
            try {
              return await original.apply(this, args);
            } catch (fallbackError) {
              // Fallback also failed - this is a real query error
              console.error(`[typeorm-query-hooks] Query execution failed:`, fallbackError);
              throw fallbackError;
            }
          }
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
 * Patch QueryRunner to capture raw SQL queries (DDL, migrations, etc.)
 * This patches DataSource.createQueryRunner() to intercept QueryRunner creation
 */
function patchTransactionHooks(): void {
  try {
    // Patch DataSource.prototype.createQueryRunner to intercept QueryRunner creation
    const originalCreateQueryRunner = DataSource.prototype.createQueryRunner;
    
    DataSource.prototype.createQueryRunner = function(mode?: 'master' | 'slave'): QueryRunner {
      const queryRunner = originalCreateQueryRunner.call(this, mode);
      
      // Patch this QueryRunner instance's query() method
      patchQueryRunnerInstance(queryRunner);
      
      verboseLog('QueryRunner created and patched for raw query hooks');
      return queryRunner;
    };
    
    verboseLog('QueryRunner patching successful - raw SQL queries will be captured');
  } catch (err) {
    verboseLog('QueryRunner patching failed:', err);
    console.warn('[typeorm-query-hooks] Failed to patch QueryRunner - raw SQL queries will not be captured:', err);
  }
}

/**
 * Patch a specific QueryRunner instance to capture raw SQL
 */
function patchQueryRunnerInstance(queryRunner: QueryRunner): void {
  // Safety check: don't patch if already patched
  if ((queryRunner as any).__queryHooksPatched) {
    return;
  }
  
  // Safety check: ensure query method exists
  if (typeof queryRunner.query !== 'function') {
    verboseLog('QueryRunner.query is not a function, skipping patch');
    return;
  }
  
  const originalQuery = queryRunner.query.bind(queryRunner);
  
  queryRunner.query = async function(query: string, parameters?: any[]): Promise<any> {
    // CRITICAL: Wrap everything in try-catch to never break user code
    try {
      const startTime = Date.now();
      
      const context: RawQueryContext = {
        sql: query,
        parameters,
        timestamp: new Date(startTime),
        queryRunner
      };
      
      // Call onRawQuery hooks
      plugins.forEach(plugin => {
        if (plugin.onRawQuery) {
          try {
            verboseLog(`Calling plugin ${plugin.name}.onRawQuery`);
            plugin.onRawQuery(context);
          } catch (err) {
            console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onRawQuery failed:`, err);
          }
        }
      });
      
      try {
        // Execute the original query
        const result = await originalQuery(query, parameters);
        const executionTime = Date.now() - startTime;
        
        // Call onRawQueryComplete hooks
        plugins.forEach(plugin => {
          if (plugin.onRawQueryComplete) {
            try {
              plugin.onRawQueryComplete({
                ...context,
                executionTime,
                result
              });
            } catch (err) {
              console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onRawQueryComplete failed:`, err);
            }
          }
        });
        
        return result;
      } catch (error) {
        // Call onRawQueryError hooks
        plugins.forEach(plugin => {
          if (plugin.onRawQueryError) {
            try {
              plugin.onRawQueryError({
                ...context,
                error: error as Error
              });
            } catch (err) {
              console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onRawQueryError failed:`, err);
            }
          }
        });
        
        throw error;
      }
    } catch (hookError) {
      // CRITICAL: If hook system fails, fall back to original
      console.error('[typeorm-query-hooks] QueryRunner hook system error:', hookError);
      return originalQuery(query, parameters);
    }
  };
  
  // Mark as patched
  (queryRunner as any).__queryHooksPatched = true;
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
export * from './plugins/cache-invalidation';
export * from './plugins/audit-logging';
export * from './plugins/bulk-operations';
export * from './plugins/query-complexity';
export * from './plugins/n-plus-one-detector';
export * from './plugins/query-source-tracer';
export * from './plugins/safety-guard';
export * from './plugins/slow-query-analyzer';
export * from './plugins/idle-transaction-monitor';
export * from './plugins/query-timeout';
export * from './plugins/connection-leak-detector';
export * from './plugins/lazy-loading-detector';
export * from './plugins/query-result-transformer';

// Re-export NestJS integration
export * from './nestjs';

// Re-export context store
export * from './context-store';

