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
| `verbose` | `boolean` | `false` | Enable detailed debug logging for the core hook system. Shows when hooks fire, plugins execute, queries are captured, etc. |

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
| `threshold` | `number` | `5` | Maximum number of identical queries allowed within time window |
| `window` | `number` | `100` | Time window in milliseconds to track query patterns |
| `includeStackTrace` | `boolean` | `true` | Capture stack trace to show where N+1 originated |
| `ignorePatterns` | `RegExp[]` | `[]` | Regex patterns to ignore (e.g., `/migrations$/i`) |
| `enableLogging` | `boolean` | `false` | Auto-log N+1 warnings to console |

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
| `blockDDL` | `boolean` | `false` | Block CREATE, ALTER, DROP, TRUNCATE operations |
| `requireWhereClause` | `boolean` | `true` | Require WHERE clause for UPDATE/DELETE ⚠️ CRITICAL |
| `blockTruncate` | `boolean` | `true` | Block TRUNCATE operations |
| `blockDrop` | `boolean` | `true` | Block DROP TABLE/DATABASE operations |
| `allowedEnvironments` | `string[]` | `['development','test']` | Environments where destructive ops are allowed |
| `protectedTables` | `string[]` | `[]` | Tables with extra protection (e.g., `['users', 'payments']`) |
| `allowForce` | `boolean` | `false` | Allow `/* FORCE_ALLOW */` comment to bypass |
| `throwOnBlock` | `boolean` | `true` | Throw error when operation is blocked |
| `enableLogging` | `boolean` | `false` | Auto-log blocked operations |

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
| `maxConnectionAge` | `number` | `30000` | Max connection age in ms before considered a leak |
| `warnThreshold` | `number` | `0.8` | Warn when pool usage exceeds this % (0.8 = 80%) |
| `captureStackTrace` | `boolean` | `true` | Capture where connection was acquired |
| `enableLogging` | `boolean` | `false` | Auto-log leak warnings |

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
| `defaultTimeout` | `number` | `5000` | Default timeout for all queries (ms) |
| `timeoutByType` | `Record<string, number>` | `{}` | Override timeout by query type (e.g., `{ 'SELECT': 3000 }`) |
| `timeoutByTablePattern` | `Record<string, number>` | `{}` | Override by table pattern (e.g., `{ 'report_.*': 30000 }`) |
| `throwOnTimeout` | `boolean` | `true` | Throw error on timeout |
| `warningThreshold` | `number` | `0.8` | Trigger warning at % of timeout (0.8 = 80%) |
| `enableLogging` | `boolean` | `false` | Auto-log timeouts |

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
| `maxTransactionDuration` | `number` | `5000` | Max transaction duration in ms |
| `maxIdleTime` | `number` | `1000` | Max idle time (no queries) in ms |
| `autoRollback` | `boolean` | `false` | Auto-rollback zombie transactions ⚠️ Use carefully |
| `enableLogging` | `boolean` | `false` | Auto-log zombie warnings |

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
| `basePath` | `string` | `process.cwd()` | Base path to filter stack traces |
| `attachToQueryContext` | `boolean` | `true` | Make source location available to other plugins |
| `includeFullStackTrace` | `boolean` | `false` | Include complete stack trace |
| `ignorePaths` | `string[]` | `['node_modules']` | Paths to ignore in stack traces |
| `enableLogging` | `boolean` | `false` | Auto-log source location |

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
| `threshold` | `number` | `1000` | Run EXPLAIN on queries slower than this (ms) |
| `runAnalyze` | `boolean` | `false` | Run EXPLAIN ANALYZE (actually executes query) ⚠️ |
| `databaseType` | `string` | `'postgres'` | Database type: `'postgres'`, `'mysql'`, `'mariadb'`, `'sqlite'`, `'mssql'` |
| `enableLogging` | `boolean` | `false` | Auto-log execution plans |

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
| `warnOnLazyLoad` | `boolean` | `true` | ⚠️ **Deprecated** - Use `onLazyLoadDetected` callback instead |
| `suggestEagerLoading` | `boolean` | `true` | Show code suggestion to fix |
| `threshold` | `number` | `1` | Warn after N lazy loads of same relation |
| `enableLogging` | `boolean` | `false` | Auto-log lazy loading warnings |

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
| `slowQueryThreshold` | `number` | `500` | Threshold in ms for slow query detection |
| `enableLogging` | `boolean` | `false` | Auto-log performance metrics |

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
| `invalidateOnTypes` | `string[]` | `['INSERT','UPDATE','DELETE']` | Query types that trigger invalidation |
| `monitorTables` | `string[]` | `[]` (all) | Specific tables to monitor. Empty = all tables |
| `enableLogging` | `boolean` | `false` | Auto-log cache invalidations |

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
| `auditTypes` | `string[]` | `['INSERT','UPDATE','DELETE']` | Query types to audit |
| `auditTables` | `string[]` | `[]` (all) | Tables to audit. Empty = all |
| `includeSql` | `boolean` | `true` | Include SQL in audit logs |
| `includeParameters` | `boolean` | `false` | Include parameters (may contain sensitive data) |
| `metadata` | `object\|function` | `undefined` | Additional metadata to include |
| `enableLogging` | `boolean` | `false` | Auto-log audit entries |

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
| `bulkThreshold` | `number` | `100` | Threshold for considering operation "bulk" (rows) |
| `monitorTypes` | `string[]` | `['INSERT','UPDATE','DELETE']` | Query types to monitor |
| `monitorTables` | `string[]` | `[]` (all) | Tables to monitor. Empty = all |
| `warnOnBulk` | `boolean` | `true` | ⚠️ **Deprecated** - Use `onBulkOperation` callback instead |
| `enableLogging` | `boolean` | `false` | Auto-log bulk operations |

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
| `warnOnEmptyTables` | `boolean` | `false` | Warn when no tables are extracted |
| `enableLogging` | `boolean` | `false` | Log extracted tables |

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
| `largeResultThreshold` | `number` | `1000` | Threshold for large result set (rows) |
| `monitorTables` | `string[]` | `[]` (all) | Tables to monitor. Empty = all |
| `enableLogging` | `boolean` | `false` | Auto-log validation warnings |

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
| `maxJoins` | `number` | `5` | Max joins before warning |
| `maxTables` | `number` | `10` | Max tables before warning |
| `warnOnSubqueries` | `boolean` | `false` | Warn on subqueries |
| `warnOnCTEs` | `boolean` | `false` | Warn on Common Table Expressions |
| `enableLogging` | `boolean` | `false` | Auto-log complexity warnings |

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
