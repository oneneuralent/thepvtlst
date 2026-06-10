# Deployment

Use GoDaddy only as registrar. Move DNS hosting to Cloudflare, then add the production domain in Vercel.
Vercel will provide the DNS records to set in Cloudflare.

Recommended hosting:

- Web: Vercel
- Auth/DB/Storage/Realtime: Supabase
- Agent API: Fly.io, Render, Railway, or ECS/Fargate
- DNS/WAF/CDN: Cloudflare
