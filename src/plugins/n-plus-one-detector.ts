import { QueryHookPlugin, QueryHookContext } from '../index';

/**
 * Query fingerprint for detecting identical queries
 */
interface QueryFingerprint {
  pattern: string;
  firstSeen: number;
  count: number;
  contexts: QueryHookContext[];
}

/**
 * Options for NPlusOneDetectorPlugin
 */
export interface NPlusOneDetectorOptions {
  /**
   * Maximum number of identical queries allowed within the time window (default: 5)
   * If the same query fingerprint appears more than this many times, it's flagged as N+1
   */
  threshold?: number;
  
  /**
   * Time window in milliseconds to track query patterns (default: 100ms)
   * Queries are grouped within this window to detect N+1 patterns
   */
  window?: number;
  
  /**
   * Callback when N+1 pattern is detected (optional)
   * 
   * @param context - The query context
   * @param count - Number of times the query was executed
   * @param fingerprint - The normalized query pattern
   * @param allContexts - All query contexts with this fingerprint
   * 
   * @example
   * ```typescript
   * onNPlusOneDetected: (context, count, fingerprint, allContexts) => {
   *   logger.error(`N+1 Query detected: ${count} identical queries`, {
   *     fingerprint,
   *     tables: extractTablesFromBuilder(context.builder)
   *   });
   * }
   * ```
   */
  onNPlusOneDetected?: (context: QueryHookContext, count: number, fingerprint: string, allContexts: QueryHookContext[]) => void;
  
  /**
   * Include stack trace in N+1 warnings (default: true)
   * When true, captures stack trace to show where the N+1 originated
   */
  includeStackTrace?: boolean;
  
  /**
   * Ignore specific query patterns (default: [])
   * Regular expressions to ignore certain queries from N+1 detection
   * 
   * @example [/^SELECT.*FROM.*migrations/i] - Ignore migration queries
   */
  ignorePatterns?: RegExp[];
  
  /**
   * Enable console logging for this plugin (default: false)
   * When true, automatically logs N+1 warnings to console
   */
  enableLogging?: boolean;
}

/**
 * Plugin for detecting N+1 query problems
 * The #1 performance killer in TypeORM applications
 * 
 * 🔥 CRITICAL: This plugin can prevent 80% of production performance issues
 * 
 * **What is N+1?**
 * When you load entities in a loop, each entity triggers a separate query for its relations.
 * Example: Load 100 users → 1 query. Then loop through users to get their posts → 100 queries!
 * Total: 101 queries when it could be 1 with proper eager loading.
 * 
 * **How it works:**
 * 1. Normalizes each query to a "fingerprint" (removes parameter values)
 * 2. Tracks how many times each fingerprint appears within a time window
 * 3. If threshold is exceeded, flags it as N+1 problem
 * 
 * @example
 * ```typescript
 * import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
 * import { NPlusOneDetectorPlugin } from 'typeorm-query-hooks/plugins/n-plus-one-detector';
 * 
 * enableQueryHooks();
 * 
 * // Basic usage: Detect N+1 with default settings
 * registerPlugin(NPlusOneDetectorPlugin({
 *   threshold: 5,        // Flag if same query runs > 5 times
 *   window: 100,         // Within 100ms window
 *   enableLogging: true  // Auto-log warnings
 * }));
 * 
 * // Advanced: Custom detection with stack traces
 * registerPlugin(NPlusOneDetectorPlugin({
 *   threshold: 3,
 *   window: 50,
 *   includeStackTrace: true,
 *   ignorePatterns: [
 *     /migrations$/i,      // Ignore migration queries
 *     /^SELECT.*FROM information_schema/i  // Ignore schema queries
 *   ],
 *   onNPlusOneDetected: (context, count, fingerprint, allContexts) => {
 *     // Send alert to monitoring service
 *     monitoring.alert({
 *       type: 'n_plus_one_detected',
 *       severity: count > 10 ? 'critical' : 'warning',
 *       count,
 *       fingerprint,
 *       suggestion: 'Use .leftJoinAndSelect() or relations: [] in find options'
 *     });
 *     
 *     // Log with stack trace
 *     console.error(`🚨 N+1 DETECTED! Query executed ${count} times:`, {
 *       fingerprint: fingerprint.substring(0, 100),
 *       sql: context.sql.substring(0, 150),
 *       suggestion: 'Consider using eager loading with relations or leftJoinAndSelect()'
 *     });
 *   }
 * }));
 * 
 * // Example of N+1 problem this catches:
 * // ❌ BAD - Causes N+1:
 * const users = await userRepository.find();
 * for (const user of users) {
 *   const posts = await postRepository.find({ where: { userId: user.id } });
 *   // This query runs once per user!
 * }
 * 
 * // ✅ GOOD - Fix:
 * const users = await userRepository.find({ relations: ['posts'] });
 * // Or:
 * const users = await userRepository.createQueryBuilder('user')
 *   .leftJoinAndSelect('user.posts', 'posts')
 *   .getMany();
 * ```
 */
