# Security Policy

## Supported Versions

We release security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 2.x.x   | :white_check_mark: |
| 1.x.x   | :x:                |

## Reporting a Vulnerability

We take the security of KOBEYA Study Partner seriously. If you discover a security vulnerability, please follow these steps:

### 1. **DO NOT** Open a Public Issue

Please do not report security vulnerabilities through public GitHub issues.

### 2. Send a Private Report

Email us at: **info@kobeya-programming.com**

Include the following information:
- Type of vulnerability
- Full paths of source file(s) affected
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability

### 3. Response Timeline

- **Acknowledgment**: We will acknowledge receipt within 48 hours
- **Initial Assessment**: We will provide an initial assessment within 5 business days
- **Fix Timeline**: We will work with you to resolve the issue as quickly as possible
- **Disclosure**: We will coordinate disclosure timing with you

## Security Best Practices

### Environment Variables

**NEVER commit sensitive data to the repository:**

- ✅ Use `.env` files (gitignored) for local development
- ✅ Use Cloudflare Pages environment variables for production
- ✅ Use `wrangler secret` commands for sensitive secrets
- ❌ Never hardcode API keys, passwords, or secrets in code

### Required Environment Variables

| Variable | Purpose | Storage Method |
|----------|---------|----------------|
| `OPENAI_API_KEY` | OpenAI API authentication | Wrangler secret or Cloudflare Pages env |
| `WEBHOOK_SECRET` | Webhook authentication | Wrangler secret or Cloudflare Pages env |
| `ADMIN_EMAIL` | Administrator email | Wrangler secret or Cloudflare Pages env |

### Deployment Security

Before deploying to production:

1. **Set all required secrets:**
   ```bash
   wrangler secret put OPENAI_API_KEY
   wrangler secret put WEBHOOK_SECRET
   wrangler secret put ADMIN_EMAIL
   ```

2. **Verify `.gitignore` includes:**
   - `.env`
   - `.dev.vars`
   - `.wrangler/`
   - `*.log`

3. **Review all code changes** for accidentally committed secrets

4. **Test in staging** before deploying to production

## Known Security Considerations

### Database IDs

The following IDs are safe to be public (they require authentication to access):
- Cloudflare D1 Database ID
- Cloudflare KV Namespace ID

These are included in `wrangler.toml` and do not pose a security risk.

### Authentication

- Student authentication uses `APP_KEY` tokens
- Admin endpoints require `ADMIN_EMAIL` verification
- Webhooks require `WEBHOOK_SECRET` for authentication

## Security Updates

We will notify users of security updates through:
- GitHub Security Advisories
- Release notes on GitHub Releases
- Email to registered administrators

## Third-Party Dependencies

We regularly update dependencies to patch known vulnerabilities. Please ensure you:
- Run `npm audit` regularly
- Keep dependencies up to date
- Review security advisories for Cloudflare Workers, Hono.js, and OpenAI SDK

## Contact

For security concerns, contact:
- 📧 Email: info@kobeya-programming.com
- 🌐 Website: [kobeya.com](https://kobeya.com)

---

**Last Updated**: 2026-02-03
