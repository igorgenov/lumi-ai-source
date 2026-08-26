#!/bin/bash

echo "🔧 Lumi AI Local Setup"
echo "====================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Install it from https://docker.com"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found. Install it from https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker found"
echo "✅ Docker Compose found"
echo ""

# Copy .env files if they don't exist
if [ ! -f backend/.env ]; then
    echo "📋 Creating backend/.env from .env.example..."
    cp backend/.env.example backend/.env
    echo "⚠️  Please edit backend/.env with your API keys"
fi

if [ ! -f frontend/.env.local ]; then
    echo "📋 Creating frontend/.env.local from .env.example..."
    cp frontend/.env.example frontend/.env.local
    echo "⚠️  Please edit frontend/.env.local with your API keys"
fi

echo ""
echo "🐳 Starting Docker containers..."
docker-compose up -d

echo ""
echo "✅ Local setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit backend/.env with your API keys"
echo "2. Edit frontend/.env.local with your API keys"
echo "3. Run: docker-compose logs -f"
echo ""
echo "Frontend: http://localhost:3000"
echo "Backend: http://localhost:8000"
echo "API Docs: http://localhost:8000/api/docs"
