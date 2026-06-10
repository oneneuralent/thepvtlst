# Cloudflare

Use Cloudflare as DNS, CDN, and WAF. Keep GoDaddy as registrar only.

1. Change GoDaddy nameservers to Cloudflare nameservers.
2. Add the domain to Vercel.
3. Copy Vercel's DNS records into Cloudflare.
4. Keep proxy enabled for normal web records unless Vercel instructs otherwise.
