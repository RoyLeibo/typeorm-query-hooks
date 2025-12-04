# typeorm-query-hooks

A plugin-based extension system for TypeORM QueryBuilder that adds hooks and utilities without requiring changes to your existing imports.

## Features

- 🔌 **Plugin Architecture**: Extensible system for adding custom functionality
- 📊 **Table Extraction**: Automatically extract involved tables from any query
- 🎯 **Zero Import Changes**: Works with standard `typeorm` imports
- 🔍 **Type-Safe**: Full TypeScript support with IntelliSense
- 🪝 **Query Hooks**: Intercept and observe query building
- 🚀 **Easy Setup**: One-time initialization at app startup

## Installation

```bash
npm install typeorm-query-hooks
```

## Quick Start

### 1. Enable Hooks (One-time setup)

In your application entry point (e.g., `main.ts` or `index.ts`):

```typescript
import { enableQueryHooks, registerPlugin, TableExtractorPlugin } from 'typeorm-query-hooks';

// Enable the hook system
enableQueryHooks();

// Register the table extractor plugin
registerPlugin(TableExtractorPlugin);
```

### 2. Use in Your Code

No import changes needed! Continue using standard TypeORM imports:

```typescript
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>
  ) {}

  async findUsersWithEmails() {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.emails', 'email')
      .where('user.active = :active', { active: true });

    // ✨ New method available via plugin!
    const tables = qb.getInvolvedTables();
    console.log('Tables:', tables); // ['users', 'user_emails']

    return qb.getMany();
  }
}
```

## Core API

### `enableQueryHooks()`

Enables the query hook system by patching TypeORM's QueryBuilder classes. Must be called once at application startup.

```typescript
import { enableQueryHooks } from 'typeorm-query-hooks';

enableQueryHooks();
```

### `registerPlugin(plugin)`

Register a plugin to receive query hooks.

```typescript
import { registerPlugin, TableExtractorPlugin } from 'typeorm-query-hooks';

registerPlugin(TableExtractorPlugin);
```

### `unregisterPlugin(pluginName)`

Remove a plugin by name.

```typescript
import { unregisterPlugin } from 'typeorm-query-hooks';

unregisterPlugin('TableExtractor');
```

## NestJS Integration

The library provides seamless integration with NestJS and dependency injection, making it easy to access table metadata in your TypeORM Logger implementations.

### Setup

```typescript
// query-hooks.module.ts
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
  private readonly logger = new Logger('QueryHooksInitializer');

  onModuleInit() {
    // Initialize hooks when module loads
    enableQueryHooks();
    registerPlugin(TableExtractorPlugin);
    registerPlugin(QueryMetadataRegistryPlugin); // Required for Logger integration
    
    this.logger.log('Query hooks initialized');
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

### Using in TypeORM Logger (Approach 1: Extend BaseQueryLogger)

```typescript
// postgresql-query.logger.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseQueryLogger } from 'typeorm-query-hooks';

@Injectable()
export class PostgresqlQueryLogger extends BaseQueryLogger {
  private readonly logger = new Logger('PostgresqlQueryLogger');
  private readonly slowQueryThreshold: number;

  constructor(configService: ConfigService) {
    super();
    this.slowQueryThreshold = configService.get('SLOW_QUERY_THRESHOLD', 300);
  }

  logQuery(query: string, parameters?: any[]): void {
    // ✅ These methods extract table names from the SQL string
    const tables = this.getTablesFromQuery(query);        // e.g., ['users', 'posts']
    const primaryTable = this.getPrimaryTable(query);     // e.g., 'users' (first table)
    const hasMetadata = this.hasMetadata(query);          // true if came from QueryBuilder

    this.logger.debug('Query executed', {
      tables,              // Array of all involved tables
      tableCount: tables.length,
      primaryTable,        // The main table
      hasMetadata,         // Whether we have metadata from QueryBuilder
      sql: query.substring(0, 200),
    });
  }

  logQuerySlow(time: number, query: string, _parameters?: any[]): void {
    const tables = this.getTablesFromQuery(query);
    const primaryTable = this.getPrimaryTable(query);

    if (time > this.slowQueryThreshold) {
      this.logger.warn('Slow query detected', {
        query,
        executionTime: time,
        tables,
        primaryTable,
      });
    }

    // Send to metrics service
    // this.metricsService.recordQueryLatency({
    //   tableName: primaryTable,
    //   executionTimeMs: time,
    // });
  }

  logQueryError(error: string | Error, query: string, _parameters?: any[]): void {
    const tables = this.getTablesFromQuery(query);
    this.logger.error('Query failed', { error, tables });
  }

