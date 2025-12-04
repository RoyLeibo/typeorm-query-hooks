/**
 * Basic usage example for typeorm-query-hooks
 * 
 * This example shows how to:
 * 1. Initialize the library
 * 2. Register plugins
 * 3. Use the new methods in your code
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

  @OneToMany(() => Post, post => post.author)
  posts!: Post[];
}

@Entity('posts')
class Post {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @ManyToOne(() => User, user => user.posts)
  author!: User;

  @OneToMany(() => Comment, comment => comment.post)
  comments!: Comment[];
}

@Entity('comments')
class Comment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  text!: string;

  @ManyToOne(() => Post, post => post.comments)
  post!: Post;
}

// === Setup ===

async function main() {
  // 1. Enable hooks BEFORE creating any queries
  enableQueryHooks();

  // 2. Register the table extractor plugin
  registerPlugin(TableExtractorPlugin);

  // 3. (Optional) Listen to table extraction events
  onTablesExtracted((tables, builder, sql) => {
    console.log('📊 Tables involved:', tables);
    console.log('🔍 SQL:', sql.substring(0, 100) + '...\n');
  });

  // 4. Setup TypeORM connection
  const dataSource = new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: [User, Post, Comment],
    synchronize: true,
    logging: false
  });

  await dataSource.initialize();

  // === Use the library ===

  const userRepo = dataSource.getRepository(User);

  console.log('Example 1: Simple query\n' + '='.repeat(50));
  const simpleQuery = userRepo.createQueryBuilder('user');
  console.log('Tables:', simpleQuery.getInvolvedTables());
  // Output: ['users']

  console.log('\nExample 2: Query with join\n' + '='.repeat(50));
  const joinQuery = userRepo
    .createQueryBuilder('user')
    .leftJoinAndSelect('user.posts', 'post');
  console.log('Tables:', joinQuery.getInvolvedTables());
  // Output: ['users', 'posts']

  console.log('\nExample 3: Complex query\n' + '='.repeat(50));
  const complexQuery = userRepo
    .createQueryBuilder('user')
    .leftJoinAndSelect('user.posts', 'post')
    .leftJoinAndSelect('post.comments', 'comment')
    .where('user.name = :name', { name: 'John' });
  console.log('Tables:', complexQuery.getInvolvedTables());
  // Output: ['users', 'posts', 'comments']

  console.log('\nExample 4: Executing query (triggers hook)\n' + '='.repeat(50));
  await complexQuery.getMany(); // This will trigger the onTablesExtracted listener

  await dataSource.destroy();
}

// Run the example
main().catch(console.error);

