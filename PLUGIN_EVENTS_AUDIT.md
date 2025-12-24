# Plugin Events Audit - Event Handler Consistency Analysis

## Executive Summary

**Issue**: Plugins have inconsistent event registration patterns. Some use callbacks (`.on*()`), some only log to console, making it hard for users to integrate with their own logging systems.

**Goal**: Standardize all plugins to expose relevant event callbacks instead of logging directly to console.

---

## Current State Analysis

### ✅ GOOD EXAMPLES (Have Proper Event Callbacks)

#### 1. **PerformanceMonitorPlugin**
**Events Exposed:**
- ✅ `onSlowQuery(context)` - When query exceeds threshold
- ✅ `onMetric(context)` - For all query completions
- ✅ `onQueryError` - Built-in hook for errors
- ✅ `enableLogging` - Optional console logging

**Status:** ✨ **EXCELLENT** - Full event coverage, no forced logging

---

#### 2. **ResultValidatorPlugin**
**Events Exposed:**
- ✅ `onEmptyResult(context)` - When query returns no results
- ✅ `onLargeResult(context)` - When result exceeds threshold  
- ✅ `enableLogging` - Optional console logging

**Status:** ✨ **EXCELLENT** - Clean separation of concerns

---

#### 3. **NPlusOneDetectorPlugin**
**Events Exposed:**
- ✅ `onNPlusOneDetected(context, count, fingerprint, allContexts)` - When N+1 pattern detected
- ✅ `enableLogging` - Optional console logging

**Status:** ✨ **EXCELLENT** - Well-designed callback with rich context

---

#### 4. **SafetyGuardPlugin**
**Events Exposed:**
- ✅ `onBlocked(context, blocked: BlockedOperation)` - When dangerous operation is blocked
- ✅ `enableLogging` - Optional console logging

**Status:** ✨ **EXCELLENT** - Provides detailed blocked operation info

---

#### 5. **QueryComplexityPlugin**
**Events Exposed:**
- ✅ `onComplexQuery(metrics, context)` - When complex query detected
- ✅ `enableLogging` - Optional console logging

**Status:** ✨ **EXCELLENT** - Rich metrics object

---

#### 6. **CacheInvalidationPlugin**
**Events Exposed:**
- ✅ `onInvalidate(tables, context)` - When cache should be invalidated (REQUIRED)
- ✅ `enableLogging` - Optional console logging

**Status:** ✨ **EXCELLENT** - Requires user implementation

---

#### 7. **AuditLoggingPlugin**
**Events Exposed:**
- ✅ `onAudit(entry: AuditLogEntry)` - For every audited operation (REQUIRED)
- ✅ `getUserId()` - Callback to get current user
- ✅ `enableLogging` - Optional console logging

**Status:** ✨ **EXCELLENT** - Structured audit entry

---

#### 8. **BulkOperationsPlugin**
**Events Exposed:**
- ✅ `onBulkOperation(context, affectedRows)` - When bulk op detected
- ⚠️ `warnOnBulk` - Forces console.warn (inconsistent)
- ✅ `enableLogging` - Optional console logging

**Status:** ⚠️ **GOOD BUT INCONSISTENT** - `warnOnBulk` should be removed in favor of callback

---

#### 9. **QuerySourceTracerPlugin**
**Events Exposed:**
- ✅ `onQueryLogged(context, location)` - For every query with source info
- ✅ `enableLogging` - Optional console logging

**Status:** ✨ **EXCELLENT** - Provides source location

---

#### 10. **SlowQueryAnalyzerPlugin**
**Events Exposed:**
- ✅ `onAnalysis(context, plan)` - When EXPLAIN completes
- ✅ `enableLogging` - Optional console logging

**Status:** ✨ **EXCELLENT** - Provides execution plan

---

#### 11. **ConnectionLeakDetectorPlugin**
**Events Exposed:**
- ✅ `onLeak(leak: ConnectionLeak)` - When connection leak detected
- ✅ `onPoolWarning(context)` - When pool capacity threshold reached
- ✅ `enableLogging` - Optional console logging

