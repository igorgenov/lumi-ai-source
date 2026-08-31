from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "huyumi-ai"
    DEBUG: bool = False

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""  # service_role key (not publishable)

    # AI — split per task (Aibis wants per-task cost visibility in his own dashboard,
    # 2026-08-13). Each task-scoped key falls back to ANTHROPIC_API_KEY when unset, so
    # nothing breaks before every key has actually been provisioned and set.
    ANTHROPIC_API_KEY: str = ""              # fallback / not-yet-split tasks
    ANTHROPIC_API_KEY_ANALYSIS: str = ""     # call/meeting transcript scoring (claude_analysis.py)
    ANTHROPIC_API_KEY_CHATS: str = ""        # Telegram chat scoring (chat_analysis.py)

    @property
    def anthropic_key_analysis(self) -> str:
        return self.ANTHROPIC_API_KEY_ANALYSIS or self.ANTHROPIC_API_KEY

    @property
    def anthropic_key_chats(self) -> str:
        return self.ANTHROPIC_API_KEY_CHATS or self.ANTHROPIC_API_KEY

    # Meetings pipeline (Google Drive + AssemblyAI)
    GOOGLE_DRIVE_CLIENT_ID: str = ""
    GOOGLE_DRIVE_CLIENT_SECRET: str = ""
    GOOGLE_DRIVE_REFRESH_TOKEN: str = ""
    ASSEMBLYAI_API_KEY: str = ""
    MEETINGS_POLL_SECRET: str = ""
    BACKEND_BASE_URL: str = "https://inweb-sales-backend-871800563077.europe-west1.run.app"
    FRONTEND_BASE_URL: str = "https://lumi.inweb.ua"

    # Per-manager Google Drive OAuth (2026-08-13) — lets each manager self-authorize
    # read access to their own Drive with one click, instead of relying on a single
    # shared polling account that needs the "Google Meet" folder manually re-shared
    # every time Google rotates it (see project_meet_folder_access_fragility memory).
    # Separate "Web application" OAuth client from GOOGLE_DRIVE_CLIENT_ID above (that
    # one is a "Desktop" client, which Google restricts to localhost redirect URIs only
    # — a web-based per-manager consent flow needs its own client with a real HTTPS
    # redirect URI registered).
    GOOGLE_DRIVE_WEB_CLIENT_ID: str = ""
    GOOGLE_DRIVE_WEB_CLIENT_SECRET: str = ""

    # Telegram chat-analysis pipeline (Planfix-synced client correspondence)
    PLANFIX_API_TOKEN: str = ""
    PLANFIX_BASE_URL: str = "https://inweb.planfix.com/rest"
    PLANFIX_CHAT_TEMPLATE_ID: int = 2540515

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
