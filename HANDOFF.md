# HuyumiAI — Документ передачі розробки

## Архітектура

```
Vercel (Frontend)  →  Supabase (DB + Auth)  ←  Render (Backend)
    │                                            │
    └── Next.js 14 + NextAuth                     ├── FastAPI
    └── ~35 API routes                            ├── Claude API (AI analysis)
    └── 15 dashboard pages                        ├── AssemblyAI (transcription)
                                                  ├── Google Drive API
                                                  └── Planfix API
```

**GitHub**: `https://github.com/igorgenov/lumi-ai-source` (public)
**Supabase**: `https://yxodvhgyutatzqshiiua.supabase.co`
**Backend (Render)**: `https://lumi-ai-backend-0cyt.onrender.com`

---

## Поточний стан

### Що працює
- Frontend на Vercel (хоча є баги, див. нижче)
- Supabase база даних з 25 таблицями (повна схема в `supabase-full-schema.sql`)
- Google OAuth (@inweb.ua тільки)
- Бекенд: Google Drive polling, AssemblyAI транскрипція, Claude аналіз зустрічей
- Бекенд: Planfix Telegram chat sync + аналіз
- Бекенд: Recovery (авто-перезапуск stuck розмов)
- Бекенд: Audit (авто-фікс score integrity)

### Що зламано / недопрацьовано

1. **Supabase tables:**
   - Таблицю `notifications` викликає meetings.py (рядки 504-510), але вона НЕ існує в схемі — буде помилка при кожному аналізі зустрічі (ковтається broad except)
   - Таблицю `telegram_chats` є в міграціях, але немає в full schema

2. **SQLAlchemy models — мертвий код:**
   - `backend/app/models/user.py`, `conversation.py`, `db/session.py` — не використовуються
   - Посилаються на `DATABASE_URL` якого немає в config
   - `sqlalchemy` та `asyncpg` не в requirements.txt
   - Всі роутери використовують Supabase client, а не ORM

3. **Захардкоджені URL в frontend:**
   - `frontend/app/api/meetings/drive-connect/route.ts` → `https://inweb-sales-backend-871800563077.europe-west1.run.app`
   - `frontend/app/api/meetings/drive-status/route.ts` → те саме
   - Мало бути `NEXT_PUBLIC_API_URL`

4. **TypeScript та ESLint вимкнено:**
   - `next.config.js`: `ignoreBuildErrors: true`, `ignoreDuringBuilds: true`
   - Типи не збігаються з реальною схемою (див. п.8)

5. **Render backend не повний:**
   - `render.yaml` не має: `ANTHROPIC_API_KEY_ANALYSIS`, `ANTHROPIC_API_KEY_CHATS`, `ANTHROPIC_API_KEY_DEAL_REASONS`, `GOOGLE_DRIVE_WEB_CLIENT_ID`, `GOOGLE_DRIVE_WEB_CLIENT_SECRET`, `PLANFIX_API_TOKEN`

6. **README/DEPLOY.md суперечливі:**
   - README каже "Vercel + Railway"
   - DEPLOY.md каже Railway
   - `render.yaml` та `deploy-render.sh` для Render
   - `deploy.sh` для Railway
   - Незрозуміло який canonical варіант

7. **Типи фронтенду не збігаються зі схемою:**
   - `UserRole = "admin" | "manager"` — реальні: `owner | admin | pm | viewer`
   - `ConversationType` немає `"chat"`
   - `ConversationStatus` немає `"no_transcript"`, `"analyzing"`
   - `Service` захардкоджений

8. **Dead-сторінки / не підключені:**
   - `backend/app/routers/managers.py` — стаб, повертає `{"items": []}`, НЕ зареєстрований в main.py
   - `backend/app/routers/conversations.py` — стаб, повертає `{"items": []}`, НЕ зареєстрований в main.py

9. **Фавіконка/логотип:**
   - Вірний favicon (speech bubble) вже є в `public/favicon.ico`, `public/icon.png`
   - Логотипи sidebar та login — rocket (HuyumiAI branding)

---

## Що треба зробити (пріоритет)

### 🔴 Критичні (без цього не працює)

1. **Додати таблицю `notifications` в Supabase схему:**
   ```sql
   CREATE TABLE notifications (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     type TEXT NOT NULL,
     title TEXT NOT NULL,
     message TEXT,
     manager_id UUID REFERENCES managers(id),
     conversation_id UUID REFERENCES conversations(id),
     is_read BOOLEAN DEFAULT false,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```

