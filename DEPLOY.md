# 🚀 Deployment Guide

## Quick Deploy

```bash
./deploy.sh
```

## Manual Deploy

### Frontend (Vercel)

```bash
cd frontend
vercel --prod
```

### Backend (Railway)

```bash
cd backend
railway up
```

## Environment Variables

### Frontend (Vercel Dashboard → Settings → Environment Variables)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `NEXTAUTH_SECRET` | Generate with: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Your Vercel app URL (e.g., `https://lumi.vercel.app`) |
| `NEXT_PUBLIC_API_URL` | Your Railway backend URL |

### Backend (Railway Dashboard → Variables)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key |
| `ANTHROPIC_API_KEY` | Claude API key |
| `GOOGLE_DRIVE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | Google refresh token |
| `ASSEMBLYAI_API_KEY` | AssemblyAI API key |
| `MEETINGS_POLL_SECRET` | Any random string |
| `BACKEND_BASE_URL` | Your Railway backend URL |
| `FRONTEND_BASE_URL` | Your Vercel frontend URL |

## Custom Domain

1. Buy a domain (Namecheap, Cloudflare, etc.)
2. In Vercel Dashboard → Settings → Domains → Add domain
3. Configure DNS:
   - **A record** → `76.76.21.21`
   - **CNAME** → `cname.vercel-dns.com`

## Troubleshooting

### CORS Errors
Make sure `FRONTEND_BASE_URL` is set correctly in Railway.

### Authentication Issues
Ensure `NEXTAUTH_URL` matches your Vercel app URL exactly.

### API Connection Issues
Check that `NEXT_PUBLIC_API_URL` points to your Railway backend.
