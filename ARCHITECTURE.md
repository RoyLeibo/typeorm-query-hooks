# Architecture & Flow Diagrams

## Overview

This document explains how `typeorm-query-hooks` works internally and how it integrates with your application.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         YOUR APPLICATION                             │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │   Service    │  │  Repository  │  │  Controller  │             │
│  │              │  │              │  │              │             │
│  │ Uses standard│  │ Uses standard│  │ Uses standard│             │
│  │ TypeORM APIs │  │ TypeORM APIs │  │ TypeORM APIs │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│         │                 │                 │                      │
│         └─────────────────┼─────────────────┘                      │
│                           │                                         │
└───────────────────────────┼─────────────────────────────────────────┘
                            │
                            │ import { Repository } from 'typeorm'
                            │ NO CHANGES NEEDED!
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    TYPEORM (Patched at Runtime)                      │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │           QueryBuilder Classes (Prototypes Modified)         │  │
│  │                                                               │  │
│  │  SelectQueryBuilder.prototype.getQuery = function() {        │  │
│  │    const sql = originalGetQuery.call(this);   ◄── Original   │  │
│  │    // 🎯 HOOK INSERTED HERE                                   │  │
│  │    triggerPlugins(this, sql);                 ◄── New Logic  │  │
│  │    return sql;                                                │  │
│  │  }                                                            │  │
│  │                                                               │  │
│  │  [Same for Insert/Update/DeleteQueryBuilder]                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            │ When .getQuery() or .getMany() called
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   typeorm-query-hooks CORE                           │
│                                                                      │
│  1. Extract metadata from builder.expressionMap                     │
│  2. Build QueryHookContext { builder, sql, timestamp }              │
│  3. For each registered plugin:                                     │
│     - Call plugin.onQueryBuild(context)                             │
│     - Catch errors, log warnings                                    │
│  4. Return control to TypeORM                                       │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            │ Distributes events to plugins
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         PLUGINS (Parallel)                           │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ TableExtractor   │  │ Metadata         │  │ Your Custom     │  │
│  │ Plugin           │  │ Registry Plugin  │  │ Plugins         │  │
│  │                  │  │                  │  │                 │  │
│  │ • Extract tables │  │ • Map SQL→meta   │  │ • Metrics       │  │
│  │ • Add method     │  │ • Store registry │  │ • Auditing      │  │
│  │ • Fire events    │  │ • Auto cleanup   │  │ • Logging       │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬────────┘  │
│           │                     │                     │            │
└───────────┼─────────────────────┼─────────────────────┼────────────┘
            │                     │                     │
            │                     │                     │
            ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    YOUR CALLBACKS / SERVICES                         │
│                                                                      │
│  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────┐  │
│  │ onTablesExtracted  │  │ TypeORM Logger     │  │ Metrics      │  │
│  │ callbacks          │  │                    │  │ Service      │  │
│  │                    │  │ Uses registry to   │  │              │  │
│  │ Do stuff with      │  │ look up tables     │  │ Record query │  │
│  │ table info         │  │ from raw SQL       │  │ statistics   │  │
│  └────────────────────┘  └────────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Detailed Flow: Query Execution

### Step 1: Your Code Creates a Query

```typescript
// Your service
const users = await this.userRepo
  .createQueryBuilder('user')
  .leftJoin('user.posts', 'post')
  .where('user.active = true')
  .getMany();  // ◄── Triggers the flow
```

### Step 2: TypeORM Builds SQL

```
TypeORM QueryBuilder
├── Builds expressionMap internally
│   ├── mainAlias: { metadata: { tableName: 'users' } }
│   ├── joinAttributes: [
│   │     { metadata: { tableName: 'posts' } }
│   │   ]
│   └── wheres: [...]
│
└── Calls getQuery() to generate SQL
```

### Step 3: Our Hook Intercepts

```javascript
// What happens inside the patched getQuery()

function getQuery() {
  // 1. Call original TypeORM logic
  const sql = originalGetQuery.call(this);
  // sql = "SELECT user.*, post.* FROM users user LEFT JOIN posts post ..."
  
  // 2. Create context for plugins
  const context = {
    builder: this,              // The QueryBuilder instance
    sql: sql,                   // The generated SQL
    timestamp: new Date()
  };
  
  // 3. Call all registered plugins
  plugins.forEach(plugin => {
    if (plugin.onQueryBuild) {
      try {
        plugin.onQueryBuild(context);
      } catch (err) {
        console.warn(`Plugin ${plugin.name} failed:`, err);
      }
    }
  });
  
  // 4. Return SQL unchanged (TypeORM continues normally)
  return sql;
}
```