**Status:** ✨ **EXCELLENT** - Two relevant events

---

### ⚠️ NEEDS IMPROVEMENT (Limited or No Event Callbacks)

#### 12. **TableExtractorPlugin** ❌ **PRIMARY CONCERN**
**Current Events:**
- ⚠️ `onTablesExtracted(callback)` - Global listener function (not plugin option)
- ⚠️ `warnOnEmptyTables` - Forces console.warn when no tables found
- ✅ `enableLogging` - Optional console logging

**Problems:**
1. ❌ **No callback for empty tables warning** - Just logs to console
2. ❌ **No callback for table extraction events** - Must use global `onTablesExtracted()`
3. ❌ **No onError callback** - If extraction fails, no way to handle it
4. ❌ **No onWarning callback** - `warnOnEmptyTables` forces console.warn

**Missing Events:**
- ❌ `onTablesExtracted(tables, context)` - Should be in plugin options
- ❌ `onEmptyTables(context)` - When no tables extracted
- ❌ `onExtractionError(context, error)` - When extraction fails
- ❌ `onWarning(message, context)` - Generic warning callback

**Status:** ❌ **NEEDS MAJOR REFACTOR**

---

#### 13. **QueryLoggerPlugin**
**Current Events:**
- ✅ `logger` - Custom logger function
- ✅ `filter(context)` - Filter which queries to log
- ❌ No specific event callbacks

**Missing Events:**
- ⚠️ Could add `onQueryLogged(context)` for consistency

**Status:** 🟡 **ACCEPTABLE** - Logger function serves as callback, but could be more explicit

---

#### 14. **QueryModifierPlugin**
**Current Events:**
- ✅ `modifySql(context)` - Callback to modify SQL
- ✅ `modifyParameters(context)` - Callback to modify parameters
- ✅ `enableLogging` - Optional console logging

**Missing Events:**
- ⚠️ `onModified(context, originalSql, newSql)` - When SQL was actually modified
- ⚠️ `onError(context, error)` - When modification fails

**Status:** 🟡 **GOOD** - Core functionality is callback-based, but missing notification events

---

#### 15. **QueryResultTransformerPlugin**
**Current Events:**
- ✅ `transformers` - Map of entity transformers
- ✅ `globalTransformer(result, context)` - Transform all results
- ❌ No notification events

**Missing Events:**
- ⚠️ `onTransformed(context, originalResult, transformedResult)` - When result was transformed
- ⚠️ `onError(context, error)` - When transformation fails

**Status:** 🟡 **ACCEPTABLE** - Transformers ARE the callbacks

---

#### 16. **QueryTimeoutPlugin**
**Current Events:**
- ❌ Only logs to console when timeout occurs
- ❌ No callbacks at all

**Missing Events:**
- ❌ `onTimeout(context)` - When query times out
- ❌ `onTimeoutWarning(context, elapsed, limit)` - When approaching timeout
- ❌ `onError(context, error)` - When timeout mechanism fails

**Status:** ❌ **NEEDS CALLBACKS** - Critical plugin with no event handlers!

---

#### 17. **IdleTransactionMonitorPlugin**
**Current Events:**
- ⚠️ `onZombieDetected(zombie, context)` - Callback exists but marked as unused/future
- ✅ `autoRollback` - Automatic rollback option
- ✅ `enableLogging` - Optional console logging

**Missing Events:**
- ⚠️ `onLongRunningTransaction(context, duration)` - When transaction exceeds duration
- ⚠️ `onIdleTransaction(context, idleTime)` - When transaction is idle too long
- ⚠️ `onError(context, error)` - When monitoring fails

**Status:** ⚠️ **PARTIALLY IMPLEMENTED** - Callback exists but not fully implemented

---

#### 18. **LazyLoadingDetectorPlugin**
**Current Events:**
- ❌ Only logs to console when lazy loading detected
- ❌ No callbacks

**Missing Events:**
- ❌ `onLazyLoadDetected(context, relationInfo)` - When lazy loading pattern detected
- ❌ `onError(context, error)` - When detection fails

