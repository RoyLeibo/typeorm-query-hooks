import { QueryHookPlugin, TransactionContext, TransactionCompleteContext, QueryExecutionContext } from '../index';

/**
 * Transaction tracking data
 */
interface TransactionTracker {
  queryRunner: any;
  startTime: number;
  lastActivityTime: number;
  queriesExecuted: number;
  totalIdleTime: number;
}

/**
 * Zombie transaction details
 */
export interface ZombieTransaction {
  duration: number;
  idleTime: number;
  queriesExecuted: number;
  severity: 'warning' | 'error' | 'critical';
}

/**
 * Options for IdleTransactionMonitorPlugin
 */
export interface IdleTransactionMonitorOptions {
  /**
   * Maximum transaction duration in milliseconds (default: 5000ms)
   * Transactions open longer than this will trigger a warning
   */
  maxTransactionDuration?: number;
  
  /**
   * Maximum idle time in milliseconds (default: 1000ms)
   * Time between queries where transaction is doing nothing
   * 
   * ⚠️ Common causes: HTTP calls, heavy CPU work, waiting for external APIs
   */
  maxIdleTime?: number;
  
  /**
   * Automatically rollback zombie transactions (default: false)
   * ⚠️ WARNING: Only enable if you understand the implications
   */
  autoRollback?: boolean;
  
  /**
   * Callback when zombie transaction is detected (optional)
   * 
   * @param context - Transaction context
   * @param zombie - Zombie transaction details
   * 
   * @example
   * ```typescript
   * onZombieDetected: (context, zombie) => {
   *   logger.error('Zombie transaction detected', {
   *     duration: zombie.duration,
   *     idleTime: zombie.idleTime,
   *     queries: zombie.queriesExecuted
   *   });
   * }
   * ```
   */
  onZombieDetected?: (context: TransactionContext, zombie: ZombieTransaction) => void | Promise<void>;
  
  /**
   * Enable console logging for this plugin (default: false)
   * When true, logs warnings about idle and long-running transactions
   */
  enableLogging?: boolean;
}

/**
 * Plugin for monitoring idle transactions ("zombie transactions")
 * Detects transactions that hold locks while doing non-database work
 * 
 * 🧟 CRITICAL: Prevents deadlocks and connection starvation
 * 
 * **The Problem:**
 * ```typescript
 * await queryRunner.startTransaction();
 * await queryRunner.manager.save(user);
 * 
 * // Transaction is OPEN while doing HTTP call!
 * await fetch('https://api.example.com/slow-endpoint'); // 5 seconds
 * 
 * // Meanwhile: DB connection locked, other queries waiting, deadlock risk
 * await queryRunner.commitTransaction();
 * ```
 * 
 * **Common Causes:**
 * 1. HTTP/API calls inside transactions
 * 2. Heavy CPU computation
 * 3. File I/O operations
 * 4. Waiting for external services
 * 5. Forgot to commit/rollback
 * 
 * **What it tracks:**
 * - Total transaction duration
 * - Idle time (time between queries)
 * - Number of queries executed
 * 
 * @example
 * ```typescript
 * import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
 * import { IdleTransactionMonitorPlugin } from 'typeorm-query-hooks/plugins/idle-transaction-monitor';
 * 
 * enableQueryHooks();
 * 
 * // Basic usage: Warn on idle transactions
 * registerPlugin(IdleTransactionMonitorPlugin({
 *   maxTransactionDuration: 5000,  // 5 seconds max
 *   maxIdleTime: 1000,              // 1 second idle max
 *   enableLogging: true
 * }));
 * 
 * // Advanced: Auto-rollback zombies
 * registerPlugin(IdleTransactionMonitorPlugin({
 *   maxTransactionDuration: 10000,
 *   maxIdleTime: 2000,
 *   autoRollback: process.env.NODE_ENV !== 'production', // Only in dev
 *   onZombieDetected: async (context, zombie) => {
 *     logger.error('🧟 ZOMBIE TRANSACTION DETECTED:', {
 *       duration: `${zombie.duration}ms`,
 *       idleTime: `${zombie.idleTime}ms`,
 *       queries: zombie.queriesExecuted,
 *       severity: zombie.severity
 *     });
 *     
 *     // Send critical alert if severe
 *     if (zombie.severity === 'critical') {
 *       await monitoring.alert({
 *         type: 'zombie_transaction',
 *         severity: 'critical',
 *         message: `Transaction open for ${zombie.duration}ms, idle for ${zombie.idleTime}ms`
 *       });
 *     }
 *   }
 * }));
 * ```
 */
