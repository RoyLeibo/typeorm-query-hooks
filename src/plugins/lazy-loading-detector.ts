import { QueryHookPlugin, QueryHookContext } from '../index';

/**
 * Options for LazyLoadingDetectorPlugin
 */
export interface LazyLoadingDetectorOptions {
  /**
   * Warn on lazy loading (default: true)
   * When true, logs warnings when lazy-loaded relations are accessed
   * 
   * @deprecated Use onLazyLoadDetected callback instead for custom handling
   */
  warnOnLazyLoad?: boolean;
  
  /**
   * Suggest eager loading alternative (default: true)
   * When true, provides code suggestions to fix lazy loading
   */
  suggestEagerLoading?: boolean;
  
  /**
   * Threshold for number of lazy loads before warning (default: 1)
   * Useful to only warn on repeated lazy loads (potential N+1)
   */
  threshold?: number;
  
  /**
   * Callback when lazy loading is detected (optional)
   * 
   * @param context - Query context
   * @param relationName - Name of the lazily loaded relation
   * @param count - Number of times this relation has been lazy loaded
   * 
   * @example
   * ```typescript
   * onLazyLoadDetected: (context, relationName, count) => {
   *   logger.warn(`Lazy load detected: ${relationName} (${count}x)`, {
   *     sql: context.sql,
   *     suggestion: 'Use .leftJoinAndSelect() or relations: []'
   *   });
   * }
   * ```
   */
  onLazyLoadDetected?: (context: QueryHookContext, relationName: string, count: number) => void;
  
  /**
   * Callback when an error occurs during lazy load detection (optional)
   * 
   * @param context - Query context
   * @param error - The error that occurred
   * 
   * @example
   * ```typescript
   * onError: (context, error) => {
   *   logger.error('Lazy load detection failed', { error, sql: context.sql });
   * }
   * ```
   */
  onError?: (context: QueryHookContext, error: Error) => void;
  
  /**
   * Enable console logging for this plugin (default: false)
   */
  enableLogging?: boolean;
}

/**
 * Plugin for detecting lazy-loaded relations
 * Lazy loading often causes N+1 query problems
 * 
 * ⚠️ Solves: Hidden N+1 queries from lazy-loaded relations
 * 
 * **The Problem:**
 * ```typescript
 * // Entity with lazy relation
 * @Entity()
 * class User {
 *   @OneToMany(() => Post, post => post.user)
 *   posts: Promise<Post[]>; // Lazy loaded!
 * }
 * 
 * // Usage
 * const users = await userRepo.find();
 * for (const user of users) {
 *   const posts = await user.posts; // N+1! Separate query per user
 * }
 * ```
 * 
 * @example
 * ```typescript
 * import { LazyLoadingDetectorPlugin } from 'typeorm-query-hooks/plugins/lazy-loading-detector';
 * 
 * registerPlugin(LazyLoadingDetectorPlugin({
 *   warnOnLazyLoad: true,
 *   suggestEagerLoading: true,
 *   threshold: 3, // Warn if same relation loaded 3+ times
 *   enableLogging: true,
 *   onLazyLoadDetected: (context, relationName, count) => {
 *     logger.warn(`Lazy loading detected: ${relationName} (${count} times)`, {
 *       suggestion: 'Use relations: [] or .leftJoinAndSelect()'
 *     });
 *   }
 * }));
 * ```
 */
export function LazyLoadingDetectorPlugin(options: LazyLoadingDetectorOptions = {}): QueryHookPlugin {
  const {
    warnOnLazyLoad = true,
    suggestEagerLoading = true,
    threshold = 1,
    onLazyLoadDetected,
    onError,
    enableLogging = false
  } = options;

  // Track lazy loads by relation
  const lazyLoads = new Map<string, number>();

  return {
    name: 'LazyLoadingDetector',

    onQueryBuild: (context: QueryHookContext) => {
      try {
        // Detect lazy loading patterns in SQL
        const sql = context.sql.toLowerCase();
        
        // Simple heuristic: single relation queries that might be lazy loads
        // This is not perfect but catches common cases
        if (sql.includes('where') && !sql.includes('join')) {
          const relationMatch = sql.match(/from\s+(\w+)/);
          if (relationMatch) {
            const relation = relationMatch[1];
            const count = (lazyLoads.get(relation) || 0) + 1;
            lazyLoads.set(relation, count);

            if (count >= threshold) {
              // Call onLazyLoadDetected callback if provided
              if (onLazyLoadDetected) {
                try {
                  onLazyLoadDetected(context, relation, count);
                } catch (error) {
                  if (onError) {
                    onError(context, error as Error);
                  } else if (enableLogging) {
                    console.error('[LazyLoadingDetector] onLazyLoadDetected callback failed:', error);
                  }
                }
              }

              // Deprecated: warnOnLazyLoad (kept for backward compatibility)
              if (warnOnLazyLoad && !onLazyLoadDetected && enableLogging) {
                console.warn(
                  `[LazyLoadingDetector] ⚠️  Potential lazy loading detected:\n` +
                  `  Relation: ${relation}\n` +
                  `  Load count: ${count}\n` +
                  `  SQL: ${context.sql.substring(0, 150)}...\n` +
                  (suggestEagerLoading 
                    ? `  💡 Suggestion: Use eager loading:\n` +
                      `    - Option 1: find({ relations: ['${relation}'] })\n` +
                      `    - Option 2: .leftJoinAndSelect('entity.${relation}', '${relation}')`
                    : '')
                );
              }

              // Reset count to avoid spam
              lazyLoads.set(relation, 0);
            }
          }
        }
      } catch (error) {
        if (onError) {
          onError(context, error as Error);
        } else if (enableLogging) {
          console.error('[LazyLoadingDetector] Detection failed:', error);
        }
      }
    },

    onEnable: () => {
      if (enableLogging) {
        console.log('[LazyLoadingDetector] 🔍 Lazy loading detection enabled', {
          threshold,
          suggestEagerLoading
        });
      }
    }
  };
}



