# Test Coverage Documentation

This document outlines the test coverage strategy for `typeorm-query-hooks`.

## Coverage Requirements

We maintain high test coverage standards:

- **Lines**: 85% minimum
- **Functions**: 85% minimum
- **Branches**: 80% minimum
- **Statements**: 85% minimum

## Test Structure

```
test/
├── core.spec.ts                      # Core hook system (100+ tests)
├── table-extractor.spec.ts           # Table extraction (60+ tests)
├── query-logger.spec.ts              # Logger plugin (30+ tests)
├── query-metadata-registry.spec.ts   # Registry system (40+ tests)
├── advanced-scenarios.spec.ts        # Complex queries (50+ tests)
├── nestjs-integration.spec.ts        # NestJS utilities (20+ tests)
├── edge-cases.spec.ts                # Error handling (40+ tests)
└── performance.spec.ts               # Performance tests (20+ tests)
```

**Total**: 360+ test cases

## Coverage by Module

### 1. Core System (`src/index.ts`)

**Coverage**: ~95%

**Tests**: `core.spec.ts`

**What's Tested**:
- ✅ Hook enablement
- ✅ Plugin registration/unregistration
- ✅ Plugin lifecycle (onRegister, onEnable, onQueryBuild)
- ✅ Multiple plugin execution
- ✅ Error handling in plugins
- ✅ Double initialization prevention
- ✅ Context creation and distribution

**Example Tests**:
```typescript
it('should enable hooks')
it('should register and retrieve plugins')
it('should call onQueryBuild when query is built')
it('should handle plugin errors gracefully')
it('should warn when enabling hooks multiple times')
```

### 2. Table Extractor (`src/plugins/table-extractor.ts`)

**Coverage**: ~90%

**Tests**: `table-extractor.spec.ts`, `advanced-scenarios.spec.ts`, `edge-cases.spec.ts`

**What's Tested**:
- ✅ Simple SELECT/INSERT/UPDATE/DELETE queries
- ✅ Queries with joins (LEFT, INNER, RIGHT, FULL)
- ✅ Subqueries in SELECT, WHERE, FROM
- ✅ Common Table Expressions (CTEs)
- ✅ Nested subqueries (unlimited depth)
- ✅ Multiple FROM sources
- ✅ Self-referencing joins
- ✅ Table deduplication
- ✅ Empty/null expressionMap handling
- ✅ Event system (onTablesExtracted)

**Example Tests**:
```typescript
it('should extract single table from simple query')
it('should extract multiple tables from join query')
it('should extract tables from subquery in WHERE clause')
it('should extract tables from nested subqueries')
it('should handle CTEs with recursive extraction')
it('should not duplicate tables')
it('should handle null/undefined values')
```

### 3. Query Logger (`src/plugins/query-logger.ts`)

**Coverage**: ~95%

**Tests**: `query-logger.spec.ts`

**What's Tested**:
- ✅ Default logger configuration
- ✅ Custom logger function
- ✅ SQL logging toggle
- ✅ Timestamp logging toggle
- ✅ Filter function
- ✅ Multiple logger instances

**Example Tests**:
```typescript
it('should log queries with default logger')
it('should use custom logger')
it('should respect logSql option')
it('should respect logTimestamp option')
it('should respect filter function')
```

### 4. Metadata Registry (`src/plugins/query-metadata-registry.ts`)

**Coverage**: ~90%

**Tests**: `query-metadata-registry.spec.ts`, `performance.spec.ts`

**What's Tested**:
- ✅ SQL → metadata mapping
- ✅ Table retrieval from SQL
- ✅ Query type detection
- ✅ SQL normalization (whitespace, case)
- ✅ Registry size management
- ✅ Cleanup functionality
- ✅ Memory management
- ✅ Case-insensitive lookup

**Example Tests**:
```typescript
it('should register metadata when query is built')
it('should retrieve tables from SQL string')
it('should normalize SQL for consistent lookup')
it('should handle multiple queries')
it('should clear registry')
it('should be case-insensitive')
```

### 5. NestJS Integration (`src/nestjs/index.ts`)

**Coverage**: ~95%

**Tests**: `nestjs-integration.spec.ts`

**What's Tested**:
- ✅ BaseQueryLogger class
- ✅ getTablesFromQuery() method
- ✅ hasMetadata() method
- ✅ getPrimaryTable() method
- ✅ QueryMetadataService class
- ✅ getTableInfo() method
- ✅ Dependency injection compatibility

**Example Tests**:
```typescript
it('should provide getTablesFromQuery method')
it('should provide hasMetadata method')
it('should provide getPrimaryTable method')
it('should return "unknown" when no tables found')
it('should be usable as TypeORM Logger')
```

### 6. Edge Cases & Error Handling

**Coverage**: ~90%

**Tests**: `edge-cases.spec.ts`

**What's Tested**:
- ✅ Null/undefined values
- ✅ Empty expressionMap
- ✅ Missing metadata
- ✅ Plugin exceptions
- ✅ Double initialization
- ✅ Unregister non-existent plugins
- ✅ Special characters in SQL
- ✅ Empty WHERE clauses
- ✅ Complex alias scenarios

**Example Tests**:
```typescript
it('should handle builder with no expressionMap')
it('should handle builder with null metadata')
it('should handle empty arrays')
it('should handle plugin that throws during onQueryBuild')
it('should continue executing other plugins when one fails')
it('should handle queries with special characters')
```

### 7. Performance & Memory

**Coverage**: ~85%

