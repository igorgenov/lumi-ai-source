#!/bin/bash

echo "🚀 Lumi AI Deployment Script"
echo "=========================="
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Install it with:"
    echo "   npm i -g vercel"
    exit 1
fi

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Install it with:"
    echo "   curl -fsSL https://railway.app/install.sh | sh"
    exit 1
fi

echo "✅ Vercel CLI found"
echo "✅ Railway CLI found"
echo ""

# Deploy Frontend
echo "📦 Deploying Frontend to Vercel..."
cd frontend
vercel --prod
cd ..

echo ""
echo "📦 Deploying Backend to Railway..."
cd backend
railway up
cd ..

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Set environment variables in Vercel Dashboard"
echo "2. Set environment variables in Railway Dashboard"
echo "3. Configure custom domain (optional)"
