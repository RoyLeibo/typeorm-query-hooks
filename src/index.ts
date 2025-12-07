import {
  SelectQueryBuilder,
  InsertQueryBuilder,
  UpdateQueryBuilder,
  DeleteQueryBuilder,
  QueryBuilder
} from 'typeorm';

/**
 * Context object passed to plugin hooks
 */
export interface QueryHookContext {
  builder: QueryBuilder<any>;
  sql: string;
  timestamp: Date;
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

  /**
   * Called when a query is built (getQuery is called)
   */
  onQueryBuild?: (context: QueryHookContext) => void;

  /**
   * Called when the plugin is registered (optional initialization)
   */
  onRegister?: () => void;

  /**
   * Called when hooks are enabled (optional setup)
   */
  onEnable?: () => void;
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
 * Enable TypeORM query hooks by patching QueryBuilder classes
 * This should be called once at application startup, before any queries are executed
 * 
 * @param options Configuration options
 * @param options.verbose Enable detailed logging for debugging (default: false)
 */
export function enableQueryHooks(options?: { verbose?: boolean }): void {
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
      const sql = originalGetQuery.call(this);
      
      verboseLog(`getQuery() called, plugins count: ${plugins.length}, SQL: ${sql.substring(0, 100)}...`);
      
      // Create context for plugins
      const context: QueryHookContext = {
        builder: this,
        sql,
        timestamp: new Date()
      };

      // Execute all plugin hooks
      plugins.forEach(plugin => {
        if (plugin.onQueryBuild) {
          try {
            verboseLog(`Calling plugin: ${plugin.name}`);
            plugin.onQueryBuild(context);
          } catch (err) {
            console.warn(`[typeorm-query-hooks] Plugin ${plugin.name} onQueryBuild failed:`, err);
          }
        }
      });

      return sql;
    };

    // Also patch ALL execution methods to trigger getQuery() before execution
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
        (BuilderClass.prototype as any)[methodName] = function (...args: any[]) {
          // Trigger getQuery() to capture metadata before execution
          // AND store the builder in AsyncLocalStorage for logger access
          try {
            const sql = this.getQuery();
            
            verboseLog(`${methodName}() called, SQL captured: ${sql.substring(0, 100)}...`);
            
            // Store builder in context for logger to access
            const { queryContextStore } = require('./context-store');
            const { extractTablesFromBuilder } = require('./plugins/table-extractor');
            
            const tables = extractTablesFromBuilder(this);
            const context = {
              builder: this,
              sql,
              tables,
              queryType: (this as any).expressionMap?.queryType
            };
            
            verboseLog(`${methodName}() - Stored ${tables.length} tables in AsyncLocalStorage`);
            
            // Run the original method within the context
            return queryContextStore.run(context, () => {
              return original.apply(this, args);
            });
          } catch (err) {
            console.warn(`[typeorm-query-hooks] ${methodName}() - getQuery() failed:`, err);
            return original.apply(this, args);
          }
        };
      }
    });
  });

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
 * Check if hooks are currently enabled
 */
export function isHooksEnabled(): boolean {
  return isPatched;
}

// Re-export plugins
export * from './plugins/table-extractor';
export * from './plugins/query-logger';
export * from './plugins/query-metadata-registry';

// Re-export NestJS integration
export * from './nestjs';

