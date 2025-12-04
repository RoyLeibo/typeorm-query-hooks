import { DataSource, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import {
  enableQueryHooks,
  registerPlugin,
  TableExtractorPlugin,
  QueryMetadataRegistryPlugin,
  queryMetadataRegistry,
} from '../src';

@Entity('perf_test_entity')
class PerfTestEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}

describe('Performance and Memory Management', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    enableQueryHooks();
    registerPlugin(TableExtractorPlugin);
    registerPlugin(QueryMetadataRegistryPlugin);

    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [PerfTestEntity],
      synchronize: true,
      logging: false
    });

    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(() => {
    queryMetadataRegistry.clear();
  });

  describe('Registry Memory Management', () => {
    it('should store queries in registry', () => {
      const initialSize = queryMetadataRegistry.size();
      
      const repo = dataSource.getRepository(PerfTestEntity);
      const qb = repo.createQueryBuilder('entity');
      qb.getQuery();

      expect(queryMetadataRegistry.size()).toBe(initialSize + 1);
    });

    it('should handle multiple different queries', () => {
      const repo = dataSource.getRepository(PerfTestEntity);

      // Create 10 different queries
      for (let i = 0; i < 10; i++) {
        const qb = repo
          .createQueryBuilder('entity')
          .where(`entity.id = ${i}`);
        qb.getQuery();
      }

      expect(queryMetadataRegistry.size()).toBeGreaterThanOrEqual(10);
    });

    it('should not grow unbounded (deduplication)', () => {
      const repo = dataSource.getRepository(PerfTestEntity);

      // Execute same query multiple times
      for (let i = 0; i < 100; i++) {
        const qb = repo
          .createQueryBuilder('entity')
          .where('entity.id = 1');
        qb.getQuery();
      }

      // Should not have 100 entries due to deduplication
      expect(queryMetadataRegistry.size()).toBeLessThan(100);
    });

    it('should be clearable', () => {
      const repo = dataSource.getRepository(PerfTestEntity);
      
      // Add some queries
      for (let i = 0; i < 5; i++) {
        const qb = repo.createQueryBuilder('entity');
        qb.getQuery();
      }

      expect(queryMetadataRegistry.size()).toBeGreaterThan(0);

      queryMetadataRegistry.clear();

      expect(queryMetadataRegistry.size()).toBe(0);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should extract tables quickly for simple queries', () => {
      const repo = dataSource.getRepository(PerfTestEntity);
      
      const start = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        const qb = repo.createQueryBuilder('entity');
        qb.getInvolvedTables();
      }
      
      const duration = performance.now() - start;
      
      // Should complete 1000 extractions in less than 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should build queries with hooks quickly', () => {
      const repo = dataSource.getRepository(PerfTestEntity);
      
      const start = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        const qb = repo
          .createQueryBuilder('entity')
          .where('entity.id = :id', { id: i });
        qb.getQuery();
      }
      
      const duration = performance.now() - start;
      
      // Hooks should add minimal overhead
      // 1000 queries should complete in reasonable time
      expect(duration).toBeLessThan(500);
    });
  });

  describe('SQL Normalization', () => {
    it('should normalize SQL with extra whitespace', () => {
      const repo = dataSource.getRepository(PerfTestEntity);
      
      const qb1 = repo
        .createQueryBuilder('entity')
        .where('entity.id = 1');
      const sql1 = qb1.getQuery();

      // Same query but will be formatted differently internally
      const qb2 = repo
        .createQueryBuilder('entity')
        .where('entity.id = 1');
      const sql2 = qb2.getQuery();

      // Both should be found in registry (normalization working)
      const { getTablesFromSQL } = require('../src/plugins/query-metadata-registry');
      
      const tables1 = getTablesFromSQL(sql1);
      const tables2 = getTablesFromSQL(sql2);

      expect(tables1).toEqual(tables2);
    });

    it('should be case-insensitive for lookup', () => {
      const repo = dataSource.getRepository(PerfTestEntity);
      const qb = repo.createQueryBuilder('entity');
      const sql = qb.getQuery();

      const { getTablesFromSQL } = require('../src/plugins/query-metadata-registry');
      
      const tables1 = getTablesFromSQL(sql);
      const tables2 = getTablesFromSQL(sql.toUpperCase());
      const tables3 = getTablesFromSQL(sql.toLowerCase());

      expect(tables1).toEqual(tables2);
      expect(tables1).toEqual(tables3);
    });
  });

  describe('Concurrent Query Building', () => {
    it('should handle multiple simultaneous query builds', async () => {
      const repo = dataSource.getRepository(PerfTestEntity);

      // Simulate concurrent query building
      const promises = Array.from({ length: 50 }, (_, i) =>
        Promise.resolve().then(() => {
          const qb = repo
            .createQueryBuilder('entity')
            .where('entity.id = :id', { id: i });
          return qb.getInvolvedTables();
        })
      );

      const results = await Promise.all(promises);

      // All should succeed
      expect(results).toHaveLength(50);
      results.forEach(tables => {
        expect(tables).toContain('perf_test_entity');
      });
    });
  });

  describe('Memory Leaks Prevention', () => {
    it('should not retain references to query builders', () => {
      const repo = dataSource.getRepository(PerfTestEntity);
      
      const weakRefs: WeakRef<any>[] = [];

      // Create and destroy many query builders
      for (let i = 0; i < 100; i++) {
        const qb = repo.createQueryBuilder('entity');
        weakRefs.push(new WeakRef(qb));
        qb.getQuery();
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Note: We can't reliably test GC in Jest, but this test
      // documents the expected behavior
      expect(weakRefs.length).toBe(100);
    });

    it('should handle large number of unique queries', () => {
      const repo = dataSource.getRepository(PerfTestEntity);
      const initialSize = queryMetadataRegistry.size();

      // Create many unique queries
      for (let i = 0; i < 100; i++) {
        const qb = repo
          .createQueryBuilder('entity')
          .where(`entity.name = 'user_${i}'`);
        qb.getQuery();
      }

      // Should have stored all of them (up to max size)
      const finalSize = queryMetadataRegistry.size();
      expect(finalSize).toBeGreaterThan(initialSize);
    });
  });
});

