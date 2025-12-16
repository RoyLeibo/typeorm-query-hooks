# 🚀 TypeORM Query Hooks

> **The ultimate TypeORM companion** - 20 powerful plugins to prevent N+1 queries, detect connection leaks, block dangerous operations, auto-run EXPLAIN, trace query sources & more. Works seamlessly with **JavaScript**, **TypeScript**, and **NestJS**.

[![npm version](https://badge.fury.io/js/typeorm-query-hooks.svg)](https://www.npmjs.com/package/typeorm-query-hooks)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

---

## ✨ Why Use This Library?

### **Prevents Production Disasters:**
- 🕵️ **N+1 Query Detection** - Catches the #1 performance killer automatically
- 🛡️ **Safety Guards** - Blocks `DELETE`/`UPDATE` without `WHERE`, prevents DDL in production
- 💧 **Connection Leak Detection** - Finds leaks before they crash your app
- 🧟 **Zombie Transaction Monitoring** - Prevents deadlocks from idle transactions

### **Automatic Debugging:**
- 📍 **Source Code Tracing** - Shows exact file:line where queries originate (no more guessing!)
- 🔬 **Auto-EXPLAIN** - Runs query plan analysis on slow queries automatically
- ⚠️ **Lazy Loading Detection** - Catches hidden N+1 problems

### **Enterprise Features:**
- 📝 **Audit Logging** - GDPR/HIPAA compliance ready
- 🗑️ **Cache Invalidation** - Auto-invalidate on data changes
- 🔄 **Result Transformation** - Auto-convert to DTOs, remove sensitive data

### **Extensible:**
- 🎨 **Create Custom Plugins** - Build your own hooks for specific needs
- 🔌 **20+ Built-in Plugins** - Ready-to-use solutions for common problems
- 🎯 **Full TypeScript Support** - Type-safe plugin development

---

## 🏗️ **20 Powerful Plugins Included**

> 📚 **Event Callbacks**: All plugins support event callbacks for custom handling. See [PLUGIN_CALLBACKS_REFERENCE.md](./PLUGIN_CALLBACKS_REFERENCE.md) for complete callback documentation.

### **🔥 Critical Performance & Safety**
| Plugin | Purpose | Use Case |
|--------|---------|----------|
| [🕵️ **NPlusOneDetector**](#nplusonedetector) | Detect N+1 query problems | #1 performance killer - catches 80% of issues |
| [🛡️ **SafetyGuard**](#safetyguard) | Block dangerous operations | Prevents DELETE/UPDATE without WHERE, blocks DDL |
| [💧 **ConnectionLeakDetector**](#connectionleakdetector) | Find connection leaks | Prevents pool exhaustion and app crashes |
| [⏱️ **QueryTimeout**](#querytimeout) | Automatic query timeouts | Prevents queries from hanging forever |
| [🧟 **IdleTransactionMonitor**](#idletransactionmonitor) | Detect zombie transactions | Prevents deadlocks from idle transactions |

### **🔬 Analysis & Debugging**
| Plugin | Purpose | Use Case |
|--------|---------|----------|
| [📍 **QuerySourceTracer**](#querysourcetracer) | Show where queries originate | CSI: Database - find exact file:line in your code |
| [🔬 **SlowQueryAnalyzer**](#slowqueryanalyzer) | Auto-run EXPLAIN on slow queries | Automatic query plan analysis |
| [⚠️ **LazyLoadingDetector**](#lazyloadingdetector) | Detect lazy-loaded relations | Catches hidden N+1 problems |
| [⚡ **PerformanceMonitor**](#performancemonitor) | Track query execution time | Monitor and optimize performance |

### **🗃️ Data Management**
| Plugin | Purpose | Use Case |
|--------|---------|----------|
| [🗑️ **CacheInvalidation**](#cacheinvalidation) | Auto-invalidate cache on writes | Maintain cache consistency |
| [📝 **AuditLogging**](#auditlogging) | Track all database operations | Compliance (GDPR, HIPAA), security |
| [📊 **BulkOperations**](#bulkoperations) | Detect bulk operations | Prevent accidental mass updates |
| [🔄 **QueryResultTransformer**](#queryresulttransformer) | Transform query results | Auto-convert to DTOs, remove sensitive data |

### **🛠️ Utilities**
| Plugin | Purpose | Use Case |
|--------|---------|----------|
| [🏷️ **TableExtractor**](#tableextractor) | Extract table names from queries | Logging, caching, access control |
| [✅ **ResultValidator**](#resultvalidator) | Validate query results | Alert on empty results, pagination issues |
| [✏️ **QueryModifier**](#querymodifier) | Modify queries before execution | Multi-tenancy, query hints, safety |
| [🔍 **QueryComplexity**](#querycomplexity) | Warn on complex queries | Identify queries needing optimization |
| [💾 **QueryMetadataRegistry**](#querymetadataregistry) | Store query metadata | Analytics, cross-cutting concerns |
| [🪵 **QueryLogger**](#querylogger) | Custom query logging | Flexible logging with filters |

---

## 📦 Installation

```bash
npm install typeorm-query-hooks
# or
yarn add typeorm-query-hooks
```

---

## ⚡ Quick Start

### **1. Enable Hooks**

```typescript
import { enableQueryHooks } from 'typeorm-query-hooks';

// Enable at application startup (before any TypeORM queries)
enableQueryHooks({ 
  verbose: false  // Set to true for debugging
});
```

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `verbose` | `boolean` | `false` | Enable detailed debug logging for the core hook system. Shows: when hooks fire, which plugins execute, query capture events, context propagation, errors. **Very noisy** - use only for troubleshooting plugin issues or understanding hook flow. Never enable in production. |

**When to use `verbose: true`:**
- Debugging why a plugin isn't working
- Understanding the hook execution flow
- Development/testing only (too noisy for production)

> **Note:** This is the only configuration for `enableQueryHooks()`. All other configurations are plugin-specific.

---

### **2. Register Plugins**

```typescript
import { registerPlugin } from 'typeorm-query-hooks';
import { NPlusOneDetectorPlugin } from 'typeorm-query-hooks/plugins/n-plus-one-detector';

// Register any plugins you need
registerPlugin(NPlusOneDetectorPlugin({
  threshold: 5,
  enableLogging: true
}));
```

---

# 🏗️ Built-in Plugins (20 Total!)

## **🔥 Critical Performance & Safety**

<div id="nplusonedetector"></div>

### **🕵️ NPlusOneDetector** - Detect N+1 query problems (THE #1 performance killer)

**What it does:**
Detects when the same query runs repeatedly in a short time window - the classic N+1 problem.

**The Problem:**
```typescript
// ❌ BAD - Causes N+1 problem
const users = await userRepository.find();  // 1 query
for (const user of users) {  // Loop
  const posts = await postRepository.find({ where: { userId: user.id } });  // N queries!
}
// Total: 101 queries for 100 users!
```

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `threshold` | `number` | `5` | How many times the same query can run in the time window before flagging as N+1. Lower threshold (3-5) catches more issues. Higher (10+) only catches severe cases. |
| `window` | `number` | `100` | Time window (ms) to track query patterns. 100ms catches most N+1 loops. Increase to 500-1000ms for batch jobs that intentionally space out queries. |
| `includeStackTrace` | `boolean` | `true` | Capture stack trace showing WHERE in your code the N+1 originated. **Performance impact:** ~1-2ms per query. Essential for fixing N+1 issues - shows exact loop location. |
| `ignorePatterns` | `RegExp[]` | `[]` | Regex patterns to exclude from N+1 detection. Example: `[/migrations/, /@nestjs/]` ignores framework code. Use to reduce false positives from legitimate repeated queries. |
| `enableLogging` | `boolean` | `false` | Log N+1 warnings to console with query fingerprint and stack trace. |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onNPlusOneDetected` | `(context: NPlusOneContext, pattern: QueryPattern)` | Called when N+1 pattern is detected |

**Usage:**

```typescript
import { NPlusOneDetectorPlugin } from 'typeorm-query-hooks/plugins/n-plus-one-detector';

registerPlugin(NPlusOneDetectorPlugin({
  threshold: 5,        // Flag if same query runs > 5 times
  window: 100,         // Within 100ms window
  includeStackTrace: true,
  enableLogging: true,
  onNPlusOneDetected: (context, count, fingerprint) => {
    logger.error(`🚨 N+1 DETECTED! Query ran ${count} times`, {
      fingerprint: fingerprint.substring(0, 100),
      suggestion: 'Use .leftJoinAndSelect() or relations: []'
    });
    
    // Send to monitoring
    datadog.increment('n_plus_one_detected', { count });
  }
}));
```

---

<div id="safetyguard"></div>

### **🛡️ SafetyGuard** - Block dangerous database operations

**What it does:**
Prevents catastrophic mistakes like `UPDATE users SET role='admin'` (no WHERE = ALL users become admin!)

**Real disasters this prevents:**
- Junior dev ran `UPDATE users SET email='test@test.com'` without WHERE → 1M users had same email
- Migration with `DROP TABLE` ran in production
- `DELETE FROM orders` without WHERE → Lost 6 months of data

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `blockDDL` | `boolean` | `false` | Block DDL (Data Definition Language) operations: CREATE, ALTER, DROP, TRUNCATE. Enable in production to prevent schema changes. |
| `requireWhereClause` | `boolean` | `true` | ⚠️ **CRITICAL** - Blocks UPDATE/DELETE without WHERE clause. Prevents accidentally modifying ALL rows in a table. Should always be `true` in production. |
| `blockTruncate` | `boolean` | `true` | Block TRUNCATE operations which delete all rows and reset auto-increment. More dangerous than DELETE as it can't be rolled back in some databases. |
| `blockDrop` | `boolean` | `true` | Block DROP TABLE/DATABASE operations. Prevents accidental data loss from schema deletions. |
| `allowedEnvironments` | `string[]` | `['development','test']` | Environments where destructive operations are permitted. Checks `process.env.NODE_ENV`. Production should NOT be in this list. |
| `protectedTables` | `string[]` | `[]` | Tables requiring extra protection beyond normal rules. Operations on these tables ALWAYS require WHERE clause, even in dev. Example: `['users', 'payments', 'audit_logs']` |
| `allowForce` | `boolean` | `false` | Allow developers to bypass safety checks by adding `/* FORCE_ALLOW */` comment to SQL. Use in dev/staging only, NEVER in production. Example: `/* FORCE_ALLOW */ DELETE FROM temp_data` |
| `throwOnBlock` | `boolean` | `true` | When `true`: Throws error and stops query execution. When `false`: Logs warning but allows query to proceed. Set to `true` in production for maximum safety. |
| `enableLogging` | `boolean` | `false` | Log blocked operations to console. Useful for monitoring what operations are being prevented. |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onBlocked` | `(context: PreQueryContext, blocked: BlockedOperation)` | Called when dangerous operation is blocked |

**Usage:**

```typescript
import { SafetyGuardPlugin } from 'typeorm-query-hooks/plugins/safety-guard';

// Recommended for production
registerPlugin(SafetyGuardPlugin({
  blockDDL: process.env.NODE_ENV === 'production',
  requireWhereClause: true,  // ALWAYS require WHERE
  protectedTables: ['users', 'payments', 'transactions'],
  throwOnBlock: true,
  onBlocked: (context, blocked) => {
    // Send critical alert
    pagerduty.trigger({
      severity: 'critical',
      summary: `Dangerous operation blocked: ${blocked.operation}`,
      tables: blocked.tables
    });
  },
  enableLogging: true
}));
```

---

<div id="connectionleakdetector"></div>

### **💧 ConnectionLeakDetector** - Find connection leaks before they crash your app

**What it does:**
Detects connections that are acquired but never released - leads to pool exhaustion.

**The Problem:**
```typescript
const queryRunner = dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.query('SELECT ...');
// ❌ FORGOT queryRunner.release() - connection leaked!
```

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxConnectionAge` | `number` | `30000` | Maximum time (ms) a connection can remain acquired before being flagged as leaked. 30 seconds is usually enough for any query. Increase for long-running analytics queries. |
| `warnThreshold` | `number` | `0.8` | Percentage of pool capacity (0-1) that triggers early warning. 0.8 = warns at 80% full. Helps catch issues before complete pool exhaustion. |
| `captureStackTrace` | `boolean` | `true` | Captures stack trace when connection is acquired to show WHERE the leak originated. **Performance impact:** ~1-2ms per connection. Disable in high-throughput production if needed. |
| `enableLogging` | `boolean` | `false` | Auto-log leak warnings to console with stack traces. |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onLeak` | `(leak: ConnectionLeak)` | Called when connection leak is detected |
| `onPoolWarning` | `(context: ConnectionPoolContext)` | Called when pool capacity warning triggered |

**Usage:**

```typescript
import { ConnectionLeakDetectorPlugin } from 'typeorm-query-hooks/plugins/connection-leak-detector';

registerPlugin(ConnectionLeakDetectorPlugin({
  maxConnectionAge: 30000,  // 30 seconds
  warnThreshold: 0.8,       // Warn at 80% pool capacity
  captureStackTrace: true,
  enableLogging: true,
  onLeak: (leak) => {
    logger.error('💧 CONNECTION LEAK:', {
      age: `${leak.age}ms`,
      stackTrace: leak.stackTrace
    });
    monitoring.alert({ type: 'connection_leak', severity: 'critical' });
  }
}));
```



<div id="querytimeout"></div>

### **⏱️ QueryTimeout** - Automatic query timeouts

**What it does:**
Prevents queries from hanging forever and blocking the connection pool.

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultTimeout` | `number` | `5000` | Default timeout (ms) for all queries. Prevents queries from hanging indefinitely and blocking connections. 5 seconds is reasonable for OLTP workloads. |
| `timeoutByType` | `Record<string, number>` | `{}` | Override timeout by operation type. Example: `{ 'SELECT': 3000, 'INSERT': 10000 }`. Useful for setting stricter limits on reads vs writes. |
| `timeoutByTablePattern` | `Record<string, number>` | `{}` | Override timeout using regex patterns for table names. Example: `{ 'report_.*': 30000, 'analytics_.*': 60000 }`. Allows longer timeouts for known slow tables. |
| `throwOnTimeout` | `boolean` | `true` | When `true`: Throws error to cancel query. When `false`: Logs warning but lets query continue (not recommended - query will still hold connection). |
| `warningThreshold` | `number` | `0.8` | Triggers early warning callback at percentage of timeout (0.8 = 80%). Allows proactive logging before actual timeout. Set to `0` to disable warnings. |
| `enableLogging` | `boolean` | `false` | Auto-log timeout events to console with query details. |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onTimeout` | `(context: QueryExecutionContext, timeout: number)` | Called when query times out |
| `onTimeoutWarning` | `(context: QueryExecutionContext, elapsed: number, limit: number)` | Called when query approaches timeout |
| `onError` | `(context: QueryExecutionContext, error: Error)` | Called when timeout mechanism fails |

**Usage:**

```typescript
import { QueryTimeoutPlugin } from 'typeorm-query-hooks/plugins/query-timeout';

registerPlugin(QueryTimeoutPlugin({
  defaultTimeout: 5000,
  timeoutByType: {
    'SELECT': 3000,   // Reads should be fast
    'INSERT': 10000,  // Writes can be slower
    'UPDATE': 10000
  },
  timeoutByTablePattern: {
    'report_.*': 30000,    // Reports can take 30s
    'analytics_.*': 60000  // Analytics 60s
  },
  throwOnTimeout: true,
  enableLogging: true
}));
```



<div id="idletransactionmonitor"></div>

### **🧟 IdleTransactionMonitor** - Detect zombie transactions

**What it does:**
Detects transactions that sit idle (no queries running) - causes deadlocks.

**The Problem:**
```typescript
await queryRunner.startTransaction();
await queryRunner.manager.save(user);

// ❌ Transaction is OPEN while doing HTTP call!
await fetch('https://api.slow-service.com');  // 5 seconds

// Meanwhile: DB locks held, other queries waiting, deadlock risk
await queryRunner.commitTransaction();
```

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTransactionDuration` | `number` | `5000` | Maximum total transaction duration (ms) from BEGIN to COMMIT/ROLLBACK. Long transactions hold locks and block other queries. 5 seconds is safe for OLTP. |
| `maxIdleTime` | `number` | `1000` | Maximum idle time (ms) with no queries executing inside a transaction. Detects "zombie" transactions (open but doing nothing). 1 second catches most issues. |
| `autoRollback` | `boolean` | `false` | ⚠️ **DANGEROUS** - Automatically rollback transactions exceeding limits. **Why dangerous:** May rollback legitimate long-running operations (reports, migrations, batch jobs). **Recommendation:** Keep `false` in production, use `onZombieDetected` callback for alerts instead. Only enable in dev/test environments. |
| `enableLogging` | `boolean` | `false` | Log zombie transaction warnings to console with duration and idle time. |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onZombieDetected` | `(context: TransactionContext, zombie: ZombieTransaction)` | Called when zombie transaction detected (long-running AND idle) |
| `onLongRunningTransaction` | `(context: TransactionContext, duration: number)` | Called when transaction exceeds max duration |
| `onIdleTransaction` | `(context: TransactionContext, idleTime: number)` | Called when transaction is idle too long |
| `onError` | `(context: TransactionContext \| undefined, error: Error)` | Called when monitoring fails |

**Usage:**

```typescript
import { IdleTransactionMonitorPlugin } from 'typeorm-query-hooks/plugins/idle-transaction-monitor';

registerPlugin(IdleTransactionMonitorPlugin({
  maxTransactionDuration: 5000,
  maxIdleTime: 1000,
  autoRollback: false,  // Don't auto-rollback in production
  enableLogging: true,
  onZombieDetected: (context, zombie) => {
    logger.error('🧟 ZOMBIE TRANSACTION:', {
      duration: `${zombie.duration}ms`,
      idleTime: `${zombie.idleTime}ms`,
      queries: zombie.queriesExecuted
    });
  }
}));
```



---

## **🔬 Analysis & Debugging**

<div id="querysourcetracer"></div>

### **📍 QuerySourceTracer** - CSI: Database (find exact file:line in your code)

**What it does:**
Shows you EXACTLY where in your code each query originated.

**The Problem:**
You see a slow query: `SELECT * FROM users WHERE email = '...'`
You have 50 places that query users. Which one is slow? You don't know!

**The Solution:**
Shows: `Query from: src/services/UserService.ts:45:12 in UserService.findByEmail`

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `basePath` | `string` | `process.cwd()` | Base directory for relative path resolution. Stack traces show paths relative to this. Default is project root. Set to `process.cwd() + '/src'` to show only source files. |
| `attachToQueryContext` | `boolean` | `true` | When `true`, adds `context.sourceLocation` to query context so other plugins (PerformanceMonitor, NPlusOneDetector, etc.) can access file:line info. Keep enabled for better debugging. |
| `includeFullStackTrace` | `boolean` | `false` | When `true`, captures entire stack trace (20+ frames). When `false`, captures only first relevant frame. Enable for deep debugging, disable for cleaner logs. |
| `ignorePaths` | `string[]` | `['node_modules']` | Array of path patterns to skip when tracing. Filters out framework code to show only YOUR code. Example: `['node_modules', 'dist', '@nestjs']` |
| `enableLogging` | `boolean` | `false` | Log source location for every query. Very verbose - use only for debugging specific issues. |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onQueryLogged` | `(context: QueryContextWithSource, location: SourceLocation)` | Called when query source is traced |

**Usage:**

```typescript
import { QuerySourceTracerPlugin } from 'typeorm-query-hooks/plugins/query-source-tracer';

registerPlugin(QuerySourceTracerPlugin({
  basePath: process.cwd() + '/src',
  attachToQueryContext: true,  // Other plugins can use context.sourceLocation
  enableLogging: true
}));

// Logs show:
// [QuerySourceTracer] 📍 Query Source:
//   File: src/services/UserService.ts
//   Line: 45:12
//   Function: UserService.findByEmail
//   SQL: SELECT "user"."id", "user"."email" FROM "users"...
```



<div id="slowqueryanalyzer"></div>

### **🔬 SlowQueryAnalyzer** - Auto-run EXPLAIN on slow queries

**What it does:**
Automatically runs `EXPLAIN` (or `EXPLAIN ANALYZE`) on slow queries to show you WHY they're slow.

**The Manual Way (painful):**
1. Slow query alert fires
2. Copy the SQL
3. Open pgAdmin/DBeaver
4. Paste and run `EXPLAIN ANALYZE`
5. Look for issues

**The Automatic Way:**
Plugin does it all automatically and logs the execution plan immediately!

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `threshold` | `number` | `1000` | Trigger EXPLAIN analysis for queries slower than this (ms). Helps identify which slow queries need optimization. Lower threshold = more analysis but more overhead. |
| `runAnalyze` | `boolean` | `false` | ⚠️ **USE WITH CAUTION** - `EXPLAIN ANALYZE` actually **executes the query twice**: once for real results, once for analysis. **Risks:** (1) Write operations (INSERT/UPDATE/DELETE) will modify data twice, (2) Doubles query time, (3) Side effects happen twice. **Safe for:** SELECT queries in non-production. **Never use for:** Production, or any INSERT/UPDATE/DELETE. |
| `databaseType` | `string` | `'postgres'` | Database type determines EXPLAIN syntax. Supported: `'postgres'`, `'mysql'`, `'mariadb'`, `'sqlite'`, `'mssql'`. Each database has different EXPLAIN output format. |
| `enableLogging` | `boolean` | `false` | Log EXPLAIN results to console. Shows query plans with cost estimates, index usage, and scan types. |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onAnalysis` | `(context: QueryExecutionContext, plan: QueryExecutionPlan)` | Called when EXPLAIN analysis completes |

**Usage:**

```typescript
import { SlowQueryAnalyzerPlugin } from 'typeorm-query-hooks/plugins/slow-query-analyzer';

registerPlugin(SlowQueryAnalyzerPlugin({
  threshold: 1000,
  databaseType: 'postgres',
  enableLogging: true,
  onAnalysis: (context, plan) => {
    if (plan.hasSeqScan) {
      logger.error('🔍 MISSING INDEX DETECTED:', {
        sql: context.sql.substring(0, 200),
        executionTime: context.executionTime,
        plan: plan.raw,
        suggestion: 'Add an index to improve performance'
      });
    }
  }
}));
```



<div id="lazyloadingdetector"></div>

### **⚠️ LazyLoadingDetector** - Detect lazy-loaded relations (hidden N+1)

**What it does:**
Warns when lazy-loaded relations are accessed (often causes hidden N+1 queries).

**The Problem:**
```typescript
@Entity()
class User {
  @OneToMany(() => Post, post => post.user)
  posts: Promise<Post[]>;  // Lazy loaded!
}

// Usage - looks innocent but causes N+1
const users = await userRepo.find();
for (const user of users) {
  const posts = await user.posts;  // Separate query per user!
}
```

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `warnOnLazyLoad` | `boolean` | `true` | ⚠️ **Deprecated** - Use `onLazyLoadDetected` callback instead for custom handling |
| `suggestEagerLoading` | `boolean` | `true` | When `true`, includes code suggestions in warnings showing how to fix with eager loading (`relations: []` or `.leftJoinAndSelect()`). Helpful for developers learning TypeORM. |
| `threshold` | `number` | `1` | Number of times same relation can be lazy-loaded before triggering warning. Set to `3-5` to ignore isolated cases and focus on true N+1 patterns. Set to `1` to catch every lazy load. |
| `enableLogging` | `boolean` | `false` | Log lazy loading warnings to console with suggestions. |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onLazyLoadDetected` | `(context: QueryHookContext, relationName: string, count: number)` | Called when lazy loading pattern is detected |
| `onError` | `(context: QueryHookContext, error: Error)` | Called when detection fails |

**Usage:**

```typescript
import { LazyLoadingDetectorPlugin } from 'typeorm-query-hooks/plugins/lazy-loading-detector';

registerPlugin(LazyLoadingDetectorPlugin({
  warnOnLazyLoad: true,
  suggestEagerLoading: true,
  threshold: 3,
  enableLogging: true
}));

// Shows suggestions like:
// ⚠️ Potential lazy loading detected
// 💡 Suggestion: Use eager loading:
//   - Option 1: find({ relations: ['posts'] })
//   - Option 2: .leftJoinAndSelect('user.posts', 'posts')
```



<div id="performancemonitor"></div>

### **⚡ PerformanceMonitor** - Track query execution time

**What it does:**
Monitors query performance and detects slow queries.

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `slowQueryThreshold` | `number` | `500` | Queries exceeding this duration (ms) are flagged as "slow" and trigger `onSlowQuery` callback. Typical values: 100ms for user-facing queries, 500ms for background jobs, 1000ms for reports. |
| `enableLogging` | `boolean` | `false` | Log performance metrics for every query (duration, SQL, tables). Can be verbose. |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onSlowQuery` | `(context: QueryExecutionContext)` | Called when query exceeds slowQueryThreshold |
| `onMetric` | `(context: QueryExecutionContext)` | Called for all query completions (for custom metrics) |

**Usage:**

```typescript
import { PerformanceMonitorPlugin } from 'typeorm-query-hooks/plugins/performance-monitor';

registerPlugin(PerformanceMonitorPlugin({
  slowQueryThreshold: 300,
  enableLogging: true,
  onSlowQuery: (context) => {
    datadog.histogram('db.query.duration', context.executionTime);
  },
  onMetric: (context) => {
    prometheus.histogram('query_duration', context.executionTime);
  }
}));
```



---

## **🗃️ Data Management**

<div id="cacheinvalidation"></div>

### **🗑️ CacheInvalidation** - Auto-invalidate cache on data changes

**What it does:**
Automatically invalidates cache when `INSERT`, `UPDATE`, or `DELETE` operations occur.

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `invalidateOnTypes` | `string[]` | `['INSERT','UPDATE','DELETE']` | Query types that trigger cache invalidation. SELECT doesn't invalidate. Add `'TRUNCATE'` if needed. Remove types to skip invalidation for certain operations. |
| `monitorTables` | `string[]` | `[]` (all) | Limit monitoring to specific tables. Example: `['users', 'products']` only invalidates cache for these tables. Empty array = monitor ALL tables. Use to avoid invalidating rarely-cached tables. |
| `enableLogging` | `boolean` | `false` | Log every cache invalidation (table names, operation type). |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onInvalidate` | `(tables: string[], context: QueryExecutionContext)` | ⚠️ **REQUIRED** - Called to clear your cache (Redis, memory, etc.) |

**Usage:**

```typescript
import { CacheInvalidationPlugin } from 'typeorm-query-hooks/plugins/cache-invalidation';

registerPlugin(CacheInvalidationPlugin({
  onInvalidate: async (tables) => {
    for (const table of tables) {
      await redis.del(`cache:${table}:*`);
    }
  },
  monitorTables: ['users', 'products'],  // Only these tables
  enableLogging: true
}));
```



<div id="auditlogging"></div>

### **📝 AuditLogging** - Track all database operations (GDPR/HIPAA ready)

**What it does:**
Comprehensive audit trail of who did what, when, and on which tables.

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `auditTypes` | `string[]` | `['INSERT','UPDATE','DELETE']` | Query types to audit. Typically only data modifications. Add `'SELECT'` to audit reads (verbose). |
| `auditTables` | `string[]` | `[]` (all) | Limit auditing to specific tables containing sensitive data. Example: `['users', 'payments', 'medical_records']`. Empty = audit ALL tables (can be storage-intensive). |
| `includeSql` | `boolean` | `true` | Include full SQL statement in audit logs. Useful for forensics but increases log size. |
| `includeParameters` | `boolean` | `false` | ⚠️ **SECURITY RISK** - Include query parameters (actual values) in audit logs. May expose passwords, PII, credit cards. Only enable if logs are encrypted and access-controlled. Recommended: keep `false` for GDPR/HIPAA compliance. |
| `metadata` | `object\|function` | `undefined` | Additional data to include in every audit entry. **Object:** static values like `{ app: 'api', version: '1.0' }`. **Function:** dynamic values like `() => ({ requestId: getRequestId(), ip: getClientIP() })`. |
| `enableLogging` | `boolean` | `false` | Log audit entries to console (in addition to `onAudit` callback). |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onAudit` | `(entry: AuditLogEntry)` | ⚠️ **REQUIRED** - Called to persist audit logs |
| `getUserId` | `() => string \| number \| undefined` | Called to get current user ID |

**Usage:**

```typescript
import { AuditLoggingPlugin } from 'typeorm-query-hooks/plugins/audit-logging';

registerPlugin(AuditLoggingPlugin({
  getUserId: () => getCurrentUser()?.id,
  onAudit: async (entry) => {
    await auditLogRepository.save({
      userId: entry.userId,
      action: entry.action,
      tables: entry.tables,
      timestamp: entry.timestamp,
      success: entry.success
    });
  },
  auditTypes: ['INSERT', 'UPDATE', 'DELETE'],
  auditTables: ['users', 'financial_records'],  // Sensitive tables only
  includeSql: true,
  includeParameters: false,  // Don't log sensitive data
  metadata: () => ({ 
    environment: process.env.NODE_ENV,
    requestId: getRequestId() 
  }),
  enableLogging: true
}));
```



<div id="bulkoperations"></div>

### **📊 BulkOperations** - Prevent accidental mass updates/deletes

**What it does:**
Detects operations affecting many rows - prevents accidents like deleting 100,000 records.

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bulkThreshold` | `number` | `100` | Number of rows affected to consider an operation "bulk". Adjust based on your app: 50 for user-facing tables, 1000+ for analytics tables. Prevents accidental mass operations. |
| `monitorTypes` | `string[]` | `['INSERT','UPDATE','DELETE']` | Query types to monitor. Bulk SELECTs are rarely dangerous (just slow), so usually only monitor data modifications. |
| `monitorTables` | `string[]` | `[]` (all) | Limit monitoring to specific tables. Example: `['users', 'orders']` to protect critical tables. Empty = monitor all tables. |
| `warnOnBulk` | `boolean` | `true` | ⚠️ **Deprecated** - Use `onBulkOperation` callback instead for custom handling |
| `enableLogging` | `boolean` | `false` | Log bulk operation warnings to console with affected row count. |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onBulkOperation` | `(context: QueryResultContext, affectedRows: number)` | Called when operation exceeds bulkThreshold |

**Usage:**

```typescript
import { BulkOperationsPlugin } from 'typeorm-query-hooks/plugins/bulk-operations';

registerPlugin(BulkOperationsPlugin({
  bulkThreshold: 50,
  warnOnBulk: true,
  enableLogging: true,
  onBulkOperation: (context, affectedRows) => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Bulk operation blocked: ${affectedRows} rows`);
    }
  }
}));
```



<div id="queryresulttransformer"></div>

### **🔄 QueryResultTransformer** - Auto-transform results to DTOs

**What it does:**
Automatically transforms database results to DTOs, removes sensitive data, adds computed fields.

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableLogging` | `boolean` | `false` | Auto-log transformations |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `transformers` | `Record<string, TransformerFn>` | Transform results by entity/table name |
| `globalTransformer` | `(result: any, context: QueryResultContext) => any` | Applied to all results before entity transformers |
| `onTransformed` | `(context: QueryResultContext, originalResult: any, transformedResult: any)` | Called when result was transformed |
| `onError` | `(context: QueryResultContext, error: Error)` | Called when transformation fails |

**Usage:**

```typescript
import { QueryResultTransformerPlugin } from 'typeorm-query-hooks/plugins/query-result-transformer';

registerPlugin(QueryResultTransformerPlugin({
  transformers: {
    User: (user) => ({
      id: user.id,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      // Remove sensitive data
      password: undefined,
      resetToken: undefined
    }),
    Product: (product) => ({
      ...product,
      price: `$${product.price.toFixed(2)}`,
      inStock: product.quantity > 0
    })
  },
  enableLogging: true
}));
```



---

## **🛠️ Utilities**

<div id="tableextractor"></div>

### **🏷️ TableExtractor** - Extract table names from queries

**What it does:**
Extracts all table names from any TypeORM query (SELECT, INSERT, UPDATE, DELETE, CTEs, subqueries, joins).

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `warnOnEmptyTables` | `boolean` | `false` | Emit warning when table extraction returns empty array. Useful for debugging extraction logic or catching malformed queries. Usually safe to keep `false` in production. |
| `enableLogging` | `boolean` | `false` | Log all extracted table names for every query. Verbose - use for debugging table extraction issues. |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onTablesExtracted` | `(context: QueryHookContext, tables: string[])` | Called when tables are successfully extracted |
| `onEmptyTables` | `(context: QueryHookContext, queryType: string)` | Called when no tables were extracted |
| `onWarning` | `(context: QueryHookContext, message: string)` | Called for warnings |
| `onError` | `(context: QueryHookContext, error: Error)` | Called when extraction fails |

**Usage:**

```typescript
import { createTableExtractorPlugin, extractTablesFromBuilder } from 'typeorm-query-hooks/plugins/table-extractor';

registerPlugin(createTableExtractorPlugin({
  warnOnEmptyTables: true,
  enableLogging: true
}));

// Use directly in code:
const query = userRepo.createQueryBuilder('user')
  .leftJoin('user.posts', 'posts');
const tables = extractTablesFromBuilder(query);
// Or:
const tables2 = query.getInvolvedTables();
```



<div id="resultvalidator"></div>

### **✅ ResultValidator** - Validate query results

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `largeResultThreshold` | `number` | `1000` | Number of rows to consider a result set "large". Triggers `onLargeResult` callback to suggest pagination. Adjust based on your app: lower for API endpoints (100-500), higher for reports (5000+). |
| `monitorTables` | `string[]` | `[]` (all) | Limit validation to specific tables. Example: `['users', 'orders']` only checks these tables. Empty = monitor all. Use to focus on tables that should always be paginated. |
| `enableLogging` | `boolean` | `false` | Log validation warnings (empty/large results) to console. |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onEmptyResult` | `(context: QueryResultContext)` | Called when query returns no results |
| `onLargeResult` | `(context: QueryResultContext, rowCount: number)` | Called when result exceeds largeResultThreshold |

**Usage:**

```typescript
import { ResultValidatorPlugin } from 'typeorm-query-hooks/plugins/result-validator';

registerPlugin(ResultValidatorPlugin({
  largeResultThreshold: 5000,
  monitorTables: ['users', 'orders'],
  enableLogging: true,
  onLargeResult: (context) => {
    logger.warn(`Large result: ${context.rowCount} rows - consider pagination`);
  }
}));
```



<div id="querymodifier"></div>

### **✏️ QueryModifier** - Modify queries before execution

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableLogging` | `boolean` | `false` | Auto-log modifications |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `modifySql` | `(sql: string, context: PreQueryContext) => string` | Modify SQL before execution |
| `modifyParameters` | `(parameters: any[], context: PreQueryContext) => any[]` | Modify parameters before execution |
| `shouldExecute` | `(context: PreQueryContext) => boolean` | Return false to cancel query |
| `onSqlModified` | `(context: PreQueryContext, originalSql: string, modifiedSql: string)` | Called when SQL was modified |
| `onParametersModified` | `(context: PreQueryContext, originalParams: any[], modifiedParams: any[])` | Called when parameters were modified |
| `onError` | `(context: PreQueryContext, error: Error)` | Called when modification fails |

**Usage:**

```typescript
import { QueryModifierPlugin, TenantFilterModifier, SafetyModifier } from 'typeorm-query-hooks/plugins/query-modifier';

// Multi-tenancy
registerPlugin(TenantFilterModifier({
  getTenantId: () => getCurrentUser().tenantId,
  tables: ['orders', 'products'],
  tenantColumn: 'tenant_id'
}));

// Block queries during maintenance
registerPlugin(QueryModifierPlugin({
  shouldExecute: (context) => {
    if (isMaintenanceMode()) {
      console.error('Database in maintenance');
      return false;
    }
    return true;
  }
}));
```



<div id="querycomplexity"></div>

### **🔍 QueryComplexity** - Warn on complex queries

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxJoins` | `number` | `5` | Maximum number of JOIN clauses before flagging as complex. Queries with many joins are often slow and hard to maintain. Consider denormalization or caching for queries exceeding this. |
| `maxTables` | `number` | `10` | Maximum number of tables referenced before flagging as complex. High table count suggests overly complex query that may need refactoring. |
| `warnOnSubqueries` | `boolean` | `false` | Flag queries containing subqueries. Subqueries can be slow (especially correlated ones). Set to `true` to identify candidates for optimization with JOINs or separate queries. |
| `warnOnCTEs` | `boolean` | `false` | Flag queries with Common Table Expressions (WITH clauses). CTEs can impact performance in some databases. Enable to audit CTE usage. |
| `enableLogging` | `boolean` | `false` | Log complexity warnings to console with metrics (join count, table count, etc.). |

**Event Callbacks:**

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onComplexQuery` | `(context: PreQueryContext, complexity: QueryComplexityInfo)` | Called when query exceeds complexity thresholds |

**Usage:**

```typescript
import { QueryComplexityPlugin } from 'typeorm-query-hooks/plugins/query-complexity';

registerPlugin(QueryComplexityPlugin({
  maxJoins: 3,
  maxTables: 5,
  warnOnSubqueries: true,
  enableLogging: true
}));
```



<div id="querylogger"></div>

### **🪵 QueryLogger** - Custom query logging with filters

See plugin documentation for details.



<div id="querymetadataregistry"></div>

### **💾 QueryMetadataRegistry** - Store query metadata

Automatically registered when using NestJS integration. See NestJS section below.



---

## 🎨 Creating Custom Plugins

```typescript
import { QueryHookPlugin } from 'typeorm-query-hooks';

const MyCustomPlugin: QueryHookPlugin = {
  name: 'MyCustomPlugin',
  
  onQueryBuild: (context) => {
    console.log('Query built:', context.sql);
  },
  
  onQueryComplete: (context) => {
    console.log(`Query took ${context.executionTime}ms`);
  },
  
  onSlowQuery: (context) => {
    console.warn('Slow query detected!');
  }
};

registerPlugin(MyCustomPlugin);
```

---

## 🔧 NestJS Integration

```typescript
// main.ts or app.module.ts
import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
import { NPlusOneDetectorPlugin } from 'typeorm-query-hooks/plugins/n-plus-one-detector';
import { SafetyGuardPlugin } from 'typeorm-query-hooks/plugins/safety-guard';

// Enable before TypeORM connection
enableQueryHooks({ verbose: false });

// Register essential plugins
registerPlugin(NPlusOneDetectorPlugin({ threshold: 5, enableLogging: true }));
registerPlugin(SafetyGuardPlugin({ requireWhereClause: true }));

@Module({
  imports: [TypeOrmModule.forRoot({ /* ... */ })],
})
export class AppModule {}
```

---

## 🐛 Debugging

Enable verbose mode to see detailed hook execution:

```typescript
enableQueryHooks({ verbose: true });
```

**What it logs:**
- When hooks are enabled
- When plugins are registered  
- When each hook fires
- SQL queries being captured
- Tables extracted from queries
- Execution timing

---

## 📊 Real-World Impact

### **Before typeorm-query-hooks:**
- ❌ N+1 queries slow down production (found after users complain)
- ❌ Accidental `DELETE FROM users` without WHERE
- ❌ Connection pool exhausted → app crash
- ❌ Slow query → manually copy SQL → run EXPLAIN → find issue
- ❌ Don't know which file:line caused the query

### **After typeorm-query-hooks:**
- ✅ N+1 detected in development automatically
- ✅ Dangerous queries blocked before execution
- ✅ Connection leaks caught immediately
- ✅ EXPLAIN runs automatically on slow queries
- ✅ Exact source location shown for every query

---

## 🌟 Show Your Support

If this library helps you, please give it a ⭐️ on [GitHub](https://github.com/RoyLeibo/typeorm-query-hooks)!

---

## 📄 License

MIT © [Roy Leibovitz](https://github.com/RoyLeibo)

---

**Built with ❤️ to make TypeORM better for everyone**
