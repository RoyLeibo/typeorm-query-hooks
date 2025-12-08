# 🚀 TypeORM Query Hooks

> **Powerful plugin-based hooks for TypeORM** - Monitor performance, validate results, modify queries, track transactions & extract table metadata. Works seamlessly with **JavaScript**, **TypeScript**, and **NestJS**.

[![npm version](https://badge.fury.io/js/typeorm-query-hooks.svg)](https://www.npmjs.com/package/typeorm-query-hooks)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

---

## ✨ Features

### 🎯 **Core Capabilities**

- **🔍 Table Extraction** - Automatically extract all tables from any TypeORM query (SELECT, INSERT, UPDATE, DELETE, CTEs, subqueries)
- **⚡ Performance Monitoring** - Track query execution time, detect slow queries, identify bottlenecks
- **✅ Result Validation** - Monitor empty results, detect large result sets, validate query outcomes
- **✏️ Query Modification** - Modify SQL and parameters before execution (multi-tenancy, query hints, safety checks)
- **🔄 Transaction Tracking** - Monitor transaction lifecycle (start, commit, rollback)
- **🎣 Extensible Hooks** - Create custom plugins for your specific needs
- **🪵 Enhanced Logging** - Rich query metadata for better debugging and observability

### 🏗️ **Built-in Plugins** (20 Total!)

#### **🔥 Critical Performance & Safety**
| Plugin | Purpose | Use Case |
|--------|---------|----------|
| **🕵️ NPlusOneDetector** | Detect N+1 query problems | #1 performance killer - catches 80% of issues |
| **🛡️ SafetyGuard** | Block dangerous operations | Prevents DELETE/UPDATE without WHERE, blocks DDL |
| **💧 ConnectionLeakDetector** | Find connection leaks | Prevents pool exhaustion and app crashes |
| **⏱️ QueryTimeout** | Automatic query timeouts | Prevents queries from hanging forever |
| **🧟 IdleTransactionMonitor** | Detect zombie transactions | Prevents deadlocks from idle transactions |

#### **🔬 Analysis & Debugging**
| Plugin | Purpose | Use Case |
|--------|---------|----------|
| **📍 QuerySourceTracer** | Show where queries originate | CSI: Database - find exact file:line in your code |
| **🔬 SlowQueryAnalyzer** | Auto-run EXPLAIN on slow queries | Automatic query plan analysis |
| **⚠️ LazyLoadingDetector** | Detect lazy-loaded relations | Catches hidden N+1 problems |
| **⚡ PerformanceMonitor** | Track query execution time | Monitor and optimize performance |

#### **🗃️ Data Management**
| Plugin | Purpose | Use Case |
|--------|---------|----------|
| **🗑️ CacheInvalidation** | Auto-invalidate cache on writes | Maintain cache consistency |
| **📝 AuditLogging** | Track all database operations | Compliance (GDPR, HIPAA), security |
| **📊 BulkOperations** | Detect bulk operations | Prevent accidental mass updates |
| **🔄 QueryResultTransformer** | Transform query results | Auto-convert to DTOs, remove sensitive data |

#### **🛠️ Utilities**
| Plugin | Purpose | Use Case |
|--------|---------|----------|
| **🏷️ TableExtractor** | Extract table names from queries | Logging, caching, access control |
| **✅ ResultValidator** | Validate query results | Alert on empty results, pagination issues |
| **✏️ QueryModifier** | Modify queries before execution | Multi-tenancy, query hints, safety |
| **🔍 QueryComplexity** | Warn on complex queries | Identify queries needing optimization |
| **💾 QueryMetadataRegistry** | Store query metadata | Analytics, cross-cutting concerns |
| **🪵 QueryLogger** | Custom query logging | Flexible logging with filters |

### ⚙️ **Default Configuration Values**

| Option | Plugin | Default | Description |
|--------|--------|---------|-------------|
| **Core Options** ||||
| `verbose` | Core | `false` | Enable debug logging for the core hook system |
| **Performance Monitor** ||||
| `slowQueryThreshold` | PerformanceMonitor | `500` ms | Threshold for slow query detection |
| **Result Validator** ||||
| `largeResultThreshold` | ResultValidator | `1000` rows | Threshold for large result set detection |
| `monitorTables` | ResultValidator | `[]` (all) | Tables to monitor. Empty array = all tables |
| **Table Extractor** ||||
| `warnOnEmptyTables` | TableExtractor | `false` | Warn when no tables are extracted |
| **Cache Invalidation** ||||
| `invalidateOnTypes` | CacheInvalidation | `['INSERT','UPDATE','DELETE']` | Query types that trigger cache invalidation |
| `monitorTables` | CacheInvalidation | `[]` (all) | Tables to invalidate cache for. Empty = all |
| **Audit Logging** ||||
| `auditTypes` | AuditLogging | `['INSERT','UPDATE','DELETE']` | Query types to audit (only writes by default) |
| `auditTables` | AuditLogging | `[]` (all) | Tables to audit. Empty = all tables |
| `includeSql` | AuditLogging | `true` | Include SQL query in audit logs |
| `includeParameters` | AuditLogging | `false` | Include query parameters in audit logs |
| **Bulk Operations** ||||
| `bulkThreshold` | BulkOperations | `100` rows | Threshold for considering operation "bulk" |
| `monitorTypes` | BulkOperations | `['INSERT','UPDATE','DELETE']` | Query types to monitor for bulk operations |
| `warnOnBulk` | BulkOperations | `true` | Warn when bulk operation is detected |
| **Query Complexity** ||||
| `maxJoins` | QueryComplexity | `5` | Maximum joins before warning |
| `maxTables` | QueryComplexity | `10` | Maximum tables before warning |
| `warnOnSubqueries` | QueryComplexity | `false` | Warn on subqueries |
| `warnOnCTEs` | QueryComplexity | `false` | Warn on Common Table Expressions |
| **All Plugins** ||||
| `enableLogging` | All plugins | `false` | Enable console logging for the plugin |

**💡 What does `enableLogging` mean?**
- When `true`: Plugin outputs console.log/warn/error messages automatically
- When `false`: Plugin is silent unless you provide custom callbacks (recommended for production)
- Example: `PerformanceMonitor` with `enableLogging: true` will automatically console.warn slow queries

**💡 What does `monitorTables` mean?**
- Empty array `[]`: Monitor ALL tables (default for most plugins)
- Specific tables `['users', 'orders']`: Only monitor these specific tables
- Use specific tables to reduce overhead and focus on critical data

### 🎭 **Hook Types**

```typescript
// Query Build Hooks
onQueryBuild(context)         // When query is built
onBeforeQuery(context)        // Before execution (can modify SQL)

// Execution Hooks
onQueryStart(context)         // Execution starts
onQueryComplete(context)      // Execution completes
onQueryError(context)         // Execution fails
onSlowQuery(context)          // Slow query detected

// Result Hooks
onQueryResult(context)        // Result received
onEmptyResult(context)        // No results returned
onLargeResult(context)        // Large result set detected

// Transaction Hooks
onTransactionStart(context)   // Transaction begins
onTransactionCommit(context)  // Transaction commits
onTransactionRollback(context) // Transaction rolls back
onTransactionEnd(context)     // Transaction ends

// Connection Pool Hooks
onConnectionAcquired(context) // Connection acquired
onConnectionReleased(context) // Connection released
onConnectionPoolFull(context) // Pool exhausted
onConnectionError(context)    // Connection error
```

---

## 📦 Installation

```bash
npm install typeorm-query-hooks
# or
yarn add typeorm-query-hooks
```

---

## 🚀 Quick Start

### **JavaScript / TypeScript**

```typescript
import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
import { PerformanceMonitorPlugin } from 'typeorm-query-hooks/plugins/performance-monitor';

// Enable hooks at application startup
enableQueryHooks({
  verbose: false  // Enable debug logging (default: false)
});

// Register performance monitoring plugin with its own configuration
registerPlugin(PerformanceMonitorPlugin({
  slowQueryThreshold: 500,  // Plugin-specific threshold
  enableLogging: true,
  onSlowQuery: (context) => {
    console.warn(`🐌 Slow query: ${context.executionTime}ms`, {
      sql: context.sql.substring(0, 200),
      method: context.methodName
    });
    
    // Send to your monitoring service
    // datadog.increment('slow_queries');
    // newrelic.recordMetric('query_time', context.executionTime);
  }
}));

// That's it! Now all your TypeORM queries are monitored
```

### **NestJS Integration**

```typescript
// app.module.ts or main.ts
import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
import { createTableExtractorPlugin } from 'typeorm-query-hooks/plugins/table-extractor';
import { QueryMetadataRegistryPlugin } from 'typeorm-query-hooks/plugins/query-metadata-registry';
import { PerformanceMonitorPlugin } from 'typeorm-query-hooks/plugins/performance-monitor';

// Initialize hooks before TypeORM connection
enableQueryHooks({ verbose: true });

// Register plugins with their own configurations
registerPlugin(createTableExtractorPlugin({
  warnOnEmptyTables: true,
  enableLogging: false
}));
registerPlugin(QueryMetadataRegistryPlugin);
registerPlugin(PerformanceMonitorPlugin({
  slowQueryThreshold: 500,
  enableLogging: true
}));

@Module({
  imports: [
    TypeOrmModule.forRoot({
      // ... your TypeORM config
    }),
  ],
})
export class AppModule {}
```

**Custom Logger with Table Extraction:**

```typescript
import { Logger } from 'typeorm';
import { getTablesFromSQL } from 'typeorm-query-hooks';

export class MyCustomLogger implements Logger {
  logQuery(query: string, parameters?: any[]) {
    // Extract tables automatically!
    const tables = getTablesFromSQL(query);
    
    console.log('Query executed:', {
      sql: query.substring(0, 200),
      tables,
      parameters
    });
  }

  logQueryError(error: string, query: string, parameters?: any[]) {
    const tables = getTablesFromSQL(query);
    console.error('Query failed:', { error, tables });
  }

  logQuerySlow(time: number, query: string, parameters?: any[]) {
    const tables = getTablesFromSQL(query);
    console.warn(`Slow query (${time}ms):`, { tables });
  }

  logSchemaBuild(message: string) {
    console.log(message);
  }

  logMigration(message: string) {
    console.log(message);
  }

  log(level: 'log' | 'info' | 'warn', message: any) {
    console.log(`[${level}] ${message}`);
  }
}
```

---

## 🚀 Featured Plugins

### **1. Cache Invalidation Plugin**

Automatically invalidate your cache when data changes. Essential for maintaining cache consistency.

```typescript
import { CacheInvalidationPlugin } from 'typeorm-query-hooks/plugins/cache-invalidation';
import Redis from 'ioredis';

const redis = new Redis();

registerPlugin(CacheInvalidationPlugin({
  onInvalidate: async (tables) => {
    for (const table of tables) {
      await redis.del(`cache:${table}:*`);
    }
  },
  monitorTables: ['users', 'products'], // Only these tables (default: all)
  invalidateOnTypes: ['INSERT', 'UPDATE', 'DELETE'], // (default)
  enableLogging: true
}));
```

### **2. Audit Logging Plugin**

Track all database operations for compliance, security, and forensics.

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
  auditTypes: ['INSERT', 'UPDATE', 'DELETE'], // Only writes (default)
  auditTables: [], // All tables (default)
  includeSql: true, // (default)
  includeParameters: false, // Don't log sensitive data (default)
  enableLogging: true
}));
```

### **3. Bulk Operations Plugin**

Prevent accidental mass updates or deletes.

```typescript
import { BulkOperationsPlugin } from 'typeorm-query-hooks/plugins/bulk-operations';