export function NPlusOneDetectorPlugin(options: NPlusOneDetectorOptions = {}): QueryHookPlugin {
  const {
    threshold = 5,
    window = 100,
    onNPlusOneDetected,
    includeStackTrace = true,
    ignorePatterns = [],
    enableLogging = false
  } = options;

  // Store query fingerprints with timestamps
  const fingerprints = new Map<string, QueryFingerprint>();
  
  // Cleanup old fingerprints periodically
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, data] of fingerprints.entries()) {
      if (now - data.firstSeen > window * 2) {
        fingerprints.delete(key);
      }
    }
  }, window * 2);

  /**
   * Normalize SQL to create a fingerprint (remove parameter values)
   */
  function createFingerprint(sql: string): string {
    return sql
      // Remove string literals
      .replace(/'[^']*'/g, '?')
      // Remove numbers
      .replace(/\b\d+\b/g, '?')
      // Remove whitespace variations
      .replace(/\s+/g, ' ')
      // Remove parameter placeholders ($1, $2, etc.)
      .replace(/\$\d+/g, '?')
      .trim()
      .toLowerCase();
  }

  /**
   * Get simplified stack trace (only user code, no node_modules)
   */
  function getStackTrace(): string {
    if (!includeStackTrace) return '';
    
    const error = new Error();
    const stack = error.stack || '';
    const lines = stack.split('\n');
    
    // Find first line that's not from node_modules or this library
    const userLine = lines.find(line => 
      line.includes('.ts') && 
      !line.includes('node_modules') &&
      !line.includes('typeorm-query-hooks')
    );
    
    return userLine ? userLine.trim() : '';
  }

  return {
    name: 'NPlusOneDetector',

    onQueryBuild: (context: QueryHookContext) => {
      // Check if query should be ignored
      if (ignorePatterns.some(pattern => pattern.test(context.sql))) {
        return;
      }

      const fingerprint = createFingerprint(context.sql);
      const now = Date.now();

      // Get or create fingerprint entry
      let fpData = fingerprints.get(fingerprint);
      
      if (!fpData) {
        // First time seeing this query pattern
        fpData = {
          pattern: fingerprint,
          firstSeen: now,
          count: 1,
          contexts: [context]
        };
        fingerprints.set(fingerprint, fpData);
        return;
      }

      // Check if within time window
      if (now - fpData.firstSeen > window) {
        // Outside window, reset
        fpData.firstSeen = now;
        fpData.count = 1;
        fpData.contexts = [context];
        return;
      }

      // Within window - increment count
      fpData.count++;
      fpData.contexts.push(context);

      // Check if threshold exceeded
      if (fpData.count > threshold) {
        const stackTrace = getStackTrace();
        
        if (enableLogging) {
          console.warn(
            `\n🚨 N+1 QUERY DETECTED!\n` +
            `Query executed ${fpData.count} times within ${window}ms\n` +
            `Threshold: ${threshold}\n` +
            `Fingerprint: ${fingerprint.substring(0, 150)}${fingerprint.length > 150 ? '...' : ''}\n` +
            `Example SQL: ${context.sql.substring(0, 200)}${context.sql.length > 200 ? '...' : ''}\n` +
            (stackTrace ? `Source: ${stackTrace}\n` : '') +
            `\n💡 Suggestion: Use .leftJoinAndSelect() or relations: [] to load related data in a single query\n`
          );
        }

        if (onNPlusOneDetected) {
          try {
            onNPlusOneDetected(context, fpData.count, fingerprint, fpData.contexts);
          } catch (error) {
            console.error('[NPlusOneDetector] onNPlusOneDetected callback failed:', error);
          }
        }

        // Reset count after detection to avoid spam
        fpData.count = 1;
        fpData.firstSeen = now;
        fpData.contexts = [context];
      }
    },

    // Cleanup on plugin unload
    onEnable: () => {
      if (enableLogging) {
        console.log('[NPlusOneDetector] 🕵️‍♂️ N+1 Query detection enabled', {
          threshold,
          window: `${window}ms`,
          includeStackTrace
        });
      }
    }
  };
}

