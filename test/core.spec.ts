import { DataSource, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import {
  enableQueryHooks,
  registerPlugin,
  unregisterPlugin,
  getRegisteredPlugins,
  isHooksEnabled,
  QueryHookPlugin,
  QueryHookContext
} from '../src';

@Entity('core_test_entity')
class CoreTestEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}

describe('Core Hook System', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [CoreTestEntity],
      synchronize: true,
      logging: false
    });

    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(() => {
    // Clear all plugins before each test
    const plugins = getRegisteredPlugins();
    plugins.forEach(p => unregisterPlugin(p.name));
  });

  it('should enable hooks', () => {
    enableQueryHooks();
    expect(isHooksEnabled()).toBe(true);
  });

  it('should register and retrieve plugins', () => {
    const testPlugin: QueryHookPlugin = {
      name: 'TestPlugin'
    };

    registerPlugin(testPlugin);
    const plugins = getRegisteredPlugins();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe('TestPlugin');
  });

  it('should call onRegister when plugin is registered', () => {
    const onRegister = jest.fn();
    const testPlugin: QueryHookPlugin = {
      name: 'TestPlugin',
      onRegister
    };

    registerPlugin(testPlugin);

    expect(onRegister).toHaveBeenCalledTimes(1);
  });

  it('should call onEnable when plugin is registered after hooks are enabled', () => {
    enableQueryHooks();

    const onEnable = jest.fn();
    const testPlugin: QueryHookPlugin = {
      name: 'TestPlugin',
      onEnable
    };

    registerPlugin(testPlugin);

    expect(onEnable).toHaveBeenCalledTimes(1);
  });

  it('should call onQueryBuild when query is built', () => {
    enableQueryHooks();

    const onQueryBuild = jest.fn();
    const testPlugin: QueryHookPlugin = {
      name: 'TestPlugin',
      onQueryBuild
    };

    registerPlugin(testPlugin);

    const repo = dataSource.getRepository(CoreTestEntity);
    const qb = repo.createQueryBuilder('entity');
    qb.getQuery();

    expect(onQueryBuild).toHaveBeenCalledTimes(1);
    expect(onQueryBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        builder: qb,
        sql: expect.any(String),
        timestamp: expect.any(Date)
      })
    );
  });

  it('should provide correct context to plugins', () => {
    enableQueryHooks();

    let capturedContext: QueryHookContext | null = null;

    const testPlugin: QueryHookPlugin = {
      name: 'TestPlugin',
      onQueryBuild: (context) => {
        capturedContext = context;
      }
    };

    registerPlugin(testPlugin);

    const repo = dataSource.getRepository(CoreTestEntity);
    const qb = repo.createQueryBuilder('entity');
    const sql = qb.getQuery();

    expect(capturedContext).not.toBeNull();
    expect(capturedContext!.sql).toBe(sql);
    expect(capturedContext!.builder).toBe(qb);
    expect(capturedContext!.timestamp).toBeInstanceOf(Date);
  });

  it('should handle plugin errors gracefully', () => {
    enableQueryHooks();

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const errorPlugin: QueryHookPlugin = {
      name: 'ErrorPlugin',
      onQueryBuild: () => {
        throw new Error('Plugin error');
      }
    };

    registerPlugin(errorPlugin);

    const repo = dataSource.getRepository(CoreTestEntity);
    const qb = repo.createQueryBuilder('entity');

    // Should not throw, but should warn
    expect(() => qb.getQuery()).not.toThrow();
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it('should unregister plugins', () => {
    const testPlugin: QueryHookPlugin = {
      name: 'TestPlugin'
    };

    registerPlugin(testPlugin);
    expect(getRegisteredPlugins()).toHaveLength(1);

    const removed = unregisterPlugin('TestPlugin');
    expect(removed).toBe(true);
    expect(getRegisteredPlugins()).toHaveLength(0);
  });

  it('should return false when unregistering non-existent plugin', () => {
    const removed = unregisterPlugin('NonExistentPlugin');
    expect(removed).toBe(false);
  });

  it('should call multiple plugins in order', () => {
    enableQueryHooks();

    const callOrder: string[] = [];

    const plugin1: QueryHookPlugin = {
      name: 'Plugin1',
      onQueryBuild: () => callOrder.push('plugin1')
    };

    const plugin2: QueryHookPlugin = {
      name: 'Plugin2',
      onQueryBuild: () => callOrder.push('plugin2')
    };

    registerPlugin(plugin1);
    registerPlugin(plugin2);

    const repo = dataSource.getRepository(CoreTestEntity);
    const qb = repo.createQueryBuilder('entity');
    qb.getQuery();

    expect(callOrder).toEqual(['plugin1', 'plugin2']);
  });

  it('should warn when enabling hooks multiple times', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    enableQueryHooks();
    enableQueryHooks(); // Second call should warn

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('already enabled')
    );

    consoleWarnSpy.mockRestore();
  });
});

