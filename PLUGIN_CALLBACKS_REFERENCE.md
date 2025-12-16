# Plugin Callbacks Reference

This document provides a quick reference for all event callbacks available in each plugin.

##  TableExtractorPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onTablesExtracted` | `(tables: string[], context: QueryHookContext)` | Called when tables are extracted from a query |
| `onEmptyTables` | `(context: QueryHookContext)` | Called when no tables are extracted (instead of `warnOnEmptyTables`) |
| `onWarning` | `(message: string, context: QueryHookContext)` | Called for any warnings during extraction |
| `onError` | `(error: Error, context: QueryHookContext)` | Called when extraction fails |

**Deprecated:** `warnOnEmptyTables` - Use `onEmptyTables` callback instead

---

## PerformanceMonitorPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onSlowQuery` | `(context: QueryExecutionContext)` | Called when query exceeds slowQueryThreshold |
| `onMetric` | `(context: QueryExecutionContext)` | Called for all query completions (for custom metrics) |

---

## ResultValidatorPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onEmptyResult` | `(context: QueryResultContext)` | Called when query returns no results |
| `onLargeResult` | `(context: QueryResultContext)` | Called when result exceeds largeResultThreshold |

---

## QueryLoggerPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `logger` | `(message: string)` | Custom logger function (defaults to console.log) |
| `filter` | `(context: QueryHookContext)` | Filter which queries to log |

---

## NPlusOneDetectorPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onNPlusOneDetected` | `(context: QueryHookContext, count: number, fingerprint: string, allContexts: QueryHookContext[])` | Called when N+1 pattern is detected |

---

## QueryTimeoutPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onTimeout` | `(context: QueryExecutionContext, timeout: number)` | Called when query times out |
| `onTimeoutWarning` | `(context: QueryExecutionContext, elapsed: number, limit: number)` | Called when query approaches timeout (80% by default) |
| `onError` | `(context: QueryExecutionContext, error: Error)` | Called when timeout mechanism fails |

---

## LazyLoadingDetectorPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onLazyLoadDetected` | `(context: QueryHookContext, relationName: string, count: number)` | Called when lazy loading pattern is detected |
| `onError` | `(context: QueryHookContext, error: Error)` | Called when detection fails |

**Deprecated:** `warnOnLazyLoad` - Use `onLazyLoadDetected` callback instead

---

## IdleTransactionMonitorPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onZombieDetected` | `(context: TransactionContext, zombie: ZombieTransaction)` | Called when zombie transaction detected (long-running AND idle) |
| `onLongRunningTransaction` | `(context: TransactionContext, duration: number)` | Called when transaction exceeds max duration |
| `onIdleTransaction` | `(context: TransactionContext, idleTime: number)` | Called when transaction is idle too long |
| `onError` | `(context: TransactionContext \| undefined, error: Error)` | Called when monitoring fails |

---

## SafetyGuardPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onBlocked` | `(context: PreQueryContext, blocked: BlockedOperation)` | Called when dangerous operation is blocked |

---

## QueryComplexityPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onComplexQuery` | `(metrics: QueryComplexityMetrics, context: QueryHookContext)` | Called when complex query is detected |

---

## CacheInvalidationPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onInvalidate` | `(tables: string[], context: QueryExecutionContext)` | **REQUIRED** - Called to invalidate cache for tables |

---

## AuditLoggingPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onAudit` | `(entry: AuditLogEntry)` | **REQUIRED** - Called to log audit entry |
| `getUserId` | `() => string \| number \| undefined` | Called to get current user ID |

---

## BulkOperationsPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onBulkOperation` | `(context: QueryResultContext, affectedRows: number)` | Called when operation exceeds bulkThreshold |

**Deprecated:** `warnOnBulk` - Use `onBulkOperation` callback instead

---

## QuerySourceTracerPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onQueryLogged` | `(context: QueryContextWithSource, location: SourceLocation)` | Called when query source is traced |

---

## SlowQueryAnalyzerPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onAnalysis` | `(context: QueryExecutionContext, plan: QueryExecutionPlan)` | Called when EXPLAIN analysis completes |

---

## ConnectionLeakDetectorPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onLeak` | `(leak: ConnectionLeak)` | Called when connection leak is detected |
| `onPoolWarning` | `(context: ConnectionPoolContext)` | Called when pool capacity threshold reached |

---

## QueryModifierPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| `modifySql` | `(context: PreQueryContext) => string \| undefined` | **Main** - Modify SQL before execution |
| `modifyParameters` | `(context: PreQueryContext) => any[] \| undefined` | **Main** - Modify parameters before execution |
| `shouldExecute` | `(context: PreQueryContext) => boolean` | Decide if query should run (return false to cancel) |
| `onSqlModified` | `(context: PreQueryContext, originalSql: string, newSql: string)` | Called when SQL was modified |
| `onParametersModified` | `(context: PreQueryContext, originalParams: any[], newParams: any[])` | Called when parameters were modified |
| `onError` | `(context: PreQueryContext, error: Error)` | Called when modification fails |

---

## QueryResultTransformerPlugin

| Callback | Parameters | Description |
|----------|----------||-------------|
| `transformers` | `Record<string, TransformerFn>` | **Main** - Transform results by entity/table |
| `globalTransformer` | `TransformerFn` | **Main** - Transform all results |
| `onTransformed` | `(context: QueryResultContext, originalResult: any, transformedResult: any)` | Called when result was transformed |
| `onError` | `(context: QueryResultContext, error: Error)` | Called when transformation fails |

---

## QueryMetadataRegistryPlugin

| Callback | Parameters | Description |
|----------|------------|-------------|
| *(Utility plugin - no callbacks)* | - | Stores query metadata for lookup |

---

## Summary

- **19 plugins** total
- **18 plugins** have event callbacks
- **2 plugins** require callbacks (`CacheInvalidationPlugin`, `AuditLoggingPlugin`)
- **3 plugins** have deprecated flags (use callbacks instead): `TableExtractorPlugin` (`warnOnEmptyTables`), `LazyLoadingDetectorPlugin` (`warnOnLazyLoad`), `BulkOperationsPlugin` (`warnOnBulk`)


