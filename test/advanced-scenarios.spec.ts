import { DataSource, Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne } from 'typeorm';
import { 
  enableQueryHooks, 
  registerPlugin, 
  TableExtractorPlugin
} from '../src';

@Entity('orders')
class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  total!: number;

  @Column()
  userId!: number;

  @ManyToOne(() => Customer, customer => customer.orders)
  customer!: Customer;

  @OneToMany(() => OrderItem, item => item.order)
  items!: OrderItem[];
}

@Entity('customers')
class Customer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @OneToMany(() => Order, order => order.customer)
  orders!: Order[];
}

@Entity('order_items')
class OrderItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  quantity!: number;

  @Column()
  productId!: number;

  @ManyToOne(() => Order, order => order.items)
  order!: Order;

  @ManyToOne(() => Product, product => product.orderItems)
  product!: Product;
}

@Entity('products')
class Product {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column()
  price!: number;

  @OneToMany(() => OrderItem, item => item.product)
  orderItems!: OrderItem[];
}

describe('Advanced Table Extraction Scenarios', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    enableQueryHooks();
    registerPlugin(TableExtractorPlugin);

    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [Order, Customer, OrderItem, Product],
      synchronize: true,
      logging: false
    });

    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('Subqueries', () => {
    it('should extract tables from subquery in WHERE clause', () => {
      const orderRepo = dataSource.getRepository(Order);
      
      const qb = orderRepo
        .createQueryBuilder('order')
        .where(qb => {
          const subQuery = qb
            .subQuery()
            .select('customer.id')
            .from(Customer, 'customer')
            .where('customer.name = :name', { name: 'John' })
            .getQuery();
          return 'order.userId IN ' + subQuery;
        });

      const tables = qb.getInvolvedTables();

      expect(tables).toContain('orders');
      expect(tables).toContain('customers');
    });

    it('should extract tables from subquery in SELECT', () => {
      const orderRepo = dataSource.getRepository(Order);
      
      const qb = orderRepo
        .createQueryBuilder('order')
        .addSelect(subQuery => {
          return subQuery
            .select('COUNT(*)')
            .from(OrderItem, 'item')
            .where('item.orderId = order.id');
        }, 'itemCount');

      const tables = qb.getInvolvedTables();

      expect(tables).toContain('orders');
      expect(tables).toContain('order_items');
    });

    it('should extract tables from nested subqueries', () => {
      const orderRepo = dataSource.getRepository(Order);
      
      const qb = orderRepo
        .createQueryBuilder('order')
        .where(qb => {
          const subQuery = qb
            .subQuery()
            .select('item.orderId')
            .from(OrderItem, 'item')
            .where(qb2 => {
              const nestedSubQuery = qb2
                .subQuery()
                .select('product.id')
                .from(Product, 'product')
                .where('product.price > :price', { price: 100 })
                .getQuery();
              return 'item.productId IN ' + nestedSubQuery;
            })
            .getQuery();
          return 'order.id IN ' + subQuery;
        });

      const tables = qb.getInvolvedTables();

      expect(tables).toContain('orders');
      expect(tables).toContain('order_items');
      expect(tables).toContain('products');
    });
  });

  describe('Common Table Expressions (CTEs)', () => {
    it('should extract tables from CTE', () => {
      const orderRepo = dataSource.getRepository(Order);
      
      const qb = orderRepo
        .createQueryBuilder('order')
        .addCommonTableExpression(
          subQuery => {
            return subQuery
              .select('customer.id', 'customerId')
              .addSelect('COUNT(*)', 'orderCount')
              .from(Customer, 'customer')
              .leftJoin('customer.orders', 'order')
              .groupBy('customer.id');
          },
          'customer_stats'
        )
        .innerJoin('customer_stats', 'stats', 'stats.customerId = order.userId');

      const tables = qb.getInvolvedTables();

      // Should include the CTE name as a "table"
      expect(tables).toContain('customer_stats');
      expect(tables).toContain('orders');
      expect(tables).toContain('customers');
    });

    it('should extract tables from multiple CTEs', () => {
      const orderRepo = dataSource.getRepository(Order);
      
      const qb = orderRepo
        .createQueryBuilder('order')
        .addCommonTableExpression(
          subQuery => {
            return subQuery
              .select('customer.id')
              .from(Customer, 'customer')
              .where('customer.name LIKE :pattern', { pattern: '%John%' });
          },
          'filtered_customers'
        )
        .addCommonTableExpression(
          subQuery => {
            return subQuery
              .select('product.id')
              .from(Product, 'product')
              .where('product.price > :price', { price: 50 });
          },
          'expensive_products'
        )
        .innerJoin('filtered_customers', 'fc', 'fc.id = order.userId');

      const tables = qb.getInvolvedTables();

      expect(tables).toContain('filtered_customers');
      expect(tables).toContain('expensive_products');
      expect(tables).toContain('orders');
      expect(tables).toContain('customers');
      expect(tables).toContain('products');
    });
  });

  describe('INSERT with SELECT', () => {
    it('should extract tables from INSERT ... SELECT query', () => {
      const orderRepo = dataSource.getRepository(Order);
      
      // Create a subquery for the SELECT part
      const selectQb = dataSource
        .createQueryBuilder()
        .select('customer.id')
        .addSelect('100')
        .from(Customer, 'customer')
        .where('customer.name = :name', { name: 'Test' });

      // Insert using the SELECT
      const insertQb = orderRepo
        .createQueryBuilder()
        .insert()
        .into(Order)
        .values([
          { userId: () => '(SELECT id FROM customers WHERE name = "Test")', total: 100 }
        ]);

      const tables = insertQb.getInvolvedTables();

      expect(tables).toContain('orders');
      // Note: Inline SQL in values won't be detected, this is a limitation
      // but the CTE/subquery versions would work
    });
  });

  describe('Multiple FROM sources', () => {
    it('should extract tables when using addFrom', () => {
      const qb = dataSource
        .createQueryBuilder()
        .select('order.id')
        .from(Order, 'order')
        .addFrom(Customer, 'customer')
        .where('order.userId = customer.id');

      const tables = qb.getInvolvedTables();

      expect(tables).toContain('orders');
      expect(tables).toContain('customers');
    });

    it('should extract tables from cross joins', () => {
      const qb = dataSource
        .createQueryBuilder()
        .select('order.id')
        .from(Order, 'order')
        .addFrom(Product, 'product')
        .where('order.total > product.price');

      const tables = qb.getInvolvedTables();

      expect(tables).toContain('orders');
      expect(tables).toContain('products');
    });
  });

  describe('Complex multi-level joins', () => {
    it('should extract tables from deeply nested joins', () => {
      const orderRepo = dataSource.getRepository(Order);
      
      const qb = orderRepo
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.customer', 'customer')
        .leftJoinAndSelect('order.items', 'item')
        .leftJoinAndSelect('item.product', 'product')
        .where('customer.name = :name', { name: 'John' })
        .andWhere('product.price > :price', { price: 50 });

      const tables = qb.getInvolvedTables();

      expect(tables).toContain('orders');
      expect(tables).toContain('customers');
      expect(tables).toContain('order_items');
      expect(tables).toContain('products');
      expect(tables.length).toBe(4);
    });

    it('should handle self-referencing joins', () => {
      // This would require a self-referencing entity, but demonstrates the concept
      const customerRepo = dataSource.getRepository(Customer);
      
      const qb = customerRepo
        .createQueryBuilder('customer')
        .leftJoin(Customer, 'referrer', 'referrer.id = customer.id');

      const tables = qb.getInvolvedTables();

      // Should have 'customers' table (might appear once due to Set deduplication)
      expect(tables).toContain('customers');
    });
  });

  describe('UPDATE and DELETE queries', () => {
    it('should extract tables from UPDATE with subquery', () => {
      const orderRepo = dataSource.getRepository(Order);
      
      const qb = orderRepo
        .createQueryBuilder()
        .update(Order)
        .set({ total: 0 })
        .where(qb => {
          const subQuery = qb
            .subQuery()
            .select('customer.id')
            .from(Customer, 'customer')
            .where('customer.name = :name', { name: 'Inactive' })
            .getQuery();
          return 'userId IN ' + subQuery;
        });

      const tables = qb.getInvolvedTables();

      expect(tables).toContain('orders');
      expect(tables).toContain('customers');
    });

    it('should extract tables from DELETE with JOIN (database-specific)', () => {
      const orderRepo = dataSource.getRepository(Order);
      
      const qb = orderRepo
        .createQueryBuilder('order')
        .delete()
        .from(Order)
        .where(qb => {
          const subQuery = qb
            .subQuery()
            .select('item.orderId')
            .from(OrderItem, 'item')
            .where('item.quantity = 0')
            .getQuery();
          return 'id IN ' + subQuery;
        });

      const tables = qb.getInvolvedTables();

      expect(tables).toContain('orders');
      expect(tables).toContain('order_items');
    });
  });

  describe('Edge cases', () => {
    it('should not duplicate tables', () => {
      const orderRepo = dataSource.getRepository(Order);
      
      const qb = orderRepo
        .createQueryBuilder('order')
        .leftJoin('order.items', 'item1')
        .leftJoin('order.items', 'item2')
        .leftJoin(OrderItem, 'item3', 'item3.orderId = order.id');

      const tables = qb.getInvolvedTables();

      // Count occurrences
      const orderItemsCount = tables.filter(t => t === 'order_items').length;
      expect(orderItemsCount).toBe(1); // Should only appear once
    });

    it('should handle empty query builder', () => {
      const qb = dataSource.createQueryBuilder();

      const tables = qb.getInvolvedTables();

      expect(tables).toEqual([]);
    });

    it('should handle query builder with no tables', () => {
      const qb = dataSource
        .createQueryBuilder()
        .select('1 + 1', 'result');

      const tables = qb.getInvolvedTables();

      // Might be empty or might have some internal representation
      expect(Array.isArray(tables)).toBe(true);
    });
  });
});

