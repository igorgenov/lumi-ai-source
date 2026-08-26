# 🚀 Deploy Backend to Render (Free)

## Step 1: Create Render Account

1. Go to [render.com](https://render.com)
2. Sign up with GitHub (recommended)
3. Verify your email

## Step 2: Connect GitHub Repository

1. In Render Dashboard, click **"New +"**
2. Select **"Web Service"**
3. Connect your GitHub account
4. Select repository: `lumi-ai-source`

## Step 3: Configure Service

Fill in the following:

| Field | Value |
|-------|-------|
| **Name** | `lumi-ai-backend` |
| **Region** | `Frankfurt (EU)` or `Oregon (US)` |
| **Branch** | `main` |
| **Runtime** | `Python 3` |
| **Build Command** | `cd backend && pip install -r requirements.txt` |
| **Start Command** | `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

## Step 4: Set Environment Variables

In **"Environment"** section, add these variables:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_DRIVE_CLIENT_ID=your_client_id
GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret
GOOGLE_DRIVE_REFRESH_TOKEN=your_refresh_token
ASSEMBLYAI_API_KEY=your_assemblyai_key
MEETINGS_POLL_SECRET=any_random_string
BACKEND_BASE_URL=https://lumi-ai-backend.onrender.com
FRONTEND_BASE_URL=https://frontend-jl5q4l732-igenov-4615s-projects.vercel.app
```

## Step 5: Deploy

1. Click **"Create Web Service"**
2. Wait for deployment (2-3 minutes)
3. Your backend will be available at: `https://lumi-ai-backend.onrender.com`

## Step 6: Update Frontend

After backend is deployed, update Vercel environment variable:

```bash
cd frontend
vercel env add NEXT_PUBLIC_API_URL production
# Enter: https://lumi-ai-backend.onrender.com
```

## Step 7: Test

1. Open: `https://lumi-ai-backend.onrender.com/api/health`
2. You should see: `{"status": "ok", "app": "inweb.sales.ai"}`

---

## ⚠️ Free Tier Limitations

- Service spins down after 15 minutes of inactivity
- First request after spin down takes ~30 seconds
- 750 hours/month free

## 🔧 Troubleshooting

### Build Fails
- Check logs in Render Dashboard
- Ensure all dependencies are in `requirements.txt`

### CORS Errors
- Verify `FRONTEND_BASE_URL` is set correctly
- Check backend logs for errors

### Service Won't Start
- Check if `PORT` environment variable is used
- Verify start command is correct
