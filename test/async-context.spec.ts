import { DataSource, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import {
  enableQueryHooks,
  registerPlugin,
  TableExtractorPlugin,
  QueryMetadataRegistryPlugin,
  getTablesFromSQL
} from '../src';
import { queryContextStore } from '../src/context-store';

@Entity('context_test_users')
class ContextTestUser {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column()
  email!: string;
}

@Entity('context_test_posts')
class ContextTestPost {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column()
  userId!: number;
}

describe('AsyncLocalStorage Context', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    enableQueryHooks({ verbose: false });
    registerPlugin(TableExtractorPlugin);
    registerPlugin(QueryMetadataRegistryPlugin);

    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [ContextTestUser, ContextTestPost],
      synchronize: true,
      logging: false
    });

    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('Table extraction via AsyncLocalStorage', () => {
    it('should make tables available during query execution via AsyncLocalStorage', async () => {
      const repo = dataSource.getRepository(ContextTestUser);
      
      // Create a custom logger that captures context during execution
      let capturedContext: any = null;
      const originalLog = dataSource.logger.logQuery;
      dataSource.logger.logQuery = function(query: string) {
        // Capture AsyncLocalStorage context when logger is called
        capturedContext = queryContextStore.getStore();
        if (originalLog) originalLog.call(this, query, []);
      };

      await repo.find({ where: { name: 'Test' } });

      // Restore original logger
      dataSource.logger.logQuery = originalLog;

      // Verify context was captured during execution
      expect(capturedContext).toBeDefined();
      expect(capturedContext?.tables).toBeDefined();
      expect(capturedContext?.tables).toContain('context_test_users');
    });

    it('should provide tables for SELECT queries', async () => {
      const repo = dataSource.getRepository(ContextTestUser);
      let capturedTables: string[] = [];

      const originalLog = dataSource.logger.logQuery;
      dataSource.logger.logQuery = function(query: string) {
        const context = queryContextStore.getStore();
        capturedTables = context?.tables || [];
        if (originalLog) originalLog.call(this, query, []);
      };

      await repo.findOne({ where: { id: 1 } });

      dataSource.logger.logQuery = originalLog;

      expect(capturedTables).toContain('context_test_users');
    });

    it('should provide tables for INSERT queries', async () => {
      const repo = dataSource.getRepository(ContextTestUser);
      let capturedTables: string[] = [];

      const originalLog = dataSource.logger.logQuery;
      dataSource.logger.logQuery = function(query: string) {
        const context = queryContextStore.getStore();
        capturedTables = context?.tables || [];
        if (originalLog) originalLog.call(this, query, []);
      };

      await repo.insert({ name: 'John', email: 'john@example.com' });

      dataSource.logger.logQuery = originalLog;

      expect(capturedTables).toContain('context_test_users');
    });

    it('should provide tables for UPDATE queries', async () => {
      const repo = dataSource.getRepository(ContextTestUser);
      
      // First insert a record
      const result = await repo.insert({ name: 'Jane', email: 'jane@example.com' });
      const insertedId = result.identifiers[0].id;

      let capturedTables: string[] = [];

      const originalLog = dataSource.logger.logQuery;
      dataSource.logger.logQuery = function(query: string) {
        const context = queryContextStore.getStore();
        capturedTables = context?.tables || [];
        if (originalLog) originalLog.call(this, query, []);
      };

      await repo.update(insertedId, { email: 'jane.doe@example.com' });

      dataSource.logger.logQuery = originalLog;

      expect(capturedTables).toContain('context_test_users');
    });

    it('should provide tables for DELETE queries', async () => {
      const repo = dataSource.getRepository(ContextTestUser);
      
      // First insert a record
      const result = await repo.insert({ name: 'ToDelete', email: 'delete@example.com' });
      const insertedId = result.identifiers[0].id;

      let capturedTables: string[] = [];

      const originalLog = dataSource.logger.logQuery;
      dataSource.logger.logQuery = function(query: string) {
        const context = queryContextStore.getStore();
        capturedTables = context?.tables || [];
        if (originalLog) originalLog.call(this, query, []);
      };

      await repo.delete(insertedId);

      dataSource.logger.logQuery = originalLog;

      expect(capturedTables).toContain('context_test_users');
    });

    it('should provide tables for JOIN queries', async () => {
      const repo = dataSource.getRepository(ContextTestUser);
      let capturedTables: string[] = [];

      const originalLog = dataSource.logger.logQuery;
      dataSource.logger.logQuery = function(query: string) {
        const context = queryContextStore.getStore();
        capturedTables = context?.tables || [];
        if (originalLog) originalLog.call(this, query, []);
      };

      await repo
        .createQueryBuilder('user')
        .leftJoin(ContextTestPost, 'post', 'post.userId = user.id')
        .getMany();

      dataSource.logger.logQuery = originalLog;

      expect(capturedTables).toContain('context_test_users');
      expect(capturedTables).toContain('context_test_posts');
    });

    it('should provide query type in context', async () => {
      const repo = dataSource.getRepository(ContextTestUser);
      let capturedQueryType: string | undefined;

      const originalLog = dataSource.logger.logQuery;
      dataSource.logger.logQuery = function(query: string) {
        const context = queryContextStore.getStore();
        capturedQueryType = context?.queryType;
        if (originalLog) originalLog.call(this, query, []);
      };

      await repo.find();

      dataSource.logger.logQuery = originalLog;

      expect(capturedQueryType).toBe('select');
    });

    it('should provide builder reference in context', async () => {
      const repo = dataSource.getRepository(ContextTestUser);
      let capturedBuilder: any;

      const originalLog = dataSource.logger.logQuery;
      dataSource.logger.logQuery = function(query: string) {
        const context = queryContextStore.getStore();
        capturedBuilder = context?.builder;
        if (originalLog) originalLog.call(this, query, []);
      };

      await repo.find();

      dataSource.logger.logQuery = originalLog;

      expect(capturedBuilder).toBeDefined();
      expect(capturedBuilder.expressionMap).toBeDefined();
    });
  });

  describe('getTablesFromSQL integration', () => {
    it('should use AsyncLocalStorage context when available', async () => {
      const repo = dataSource.getRepository(ContextTestUser);
      let tablesFromLogger: string[] = [];

      const originalLog = dataSource.logger.logQuery;
      dataSource.logger.logQuery = function(query: string) {
        // This simulates what the PostgresqlQueryLogger does
        tablesFromLogger = getTablesFromSQL(query);
        if (originalLog) originalLog.call(this, query, []);
      };

      await repo.find({ where: { name: 'Test' } });

      dataSource.logger.logQuery = originalLog;

      // getTablesFromSQL should have found tables from AsyncLocalStorage
      expect(tablesFromLogger).toContain('context_test_users');
    });

    it('should return empty array for raw SQL with no context', () => {
      // When called outside of execution context with SQL that's not in registry
      const uniqueSql = `START TRANSACTION /* ${Date.now()} */`;
      const tables = getTablesFromSQL(uniqueSql);
      expect(tables).toEqual([]);
    });

    it('should handle multiple concurrent queries with correct context isolation', async () => {
      const repo = dataSource.getRepository(ContextTestUser);
      const results: { queryNum: number; tables: string[] }[] = [];

      const originalLog = dataSource.logger.logQuery;
      let queryNum = 0;
      dataSource.logger.logQuery = function(query: string) {
        queryNum++;
        const context = queryContextStore.getStore();
        results.push({
          queryNum,
          tables: context?.tables || []
        });
        if (originalLog) originalLog.call(this, query, []);
      };

      // Run multiple queries concurrently
      await Promise.all([
        repo.find({ where: { name: 'User1' } }),
        repo.find({ where: { name: 'User2' } }),
        repo.find({ where: { name: 'User3' } })
      ]);

      dataSource.logger.logQuery = originalLog;

      // All queries should have captured the correct context
      results.forEach(result => {
        expect(result.tables).toContain('context_test_users');
      });
    });
  });

  describe('Error handling', () => {
    it('should handle queries even if context extraction fails', async () => {
      const repo = dataSource.getRepository(ContextTestUser);

      // Should not throw even if there are issues with context
      await expect(repo.find()).resolves.toBeDefined();
    });

    it('should return empty array from getTablesFromSQL when context is unavailable', () => {
      // Call outside of any execution context with SQL that's not in registry
      const uniqueSql = `SELECT * FROM unknown_table_${Date.now()}`;
      const tables = getTablesFromSQL(uniqueSql);
      expect(tables).toEqual([]);
    });
  });

  describe('Context lifecycle', () => {
    it('should clean up context after query completes', async () => {
      const repo = dataSource.getRepository(ContextTestUser);

      // Execute query
      await repo.find();

      // Context should not be available outside of execution
      const context = queryContextStore.getStore();
      expect(context).toBeUndefined();
    });

    it('should provide fresh context for each query', async () => {
      const repo = dataSource.getRepository(ContextTestUser);
      const capturedContexts: any[] = [];

      const originalLog = dataSource.logger.logQuery;
      dataSource.logger.logQuery = function(query: string) {
        capturedContexts.push(queryContextStore.getStore());
        if (originalLog) originalLog.call(this, query, []);
      };

      // Execute two separate queries
      await repo.find({ where: { name: 'First' } });
      await repo.find({ where: { name: 'Second' } });

      dataSource.logger.logQuery = originalLog;

      // Should have captured two different contexts
      expect(capturedContexts.length).toBeGreaterThanOrEqual(2);
      expect(capturedContexts[0]).toBeDefined();
      expect(capturedContexts[1]).toBeDefined();
      
      // Each should have valid tables
      expect(capturedContexts[0].tables).toContain('context_test_users');
      expect(capturedContexts[1].tables).toContain('context_test_users');
    });
  });
});

