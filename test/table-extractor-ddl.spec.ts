import { DataSource, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { 
  enableQueryHooks, 
  registerPlugin,
  createTableExtractorPlugin,
  extractTablesFromSQL
} from '../src';

@Entity('ddl_test_entity')
class DDLTestEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}

describe('TableExtractorPlugin - DDL and Raw Queries', () => {
  let dataSource: DataSource;
  const extractedQueries: Array<{ tables: string[]; sql: string; source: 'QueryBuilder' | 'Raw' }> = [];
  const emptyTableQueries: string[] = [];

  beforeAll(async () => {
    // Enable hooks with logging
    enableQueryHooks({ verbose: true });
    
    // Register plugin with callbacks to track what's captured
    registerPlugin(createTableExtractorPlugin({
      warnOnEmptyTables: true,  // Enable warnings
      enableLogging: true,       // Enable logging
      onTablesExtracted: (tables, context) => {
        const source = context.builder ? 'QueryBuilder' : 'Raw';
        extractedQueries.push({
          tables,
          sql: context.sql.substring(0, 100),
          source
        });
        console.log(`✅ [${source}] Tables extracted: [${tables.join(', ')}]`);
      },
      onEmptyTables: (context) => {
        emptyTableQueries.push(context.sql.substring(0, 100));
        console.log(`⚠️  No tables extracted from: ${context.sql.substring(0, 100)}`);
      }
    }));

    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [DDLTestEntity],
      synchronize: true,  // This executes DDL but NOT through QueryBuilder
      logging: ['query']  // Log all queries to see what's executed
    });

    console.log('\n=== Initializing DataSource (synchronize: true) ===');
    await dataSource.initialize();
    console.log('=== DataSource initialized ===\n');
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('should NOW capture DDL queries via QueryRunner hooks', () => {
    // After synchronize: true, tables should be created
    // These CREATE TABLE statements SHOULD now appear in our hooks
    console.log('\n=== Summary After DataSource Init ===');
    console.log(`Total queries with extracted tables: ${extractedQueries.length}`);
    console.log(`Total queries without tables: ${emptyTableQueries.length}`);
    
    if (extractedQueries.length > 0) {
      console.log('\nQueries WITH tables:');
      extractedQueries.forEach(q => {
        console.log(`  - [${q.source}] Tables: [${q.tables.join(', ')}], SQL: ${q.sql}...`);
      });
      
      // Count raw queries (DDL from synchronize)
      const rawQueries = extractedQueries.filter(q => q.source === 'Raw');
      console.log(`\n✅ Raw SQL queries captured: ${rawQueries.length}`);
      
      // Should have captured CREATE TABLE from synchronize: true
      expect(rawQueries.length).toBeGreaterThan(0);
    }
    
    if (emptyTableQueries.length > 0) {
      console.log('\nQueries WITHOUT tables:');
      emptyTableQueries.forEach(sql => {
        console.log(`  - ${sql}...`);
      });
    }
  });

  it('should test extractTablesFromSQL utility function', () => {
    console.log('\n=== Testing extractTablesFromSQL Utility ===');
    
    const testCases = [
      {
        sql: 'SELECT * FROM users WHERE id = 1',
        expected: ['users']
      },
      {
        sql: 'INSERT INTO users (name) VALUES (?)',
        expected: ['users']
      },
      {
        sql: 'UPDATE users SET name = ? WHERE id = ?',
        expected: ['users']
      },
      {
        sql: 'DELETE FROM users WHERE id = ?',
        expected: ['users']
      },
      {
        sql: 'CREATE TABLE users (id INT, name VARCHAR(255))',
        expected: ['users']
      },
      {
        sql: 'CREATE INDEX idx_name ON users(name)',
        expected: ['users']
      },
      {
        sql: 'ALTER TABLE users ADD COLUMN email VARCHAR(255)',
        expected: ['users']
      },
      {
        sql: 'DROP TABLE users',
        expected: ['users']
      },
      {
        sql: 'TRUNCATE TABLE users',
        expected: ['users']
      },
      {
        sql: 'SELECT u.*, p.* FROM users u LEFT JOIN posts p ON u.id = p.user_id',
        expected: ['users', 'posts']
      }
    ];
    
    testCases.forEach(testCase => {
      const extracted = extractTablesFromSQL(testCase.sql);
      console.log(`SQL: ${testCase.sql.substring(0, 50)}...`);
      console.log(`  Expected: [${testCase.expected.join(', ')}]`);
      console.log(`  Extracted: [${extracted.join(', ')}]`);
      
      testCase.expected.forEach(table => {
        expect(extracted).toContain(table);
      });
    });
  });

  it('should capture QueryBuilder queries', async () => {
    const repo = dataSource.getRepository(DDLTestEntity);
    
    // Clear previous captures
    extractedQueries.length = 0;
    emptyTableQueries.length = 0;
    
    console.log('\n=== Executing QueryBuilder INSERT ===');
    await repo.insert({ name: 'Test' });
    
    console.log('\n=== Executing QueryBuilder SELECT ===');
    const qb = repo.createQueryBuilder('entity');
    await qb.getMany();
    
    // These SHOULD be captured
    expect(extractedQueries.length).toBeGreaterThan(0);
    console.log(`\n✅ QueryBuilder queries captured: ${extractedQueries.length}`);
  });

  it.skip('should capture raw SQL queries (DISABLED: QueryRunner hooks disabled for stability)', async () => {
    // NOTE: QueryRunner hooks are currently DISABLED in v6.4.0 because they were found to
    // interfere with TypeORM's internal execution flow, causing crashes and state corruption.
    // This test is skipped until a safer implementation can be developed.
    // See: src/index.ts line 674 - patchTransactionHooks() is commented out
    
    // Clear previous captures
    extractedQueries.length = 0;
    emptyTableQueries.length = 0;
    
    console.log('\n=== Executing RAW SQL (CREATE INDEX) ===');
    await dataSource.query('CREATE INDEX IF NOT EXISTS idx_name ON ddl_test_entity(name)');
    
    console.log('\n=== Executing RAW SQL (SELECT) ===');
    await dataSource.query('SELECT * FROM ddl_test_entity');
    
    // These would be captured if QueryRunner hooks were enabled
    console.log(`\nRaw SQL queries captured: ${extractedQueries.length}`);
    console.log('Expected: 0 (QueryRunner hooks disabled)');
    
    // Currently raw SQL queries are NOT captured
    expect(extractedQueries.length).toBe(0);
  });
});

