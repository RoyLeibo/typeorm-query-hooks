# Release Notes: v6.2.5 - Better Error Logging & AsyncLocalStorage Toggle 🔍

**Release Date**: December 24, 2025  
**Priority**: **IMPORTANT** - Troubleshooting release for persistent crashes

## 🎯 Purpose

This release addresses reports of **TypeORM internal crashes** that persist even after upgrading to v6.2.4. The error:

```
TypeError: Cannot read properties of undefined (reading 'length')
at SelectQueryBuilder.executeEntitiesAndRawResults (TypeORM:3554)
```

**Important**: This error is happening **INSIDE TypeORM**, not in our hook code. However, it only occurs when hooks are enabled, suggesting some interference.

---

## 🔍 What's New

### 1. Enhanced Error Logging

Added detailed error logging to help identify the root cause:

```typescript
// Before (v6.2.4)
try {
  result = await original.apply(this, args);
} catch (err) {
  queryExecutionError = err as Error;
}

// After (v6.2.5)
try {
  verboseLog(`${methodName}() - About to execute original TypeORM method`);
  result = await original.apply(this, args);
  verboseLog(`${methodName}() - Original method completed successfully`);
} catch (err) {
  console.error(`[typeorm-query-hooks] Query execution failed in ${methodName}():`, {
    error: (err as Error).message,
    stack: (err as Error).stack,
    sql: sql.substring(0, 200),
    methodName
  });
  queryExecutionError = err as Error;
}
```

**Benefits:**
- ✅ See exactly which query is failing
- ✅ See the SQL that causes the crash
- ✅ See which execution method is involved
- ✅ Get full stack trace in logs

### 2. Option to Disable AsyncLocalStorage

Added `disableAsyncContext` option to completely disable AsyncLocalStorage:

```typescript
// New configuration option
enableQueryHooks({
  verbose: true,
  disableAsyncContext: true  // ← NEW: Disable AsyncLocalStorage
});
```

**When to use:**
- If experiencing TypeORM internal crashes
- To test if AsyncLocalStorage is causing interference
- When you don't need table name context in logger

**What you lose:**
- Logger won't be able to access table names via `queryContextStore.getStore()`
- Must rely on SQL parsing for table extraction

**What you keep:**
- ✅ All hooks still work
- ✅ Table extraction still works (via SQL parsing)
- ✅ Performance monitoring
- ✅ All other plugins

### 3. Safer AsyncLocalStorage Handling

Wrapped `enterWith()` in try-catch to prevent crashes if AsyncLocalStorage fails:

```typescript
if (!disableAsyncContext) {
  try {
    queryContextStore.enterWith(context);
  } catch (asyncStorageError) {
    verboseLog('AsyncLocalStorage.enterWith() failed:', asyncStorageError);
    // Continue execution even if AsyncLocalStorage fails
  }
}
```

---

## 🧪 Troubleshooting Steps

If you're experiencing the TypeORM crash:

### Step 1: Enable Verbose Logging

```typescript
import { enableQueryHooks } from 'typeorm-query-hooks';

enableQueryHooks({
  verbose: true  // ← See detailed logs
});
```

**Look for:**
- Which `methodName` is failing (`getOne`, `getMany`, `getRawAndEntities`, etc.)
- The SQL query that causes the crash
- Any patterns in the failing queries

### Step 2: Disable AsyncLocalStorage

```typescript
import { enableQueryHooks } from 'typeorm-query-hooks';

enableQueryHooks({
  verbose: true,
  disableAsyncContext: true  // ← Test without AsyncLocalStorage
});
```

**If error goes away:**
- AsyncLocalStorage is interfering with TypeORM
- Report this to us with your TypeORM version and query details
- Keep `disableAsyncContext: true` until we fix it

**If error persists:**
- The issue is NOT related to AsyncLocalStorage
- Might be a plugin corrupting query state
- Try disabling plugins one by one (see Step 3)

### Step 3: Test Without Plugins

```typescript
// Temporarily disable ALL plugins
// Comment out all registerPlugin() calls

enableQueryHooks({
  verbose: true,
  disableAsyncContext: true
});

// No plugins registered - just core hooks
```

**If error goes away:**
- One of your plugins is corrupting the query
- Re-enable plugins one by one to find the culprit
- Report which plugin causes the issue

**If error persists:**
- The issue is in the core hook system
- Report to us immediately with logs

### Step 4: Disable Hooks Entirely

```typescript
// Comment out enableQueryHooks()
// enableQueryHooks();
```

**If error goes away:**
- Confirms hooks are causing interference
- Share your setup with us (TypeORM version, query type, plugins)