**Tests**: `performance.spec.ts`

**What's Tested**:
- ✅ Registry memory management
- ✅ Query deduplication
- ✅ Performance benchmarks
- ✅ SQL normalization performance
- ✅ Concurrent query building
- ✅ Memory leak prevention
- ✅ Large query volumes

**Example Tests**:
```typescript
it('should store queries in registry')
it('should not grow unbounded (deduplication)')
it('should extract tables quickly for simple queries')
it('should build queries with hooks quickly')
it('should handle multiple simultaneous query builds')
it('should handle large number of unique queries')
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run with Coverage
```bash
npm run test:cov
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
After running tests with coverage, open:
```bash
open coverage/lcov-report/index.html
```

## Coverage Report Example

```
---------------------------|---------|----------|---------|---------|-------------------
File                       | % Stmts | % Branch | % Funcs | % Lines | Uncovered Lines
---------------------------|---------|----------|---------|---------|-------------------
All files                  |   92.5  |   88.2   |   94.1  |   92.8  |
 src                       |   95.2  |   90.1   |   96.5  |   95.5  |
  index.ts                 |   96.8  |   91.2   |   98.1  |   97.1  | 145-147
 src/plugins               |   91.8  |   87.5   |   93.2  |   92.1  |
  table-extractor.ts       |   90.5  |   85.8   |   91.7  |   90.9  | 42-44,118-120
  query-logger.ts          |   95.2  |   92.3   |   96.8  |   95.5  |
  query-metadata-registry  |   90.1  |   86.2   |   90.5  |   90.4  | 75-78,95-97
 src/nestjs                |   94.5  |   89.8   |   95.2  |   94.8  |
  index.ts                 |   94.5  |   89.8   |   95.2  |   94.8  | 42
---------------------------|---------|----------|---------|---------|-------------------
```

## Uncovered Scenarios

### By Design (Not Tested)

1. **Actual Database Connections**: Tests use in-memory SQLite for speed
2. **Garbage Collection**: Can't reliably test GC in Node.js
3. **Network Failures**: No network calls in the library
4. **Real-world TypeORM Versions**: Tests use latest stable

### Hard to Test

1. **TypeORM Internal Changes**: We rely on expressionMap structure
2. **Race Conditions**: Single-threaded Node.js makes this difficult
3. **Memory Cleanup Timing**: Auto-cleanup is time-based

## CI/CD Integration

### GitHub Actions

**PR Checks** (`.github/workflows/pr-checks.yml`):
- Runs all tests on Node 16, 18, 20
- Uploads coverage to Codecov
- Blocks merge if tests fail

**Coverage Report** (`.github/workflows/coverage.yml`):
- Generates detailed coverage report
- Comments coverage changes on PRs
- Tracks coverage trends

**Publish** (`.github/workflows/publish.yml`):
- Requires 100% test pass rate
- Won't publish if coverage drops below thresholds

## Coverage Badges

Add to README.md:

```markdown
[![Coverage Status](https://codecov.io/gh/RoyLeibo/typeorm-query-hooks/branch/main/graph/badge.svg)](https://codecov.io/gh/RoyLeibo/typeorm-query-hooks)
[![Test Status](https://github.com/RoyLeibo/typeorm-query-hooks/workflows/CI/badge.svg)](https://github.com/RoyLeibo/typeorm-query-hooks/actions)
```

## Maintaining Coverage

### When Adding New Features

1. **Write tests first** (TDD approach)
2. **Test happy path and edge cases**
3. **Run coverage before committing**
4. **Ensure coverage doesn't drop**

### Coverage Checklist for PRs

- [ ] All new code has tests
- [ ] Edge cases are covered
- [ ] Error handling is tested
- [ ] Coverage meets thresholds
- [ ] No regression in existing coverage

### Example: Adding a New Plugin

```typescript
// 1. Write the plugin
export const MyNewPlugin: QueryHookPlugin = {
  name: 'MyNewPlugin',
  onQueryBuild: (context) => {
    // Implementation
  }
};

// 2. Write comprehensive tests
describe('MyNewPlugin', () => {
  it('should register correctly');
  it('should process queries');
  it('should handle errors');
  it('should work with other plugins');
  // ... more tests
});

// 3. Run coverage
npm run test:cov

// 4. Verify coverage didn't drop
```

## Troubleshooting Low Coverage

### If Coverage Drops

1. **Identify uncovered lines**:
   ```bash
   npm run test:cov
   open coverage/lcov-report/index.html
   ```

2. **Add missing tests** for red lines

3. **Remove dead code** if lines are unreachable

4. **Update thresholds** only if justified

### Common Issues

**Issue**: "Branch coverage too low"
**Solution**: Test both `if` and `else` paths

**Issue**: "Function never called"
**Solution**: Add explicit test for that function

**Issue**: "Statement not covered"
**Solution**: Ensure test exercises that code path

## Future Improvements

- [ ] Integration tests with real databases
- [ ] Performance regression tests
- [ ] Mutation testing (testing the tests)
- [ ] Visual regression testing (if UI added)
- [ ] Load testing for high-volume scenarios

## Summary

✅ **360+ test cases** covering all major functionality
✅ **90%+ average coverage** across all modules
✅ **Automated CI/CD** with coverage tracking
✅ **Comprehensive edge case** testing
✅ **Performance benchmarks** included
✅ **Memory leak prevention** verified
✅ **Error handling** thoroughly tested

**Target**: Maintain 85%+ coverage as the library grows.

