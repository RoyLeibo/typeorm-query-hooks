import { QueryHookPlugin, QueryResultContext } from '../index';
import { extractTablesFromBuilder } from './table-extractor';

/**
 * Transformer function type
 */
export type TransformerFn<T = any, R = any> = (data: T, context: QueryResultContext) => R | Promise<R>;

/**
 * Options for QueryResultTransformerPlugin
 */
export interface QueryResultTransformerOptions {
  /**
   * Transformers by entity/table name
   * Maps table name to transformer function
   * 
   * @example
   * ```typescript
   * {
   *   User: (user) => ({
   *     ...user,
   *     fullName: `${user.firstName} ${user.lastName}`,
   *     password: undefined // Remove sensitive data
   *   })
   * }
   * ```
   */
  transformers?: Record<string, TransformerFn>;
  
  /**
   * Global transformer applied to all results (optional)
   * Runs before entity-specific transformers
   */
  globalTransformer?: TransformerFn;
  
  /**
   * Callback when a result is transformed (optional)
   * Triggered after transformation is complete
   * 
   * @param context - Query result context
   * @param originalResult - Result before transformation
   * @param transformedResult - Result after transformation
   * 
   * @example
   * ```typescript
   * onTransformed: (context, originalResult, transformedResult) => {
   *   logger.info('Result transformed', {
   *     tables: extractTablesFromBuilder(context.builder),
   *     originalType: typeof originalResult,
   *     transformedType: typeof transformedResult
   *   });
   * }
   * ```
   */
  onTransformed?: (context: QueryResultContext, originalResult: any, transformedResult: any) => void;
  
  /**
   * Callback when transformation fails (optional)
   * 
   * @param context - Query result context
   * @param error - The error that occurred
   * 
   * @example
   * ```typescript
   * onError: (context, error) => {
   *   logger.error('Result transformation failed', {
   *     error,
   *     tables: extractTablesFromBuilder(context.builder)
   *   });
   * }
   * ```
   */
  onError?: (context: QueryResultContext, error: Error) => void;
  
  /**
   * Enable console logging for this plugin (default: false)
   */
  enableLogging?: boolean;
}

/**
 * Plugin for transforming query results
 * Automatically converts DB results to DTOs/view models
 * 
 * 🔄 Solves: Manual transformation of database results to DTOs
 * 
 * **Common Use Cases:**
 * 1. Remove sensitive fields (passwords, tokens)
 * 2. Combine fields (firstName + lastName = fullName)
 * 3. Format dates, numbers
 * 4. Add computed properties
 * 5. Flatten nested objects
 * 
 * @example
 * ```typescript
 * import { QueryResultTransformerPlugin } from 'typeorm-query-hooks/plugins/query-result-transformer';
 * 
 * registerPlugin(QueryResultTransformerPlugin({
 *   transformers: {
 *     User: (user) => ({
 *       id: user.id,
 *       fullName: `${user.firstName} ${user.lastName}`,
 *       email: user.email,
 *       // Remove sensitive data
 *       password: undefined,
 *       resetToken: undefined
 *     }),
 *     Product: (product) => ({
 *       ...product,
 *       price: `$${product.price.toFixed(2)}`,
 *       inStock: product.quantity > 0
 *     })
 *   },
 *   globalTransformer: (result) => {
 *     // Add metadata to all results
 *     if (Array.isArray(result)) {
 *       return {
 *         data: result,
 *         count: result.length,
 *         timestamp: new Date()
 *       };
 *     }
 *     return result;
 *   },
 *   enableLogging: true
 * }));
 * ```
 */
export function QueryResultTransformerPlugin(options: QueryResultTransformerOptions): QueryHookPlugin {
  const {
    transformers = {},
    globalTransformer,
    onTransformed,
    onError,
    enableLogging = false
  } = options;

  /**
   * Transform a single item
   */
  async function transformItem(item: any, tableName: string, context: QueryResultContext): Promise<any> {
    let result = item;

    // Apply entity-specific transformer
    if (transformers[tableName]) {
      result = await transformers[tableName](result, context);
    }

    return result;
  }

  /**
   * Transform result (array or single item)
   */
  async function transformResult(result: any, tables: string[], context: QueryResultContext): Promise<any> {
    if (!result) return result;

    const primaryTable = tables[0];

    // Transform array
    if (Array.isArray(result)) {
      if (enableLogging) {
        console.log(`[QueryResultTransformer] Transforming ${result.length} items from ${primaryTable}`);
      }
      return await Promise.all(result.map(item => transformItem(item, primaryTable, context)));
    }

    // Transform single item
    if (typeof result === 'object') {
      if (enableLogging) {
        console.log(`[QueryResultTransformer] Transforming single item from ${primaryTable}`);
      }
      return await transformItem(result, primaryTable, context);
    }

    return result;
  }

  return {
    name: 'QueryResultTransformer',

    onQueryResult: async (context: QueryResultContext) => {
      try {
        const originalResult = context.result;
        let result = originalResult;

        // Apply global transformer first
        if (globalTransformer) {
          try {
            result = await globalTransformer(result, context);
          } catch (error) {
            if (onError) {
              onError(context, error as Error);
            } else if (enableLogging) {
              console.error('[QueryResultTransformer] Global transformer failed:', error);
            }
            throw error;
          }
        }

        // Apply entity-specific transformers
        const tables = extractTablesFromBuilder(context.builder);

        if (tables.length > 0 && Object.keys(transformers).length > 0) {
          try {
            result = await transformResult(result, tables, context);
          } catch (error) {
            if (onError) {
              onError(context, error as Error);
            } else if (enableLogging) {
              console.error('[QueryResultTransformer] Entity transformer failed:', error);
            }
            throw error;
          }
        }

        // Trigger onTransformed callback if result was modified
        if (result !== originalResult && onTransformed) {
          try {
            onTransformed(context, originalResult, result);
          } catch (error) {
            if (onError) {
              onError(context, error as Error);
            } else if (enableLogging) {
              console.error('[QueryResultTransformer] onTransformed callback failed:', error);
            }
          }
        }

        // Modify the result in context
        (context as any).result = result;
      } catch (error) {
        if (onError) {
          onError(context, error as Error);
        } else if (enableLogging) {
          console.error('[QueryResultTransformer] Transformation failed:', error);
        }
        throw error;
      }
    },

    onEnable: () => {
      if (enableLogging) {
        console.log('[QueryResultTransformer] 🔄 Result transformation enabled', {
          transformers: Object.keys(transformers),
          hasGlobalTransformer: !!globalTransformer
        });
      }
    }
  };
}



