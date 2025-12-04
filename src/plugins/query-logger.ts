import { QueryHookPlugin, QueryHookContext } from '../index';

/**
 * Configuration options for QueryLoggerPlugin
 */
export interface QueryLoggerOptions {
  /**
   * Whether to log the SQL query
   */
  logSql?: boolean;

  /**
   * Whether to log timestamp
   */
  logTimestamp?: boolean;

  /**
   * Custom logger function (defaults to console.log)
   */
  logger?: (message: string) => void;

  /**
   * Filter function to determine which queries to log
   */
  filter?: (context: QueryHookContext) => boolean;
}

/**
 * Creates a Query Logger Plugin with the given options
 * @param options - Configuration options
 */
export function createQueryLoggerPlugin(options: QueryLoggerOptions = {}): QueryHookPlugin {
  const {
    logSql = true,
    logTimestamp = true,
    logger = console.log,
    filter
  } = options;

  return {
    name: 'QueryLogger',

    onQueryBuild: (context) => {
      // Apply filter if provided
      if (filter && !filter(context)) {
        return;
      }

      const parts: string[] = ['[QueryLogger]'];

      if (logTimestamp) {
        parts.push(`[${context.timestamp.toISOString()}]`);
      }

      if (logSql) {
        parts.push(context.sql);
      }

      logger(parts.join(' '));
    }
  };
}

/**
 * Default Query Logger Plugin instance
 * Logs all queries with timestamps
 */
export const QueryLoggerPlugin = createQueryLoggerPlugin();