2. **Додати redirect URI в Google Cloud Console** для кожного нового Vercel deploy URL (формат: `https://frontend-XXXXX-igenov-4615s-projects.vercel.app/api/auth/callback/google`)

3. **Вимкнути Vercel Deployment Protection** для production або налаштувати bypass token

4. **Заповнити всі API ключі в Render backend:**
   - `ANTHROPIC_API_KEY` (або три окремих: `_ANALYSIS`, `_CHATS`, `_DEAL_REASONS`)
   - `ASSEMBLYAI_API_KEY`
   - `GOOGLE_DRIVE_CLIENT_ID` + `GOOGLE_DRIVE_CLIENT_SECRET` (Desktop OAuth)
   - `GOOGLE_DRIVE_WEB_CLIENT_ID` + `GOOGLE_DRIVE_WEB_CLIENT_SECRET` (Web OAuth, для фронтенду)
   - `GOOGLE_DRIVE_REFRESH_TOKEN`
   - `PLANFIX_API_TOKEN`
   - `MEETINGS_POLL_SECRET`

### 🟡 Важливі (робоче, але з багами)

5. **Прибрати мертвий SQLAlchemy код:**
   - `backend/app/models/user.py`, `conversation.py` → видалити або нічого не робити
   - `backend/app/db/` → видалити або нічого не робити

6. **Замінити захардкоджені URL:**
   - `frontend/app/api/meetings/drive-connect/route.ts` → `process.env.NEXT_PUBLIC_API_URL`
   - `frontend/app/api/meetings/drive-status/route.ts` → те саме

7. **Оновити TypeScript типи** в `frontend/types/index.ts`:
   - `UserRole = "owner" | "admin" | "pm" | "viewer"`
   - Додати `"chat"` до `ConversationType`
   - Додати `"no_transcript"`, `"analyzing"` до `ConversationStatus`

8. **Увімкнути TypeScript/ESLint в builds:**
   - В `next.config.js` прибрати `ignoreBuildErrors: true` та `ignoreDuringBuilds: true`

9. **Оновити `.env.example`** — додати всі змінні з config.py яких там немає

### 🟢 Менші (якість)

10. **Очистити render.yaml** — додати всі недостаючі env vars
11. **Зробити canonical deploy шлях** — або Render, або Railway, не обидва
12. **Оновити README.md** — актуальний stack та інструкції
13. **Зареєструвати або видалити stub роутери** managers/conversations в main.py
14. **Створити PM-промпт** через UI сторінку Prompts
15. **Запустити повний AI pipeline** з реальними ключами

---

## API Keys (всі)

| Змінна | Де використовується | Статус |
|--------|---------------------|--------|
| `SUPABASE_URL` | Backend + Frontend | ⚠️ Потрібен |
| `SUPABASE_SERVICE_KEY` | Backend | ⚠️ Потрібен |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend | ⚠️ Потрібен |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend | ⚠️ Потрібен |
| `ANTHROPIC_API_KEY` | Backend (Claude) | ⚠️ Потрібен |
| `ASSEMBLYAI_API_KEY` | Backend (транскрипція) | ⚠️ Потрібен |
| `GOOGLE_DRIVE_CLIENT_ID` | Backend (OAuth Desktop) | ⚠️ Потрібен |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Backend (OAuth Desktop) | ⚠️ Потрібен |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | Backend | ⚠️ Потрібен |
| `GOOGLE_DRIVE_WEB_CLIENT_ID` | Backend (OAuth Web) | ⚠️ Потрібен |
| `GOOGLE_DRIVE_WEB_CLIENT_SECRET` | Backend (OAuth Web) | ⚠️ Потрібен |
| `GOOGLE_CLIENT_ID` | NextAuth (frontend) | ⚠️ Потрібен |
| `GOOGLE_CLIENT_SECRET` | NextAuth (frontend) | ⚠️ Потрібен |
| `NEXTAUTH_SECRET` | Frontend | ⚠️ Потрібен |
| `NEXTAUTH_URL` | Frontend | ⚠️ Потрібен |
| `NEXT_PUBLIC_API_URL` | Frontend | ⚠️ Потрібен |
| `PLANFIX_API_TOKEN` | Backend | ⚠️ Потрібен |
| `MEETINGS_POLL_SECRET` | Backend + Frontend | ⚠️ Потрібен |
| `BACKEND_BASE_URL` | Backend | ⚠️ Потрібен |
| `FRONTEND_BASE_URL` | Backend | ⚠️ Потрібен |

---

## Структура файлів

