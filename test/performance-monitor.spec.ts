import { DataSource, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import {
  enableQueryHooks,
  registerPlugin,
  unregisterPlugin,
  getRegisteredPlugins
} from '../src';
import { PerformanceMonitorPlugin } from '../src/plugins/performance-monitor';

@Entity('perf_test_entity')
class PerfTestEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}

describe('PerformanceMonitor Plugin', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [PerfTestEntity],
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

  it('should call onSlowQuery for slow queries', async () => {
    const onSlowQuery = jest.fn();

    registerPlugin(PerformanceMonitorPlugin({
      slowQueryThreshold: 0, // All queries are "slow"
      onSlowQuery
    }));

    await dataSource.getRepository(PerfTestEntity).find();

    expect(onSlowQuery).toHaveBeenCalled();
    expect(onSlowQuery.mock.calls[0][0]).toHaveProperty('executionTime');
  });

  it('should call onMetric for all queries', async () => {
    const onMetric = jest.fn();

    registerPlugin(PerformanceMonitorPlugin({
      slowQueryThreshold: 10000, // High threshold, won't trigger onSlowQuery
      onMetric
    }));

    await dataSource.getRepository(PerfTestEntity).find();

    expect(onMetric).toHaveBeenCalled();
  });

  it('should log when enableLogging is true', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    registerPlugin(PerformanceMonitorPlugin({
      slowQueryThreshold: 0,
      enableLogging: true
    }));

    await dataSource.getRepository(PerfTestEntity).find();

    expect(consoleLogSpy).toHaveBeenCalled();
    consoleLogSpy.mockRestore();
  });

  it('should not call onSlowQuery for fast queries', async () => {
    const onSlowQuery = jest.fn();

    registerPlugin(PerformanceMonitorPlugin({
      slowQueryThreshold: 10000, // Very high threshold
      onSlowQuery
    }));

    await dataSource.getRepository(PerfTestEntity).find();

    expect(onSlowQuery).not.toHaveBeenCalled();
  });

  it('should track execution time', async () => {
    const onMetric = jest.fn();

    registerPlugin(PerformanceMonitorPlugin({
      onMetric
    }));

    await dataSource.getRepository(PerfTestEntity).find();

    expect(onMetric).toHaveBeenCalled();
    const context = onMetric.mock.calls[0][0];
    expect(context.executionTime).toBeGreaterThanOrEqual(0);
    expect(typeof context.executionTime).toBe('number');
  });
});

