# Raw SQL Support - Plugin Audit

## Analysis: Which Plugins Should Monitor Raw SQL?

### ✅ HIGH PRIORITY - Must Support Raw SQL

#### 1. **SafetyGuardPlugin** - CRITICAL ⚠️
**Current Status**: Only monitors QueryBuilder  
**Why Critical**: Raw SQL can be even MORE dangerous than QueryBuilder queries
- Raw `DELETE FROM users` without WHERE
- Raw `DROP TABLE` commands
- Raw `TRUNCATE` operations

**Impact**: Production disaster if not monitored!

**Implementation Needed**:
```typescript
onRawQuery: (context) => {
  // Check for dangerous operations in raw SQL
  // Block DDL in production
  // Require WHERE clauses
}
```

---

#### 2. **PerformanceMonitorPlugin** - HIGH
**Current Status**: Only monitors QueryBuilder  
**Why Important**: Raw SQL queries can be slow too
- Migration queries
- Complex DDL operations
- Bulk data operations

**Implementation Needed**:
```typescript
onRawQueryComplete: (context) => {
  // Track execution time
  // Detect slow queries
  // Call onSlowQuery callback
}
```

---

#### 3. **AuditLoggingPlugin** - HIGH
**Current Status**: Only logs QueryBuilder queries  
**Why Important**: Compliance and security auditing
- Track all database operations
- Audit trail for DDL changes
- Security monitoring

**Implementation Needed**:
```typescript
onRawQuery: (context) => {
  // Log all raw SQL
  // Include user context
  // Track DDL operations
}
```

---

#### 4. **CacheInvalidationPlugin** - HIGH
**Current Status**: Only monitors QueryBuilder  
**Why Important**: Cache consistency
- Raw INSERT/UPDATE/DELETE should invalidate cache
- DDL changes affect cache
- Manual migrations need cache invalidation

**Implementation Needed**:
```typescript
onRawQueryComplete: (context) => {
  // Parse SQL to find operation type
  // Extract tables from raw SQL
  // Invalidate cache for affected tables
}
```

---

### ✅ MEDIUM PRIORITY - Should Support Raw SQL

#### 5. **QueryTimeoutPlugin**
**Current Status**: Only monitors QueryBuilder  
**Why Important**: Raw queries can hang
- Long-running migrations
- Complex DDL operations
- Prevent database lockups

**Implementation Needed**:
```typescript
onRawQuery: (context) => {
  // Start timeout timer
}
onRawQueryComplete: (context) => {
  // Clear timeout timer
}
```

---

#### 6. **SlowQueryAnalyzerPlugin**
**Current Status**: Only analyzes QueryBuilder  
**Why Important**: Performance optimization
- Analyze slow DDL
- EXPLAIN for complex raw SQL
- Performance insights

**Implementation Needed**:
```typescript
onRawQueryComplete: (context) => {
  // Run EXPLAIN if slow
  // Analyze execution plan
}
```

---

#### 7. **QueryComplexityPlugin**
**Current Status**: Only analyzes QueryBuilder  
**Why Useful**: Monitor complexity
- Parse raw SQL complexity
- Warn on complex operations

**Implementation Needed**:
```typescript
onRawQuery: (context) => {
  // Analyze SQL complexity
  // Count joins, subqueries
}
```

---

#### 8. **BulkOperationsPlugin**
**Current Status**: Only monitors QueryBuilder  
**Why Useful**: Track bulk operations
- Raw bulk inserts
- Mass updates via raw SQL

**Implementation Needed**:
```typescript
onRawQueryComplete: (context) => {
  // Check affected rows
  // Detect bulk operations
}
```

---

### ⚠️ LOW PRIORITY / NOT APPLICABLE

#### 9. **QueryResultTransformerPlugin**
**Status**: Could work but QueryRunner results are raw
**Reason**: Raw SQL results are already in raw format

#### 10. **ResultValidatorPlugin**
**Status**: Could validate but less useful
**Reason**: Raw SQL is more explicit, less likely to have unexpected empty results

#### 11. **NPlusOneDetectorPlugin**
**Status**: Not applicable
**Reason**: N+1 is a QueryBuilder/ORM pattern, not relevant for raw SQL

#### 12. **LazyLoadingDetectorPlugin**
**Status**: Not applicable
**Reason**: Lazy loading is an ORM feature, doesn't apply to raw SQL

#### 13. **QuerySourceTracerPlugin**
**Status**: Difficult to implement
**Reason**: Stack traces would point to DataSource.query(), not useful

#### 14. **ConnectionLeakDetectorPlugin**
**Status**: Already works
**Reason**: Monitors connections, not queries

#### 15. **IdleTransactionMonitorPlugin**
**Status**: Partially works
**Reason**: Monitors transactions via `onTransactionStart`, but should track raw SQL within transactions

---

## Implementation Priority

### Phase 1: Critical Safety (Immediate)
1. ✅ **TableExtractorPlugin** - DONE
2. 🔴 **SafetyGuardPlugin** - CRITICAL
3. 🟡 **AuditLoggingPlugin** - Important for compliance

