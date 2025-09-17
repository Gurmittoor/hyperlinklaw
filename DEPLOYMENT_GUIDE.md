# Production Deployment Guide: hyperlinklaw.com

This guide implements the dual deployment setup with `hyperlinklaw.com` as the sales site and `app.hyperlinklaw.com` as the paid member area.

## ✅ Server Configuration Complete

The following server-side changes have been implemented:

### 1. HTTPS Enforcement & Security
- ✅ Trust proxy configuration for Replit deployment
- ✅ Automatic HTTPS redirect in production
- ✅ Enhanced security headers

### 2. Session Management
- ✅ Session cookie named `__hlaw.sid`
- ✅ Domain-scoped sessions for `app.hyperlinklaw.com`
- ✅ Secure cookie settings with `sameSite: "lax"`

### 3. CORS Configuration
- ✅ Cross-origin support between marketing and app domains
- ✅ Environment-based allowed origins
- ✅ Credential support for authentication

### 4. Root Path Redirect
- ✅ Production root path redirects to marketing site
- ✅ Configurable via `MARKETING_BASE_URL` environment variable

### 5. Health Endpoints
- ✅ `/health` and `/healthz` - Liveness probes
- ✅ `/ready` and `/readyz` - Readiness probes  
- ✅ `/metrics` - Performance metrics
- ✅ `/version` - App version info

## 🔧 Next Steps for Deployment

### Step 1: Create Two Replit Projects

#### A. Sales Site (New Repl)
- **Name**: `hyperlinklaw-site`
- **Type**: Static/HTML
- **Domain**: `hyperlinklaw.com` (+ optional `www` redirect)

#### B. App (Current Repl)
- **Keep**: Your current dashboard/backend
- **Domain**: `app.hyperlinklaw.com`

### Step 2: Environment Configuration

Set these environment variables in your App Repl (Tools → Secrets):

```bash
# Core Configuration
NODE_ENV=production
APP_BASE_URL=https://app.hyperlinklaw.com
MARKETING_BASE_URL=https://hyperlinklaw.com

# Security
SESSION_SECRET=your_64_character_random_string_here
CSP_ORIGIN=https://app.hyperlinklaw.com
ALLOWED_ORIGINS=https://app.hyperlinklaw.com,https://hyperlinklaw.com

# Rate Limiting
MAX_UPLOAD_MB=50
RATE_LIMIT_WINDOW=900
RATE_LIMIT_MAX=50

# Authentication (Replit Auth)
OAUTH_REDIRECT_URL=https://app.hyperlinklaw.com/auth/callback
REPLIT_DOMAINS=app.hyperlinklaw.com

# Database
DATABASE_URL=your_postgresql_connection_string

# AI/OpenAI
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4

# Optional: Stripe Billing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
STRIPE_SUCCESS_URL=https://app.hyperlinklaw.com/billing/success
STRIPE_CANCEL_URL=https://app.hyperlinklaw.com/billing/cancel
```

### Step 3: DNS Configuration

In your domain registrar:

**For hyperlinklaw.com (Sales Site):**
```
CNAME: @ → [Replit sales site CNAME target]
CNAME: www → [Same Replit target] (optional)
```

**For app.hyperlinklaw.com (App):**
```
CNAME: app → [Replit app CNAME target]
```

### Step 4: Replit Domain Setup

1. **Sales Repl**: Tools → Custom Domain → Add `hyperlinklaw.com`
2. **App Repl**: Tools → Custom Domain → Add `app.hyperlinklaw.com`
3. Complete TXT verification if prompted
4. Wait for SSL: Active status

### Step 5: Update OAuth Settings

**Replit Auth:**
- Add allowed redirect URI: `https://app.hyperlinklaw.com/auth/callback`

**Stripe (if using):**
- Success URL: `https://app.hyperlinklaw.com/billing/success`
- Cancel URL: `https://app.hyperlinklaw.com/billing/cancel`
- Webhook: `https://app.hyperlinklaw.com/billing/webhook`

## 🧪 Testing Commands

Run these to verify deployment:

```bash
# Sales site reachable
curl -I https://hyperlinklaw.com

# App reachable
curl -I https://app.hyperlinklaw.com

# Health checks
curl -f https://app.hyperlinklaw.com/healthz
curl -f https://app.hyperlinklaw.com/readyz

# Security headers
curl -I https://app.hyperlinklaw.com/
```

## 📋 Manual Verification

1. **Visit `hyperlinklaw.com`**: Should show sales page with CTAs to app
2. **Visit `app.hyperlinklaw.com`**: Should redirect to login if not authenticated
3. **Complete login flow**: Should reach dashboard (paid area)
4. **Test checkout**: Entitlements should auto-grant features

## 🎯 Expected Results

After completion:
- ✅ `hyperlinklaw.com` serves as public marketing website
- ✅ `app.hyperlinklaw.com` serves as secured, paid member area
- ✅ Seamless authentication flow between domains
- ✅ Automatic HTTPS enforcement
- ✅ Production-ready security configuration

## 📁 File Reference

All server-side changes have been implemented in:
- `server/index.ts` - Main server configuration
- `server/replitAuth.ts` - Session management
- `server/routes/health.ts` - Health endpoints
- `.env.production.example` - Environment variable template

The application is now ready for production deployment with the dual domain setup.