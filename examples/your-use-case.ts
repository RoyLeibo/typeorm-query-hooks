/**
 * Complete Example: Integrating with Your PostgreSQL Query Logger
 * 
 * This shows exactly how to upgrade your existing PostgresqlQueryLogger
 * to use metadata-based table extraction instead of regex parsing.
 */

import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger as TypeOrmLogger } from 'typeorm';
import {
  enableQueryHooks,
  registerPlugin,
  TableExtractorPlugin,
  QueryMetadataRegistryPlugin,
  BaseQueryLogger,
} from '../src';

// Assuming you have a metrics service
interface PostgresqlQueryMetrics {
  recordQueryLatency(params: {
    queryType: string;
    serviceName: string;
    tableName: string;
    executionTimeMs: number;
  }): void;
}

// ============================================================================
// STEP 1: Initialize hooks module
// ============================================================================

@Injectable()
class QueryHooksInitializer implements OnModuleInit {
  private readonly logger = new Logger(QueryHooksInitializer.name);

  onModuleInit() {
    enableQueryHooks();
    registerPlugin(TableExtractorPlugin);
    registerPlugin(QueryMetadataRegistryPlugin); // ⚠️ Required!

    this.logger.log('✅ Query hooks enabled');
  }
}

@Module({
  providers: [QueryHooksInitializer],
})
class QueryHooksModule {}

// ============================================================================
// STEP 2: Upgrade your Logger
// ============================================================================

@Injectable()
export class PostgresqlQueryLogger extends BaseQueryLogger {
  private readonly logger = new Logger('PostgresqlQueryLogger');
  private metricsService?: PostgresqlQueryMetrics;
  private serviceName: string;
  private readonly slowQueryWarningThreshold: number;

  constructor(configService: ConfigService, serviceName = 'unknown-service') {
    super(); // ✅ Call parent constructor
    this.serviceName = serviceName;
    this.slowQueryWarningThreshold = configService.get(
      'POSTGRES_SLOW_QUERY_WARNING_THRESHOLD',
      300
    );
  }

  setMetricsService(metricsService: PostgresqlQueryMetrics) {
    this.metricsService = metricsService;
  }

  logQuery(query: string, parameters?: any[]): void {
    // ✅ NEW: Use metadata instead of regex
    const tableNames = this.getTablesFromQuery(query);
    const hasMetadata = this.hasMetadata(query);

    // Still use your existing function for query type (or use metadata)
    const queryType = this.extractQueryType(query);

    // Your existing debug log
    this.logger.debug('Query executed', {
      queryType,
      tables: tableNames, // ✅ Now accurate!
      tableCount: tableNames.length,
      hasMetadata, // Know if from QueryBuilder or raw SQL
      sql: query.substring(0, 200),
      parameters,
    });

    // Your existing existence check detection
    const queryLower = query.toLowerCase();
    if (queryLower.includes('and (0=1)') || queryLower.includes('and (1=0)')) {
      this.logger.warn('Detected existence check query', {
        query,
        tables: tableNames, // ✅ Now includes subquery tables!
      });
    }
  }

