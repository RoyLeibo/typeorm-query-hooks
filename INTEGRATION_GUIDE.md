# Integration Guide: Using typeorm-query-hooks with Your Existing Logger

This guide shows how to integrate `typeorm-query-hooks` with your existing TypeORM Logger implementation, specifically for NestJS applications.

## Problem

Your existing `PostgresqlQueryLogger` receives raw SQL strings but needs to know which tables are involved. Traditional regex-based parsing is:
- ❌ Unreliable for complex queries
- ❌ Misses tables in subqueries and CTEs
- ❌ Breaks with aliasing and joins

## Solution

`typeorm-query-hooks` captures table metadata at QueryBuilder time and makes it available to your Logger through a registry.

## Step-by-Step Integration

### 1. Install the Library

```bash
npm install typeorm-query-hooks
```

### 2. Create the Query Hooks Module

```typescript
// src/database/query-hooks.module.ts
import { Module, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { 
  enableQueryHooks, 
  registerPlugin, 
  TableExtractorPlugin,
  QueryMetadataRegistryPlugin,
  QueryMetadataService
} from 'typeorm-query-hooks';

@Injectable()
export class QueryHooksInitializer implements OnModuleInit {
  private readonly logger = new Logger(QueryHooksInitializer.name);

  onModuleInit() {
    // Enable the hook system
    enableQueryHooks();
    
    // Register plugins
    registerPlugin(TableExtractorPlugin);
    registerPlugin(QueryMetadataRegistryPlugin); // Required for Logger integration!
    
    this.logger.log('✅ Query hooks initialized');
  }
}

@Module({
  providers: [
    QueryHooksInitializer,
    QueryMetadataService, // Make available for DI
  ],
  exports: [QueryMetadataService],
})
export class QueryHooksModule {}
```

### 3. Update Your Logger (Choose One Approach)

#### Approach A: Extend BaseQueryLogger (Recommended)

```typescript
// src/database/postgresql-query.logger.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseQueryLogger } from 'typeorm-query-hooks';
import { PostgresqlQueryMetrics } from './postgresql-query-metrics';
import { extractQueryType } from './query-utils'; // Your existing function

@Injectable()
export class PostgresqlQueryLogger extends BaseQueryLogger {
  private readonly logger = new Logger('PostgresqlQueryLogger');
  private metricsService?: PostgresqlQueryMetrics;
  private serviceName: string;
  private readonly slowQueryWarningThreshold: number;

  constructor(configService: ConfigService) {
    super(); // Call parent constructor
    this.serviceName = configService.get('SERVICE_NAME', 'unknown-service');
    this.slowQueryWarningThreshold = configService.get(
      'POSTGRES_SLOW_QUERY_WARNING_THRESHOLD',
      300
    );
  }

  setMetricsService(metricsService: PostgresqlQueryMetrics) {
    this.metricsService = metricsService;
  }

  logQuery(query: string, parameters?: any[]): void {
    // ✅ Use metadata from QueryBuilder (accurate for 95%+ of queries)
    const tableNames = this.getTablesFromQuery(query);
    const hasMetadata = this.hasMetadata(query);
    const queryType = extractQueryType(query);

    this.logger.debug('Query executed', {
      queryType,
      tables: tableNames,
      tableCount: tableNames.length,
      hasMetadata, // Know if this came from QueryBuilder or raw SQL
      sql: query.substring(0, 200),
      parameters,
    });

    // Your existing existence check detection
    const queryLower = query.toLowerCase();
    if (queryLower.includes('and (0=1)') || queryLower.includes('and (1=0)')) {
      this.logger.warn('Detected existence check query', {
        query,
        tables: tableNames,
      });
    }
  }

  logQueryError(error: string | Error, query: string, _parameters?: any[]): void {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const isDuplicateKeyError = errorMessage.toLowerCase().includes('duplicate key value');
    
    // ✅ Get tables from metadata
    const tableNames = this.getTablesFromQuery(query);
    const queryType = extractQueryType(query);

    if (isDuplicateKeyError) {
      this.logger.warn('Failed postgres query', {
        query,
        error: errorMessage,
        queryType,
        tables: tableNames,
      });
    } else {
      this.logger.error('Failed postgres query', {
        query,
        error: errorMessage,
        queryType,
        tables: tableNames,
      });
    }
  }

  logQuerySlow(time: number, query: string, _parameters?: any[]): void {
    const queryType = extractQueryType(query);
    
    // ✅ Use metadata for accurate table extraction
    const allTableNames = this.getTablesFromQuery(query);
    const primaryTable = this.getPrimaryTable(query); // Gets first table or 'unknown'

    // Record metric
    if (this.metricsService) {
      this.metricsService.recordQueryLatency({
        queryType,
        serviceName: this.serviceName,
        tableName: primaryTable,
        executionTimeMs: time,
      });
    }

    // Warning log for slow queries
    if (time > this.slowQueryWarningThreshold) {
      this.logger.warn('Slow postgres query detected', {
        query,
        executionTime: time,
        queryType,
        tables: allTableNames,
        tableCount: allTableNames.length,
        primaryTable,
      });
    }
  }

  logSchemaBuild(_message: string): void {
    // Suppress schema build logs
  }

  logMigration(_message: string): void {
    // Suppress migration logs
  }

  log(level: 'log' | 'info' | 'warn', message: any): void {
    if (level === 'warn') {
      this.logger.warn(message);
    } else {
      this.logger.log(message);
    }
  }
}
```

