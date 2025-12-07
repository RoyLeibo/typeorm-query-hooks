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
 */
export function enableQueryHooks(): void {
  if (isPatched) {
    console.warn('[typeorm-query-hooks] Hooks are already enabled');
    return;
  }

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
      
      console.log(`[typeorm-query-hooks] getQuery() called, plugins count: ${plugins.length}, SQL: ${sql.substring(0, 100)}...`);
      
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
            console.log(`[typeorm-query-hooks] Calling plugin: ${plugin.name}`);
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
          try {
            const sql = this.getQuery();
            console.log(`[typeorm-query-hooks] ${methodName}() called, SQL captured: ${sql.substring(0, 100)}...`);
          } catch (err) {
            console.warn(`[typeorm-query-hooks] ${methodName}() - getQuery() failed:`, err);
          }
          return original.apply(this, args);
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

