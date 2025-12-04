import { DataSource, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import {
  enableQueryHooks,
  registerPlugin,
  TableExtractorPlugin,
  QueryMetadataRegistryPlugin,
  getTablesFromSQL,
  hasQueryMetadata,
  getQueryTypeFromSQL,
  queryMetadataRegistry
} from '../src';

@Entity('registry_test_users')
class RegistryTestUser {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}

@Entity('registry_test_posts')
class RegistryTestPost {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;
}

describe('QueryMetadataRegistryPlugin', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    enableQueryHooks();
    registerPlugin(TableExtractorPlugin);
    registerPlugin(QueryMetadataRegistryPlugin);

    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [RegistryTestUser, RegistryTestPost],
      synchronize: true,
      logging: false
    });

    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(() => {
    // Clear registry before each test
    queryMetadataRegistry.clear();
  });

  it('should register metadata when query is built', () => {
    const repo = dataSource.getRepository(RegistryTestUser);
    const qb = repo.createQueryBuilder('user').where('user.name = :name', { name: 'John' });

    const sql = qb.getQuery();

    // Should be registered
    expect(hasQueryMetadata(sql)).toBe(true);
  });

  it('should retrieve tables from SQL string', () => {
    const repo = dataSource.getRepository(RegistryTestUser);
    const qb = repo.createQueryBuilder('user');

    const sql = qb.getQuery();
    const tables = getTablesFromSQL(sql);

    expect(tables).toContain('registry_test_users');
  });

  it('should retrieve tables from join query', () => {
    const repo = dataSource.getRepository(RegistryTestUser);
    const qb = repo
      .createQueryBuilder('user')
      .leftJoin(RegistryTestPost, 'post', 'post.userId = user.id');

    const sql = qb.getQuery();
    const tables = getTablesFromSQL(sql);

    expect(tables).toContain('registry_test_users');
    expect(tables).toContain('registry_test_posts');
  });

  it('should retrieve query type from SQL', () => {
    const repo = dataSource.getRepository(RegistryTestUser);
    const qb = repo.createQueryBuilder('user');

    const sql = qb.getQuery();
    const queryType = getQueryTypeFromSQL(sql);

    expect(queryType).toBe('SELECT');
  });

  it('should retrieve UPDATE query type', () => {
    const repo = dataSource.getRepository(RegistryTestUser);
    const qb = repo
      .createQueryBuilder()
      .update(RegistryTestUser)
      .set({ name: 'Updated' })
      .where('id = :id', { id: 1 });

    const sql = qb.getQuery();
    const queryType = getQueryTypeFromSQL(sql);

    expect(queryType).toBe('UPDATE');
  });

  it('should normalize SQL for consistent lookup', () => {
    const repo = dataSource.getRepository(RegistryTestUser);
    const qb = repo.createQueryBuilder('user').where('user.id = :id', { id: 1 });

    const sql = qb.getQuery();

    // Different whitespace should still match
    const sqlWithExtraSpaces = sql.replace(/\s+/g, '   ');
    const tables = getTablesFromSQL(sqlWithExtraSpaces);

    expect(tables).toContain('registry_test_users');
  });

  it('should return empty array for unknown SQL', () => {
    const tables = getTablesFromSQL('SELECT * FROM unknown_table');
    expect(tables).toEqual([]);
  });

  it('should return false for hasQueryMetadata with unknown SQL', () => {
    const hasMetadata = hasQueryMetadata('SELECT * FROM unknown_table');
    expect(hasMetadata).toBe(false);
  });

  it('should handle multiple queries', () => {
    const repo = dataSource.getRepository(RegistryTestUser);

    const qb1 = repo.createQueryBuilder('user').where('user.id = 1');
    const sql1 = qb1.getQuery();

    const qb2 = repo.createQueryBuilder('user').where('user.name = :name', { name: 'John' });
    const sql2 = qb2.getQuery();

    expect(hasQueryMetadata(sql1)).toBe(true);
    expect(hasQueryMetadata(sql2)).toBe(true);

    const tables1 = getTablesFromSQL(sql1);
    const tables2 = getTablesFromSQL(sql2);

    expect(tables1).toContain('registry_test_users');
    expect(tables2).toContain('registry_test_users');
  });

  it('should report registry size', () => {
    const initialSize = queryMetadataRegistry.size();

    const repo = dataSource.getRepository(RegistryTestUser);
    const qb = repo.createQueryBuilder('user');
    qb.getQuery();

    expect(queryMetadataRegistry.size()).toBe(initialSize + 1);
  });

  it('should clear registry', () => {
    const repo = dataSource.getRepository(RegistryTestUser);
    const qb = repo.createQueryBuilder('user');
    const sql = qb.getQuery();

    expect(hasQueryMetadata(sql)).toBe(true);

    queryMetadataRegistry.clear();

    expect(hasQueryMetadata(sql)).toBe(false);
    expect(queryMetadataRegistry.size()).toBe(0);
  });

  it('should handle DELETE queries', () => {
    const repo = dataSource.getRepository(RegistryTestUser);
    const qb = repo
      .createQueryBuilder()
      .delete()
      .from(RegistryTestUser)
      .where('id = :id', { id: 1 });

    const sql = qb.getQuery();
    const queryType = getQueryTypeFromSQL(sql);
    const tables = getTablesFromSQL(sql);

    expect(queryType).toBe('DELETE');
    expect(tables).toContain('registry_test_users');
  });

  it('should handle INSERT queries', () => {
    const repo = dataSource.getRepository(RegistryTestUser);
    const qb = repo
      .createQueryBuilder()
      .insert()
      .into(RegistryTestUser)
      .values({ name: 'New User' });

    const sql = qb.getQuery();
    const queryType = getQueryTypeFromSQL(sql);
    const tables = getTablesFromSQL(sql);

    expect(queryType).toBe('INSERT');
    expect(tables).toContain('registry_test_users');
  });

  it('should handle case-insensitive SQL matching', () => {
    const repo = dataSource.getRepository(RegistryTestUser);
    const qb = repo.createQueryBuilder('user');

    const sql = qb.getQuery();
    const lowerCaseSQL = sql.toLowerCase();
    const upperCaseSQL = sql.toUpperCase();

    // All variations should find the metadata
    expect(getTablesFromSQL(sql).length).toBeGreaterThan(0);
    expect(getTablesFromSQL(lowerCaseSQL).length).toBeGreaterThan(0);
    expect(getTablesFromSQL(upperCaseSQL).length).toBeGreaterThan(0);
  });
});