#### Approach B: Use QueryMetadataService via DI

```typescript
// src/database/postgresql-query.logger.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger as TypeOrmLogger } from 'typeorm';
import { QueryMetadataService } from 'typeorm-query-hooks';
import { PostgresqlQueryMetrics } from './postgresql-query-metrics';
import { extractQueryType } from './query-utils';

@Injectable()
export class PostgresqlQueryLogger implements TypeOrmLogger {
  private readonly logger = new Logger('PostgresqlQueryLogger');
  private metricsService?: PostgresqlQueryMetrics;
  private serviceName: string;
  private readonly slowQueryWarningThreshold: number;

  constructor(
    configService: ConfigService,
    private readonly queryMetadataService: QueryMetadataService, // ✅ Inject
  ) {
    this.serviceName = configService.get('SERVICE_NAME', 'unknown-service');
    this.slowQueryWarningThreshold = configService.get(
      'POSTGRES_SLOW_QUERY_WARNING_THRESHOLD',
      300
    );
  }

  setMetricsService(metricsService: PostgresqlQueryMetrics) {
    this.metricsService = metricsService;
  }

  logQuery(query: string, parameters?: any[]): void {
    // ✅ Use injected service
    const { tables, count } = this.queryMetadataService.getTableInfo(query);
    const queryType = extractQueryType(query);

    this.logger.debug('Query executed', {
      queryType,
      tables,
      tableCount: count,
      sql: query.substring(0, 200),
      parameters,
    });

    // Rest of your logic...
  }

  logQuerySlow(time: number, query: string, _parameters?: any[]): void {
    const queryType = extractQueryType(query);
    const allTableNames = this.queryMetadataService.getTablesFromQuery(query);
    const primaryTable = this.queryMetadataService.getPrimaryTable(query);

    if (this.metricsService) {
      this.metricsService.recordQueryLatency({
        queryType,
        serviceName: this.serviceName,
        tableName: primaryTable,
        executionTimeMs: time,
      });
    }

    // Rest of your logic...
  }

  // ... other methods
}
```

### 4. Update Your TypeORM Configuration

```typescript
// src/database/database.module.ts or app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueryHooksModule } from './query-hooks.module';
import { PostgresqlQueryLogger } from './postgresql-query.logger';

@Module({
  imports: [
    QueryHooksModule, // ✅ Import first
    TypeOrmModule.forRootAsync({
      imports: [QueryHooksModule],
      inject: [PostgresqlQueryLogger],
      useFactory: (queryLogger: PostgresqlQueryLogger) => ({
        type: 'postgres',
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        synchronize: false,
        logger: queryLogger, // ✅ Use your logger
        logging: ['query', 'error', 'slow'],
        maxQueryExecutionTime: 1000, // Triggers logQuerySlow
      }),
    }),
  ],
})
export class DatabaseModule {}
```

