# Vercel Env Vars Checklist — O.N.E Web App

Add these to Vercel → Project → Settings → Environment Variables (Production + Preview).

## ✅ Already Set (verified in your Vercel dashboard)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
AGENT_API_URL            = https://hermes-agent-production-7a27.up.railway.app
AGENT_API_SECRET
OPENROUTER_API_KEY
OPENROUTER_MODEL         = nvidia/nemotron-3-super-120b-a12b:free
TAVILY_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
TOKEN_ENCRYPTION_KEY
NEXT_PUBLIC_APP_URL      = https://project-ilw5k.vercel.app  (update when domain goes live)
NVIDIA_NIM_API_KEY
AUTH_MODE                = clerk   ← CONFIRM this is "clerk" not "dev"
```

## ❌ MISSING — Add These to Vercel Now
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY   = pk_test_Z29sZGVuLXN0YWxsaW9uLTE2LmNsZXJrLmFjY291bnRzLmRldiQ
CLERK_SECRET_KEY                    = sk_test_EDPW6GuidyGiJ2IIUgDp251xwhfharHiQZ0cMuUWZ5
NEXT_PUBLIC_CLERK_SIGN_IN_URL       = /sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL       = /sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL = /app
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL = /app
GOOGLE_REDIRECT_URI                 = https://project-ilw5k.vercel.app/api/connections/google/callback
WEB_API_URL                         = https://project-ilw5k.vercel.app

## 🔧 Railway (agent-api) — Add This Env Var
```
HYPERFRAMES_RAILWAY_URL = https://railway-hyperframes-production.up.railway.app
```
(Replace with your actual Railway HyperFrames service domain once deployed)
```

## ⚠️ Cleanup (safe to remove from Vercel once AUTH_MODE=clerk)
```
DEV_USER_ID     — only used in dev mode, harmless but unnecessary
DEV_USER_EMAIL  — same
```

---

## When You Get a Custom Domain
Update these two:
```
NEXT_PUBLIC_APP_URL  = https://yourdomain.com
GOOGLE_REDIRECT_URI  = https://yourdomain.com/api/connections/google/callback
WEB_API_URL          = https://yourdomain.com
```
Also update in Google Cloud Console → OAuth → Authorized redirect URIs.

---

## Clerk: Dev → Production (when ready for public launch)
1. Clerk Dashboard → Create Production Instance
2. Get new `pk_live_` + `sk_live_` keys
3. Replace test keys in Vercel with production keys
4. Add your domain to Clerk allowed origins
5. Re-configure Google OAuth in the Clerk production instance
Note: email/password + magic link work without Google OAuth verification.
