/**
 * Custom plugin example
 * 
 * This example shows how to create your own plugin
 * for specific use cases like monitoring, auditing, or metrics
 */

import { 
  QueryHookPlugin, 
  QueryHookContext,
  enableQueryHooks, 
  registerPlugin,
  TableExtractorPlugin 
} from '../src';

// === Example 1: Query Performance Monitor ===

interface QueryStats {
  totalQueries: number;
  tableAccess: Record<string, number>;
  complexQueries: number; // queries with 3+ tables
}

const stats: QueryStats = {
  totalQueries: 0,
  tableAccess: {},
  complexQueries: 0
};

const PerformanceMonitorPlugin: QueryHookPlugin = {
  name: 'PerformanceMonitor',

  onEnable: () => {
    console.log('🚀 Performance monitoring enabled');
  },

  onQueryBuild: (context: QueryHookContext) => {
    stats.totalQueries++;

    // Use table extractor if available
    if (typeof (context.builder as any).getInvolvedTables === 'function') {
      const tables = (context.builder as any).getInvolvedTables();

      // Track per-table access
      tables.forEach((table: string) => {
        stats.tableAccess[table] = (stats.tableAccess[table] || 0) + 1;
      });

      // Track complex queries
      if (tables.length >= 3) {
        stats.complexQueries++;
        console.warn(`⚠️  Complex query detected (${tables.length} tables):`, tables);
      }
    }
  }
};

// === Example 2: Security Audit Plugin ===

const sensitiveTable = ['users', 'payments', 'credentials'];

const SecurityAuditPlugin: QueryHookPlugin = {
  name: 'SecurityAudit',

  onQueryBuild: (context: QueryHookContext) => {
    if (typeof (context.builder as any).getInvolvedTables === 'function') {
      const tables = (context.builder as any).getInvolvedTables();
      
      const accessingSensitive = tables.filter((t: string) => 
        sensitiveTable.includes(t)
      );

      if (accessingSensitive.length > 0) {
        console.log('🔒 Audit Log:', {
          timestamp: context.timestamp.toISOString(),
          sensitiveTables: accessingSensitive,
          query: context.sql.substring(0, 100) + '...'
        });
      }
    }
  }
};

// === Example 3: Development Debug Plugin ===

const DevDebugPlugin: QueryHookPlugin = {
  name: 'DevDebug',

  onQueryBuild: (context: QueryHookContext) => {
    // Only run in development
    if (process.env.NODE_ENV !== 'production') {
      const tables = typeof (context.builder as any).getInvolvedTables === 'function'
        ? (context.builder as any).getInvolvedTables()
        : [];

      console.log('\n' + '='.repeat(60));
      console.log('🐛 DEBUG INFO');
      console.log('='.repeat(60));
      console.log('Time:', context.timestamp.toISOString());
      console.log('Tables:', tables);
      console.log('SQL:', context.sql);
      console.log('='.repeat(60) + '\n');
    }
  }
};

// === Example 4: Metrics Export Plugin ===

interface MetricsCollector {
  recordQuery(metric: string, value: number, tags: Record<string, string>): void;
}

function createMetricsPlugin(collector: MetricsCollector): QueryHookPlugin {
  return {
    name: 'MetricsExporter',

    onQueryBuild: (context: QueryHookContext) => {
      if (typeof (context.builder as any).getInvolvedTables === 'function') {
        const tables = (context.builder as any).getInvolvedTables();

        // Record total queries
        collector.recordQuery('db.queries.total', 1, {});

        // Record table access
        tables.forEach((table: string) => {
          collector.recordQuery('db.table.access', 1, { table });
        });

        // Record query complexity
        collector.recordQuery('db.query.complexity', tables.length, {});
      }
    }
  };
}

// === Usage ===

function setupCustomPlugins() {
  // Enable hooks
  enableQueryHooks();

  // Register table extractor (needed by other plugins)
  registerPlugin(TableExtractorPlugin);

  // Register custom plugins
  registerPlugin(PerformanceMonitorPlugin);
  registerPlugin(SecurityAuditPlugin);
  
  if (process.env.NODE_ENV === 'development') {
    registerPlugin(DevDebugPlugin);
  }

  // Example metrics collector
  const mockMetricsCollector: MetricsCollector = {
    recordQuery: (metric, value, tags) => {
      console.log(`📈 Metric: ${metric}=${value}`, tags);
    }
  };

  registerPlugin(createMetricsPlugin(mockMetricsCollector));
}

// Export stats getter for external use
export function getPerformanceStats(): QueryStats {
  return { ...stats };
}

export { setupCustomPlugins };

// If running directly
if (require.main === module) {
  setupCustomPlugins();
  console.log('✅ Custom plugins loaded');
  
  // Example: Print stats after some time
  setTimeout(() => {
    console.log('\n📊 Performance Stats:', getPerformanceStats());
  }, 5000);
}