## What You Get

### Before (Regex-based)
```typescript
// ❌ extractAllTableNames using regex
const tableNames = extractAllTableNames(query);
// Misses: subqueries, CTEs, complex joins, aliases
```

### After (Metadata-based)
```typescript
// ✅ Accurate table extraction from QueryBuilder metadata
const tableNames = this.getTablesFromQuery(query);
// Includes: main table, joins, subqueries, CTEs, all aliases
```

## Coverage

| Query Source | Metadata Available | Tables Extracted |
|-------------|-------------------|------------------|
| `Repository.find()` | ✅ Yes | ✅ All tables |
| `QueryBuilder` | ✅ Yes | ✅ All tables including subqueries |
| `createQueryBuilder()` | ✅ Yes | ✅ All tables |
| `QueryRunner.query()` | ❌ No | ⚠️ Empty array (fallback to regex) |
| Raw SQL strings | ❌ No | ⚠️ Empty array (fallback to regex) |

**Note:** 95%+ of queries in a typical NestJS app use Repository/QueryBuilder.

## Handling Raw Queries

For the remaining 5% (raw SQL), keep your existing regex functions as fallback:

```typescript
logQuery(query: string, parameters?: any[]): void {
  let tableNames = this.getTablesFromQuery(query);
  
  // Fallback to regex if metadata not available
  if (tableNames.length === 0 && !this.hasMetadata(query)) {
    tableNames = extractAllTableNames(query); // Your existing regex function
  }

  // ... rest of your logic
}
```

## Testing

```typescript
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PostgresqlQueryLogger } from './postgresql-query.logger';
import { QueryHooksModule } from './query-hooks.module';

describe('PostgresqlQueryLogger', () => {
  let logger: PostgresqlQueryLogger;
  let dataSource: DataSource;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [QueryHooksModule],
      providers: [PostgresqlQueryLogger, ConfigService],
    }).compile();

    logger = module.get(PostgresqlQueryLogger);
    dataSource = await createTestDataSource();
  });

  it('should extract tables from QueryBuilder', () => {
    const repo = dataSource.getRepository(User);
    const qb = repo.createQueryBuilder('user')
      .leftJoin('user.posts', 'post');
    
    const sql = qb.getQuery();
    
    // Simulate logger receiving the SQL
    const tables = logger['getTablesFromQuery'](sql);
    
    expect(tables).toContain('users');
    expect(tables).toContain('posts');
  });
});
```

## Migration Checklist

- [ ] Install `typeorm-query-hooks`
- [ ] Create `QueryHooksModule`
- [ ] Initialize hooks in `onModuleInit`
- [ ] Update your Logger to extend `BaseQueryLogger` or inject `QueryMetadataService`
- [ ] Import `QueryHooksModule` in your database module
- [ ] Test with your existing queries
- [ ] Keep regex fallback for raw SQL (optional)
- [ ] Remove old `query-utils.ts` functions if no longer needed

## Troubleshooting

### "Tables array is empty"
- Make sure `QueryMetadataRegistryPlugin` is registered
- Check that hooks are enabled before queries execute
- Verify the query uses QueryBuilder (not raw SQL)

### "Module already initialized" warning
- Only call `enableQueryHooks()` once
- Use `OnModuleInit` lifecycle hook
- Don't call in multiple modules

### Memory concerns
- Registry auto-cleans entries older than 1 minute
- Max size is 10,000 entries (configurable)
- Call `queryMetadataRegistry.clear()` in tests

## Benefits

✅ **Accurate**: Uses actual QueryBuilder metadata, not regex  
✅ **Comprehensive**: Captures tables from subqueries, CTEs, all join types  
✅ **Type-safe**: Full TypeScript support with IntelliSense  
✅ **NestJS-friendly**: Works with dependency injection  
✅ **Backwards compatible**: Keep your existing Logger interface  
✅ **Zero changes to business logic**: No need to modify your services  

## Questions?

- Check the main [README.md](./README.md)
- See [examples/nestjs-integration.ts](./examples/nestjs-integration.ts)
- Open an issue on GitHub

