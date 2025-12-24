import { AsyncLocalStorage } from 'async_hooks';
import { QueryBuilder } from 'typeorm';

export interface QueryContext {
  builder: QueryBuilder<any>;
  sql?: string; // Optional - not available until after execution
  tables: string[];
  queryType?: string;
  timestamp?: Date;
}

// AsyncLocalStorage to pass QueryBuilder through execution context
export const queryContextStore = new AsyncLocalStorage<QueryContext>();