describe('QueryMetadataService', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    enableQueryHooks();
    registerPlugin(TableExtractorPlugin);
    registerPlugin(QueryMetadataRegistryPlugin);

    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [RegistryTestUser, RegistryTestPost],
      synchronize: true,
      logging: false
    });

    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('should provide getTablesFromQuery method', () => {
    const { QueryMetadataService } = require('../src/nestjs');
    const service = new QueryMetadataService();

    const repo = dataSource.getRepository(RegistryTestUser);
    const qb = repo.createQueryBuilder('user');
    const sql = qb.getQuery();

    const tables = service.getTablesFromQuery(sql);
    expect(tables).toContain('registry_test_users');
  });

  it('should provide getPrimaryTable method', () => {
    const { QueryMetadataService } = require('../src/nestjs');
    const service = new QueryMetadataService();

    const repo = dataSource.getRepository(RegistryTestUser);
    const qb = repo.createQueryBuilder('user');
    const sql = qb.getQuery();

    const primaryTable = service.getPrimaryTable(sql);
    expect(primaryTable).toBe('registry_test_users');
  });

  it('should return "unknown" for getPrimaryTable when no metadata', () => {
    const { QueryMetadataService } = require('../src/nestjs');
    const service = new QueryMetadataService();

    const primaryTable = service.getPrimaryTable('SELECT * FROM nowhere');
    expect(primaryTable).toBe('unknown');
  });

  it('should provide getTableInfo method', () => {
    const { QueryMetadataService } = require('../src/nestjs');
    const service = new QueryMetadataService();

    const repo = dataSource.getRepository(RegistryTestUser);
    const qb = repo
      .createQueryBuilder('user')
      .leftJoin(RegistryTestPost, 'post', 'post.userId = user.id');
    const sql = qb.getQuery();

    const info = service.getTableInfo(sql);
    expect(info.count).toBe(2);
    expect(info.tables).toContain('registry_test_users');
    expect(info.tables).toContain('registry_test_posts');
  });
});

