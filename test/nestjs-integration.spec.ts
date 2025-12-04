import { DataSource, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import {
  enableQueryHooks,
  registerPlugin,
  TableExtractorPlugin,
  QueryMetadataRegistryPlugin,
  BaseQueryLogger,
  QueryMetadataService,
} from '../src';

@Entity('nestjs_test_users')
class NestJSTestUser {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}

describe('NestJS Integration', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    enableQueryHooks();
    registerPlugin(TableExtractorPlugin);
    registerPlugin(QueryMetadataRegistryPlugin);

    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [NestJSTestUser],
      synchronize: true,
      logging: false
    });

    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('BaseQueryLogger', () => {
    class TestLogger extends BaseQueryLogger {
      public logQueryCalls: any[] = [];
      public logQueryErrorCalls: any[] = [];
      public logQuerySlowCalls: any[] = [];

      logQuery(query: string, parameters?: any[]): void {
        this.logQueryCalls.push({ query, parameters });
      }

      logQueryError(error: string | Error, query: string, parameters?: any[]): void {
        this.logQueryErrorCalls.push({ error, query, parameters });
      }

      logQuerySlow(time: number, query: string, parameters?: any[]): void {
        this.logQuerySlowCalls.push({ time, query, parameters });
      }

      logSchemaBuild(_message: string): void {}
      logMigration(_message: string): void {}
      log(_level: 'log' | 'info' | 'warn', _message: any): void {}
    }

    it('should provide getTablesFromQuery method', () => {
      const logger = new TestLogger();
      const repo = dataSource.getRepository(NestJSTestUser);
      const qb = repo.createQueryBuilder('user');
      const sql = qb.getQuery();

      const tables = logger['getTablesFromQuery'](sql);
      expect(tables).toContain('nestjs_test_users');
    });

    it('should provide hasMetadata method', () => {
      const logger = new TestLogger();
      const repo = dataSource.getRepository(NestJSTestUser);
      const qb = repo.createQueryBuilder('user');
      const sql = qb.getQuery();

      expect(logger['hasMetadata'](sql)).toBe(true);
      expect(logger['hasMetadata']('SELECT * FROM unknown')).toBe(false);
    });

    it('should provide getPrimaryTable method', () => {
      const logger = new TestLogger();
      const repo = dataSource.getRepository(NestJSTestUser);
      const qb = repo.createQueryBuilder('user');
      const sql = qb.getQuery();

      const primaryTable = logger['getPrimaryTable'](sql);
      expect(primaryTable).toBe('nestjs_test_users');
    });

    it('should return "unknown" for getPrimaryTable when no metadata', () => {
      const logger = new TestLogger();
      const primaryTable = logger['getPrimaryTable']('SELECT * FROM nowhere');
      expect(primaryTable).toBe('unknown');
    });

    it('should be usable as TypeORM Logger', () => {
      const logger = new TestLogger();

      logger.logQuery('SELECT * FROM users');
      expect(logger.logQueryCalls).toHaveLength(1);

      logger.logQueryError(new Error('test'), 'SELECT * FROM users');
      expect(logger.logQueryErrorCalls).toHaveLength(1);

      logger.logQuerySlow(1000, 'SELECT * FROM users');
      expect(logger.logQuerySlowCalls).toHaveLength(1);
    });
  });

  describe('QueryMetadataService', () => {
    let service: QueryMetadataService;

    beforeEach(() => {
      service = new QueryMetadataService();
    });

    it('should be instantiable', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(QueryMetadataService);
    });

    it('should provide getTablesFromQuery method', () => {
      const repo = dataSource.getRepository(NestJSTestUser);
      const qb = repo.createQueryBuilder('user');
      const sql = qb.getQuery();

      const tables = service.getTablesFromQuery(sql);
      expect(tables).toContain('nestjs_test_users');
    });

    it('should provide hasMetadata method', () => {
      const repo = dataSource.getRepository(NestJSTestUser);
      const qb = repo.createQueryBuilder('user');
      const sql = qb.getQuery();

      expect(service.hasMetadata(sql)).toBe(true);
      expect(service.hasMetadata('unknown query')).toBe(false);
    });

    it('should provide getPrimaryTable method', () => {
      const repo = dataSource.getRepository(NestJSTestUser);
      const qb = repo.createQueryBuilder('user');
      const sql = qb.getQuery();

      const primaryTable = service.getPrimaryTable(sql);
      expect(primaryTable).toBe('nestjs_test_users');
    });

    it('should return "unknown" when no tables found', () => {
      const primaryTable = service.getPrimaryTable('invalid sql');
      expect(primaryTable).toBe('unknown');
    });

    it('should provide getTableInfo method', () => {
      const repo = dataSource.getRepository(NestJSTestUser);
      const qb = repo.createQueryBuilder('user');
      const sql = qb.getQuery();

      const info = service.getTableInfo(sql);
      expect(info).toEqual({
        tables: ['nestjs_test_users'],
        count: 1
      });
    });

    it('should return empty info for unknown queries', () => {
      const info = service.getTableInfo('unknown');
      expect(info).toEqual({
        tables: [],
        count: 0
      });
    });
  });
});