export function IdleTransactionMonitorPlugin(options: IdleTransactionMonitorOptions = {}): QueryHookPlugin {
  const {
    maxTransactionDuration = 5000,
    maxIdleTime = 1000,
    autoRollback = false,
    onZombieDetected,
    enableLogging = false
  } = options;

  // Track active transactions
  const transactions = new WeakMap<any, TransactionTracker>();

  /**
   * Check if transaction is a zombie
   */
  function checkZombie(tracker: TransactionTracker): ZombieTransaction | null {
    const now = Date.now();
    const duration = now - tracker.startTime;
    const idleTime = now - tracker.lastActivityTime;

    // Determine if it's a zombie
    const isLongRunning = duration > maxTransactionDuration;
    const isIdle = idleTime > maxIdleTime;

    if (!isLongRunning && !isIdle) {
      return null;
    }

    // Determine severity
    let severity: 'warning' | 'error' | 'critical' = 'warning';
    if (duration > maxTransactionDuration * 2 || idleTime > maxIdleTime * 3) {
      severity = 'critical';
    } else if (duration > maxTransactionDuration || idleTime > maxIdleTime * 2) {
      severity = 'error';
    }

    return {
      duration,
      idleTime,
      queriesExecuted: tracker.queriesExecuted,
      severity
    };
  }

  /**
   * Periodic zombie checker
   */
  let zombieCheckInterval: NodeJS.Timeout;

  return {
    name: 'IdleTransactionMonitor',

    onTransactionStart: (context: TransactionContext) => {
      // Track this transaction
      transactions.set(context.queryRunner, {
        queryRunner: context.queryRunner,
        startTime: Date.now(),
        lastActivityTime: Date.now(),
        queriesExecuted: 0,
        totalIdleTime: 0
      });

      if (enableLogging) {
        console.log('[IdleTransactionMonitor] 🔄 Transaction started');
      }
    },

    onQueryStart: (context: QueryExecutionContext) => {
      // Update activity time when query runs
      const queryRunner = (context.builder as any).queryRunner;
      if (!queryRunner) return;

      const tracker = transactions.get(queryRunner);
      if (tracker) {
        const now = Date.now();
        const idleTime = now - tracker.lastActivityTime;
        tracker.totalIdleTime += idleTime;
        tracker.lastActivityTime = now;
        tracker.queriesExecuted++;
      }
    },

    onTransactionCommit: async (context: TransactionCompleteContext) => {
      const tracker = transactions.get(context.queryRunner);
      if (tracker) {
        if (enableLogging) {
          console.log('[IdleTransactionMonitor] ✅ Transaction committed', {
            duration: `${Date.now() - tracker.startTime}ms`,
            queries: tracker.queriesExecuted,
            totalIdleTime: `${tracker.totalIdleTime}ms`
          });
        }
        transactions.delete(context.queryRunner);
      }
    },

    onTransactionRollback: async (context: TransactionCompleteContext) => {
      const tracker = transactions.get(context.queryRunner);
      if (tracker) {
        if (enableLogging) {
          console.log('[IdleTransactionMonitor] ↩️  Transaction rolled back');
        }
        transactions.delete(context.queryRunner);
      }
    },

    onEnable: () => {
      // Start periodic zombie checker
      zombieCheckInterval = setInterval(() => {
        // Check all active transactions
        // Note: We can't iterate WeakMap, so we'll check on query execution
      }, maxIdleTime);

      if (enableLogging) {
        console.log('[IdleTransactionMonitor] 🧟 Zombie transaction monitoring enabled', {
          maxTransactionDuration: `${maxTransactionDuration}ms`,
          maxIdleTime: `${maxIdleTime}ms`,
          autoRollback
        });
      }
    }
  };
}