### Backend (Python, FastAPI)

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                          # Entry point, routers
│   ├── core/
│   │   ├── __init__.py
│   │   └── config.py                    # All env vars, Pydantic Settings
│   ├── db/
│   │   ├── __init__.py
│   │   ├── base.py                      # SQLAlchemy Base (dead code)
│   │   └── session.py                   # SQLAlchemy session (dead code)
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py                      # User model (dead code)
│   │   └── conversation.py              # Conversation model (dead code)
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── meetings.py                  # Google Drive polling + analysis (535 lines)
│   │   ├── chats.py                     # Planfix Telegram sync (286 lines)
│   │   ├── recovery.py                  # Auto-retry stuck convos (58 lines)
│   │   ├── audit.py                     # Score integrity fix (74 lines)
│   │   ├── managers.py                  # STUB — not registered
│   │   └── conversations.py             # STUB — not registered
│   └── services/
│       ├── __init__.py
│       ├── supabase_client.py           # Supabase client wrapper
│       ├── claude_analysis.py           # Claude AI for meetings/calls
│       ├── chat_analysis.py             # Claude AI for Telegram chats
│       ├── google_drive.py              # Drive file listing/download
│       ├── google_drive_oauth.py        # Per-manager Drive OAuth
│       ├── assemblyai_transcription.py  # AssemblyAI + diarization
│       ├── planfix.py                   # Planfix REST API
│       └── talk_ratio.py               # Manager talk-listen ratio
├── tests/
│   └── test_claude_analysis.py
├── scripts/
│   ├── test_meeting_transcription.py
│   ├── drive_list_folder.py
│   └── drive_authorize.py
├── conftest.py
├── requirements.txt
├── Dockerfile
└── .env.example
```

### Frontend (TypeScript, Next.js 14)

```
frontend/
├── app/
│   ├── layout.tsx                       # Root layout
│   ├── page.tsx                         # Root redirect
│   ├── providers.tsx                    # Client providers
│   ├── favicon.ico
│   ├── icon.png
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   └── login/page.tsx              # Google OAuth login
│   ├── (dashboard)/
│   │   ├── layout.tsx                   # Dashboard layout (sidebar)
│   │   ├── dashboard/page.tsx           # Main dashboard
│   │   ├── conversations/
│   │   │   ├── page.tsx                 # Conversation list
│   │   │   └── [id]/page.tsx           # Conversation detail
│   │   ├── team/
│   │   │   ├── page.tsx                 # Team list
│   │   │   └── [id]/page.tsx           # Member profile
│   │   ├── coaching/
│   │   │   ├── page.tsx
│   │   │   └── [tab]/page.tsx
│   │   ├── insights/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── prompts/page.tsx
│   │   ├── connect-drive/page.tsx
│   │   ├── pm/page.tsx                  # PM pivot
│   │   └── settings/
│   │       ├── page.tsx
│   │       ├── [tab]/page.tsx
│   │       ├── layout.tsx
│   │       └── _components.tsx          # Integrations, Changelog, etc (1857 lines)
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── conversations/
│       │   ├── [id]/route.ts
│       │   ├── [id]/reanalyze/route.ts
│       │   ├── [id]/service/route.ts
│       │   ├── [id]/kind/route.ts
│       │   ├── fetch-vtt/route.ts
│       │   ├── manual/route.ts
│       │   ├── manual-drive/route.ts
│       │   └── manual-chat/route.ts
│       ├── dashboard/route.ts
│       ├── dashboard/zone-deal-correlation/route.ts
│       ├── team/route.ts
│       ├── team/me/route.ts
│       ├── insights/route.ts
│       ├── insights/[id]/route.ts
│       ├── insights/estimate/route.ts
│       ├── prompts/route.ts
│       ├── prompts/[id]/route.ts
│       ├── prompts/[id]/versions/route.ts
│       ├── coaching/sessions/route.ts
│       ├── coaching/plans/route.ts
│       ├── coaching/assignments/route.ts
│       ├── coaching/suggest-goal/route.ts
│       ├── costs/route.ts
│       ├── reports/send/route.ts
│       ├── reports/configs/route.ts
│       ├── reports/settings/route.ts
│       ├── notifications/route.ts
│       ├── meetings/
│       │   ├── drive-connect/route.ts
│       │   ├── drive-connect-self/route.ts
│       │   ├── drive-disconnect/route.ts
│       │   ├── drive-disconnect-self/route.ts
│       │   ├── drive-status/route.ts
│       │   └── drive-status-self/route.ts
│       ├── google-drive/account/route.ts
│       ├── integrations/chat-sync/route.ts
│       ├── audit-log/route.ts
│       ├── audit-log/prompt-diff/route.ts
│       └── telegram/test/route.ts
├── components/
│   ├── theme-provider.tsx
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   └── changelog-footer-link.tsx
│   ├── icons/brand-icons.tsx
│   ├── dashboard/stat-card.tsx
│   ├── providers/view-as-provider.tsx
│   └── ui/
│       ├── manager-avatar.tsx
│       ├── deal-loss-reason-modal.tsx
│       ├── rank-badge.tsx
│       ├── info-hint.tsx
│       ├── date-picker.tsx
│       ├── confirm-dialog.tsx
│       └── date-range-picker.tsx
├── hooks/
│   ├── useConversations.ts
│   ├── useManagers.ts
│   └── useDashboardStats.ts
├── lib/
│   ├── auth.ts                          # NextAuth config
│   ├── api-auth.ts                      # API role gating
│   ├── supabase.ts                      # Supabase client
│   ├── claude-analysis.ts               # Frontend Claude lib
│   ├── anthropic-keys.ts                # Anthropic key mgmt
│   ├── activity-log.ts
│   ├── utils.ts
│   └── ...
├── types/
│   ├── index.ts                         # Shared types
│   └── next-auth.d.ts
├── middleware.ts
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── package.json
├── Dockerfile
├── .env.example
└── .env.local
```

### Root

```
/
├── supabase-full-schema.sql            # Full DB schema (25 tables)
├── supabase-*.sql                      # ~49 migration files
├── Dockerfile                          # Backend Docker (used by Render)
├── docker-compose.yml                  # Local dev
├── render.yaml                         # Render deployment
├── deploy.sh                           # Railway deploy (old)
├── deploy-render.sh                    # Render deploy
├── DEPLOY.md
├── README.md
├── HANDOFF.md                          # Цей документ
├── logo_lumi.ai_black.png              # Source logo (speech bubble, black)
├── logo_lumi.ai_white.png              # Source logo (speech bubble, white)
├── backend/                            # See above
└── frontend/                           # See above
```

### Public assets (frontend/public/)

```
frontend/public/
├── icon.png                            # Favicon (speech bubble)
├── favicon.ico
├── favicon-16x16.png
├── favicon-32x32.png
├── apple-icon.png
├── favicon-dark.png
├── favicon-light.png
├── huyumi-icon.png                     # Login page (rocket)
├── huyumi-logo.png                     # Sidebar light (rocket)
├── huyumi-logo-dark.png                # Sidebar dark (rocket)
├── lumi-icon.png                       # Old Lumi logo (speech bubble)
├── lumi-logo.png
├── lumi-logo-dark.png
├── inweb-logo-black.png
├── icons/                              # UI icons
└── robots.txt
```

---

## Деплой

### Бекенд (Render)
1. GitHub repo: `igorgenov/lumi-ai-source`
2. Render автоматично деплоїть з `Dockerfile` в корені
3. Потрібні env vars: див. таблицю вище

### Фронтенд (Vercel)
1. GitHub repo: `igorgenov/lumi-ai-source`, root directory = `frontend`
2. Кожен git push на main → автоматичний деплой
3. Після кожного нового deploy URL потрібно додавати redirect URI в Google Cloud Console

### Google Cloud Console
1. Go to: `https://console.cloud.google.com/apis/credentials`
2. OAuth 2.0 Client ID → Authorized redirect URIs
3. Додати: `https://frontend-XXXXX-igenov-4615s-projects.vercel.app/api/auth/callback/google`

---

## PM Pivot (поточний стан)

Продукт був переключений з Sales Manager на Project Manager аналітику:

- **Role**: `"pm"` (замість `"manager"`)
- **AI Criteria**: project_clarity, timeline_management, stakeholder_alignment, risk_communication, budget_control, team_coordination, client_satisfaction
- **KPIs**: CSAT, дедлайни, комунікація, бюджет, залученість команди
- **Conversation types**: Статус-зустріч, Планування спринту, Ретроспектива, Демо/Презентація, Технічне обговорення, Інше
- **Coaching programs**: Управління ризиками, Комунікація зі стейкхолдерами, Управління строками, Контроль бюджету, Лідерство в команді, Задоволеність клієнта
- **DB columns**: `manager_id`, `manager_roles` залишились (не перейменовані)
- **PM page**: `/pm`
- **Backend `claude_analysis.py`**: повністю переписаний під PM criteria
