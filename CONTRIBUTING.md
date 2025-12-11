# Contributing to 8004-backend

Thank you for your interest in contributing! This document provides guidelines for contributing.

## Code of Conduct

By participating, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/8004-backend.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Run tests: `pnpm run test:coverage`
6. Commit and push
7. Open a Pull Request

## Development Setup

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm run dev
```

## Code Standards

### Language

- **All code, comments, and documentation must be in English**

### TypeScript

- Use strict TypeScript with no `any` types
- Define explicit return types for all functions
- Use Zod for runtime validation

### Testing

- **70% branch coverage minimum is required**
- Run `pnpm run test:coverage` before submitting

### Commit Messages

Follow conventional commit format:

```
type(scope): description
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Pull Request Process

1. Ensure all tests pass: `pnpm run test:coverage`
2. Ensure linter passes: `pnpm run lint`
3. Ensure types check: `pnpm run typecheck`
4. Update documentation if needed
5. Update CHANGELOG.md if applicable

## API Guidelines

### Response Format

```typescript
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": "message", "code": "ERROR_CODE" }
```

### Error Handling

```typescript
import { errors } from '@/lib/utils/errors';
return errors.notFound(c, 'Agent');
```

Thank you for contributing!
