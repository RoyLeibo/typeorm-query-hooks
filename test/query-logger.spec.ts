import { DataSource, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import {
  enableQueryHooks,
  registerPlugin,
  QueryLoggerPlugin,
  createQueryLoggerPlugin
} from '../src';

@Entity('logger_test_entity')
class LoggerTestEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}

describe('QueryLoggerPlugin', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    enableQueryHooks();

    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [LoggerTestEntity],
      synchronize: true,
      logging: false
    });

    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('should log queries with default logger', () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    registerPlugin(QueryLoggerPlugin);

    const repo = dataSource.getRepository(LoggerTestEntity);
    const qb = repo.createQueryBuilder('entity');
    qb.getQuery();

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0][0]).toContain('[QueryLogger]');
    expect(consoleLogSpy.mock.calls[0][0]).toContain('SELECT');

    consoleLogSpy.mockRestore();
  });

  it('should log with custom logger', () => {
    const customLogger = jest.fn();

    const customLoggerPlugin = createQueryLoggerPlugin({
      logger: customLogger
    });

    registerPlugin(customLoggerPlugin);

    const repo = dataSource.getRepository(LoggerTestEntity);
    const qb = repo.createQueryBuilder('entity');
    qb.getQuery();

    expect(customLogger).toHaveBeenCalled();
    expect(customLogger.mock.calls[0][0]).toContain('[QueryLogger]');
  });

  it('should respect logSql option', () => {
    const customLogger = jest.fn();

    const noSqlLoggerPlugin = createQueryLoggerPlugin({
      logSql: false,
      logger: customLogger
    });

    registerPlugin(noSqlLoggerPlugin);

    const repo = dataSource.getRepository(LoggerTestEntity);
    const qb = repo.createQueryBuilder('entity');
    qb.getQuery();

    expect(customLogger).toHaveBeenCalled();
    // Should not contain SELECT since logSql is false
    expect(customLogger.mock.calls[0][0]).not.toContain('SELECT');
  });

  it('should respect logTimestamp option', () => {
    const customLogger = jest.fn();

    const noTimestampLoggerPlugin = createQueryLoggerPlugin({
      logTimestamp: false,
      logger: customLogger
    });

    registerPlugin(noTimestampLoggerPlugin);

    const repo = dataSource.getRepository(LoggerTestEntity);
    const qb = repo.createQueryBuilder('entity');
    qb.getQuery();

    expect(customLogger).toHaveBeenCalled();
    // Should not contain ISO timestamp
    expect(customLogger.mock.calls[0][0]).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('should respect filter function', () => {
    const customLogger = jest.fn();

    const filteredLoggerPlugin = createQueryLoggerPlugin({
      logger: customLogger,
      filter: (context) => context.sql.includes('WHERE')
    });

    registerPlugin(filteredLoggerPlugin);

    const repo = dataSource.getRepository(LoggerTestEntity);

    // Query without WHERE
    const qb1 = repo.createQueryBuilder('entity');
    qb1.getQuery();

    expect(customLogger).not.toHaveBeenCalled();

    // Query with WHERE
    const qb2 = repo.createQueryBuilder('entity').where('entity.id = :id', { id: 1 });
    qb2.getQuery();

    expect(customLogger).toHaveBeenCalledTimes(1);
  });
});

