/**
 * NestJS integration for typeorm-query-hooks
 * 
 * This module provides utilities for integrating the query hooks
 * with NestJS dependency injection and TypeORM Logger
 */

import { Logger as TypeOrmLogger } from 'typeorm';
import { getTablesFromSQL, hasQueryMetadata } from '../plugins/query-metadata-registry';

/**
 * Abstract base class for TypeORM Logger with table extraction support
 * Extend this in your NestJS service to get automatic table extraction
 */
export abstract class BaseQueryLogger implements TypeOrmLogger {
  /**
   * Get tables from a SQL query using the metadata registry
   * This works for queries that went through QueryBuilder
   * @param query - Raw SQL string
   * @returns Array of table names
   */
  protected getTablesFromQuery(query: string): string[] {
    return getTablesFromSQL(query);
  }

  /**
   * Check if metadata is available for this query
   * @param query - Raw SQL string
   * @returns true if metadata was captured from QueryBuilder
   */
  protected hasMetadata(query: string): boolean {
    return hasQueryMetadata(query);
  }

  /**
   * Get first table name (useful for metrics)
   * @param query - Raw SQL string
   * @returns First table name or 'unknown'
   */
  protected getPrimaryTable(query: string): string {
    const tables = this.getTablesFromQuery(query);
    return tables[0] || 'unknown';
  }

  // TypeORM Logger interface methods (to be implemented by subclass)
  abstract logQuery(query: string, parameters?: any[]): void;
  abstract logQueryError(error: string | Error, query: string, parameters?: any[]): void;
  abstract logQuerySlow(time: number, query: string, parameters?: any[]): void;
  abstract logSchemaBuild(message: string): void;
  abstract logMigration(message: string): void;
  abstract log(level: 'log' | 'info' | 'warn', message: any): void;
}

/**
 * Utility class that can be injected into any NestJS service
 * Provides table extraction without needing to extend BaseQueryLogger
 */
export class QueryMetadataService {
  /**
   * Get tables from a SQL query
   * @param query - Raw SQL string
   * @returns Array of table names
   */
  getTablesFromQuery(query: string): string[] {
    return getTablesFromSQL(query);
  }

  /**
   * Check if metadata is available
   * @param query - Raw SQL string
   */
  hasMetadata(query: string): boolean {
    return hasQueryMetadata(query);
  }

  /**
   * Get first table name
   * @param query - Raw SQL string
   */
  getPrimaryTable(query: string): string {
    const tables = this.getTablesFromQuery(query);
    return tables[0] || 'unknown';
  }

  /**
   * Get all tables with count
   * @param query - Raw SQL string
   */
  getTableInfo(query: string): { tables: string[]; count: number } {
    const tables = this.getTablesFromQuery(query);
    return { tables, count: tables.length };
  }
}

