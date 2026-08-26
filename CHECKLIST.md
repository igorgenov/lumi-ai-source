# ✅ Deployment Checklist

## Pre-deployment

- [ ] Supabase project created
- [ ] Supabase URL and keys ready
- [ ] Anthropic API key ready
- [ ] Google OAuth credentials ready (for Meet integration)
- [ ] AssemblyAI API key ready
- [ ] Domain name purchased (optional)

## Frontend (Vercel)

- [ ] Vercel CLI installed (`npm i -g vercel`)
- [ ] Frontend deployed (`cd frontend && vercel --prod`)
- [ ] Environment variables set in Vercel Dashboard
- [ ] Custom domain configured (optional)

## Backend (Railway)

- [ ] Railway CLI installed (`curl -fsSL https://railway.app/install.sh | sh`)
- [ ] Backend deployed (`cd backend && railway up`)
- [ ] Environment variables set in Railway Dashboard
- [ ] Health check working (`https://your-backend.railway.app/api/health`)

## Post-deployment

- [ ] Frontend loads correctly
- [ ] Backend API responds
- [ ] Authentication works
- [ ] AI analysis works
- [ ] Google Meet integration works (if configured)

## Troubleshooting

- [ ] Check CORS settings if frontend can't connect to backend
- [ ] Verify NEXTAUTH_URL matches your Vercel app URL
- [ ] Ensure NEXT_PUBLIC_API_URL points to Railway backend
