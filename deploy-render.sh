#!/bin/bash

echo "🔧 Render Backend Deployment Helper"
echo "=================================="
echo ""

echo "📋 Step 1: Create Render Account"
echo "   Go to: https://render.com"
echo "   Sign up with GitHub"
echo ""

echo "📋 Step 2: Connect Repository"
echo "   1. Click 'New +' → 'Web Service'"
echo "   2. Connect GitHub"
echo "   3. Select: lumi-ai-source"
echo ""

echo "📋 Step 3: Configure Service"
echo "   Name: lumi-ai-backend"
echo "   Region: Frankfurt (EU)"
echo "   Branch: main"
echo "   Runtime: Python 3"
echo "   Build: cd backend && pip install -r requirements.txt"
echo "   Start: cd backend && uvicorn app.main:app --host 0.0.0.0 --port \$PORT"
echo ""

echo "📋 Step 4: Environment Variables"
echo "   Copy these to Render Dashboard:"
echo ""
cat << EOF
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
EOF
echo ""

echo "📋 Step 5: Deploy"
echo "   Click 'Create Web Service'"
echo "   Wait 2-3 minutes"
echo ""

echo "📋 Step 6: Update Frontend"
echo "   Run: cd frontend && vercel env add NEXT_PUBLIC_API_URL production"
echo "   Enter: https://lumi-ai-backend.onrender.com"
echo ""

echo "✅ After deployment, test: https://lumi-ai-backend.onrender.com/api/health"
