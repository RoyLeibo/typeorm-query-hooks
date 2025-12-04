/**
 * Advanced scenarios example for typeorm-query-hooks
 * 
 * This example demonstrates table extraction from:
 * - Subqueries (SELECT, WHERE, FROM)
 * - Common Table Expressions (CTEs)
 * - Multiple FROM sources
 * - Complex nested queries
 * - INSERT with SELECT
 */

import { DataSource, Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne } from 'typeorm';
import { 
  enableQueryHooks, 
  registerPlugin, 
  TableExtractorPlugin,
  onTablesExtracted 
} from '../src';

// === Define entities ===

@Entity('users')
class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column()
  email!: string;

  @OneToMany(() => Order, order => order.user)
  orders!: Order[];
}

@Entity('orders')
class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  total!: number;

  @Column()
  status!: string;

  @ManyToOne(() => User, user => user.orders)
  user!: User;

  @OneToMany(() => OrderItem, item => item.order)
  items!: OrderItem[];
}

@Entity('order_items')
class OrderItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  quantity!: number;

  @ManyToOne(() => Order, order => order.items)
  order!: Order;

  @ManyToOne(() => Product, product => product.items)
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
  items!: OrderItem[];
}

// === Setup ===

async function main() {
  console.log('🚀 Advanced Table Extraction Scenarios\n');
  console.log('='.repeat(70));

  // Enable hooks
  enableQueryHooks();
  registerPlugin(TableExtractorPlugin);

  // Optional: Listen to all extractions
  onTablesExtracted((tables, builder, sql) => {
    console.log('\n📊 Extracted Tables:', tables.join(', '));
  });

  // Setup database
  const dataSource = new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: [User, Order, OrderItem, Product],
    synchronize: true,
    logging: false
  });

  await dataSource.initialize();

  // === Scenario 1: Subquery in WHERE clause ===
  console.log('\n\n1️⃣  SUBQUERY IN WHERE CLAUSE');
  console.log('─'.repeat(70));
  console.log('Find orders from users named "John"');
  
  const orderRepo = dataSource.getRepository(Order);
  const query1 = orderRepo
    .createQueryBuilder('order')
    .where(qb => {
      const subQuery = qb
        .subQuery()
        .select('user.id')
        .from(User, 'user')
        .where('user.name = :name', { name: 'John' })
        .getQuery();
      return 'order.userId IN ' + subQuery;
    });

  console.log('Tables:', query1.getInvolvedTables());
  // Output: orders, users

  // === Scenario 2: Subquery in SELECT clause ===
  console.log('\n\n2️⃣  SUBQUERY IN SELECT CLAUSE');
  console.log('─'.repeat(70));
  console.log('Get orders with item count calculated via subquery');
  
  const query2 = orderRepo
    .createQueryBuilder('order')
    .addSelect(subQuery => {
      return subQuery
        .select('COUNT(*)')
        .from(OrderItem, 'item')
        .where('item.orderId = order.id');
    }, 'itemCount')
    .where('order.status = :status', { status: 'completed' });

  console.log('Tables:', query2.getInvolvedTables());
  // Output: orders, order_items

  // === Scenario 3: Common Table Expressions (CTE) ===
  console.log('\n\n3️⃣  COMMON TABLE EXPRESSION (WITH clause)');
  console.log('─'.repeat(70));
  console.log('Calculate user statistics with CTE');
  
  const query3 = orderRepo
    .createQueryBuilder('order')
    .addCommonTableExpression(
      qb => {
        return qb
          .select('user.id', 'userId')
          .addSelect('COUNT(*)', 'orderCount')
          .addSelect('SUM(order.total)', 'totalSpent')
          .from(User, 'user')
          .leftJoin('user.orders', 'order')
          .groupBy('user.id');
      },
      'user_stats'
    )
    .innerJoin('user_stats', 'stats', 'stats.userId = order.userId')
    .where('stats.orderCount > :count', { count: 5 });

  console.log('Tables:', query3.getInvolvedTables());
  // Output: orders, user_stats (CTE), users

  // === Scenario 4: Multiple FROM sources ===
  console.log('\n\n4️⃣  MULTIPLE FROM SOURCES');
  console.log('─'.repeat(70));
  console.log('Cross-reference orders and products');
  
  const query4 = dataSource
    .createQueryBuilder()
    .select('order.id', 'orderId')
    .addSelect('product.name', 'productName')
    .from(Order, 'order')
    .addFrom(Product, 'product')
    .where('order.total > product.price');

  console.log('Tables:', query4.getInvolvedTables());
  // Output: orders, products

  // === Scenario 5: Nested subqueries ===
  console.log('\n\n5️⃣  NESTED SUBQUERIES (3 levels deep)');
  console.log('─'.repeat(70));
  console.log('Find orders containing items with expensive products');
  
  const query5 = orderRepo
    .createQueryBuilder('order')
    .where(qb => {
      const subQuery1 = qb
        .subQuery()
        .select('item.orderId')
        .from(OrderItem, 'item')
        .where(qb2 => {
          const subQuery2 = qb2
            .subQuery()
            .select('product.id')
            .from(Product, 'product')
            .where('product.price > :price', { price: 1000 })
            .getQuery();
          return 'item.productId IN ' + subQuery2;
        })
        .getQuery();
      return 'order.id IN ' + subQuery1;
    });

  console.log('Tables:', query5.getInvolvedTables());
  // Output: orders, order_items, products

  // === Scenario 6: Multiple CTEs ===
  console.log('\n\n6️⃣  MULTIPLE CTEs');
  console.log('─'.repeat(70));
  console.log('Complex query with multiple temporary result sets');
  
  const query6 = orderRepo
    .createQueryBuilder('order')
    .addCommonTableExpression(
      qb => qb
        .select('user.id')
        .from(User, 'user')
        .where('user.email LIKE :pattern', { pattern: '%@company.com' }),
      'company_users'
    )
    .addCommonTableExpression(
      qb => qb
        .select('product.id')
        .from(Product, 'product')
        .where('product.price > :price', { price: 100 }),
      'premium_products'
    )
    .innerJoin('company_users', 'cu', 'cu.id = order.userId');

  console.log('Tables:', query6.getInvolvedTables());
  // Output: orders, company_users (CTE), premium_products (CTE), users, products

  // === Scenario 7: Complex multi-level joins ===
  console.log('\n\n7️⃣  COMPLEX MULTI-LEVEL JOINS');
  console.log('─'.repeat(70));
  console.log('Join across all related tables');
  
  const query7 = orderRepo
    .createQueryBuilder('order')
    .leftJoinAndSelect('order.user', 'user')
    .leftJoinAndSelect('order.items', 'item')
    .leftJoinAndSelect('item.product', 'product')
    .where('user.name = :name', { name: 'VIP Customer' })
    .andWhere('product.price > :minPrice', { minPrice: 50 })
    .andWhere('order.status = :status', { status: 'shipped' });

  console.log('Tables:', query7.getInvolvedTables());
  // Output: orders, users, order_items, products

  // === Scenario 8: UPDATE with subquery ===
  console.log('\n\n8️⃣  UPDATE WITH SUBQUERY');
  console.log('─'.repeat(70));
  console.log('Update orders based on user condition');
  
  const query8 = orderRepo
    .createQueryBuilder()
    .update(Order)
    .set({ status: 'archived' })
    .where(qb => {
      const subQuery = qb
        .subQuery()
        .select('user.id')
        .from(User, 'user')
        .where('user.email IS NULL')
        .getQuery();
      return 'userId IN ' + subQuery;
    });

  console.log('Tables:', query8.getInvolvedTables());
  // Output: orders, users

  // === Scenario 9: DELETE with subquery ===
  console.log('\n\n9️⃣  DELETE WITH SUBQUERY');
  console.log('─'.repeat(70));
  console.log('Delete orders with no items');
  
  const query9 = orderRepo
    .createQueryBuilder('order')
    .delete()
    .from(Order)
    .where(qb => {
      const subQuery = qb
        .subQuery()
        .select('item.orderId')
        .from(OrderItem, 'item')
        .getQuery();
      return 'id NOT IN ' + subQuery;
    });

  console.log('Tables:', query9.getInvolvedTables());
  // Output: orders, order_items

  // === Scenario 10: Subquery in FROM clause (derived table) ===
  console.log('\n\n🔟 SUBQUERY IN FROM CLAUSE');
  console.log('─'.repeat(70));
  console.log('Query from a derived table');
  
  // Note: TypeORM has limited support for this, but the detection would work
  const subQueryBuilder = dataSource
    .createQueryBuilder()
    .select('user.id', 'userId')
    .addSelect('COUNT(*)', 'orderCount')
    .from(User, 'user')
    .leftJoin('user.orders', 'order')
    .groupBy('user.id');

  console.log('Tables from subquery:', subQueryBuilder.getInvolvedTables());
  // Output: users, orders

  console.log('\n\n' + '='.repeat(70));
  console.log('✅ All scenarios completed!');
  console.log('='.repeat(70));

  await dataSource.destroy();
}

// Run the examples
main().catch(console.error);

