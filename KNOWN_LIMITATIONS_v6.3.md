# Known Limitations in v6.3.x

## v6.3.2: Stable but Tables Empty in Logger

### ✅ What Works
- ✅ **All queries execute without crashes**
- ✅ **No TypeORM state corruption**
- ✅ **Application starts reliably**
- ✅ **Hooks fire after execution** (`onQueryBuild`, `getQuery()`)
- ✅ **Execution timing tracked**

### ❌ What Doesn't Work
- ❌ **Tables are empty in TypeORM logger** (`"tables":""`)
- ❌ **No pre-execution hooks** (`onQueryStart`, `onBeforeQuery` don't fire)
- ❌ **No result hooks** (`onQueryResult`, `onSlowQuery`, etc. don't fire)

---

## Why Tables Are Empty

### The Timeline Problem

**What happens:**
1. User calls `builder.getOne()`
2. Our hook starts executing
3. We call `original.apply(this, args)` (TypeORM's getOne)
4. **TypeORM internally generates SQL and passes to logger** ← Logger needs tables HERE
5. Logger calls `getTablesFromSQL(sql)` → finds nothing (registry is empty)
6. Query executes
7. Our hook resumes
8. We call `this.getQuery()` AFTER execution
9. `onQueryBuild` fires and stores tables in registry ← Too late!

**The problem**: Logger needs tables at step 4, but we store them at step 9.

### Why We Can't Store Earlier

Calling `this.getQuery()` BEFORE step 3 **corrupts TypeORM's internal state** and causes:
```
TypeError: Cannot read properties of undefined (reading 'length')
at SelectQueryBuilder.executeEntitiesAndRawResults (TypeORM:3554)
```

This was the crash you experienced in v6.2.x and v6.3.0-6.3.1.

---

## Solutions (Future)

### Option A: Accept the Limitation
- Keep v6.3.2 as-is
- Document that tables won't appear in logs
- **Pros**: Stable, no crashes
- **Cons**: Missing table information

### Option B: Use TypeORM's Logger Interface
- Don't patch QueryBuilder at all
- Implement TypeORM's `Logger` interface directly
- **Pros**: Official API, safe
- **Cons**: Less control, fewer hook points

### Option C: Extract Tables Safely
- Call `extractTablesFromBuilder()` before execution (doesn't call `getQuery()`)
- Store in registry with a predictable key
- **Pros**: Tables available during execution
- **Cons**: Registry key matching is tricky (SQL normalization issues)

### Option D: Proxy Pattern
- Don't patch TypeORM
- Provide wrapper functions users must call
- **Pros**: Full control, completely safe
- **Cons**: Users must change their code

---

## Recommended Approach

For now, **use v6.3.2 with the limitation**:

```typescript
import { enableQueryHooks } from 'typeorm-query-hooks';

enableQueryHooks({
  verbose: true
});

// Queries work fine, but logger shows "tables":""
```

**Trade-off**: Stability > Feature completeness

---

## Why This Happened

### History

1. **v6.0-6.1**: Called `getQuery()` before execution
   - ✅ Tables available in logger
   - ❌ Sometimes corrupted TypeORM state (not always noticed)

2. **v6.2.0**: Added raw SQL hooks
   - ✅ More monitoring
   - ❌ Exposed the state corruption bug more often

3. **v6.2.x-6.3.1**: Various attempts to fix
   - Removed AsyncLocalStorage
   - Disabled QueryRunner hooks
   - Still crashed!

4. **v6.3.2**: Execute first, get SQL after
   - ✅ No crashes (finally!)
   - ❌ Tables not available during execution

### Lesson Learned

**TypeORM's internal state is fragile**. Calling methods in the wrong order (like `getQuery()` before execution methods) corrupts it in unpredictable ways.

---

## For Users

### If You Need Tables in Logger

**Temporary workaround**: Parse tables from SQL yourself

```typescript
// In your custom logger
class MyLogger {
  logQuery(query: string, parameters?: any[]) {
    // Parse tables from SQL manually
    const tables = this.extractTablesFromSQL(query);
    
    console.log({ query, tables });
  }
  
  private extractTablesFromSQL(sql: string): string[] {
    // Basic parsing
    const fromMatch = sql.match(/FROM\s+"?(\w+)"?/i);
    const joinMatch = sql.match(/JOIN\s+"?(\w+)"?/gi);
    
    const tables = [];
    if (fromMatch) tables.push(fromMatch[1]);
    if (joinMatch) {
      joinMatch.forEach(j => {
        const m = j.match(/JOIN\s+"?(\w+)"?/i);
        if (m) tables.push(m[1]);
      });
    }
    
    return tables;
  }
}
```

### If You Need Pre-Execution Hooks

**Not possible in v6.3.2**. You have two options:

1. **Wait for future version** with a different hooking strategy
2. **Use TypeORM's Logger interface** instead of QueryBuilder patching

---

## Future Direction

We're exploring:
- Using TypeORM's official Logger interface
- Proxy pattern for safer hooking
- Community feedback on what features are most important

**Your feedback matters!** Tell us:
- Do you NEED tables in logs?
- Do you NEED pre-execution hooks?
- Would you accept a different API (proxy pattern)?

---

**Version**: 6.3.2  
**Status**: Stable with limitations  
**Recommendation**: Use it! Stability > features