**Status:** ❌ **NEEDS CALLBACKS**

---

#### 19. **QueryMetadataRegistryPlugin**
**Current Events:**
- ❌ No events at all - pure utility plugin
- ❌ No logging

**Missing Events:**
- ⚠️ `onMetadataRegistered(sql, tables, queryType)` - When metadata is stored
- ⚠️ `onCacheFull()` - When registry needs cleanup

**Status:** 🟢 **ACCEPTABLE** - It's a utility plugin, events not critical

---

## Recommended Changes

### 🔴 **HIGH PRIORITY (Critical Functionality)**

#### 1. **TableExtractorPlugin** - MAJOR REFACTOR NEEDED
```typescript
export interface TableExtractorOptions {
  // Existing
  warnOnEmptyTables?: boolean;  // ❌ DEPRECATE - Replace with callback
  enableLogging?: boolean;
  
  // NEW - Add these callbacks
  onTablesExtracted?: (tables: string[], context: QueryHookContext) => void;
  onEmptyTables?: (context: QueryHookContext) => void;
  onExtractionError?: (error: Error, context: QueryHookContext) => void;
  onWarning?: (message: string, context: QueryHookContext) => void;
}
```

**Migration Path:**
- Keep `onTablesExtracted()` global function for backward compatibility
- Add `onTablesExtracted` to plugin options as preferred method
- Deprecate `warnOnEmptyTables` in favor of `onEmptyTables` callback

---

#### 2. **QueryTimeoutPlugin** - ADD CALLBACKS
```typescript
export interface QueryTimeoutOptions {
  // Existing
  defaultTimeout?: number;
  timeoutByType?: Record<string, number>;
  timeoutByTablePattern?: Record<string, number>;
  enableLogging?: boolean;
  
  // NEW - Add these callbacks
  onTimeout?: (context: QueryExecutionContext, timeoutMs: number) => void;
  onTimeoutWarning?: (context: QueryExecutionContext, elapsed: number, limit: number) => void;
  onError?: (context: QueryExecutionContext, error: Error) => void;
}
```

---

#### 3. **LazyLoadingDetectorPlugin** - ADD CALLBACKS
```typescript
export interface LazyLoadingDetectorOptions {
  // Existing
  enableLogging?: boolean;
  
  // NEW - Add these callbacks
  onLazyLoadDetected?: (context: QueryHookContext, relationInfo: any) => void;
  onError?: (context: QueryHookContext, error: Error) => void;
}
```

---

### 🟡 **MEDIUM PRIORITY (Consistency & Polish)**

#### 4. **IdleTransactionMonitorPlugin** - IMPLEMENT EXISTING CALLBACKS
```typescript
export interface IdleTransactionMonitorOptions {
  // Existing (but not fully implemented)
  onZombieDetected?: (zombie: ZombieTransaction, context: TransactionContext) => void;  // ⚠️ IMPLEMENT THIS
  
  // NEW - Add more granular callbacks
  onLongRunningTransaction?: (context: TransactionContext, duration: number) => void;
  onIdleTransaction?: (context: TransactionContext, idleTime: number) => void;
  onError?: (context: TransactionContext, error: Error) => void;
}
```

---

#### 5. **QueryModifierPlugin** - ADD NOTIFICATION CALLBACKS
```typescript
export interface QueryModifierOptions {
  // Existing
  modifySql?: (context: PreQueryContext) => string | undefined;
  modifyParameters?: (context: PreQueryContext) => any[] | undefined;
  enableLogging?: boolean;
  
  // NEW - Notify when modifications happen
  onModified?: (context: PreQueryContext, originalSql: string, newSql: string) => void;
  onParametersModified?: (context: PreQueryContext, originalParams: any[], newParams: any[]) => void;
  onError?: (context: PreQueryContext, error: Error) => void;
}
```

---

#### 6. **QueryResultTransformerPlugin** - ADD NOTIFICATION CALLBACKS
```typescript
export interface QueryResultTransformerOptions {
  // Existing
  transformers?: Record<string, TransformerFn>;
  globalTransformer?: TransformerFn;
  
  // NEW - Notify when transformations happen
  onTransformed?: (context: QueryResultContext, originalResult: any, transformedResult: any) => void;
  onError?: (context: QueryResultContext, error: Error) => void;
}
```

