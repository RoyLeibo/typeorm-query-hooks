import { DataSource, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import {
  enableQueryHooks,
  registerPlugin,
  QueryTypeDetectorPlugin,
  extractQueryTypeFromBuilder,
  extractQueryTypeFromSQL,
  getQueryType,
  isDDL,
  isDML,
  isTransaction
} from '../src';

@Entity('query_type_test_entity')
class QueryTypeTestEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}

describe('QueryTypeDetector Plugin', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    enableQueryHooks();

    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [QueryTypeTestEntity],
      synchronize: true,
      logging: false
    });

    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('extractQueryTypeFromBuilder', () => {
    it('should extract SELECT from QueryBuilder', () => {
      const repo = dataSource.getRepository(QueryTypeTestEntity);
      const qb = repo.createQueryBuilder('entity');
      
      const type = extractQueryTypeFromBuilder(qb);
      expect(type).toBe('SELECT');
    });

    it('should extract INSERT from QueryBuilder', () => {
      const repo = dataSource.getRepository(QueryTypeTestEntity);
      const qb = repo.createQueryBuilder()
        .insert()
        .into(QueryTypeTestEntity)
        .values({ name: 'Test' });
      
      const type = extractQueryTypeFromBuilder(qb);
      expect(type).toBe('INSERT');
    });

    it('should extract UPDATE from QueryBuilder', () => {
      const repo = dataSource.getRepository(QueryTypeTestEntity);
      const qb = repo.createQueryBuilder()
        .update(QueryTypeTestEntity)
        .set({ name: 'Updated' })
        .where('id = :id', { id: 1 });
      
      const type = extractQueryTypeFromBuilder(qb);
      expect(type).toBe('UPDATE');
    });

    it('should extract DELETE from QueryBuilder', () => {
      const repo = dataSource.getRepository(QueryTypeTestEntity);
      const qb = repo.createQueryBuilder()
        .delete()
        .from(QueryTypeTestEntity)
        .where('id = :id', { id: 1 });
      
      const type = extractQueryTypeFromBuilder(qb);
      expect(type).toBe('DELETE');
    });
  });

  describe('extractQueryTypeFromSQL', () => {
    it('should detect SELECT queries', () => {
      expect(extractQueryTypeFromSQL('SELECT * FROM users')).toBe('SELECT');
      expect(extractQueryTypeFromSQL('  select * from users')).toBe('SELECT');
    });

    it('should detect INSERT queries', () => {
      expect(extractQueryTypeFromSQL('INSERT INTO users VALUES (1)')).toBe('INSERT');
      expect(extractQueryTypeFromSQL('  insert into users values (1)')).toBe('INSERT');
    });

    it('should detect UPDATE queries', () => {
      expect(extractQueryTypeFromSQL('UPDATE users SET name = "test"')).toBe('UPDATE');
      expect(extractQueryTypeFromSQL('  update users set name = "test"')).toBe('UPDATE');
    });

    it('should detect DELETE queries', () => {
      expect(extractQueryTypeFromSQL('DELETE FROM users WHERE id = 1')).toBe('DELETE');
      expect(extractQueryTypeFromSQL('  delete from users where id = 1')).toBe('DELETE');
    });

    it('should detect DDL operations', () => {
      expect(extractQueryTypeFromSQL('CREATE TABLE users (id INT)')).toBe('CREATE');
      expect(extractQueryTypeFromSQL('ALTER TABLE users ADD COLUMN name')).toBe('ALTER');
      expect(extractQueryTypeFromSQL('DROP TABLE users')).toBe('DROP');
      expect(extractQueryTypeFromSQL('TRUNCATE TABLE users')).toBe('TRUNCATE');
    });

    it('should detect transaction control', () => {
      expect(extractQueryTypeFromSQL('BEGIN TRANSACTION')).toBe('BEGIN');
      expect(extractQueryTypeFromSQL('COMMIT')).toBe('COMMIT');
      expect(extractQueryTypeFromSQL('ROLLBACK')).toBe('ROLLBACK');
    });

    it('should detect WITH queries', () => {
      expect(extractQueryTypeFromSQL('WITH cte AS (SELECT * FROM users) SELECT * FROM cte')).toBe('WITH');
    });

    it('should return OTHER for unknown queries', () => {
      expect(extractQueryTypeFromSQL('EXPLAIN SELECT * FROM users')).toBe('OTHER');
      expect(extractQueryTypeFromSQL('')).toBe('OTHER');
    });
  });

  describe('Plugin callbacks', () => {
    it('should call onSelect for SELECT queries', async () => {
      const onSelect = jest.fn();
      
      registerPlugin(QueryTypeDetectorPlugin({
        onSelect
      }));

      const repo = dataSource.getRepository(QueryTypeTestEntity);
      await repo.find();

      expect(onSelect).toHaveBeenCalled();
      expect(onSelect.mock.calls[0][0].queryType).toBe('SELECT');
    });

    it('should call onInsert for INSERT queries', async () => {
      const onInsert = jest.fn();
      
      registerPlugin(QueryTypeDetectorPlugin({
        onInsert
      }));

      const repo = dataSource.getRepository(QueryTypeTestEntity);
      await repo.insert({ name: 'Test Insert' });

      expect(onInsert).toHaveBeenCalled();
      expect(onInsert.mock.calls[0][0].queryType).toBe('INSERT');
    });

    it('should call onUpdate for UPDATE queries', async () => {
      const onUpdate = jest.fn();
      
      registerPlugin(QueryTypeDetectorPlugin({
        onUpdate
      }));

      const repo = dataSource.getRepository(QueryTypeTestEntity);
      const result = await repo.insert({ name: 'Test Update' });
      await repo.update(result.identifiers[0].id, { name: 'Updated' });

      expect(onUpdate).toHaveBeenCalled();
      expect(onUpdate.mock.calls[0][0].queryType).toBe('UPDATE');
    });

    it('should call onDelete for DELETE queries', async () => {
      const onDelete = jest.fn();
      
      registerPlugin(QueryTypeDetectorPlugin({
        onDelete
      }));

      const repo = dataSource.getRepository(QueryTypeTestEntity);
      const result = await repo.insert({ name: 'Test Delete' });
      await repo.delete(result.identifiers[0].id);

      expect(onDelete).toHaveBeenCalled();
      expect(onDelete.mock.calls[0][0].queryType).toBe('DELETE');
    });

    it('should call onQueryType for all queries', async () => {
      const onQueryType = jest.fn();
      
      registerPlugin(QueryTypeDetectorPlugin({
        onQueryType
      }));

      const repo = dataSource.getRepository(QueryTypeTestEntity);
      await repo.find();

      expect(onQueryType).toHaveBeenCalled();
      expect(onQueryType.mock.calls[0][0].queryType).toBe('SELECT');
    });
  });

  describe('monitorTypes filter', () => {
    it('should only monitor specified query types', async () => {
      const onQueryType = jest.fn();
      
      registerPlugin(QueryTypeDetectorPlugin({
        monitorTypes: ['INSERT', 'UPDATE', 'DELETE'],
        onQueryType
      }));

      const repo = dataSource.getRepository(QueryTypeTestEntity);
      
      // This should NOT trigger the callback (SELECT not monitored)
      await repo.find();
      expect(onQueryType).not.toHaveBeenCalled();

      // This SHOULD trigger the callback (INSERT is monitored)
      await repo.insert({ name: 'Test' });
      expect(onQueryType).toHaveBeenCalled();
      expect(onQueryType.mock.calls[0][0].queryType).toBe('INSERT');
    });
  });

  describe('enableLogging', () => {
    it('should log query types when enabled', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      
      registerPlugin(QueryTypeDetectorPlugin({
        enableLogging: true
      }));

      const repo = dataSource.getRepository(QueryTypeTestEntity);
      await repo.find();

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls.some(call => 
        call[0].includes('[QueryTypeDetector]')
      )).toBe(true);

      consoleLogSpy.mockRestore();
    });
  });

  describe('Helper functions', () => {
    it('isDML should identify DML operations', () => {
      expect(isDML('SELECT')).toBe(true);
      expect(isDML('INSERT')).toBe(true);
      expect(isDML('UPDATE')).toBe(true);
      expect(isDML('DELETE')).toBe(true);
      expect(isDML('CREATE')).toBe(false);
      expect(isDML('COMMIT')).toBe(false);
    });

    it('isDDL should identify DDL operations', () => {
      expect(isDDL('CREATE')).toBe(true);
      expect(isDDL('ALTER')).toBe(true);
      expect(isDDL('DROP')).toBe(true);
      expect(isDDL('TRUNCATE')).toBe(true);
      expect(isDDL('SELECT')).toBe(false);
      expect(isDDL('COMMIT')).toBe(false);
    });

    it('isTransaction should identify transaction control', () => {
      expect(isTransaction('BEGIN')).toBe(true);
      expect(isTransaction('COMMIT')).toBe(true);
      expect(isTransaction('ROLLBACK')).toBe(true);
      expect(isTransaction('SELECT')).toBe(false);
      expect(isTransaction('CREATE')).toBe(false);
    });
  });

  describe('getQueryType integration', () => {
    it('should prioritize expressionMap over SQL parsing', () => {
      const repo = dataSource.getRepository(QueryTypeTestEntity);
      const qb = repo.createQueryBuilder('entity');
      
      const context = {
        builder: qb,
        sql: 'INSERT INTO test VALUES (1)', // Misleading SQL
        timestamp: new Date(),
        parameters: [],
        methodName: 'getMany',
        executionTime: 10
      };

      // Should use expressionMap (SELECT) not SQL parsing (INSERT)
      const type = getQueryType(context);
      expect(type).toBe('SELECT');
    });

    it('should fall back to SQL parsing when builder unavailable', () => {
      const context = {
        builder: undefined as any,
        sql: 'INSERT INTO test VALUES (1)',
        timestamp: new Date(),
        parameters: [],
        methodName: 'query',
        executionTime: 10
      };

      const type = getQueryType(context);
      expect(type).toBe('INSERT');
    });
  });

  describe('Context information', () => {
    it('should provide complete context to callbacks', async () => {
      let capturedContext: any;
      
      registerPlugin(QueryTypeDetectorPlugin({
        onSelect: (context) => {
          capturedContext = context;
        }
      }));

      const repo = dataSource.getRepository(QueryTypeTestEntity);
      await repo.find();

      expect(capturedContext).toBeDefined();
      expect(capturedContext.queryType).toBe('SELECT');
      expect(capturedContext.sql).toBeDefined();
      expect(capturedContext.executionTime).toBeGreaterThanOrEqual(0);
      expect(capturedContext.methodName).toBeDefined();
      expect(capturedContext.builder).toBeDefined();
    });
  });
});

