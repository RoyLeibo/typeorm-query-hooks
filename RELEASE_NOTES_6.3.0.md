# Release Notes: v6.3.0 - AsyncLocalStorage Removed 🎉

**Release Date**: December 24, 2025  
**Priority**: **CRITICAL** - Fixes persistent TypeORM crashes  
**Type**: Minor version (API simplification)

---

## 🚀 The Fix: Complete Removal of AsyncLocalStorage

After extensive troubleshooting and user feedback, we've **completely removed AsyncLocalStorage** from the library.

### Why?

A user asked the critical question:

> **"Do we need the async context? If it's just for this hook?"**

**Answer**: No, we don't! AsyncLocalStorage was:
- Only used in ONE place (logger table name lookup)
- Causing TypeORM internal crashes
- Adding unnecessary complexity
- Interfering with TypeORM's execution context

---

## 🐛 The Problem It Solves

### Symptoms Fixed

✅ **TypeORM internal crashes during query execution**
```
TypeError: Cannot read properties of undefined (reading 'length')
at SelectQueryBuilder.executeEntitiesAndRawResults (TypeORM:3554)
```

✅ **Service startup failures** with no clear error logs  
✅ **Mysterious undefined errors** in SelectQueryBuilder  
✅ **Query execution interference** from AsyncLocalStorage context  

### Root Cause

Even after simplifying from `AsyncLocalStorage.run()` to `AsyncLocalStorage.enterWith()`, the async context was still interfering with TypeORM's internal state management.

**The logs showed**:
```
[typeorm-query-hooks] getRawAndEntities() - Stored 1 tables in AsyncLocalStorage
[typeorm-query-hooks] QueryRunner created and patched for raw query hooks
[ERROR] TypeError: Cannot read properties of undefined (reading 'length')
```

The crash happened immediately after setting the AsyncLocalStorage context!

---

## 💡 The Insight

### What AsyncLocalStorage Was Used For

**ONE. SINGLE. PURPOSE.**

In `src/plugins/query-metadata-registry.ts`:
```typescript
export function getTablesFromSQL(sql: string): string[] {
  // Try to get tables from AsyncLocalStorage
  const context = queryContextStore.getStore();
  if (context && context.tables) {
    return context.tables;  // ← Only use of AsyncLocalStorage!
  }
  
  // Fallback to SQL parsing and registry lookup
  // ...
}
```

That's it. Just to avoid SQL parsing in the logger.

### What We Realized

The logger **already has fallback methods** that work perfectly:
1. **SQL parsing** - Extract tables from SQL text
2. **Registry lookup** - Check the query metadata registry

**We don't need AsyncLocalStorage at all!**

---

## 🔧 What Changed

### Removed

❌ `AsyncLocalStorage` import and usage  
❌ `queryContextStore.enterWith()` calls  
❌ `disableAsyncContext` configuration option  
❌ Context object creation for storage  
❌ Table extraction for context  
❌ AsyncLocalStorage error handling  

### Result

✅ **Simpler code** - 50+ lines removed  
✅ **No interference** - TypeORM executes unmodified  
✅ **Same functionality** - Logger still gets table names  
✅ **More stable** - No async context issues  
✅ **Better performance** - No context management overhead  

---

## 📊 Before vs After

### Before (v6.2.0 - v6.2.5)

```typescript
// Extract tables for AsyncLocalStorage
let tables: string[] = [];
try {
  tables = extractTablesFromBuilder(this);
} catch (err) {
  console.warn(`Failed to extract tables:`, err);
  tables = [];
}

const queryType = (this as any).expressionMap?.queryType;
const context = {
  builder: this,
  sql,
  tables,
  queryType
};

verboseLog(`Stored ${tables.length} tables in AsyncLocalStorage`);

// Set AsyncLocalStorage context
if (!disableAsyncContext) {
  try {
    queryContextStore.enterWith(context);
  } catch (asyncStorageError) {
    verboseLog('AsyncLocalStorage.enterWith() failed:', asyncStorageError);
  }
}

// Execute query
try {
  verboseLog(`About to execute original TypeORM method`);
  result = await original.apply(this, args);
  verboseLog(`Original method completed successfully`);
} catch (err) {
  console.error(`Query execution failed:`, { error, sql, methodName });
  queryExecutionError = err as Error;
}
```

### After (v6.3.0)

```typescript
// Extract query type for hooks
const queryType = (this as any).expressionMap?.queryType;

// AsyncLocalStorage has been removed due to interference with TypeORM execution
// The logger now relies on SQL parsing and registry lookup for table names
// This eliminates a major source of instability

// Execute query
try {
  verboseLog(`About to execute original TypeORM method`);
  result = await original.apply(this, args);
  verboseLog(`Original method completed successfully`);
} catch (err) {
  console.error(`Query execution failed:`, { error, sql, methodName });
  queryExecutionError = err as Error;
}
```

