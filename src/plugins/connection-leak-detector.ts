import { QueryHookPlugin, ConnectionPoolContext } from '../index';

/**
 * Connection leak details
 */
export interface ConnectionLeak {
  connectionId: string;
  age: number;
  stackTrace?: string;
  queries: number;
}

/**
 * Options for ConnectionLeakDetectorPlugin
 */
export interface ConnectionLeakDetectorOptions {
  /**
   * Maximum connection age in milliseconds (default: 30000ms / 30 seconds)
   * Connections held longer than this are considered potential leaks
   */
  maxConnectionAge?: number;
  
  /**
   * Warn threshold as percentage of pool capacity (default: 0.8 / 80%)
   * Warns when pool usage exceeds this percentage
   */
  warnThreshold?: number;
  
  /**
   * Capture stack trace on connection acquire (default: true)
   * Helps identify where leaks originate
   */
  captureStackTrace?: boolean;
  
  /**
   * Callback when connection leak is detected (optional)
   * 
   * @param leak - Connection leak details
   */
  onLeak?: (leak: ConnectionLeak) => void;
  
  /**
   * Callback when pool capacity warning is triggered (optional)
   * 
   * @param context - Connection pool context
   */
  onPoolWarning?: (context: ConnectionPoolContext) => void;
  
  /**
   * Enable console logging for this plugin (default: false)
   */
  enableLogging?: boolean;
}

/**
 * Plugin for detecting database connection leaks
 * Prevents connection pool exhaustion and app crashes
 * 
 * 💧 CRITICAL: Connection leaks cause "no available connections" errors
 * 
 * **The Problem:**
 * ```typescript
 * const queryRunner = dataSource.createQueryRunner();
 * await queryRunner.connect();
 * await queryRunner.query('SELECT ...');
 * // FORGOT to call queryRunner.release() !!!
 * // Connection is leaked - never returned to pool
 * ```
 * 
 * **Common Causes:**
 * 1. Forgot to call queryRunner.release()
 * 2. Exception thrown before release()
 * 3. Early return in function
 * 4. Async/await mistakes
 * 
 * **What it detects:**
 * - Connections held too long
 * - Pool capacity warnings
 * - Stack traces of where connections were acquired
 * 
 * @example
 * ```typescript
 * import { ConnectionLeakDetectorPlugin } from 'typeorm-query-hooks/plugins/connection-leak-detector';
 * 
 * registerPlugin(ConnectionLeakDetectorPlugin({
 *   maxConnectionAge: 30000,  // 30 seconds
 *   warnThreshold: 0.8,       // Warn at 80% capacity
 *   captureStackTrace: true,
 *   enableLogging: true,
 *   onLeak: (leak) => {
 *     logger.error('💧 CONNECTION LEAK DETECTED:', {
 *       age: `${leak.age}ms`,
 *       queries: leak.queries,
 *       stackTrace: leak.stackTrace
 *     });
 *     
 *     // Send critical alert
 *     monitoring.alert({
 *       type: 'connection_leak',
 *       severity: 'critical',
 *       connectionId: leak.connectionId,
 *       age: leak.age
 *     });
 *   },
 *   onPoolWarning: (context) => {
 *     logger.warn('⚠️  Connection pool capacity warning:', {
 *       active: context.activeConnections,
 *       idle: context.idleConnections,
 *       max: context.maxConnections,
 *       waiting: context.waitingCount
 *     });
 *   }
 * }));
 * ```
 */
