# Contributing

Thank you for your interest in contributing to the 8004 API! This guide covers everything you need to get started.

## Code of Conduct

By participating, you agree to abide by our [Code of Conduct](https://github.com/agentauri/api.8004.dev/blob/main/CODE_OF_CONDUCT.md).

## Getting Started

### 1. Fork the Repository

Fork [github.com/agentauri/api.8004.dev](https://github.com/agentauri/api.8004.dev) to your account.

### 2. Clone Your Fork

```bash
git clone https://github.com/YOUR_USERNAME/api.8004.dev.git
cd api.8004.dev
```

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Setup Environment

```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your API keys
```

### 5. Run Development Server

```bash
pnpm run dev
```

Server runs at `http://localhost:8787`.

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

Use prefixes:
- `feature/` for new features
- `fix/` for bug fixes
- `docs/` for documentation
- `refactor/` for code improvements

### 2. Make Changes

Follow our code standards (see below).

### 3. Run Tests

```bash
# Unit tests
pnpm run test

# With coverage (70% minimum required)
pnpm run test:coverage
```

### 4. Check Types

```bash
pnpm run typecheck
```

### 5. Lint Code

```bash
pnpm run lint
```

### 6. Commit Changes

```bash
git add .
git commit -m "feat(agents): add filtering by reputation"
```

### 7. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then open a Pull Request on GitHub.

## Code Standards

### Language

**All code, comments, and documentation must be in English.**

### TypeScript

- Use strict TypeScript with no `any` types
- Define explicit return types for all functions
- Use Zod for runtime validation

```typescript
// Good
function getAgent(id: string): Promise<Agent | null> {
  // ...
}

// Bad
function getAgent(id) {
  // ...
}
```

### Error Handling

Use the standard error response utilities:

```typescript
import { errors } from '@/lib/utils/errors';

// Not found
return errors.notFound(c, 'Agent');

// Validation error
return errors.validationError(c, 'Invalid agent ID');

// Internal error
return errors.internalError(c, 'Failed to process');
```

### Response Format

```typescript
// Success
return c.json({
  success: true,
  data: { ... }
});

// Error
return c.json({
  success: false,
  error: "Error message",
  code: "ERROR_CODE"
}, status);
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `agent-service.ts` |
| Functions | camelCase | `getAgentById` |
| Classes/Types | PascalCase | `AgentService` |
| Constants | SCREAMING_SNAKE | `MAX_LIMIT` |
| DB columns | snake_case | `created_at` |

## Testing

### Test Coverage

**70% branch coverage is required.** The CI will fail below this threshold.

```bash
pnpm run test:coverage
```

### Writing Tests

```typescript
import { describe, it, expect } from 'vitest';

describe('AgentService', () => {
  it('should return agent by ID', async () => {
    const agent = await service.getAgent('11155111:1');
    expect(agent).toBeDefined();
    expect(agent?.id).toBe('11155111:1');
  });
});
```

### E2E Tests

```bash
API_KEY="your-key" pnpm run test:e2e
```

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `style` | Formatting |
| `refactor` | Code restructure |
| `test` | Tests |
| `chore` | Maintenance |

### Examples

```
feat(search): add semantic search mode parameter
fix(agents): correct pagination cursor encoding
docs(api): add rate limiting documentation
refactor(cache): simplify cache key generation
test(search): add E2E tests for fallback mode
chore(deps): update hono to v4.0.0
```

## Pull Request Process

### Before Opening

- [ ] All tests pass: `pnpm run test:coverage`
- [ ] Linter passes: `pnpm run lint`
- [ ] Types check: `pnpm run typecheck`
- [ ] Documentation updated if needed
- [ ] CHANGELOG.md updated for notable changes

### PR Template

```markdown
## Description
Brief description of changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Testing
How was this tested?

## Checklist
- [ ] Tests pass
- [ ] Types check
- [ ] Lint passes
- [ ] Docs updated
```

### Review Process

1. Maintainer reviews code
2. CI checks must pass
3. At least one approval required
4. Squash and merge

## Project Structure

```
api.8004.dev/
├── src/
│   ├── index.ts           # Entry point
│   ├── routes/            # API endpoints
│   ├── services/          # Business logic
│   ├── db/                # Database queries
│   ├── lib/               # Utilities
│   └── types/             # TypeScript types
├── migrations/            # D1 migrations
├── scripts/               # Build/test scripts
├── docs/                  # Documentation (VitePress)
└── test/                  # Test files
```

## Getting Help

- **Questions**: Open a [Discussion](https://github.com/agentauri/api.8004.dev/discussions)
- **Bugs**: Open an [Issue](https://github.com/agentauri/api.8004.dev/issues)
- **Security**: Email [security@8004.dev](mailto:security@8004.dev)

## Related

- [Architecture](/contributing/architecture)
- [Testing Guide](/contributing/testing)
- [Deployment Guide](/contributing/deployment)
