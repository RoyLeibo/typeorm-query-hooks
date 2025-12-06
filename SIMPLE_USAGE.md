# Simple Usage - Just SQL to Tables

This is the simplest way to use the library:

## Step 1: Enable Hooks Once (at app startup)

```typescript
// main.ts or app entry point
import { 
  enableQueryHooks, 
  registerPlugin,
  TableExtractorPlugin,
  QueryMetadataRegistryPlugin 
} from 'typeorm-query-hooks';

// One-time setup
enableQueryHooks();
registerPlugin(TableExtractorPlugin);          // Extracts tables from QueryBuilder
registerPlugin(QueryMetadataRegistryPlugin);   // Stores SQL -> tables mapping
```

## Step 2: Use the Utility Function Anywhere

```typescript
import { getTablesFromSQL } from 'typeorm-query-hooks';

// Anywhere in your code - just pass the SQL string
const sql = "SELECT * FROM users LEFT JOIN posts ON users.id = posts.user_id";
const tables = getTablesFromSQL(sql);

console.log(tables);  // Output: ['users', 'posts']
```

## Complete Example

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { 
  enableQueryHooks, 
  registerPlugin,
  TableExtractorPlugin,
  QueryMetadataRegistryPlugin 
} from 'typeorm-query-hooks';

async function bootstrap() {
  // Step 1: Enable hooks BEFORE creating app
  enableQueryHooks();
  registerPlugin(TableExtractorPlugin);
  registerPlugin(QueryMetadataRegistryPlugin);
  
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}

bootstrap();
```

```typescript
// postgresql-query.logger.ts
import { Injectable, Logger } from '@nestjs/common';
import { Logger as TypeOrmLogger } from 'typeorm';
import { getTablesFromSQL } from 'typeorm-query-hooks';  // ✅ Simple utility function

@Injectable()
export class PostgresqlQueryLogger implements TypeOrmLogger {
  private readonly logger = new Logger('PostgresqlQueryLogger');

  logQuery(query: string, parameters?: any[]): void {
    // Step 2: Just call the function with SQL string
    const tables = getTablesFromSQL(query);  // ✅ That's it!
    
    this.logger.debug('Query executed', {
      sql: query.substring(0, 200),
      tables: tables,              // ['users', 'posts']
      primaryTable: tables[0],     // 'users'
    });
  }

  logQuerySlow(time: number, query: string): void {
    const tables = getTablesFromSQL(query);  // ✅ Same function everywhere
    
    this.logger.warn('Slow query detected', {
      executionTime: time,
      tables: tables,
      query,
    });
    
    // Send to metrics service
    // this.metricsService.recordQueryLatency({
    //   tableName: tables[0],
    //   executionTimeMs: time,
    // });
  }

  logQueryError(error: string | Error, query: string): void {
    const tables = getTablesFromSQL(query);
    this.logger.error('Query failed', { error, tables });
  }

  logSchemaBuild(message: string): void {
    this.logger.log(message);
  }

  logMigration(message: string): void {
    this.logger.log(message);
  }

  log(level: 'log' | 'info' | 'warn', message: any): void {
    this.logger[level](message);
  }
}
```

## How It Works

1. **QueryBuilder captures tables**: When you use TypeORM's QueryBuilder, the tables are automatically extracted
2. **Registry stores mapping**: The SQL string is stored with its table list
3. **Utility function retrieves**: `getTablesFromSQL(sql)` looks up the SQL and returns the tables

## Important Notes

- ✅ **Works for QueryBuilder queries**: Tables are extracted automatically
- ⚠️ **Raw SQL queries**: If you use raw SQL (not QueryBuilder), returns empty array `[]`
- 🎯 **No parsing**: Uses TypeORM's internal metadata, not regex - 100% accurate

## API

```typescript
// Get tables from SQL
getTablesFromSQL(sql: string): string[]

// Get query type
getQueryTypeFromSQL(sql: string): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | undefined

// Check if metadata exists
hasQueryMetadata(sql: string): boolean
```

That's it! Simple as that.

