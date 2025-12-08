# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email security concerns to the maintainers
3. Include detailed description of the vulnerability
4. Provide steps to reproduce if possible

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 1 week
- **Resolution**: Depends on severity

## Security Measures

This project implements:

- Input validation with Zod
- Rate limiting
- CORS configuration
- Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- No secrets in code (environment variables only)

## Scope

Security vulnerabilities in the following are in scope:

- API endpoints
- Authentication/Authorization logic
- Data validation
- Dependency vulnerabilities

## Out of Scope

- Third-party services (Cloudflare, etc.)
- Social engineering attacks
- DoS attacks

Thank you for helping keep 8004-backend secure!
