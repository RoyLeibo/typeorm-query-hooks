import { AsyncLocalStorage } from 'async_hooks';
import { QueryBuilder } from 'typeorm';

export interface QueryContext {
  builder: QueryBuilder<any>;
  sql: string;
  tables: string[];
  queryType?: string;
}

// AsyncLocalStorage to pass QueryBuilder through execution context
export const queryContextStore = new AsyncLocalStorage<QueryContext>();

