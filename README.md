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

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `verbose` | `boolean` | `false` | Enable detailed debug logging for the core hook system. Shows when hooks fire, plugins execute, queries are captured, etc. |

**When to use `verbose: true`:**
- Debugging why a plugin isn't working
- Understanding the hook execution flow
- Development/testing only (too noisy for production)

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

## 🏗️ Built-in Plugins (20 Total!)

### **🔥 Critical Performance & Safety**

<details>
<summary><strong>🕵️ NPlusOneDetector</strong> - Detect N+1 query problems (THE #1 performance killer)</summary>

#### **What it does:**
Detects when the same query runs repeatedly in a short time window - the classic N+1 problem.

#### **The Problem:**
```typescript
// ❌ BAD - Causes N+1 problem
const users = await userRepository.find();  // 1 query
for (const user of users) {  // Loop
  const posts = await postRepository.find({ where: { userId: user.id } });  // N queries!
}
// Total: 101 queries for 100 users!
```

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `threshold` | `number` | `5` | Maximum number of identical queries allowed within time window |
| `window` | `number` | `100` | Time window in milliseconds to track query patterns |
| `includeStackTrace` | `boolean` | `true` | Capture stack trace to show where N+1 originated |
| `ignorePatterns` | `RegExp[]` | `[]` | Regex patterns to ignore (e.g., `/migrations$/i`) |
| `onNPlusOneDetected` | `function` | `undefined` | Callback when N+1 is detected |
| `enableLogging` | `boolean` | `false` | Auto-log N+1 warnings to console |

#### **Usage:**

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

</details>

<details>
<summary><strong>🛡️ SafetyGuard</strong> - Block dangerous database operations</summary>

#### **What it does:**
Prevents catastrophic mistakes like `UPDATE users SET role='admin'` (no WHERE = ALL users become admin!)

#### **Real disasters this prevents:**
- Junior dev ran `UPDATE users SET email='test@test.com'` without WHERE → 1M users had same email
- Migration with `DROP TABLE` ran in production
- `DELETE FROM orders` without WHERE → Lost 6 months of data

#### **Configuration:**

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
| `onBlocked` | `function` | `undefined` | Callback when operation is blocked |
| `enableLogging` | `boolean` | `false` | Auto-log blocked operations |

#### **Usage:**

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

</details>

<details>
<summary><strong>💧 ConnectionLeakDetector</strong> - Find connection leaks before they crash your app</summary>

#### **What it does:**
Detects connections that are acquired but never released - leads to pool exhaustion.

#### **The Problem:**
```typescript
const queryRunner = dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.query('SELECT ...');
// ❌ FORGOT queryRunner.release() - connection leaked!
```

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxConnectionAge` | `number` | `30000` | Max connection age in ms before considered a leak |
| `warnThreshold` | `number` | `0.8` | Warn when pool usage exceeds this % (0.8 = 80%) |
| `captureStackTrace` | `boolean` | `true` | Capture where connection was acquired |
| `onLeak` | `function` | `undefined` | Callback when leak is detected |
| `onPoolWarning` | `function` | `undefined` | Callback when pool capacity warning |
| `enableLogging` | `boolean` | `false` | Auto-log leak warnings |

#### **Usage:**

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

</details>

<details>
<summary><strong>⏱️ QueryTimeout</strong> - Automatic query timeouts</summary>

#### **What it does:**
Prevents queries from hanging forever and blocking the connection pool.

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultTimeout` | `number` | `5000` | Default timeout for all queries (ms) |
| `timeoutByType` | `Record<string, number>` | `{}` | Override timeout by query type (e.g., `{ 'SELECT': 3000 }`) |
| `timeoutByTablePattern` | `Record<string, number>` | `{}` | Override by table pattern (e.g., `{ 'report_.*': 30000 }`) |
| `throwOnTimeout` | `boolean` | `true` | Throw error on timeout |
| `onTimeout` | `function` | `undefined` | Callback when timeout occurs |
| `enableLogging` | `boolean` | `false` | Auto-log timeouts |

#### **Usage:**

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

</details>

<details>
<summary><strong>🧟 IdleTransactionMonitor</strong> - Detect zombie transactions</summary>

#### **What it does:**
Detects transactions that sit idle (no queries running) - causes deadlocks.

#### **The Problem:**
```typescript
await queryRunner.startTransaction();
await queryRunner.manager.save(user);

// ❌ Transaction is OPEN while doing HTTP call!
await fetch('https://api.slow-service.com');  // 5 seconds

// Meanwhile: DB locks held, other queries waiting, deadlock risk
await queryRunner.commitTransaction();
```

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTransactionDuration` | `number` | `5000` | Max transaction duration in ms |
| `maxIdleTime` | `number` | `1000` | Max idle time (no queries) in ms |
| `autoRollback` | `boolean` | `false` | Auto-rollback zombie transactions ⚠️ Use carefully |
| `onZombieDetected` | `function` | `undefined` | Callback when zombie detected |
| `enableLogging` | `boolean` | `false` | Auto-log zombie warnings |

#### **Usage:**

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

</details>

---

### **🔬 Analysis & Debugging**

<details>
<summary><strong>📍 QuerySourceTracer</strong> - CSI: Database (find exact file:line in your code)</summary>

#### **What it does:**
Shows you EXACTLY where in your code each query originated.

#### **The Problem:**
You see a slow query: `SELECT * FROM users WHERE email = '...'`
You have 50 places that query users. Which one is slow? You don't know!

#### **The Solution:**
Shows: `Query from: src/services/UserService.ts:45:12 in UserService.findByEmail`

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `basePath` | `string` | `process.cwd()` | Base path to filter stack traces |
| `attachToQueryContext` | `boolean` | `true` | Make source location available to other plugins |
| `includeFullStackTrace` | `boolean` | `false` | Include complete stack trace |
| `ignorePaths` | `string[]` | `['node_modules']` | Paths to ignore in stack traces |
| `onQueryLogged` | `function` | `undefined` | Callback with source location |
| `enableLogging` | `boolean` | `false` | Auto-log source location |

#### **Usage:**

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

</details>

<details>
<summary><strong>🔬 SlowQueryAnalyzer</strong> - Auto-run EXPLAIN on slow queries</summary>

#### **What it does:**
Automatically runs `EXPLAIN` (or `EXPLAIN ANALYZE`) on slow queries to show you WHY they're slow.

#### **The Manual Way (painful):**
1. Slow query alert fires
2. Copy the SQL
3. Open pgAdmin/DBeaver
4. Paste and run `EXPLAIN ANALYZE`
5. Look for issues

#### **The Automatic Way:**
Plugin does it all automatically and logs the execution plan immediately!

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `threshold` | `number` | `1000` | Run EXPLAIN on queries slower than this (ms) |
| `runAnalyze` | `boolean` | `false` | Run EXPLAIN ANALYZE (actually executes query) ⚠️ |
| `databaseType` | `string` | `'postgres'` | Database type: `'postgres'`, `'mysql'`, `'mariadb'`, `'sqlite'`, `'mssql'` |
| `onAnalysis` | `function` | `undefined` | Callback with execution plan |
| `enableLogging` | `boolean` | `false` | Auto-log execution plans |

#### **Usage:**

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

</details>

<details>
<summary><strong>⚠️ LazyLoadingDetector</strong> - Detect lazy-loaded relations (hidden N+1)</summary>

#### **What it does:**
Warns when lazy-loaded relations are accessed (often causes hidden N+1 queries).

#### **The Problem:**
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

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `warnOnLazyLoad` | `boolean` | `true` | Warn when lazy loading is detected |
| `suggestEagerLoading` | `boolean` | `true` | Show code suggestion to fix |
| `threshold` | `number` | `1` | Warn after N lazy loads of same relation |
| `onLazyLoadDetected` | `function` | `undefined` | Callback when lazy load detected |
| `enableLogging` | `boolean` | `false` | Auto-log lazy loading warnings |

#### **Usage:**

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

</details>

<details>
<summary><strong>⚡ PerformanceMonitor</strong> - Track query execution time</summary>

#### **What it does:**
Monitors query performance and detects slow queries.

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `slowQueryThreshold` | `number` | `500` | Threshold in ms for slow query detection |
| `onSlowQuery` | `function` | `undefined` | Callback when slow query detected |
| `onMetric` | `function` | `undefined` | Callback for all query completions |
| `enableLogging` | `boolean` | `false` | Auto-log performance metrics |

#### **Usage:**

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

</details>

---

### **🗃️ Data Management**

<details>
<summary><strong>🗑️ CacheInvalidation</strong> - Auto-invalidate cache on data changes</summary>

#### **What it does:**
Automatically invalidates cache when `INSERT`, `UPDATE`, or `DELETE` operations occur.

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `onInvalidate` | `function` | **REQUIRED** | Callback to clear your cache (Redis, memory, etc.) |
| `invalidateOnTypes` | `string[]` | `['INSERT','UPDATE','DELETE']` | Query types that trigger invalidation |
| `monitorTables` | `string[]` | `[]` (all) | Specific tables to monitor. Empty = all tables |
| `enableLogging` | `boolean` | `false` | Auto-log cache invalidations |

#### **Usage:**

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

</details>

<details>
<summary><strong>📝 AuditLogging</strong> - Track all database operations (GDPR/HIPAA ready)</summary>

#### **What it does:**
Comprehensive audit trail of who did what, when, and on which tables.

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `onAudit` | `function` | **REQUIRED** | Callback to persist audit logs |
| `getUserId` | `function` | `undefined` | Function to get current user ID |
| `auditTypes` | `string[]` | `['INSERT','UPDATE','DELETE']` | Query types to audit |
| `auditTables` | `string[]` | `[]` (all) | Tables to audit. Empty = all |
| `includeSql` | `boolean` | `true` | Include SQL in audit logs |
| `includeParameters` | `boolean` | `false` | Include parameters (may contain sensitive data) |
| `metadata` | `object\|function` | `undefined` | Additional metadata to include |
| `enableLogging` | `boolean` | `false` | Auto-log audit entries |

#### **Usage:**

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

</details>

<details>
<summary><strong>📊 BulkOperations</strong> - Prevent accidental mass updates/deletes</summary>

#### **What it does:**
Detects operations affecting many rows - prevents accidents like deleting 100,000 records.

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bulkThreshold` | `number` | `100` | Threshold for considering operation "bulk" (rows) |
| `monitorTypes` | `string[]` | `['INSERT','UPDATE','DELETE']` | Query types to monitor |
| `monitorTables` | `string[]` | `[]` (all) | Tables to monitor. Empty = all |
| `warnOnBulk` | `boolean` | `true` | Warn when bulk operation detected |
| `onBulkOperation` | `function` | `undefined` | Callback when bulk operation detected |
| `enableLogging` | `boolean` | `false` | Auto-log bulk operations |

#### **Usage:**

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

</details>

<details>
<summary><strong>🔄 QueryResultTransformer</strong> - Auto-transform results to DTOs</summary>

#### **What it does:**
Automatically transforms database results to DTOs, removes sensitive data, adds computed fields.

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `transformers` | `Record<string, Function>` | `{}` | Transformers by entity name |
| `globalTransformer` | `function` | `undefined` | Applied to all results |
| `enableLogging` | `boolean` | `false` | Auto-log transformations |

#### **Usage:**

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

</details>

---

### **🛠️ Utilities**

<details>
<summary><strong>🏷️ TableExtractor</strong> - Extract table names from queries</summary>

#### **What it does:**
Extracts all table names from any TypeORM query (SELECT, INSERT, UPDATE, DELETE, CTEs, subqueries, joins).

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `warnOnEmptyTables` | `boolean` | `false` | Warn when no tables are extracted |
| `enableLogging` | `boolean` | `false` | Log extracted tables |

#### **Usage:**

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

</details>

<details>
<summary><strong>✅ ResultValidator</strong> - Validate query results</summary>

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `largeResultThreshold` | `number` | `1000` | Threshold for large result set (rows) |
| `monitorTables` | `string[]` | `[]` (all) | Tables to monitor. Empty = all |
| `onEmptyResult` | `function` | `undefined` | Callback when query returns no results |
| `onLargeResult` | `function` | `undefined` | Callback when result exceeds threshold |
| `enableLogging` | `boolean` | `false` | Auto-log validation warnings |

#### **Usage:**

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

</details>

<details>
<summary><strong>✏️ QueryModifier</strong> - Modify queries before execution</summary>

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `modifySql` | `function` | `undefined` | Modify SQL before execution |
| `modifyParameters` | `function` | `undefined` | Modify parameters before execution |
| `shouldExecute` | `function` | `undefined` | Return false to cancel query |
| `enableLogging` | `boolean` | `false` | Auto-log modifications |

#### **Usage:**

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

</details>

<details>
<summary><strong>🔍 QueryComplexity</strong> - Warn on complex queries</summary>

#### **Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxJoins` | `number` | `5` | Max joins before warning |
| `maxTables` | `number` | `10` | Max tables before warning |
| `warnOnSubqueries` | `boolean` | `false` | Warn on subqueries |
| `warnOnCTEs` | `boolean` | `false` | Warn on Common Table Expressions |
| `onComplexQuery` | `function` | `undefined` | Callback when complex query detected |
| `enableLogging` | `boolean` | `false` | Auto-log complexity warnings |

#### **Usage:**

```typescript
import { QueryComplexityPlugin } from 'typeorm-query-hooks/plugins/query-complexity';

registerPlugin(QueryComplexityPlugin({
  maxJoins: 3,
  maxTables: 5,
  warnOnSubqueries: true,
  enableLogging: true
}));
```

</details>

<details>
<summary><strong>🪵 QueryLogger</strong> - Custom query logging with filters</summary>

See plugin documentation for details.

</details>

<details>
<summary><strong>💾 QueryMetadataRegistry</strong> - Store query metadata</summary>

Automatically registered when using NestJS integration. See NestJS section below.

</details>

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