  logSchemaBuild(_message: string): void {}
  logMigration(_message: string): void {}
  log(level: 'log' | 'info' | 'warn', message: any): void {
    this.logger[level](message);
  }
}
```

### Using in TypeORM Logger (Approach 2: Dependency Injection)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { QueryMetadataService } from 'typeorm-query-hooks';
import { Logger as TypeOrmLogger } from 'typeorm';

@Injectable()
export class PostgresqlQueryLogger implements TypeOrmLogger {
  private readonly logger = new Logger('PostgresqlQueryLogger');

  constructor(
    private readonly queryMetadataService: QueryMetadataService, // ✅ Inject
  ) {}

  logQuery(query: string, parameters?: any[]): void {
    // ✅ Use the injected service
    const { tables, count } = this.queryMetadataService.getTableInfo(query);

    this.logger.debug('Query executed', {
      tables,
      tableCount: count,
      sql: query.substring(0, 200),
    });
  }

  logQuerySlow(time: number, query: string, _parameters?: any[]): void {
    const tables = this.queryMetadataService.getTablesFromQuery(query);
    this.logger.warn('Slow query', { tables, time });
  }

  // ... other methods
}
```

### Configure TypeORM to Use Your Logger

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueryHooksModule } from './query-hooks/query-hooks.module';
import { PostgresqlQueryLogger } from './query-hooks/postgresql-query.logger';

@Module({
  imports: [
    QueryHooksModule,
    TypeOrmModule.forRootAsync({
      imports: [QueryHooksModule],
      inject: [PostgresqlQueryLogger],
      useFactory: (queryLogger: PostgresqlQueryLogger) => ({
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        database: 'mydb',
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        logger: queryLogger, // ✅ Use your logger
        logging: ['query', 'error', 'slow'],
        maxQueryExecutionTime: 1000, // Triggers logQuerySlow
      }),
    }),
  ],
})
export class AppModule {}
```

### How It Works

1. **QueryMetadataRegistry Plugin**: Captures table metadata when queries are built via QueryBuilder
2. **Registry Lookup**: Maps SQL strings to metadata using normalized SQL matching
3. **Logger Access**: Your Logger receives raw SQL and looks it up in the registry
4. **Automatic Cleanup**: Old entries are automatically removed to prevent memory leaks

### Important Notes

- ⚠️ Only queries built with QueryBuilder will have metadata
- Raw queries via `QueryRunner.query()` won't have metadata (returns empty array)
- The registry normalizes SQL for matching (removes extra whitespace, case-insensitive)
- Memory is managed automatically (configurable max size and TTL)

## Built-in Plugins

### TableExtractorPlugin

Adds the ability to extract table names from any QueryBuilder instance.

#### Features

- Adds `getInvolvedTables()` method to all QueryBuilder types
- Extracts tables from main query, joins, and relations
- Event system for monitoring table usage

#### Usage

```typescript
import { enableQueryHooks, registerPlugin, TableExtractorPlugin, onTablesExtracted } from 'typeorm-query-hooks';

// Setup
enableQueryHooks();
registerPlugin(TableExtractorPlugin);

// Optional: Listen to all table extractions
onTablesExtracted((tables, builder, sql) => {
  console.log('Query involves tables:', tables);
  // Send to monitoring service, etc.
});

// In your code
const qb = repo.createQueryBuilder('user')
  .leftJoin('user.posts', 'post')
  .leftJoin('post.comments', 'comment');

const tables = qb.getInvolvedTables(); 
// Returns: ['users', 'posts', 'comments']
```

### QueryLoggerPlugin

Simple query logging plugin for debugging.

```typescript
import { registerPlugin, createQueryLoggerPlugin } from 'typeorm-query-hooks';

// Use default logger
import { QueryLoggerPlugin } from 'typeorm-query-hooks';
registerPlugin(QueryLoggerPlugin);

// Or create custom logger
const customLogger = createQueryLoggerPlugin({
  logSql: true,
  logTimestamp: true,
  logger: (msg) => myCustomLogger.info(msg),
  filter: (context) => context.sql.includes('SELECT') // Only log SELECT queries
});

registerPlugin(customLogger);
```

### QueryMetadataRegistryPlugin

Bridges the gap between QueryBuilder and TypeORM Logger by maintaining a registry of SQL queries mapped to their metadata.

**Use this plugin when:**
- You have a custom TypeORM Logger implementation
- You want to access table information from raw SQL strings
- You're using NestJS and need dependency injection support

```typescript
import { 
  registerPlugin, 
  QueryMetadataRegistryPlugin,
  getTablesFromSQL,
  hasQueryMetadata 
} from 'typeorm-query-hooks';

// Register the plugin
registerPlugin(QueryMetadataRegistryPlugin);

// Later, in your Logger or anywhere else
const tables = getTablesFromSQL('SELECT * FROM users WHERE id = 1');
console.log(tables); // ['users']

// Check if metadata is available
if (hasQueryMetadata(sql)) {
  console.log('This query came from QueryBuilder');
}
```

**How it works:**
1. Intercepts queries when they're built via QueryBuilder
2. Stores table metadata in a registry (Map) with the SQL as key
3. Provides utility functions to lookup metadata by SQL string
4. Automatically cleans up old entries to prevent memory leaks

**Configuration:**
```typescript
import { queryMetadataRegistry } from 'typeorm-query-hooks';

