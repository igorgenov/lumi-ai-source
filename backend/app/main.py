from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.routers import meetings, recovery, chats, audit

app = FastAPI(
    title=settings.APP_NAME,
    description="API для аналітики зустрічей та комунікацій PM",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://*.vercel.app",
        "https://*.railway.app",
        settings.FRONTEND_BASE_URL,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meetings.router, prefix="/api")
app.include_router(recovery.router, prefix="/api")
app.include_router(chats.router, prefix="/api")
app.include_router(audit.router, prefix="/api")


@app.get("/")
async def root():
    return {"status": "ok", "app": settings.APP_NAME, "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME}


@app.get("/api/health")
async def api_health():
    return {"status": "ok", "app": settings.APP_NAME}
