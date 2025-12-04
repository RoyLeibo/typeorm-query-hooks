# Automatic Versioning Rules

The auto-release workflow automatically versions and publishes based on commit messages.

## Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

### Patch Release (1.0.0 → 1.0.1)
Bug fixes and small changes:
```
fix: resolve table extraction for CTEs
fix(nestjs): handle null metadata gracefully
perf: optimize query builder patching
refactor: simplify plugin registration
```

### Minor Release (1.0.0 → 1.1.0)
New features (backward compatible):
```
feat: add support for subqueries
feat(plugins): add new QueryTimingPlugin
```

### Major Release (1.0.0 → 2.0.0)
Breaking changes:
```
feat!: change plugin API signature
fix!: remove deprecated methods

BREAKING CHANGE: The plugin interface now requires async methods
```

### No Release
Documentation, tests, chores:
```
docs: update README
test: add edge case coverage
chore: update dependencies
ci: fix workflow permissions
```

## How It Works

1. **Push to main** with conventional commit message
2. **GitHub Action** analyzes commit message
3. **Auto-bump** version in package.json
4. **Auto-create** git tag (e.g., v1.0.1)
5. **Auto-create** GitHub Release
6. **Auto-publish** to npm (if NPM_TOKEN is set)

## Example Workflow

```bash
# Make changes
git add .
git commit -m "feat: add query caching plugin"
git push origin main

# GitHub automatically:
# ✅ Bumps version to 1.1.0
# ✅ Creates tag v1.1.0
# ✅ Creates GitHub Release
# ✅ Publishes to npm
```

