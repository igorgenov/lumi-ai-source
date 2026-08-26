#!/bin/bash

echo "🧪 Testing Lumi AI Deployment"
echo "============================"
echo ""

# Test frontend
echo "Testing Frontend..."
if curl -s -o /dev/null -w "%{http_code}" "https://your-frontend-url.vercel.app" | grep -q "200"; then
    echo "✅ Frontend is accessible"
else
    echo "❌ Frontend is not accessible"
fi

# Test backend health
echo ""
echo "Testing Backend Health..."
if curl -s -o /dev/null -w "%{http_code}" "https://your-backend-url.railway.app/api/health" | grep -q "200"; then
    echo "✅ Backend health check passed"
else
    echo "❌ Backend health check failed"
fi

# Test API docs
echo ""
echo "Testing API Documentation..."
if curl -s -o /dev/null -w "%{http_code}" "https://your-backend-url.railway.app/api/docs" | grep -q "200"; then
    echo "✅ API documentation is accessible"
else
    echo "❌ API documentation is not accessible"
fi

echo ""
echo "✅ Testing complete!"
echo ""
echo "Note: Replace 'your-frontend-url.vercel.app' and 'your-backend-url.railway.app' with actual URLs"