---

#### 7. **BulkOperationsPlugin** - REMOVE warnOnBulk
```typescript
export interface BulkOperationsOptions {
  bulkThreshold?: number;
  onBulkOperation?: (context: QueryResultContext, affectedRows: number) => void;  // Already exists
  monitorTables?: string[];
  monitorTypes?: Array<...>;
  warnOnBulk?: boolean;  // ❌ DEPRECATE - Use onBulkOperation callback instead
  enableLogging?: boolean;
}
```

**Change:** Remove `warnOnBulk`, users should use `onBulkOperation` callback

---

### 🟢 **LOW PRIORITY (Nice to Have)**

#### 8. **QueryMetadataRegistryPlugin** - ADD OPTIONAL CALLBACKS
```typescript
export interface QueryMetadataRegistryOptions {
  // NEW - Optional callbacks for monitoring
  onMetadataRegistered?: (sql: string, metadata: QueryMetadata) => void;
  onCacheFull?: (currentSize: number) => void;
  enableLogging?: boolean;
}
```

---

#### 9. **QueryLoggerPlugin** - MAKE CALLBACK MORE EXPLICIT
```typescript
export interface QueryLoggerOptions {
  // Existing
  logger?: (message: string) => void;
  
  // NEW - More explicit callback
  onQueryLogged?: (context: QueryHookContext, formattedMessage: string) => void;
  
  // Keep existing for backward compatibility
  logSql?: boolean;
  logTimestamp?: boolean;
  filter?: (context: QueryHookContext) => boolean;
}
```

---

## Summary by Priority

### 🔴 **CRITICAL (Must Fix)**
1. **TableExtractorPlugin** - Add `onTablesExtracted`, `onEmptyTables`, `onWarning` callbacks
2. **QueryTimeoutPlugin** - Add `onTimeout`, `onTimeoutWarning` callbacks
3. **LazyLoadingDetectorPlugin** - Add `onLazyLoadDetected` callback

### 🟡 **IMPORTANT (Should Fix)**
4. **IdleTransactionMonitorPlugin** - Implement existing `onZombieDetected` callback
5. **QueryModifierPlugin** - Add `onModified` notification callback
6. **QueryResultTransformerPlugin** - Add `onTransformed` notification callback
7. **BulkOperationsPlugin** - Deprecate `warnOnBulk` in favor of callback

### 🟢 **OPTIONAL (Nice to Have)**
8. **QueryMetadataRegistryPlugin** - Add monitoring callbacks
9. **QueryLoggerPlugin** - Add explicit `onQueryLogged` callback

---

## Common Patterns to Follow

### ✅ **GOOD Pattern:**
```typescript
export interface PluginOptions {
  // Configuration
  threshold?: number;
  
  // Event Callbacks (user-provided)
  onEvent?: (context, ...args) => void;
  onError?: (context, error) => void;
  onWarning?: (context, message) => void;
  
  // Optional console logging (default: false)
  enableLogging?: boolean;
}
```

### ❌ **BAD Pattern:**
```typescript
export interface PluginOptions {
  warnOn*?: boolean;  // ❌ Forces console.warn
  logWhen*?: boolean;  // ❌ Forces console.log
  // No callbacks - user can't customize behavior
}
```

---

## Migration Strategy

1. **Phase 1**: Add new callbacks to plugins (non-breaking)
2. **Phase 2**: Update README to show callback usage as primary approach
3. **Phase 3**: Deprecate forced logging flags (`warnOnEmptyTables`, `warnOnBulk`)
4. **Phase 4** (Major version): Remove deprecated flags

---

## Conclusion

**12 of 19 plugins** have proper event callback systems ✅  
**7 plugins** need improvements ⚠️  
**3 plugins** are critical priorities 🔴  

The main issue is **TableExtractorPlugin** - it's one of the most-used plugins but lacks proper event callbacks, forcing console logging on users.




