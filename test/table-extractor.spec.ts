import { DataSource, Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne } from 'typeorm';
import { 
  enableQueryHooks, 
  registerPlugin, 
  TableExtractorPlugin,
  onTablesExtracted,
  offTablesExtracted,
  isHooksEnabled,
  unregisterPlugin
} from '../src';

@Entity('test_users')
class TestUser {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @OneToMany(() => TestPost, post => post.author)
  posts!: TestPost[];
}

@Entity('test_posts')
class TestPost {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @ManyToOne(() => TestUser, user => user.posts)
  author!: TestUser;

  @OneToMany(() => TestComment, comment => comment.post)
  comments!: TestComment[];
}

@Entity('test_comments')
class TestComment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  text!: string;

  @ManyToOne(() => TestPost, post => post.comments)
  post!: TestPost;
}

describe('TableExtractorPlugin', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    // Enable hooks before creating connection
    enableQueryHooks();
    registerPlugin(TableExtractorPlugin);

    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [TestUser, TestPost, TestComment],
      synchronize: true,
      logging: false
    });

    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('should enable hooks', () => {
    expect(isHooksEnabled()).toBe(true);
  });

  it('should extract single table from simple query', () => {
    const repo = dataSource.getRepository(TestUser);
    const qb = repo.createQueryBuilder('user');

    const tables = qb.getInvolvedTables();

    expect(tables).toEqual(['test_users']);
  });

  it('should extract multiple tables from join query', () => {
    const repo = dataSource.getRepository(TestUser);
    const qb = repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.posts', 'post');

    const tables = qb.getInvolvedTables();

    expect(tables).toContain('test_users');
    expect(tables).toContain('test_posts');
    expect(tables.length).toBe(2);
  });

  it('should extract tables from complex multi-join query', () => {
    const repo = dataSource.getRepository(TestUser);
    const qb = repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.posts', 'post')
      .leftJoinAndSelect('post.comments', 'comment');

    const tables = qb.getInvolvedTables();

    expect(tables).toContain('test_users');
    expect(tables).toContain('test_posts');
    expect(tables).toContain('test_comments');
    expect(tables.length).toBe(3);
  });

  it('should not duplicate tables in results', () => {
    const repo = dataSource.getRepository(TestUser);
    const qb = repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.posts', 'post1')
      .leftJoinAndSelect('user.posts', 'post2'); // Join same relation twice

    const tables = qb.getInvolvedTables();

    // Should only contain each table once
    const uniqueTables = [...new Set(tables)];
    expect(tables.length).toBe(uniqueTables.length);
  });

  it('should trigger onTablesExtracted callback when query is built', (done) => {
    const repo = dataSource.getRepository(TestUser);
    const qb = repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.posts', 'post');

    const callback = jest.fn((tables, builder, sql) => {
      expect(tables).toContain('test_users');
      expect(tables).toContain('test_posts');
      expect(sql).toContain('SELECT');
      expect(builder).toBe(qb);
      
      offTablesExtracted(callback);
      done();
    });

    onTablesExtracted(callback);

    // Trigger query building
    qb.getQuery();
  });

  it('should allow removing callbacks with offTablesExtracted', () => {
    const callback = jest.fn();
    
    onTablesExtracted(callback);
    const removed = offTablesExtracted(callback);

    expect(removed).toBe(true);

    // Build a query - callback should not be called
    const repo = dataSource.getRepository(TestUser);
    const qb = repo.createQueryBuilder('user');
    qb.getQuery();

    expect(callback).not.toHaveBeenCalled();
  });

  it('should handle UpdateQueryBuilder', () => {
    const repo = dataSource.getRepository(TestUser);
    const qb = repo
      .createQueryBuilder()
      .update(TestUser)
      .set({ name: 'Updated' });

    const tables = qb.getInvolvedTables();

    expect(tables).toContain('test_users');
  });

  it('should handle DeleteQueryBuilder', () => {
    const repo = dataSource.getRepository(TestUser);
    const qb = repo
      .createQueryBuilder()
      .delete()
      .from(TestUser);

    const tables = qb.getInvolvedTables();

    expect(tables).toContain('test_users');
  });

  it('should handle InsertQueryBuilder', () => {
    const repo = dataSource.getRepository(TestUser);
    const qb = repo
      .createQueryBuilder()
      .insert()
      .into(TestUser)
      .values({ name: 'New User' });

    const tables = qb.getInvolvedTables();

    expect(tables).toContain('test_users');
  });

  it('should allow unregistering the plugin', () => {
    const removed = unregisterPlugin('TableExtractor');
    expect(removed).toBe(true);

    // Re-register for other tests
    registerPlugin(TableExtractorPlugin);
  });
});

