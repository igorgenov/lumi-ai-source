# 🎯 Lumi AI - Project Management Analytics Platform

## 🚀 Quick Start

### Local Development

```bash
# 1. Setup local environment
./setup-local.sh

# 2. Edit environment variables
#    - backend/.env
#    - frontend/.env.local

# 3. Start development servers
docker-compose up
```

### Production Deploy

#### Option 1: Vercel + Render (Recommended - Free)

```bash
# Deploy Frontend to Vercel
cd frontend && vercel --prod

# Deploy Backend to Render
./deploy-render.sh
```

#### Option 2: Vercel + Railway (Paid)

```bash
./deploy.sh
```

## 📚 Documentation

- [Deployment Guide](DEPLOY.md)
- [API Documentation](http://localhost:8000/api/docs) (when running locally)

## 🏗️ Architecture

- **Frontend**: Next.js 14 with Tailwind CSS
- **Backend**: FastAPI (Python 3.11)
- **Database**: Supabase (PostgreSQL)
- **AI**: Anthropic Claude
- **Hosting**: Vercel (Frontend) + Railway (Backend)

## 🔧 Environment Variables

See [DEPLOY.md](DEPLOY.md) for complete list of required environment variables.

## 📁 Project Structure

```
lumi-ai/
├── frontend/          # Next.js frontend
├── backend/           # FastAPI backend
├── supabase-*.sql     # Database migrations
├── deploy.sh          # Production deploy script
├── setup-local.sh     # Local development setup
└── docker-compose.yml # Docker configuration
```

## 🎨 Features

- **PM Dashboard**: Project health, deadlines, budget tracking
- **AI Analysis**: Automatic meeting transcription and scoring
- **Coaching Programs**: Team development and training
- **Real-time Analytics**: Live project status updates

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

MIT License