// Check registry size
console.log(queryMetadataRegistry.size());

// Clear all entries (useful in tests)
queryMetadataRegistry.clear();
```

## Creating Custom Plugins

You can create your own plugins to extend functionality:

```typescript
import { QueryHookPlugin, registerPlugin } from 'typeorm-query-hooks';

const MyCustomPlugin: QueryHookPlugin = {
  name: 'MyCustomPlugin',
  
  onRegister: () => {
    console.log('Plugin registered!');
  },
  
  onEnable: () => {
    console.log('Hooks enabled!');
  },
  
  onQueryBuild: (context) => {
    const { builder, sql, timestamp } = context;
    
    // Your custom logic here
    console.log('Query built:', sql);
    
    // Example: Send to monitoring service
    // metrics.recordQuery(sql, timestamp);
  }
};

registerPlugin(MyCustomPlugin);
```

### Plugin Interface

```typescript
interface QueryHookPlugin {
  name: string;
  onRegister?: () => void;        // Called when plugin is registered
  onEnable?: () => void;          // Called when hooks are enabled
  onQueryBuild?: (context: QueryHookContext) => void; // Called on every query
}

interface QueryHookContext {
  builder: QueryBuilder<any>;
  sql: string;
  timestamp: Date;
}
```

## Use Cases

### 1. Database Query Monitoring

Track which tables are being accessed for observability:

```typescript
import { onTablesExtracted } from 'typeorm-query-hooks';

onTablesExtracted((tables, builder, sql) => {
  metrics.increment('db.tables.accessed', { tables });
});
```

### 2. Query Performance Tracking

```typescript
const PerformancePlugin: QueryHookPlugin = {
  name: 'Performance',
  onQueryBuild: (context) => {
    const tables = (context.builder as any).getInvolvedTables?.() || [];
    
    // Track query complexity
    if (tables.length > 5) {
      logger.warn('Complex query with many tables:', tables);
    }
  }
};
```

### 3. Security Auditing

```typescript
const AuditPlugin: QueryHookPlugin = {
  name: 'SecurityAudit',
  onQueryBuild: (context) => {
    const tables = (context.builder as any).getInvolvedTables?.() || [];
    
    // Log access to sensitive tables
    if (tables.some(t => ['users', 'payments'].includes(t))) {
      auditLog.record({
        query: context.sql,
        tables,
        timestamp: context.timestamp
      });
    }
  }
};
```

### 4. Development Debugging

```typescript
const DebugPlugin: QueryHookPlugin = {
  name: 'Debug',
  onQueryBuild: (context) => {
    if (process.env.NODE_ENV === 'development') {
      const tables = (context.builder as any).getInvolvedTables?.() || [];
      console.log('📊 Query:', context.sql);
      console.log('📋 Tables:', tables);
    }
  }
};
```

## TypeScript Support

The library includes full TypeScript definitions. When you register the `TableExtractorPlugin`, your IDE will automatically recognize the new methods:

```typescript
const qb = repo.createQueryBuilder('user');

// ✅ TypeScript knows about this method
const tables = qb.getInvolvedTables();

// ✅ Full IntelliSense support
qb.getInvolvedTables(); // Shows JSDoc comments
```

## How It Works

The library uses TypeORM's extensibility by:

1. **Prototype Patching**: Safely extends QueryBuilder classes at runtime
2. **Module Augmentation**: TypeScript declarations make new methods type-safe
3. **Hook System**: Intercepts `getQuery()` to notify plugins

Your code continues to import from `typeorm` directly - no wrappers or proxies!

## Limitations

- **Raw Queries**: `QueryRunner.query('SELECT...')` bypasses the QueryBuilder, so hooks won't fire
- **TypeORM Version**: Requires TypeORM 0.3.x or higher
- **Single Initialization**: Call `enableQueryHooks()` only once

## Advanced Configuration

### Conditional Plugin Loading

```typescript
import { enableQueryHooks, registerPlugin, TableExtractorPlugin } from 'typeorm-query-hooks';

enableQueryHooks();

// Load plugins based on environment
if (process.env.ENABLE_TABLE_TRACKING === 'true') {
  registerPlugin(TableExtractorPlugin);
}

if (process.env.NODE_ENV === 'development') {
  registerPlugin(QueryLoggerPlugin);
}
```

### Multiple Listeners

```typescript
import { onTablesExtracted } from 'typeorm-query-hooks';

// Register multiple listeners for different purposes
onTablesExtracted((tables) => {
  prometheusMetrics.recordTableAccess(tables);
});

onTablesExtracted((tables) => {
  datadogMetrics.increment('db.query', { tables: tables.length });
});

onTablesExtracted((tables, builder, sql) => {
  if (tables.includes('sensitive_data')) {
    securityLog.warn('Access to sensitive table', { sql });
  }
});
```

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT

## Credits

Inspired by patterns used in `@opentelemetry/instrumentation-typeorm` and `typeorm-transactional`.