### Step 4: TableExtractorPlugin Processes

```javascript
// Inside TableExtractorPlugin.onQueryBuild

onQueryBuild: (context) => {
  // Extract tables from the builder's expressionMap
  const tables = extractTablesFromBuilder(context.builder);
  // tables = ['users', 'posts']
  
  // Notify all listeners
  tableExtractorListeners.forEach(listener => {
    listener(tables, context.builder, context.sql);
  });
}
```

### Step 5: QueryMetadataRegistryPlugin Stores

```javascript
// Inside QueryMetadataRegistryPlugin.onQueryBuild

onQueryBuild: (context) => {
  const tables = extractTablesFromBuilder(context.builder);
  const queryType = getQueryType(context.builder);  // 'SELECT'
  
  // Store in registry: SQL → Metadata
  queryMetadataRegistry.register(context.sql, {
    tables: ['users', 'posts'],
    queryType: 'SELECT',
    timestamp: context.timestamp
  });
}
```

### Step 6: Later, Your Logger Receives SQL

```typescript
// TypeORM calls your logger after query execution
logQuerySlow(time: number, query: string): void {
  // Look up the metadata using the SQL string
  const tables = this.getTablesFromQuery(query);
  // tables = ['users', 'posts']  ✅ Retrieved from registry!
  
  // Use it for metrics
  this.metricsService.recordQueryLatency({
    tableName: tables[0],  // 'users'
    executionTimeMs: time
  });
}
```

## Table Extraction Deep Dive

### What Gets Extracted

```
QueryBuilder.expressionMap
├── mainAlias
│   └── metadata.tableName ──────────► 'users'
│
├── joinAttributes []
│   ├── [0].metadata.tableName ──────► 'posts'
│   └── [1].metadata.tableName ──────► 'comments'
│
├── aliases []  (alternative source)
│   ├── [0].metadata.tableName ──────► 'users'
│   ├── [1].metadata.tableName ──────► 'posts'
│   └── [2].metadata.tableName ──────► 'comments'
│
├── commonTableExpressions []  (CTEs)
│   ├── [0].alias ───────────────────► 'active_users'
│   │   └── queryBuilder ────────────► [recursively extract]
│   │       └── mainAlias ───────────► 'users'
│   └── [1].alias ───────────────────► 'premium_products'
│       └── queryBuilder ────────────► [recursively extract]
│           └── mainAlias ───────────► 'products'
│
├── wheres []  (subqueries in WHERE)
│   └── [0].queryBuilder ────────────► [recursively extract]
│       └── mainAlias ───────────────► 'orders'
│
└── selects []  (subqueries in SELECT)
    └── [0].queryBuilder ────────────► [recursively extract]
        └── mainAlias ───────────────► 'order_items'

RESULT: ['users', 'posts', 'comments', 'active_users', 
         'products', 'orders', 'order_items']
```

### Recursive Extraction Example

```typescript
// Query with nested subqueries
repo.createQueryBuilder('order')
  .where(qb => {
    const sub1 = qb.subQuery()
      .select('item.orderId')
      .from(OrderItem, 'item')
      .where(qb2 => {
        const sub2 = qb2.subQuery()
          .select('product.id')
          .from(Product, 'product')
          .where('product.price > 100')
          .getQuery();
        return 'item.productId IN ' + sub2;
      })
      .getQuery();
    return 'order.id IN ' + sub1;
  });

// Extraction flow:
// 1. Extract from main: 'orders'
// 2. Find subquery in wheres[0]
//    - Extract from sub1: 'order_items'
//    - Find nested subquery in sub1.wheres[0]
//      - Extract from sub2: 'products'
// 
// Result: ['orders', 'order_items', 'products']
```

## NestJS Integration Flow

