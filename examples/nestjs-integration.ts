/**
 * Example of integrating typeorm-query-hooks with NestJS
 * 
 * This shows how to:
 * 1. Initialize the hooks in your NestJS app
 * 2. Use the QueryMetadataRegistry plugin
 * 3. Access table information in your TypeORM Logger
 * 4. Use dependency injection
 */

import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger as TypeOrmLogger } from 'typeorm';
import { 
  enableQueryHooks, 
  registerPlugin, 
  TableExtractorPlugin 
} from '../src';
import { 
  QueryMetadataRegistryPlugin, 
  getTablesFromSQL,
  hasQueryMetadata 
} from '../src/plugins/query-metadata-registry';
import { BaseQueryLogger, QueryMetadataService } from '../src/nestjs';

// ============================================================================
// APPROACH 1: Extend BaseQueryLogger (Recommended)
// ============================================================================

@Injectable()
export class PostgresqlQueryLogger extends BaseQueryLogger {
  private readonly logger = new Logger('PostgresqlQueryLogger');
  private serviceName: string;
  private readonly slowQueryWarningThreshold: number;

  constructor(configService: ConfigService) {
    super();
    this.serviceName = configService.get('SERVICE_NAME', 'unknown-service');
    this.slowQueryWarningThreshold = configService.get('POSTGRES_SLOW_QUERY_WARNING_THRESHOLD', 300);
  }

  logQuery(query: string, parameters?: any[]): void {
    // ✅ Use the built-in method from BaseQueryLogger
    const tableNames = this.getTablesFromQuery(query);
    const hasMetadata = this.hasMetadata(query);

    // Extract query type from SQL (you can keep your existing function or use metadata)
    const queryType = this.extractQueryType(query);

    this.logger.debug('Query executed', {
      queryType,
      tables: tableNames,
      tableCount: tableNames.length,
      hasMetadata, // Know if this came from QueryBuilder or raw SQL
      sql: query.substring(0, 200),
      parameters,
    });

    // Log existence check queries
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
    
    // ✅ Get tables using metadata
    const tableNames = this.getTablesFromQuery(query);
    const queryType = this.extractQueryType(query);

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
    const queryType = this.extractQueryType(query);
    
    // ✅ Use metadata for accurate table extraction
    const allTableNames = this.getTablesFromQuery(query);
    const primaryTable = this.getPrimaryTable(query);

    // Record metric
    // this.metricsService?.recordQueryLatency({
    //   queryType,
    //   serviceName: this.serviceName,
    //   tableName: primaryTable,
    //   executionTimeMs: time,
    // });

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

  // Keep your existing helper if needed
  private extractQueryType(query: string): string {
    const queryUpper = query.trim().toUpperCase();
    if (queryUpper.startsWith('SELECT')) return 'SELECT';
    if (queryUpper.startsWith('INSERT')) return 'INSERT';
    if (queryUpper.startsWith('UPDATE')) return 'UPDATE';
    if (queryUpper.startsWith('DELETE')) return 'DELETE';
    return 'UNKNOWN';
  }
}

// ============================================================================
// APPROACH 2: Use QueryMetadataService via dependency injection
// ============================================================================

@Injectable()
export class AlternativeQueryLogger implements TypeOrmLogger {
  private readonly logger = new Logger('AlternativeQueryLogger');

  constructor(
    private readonly configService: ConfigService,
    private readonly queryMetadataService: QueryMetadataService // ✅ Inject the service
  ) {}

  logQuery(query: string, parameters?: any[]): void {
    // ✅ Use the injected service
    const { tables, count } = this.queryMetadataService.getTableInfo(query);

    this.logger.debug('Query executed', {
      tables,
      tableCount: count,
      sql: query.substring(0, 200),
      parameters,
    });
  }

  logQueryError(error: string | Error, query: string, _parameters?: any[]): void {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const tables = this.queryMetadataService.getTablesFromQuery(query);

    this.logger.error('Failed postgres query', {
      query,
      error: errorMessage,
      tables,
    });
  }

  logQuerySlow(time: number, query: string, _parameters?: any[]): void {
    const tables = this.queryMetadataService.getTablesFromQuery(query);
    const primaryTable = this.queryMetadataService.getPrimaryTable(query);

    this.logger.warn('Slow query', {
      query,
      executionTime: time,
      tables,
      primaryTable,
    });
  }

  logSchemaBuild(_message: string): void {}
  logMigration(_message: string): void {}
  log(level: 'log' | 'info' | 'warn', message: any): void {
    this.logger[level](message);
  }
}

// ============================================================================
// APPROACH 3: Direct import (no DI, simpler)
// ============================================================================

@Injectable()
export class SimpleQueryLogger implements TypeOrmLogger {
  private readonly logger = new Logger('SimpleQueryLogger');

  logQuery(query: string, parameters?: any[]): void {
    // ✅ Direct import and use
    const tables = getTablesFromSQL(query);
    const hasMetadata = hasQueryMetadata(query);

    this.logger.debug('Query executed', {
      tables,
      hasMetadata,
      sql: query.substring(0, 200),
      parameters,
    });
  }

  logQueryError(error: string | Error, query: string, _parameters?: any[]): void {
    const tables = getTablesFromSQL(query);
    this.logger.error('Query failed', { tables, error });
  }

  logQuerySlow(time: number, query: string, _parameters?: any[]): void {
    const tables = getTablesFromSQL(query);
    this.logger.warn('Slow query', { tables, time });
  }

  logSchemaBuild(_message: string): void {}
  logMigration(_message: string): void {}
  log(level: 'log' | 'info' | 'warn', message: any): void {
    this.logger[level](message);
  }
}

// ============================================================================
// Module Setup
// ============================================================================

@Injectable()
export class QueryHooksInitializer implements OnModuleInit {
  private readonly logger = new Logger('QueryHooksInitializer');

  onModuleInit() {
    // ✅ Initialize hooks when the module starts
    enableQueryHooks();
    registerPlugin(TableExtractorPlugin);
    registerPlugin(QueryMetadataRegistryPlugin); // ⚠️ Important!

    this.logger.log('Query hooks initialized');
  }
}

@Module({
  providers: [
    QueryHooksInitializer,
    QueryMetadataService, // ✅ Make it available for DI
    PostgresqlQueryLogger,
    AlternativeQueryLogger,
    SimpleQueryLogger,
  ],
  exports: [
    QueryMetadataService,
    PostgresqlQueryLogger,
  ],
})
export class QueryHooksModule {}

// ============================================================================
// Usage in main.ts or app.module.ts
// ============================================================================

/*
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Get the logger from DI
  const queryLogger = app.get(PostgresqlQueryLogger);
  
  // Use it in TypeORM config
  // ... configure TypeORM with logger: queryLogger
  
  await app.listen(3000);
}
bootstrap();
*/

/*
// app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueryHooksModule, PostgresqlQueryLogger } from './query-hooks';

@Module({
  imports: [
    QueryHooksModule, // ✅ Import the module
    TypeOrmModule.forRootAsync({
      imports: [QueryHooksModule],
      inject: [PostgresqlQueryLogger],
      useFactory: (queryLogger: PostgresqlQueryLogger) => ({
        type: 'postgres',
        // ... other config
        logger: queryLogger, // ✅ Use the logger
        logging: ['query', 'error', 'slow'],
        maxQueryExecutionTime: 1000,
      }),
    }),
  ],
})
export class AppModule {}
*/