  logQueryError(error: string | Error, query: string, _parameters?: any[]): void {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const isDuplicateKeyError = errorMessage.toLowerCase().includes('duplicate key value');

    // ✅ NEW: Use metadata instead of regex
    const tableNames = this.getTablesFromQuery(query);
    const queryType = this.extractQueryType(query);

    if (isDuplicateKeyError) {
      this.logger.warn('Failed postgres query', {
        query,
        error: errorMessage,
        queryType,
        tables: tableNames, // ✅ Accurate even for complex queries
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

    // ✅ NEW: Use metadata methods
    const allTableNames = this.getTablesFromQuery(query);
    const primaryTable = this.getPrimaryTable(query); // Gets first table or 'unknown'

    // Your existing metrics recording
    if (this.metricsService) {
      this.metricsService.recordQueryLatency({
        queryType,
        serviceName: this.serviceName,
        tableName: primaryTable, // ✅ Accurate primary table
        executionTimeMs: time,
      });
    }

    // Your existing warning log
    if (time > this.slowQueryWarningThreshold) {
      this.logger.warn('Slow postgres query detected', {
        query,
        executionTime: time,
        queryType,
        tables: allTableNames, // ✅ All tables including subqueries
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

  // ✅ Keep your existing helper (or use getQueryTypeFromSQL from metadata)
  private extractQueryType(query: string): string {
    const queryUpper = query.trim().toUpperCase();
    if (queryUpper.startsWith('SELECT')) return 'SELECT';
    if (queryUpper.startsWith('INSERT')) return 'INSERT';
    if (queryUpper.startsWith('UPDATE')) return 'UPDATE';
    if (queryUpper.startsWith('DELETE')) return 'DELETE';
    return 'UNKNOWN';
  }

  // ✅ OPTIONAL: Add fallback for raw SQL queries (if needed)
  // If you still have some raw SQL, you can keep your regex function
  // and use it as fallback:
  /*
  private getTablesWithFallback(query: string): string[] {
    let tables = this.getTablesFromQuery(query);
    
    // If metadata not available (raw SQL), fallback to regex
    if (tables.length === 0 && !this.hasMetadata(query)) {
      tables = extractAllTableNames(query); // Your old function
    }
    
    return tables;
  }
  */
}

// ============================================================================
// COMPARISON: Before vs After
// ============================================================================

/*

BEFORE (Regex-based):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Query:
  SELECT user.*, post.title 
  FROM users user 
  LEFT JOIN posts post ON post.userId = user.id 
  WHERE user.id IN (
    SELECT userId FROM orders WHERE total > 100
  )

extractAllTableNames(query):
  ['users', 'posts', 'orders']  ✅ Works for this simple case

BUT FOR COMPLEX QUERIES:

Query:
  WITH active_users AS (
    SELECT id FROM users WHERE active = true
  )
  SELECT o.* FROM orders o
  WHERE o.userId IN (SELECT id FROM active_users)
    AND o.productId IN (
      SELECT p.id FROM products p 
      WHERE p.category = 'electronics'
    )

extractAllTableNames(query):
  ['orders', 'products']  ❌ MISSES 'users' and 'active_users' (CTE)


AFTER (Metadata-based):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Same complex query above:

this.getTablesFromQuery(query):
  ['orders', 'users', 'active_users', 'products']  ✅ ALL TABLES!

Why? Because it was built with QueryBuilder:
  repo.createQueryBuilder('o')
    .addCommonTableExpression(
      qb => qb.select('id').from(User, 'user').where(...),
      'active_users'
    )
    .where(qb => {
      const sub1 = qb.subQuery().select('id').from('active_users', 'au');
      const sub2 = qb.subQuery().select('p.id').from(Product, 'p').where(...);
      return ...
    })

The library extracts metadata from the builder's expressionMap!

*/

// ============================================================================
// MIGRATION STEPS
// ============================================================================

/*

1. Install the library:
   npm install typeorm-query-hooks

2. Create QueryHooksModule (see STEP 1 above):
   - Add QueryHooksInitializer
   - Call enableQueryHooks() in onModuleInit
   - Register TableExtractorPlugin and QueryMetadataRegistryPlugin

3. Update PostgresqlQueryLogger (see STEP 2 above):
   - Extend BaseQueryLogger instead of implementing TypeOrmLogger
   - Replace extractAllTableNames() with this.getTablesFromQuery()
   - Replace extractTableName() with this.getPrimaryTable()
   - Keep extractQueryType() or use getQueryTypeFromSQL()

4. Update your database module:
   - Import QueryHooksModule
   - Ensure it's loaded before TypeORM

5. Test:
   - Run your app
   - Check logs - you should see accurate table extraction
   - Especially for complex queries with subqueries/CTEs

6. Optional cleanup:
   - Remove old query-utils.ts functions if no longer needed
   - Or keep them as fallback for raw SQL

*/

// ============================================================================
// EXAMPLE USAGE IN YOUR APP
// ============================================================================

/*

// entities/user.entity.ts
@Entity('users')
class User {
  @PrimaryGeneratedColumn()
  id: number;
  
  @Column()
  name: string;
  
  @OneToMany(() => Order, order => order.user)
  orders: Order[];
}

// entities/order.entity.ts
@Entity('orders')
class Order {
  @PrimaryGeneratedColumn()
  id: number;
  
  @Column()
  total: number;
  
  @ManyToOne(() => User, user => user.orders)
  user: User;
}

// services/user.service.ts
@Injectable()
class UserService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
  ) {}

  async findBigSpenders(minTotal: number) {
    // Complex query with subquery
    const users = await this.userRepo
      .createQueryBuilder('user')
      .where(qb => {
        const subQuery = qb
          .subQuery()
          .select('order.userId')
          .from(Order, 'order')
          .where('order.total > :minTotal', { minTotal })
          .getQuery();
        return 'user.id IN ' + subQuery;
      })
      .getMany();
    
    // Your Logger will receive:
    // tables: ['users', 'orders']  ✅ ACCURATE!
    // Even though regex might miss 'orders' in the subquery
    
    return users;
  }
}

// When the query executes, your logger.logQuery() receives:
// - query: "SELECT user.* FROM users user WHERE user.id IN (SELECT order.userId ...)"
// - this.getTablesFromQuery(query) returns: ['users', 'orders']
// - this.hasMetadata(query) returns: true
// - Metrics recorded with correct table name!

*/

export { PostgresqlQueryLogger, QueryHooksModule };

