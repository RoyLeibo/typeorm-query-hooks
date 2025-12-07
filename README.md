# typeorm-query-hooks

A lightweight, extensible plugin system for TypeORM that lets you intercept and extract metadata from queries **without modifying your existing code**.

[![npm version](https://img.shields.io/npm/v/typeorm-query-hooks.svg)](https://www.npmjs.com/package/typeorm-query-hooks)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🎯 **Zero Config** - Works out of the box with TypeORM
- 🔌 **Plugin-Based** - Extensible architecture for custom functionality
- 📊 **Table Extraction** - Automatically extract table names from any query
- 🚀 **TypeScript Native** - Full type safety
- 🪝 **AsyncLocalStorage** - Reliable context propagation
- ⚡ **No Performance Impact** - Minimal overhead

## Installation

```bash
npm install typeorm-query-hooks
```

## Quick Start

### JavaScript / TypeScript

```typescript
import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
import { TableExtractorPlugin, QueryMetadataRegistryPlugin } from 'typeorm-query-hooks';

// Enable hooks once at application startup
enableQueryHooks();
registerPlugin(TableExtractorPlugin);
registerPlugin(QueryMetadataRegistryPlugin);

// Now use TypeORM normally - hooks are automatic!
const users = await userRepository.find({ where: { status: 'active' } });
```

### NestJS

**Option 1: Auto-Registration (Recommended)**

```typescript
// src/main.ts - Import BEFORE NestFactory
import 'typeorm-query-hooks/register';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

**Option 2: Manual Registration**

```typescript
// src/main.ts
import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
import { TableExtractorPlugin, QueryMetadataRegistryPlugin } from 'typeorm-query-hooks';

// Initialize before creating NestJS app
enableQueryHooks();
registerPlugin(TableExtractorPlugin);
registerPlugin(QueryMetadataRegistryPlugin);

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

**Option 3: Shared Module (For Monorepos)**

If you have a shared database module used across multiple services:

```typescript
// libs/database/src/index.ts
import { enableQueryHooks, registerPlugin } from 'typeorm-query-hooks';
import { TableExtractorPlugin, QueryMetadataRegistryPlugin } from 'typeorm-query-hooks';

// Initialize once when module is imported
enableQueryHooks();
registerPlugin(TableExtractorPlugin);
registerPlugin(QueryMetadataRegistryPlugin);

export * from './your-database-utilities';
```

Now all services that import this module automatically get the hooks!

## Usage

### Extract Tables from Queries

```typescript
import { getTablesFromSQL } from 'typeorm-query-hooks';

// In your TypeORM logger or anywhere you have SQL
class MyLogger implements Logger {
  logQuery(query: string, parameters?: any[]) {
    const tables = getTablesFromSQL(query);
    console.log('Query executed on tables:', tables);
    // ['users', 'posts', 'comments']
  }
}
```

### Check if Metadata is Available

```typescript
import { hasQueryMetadata } from 'typeorm-query-hooks';

if (hasQueryMetadata(sql)) {
  const tables = getTablesFromSQL(sql);
  // Do something with the tables
}
```

### NestJS Custom Logger Example

```typescript
import { Logger } from 'typeorm';
import { getTablesFromSQL } from 'typeorm-query-hooks';

export class CustomTypeOrmLogger implements Logger {
  logQuery(query: string, parameters?: any[]) {
    const tables = getTablesFromSQL(query);
    console.log({
      type: 'query',
      tables,
      sql: query,
      params: parameters
    });
  }

  logQueryError(error: string, query: string, parameters?: any[]) {
    const tables = getTablesFromSQL(query);
    console.error({
      type: 'query-error',
      tables,
      error,
      sql: query,
      params: parameters
    });
  }

  logQuerySlow(time: number, query: string, parameters?: any[]) {
    const tables = getTablesFromSQL(query);
    console.warn({
      type: 'slow-query',
      tables,
      duration: time,
      sql: query,
      params: parameters
    });
  }

  logSchemaBuild(message: string) {
    console.log(message);
  }

  logMigration(message: string) {
    console.log(message);
  }

  log(level: 'log' | 'info' | 'warn', message: any) {
    console.log(message);
  }
}

// Use in TypeORM config
{
  type: 'postgres',
  // ... other options
  logger: new CustomTypeOrmLogger(),
  logging: true
}
```

## How It Works

1. **Hooks** patch TypeORM's `QueryBuilder` methods (`getQuery`, `getOne`, `getMany`, etc.)
2. **Plugins** extract metadata from the QueryBuilder's `expressionMap` (no regex!)
3. **AsyncLocalStorage** passes metadata through the async call stack to your logger
4. **Utility functions** (`getTablesFromSQL`) retrieve the metadata anywhere in your code

This means you get accurate table names even for complex queries with:
- ✅ Joins (INNER, LEFT, RIGHT, etc.)
- ✅ Subqueries
- ✅ CTEs (Common Table Expressions)
- ✅ Aliases
- ✅ Relations
- ✅ All query types (SELECT, INSERT, UPDATE, DELETE)

## Built-in Plugins

### TableExtractorPlugin

Extracts all table names involved in a query from the TypeORM metadata.

### QueryMetadataRegistryPlugin

Stores query metadata (tables, query type, timestamp) for later retrieval. Enables the `getTablesFromSQL()` utility function.

## Creating Custom Plugins

```typescript
import { QueryHookPlugin, QueryHookContext } from 'typeorm-query-hooks';

export const MyCustomPlugin: QueryHookPlugin = {
  name: 'MyCustomPlugin',
  
  onQueryBuild: (context: QueryHookContext) => {
    // context.builder - The TypeORM QueryBuilder
    // context.sql - The generated SQL
    // context.timestamp - When the query was built
    
    // Your custom logic here
    console.log('Query built:', context.sql);
  },
  
  onRegister: () => {
    console.log('Plugin registered!');
  },
  
  onEnable: () => {
    console.log('Hooks enabled!');
  }
};

// Register your plugin
registerPlugin(MyCustomPlugin);
```

## API Reference

### Core Functions

#### `enableQueryHooks(options?)`

Enable the query hooks system. Must be called before any TypeORM queries.

```typescript
enableQueryHooks({ verbose: true }); // Enable debug logging
```

#### `registerPlugin(plugin)`

Register a plugin to receive query hooks.

```typescript
registerPlugin(TableExtractorPlugin);
```

#### `unregisterPlugin(name)`

Unregister a plugin by name.

```typescript
unregisterPlugin('TableExtractor');
```

### Utility Functions

#### `getTablesFromSQL(sql: string): string[]`

Get the list of tables involved in a SQL query.

```typescript
const tables = getTablesFromSQL('SELECT * FROM users');
// Returns: ['users']
```

#### `hasQueryMetadata(sql: string): boolean`

Check if metadata is available for a SQL query.

```typescript
if (hasQueryMetadata(sql)) {
  // Metadata available
}
```

#### `getQueryTypeFromSQL(sql: string): string | undefined`

Get the query type (SELECT, INSERT, UPDATE, DELETE).

```typescript
const type = getQueryTypeFromSQL(sql);
// Returns: 'SELECT'
```

## Debugging

Enable verbose mode to see detailed logs:

**Environment Variable:**
```bash
export TYPEORM_QUERY_HOOKS_VERBOSE=true
npm start
```

**Programmatically:**
```typescript
enableQueryHooks({ verbose: true });
```

## TypeScript Support

Full TypeScript support with type definitions included.

```typescript
import type { QueryHookPlugin, QueryHookContext } from 'typeorm-query-hooks';
```

## Requirements

- Node.js >= 16
- TypeORM >= 0.3.0

## Contributing

Contributions are welcome! This library is designed to be extensible - we encourage the community to create and share custom plugins.

### Ideas for Future Plugins
- Query performance tracking
- Query caching hints
- Security auditing
- Custom query transformations
- Query analytics

## License

MIT © Roy Leibovitz

## Links

- [GitHub Repository](https://github.com/RoyLeibo/typeorm-query-hooks)
- [npm Package](https://www.npmjs.com/package/typeorm-query-hooks)
- [Issue Tracker](https://github.com/RoyLeibo/typeorm-query-hooks/issues)
