import { DataSource, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import {
  enableQueryHooks,
  registerPlugin,
  unregisterPlugin,
  getRegisteredPlugins
} from '../src';
import { CacheInvalidationPlugin } from '../src/plugins/cache-invalidation';

@Entity('cache_test_entity')
class CacheTestEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}

describe('CacheInvalidation Plugin', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [CacheTestEntity],
      synchronize: true,
      logging: false
    });

    await dataSource.initialize();
    enableQueryHooks();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(() => {
    const plugins = getRegisteredPlugins();
    plugins.forEach(p => unregisterPlugin(p.name));
  });

  it('should call onInvalidate for INSERT operations', async () => {
    const onInvalidate = jest.fn();

    registerPlugin(CacheInvalidationPlugin({
      onInvalidate
    }));

    await dataSource.getRepository(CacheTestEntity).save({ name: 'Test' });

    expect(onInvalidate).toHaveBeenCalled();
    expect(onInvalidate.mock.calls[0][0]).toContain('cache_test_entity');
  });

  it('should call onInvalidate for UPDATE operations', async () => {
    const onInvalidate = jest.fn();

    await dataSource.getRepository(CacheTestEntity).save({ name: 'Test' });

    registerPlugin(CacheInvalidationPlugin({
      onInvalidate
    }));

    await dataSource.createQueryBuilder()
      .update(CacheTestEntity)
      .set({ name: 'Updated' })
      .where('id = :id', { id: 1 })
      .execute();

    expect(onInvalidate).toHaveBeenCalled();
  });

  it('should call onInvalidate for DELETE operations', async () => {
    const onInvalidate = jest.fn();

    await dataSource.getRepository(CacheTestEntity).save({ name: 'Test' });

    registerPlugin(CacheInvalidationPlugin({
      onInvalidate
    }));

    await dataSource.createQueryBuilder()
      .delete()
      .from(CacheTestEntity)
      .where('id = :id', { id: 1 })
      .execute();

    expect(onInvalidate).toHaveBeenCalled();
  });

  it('should not call onInvalidate for SELECT operations', async () => {
    const onInvalidate = jest.fn();

    registerPlugin(CacheInvalidationPlugin({
      onInvalidate
    }));

    await dataSource.getRepository(CacheTestEntity).find();

    expect(onInvalidate).not.toHaveBeenCalled();
  });

  it('should respect monitorTables option', async () => {
    const onInvalidate = jest.fn();

    registerPlugin(CacheInvalidationPlugin({
      monitorTables: ['other_table'],
      onInvalidate
    }));

    await dataSource.getRepository(CacheTestEntity).save({ name: 'Test' });

    expect(onInvalidate).not.toHaveBeenCalled();
  });

  it('should invalidate when table is in monitorTables', async () => {
    const onInvalidate = jest.fn();

    registerPlugin(CacheInvalidationPlugin({
      monitorTables: ['cache_test_entity'],
      onInvalidate
    }));

    await dataSource.getRepository(CacheTestEntity).save({ name: 'Test' });

    expect(onInvalidate).toHaveBeenCalled();
  });

  it('should respect invalidateOnTypes option', async () => {
    const onInvalidate = jest.fn();

    registerPlugin(CacheInvalidationPlugin({
      invalidateOnTypes: ['DELETE'], // Only DELETE
      onInvalidate
    }));

    await dataSource.getRepository(CacheTestEntity).save({ name: 'Test' });

    expect(onInvalidate).not.toHaveBeenCalled();
  });

  it('should log when enableLogging is true', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    const onInvalidate = jest.fn();

    registerPlugin(CacheInvalidationPlugin({
      enableLogging: true,
      onInvalidate
    }));

    await dataSource.getRepository(CacheTestEntity).save({ name: 'Test' });

    expect(consoleLogSpy).toHaveBeenCalled();
    consoleLogSpy.mockRestore();
  });
});


