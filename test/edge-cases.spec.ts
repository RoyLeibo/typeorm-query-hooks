import { DataSource, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import {
  enableQueryHooks,
  registerPlugin,
  unregisterPlugin,
  getRegisteredPlugins,
  TableExtractorPlugin,
  QueryHookPlugin,
  extractTablesFromBuilder,
} from '../src';

@Entity('edge_case_entity')
class EdgeCaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}

describe('Edge Cases and Error Handling', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [EdgeCaseEntity],
      synchronize: true,
      logging: false
    });

    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(() => {
    // Clear plugins
    const plugins = getRegisteredPlugins();
    plugins.forEach(p => unregisterPlugin(p.name));
  });

  describe('extractTablesFromBuilder', () => {
    beforeEach(() => {
      enableQueryHooks();
      registerPlugin(TableExtractorPlugin);
    });

    it('should handle builder with no expressionMap', () => {
      const mockBuilder: any = {};
      const tables = extractTablesFromBuilder(mockBuilder);
      expect(tables).toEqual([]);
    });

    it('should handle builder with null expressionMap', () => {
      const mockBuilder: any = { expressionMap: null };
      const tables = extractTablesFromBuilder(mockBuilder);
      expect(tables).toEqual([]);
    });

    it('should handle builder with undefined mainAlias', () => {
      const mockBuilder: any = {
        expressionMap: {
          mainAlias: undefined,
          joinAttributes: [],
          aliases: []
        }
      };
      const tables = extractTablesFromBuilder(mockBuilder);
      expect(tables).toEqual([]);
    });

    it('should handle builder with null metadata', () => {
      const mockBuilder: any = {
        expressionMap: {
          mainAlias: { metadata: null }
        }
      };
      const tables = extractTablesFromBuilder(mockBuilder);
      expect(tables).toEqual([]);
    });

    it('should handle empty arrays', () => {
      const mockBuilder: any = {
        expressionMap: {
          mainAlias: null,
          joinAttributes: [],
          aliases: [],
          commonTableExpressions: [],
          wheres: [],
          selects: []
        }
      };
      const tables = extractTablesFromBuilder(mockBuilder);
      expect(tables).toEqual([]);
    });

    it('should deduplicate table names', () => {
      const repo = dataSource.getRepository(EdgeCaseEntity);
      const qb = repo
        .createQueryBuilder('entity1')
        .leftJoin(EdgeCaseEntity, 'entity2', 'entity2.id = entity1.id')
        .leftJoin(EdgeCaseEntity, 'entity3', 'entity3.id = entity1.id');

      const tables = qb.getInvolvedTables();
      
      // Should only have unique table names
      const uniqueTables = [...new Set(tables)];
      expect(tables.length).toBe(uniqueTables.length);
      expect(tables).toContain('edge_case_entity');
    });

    it('should handle query builder with only SELECT expression', () => {
      const qb = dataSource
        .createQueryBuilder()
        .select('1 + 1', 'result');

      const tables = (qb as any).getInvolvedTables?.() || [];
      expect(Array.isArray(tables)).toBe(true);
    });
  });

  describe('Plugin Error Handling', () => {
    it('should handle plugin that throws during onRegister', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const errorPlugin: QueryHookPlugin = {
        name: 'ErrorOnRegister',
        onRegister: () => {
          throw new Error('Registration failed');
        }
      };

      expect(() => registerPlugin(errorPlugin)).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should handle plugin that throws during onEnable', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      enableQueryHooks();

      const errorPlugin: QueryHookPlugin = {
        name: 'ErrorOnEnable',
        onEnable: () => {
          throw new Error('Enable failed');
        }
      };

      expect(() => registerPlugin(errorPlugin)).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should handle plugin that throws during onQueryBuild', () => {
      enableQueryHooks();

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const errorPlugin: QueryHookPlugin = {
        name: 'ErrorOnQueryBuild',
        onQueryBuild: () => {
          throw new Error('Query build failed');
        }
      };

      registerPlugin(errorPlugin);

      const repo = dataSource.getRepository(EdgeCaseEntity);
      const qb = repo.createQueryBuilder('entity');

      // Should not throw, just warn
      expect(() => qb.getQuery()).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should continue executing other plugins when one fails', () => {
      enableQueryHooks();
      registerPlugin(TableExtractorPlugin);

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const successCallback = jest.fn();

      const errorPlugin: QueryHookPlugin = {
        name: 'ErrorPlugin',
        onQueryBuild: () => {
          throw new Error('Fail');
        }
      };

      const successPlugin: QueryHookPlugin = {
        name: 'SuccessPlugin',
        onQueryBuild: successCallback
      };

      registerPlugin(errorPlugin);
      registerPlugin(successPlugin);

      const repo = dataSource.getRepository(EdgeCaseEntity);
      const qb = repo.createQueryBuilder('entity');
      qb.getQuery();

      // Success plugin should have been called despite error plugin failing
      expect(successCallback).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Double Initialization', () => {
    it('should warn when enabling hooks multiple times', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      enableQueryHooks();
      enableQueryHooks(); // Second call

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('already enabled')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should not add methods twice to prototypes', () => {
      enableQueryHooks();
      registerPlugin(TableExtractorPlugin);
      registerPlugin(TableExtractorPlugin); // Register twice

      const repo = dataSource.getRepository(EdgeCaseEntity);
      const qb = repo.createQueryBuilder('entity');

      // Should work normally, not break
      const tables = qb.getInvolvedTables();
      expect(tables).toContain('edge_case_entity');
    });
  });

  describe('Unregister Plugin', () => {
    it('should return false when unregistering non-existent plugin', () => {
      const result = unregisterPlugin('NonExistentPlugin');
      expect(result).toBe(false);
    });

    it('should successfully unregister existing plugin', () => {
      const plugin: QueryHookPlugin = { name: 'TestPlugin' };
      registerPlugin(plugin);

      expect(getRegisteredPlugins()).toHaveLength(1);

      const result = unregisterPlugin('TestPlugin');
      expect(result).toBe(true);
      expect(getRegisteredPlugins()).toHaveLength(0);
    });
  });

  describe('Special Characters in SQL', () => {
    it('should handle queries with special characters', () => {
      enableQueryHooks();
      registerPlugin(TableExtractorPlugin);

      const repo = dataSource.getRepository(EdgeCaseEntity);
      const qb = repo
        .createQueryBuilder('entity')
        .where("entity.name = 'O''Reilly'"); // SQL with apostrophe

      const tables = qb.getInvolvedTables();
      expect(tables).toContain('edge_case_entity');
    });

    it('should handle queries with newlines and tabs', () => {
      enableQueryHooks();
      registerPlugin(TableExtractorPlugin);

      const repo = dataSource.getRepository(EdgeCaseEntity);
      const qb = repo
        .createQueryBuilder('entity')
        .where('entity.name = :name', { name: 'test\n\ttab' });

      const tables = qb.getInvolvedTables();
      expect(tables).toContain('edge_case_entity');
    });
  });

  describe('Empty and Null Values', () => {
    it('should handle empty WHERE clause', () => {
      enableQueryHooks();
      registerPlugin(TableExtractorPlugin);

      const repo = dataSource.getRepository(EdgeCaseEntity);
      const qb = repo.createQueryBuilder('entity').where('');

      const tables = qb.getInvolvedTables();
      expect(tables).toContain('edge_case_entity');
    });

    it('should handle NULL parameters', () => {
      enableQueryHooks();
      registerPlugin(TableExtractorPlugin);

      const repo = dataSource.getRepository(EdgeCaseEntity);
      const qb = repo
        .createQueryBuilder('entity')
        .where('entity.name IS NULL');

      const tables = qb.getInvolvedTables();
      expect(tables).toContain('edge_case_entity');
    });
  });

  describe('Complex Alias Scenarios', () => {
    it('should handle alias without metadata but with tablePath', () => {
      const mockBuilder: any = {
        expressionMap: {
          mainAlias: {
            tablePath: 'custom_table'
          }
        }
      };

      const tables = extractTablesFromBuilder(mockBuilder);
      expect(tables).toContain('custom_table');
    });

    it('should handle alias with only tableName property', () => {
      const mockBuilder: any = {
        expressionMap: {
          mainAlias: {
            tableName: 'direct_table_name'
          }
        }
      };

      const tables = extractTablesFromBuilder(mockBuilder);
      expect(tables).toContain('direct_table_name');
    });

    it('should skip aliases with no useful properties', () => {
      const mockBuilder: any = {
        expressionMap: {
          mainAlias: {
            someOtherProperty: 'value'
          }
        }
      };

      const tables = extractTablesFromBuilder(mockBuilder);
      expect(tables).toEqual([]);
    });
  });
});