registerPlugin(BulkOperationsPlugin({
  bulkThreshold: 100, // Warn if > 100 rows affected (default)
  warnOnBulk: true, // (default)
  onBulkOperation: (context, affectedRows) => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Bulk operation blocked: ${affectedRows} rows`);
    }
  }
}));
```

---

## 📚 Usage Examples

### 1. **Performance Monitoring**

Detect slow queries and send alerts to your monitoring service.

```typescript
import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
import { PerformanceMonitorPlugin } from 'typeorm-query-hooks/plugins/performance-monitor';

enableQueryHooks();

registerPlugin(PerformanceMonitorPlugin({
  slowQueryThreshold: 500,  // Plugin-specific threshold
  enableLogging: true,
  onSlowQuery: (context) => {
    // Send to DataDog
    datadog.histogram('database.query.duration', context.executionTime, {
      tags: [`method:${context.methodName}`, `type:${context.queryType}`]
    });
    
    // Send to Sentry
    Sentry.captureMessage(`Slow query: ${context.executionTime}ms`, {
      level: 'warning',
      extra: {
        sql: context.sql,
        executionTime: context.executionTime
      }
    });
  },
  onMetric: (context) => {
    // Track all query metrics
    prometheus.histogram('query_duration_ms', context.executionTime);
  }
}));
```

### 2. **Result Validation**

Alert when critical queries return empty results or large datasets.

```typescript
import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
import { ResultValidatorPlugin } from 'typeorm-query-hooks/plugins/result-validator';

enableQueryHooks();

registerPlugin(ResultValidatorPlugin({
  largeResultThreshold: 1000,  // Plugin-specific threshold
  monitorTables: ['users', 'orders', 'products'], // Only monitor these tables
  enableLogging: true,
  onEmptyResult: (context) => {
    // Alert if critical queries return nothing (potential bug)
    logger.warn('Empty result detected', {
      sql: context.sql,
      method: context.methodName
    });
  },
  onLargeResult: (context) => {
    // Alert on large result sets (pagination recommended)
    logger.warn(`Large result: ${context.rowCount} rows`, {
      sql: context.sql.substring(0, 150),
      suggestion: 'Consider adding .take() and .skip() for pagination'
    });
  }
}));
```

### 3. **Query Modification**

Modify SQL before execution for multi-tenancy, query hints, or safety checks.

```typescript
import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
import { 
  QueryModifierPlugin, 
  TenantFilterModifier, 
  SafetyModifier 
} from 'typeorm-query-hooks/plugins/query-modifier';

enableQueryHooks();

// Example 1: Multi-tenancy (automatically inject tenant filters)
registerPlugin(TenantFilterModifier({
  getTenantId: () => getCurrentUser().tenantId,
  tables: ['orders', 'products', 'customers'],
  tenantColumn: 'tenant_id'
}));

// Example 2: Add query hints for optimization
registerPlugin(QueryModifierPlugin({
  modifySql: (context) => {
    if (context.sql.includes('FROM users') && context.sql.includes('email')) {
      // Add index hint
      return context.sql.replace('FROM users', 'FROM users USE INDEX (idx_email)');
    }
  },
  enableLogging: true
}));

// Example 3: Block dangerous queries in production
if (process.env.NODE_ENV === 'production') {
  registerPlugin(SafetyModifier()); // Blocks DELETE/UPDATE without WHERE
}

// Example 4: Custom query modification
registerPlugin(QueryModifierPlugin({
  shouldExecute: (context) => {
    // Block queries during maintenance window
    if (isMaintenanceMode()) {
      console.error('Database is in maintenance mode');
      return false; // Cancel query execution
    }
    return true;
  }
}));
```

### 4. **Table Extraction**

Extract all tables from any query for logging, caching, or access control.

```typescript
import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
import { TableExtractorPlugin, extractTablesFromBuilder } from 'typeorm-query-hooks/plugins/table-extractor';

enableQueryHooks();
registerPlugin(TableExtractorPlugin);

// Now use it in your code
const users = await dataSource
  .getRepository(User)
  .createQueryBuilder('user')
  .leftJoinAndSelect('user.profile', 'profile')
  .where('user.email = :email', { email: 'test@example.com' })
  .getMany();

// Extract tables manually if needed
const query = dataSource
  .getRepository(Order)
  .createQueryBuilder('order')
  .leftJoin('order.customer', 'customer')
  .leftJoin('order.items', 'items');

const tables = extractTablesFromBuilder(query);
console.log(tables); // ['orders', 'customers', 'order_items']

// Or use the utility method added to QueryBuilder
const tables2 = query.getInvolvedTables();
console.log(tables2); // ['orders', 'customers', 'order_items']
```

### 5. **Access Control & Auditing**

Track which tables are accessed by which users.

```typescript
import { enableQueryHooks, registerPlugin, QueryHookPlugin } from 'typeorm-query-hooks';
import { extractTablesFromBuilder } from 'typeorm-query-hooks/plugins/table-extractor';

enableQueryHooks();

// Custom plugin for access control
const AccessControlPlugin: QueryHookPlugin = {
  name: 'AccessControl',
  
  onQueryBuild: (context) => {
    const tables = extractTablesFromBuilder(context.builder);
    const user = getCurrentUser();
    
    // Check if user has access to these tables
    const forbiddenTables = tables.filter(table => 
      !user.permissions.includes(`read:${table}`)
    );
    
    if (forbiddenTables.length > 0) {
      throw new Error(`Access denied to tables: ${forbiddenTables.join(', ')}`);
    }
    
    // Audit log
    auditLog.log({
      userId: user.id,
      action: 'query',
      tables,
      timestamp: new Date()
    });
  }
};

registerPlugin(AccessControlPlugin);
```

### 6. **Cache Invalidation**

Automatically invalidate cache when specific tables are modified.

```typescript
import { enableQueryHooks, registerPlugin, QueryHookPlugin } from 'typeorm-query-hooks';
import { extractTablesFromBuilder } from 'typeorm-query-hooks/plugins/table-extractor';

enableQueryHooks();

const CacheInvalidationPlugin: QueryHookPlugin = {
  name: 'CacheInvalidation',
  
  onQueryComplete: (context) => {
    const queryType = context.queryType?.toUpperCase();
    
    // Only invalidate on write operations
    if (['INSERT', 'UPDATE', 'DELETE'].includes(queryType || '')) {
      const tables = extractTablesFromBuilder(context.builder);
      
      // Clear cache for affected tables
      tables.forEach(table => {
        redis.del(`cache:${table}:*`);
        console.log(`Cache invalidated for table: ${table}`);
      });
    }
  }
};

registerPlugin(CacheInvalidationPlugin);
```

### 7. **Distributed Tracing**

Integrate with OpenTelemetry or Jaeger for distributed tracing.

```typescript
import { enableQueryHooks, registerPlugin, QueryHookPlugin } from 'typeorm-query-hooks';
import { trace, SpanStatusCode } from '@opentelemetry/api';

enableQueryHooks();

const TracingPlugin: QueryHookPlugin = {
  name: 'DistributedTracing',
  
  onQueryStart: (context) => {
    const tracer = trace.getTracer('typeorm');
    const span = tracer.startSpan(`db.query.${context.methodName}`, {
      attributes: {
        'db.statement': context.sql,
        'db.operation': context.queryType
      }
    });
    
    // Store span in context for later
    (context as any).span = span;
  },
  
  onQueryComplete: (context) => {
    const span = (context as any).span;
    if (span) {
      span.setAttribute('db.duration_ms', context.executionTime);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    }
  },
  
  onQueryError: (context) => {
    const span = (context as any).span;
    if (span) {
      span.setStatus({ 
        code: SpanStatusCode.ERROR,
        message: context.error.message 
      });
      span.end();
    }
  }
};

registerPlugin(TracingPlugin);
```

### 8. **Transaction Monitoring**

Track transaction lifecycle for debugging and monitoring.

```typescript
import { enableQueryHooks, registerPlugin, QueryHookPlugin } from 'typeorm-query-hooks';

enableQueryHooks();

const TransactionMonitorPlugin: QueryHookPlugin = {
  name: 'TransactionMonitor',
  
  onTransactionStart: (context) => {
    console.log('🔄 Transaction started', {
      timestamp: context.timestamp,
      queryRunner: context.queryRunner
    });
  },
  
  onTransactionCommit: (context) => {
    console.log('✅ Transaction committed', {
      executionTime: context.executionTime,
      queriesExecuted: context.queriesExecuted?.length || 0
    });
    
    // Clear cache after successful transaction
    redis.del('cache:*');
  },
  
  onTransactionRollback: (context) => {
    console.error('❌ Transaction rolled back', {
      error: context.error.message,
      executionTime: context.executionTime
    });
    
    // Send alert to error tracking service
    Sentry.captureException(context.error, {
      extra: {
        queriesExecuted: context.queriesExecuted
      }
    });
  },
  
  onTransactionEnd: (context) => {
    console.log('🏁 Transaction ended', {
      duration: context.executionTime
    });
  }
};

registerPlugin(TransactionMonitorPlugin);
```

### 9. **Connection Pool Monitoring**

Monitor database connection pool health.

```typescript
import { enableQueryHooks, registerPlugin, QueryHookPlugin } from 'typeorm-query-hooks';

enableQueryHooks();

const ConnectionPoolPlugin: QueryHookPlugin = {
  name: 'ConnectionPoolMonitor',
  
  onConnectionAcquired: (context) => {
    console.log('🔗 Connection acquired', {
      activeConnections: context.activeConnections,
      idleConnections: context.idleConnections
    });
    
    // Track connection pool metrics
    prometheus.gauge('db_connections_active', context.activeConnections || 0);
    prometheus.gauge('db_connections_idle', context.idleConnections || 0);
  },
  
  onConnectionReleased: (context) => {
    console.log('🔓 Connection released');
  },
  
  onConnectionPoolFull: (context) => {
    console.error('🚨 Connection pool exhausted!', {
      maxConnections: context.maxConnections,
      waitingCount: context.waitingCount
    });
    
    // Send critical alert
    pagerduty.trigger({
      severity: 'critical',
      summary: 'Database connection pool exhausted',
      details: context
    });
  },
  
  onConnectionError: (context) => {
    console.error('❌ Connection error', {
      error: context.error.message
    });
    
    // Track connection errors
    datadog.increment('db_connection_errors');
  }
};

registerPlugin(ConnectionPoolPlugin);
```

---

## 🎨 Creating Custom Plugins

Creating your own plugin is simple! Just implement the `QueryHookPlugin` interface:

```typescript
import { QueryHookPlugin, QueryHookContext } from 'typeorm-query-hooks';

const MyCustomPlugin: QueryHookPlugin = {
  name: 'MyCustomPlugin',
  
  // Optional: Initialize when registered
  onRegister: () => {
    console.log('Plugin registered!');
  },
  
  // Optional: Setup when hooks are enabled
  onEnable: () => {
    console.log('Hooks enabled!');
  },
  
  // Implement any hooks you need
  onQueryBuild: (context: QueryHookContext) => {
    console.log('Query built:', context.sql);
  },
  
  onBeforeQuery: (context) => {
    // Modify SQL before execution
    if (context.sql.includes('SELECT *')) {
      console.warn('SELECT * is not recommended');
    }
    return true; // Return false to cancel query
  },
  
  onQueryComplete: (context) => {
    console.log(`Query took ${context.executionTime}ms`);
  },
  
  onSlowQuery: (context) => {
    console.warn('Slow query detected!');
  },
  
  onEmptyResult: (context) => {
    console.warn('Query returned no results');
  }
};

// Register your plugin
registerPlugin(MyCustomPlugin);
```

---

## 🔧 API Reference

### **Core Functions**

#### `enableQueryHooks(options?)`

Enable the hook system. Call once at application startup.

```typescript
enableQueryHooks({
  verbose: boolean  // Enable debug logging (default: false)
});
```

**Note:** Configuration like thresholds and warnings are now plugin-specific. Each plugin has its own options.

#### `registerPlugin(plugin)`

Register a plugin to receive hooks.

```typescript
registerPlugin(MyPlugin);
```

#### `unregisterPlugin(pluginName)`

Unregister a plugin by name.

```typescript
unregisterPlugin('MyPlugin');
```

#### `isHooksEnabled()`

Check if hooks are currently enabled.

```typescript
const enabled = isHooksEnabled(); // boolean
```

### **Utility Functions**

#### `getTablesFromSQL(sql: string): string[]`

Extract table names from a SQL string.

```typescript
import { getTablesFromSQL } from 'typeorm-query-hooks';

const tables = getTablesFromSQL('SELECT * FROM users JOIN orders ON users.id = orders.user_id');
// Returns: ['users', 'orders']
```

#### `extractTablesFromBuilder(builder): string[]`

Extract table names from a QueryBuilder instance.

```typescript
import { extractTablesFromBuilder } from 'typeorm-query-hooks/plugins/table-extractor';

const query = dataSource.getRepository(User).createQueryBuilder('user');
const tables = extractTablesFromBuilder(query);
```

#### `builder.getInvolvedTables(): string[]`

Added method to all QueryBuilder instances (after TableExtractorPlugin is registered).

```typescript
const query = dataSource.getRepository(User).createQueryBuilder('user');
const tables = query.getInvolvedTables(); // ['users']
```

---

## 🐛 Debugging

Enable verbose mode to see detailed logging:

```typescript
enableQueryHooks({ verbose: true });
```

This will log:
- When hooks are enabled
- When plugins are registered
- When each hook is triggered
- SQL queries being captured
- Tables extracted from queries
- Execution timing

### Plugin-Specific Configuration

Each plugin has its own configuration options:

**PerformanceMonitorPlugin:**
```typescript
registerPlugin(PerformanceMonitorPlugin({
  slowQueryThreshold: 500,  // ms (default: 500)
  enableLogging: true,      // console logging (default: false)
  onSlowQuery: (context) => { /* custom handler */ },
  onMetric: (context) => { /* custom handler */ }
}));
```

**ResultValidatorPlugin:**
```typescript
registerPlugin(ResultValidatorPlugin({
  largeResultThreshold: 1000,  // rows (default: 1000)
  monitorTables: ['users', 'orders'],  // specific tables (default: [] = all)
  enableLogging: true,  // console logging (default: false)
  onEmptyResult: (context) => { /* custom handler */ },
  onLargeResult: (context) => { /* custom handler */ }
}));
```

**TableExtractorPlugin:**
```typescript
registerPlugin(createTableExtractorPlugin({
  warnOnEmptyTables: true,  // warn when no tables found (default: false)
  enableLogging: true       // console logging (default: false)
}));
```

Empty tables warning example (when `warnOnEmptyTables: true`):
```
[TableExtractor] ⚠️  No tables extracted from SELECT query.
This might indicate an issue with table extraction or a raw query without table metadata.
```

---

## 🏗️ How It Works

1. **Patching**: The library patches TypeORM's `QueryBuilder` methods (`getQuery`, `getOne`, `getMany`, `execute`, etc.)
2. **Hook Execution**: When a query is built or executed, registered plugins receive callbacks with rich context
3. **Table Extraction**: Uses TypeORM's internal `expressionMap` to extract table names (no regex!)
4. **AsyncLocalStorage**: Query context is passed through async boundaries using Node.js `AsyncLocalStorage`
5. **Zero Config**: No changes to your existing TypeORM code required

---

## 🔮 Future Extensibility

This library is designed to grow! Potential future hooks:

- ✅ Query Performance Monitoring (✓ **Implemented in v4.0**)
- ✅ Result Validation (✓ **Implemented in v4.0**)
- ✅ Query Modification (✓ **Implemented in v4.0**)
- ✅ Transaction Tracking (✓ **Implemented in v4.0**)
- 🔜 Connection Pool Monitoring (coming soon)
- 🔜 Migration Lifecycle Hooks (coming soon)
- 🔜 Schema Synchronization Hooks (coming soon)
- 🔜 Entity Lifecycle Integration (coming soon)

**Have an idea?** [Open an issue](https://github.com/RoyLeibo/typeorm-query-hooks/issues) or submit a PR!

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

---

## 📄 License

MIT © [Roy Leibovitz](https://github.com/RoyLeibo)

---

## 🌟 Show Your Support

If this library helps you, please give it a ⭐️ on [GitHub](https://github.com/RoyLeibo/typeorm-query-hooks)!

---

## 📊 Use Cases

### **Production Monitoring**
- Track slow queries in production
- Send metrics to DataDog, New Relic, or Prometheus
- Alert on query performance degradation

### **Development & Debugging**
- Identify N+1 query problems
- Detect missing indexes
- Validate query correctness

### **Security & Compliance**
- Audit database access
- Implement row-level security
- Enforce multi-tenancy

### **Performance Optimization**
- Cache invalidation based on table changes
- Query result caching
- Connection pool monitoring

### **Observability & APM**
- Distributed tracing with OpenTelemetry
- Query timeline visualization
- Database operation insights

---

**Built with ❤️ by [Roy Leibovitz](https://github.com/RoyLeibo)**
