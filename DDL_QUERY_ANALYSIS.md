# DDL Query Capture Analysis

## Summary
**Finding:** DDL queries (CREATE INDEX, ALTER TABLE, etc.) are **NOT** being captured by the TypeORM Query Hooks system.

## Root Cause

### What IS Captured
The hooks system **only** patches QueryBuilder methods:
- `SelectQueryBuilder`
- `InsertQueryBuilder`
- `UpdateQueryBuilder`
- `DeleteQueryBuilder`

### What IS NOT Captured
The following query execution paths bypass QueryBuilder entirely:

1. **Raw SQL via `dataSource.query()`**
   ```typescript
   await dataSource.query('CREATE INDEX idx_name ON users(name)');
   // ❌ NOT captured - uses QueryRunner directly
   ```

2. **TypeORM Synchronization (`synchronize: true`)**
   ```typescript
   const dataSource = new DataSource({
     synchronize: true  // ❌ Creates tables/indexes directly via QueryRunner
   });
   ```

3. **Migration Files**
   ```typescript
   export class CreateIndex1234567890 implements MigrationInterface {
     public async up(queryRunner: QueryRunner): Promise<void> {
       await queryRunner.query('CREATE INDEX ...');
       // ❌ NOT captured - QueryRunner is not hooked
     }
   }
   ```

4. **Schema Builder Operations**
   ```typescript
   await queryRunner.createIndex('users', new TableIndex({ ... }));
   // ❌ NOT captured - direct QueryRunner method
   ```

## Code Evidence

### From `src/index.ts` (lines 311-316):
```typescript
const builders = [
  SelectQueryBuilder,
  InsertQueryBuilder,
  UpdateQueryBuilder,
  DeleteQueryBuilder
];
// Only these builders are patched - QueryRunner is NOT patched
```

### From `src/plugins/table-extractor.ts` (lines 15-131):
```typescript
export function extractTablesFromBuilder(builder: QueryBuilder<any>): string[] {
  const expressionMap = (builder as any).expressionMap;
  
  if (!expressionMap) {
    return [];  // No expressionMap = no tables extracted
  }
  // ...
}
```

DDL queries executed via QueryRunner have no `expressionMap` and return empty arrays.

## Why `onEmptyTables` Isn't Triggered

The `onEmptyTables` callback in `TableExtractorPlugin` **IS** implemented correctly (line 359-369), but it's only triggered for queries that go through QueryBuilder.

Since DDL queries don't go through QueryBuilder at all, they never reach the plugin hooks.

## Test Results

### Queries That ARE Captured ✅
```typescript
// SELECT via QueryBuilder
const users = await repo.createQueryBuilder('user').getMany();
// ✅ Captured: ['users']

// INSERT via QueryBuilder
await repo.insert({ name: 'John' });
// ✅ Captured: ['users']

// UPDATE via QueryBuilder
await repo.createQueryBuilder().update(User).set({ name: 'Jane' }).execute();
// ✅ Captured: ['users']
```

### Queries That Are NOT Captured ❌
```typescript
// Raw SELECT
await dataSource.query('SELECT * FROM users');
// ❌ NOT captured

// Raw CREATE INDEX
await dataSource.query('CREATE INDEX idx_email ON users(email)');
// ❌ NOT captured

// Schema synchronization
await dataSource.synchronize();
// ❌ NOT captured

// Migrations
await dataSource.runMigrations();
// ❌ NOT captured
```

## Potential Solutions

### Option 1: Hook QueryRunner (Complex)
Patch `QueryRunner.query()` method to capture all SQL:
```typescript
// This would require significant refactoring
const originalQuery = QueryRunner.prototype.query;
QueryRunner.prototype.query = async function(sql: string) {
  // Notify plugins
  plugins.forEach(p => p.onRawQuery?.({ sql }));
  return originalQuery.call(this, sql);
};
```

**Pros:**
- Captures ALL queries (including DDL)
- Comprehensive coverage

**Cons:**
- No QueryBuilder context (no expressionMap for table extraction)
- Cannot extract tables from raw SQL reliably
- Breaking change to the plugin API

### Option 2: Add SQL Parser for Table Extraction (Medium)
Parse SQL strings to extract table names:
```typescript
function extractTablesFromSQL(sql: string): string[] {
  // Use regex or SQL parser library
  // Extract tables from FROM, JOIN, INTO, UPDATE, etc.
}
```

**Pros:**
- Can extract tables from raw SQL
- Works with QueryRunner queries

**Cons:**
- SQL parsing is complex and error-prone
- Different SQL dialects (MySQL, Postgres, SQLite)
- DDL has different syntax (CREATE TABLE, ALTER TABLE, etc.)

### Option 3: Document the Limitation (Simple)
Add clear documentation that:
1. Only QueryBuilder queries are hooked
2. Raw SQL, migrations, and synchronization bypass hooks
3. DDL queries won't trigger `onEmptyTables`

**Pros:**
- No code changes needed
- Sets correct expectations

**Cons:**
- Limitation remains

## Recommendation

**For now:** Document the limitation clearly in README.md

**Future enhancement:** Consider adding a separate plugin for QueryRunner hooking if there's demand:
```typescript
// Potential future API
registerPlugin(createQueryRunnerPlugin({
  onRawQuery: (sql, parameters) => {
    // Called for ALL queries, including DDL
    console.log('Raw SQL:', sql);
  }
}));
```

## Files to Update

1. **README.md** - Add "Limitations" section:
   ```markdown
   ## Limitations
   
   - Only QueryBuilder queries are captured
   - Raw SQL via `dataSource.query()` is not hooked
   - Migration and synchronization queries bypass the hooks
   - DDL statements won't trigger table extraction callbacks
   ```

2. **src/plugins/table-extractor.ts** - Update JSDoc:
   ```typescript
   /**
    * Table Extractor Plugin
    * 
    * **Note:** Only extracts tables from QueryBuilder queries.
    * Raw SQL queries via `dataSource.query()` are not supported.
    */
   ```

## Verification

To verify what IS being captured, enable logging:
```typescript
registerPlugin(createTableExtractorPlugin({
  enableLogging: true,
  warnOnEmptyTables: true,
  onTablesExtracted: (tables, context) => {
    console.log(`✅ Captured: [${tables.join(', ')}]`);
  },
  onEmptyTables: (context) => {
    console.log(`⚠️  No tables: ${context.sql.substring(0, 100)}`);
  }
}));
```

This will show you exactly which queries are going through the hook system.