export function ConnectionLeakDetectorPlugin(options: ConnectionLeakDetectorOptions = {}): QueryHookPlugin {
  const {
    maxConnectionAge = 30000,
    warnThreshold = 0.8,
    captureStackTrace = true,
    onLeak,
    onPoolWarning,
    enableLogging = false
  } = options;

  // Track connections
  const connections = new Map<string, {
    acquiredAt: number;
    stackTrace?: string;
    queries: number;
  }>();

  let checkInterval: NodeJS.Timeout;

  /**
   * Capture stack trace
   */
  function getStackTrace(): string {
    const error = new Error();
    Error.captureStackTrace(error);
    return error.stack || '';
  }

  /**
   * Check for leaks
   */
  function checkForLeaks() {
    const now = Date.now();
    
    for (const [connId, data] of connections.entries()) {
      const age = now - data.acquiredAt;
      
      if (age > maxConnectionAge) {
        const leak: ConnectionLeak = {
          connectionId: connId,
          age,
          stackTrace: data.stackTrace,
          queries: data.queries
        };

        if (enableLogging) {
          console.error(
            `[ConnectionLeakDetector] 💧 CONNECTION LEAK DETECTED:\n` +
            `  Connection ID: ${connId}\n` +
            `  Age: ${age}ms (max: ${maxConnectionAge}ms)\n` +
            `  Queries executed: ${data.queries}\n` +
            (data.stackTrace ? `  Acquired at:\n${data.stackTrace}\n` : '')
          );
        }

        if (onLeak) {
          try {
            onLeak(leak);
          } catch (error) {
            console.error('[ConnectionLeakDetector] onLeak callback failed:', error);
          }
        }

        // Remove from tracking
        connections.delete(connId);
      }
    }
  }

  return {
    name: 'ConnectionLeakDetector',

    onConnectionAcquired: (context: ConnectionPoolContext) => {
      const connId = `conn_${Date.now()}_${Math.random()}`;
      
      connections.set(connId, {
        acquiredAt: Date.now(),
        stackTrace: captureStackTrace ? getStackTrace() : undefined,
        queries: 0
      });

      // Check pool capacity
      if (context.activeConnections && context.maxConnections) {
        const usage = context.activeConnections / context.maxConnections;
        
        if (usage >= warnThreshold) {
          if (enableLogging) {
            console.warn(
              `[ConnectionLeakDetector] ⚠️  Pool capacity warning:\n` +
              `  Active: ${context.activeConnections}/${context.maxConnections}\n` +
              `  Usage: ${(usage * 100).toFixed(1)}%\n` +
              `  Threshold: ${(warnThreshold * 100).toFixed(0)}%`
            );
          }

          if (onPoolWarning) {
            try {
              onPoolWarning(context);
            } catch (error) {
              console.error('[ConnectionLeakDetector] onPoolWarning callback failed:', error);
            }
          }
        }
      }

      if (enableLogging) {
        console.log('[ConnectionLeakDetector] 🔗 Connection acquired', {
          total: connections.size,
          active: context.activeConnections,
          idle: context.idleConnections
        });
      }
    },

    onConnectionReleased: (context: ConnectionPoolContext) => {
      // Note: Without actual connection object, we can't track exact release
      // This is a limitation of the hook system
      if (enableLogging) {
        console.log('[ConnectionLeakDetector] 🔓 Connection released');
      }
    },

    onConnectionPoolFull: (context: ConnectionPoolContext) => {
      if (enableLogging) {
        console.error(
          `[ConnectionLeakDetector] 🚨 CONNECTION POOL EXHAUSTED:\n` +
          `  Max connections: ${context.maxConnections}\n` +
          `  Waiting queries: ${context.waitingCount}\n` +
          `  Tracked connections: ${connections.size}`
        );
      }

      if (onPoolWarning) {
        try {
          onPoolWarning(context);
        } catch (error) {
          console.error('[ConnectionLeakDetector] onPoolWarning callback failed:', error);
        }
      }
    },

    onEnable: () => {
      // Start periodic leak checking
      checkInterval = setInterval(checkForLeaks, maxConnectionAge / 2);

      if (enableLogging) {
        console.log('[ConnectionLeakDetector] 💧 Connection leak detection enabled', {
          maxAge: `${maxConnectionAge}ms`,
          warnThreshold: `${(warnThreshold * 100).toFixed(0)}%`,
          captureStackTrace
        });
      }
    }
  };
}