**50+ lines removed!** Simpler, cleaner, more stable.

---

## 🎯 How Logger Still Gets Table Names

The logger uses a **three-tier fallback strategy**:

### 1. Query Metadata Registry (Primary)
```typescript
// Registered when query is built
registry.set(sql, { tables, queryType, timestamp });

// Retrieved by logger
const metadata = registry.get(sql);
if (metadata) return metadata.tables;
```

### 2. SQL Parsing (Fallback)
```typescript
// Parse tables from SQL text
const tables = extractTablesFromSQL(sql);
// Works for: SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, etc.
```

### 3. Empty Array (Safe Default)
```typescript
// If all else fails, return empty array
return [];
```

**No AsyncLocalStorage needed!**

---

## 🚀 Upgrade Instructions

### Install

```bash
npm install typeorm-query-hooks@6.3.0
```

### Update Your Code

**If you had**:
```typescript
enableQueryHooks({
  verbose: true,
  disableAsyncContext: true  // ← Remove this line
});
```

**Change to**:
```typescript
enableQueryHooks({
  verbose: true
});
```

**That's it!** The `disableAsyncContext` option no longer exists (and is no longer needed).

---

## 📈 Impact

### Performance

- ⚡ **Faster execution** - No async context overhead
- ⚡ **Less memory** - No context objects stored
- ⚡ **Simpler call stack** - Fewer layers

### Stability

- 🔒 **No TypeORM interference** - Queries execute unchanged
- 🔒 **No async context issues** - Removed entirely
- 🔒 **Fewer edge cases** - Simpler code = fewer bugs

### Functionality

- ✅ **All hooks still work** - No functional changes
- ✅ **Table extraction still works** - Via registry and SQL parsing
- ✅ **Logging still works** - Fallback methods are reliable

---

## 🛡️ Breaking Changes

### Removed

- `disableAsyncContext` configuration option (no longer needed)

### Impact

**NONE** - If you were using `disableAsyncContext: true`, just remove that line. If you weren't using it, nothing changes.

---

## ✅ Testing Checklist

After upgrading, verify:

- [x] Services start without crashes
- [x] Queries execute correctly
- [x] Logger still shows table names
- [x] Hooks fire in correct order
- [x] No TypeORM internal errors

---

## 🎓 Lessons Learned

### 1. Question Everything

The user's question "Do we need the async context?" revealed we were over-engineering.

### 2. Favor Simplicity

The simplest solution (remove AsyncLocalStorage entirely) was the best.

### 3. Don't Fight the Framework

Trying to wrap TypeORM's execution was fighting against its design. Direct execution is better.

### 4. One Feature ≠ Worth It

AsyncLocalStorage was used for ONE feature (logger optimization) but caused MANY problems.

### 5. Fallbacks Are Good

Having fallback methods (SQL parsing, registry) meant we could remove AsyncLocalStorage without losing functionality.

---

## 📚 Related

- [RELEASE_NOTES_6.2.4.md](./RELEASE_NOTES_6.2.4.md) - AsyncLocalStorage simplification attempt
- [RELEASE_NOTES_6.2.5.md](./RELEASE_NOTES_6.2.5.md) - Troubleshooting release
- [CRITICAL_FIXES_SUMMARY.md](./CRITICAL_FIXES_SUMMARY.md) - Timeline of fixes

---

## 🙏 Credits

**Massive thanks** to the user who:
1. Reported the persistent crashes
2. Tested multiple versions
3. Provided detailed logs
4. Asked the critical question: **"Do we need the async context?"**

This question led to the realization that AsyncLocalStorage was unnecessary complexity causing real harm.

---

## 📞 Support

If you still experience issues after upgrading to v6.3.0:

1. **Verify version**:
   ```bash
   npm list typeorm-query-hooks
   # Should show: typeorm-query-hooks@6.3.0
   ```

2. **Clear and reinstall**:
   ```bash
   rm -rf node_modules
   npm install
   ```

3. **Enable verbose logging**:
   ```typescript
   enableQueryHooks({ verbose: true });
   ```

4. **Report issues**: https://github.com/RoyLeibo/typeorm-query-hooks/issues

---

**Version**: 6.3.0  
**Tag**: `v6.3.0`  
**Priority**: CRITICAL  
**Type**: Minor (API simplification)  
**Breaking Changes**: Minimal (`disableAsyncContext` option removed)  

**Key Insight**: Sometimes the best code is the code you **don't** write. 🎯