```
┌────────────────────────────────────────────────────────────┐
│                      Application Startup                    │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│         QueryHooksModule.onModuleInit()                     │
│                                                             │
│  1. enableQueryHooks()  ◄── Patches QueryBuilder           │
│  2. registerPlugin(TableExtractorPlugin)                    │
│  3. registerPlugin(QueryMetadataRegistryPlugin)             │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│         TypeORM Module Initialization                       │
│                                                             │
│  TypeOrmModule.forRootAsync({                               │
│    inject: [PostgresqlQueryLogger],  ◄── DI                │
│    useFactory: (logger) => ({                               │
│      ...                                                    │
│      logger: logger,  ◄── Your logger instance             │
│      logging: ['query', 'slow', 'error']                    │
│    })                                                       │
│  })                                                         │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│              Application Running                            │
│                                                             │
│  ┌─────────────┐                                           │
│  │ Service     │                                           │
│  │ calls       │                                           │
│  │ repository  │                                           │
│  └──────┬──────┘                                           │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────────┐                                  │
│  │ QueryBuilder         │                                  │
│  │ .getQuery() called   │                                  │
│  └──────┬───────────────┘                                  │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────────┐                                  │
│  │ Hooks triggered      │                                  │
│  │ Metadata stored      │                                  │
│  └──────┬───────────────┘                                  │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────────┐                                  │
│  │ Query executes       │                                  │
│  └──────┬───────────────┘                                  │
│         │                                                   │
│         ▼                                                   │
│  ┌────────────────────────────┐                            │
│  │ TypeORM calls logger       │                            │
│  │ - logQuery()               │                            │
│  │ - logQuerySlow()           │                            │
│  │ - logQueryError()          │                            │
│  │                            │                            │
│  │ Logger looks up metadata   │                            │
│  │ using SQL string           │                            │
│  │                            │                            │
│  │ ✅ Gets accurate tables!   │                            │
│  └────────────────────────────┘                            │
└────────────────────────────────────────────────────────────┘
```

## Memory Management

```
QueryMetadataRegistry
├── Max Size: 10,000 entries
├── Auto-cleanup: Every time size > max
├── TTL: 60 seconds (configurable)
│
└── Cleanup Strategy:
    1. Remove entries older than TTL
    2. If still > max, remove oldest entries
    3. Use normalized SQL as key (whitespace-insensitive)
```

## Thread Safety

- ✅ Single-threaded (Node.js)
- ✅ No race conditions
- ✅ Synchronous operations
- ✅ Plugin errors don't affect TypeORM

## Performance Impact

```
Typical Query Flow:
├── Build QueryBuilder: ~0.5ms
├── Generate SQL: ~0.1ms
├── 🎯 Hook Processing: ~0.01-0.05ms  ◄── Our overhead
│   ├── Extract tables: ~0.01ms
│   ├── Store registry: ~0.005ms
│   └── Call plugins: ~0.005ms per plugin
├── Network round-trip: ~5-50ms
└── Database execution: ~10-1000ms+

Total overhead: < 0.1% of typical query time
```

## Error Handling

```
Plugin Error Flow:
├── Plugin throws error
├── Caught by try-catch in core
├── Warning logged to console
├── Other plugins continue
└── TypeORM continues normally

Result: One bad plugin can't break your app!
```

## Comparison with Alternatives

### Regex Parsing (Traditional)
```
❌ Breaks with:
   - CTEs (WITH clause)
   - Nested subqueries
   - Complex aliases
   - Comments in SQL
   - String literals containing table names

✅ Works for:
   - Simple SELECT/INSERT/UPDATE/DELETE
   - No performance overhead
```

### SQL Parser (e.g., node-sql-parser)
```
✅ Accurate parsing
❌ Performance overhead (~1-5ms per query)
❌ Large dependency
❌ May not support all PostgreSQL syntax
❌ Still needs table identification logic
```

### typeorm-query-hooks (This Library)
```
✅ 100% accurate (uses TypeORM's own metadata)
✅ Minimal overhead (< 0.05ms per query)
✅ Handles all query types
✅ Extensible plugin system
✅ No SQL parsing needed
❌ Only works for QueryBuilder (not raw SQL)
```

## Summary

1. **Minimal intrusion**: Patches prototypes once at startup
2. **Zero code changes**: Your code continues using standard TypeORM
3. **Accurate extraction**: Uses QueryBuilder's internal metadata
4. **Extensible**: Plugin system for custom functionality
5. **NestJS-friendly**: Works with dependency injection
6. **Production-ready**: Error handling, memory management, minimal overhead

