# Contributing to typeorm-query-hooks

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- Clear, descriptive title
- Detailed steps to reproduce
- Expected vs actual behavior
- Code samples
- Environment details (versions, OS, etc.)

Use the bug report template when creating issues.

### Suggesting Features

Feature suggestions are welcome! Please:

- Check if the feature has already been suggested
- Provide clear use cases and benefits
- Include code examples of how you'd like to use it
- Consider if it fits the project's scope

Use the feature request template when creating issues.

### Pull Requests

1. **Fork the repository** and create your branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Follow the coding style**:
   - Use TypeScript
   - Follow existing patterns
   - Add JSDoc comments for public APIs
   - Use descriptive variable names

3. **Write tests**:
   - Add tests for new features
   - Ensure all tests pass: `npm test`
   - Maintain or improve code coverage

4. **Update documentation**:
   - Update README.md if needed
   - Add examples if applicable
   - Update TypeScript types

5. **Commit messages**:
   Use conventional commit format:
   ```
   feat: add support for CTEs
   fix: handle null expressionMap
   docs: update installation guide
   test: add tests for subqueries
   chore: update dependencies
   ```

6. **Create the PR**:
   - Fill out the PR template completely
   - Link related issues
   - Request review from @RoyLeibo

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/typeorm-query-hooks.git
cd typeorm-query-hooks

# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:cov

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Build
npm run build

# Watch mode for development
npm run watch
```

## Project Structure

```
typeorm-query-hooks/
├── src/
│   ├── index.ts                      # Core hook system
│   ├── plugins/
│   │   ├── table-extractor.ts        # Table extraction
│   │   ├── query-logger.ts           # Logging plugin
│   │   └── query-metadata-registry.ts # SQL → metadata mapping
│   └── nestjs/
│       └── index.ts                  # NestJS integration
├── test/
│   ├── core.spec.ts                  # Core tests
│   ├── table-extractor.spec.ts       # Table extraction tests
│   ├── query-logger.spec.ts          # Logger tests
│   ├── query-metadata-registry.spec.ts
│   └── advanced-scenarios.spec.ts    # Complex query tests
├── examples/                         # Usage examples
└── docs/                            # Documentation
```

## Testing Guidelines

- Write unit tests for all new functionality
- Test edge cases and error conditions
- Use descriptive test names
- Group related tests with `describe` blocks
- Mock external dependencies when appropriate

Example:
```typescript
describe('TableExtractorPlugin', () => {
  describe('simple queries', () => {
    it('should extract table from SELECT query', () => {
      // Test implementation
    });
  });

  describe('complex queries', () => {
    it('should extract tables from nested subqueries', () => {
      // Test implementation
    });
  });
});
```

## Documentation Guidelines

- Use clear, simple language
- Provide code examples
- Explain why, not just what
- Update TypeScript types and JSDoc
- Add examples to `/examples` directory for major features

## Style Guide

### TypeScript

- Use TypeScript strict mode
- Define explicit types for public APIs
- Use interfaces for public contracts
- Use type for unions and internal types
- Avoid `any` (use `unknown` if needed)

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Add trailing commas in multi-line arrays/objects
- Max line length: 100 characters (flexible)
- Use arrow functions for callbacks

### Naming Conventions

- **Functions**: camelCase (`extractTablesFromBuilder`)
- **Classes**: PascalCase (`QueryMetadataRegistry`)
- **Interfaces**: PascalCase with descriptive names (`QueryHookPlugin`)
- **Constants**: UPPER_SNAKE_CASE for true constants
- **Private members**: prefix with underscore (`_registry`)

## Commit Message Format

Follow conventional commits:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Example**:
```
feat(plugins): add support for recursive CTE extraction

- Recursively extract tables from CTEs
- Handle nested CTEs correctly
- Add tests for complex CTE scenarios

Closes #123
```

## Review Process

1. **Automated checks** run on every PR:
   - Linting
   - Tests on Node 16, 18, 20
   - Build verification
   - Coverage report

2. **Code review** by maintainer:
   - Code quality
   - Test coverage
   - Documentation
   - Breaking changes

3. **Approval and merge**:
   - At least 1 approval required
   - All checks must pass
   - Squash and merge (usually)

## Release Process

Releases are managed by the maintainer:

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create GitHub release with tag
4. Automatic publish to npm

## Questions?

- Open an issue for questions
- Tag with `question` label
- Check existing issues and documentation first

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be recognized in:
- GitHub contributors list
- Release notes (for significant contributions)
- README.md (for major features)

Thank you for contributing! 🎉

