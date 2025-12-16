import { DataSource, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import {
  enableQueryHooks,
  registerPlugin,
  unregisterPlugin,
  getRegisteredPlugins
} from '../src';
import { SafetyGuardPlugin } from '../src/plugins/safety-guard';

@Entity('safety_users')
class SafetyUser {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column()
  email!: string;
}

describe('SafetyGuard Plugin', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [SafetyUser],
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

  describe('requireWhereClause', () => {
    it('should block UPDATE without WHERE clause', async () => {
      const onBlocked = jest.fn();

      registerPlugin(SafetyGuardPlugin({
        requireWhereClause: true,
        throwOnBlock: true,
        onBlocked
      }));

      // The query will execute but onBlocked will be called
      await dataSource.createQueryBuilder()
        .update(SafetyUser)
        .set({ name: 'Test' })
        .execute();

      expect(onBlocked).toHaveBeenCalled();
      expect(onBlocked.mock.calls[0][1].operation).toBe('UPDATE');
    });

    it('should block DELETE without WHERE clause', async () => {
      const onBlocked = jest.fn();

      registerPlugin(SafetyGuardPlugin({
        requireWhereClause: true,
        throwOnBlock: true,
        onBlocked
      }));

      await dataSource.createQueryBuilder()
        .delete()
        .from(SafetyUser)
        .execute();

      expect(onBlocked).toHaveBeenCalled();
      expect(onBlocked.mock.calls[0][1].operation).toBe('DELETE');
    });

    it('should allow UPDATE with WHERE clause', async () => {
      const onBlocked = jest.fn();

      registerPlugin(SafetyGuardPlugin({
        requireWhereClause: true,
        throwOnBlock: true,
        onBlocked
      }));

      await dataSource.createQueryBuilder()
        .insert()
        .into(SafetyUser)
        .values({ name: 'John', email: 'john@example.com' })
        .execute();

      await dataSource.createQueryBuilder()
        .update(SafetyUser)
        .set({ name: 'Jane' })
        .where('id = :id', { id: 1 })
        .execute();

      expect(onBlocked).not.toHaveBeenCalled();
    });
  });

  describe('onBlocked callback', () => {
    it('should call onBlocked with operation details', async () => {
      const onBlocked = jest.fn();

      registerPlugin(SafetyGuardPlugin({
        requireWhereClause: true,
        throwOnBlock: false,
        onBlocked
      }));

      await dataSource.createQueryBuilder()
        .delete()
        .from(SafetyUser)
        .execute();

      expect(onBlocked).toHaveBeenCalled();
      const blockedOp = onBlocked.mock.calls[0][1];
      expect(blockedOp.operation).toBe('DELETE');
      expect(blockedOp.tables).toContain('safety_users');
      expect(blockedOp.reason).toContain('WHERE clause');
    });

    it('should call onBlocked when throwOnBlock is false', async () => {
      const onBlocked = jest.fn();

      registerPlugin(SafetyGuardPlugin({
        requireWhereClause: true,
        throwOnBlock: false,
        onBlocked
      }));

      // Should call onBlocked
      await dataSource.createQueryBuilder()
        .delete()
        .from(SafetyUser)
        .execute();

      expect(onBlocked).toHaveBeenCalled();
    });
  });

  describe('protectedTables', () => {
    it('should escalate severity for protected tables', async () => {
      const onBlocked = jest.fn();

      registerPlugin(SafetyGuardPlugin({
        requireWhereClause: true, // Check WHERE clauses
        protectedTables: ['safety_users'], // This table gets critical severity
        throwOnBlock: false,
        onBlocked
      }));

      // This should be blocked with critical severity because safety_users is protected
      await dataSource.createQueryBuilder()
        .update(SafetyUser)
        .set({ name: 'Updated' })
        .execute(); // No WHERE clause

      expect(onBlocked).toHaveBeenCalled();
      const blockedOp = onBlocked.mock.calls[0][1];
      expect(blockedOp.reason).toContain('protected table');
    });
  });

  describe('allowForce bypass', () => {
    it('should allow operation with FORCE_ALLOW comment', async () => {
      const onBlocked = jest.fn();

      registerPlugin(SafetyGuardPlugin({
        requireWhereClause: true,
        allowForce: true,
        throwOnBlock: true,
        onBlocked
      }));

      // This should work with FORCE_ALLOW comment
      await dataSource.query('/* FORCE_ALLOW */ DELETE FROM safety_users');

      // Should not have been blocked
      expect(onBlocked).not.toHaveBeenCalled();
    });
  });

  describe('enableLogging', () => {
    it('should log blocked operations when enabled', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      registerPlugin(SafetyGuardPlugin({
        requireWhereClause: true,
        throwOnBlock: false,
        enableLogging: true
      }));

      await dataSource.createQueryBuilder()
        .delete()
        .from(SafetyUser)
        .execute();

      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });
});