### Phase 2: Performance & Monitoring
4. 🟡 **PerformanceMonitorPlugin**
5. 🟡 **CacheInvalidationPlugin**
6. 🟡 **QueryTimeoutPlugin**
7. 🟡 **SlowQueryAnalyzerPlugin**

### Phase 3: Advanced Features
8. 🟢 **QueryComplexityPlugin**
9. 🟢 **BulkOperationsPlugin**

---

## Implementation Pattern

### Standard Pattern for All Plugins

```typescript
export function YourPlugin(options: Options): QueryHookPlugin {
  return {
    name: 'YourPlugin',
    
    // Existing QueryBuilder hooks
    onQueryComplete: (context) => {
      // Monitor QueryBuilder queries
    },
    
    // NEW: Raw SQL hooks
    onRawQuery: (context: RawQueryContext) => {
      // Monitor raw SQL start
      const sql = context.sql;
      const tables = extractTablesFromSQL(sql);
      // Your plugin logic here
    },
    
    onRawQueryComplete: (context: RawQueryContext & { executionTime: number }) => {
      // Monitor raw SQL completion
      // Track execution time
      // Call callbacks
    },
    
    onRawQueryError: (context: RawQueryContext & { error: Error }) => {
      // Handle raw SQL errors
    }
  };
}
```

---

## Example: SafetyGuardPlugin with Raw SQL Support

```typescript
export function SafetyGuardPlugin(options: SafetyGuardOptions = {}): QueryHookPlugin {
  return {
    name: 'SafetyGuard',
    
    // Existing: QueryBuilder monitoring
    onBeforeQuery: (context) => {
      // Block dangerous QueryBuilder operations
    },
    
    // NEW: Raw SQL monitoring
    onRawQuery: (context: RawQueryContext) => {
      const sql = context.sql.toUpperCase();
      const tables = extractTablesFromSQL(context.sql);
      
      // Block DDL in production
      if (blockDDL && (
        sql.includes('CREATE TABLE') ||
        sql.includes('ALTER TABLE') ||
        sql.includes('DROP TABLE')
      )) {
        throw new Error('🛑 SafetyGuard: DDL operations blocked in production');
      }
      
      // Require WHERE clause for UPDATE/DELETE
      if (requireWhereClause) {
        if (sql.includes('DELETE FROM') && !sql.includes('WHERE')) {
          throw new Error('🛑 SafetyGuard: DELETE without WHERE clause');
        }
        if (sql.includes('UPDATE') && !sql.includes('WHERE')) {
          throw new Error('🛑 SafetyGuard: UPDATE without WHERE clause');
        }
      }
      
      // Block TRUNCATE
      if (blockTruncate && sql.includes('TRUNCATE')) {
        throw new Error('🛑 SafetyGuard: TRUNCATE operations blocked');
      }
      
      // Check protected tables
      if (protectedTables.length > 0) {
        const affectsProtected = tables.some(t => protectedTables.includes(t));
        if (affectsProtected) {
          console.warn('⚠️ SafetyGuard: Operation affects protected table');
        }
      }
    }
  };
}
```

---

## Benefits of Raw SQL Support

### Before (QueryBuilder Only)
```typescript
// ✅ Monitored
await repo.update(User, { id: 1 }, { name: 'Jane' });

// ❌ NOT Monitored - DANGEROUS!
await dataSource.query('DELETE FROM users');
await dataSource.query('DROP TABLE important_data');
```

### After (QueryBuilder + Raw SQL)
```typescript
// ✅ Monitored
await repo.update(User, { id: 1 }, { name: 'Jane' });

// ✅ NOW MONITORED!
await dataSource.query('DELETE FROM users');
// 🛑 SafetyGuard: DELETE without WHERE clause - BLOCKED!

await dataSource.query('DROP TABLE important_data');
// 🛑 SafetyGuard: DDL operations blocked in production - BLOCKED!
```

---

## Testing Strategy

Each plugin should have tests for:

1. **Raw SELECT** - Monitor read operations
2. **Raw INSERT/UPDATE/DELETE** - Monitor writes
3. **Raw DDL** - Monitor schema changes (CREATE, ALTER, DROP)
4. **Raw TRUNCATE** - Monitor dangerous operations
5. **Migration queries** - Real-world scenarios

---

## Next Steps

1. Implement SafetyGuardPlugin raw SQL support (CRITICAL)
2. Implement AuditLoggingPlugin raw SQL support  
3. Implement PerformanceMonitorPlugin raw SQL support
4. Implement CacheInvalidationPlugin raw SQL support
5. Document usage patterns
6. Add comprehensive tests

---

## Impact Assessment

### Without Raw SQL Support
- ⚠️ **Security Risk**: Dangerous raw SQL not blocked
- ⚠️ **Blind Spots**: No monitoring for DDL, migrations
- ⚠️ **Cache Issues**: Cache not invalidated on raw SQL writes
- ⚠️ **No Audit Trail**: Raw SQL not logged

### With Raw SQL Support
- ✅ **Complete Protection**: All queries monitored
- ✅ **Full Visibility**: DDL, migrations, everything tracked
- ✅ **Cache Consistency**: All writes invalidate cache
- ✅ **Complete Audit Trail**: Every database operation logged



