# Contractor Development Environment Setup

## Overview
This document outlines how to set up a secure development environment for external contractors working on hyperlinklaw.com, protecting production secrets and data.

## Development vs Production Separation

### Environment Variables for Contractors

**SAFE - Development Keys:**
```
NODE_ENV=development
INDEX_SEARCH_MAX_PAGES=30
INDEX_CONTINUATION_MAX_PAGES=10
INDEX_OCR_DPI=230
INDEX_HINTS=INDEX,TABLE OF CONTENTS,TAB NO,TAB NUMBER,INDEX OF TABS

# Development Database (separate from production)
DATABASE_URL=postgresql://dev_user:dev_pass@dev-db.example.com/hyperlinklaw_dev

# Development API Keys (limited scope)
OPENAI_API_KEY=sk-dev-xxxxxxxxxxxxxxxx  # OpenAI development key with lower limits
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxx  # Stripe test mode key

# Development Auth (separate OAuth app)
REPLIT_APP_ID=dev-app-id
REPLIT_CLIENT_ID=dev-client-id
REPLIT_CLIENT_SECRET=dev-client-secret
```

**PROTECTED - Production Secrets (DO NOT SHARE):**
```
# Production Database
DATABASE_URL=postgresql://prod_user:****@prod-db/hyperlinklaw_prod

# Production API Keys
OPENAI_API_KEY=sk-proj-real-production-key
STRIPE_SECRET_KEY=sk_live_real-production-key

# Production Auth
REPLIT_APP_ID=production-app-id
REPLIT_CLIENT_ID=production-client-id
REPLIT_CLIENT_SECRET=production-client-secret
```

## Contractor Collaboration Workflow

### Step 1: Create Development Fork
1. Fork this project to a new Replit project named `hyperlinklaw-dev`
2. Replace all production secrets with development equivalents
3. Use development database with test data only

### Step 2: Invite Contractor
1. Use direct invite (not join link) for better access control
2. Invite to development fork only, never production
3. Set clear boundaries on what code areas they can modify

### Step 3: Development Database Setup
Create a separate development database with:
- Sample legal documents (not real client data)
- Test user accounts
- Limited data set for faster development/testing

### Step 4: API Key Limitations
- **OpenAI**: Use development tier with monthly limits
- **Stripe**: Always use test mode keys
- **Database**: Separate dev database with no production data

### Step 5: Code Review Process
1. All contractor changes go through pull request review
2. No direct deployment to production
3. Test changes in development environment first
4. Manual approval required before production deployment

## Security Checklist

Before inviting any contractor:
- [ ] Development database created and populated with test data
- [ ] All production secrets replaced with development equivalents
- [ ] OpenAI API key is development-tier with usage limits
- [ ] Stripe keys are test mode only
- [ ] No real client documents or data in development environment
- [ ] Clear scope of work defined
- [ ] Code review process established
- [ ] Production deployment access restricted

## Quick Development Setup Commands

```bash
# Create development database
createdb hyperlinklaw_dev

# Push schema to development database
npm run db:push

# Populate with test data
npm run seed:dev

# Start development server
npm run dev
```

## Post-Collaboration Cleanup

After contractor work is complete:
1. Remove contractor access immediately
2. Review all code changes thoroughly
3. Test in staging environment
4. Deploy approved changes to production
5. Revoke any temporary development API keys if needed

## Emergency Procedures

If contractor accidentally accesses production:
1. Immediately revoke access
2. Rotate all production API keys
3. Review all recent changes
4. Check production logs for any unauthorized access
5. Consider rolling back recent changes if necessary