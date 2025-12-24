# Release Notes - v6.3.4

**Date**: December 24, 2025  
**Type**: Critical Bug Fix  
**Urgency**: HIGH - Please upgrade immediately if using v6.3.3

---

## 🐛 Bug Fixed: SQL Keywords Incorrectly Parsed as Tables

### The Problem in v6.3.3

**User reported**:
```json
{
  "query": "INSERT INTO assigned_roles ... ON CONFLICT ... DO UPDATE SET ...",
  "tables": "EXCLUDED,assigned_roles,SET,CONFLICT"  ← SQL keywords! ❌
}
```

SQL keywords like `EXCLUDED`, `SET`, `CONFLICT` were being incorrectly identified as table names.

### Root Cause

```
Timeline:
1. Extract tables from expressionMap ✅
2. Store in registry
3. Execute query
4. → TypeORM's logger fires DURING execution
5. → Logger looks up registry with SQL → Not found! (we register AFTER execution)
6. → Logger falls back to extractTablesFromSQL() regex ❌
7. → Regex picks up SQL keywords as table names ❌
8. Our hook resumes, registers with actual SQL (too late!)
```

**The issue**: Timing problem + regex fallback picking up keywords.

---

## ✅ The Fix in v6.3.4

### User Insight

> **"You shouldn't do it with a regex, no? The whole point is to use the expression map. We have access to the query builder"** 

**User was 100% right!** We should NEVER use regex for QueryBuilder queries.

### New Architecture

```typescript
// BEFORE execution:
1. Extract tables from expressionMap (safe, no getQuery() call)
   const tables = extractTablesFromBuilder(this);

2. Store in AsyncLocalStorage immediately
   queryContextStore.enterWith({ tables, queryType, builder: this });

3. Execute query
   result = await original.apply(this, args);
   
// DURING execution (inside TypeORM):
4. Logger fires
5. Logger calls getTablesFromSQL(sql)
6. getTablesFromSQL() reads from AsyncLocalStorage ✅
7. Returns correct tables from expressionMap!
```

**Key change**: AsyncLocalStorage makes tables available **during** execution, not after.

---

## 📊 Before vs After

### Before v6.3.4 ❌
```json
{
  "query": "INSERT INTO assigned_roles ... ON CONFLICT ... DO UPDATE SET ...",
  "tables": "EXCLUDED,assigned_roles,SET,CONFLICT"
}
```
**Problem**: SQL keywords mixed with actual tables

### After v6.3.4 ✅
```json
{
  "query": "INSERT INTO assigned_roles ... ON CONFLICT ... DO UPDATE SET ...",
  "tables": "assigned_roles"
}
```
**Correct**: Only actual table from expressionMap

### Raw SQL Queries (Expected) ✅
```json
{
  "query": "START TRANSACTION",
  "tables": ""
}
{
  "query": "COMMIT",
  "tables": ""
}
```
**These bypass QueryBuilder entirely, so empty tables is correct.**

---

## 🔧 Technical Changes

### Code Changes

1. **`src/index.ts`**:
   - Store tables in AsyncLocalStorage **before** execution
   - Use `enterWith()` instead of `run()` to avoid nesting issues
   - Removed post-execution registry registration (not needed)

2. **`src/plugins/query-metadata-registry.ts`**:
   - Priority 1: Read from AsyncLocalStorage (QueryBuilder queries)
   - Priority 2: Registry lookup (post-execution or cached)
   - Priority 3: Return empty array (raw SQL, not regex parsing)
   - **Removed SQL regex fallback entirely**

3. **`src/context-store.ts`**:
   - Made `sql` optional in `QueryContext` (not available until after execution)
   - Added `timestamp` to interface

### What We REMOVED

- ❌ SQL regex parsing fallback for QueryBuilder queries
- ❌ Post-execution registry registration with hint keys
- ❌ Complex timing-dependent logic

### What We KEPT

- ✅ `extractTablesFromBuilder()` - The proper way to get tables
- ✅ AsyncLocalStorage - For passing context through execution
- ✅ No `getQuery()` before execution - Prevents state corruption

---

## 🎯 Why This is the Right Architecture

### The Principle

**For QueryBuilder queries**: Use `expressionMap` (structured data), not SQL strings (text parsing)

```typescript
// ❌ WRONG: Parse SQL strings with regex
const tables = extractTablesFromSQL(sql);  // Picks up keywords!

// ✅ RIGHT: Read from expressionMap
const tables = extractTablesFromBuilder(builder);  // Structured data!
```

### The Flow

```
expressionMap → extractTablesFromBuilder() → AsyncLocalStorage → Logger → Correct tables ✅
```

Not this:
```
SQL string → regex parsing → SQL keywords mixed in ❌
```

---

## 🚀 Upgrade Instructions

```bash
npm install typeorm-query-hooks@6.3.4
```

### No Code Changes Required

Your existing code continues to work:

```typescript
import { enableQueryHooks } from 'typeorm-query-hooks';

enableQueryHooks();

// All your existing queries work correctly
const user = await userRepository.findOne({ where: { id: 1 } });
```

### Expected Behavior After Upgrade

1. **QueryBuilder queries**: Correct table names from expressionMap ✅
2. **Raw SQL queries** (`START TRANSACTION`, `COMMIT`, etc.): Empty tables ✅
3. **No crashes**: Stable execution ✅
4. **No SQL keywords**: Clean table names ✅

---

## 🧪 Testing

After upgrading, verify your logs:

```typescript
// Should show correct table only
await userRepository.insert({ name: 'Test' });
// Expected: "tables":"users"

// Should show empty (expected for raw SQL)
await queryRunner.query('START TRANSACTION');
// Expected: "tables":""
```

---

## 📝 Summary

| Aspect | v6.3.3 | v6.3.4 |
|--------|--------|--------|
| **Table extraction** | expressionMap → regex fallback ❌ | expressionMap only ✅ |
| **SQL keywords** | Mixed with real tables ❌ | Excluded ✅ |
| **Timing** | Register after execution (too late) | AsyncLocalStorage before execution ✅ |
| **Raw SQL** | Attempted regex parsing ❌ | Empty tables (correct) ✅ |
| **Architecture** | Complex, timing-dependent | Simple, direct ✅ |

---

## 🙏 Credits

**User feedback that led to this fix**:
> "You shouldn't do it with a regex, no? The whole point is to use the expression map. We have access to the query builder"

This insight identified the fundamental design flaw: we were falling back to regex parsing when we should ONLY use expressionMap for QueryBuilder queries.

---

## 📚 Related Issues

- ✅ Fixed: SQL keywords in table names
- ✅ Fixed: Timing issue with registry lookup
- ✅ Maintained: No TypeORM state corruption
- ✅ Maintained: Stable execution

---

**Recommended Action**: Upgrade to v6.3.4 immediately if you're seeing SQL keywords in your table logs.

**Version**: 6.3.4  
**Status**: Stable  
**Breaking Changes**: None