**If error persists:**
- This is a TypeORM or database issue, NOT related to our library
- Check your TypeORM version and database state

---

## 📊 Understanding the Error

### What the Error Means

```
TypeError: Cannot read properties of undefined (reading 'length')
at SelectQueryBuilder.executeEntitiesAndRawResults (TypeORM:3554)
```

This means TypeORM's internal code is doing something like:
```typescript
const length = someArray.length;  // someArray is undefined!
```

### Why It Might Only Happen With Hooks

Several possibilities:

1. **Query State Corruption**
   - A plugin modifies SQL or parameters incorrectly
   - TypeORM gets confused about what kind of query it is
   - Internal arrays/objects are not initialized

2. **Async Context Interference**
   - AsyncLocalStorage affects TypeORM's async state
   - Promise chains behave differently
   - `this` binding issues in callbacks

3. **Timing Issues**
   - Hooks delay execution slightly
   - Race conditions in TypeORM's internal state
   - Lazy initialization failures

4. **TypeORM Bug Exposed**
   - Our hooks expose an existing TypeORM bug
   - Only manifests under specific conditions
   - TypeORM makes assumptions that aren't always true

---

## 🔧 Technical Details

### New Configuration Interface

```typescript
export interface QueryHooksOptions {
  /**
   * Enable detailed logging for debugging (default: false)
   */
  verbose?: boolean;
  
  /**
   * Disable AsyncLocalStorage context (default: false)
   * Set to true if experiencing issues with query execution
   * Note: Disabling this will prevent the logger from accessing table names via context
   */
  disableAsyncContext?: boolean;
}
```

### Internal Changes

```typescript
// Module-level flags
let verboseMode = false;
let disableAsyncContext = false;  // ← NEW

// In enableQueryHooks()
if (options?.disableAsyncContext) {
  disableAsyncContext = true;
  console.log('[typeorm-query-hooks] AsyncLocalStorage disabled');
}

// In execution wrapper
if (!disableAsyncContext) {
  try {
    queryContextStore.enterWith(context);
  } catch (asyncStorageError) {
    verboseLog('AsyncLocalStorage.enterWith() failed:', asyncStorageError);
  }
}
```

---

## 🚀 Upgrade Instructions

```bash
npm install typeorm-query-hooks@6.2.5
```

### Recommended Configuration for Troubleshooting

```typescript
import { enableQueryHooks } from 'typeorm-query-hooks';

enableQueryHooks({
  verbose: true,              // See what's happening
  disableAsyncContext: true   // Test without AsyncLocalStorage
});
```

---

## 📋 Information to Provide If Reporting Issues

If you continue to experience crashes after trying these steps, please provide:

1. **TypeORM Version**
   ```bash
   npm list typeorm
   ```

2. **Node.js Version**
   ```bash
   node --version
   ```

3. **Query Type**
   - What method crashes? (`getOne`, `getMany`, etc.)
   - What kind of query? (Simple select, join, raw SQL, etc.)

4. **SQL Query**
   - The actual SQL that causes the crash (from verbose logs)

5. **Plugins Enabled**
   - List of all `registerPlugin()` calls in your code

6. **Test Results**
   - Does it work with `disableAsyncContext: true`?
   - Does it work with no plugins?
   - Does it work with hooks completely disabled?

7. **Error Logs**
   - Full error message and stack trace
   - Verbose logs leading up to the crash

---

## 🎓 Next Steps

### For Most Users

If you're not experiencing crashes, **no action needed**. This is a troubleshooting release.

### If You're Experiencing Crashes

1. Upgrade to v6.2.5
2. Enable verbose logging
3. Try `disableAsyncContext: true`
4. Follow the troubleshooting steps above
5. Report findings with detailed information

### For Contributors

Help us identify the root cause:
- Test with different TypeORM versions
- Test with different query types
- Test with different plugin combinations
- Share findings in GitHub issues

---

## 📚 Related

- [RELEASE_NOTES_6.2.4.md](./RELEASE_NOTES_6.2.4.md) - AsyncLocalStorage simplification
- [RELEASE_NOTES_6.2.3.md](./RELEASE_NOTES_6.2.3.md) - Error scenario detection
- [CRITICAL_FIXES_SUMMARY.md](./CRITICAL_FIXES_SUMMARY.md) - Overview of all fixes
- [GitHub Issues](https://github.com/RoyLeibo/typeorm-query-hooks/issues)

---

**Version**: 6.2.5  
**Tag**: `v6.2.5`  
**Priority**: IMPORTANT (for troubleshooting)  
**Breaking Changes**: None  

**Goal**: Identify root cause of TypeORM internal crashes through better logging and configuration options.

