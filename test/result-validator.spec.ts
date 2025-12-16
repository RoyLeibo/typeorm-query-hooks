import { DataSource, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import {
  enableQueryHooks,
  registerPlugin,
  unregisterPlugin,
  getRegisteredPlugins
} from '../src';
import { ResultValidatorPlugin } from '../src/plugins/result-validator';

@Entity('result_test_entity')
class ResultTestEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}

describe('ResultValidator Plugin', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [ResultTestEntity],
      synchronize: true,
      logging: false
    });

    await dataSource.initialize();
    enableQueryHooks();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    const plugins = getRegisteredPlugins();
    plugins.forEach(p => unregisterPlugin(p.name));
    
    // Clear table
    await dataSource.query('DELETE FROM result_test_entity');
  });

  it('should call onEmptyResult when query returns no results', async () => {
    const onEmptyResult = jest.fn();

    registerPlugin(ResultValidatorPlugin({
      onEmptyResult
    }));

    await dataSource.getRepository(ResultTestEntity).find();

    expect(onEmptyResult).toHaveBeenCalled();
  });

  it('should call onLargeResult when result exceeds threshold', async () => {
    const onLargeResult = jest.fn();

    registerPlugin(ResultValidatorPlugin({
      largeResultThreshold: 2,
      onLargeResult
    }));

    // Insert 3 rows
    await dataSource.getRepository(ResultTestEntity).save([
      { name: 'Test 1' },
      { name: 'Test 2' },
      { name: 'Test 3' }
    ]);

    await dataSource.getRepository(ResultTestEntity).find();

    expect(onLargeResult).toHaveBeenCalled();
    // Check the context has rowCount
    const context = onLargeResult.mock.calls[0][0];
    expect(context.rowCount).toBeGreaterThanOrEqual(3);
  });

  it('should respect monitorTables option', async () => {
    const onEmptyResult = jest.fn();

    registerPlugin(ResultValidatorPlugin({
      monitorTables: ['other_table'], // Not monitoring result_test_entity
      onEmptyResult
    }));

    await dataSource.getRepository(ResultTestEntity).find();

    expect(onEmptyResult).not.toHaveBeenCalled();
  });

  it('should monitor when table is in monitorTables list', async () => {
    const onEmptyResult = jest.fn();

    registerPlugin(ResultValidatorPlugin({
      monitorTables: ['result_test_entity'],
      onEmptyResult
    }));

    await dataSource.getRepository(ResultTestEntity).find();

    expect(onEmptyResult).toHaveBeenCalled();
  });

  it('should log when enableLogging is true', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    registerPlugin(ResultValidatorPlugin({
      enableLogging: true
    }));

    await dataSource.getRepository(ResultTestEntity).find();

    expect(consoleLogSpy).toHaveBeenCalled();
    consoleLogSpy.mockRestore();
  });

  it('should not call onLargeResult when under threshold', async () => {
    const onLargeResult = jest.fn();

    registerPlugin(ResultValidatorPlugin({
      largeResultThreshold: 10,
      onLargeResult
    }));

    await dataSource.getRepository(ResultTestEntity).save([
      { name: 'Test 1' },
      { name: 'Test 2' }
    ]);

    await dataSource.getRepository(ResultTestEntity).find();

    expect(onLargeResult).not.toHaveBeenCalled();
  });
});

