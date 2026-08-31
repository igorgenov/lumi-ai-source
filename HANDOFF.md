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

## Поточний стан (оновлено 2026-08-31)

### Що працює
- Frontend на Vercel
- Supabase база даних з 25 таблицями (повна схема в `supabase-full-schema.sql`)
- Google OAuth (@inweb.ua тільки)
- Бекенд: Google Drive polling, AssemblyAI транскрипція, Claude аналіз зустрічей
- Бекенд: Planfix Telegram chat sync + аналіз
- Бекенд: Recovery (авто-перезапуск stuck розмов)
- Бекенд: Audit (авто-фікс score integrity)
- Мертвий SQLAlchemy код видалено
- Мертві stub роутери (managers.py, conversations.py) видалено
- SM-specific SQL міграції (contragents, deals, loss/win reasons) видалено
- SM-специфічний код в planfix.py видалено (лишився тільки chat-pipeline)
- Ringostat повністю видалено з усього коду

### Що зламано / недопрацьовано

1. **Supabase tables:**
   - Таблицю `notifications` викликає meetings.py (рядки 504-510), але вона НЕ існує в схемі — буде помилка при кожному аналізі зустрічі (ковтається broad except)
   - Таблицю `telegram_chats` є в міграціях, але немає в full schema

2. **Захардкоджені URL в frontend:**
   - `frontend/app/api/meetings/drive-connect/route.ts` → `https://inweb-sales-backend-871800563077.europe-west1.run.app`
   - `frontend/app/api/meetings/drive-status/route.ts` → те саме
   - Мало бути `NEXT_PUBLIC_API_URL`

3. **TypeScript та ESLint вимкнено:**
   - `next.config.js`: `ignoreBuildErrors: true`, `ignoreDuringBuilds: true`
   - Типи не збігаються з реальною схемою (див. п.5)

4. **Типи фронтенду не збігаються зі схемою:**
   - `UserRole = "admin" | "manager"` — реальні: `owner | admin | pm | viewer`
   - `ConversationType` немає `"chat"`
   - `ConversationStatus` немає `"no_transcript"`, `"analyzing"`
   - `Service` захардкоджений

5. **render.yaml неповний:**
   - Немає: `ANTHROPIC_API_KEY_ANALYSIS`, `ANTHROPIC_API_KEY_CHATS`, `GOOGLE_DRIVE_WEB_CLIENT_ID`, `GOOGLE_DRIVE_WEB_CLIENT_SECRET`, `PLANFIX_API_TOKEN`

6. **README/DEPLOY.md суперечливі:**
   - README каже "Vercel + Railway"
   - DEPLOY.md каже Railway
   - `render.yaml` та `deploy-render.sh` для Render
   - `deploy.sh` видалено (был Railway)
   - Незрозуміло який canonical варіант

---

## Що треба зробити (пріоритет)

### 🔴 Критичні (без цього не працює)

1. **Додати redirect URI в Google Cloud Console** для кожного нового Vercel deploy URL (формат: `https://frontend-XXXXX-igenov-4615s-projects.vercel.app/api/auth/callback/google`)

2. **Вимкнути Vercel Deployment Protection** для production або налаштувати bypass token

3. **Заповнити всі API ключі в Render backend:**
   - `ANTHROPIC_API_KEY` (або три окремих: `_ANALYSIS`, `_CHATS`)
   - `ASSEMBLYAI_API_KEY`
   - `GOOGLE_DRIVE_CLIENT_ID` + `GOOGLE_DRIVE_CLIENT_SECRET` (Desktop OAuth)
   - `GOOGLE_DRIVE_WEB_CLIENT_ID` + `GOOGLE_DRIVE_WEB_CLIENT_SECRET` (Web OAuth, для фронтенду)
   - `GOOGLE_DRIVE_REFRESH_TOKEN`
   - `PLANFIX_API_TOKEN`
   - `MEETINGS_POLL_SECRET`

### 🟡 Важливі (робоче, але з багами)

4. **Замінити захардкоджені URL:**
   - `frontend/app/api/meetings/drive-connect/route.ts` → `process.env.NEXT_PUBLIC_API_URL`
   - `frontend/app/api/meetings/drive-status/route.ts` → те саме

5. **Оновити TypeScript типи** в `frontend/types/index.ts`:
   - `UserRole = "owner" | "admin" | "pm" | "viewer"`
   - Додати `"chat"` до `ConversationType`
   - Додати `"no_transcript"`, `"analyzing"` до `ConversationStatus`

6. **Увімкнути TypeScript/ESLint в builds:**
   - В `next.config.js` прибрати `ignoreBuildErrors: true` та `ignoreDuringBuilds: true`

7. **Оновити `.env.example`** — додати всі змінні з config.py яких там немає

### 🟢 Менші (якість)

8. **Очистити render.yaml** — додати всі недостаючі env vars
9. **Зробити canonical deploy шлях** — або Render, або Railway, не обидва
10. **Оновити README.md** — актуальний stack та інструкції
11. **Створити PM-промпт** через UI сторінку Prompts
12. **Запустити повний AI pipeline** з реальними ключами

---

## API Keys (всі)

| Змінна | Де використовується | Статус |
|--------|---------------------|--------|
| `SUPABASE_URL` | Backend + Frontend | ⚠️ Потрібен |
| `SUPABASE_SERVICE_KEY` | Backend | ⚠️ Потрібен |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend | ⚠️ Потрібен |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend | ⚠️ Потрібен |
| `ANTHROPIC_API_KEY` | Backend (Claude fallback) | ⚠️ Потрібен |
| `ANTHROPIC_API_KEY_ANALYSIS` | Backend (call/meeting scoring) | ⚠️ Потрібен |
| `ANTHROPIC_API_KEY_CHATS` | Backend (chat scoring) | ⚠️ Потрібен |
| `ASSEMBLYAI_API_KEY` | Backend (transcription) | ⚠️ Потрібен |
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
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── meetings.py                  # Google Drive polling + analysis (535 lines)
│   │   ├── chats.py                     # Planfix Telegram sync (286 lines)
│   │   ├── recovery.py                  # Auto-retry stuck convos (58 lines)
│   │   └── audit.py                     # Score integrity fix (74 lines)
│   └── services/
│       ├── __init__.py
│       ├── supabase_client.py           # Supabase client wrapper
│       ├── claude_analysis.py           # Claude AI for meetings/calls
│       ├── chat_analysis.py             # Claude AI for Telegram chats
│       ├── google_drive.py              # Drive file listing/download
│       ├── google_drive_oauth.py        # Per-manager Drive OAuth
│       ├── assemblyai_transcription.py  # AssemblyAI + diarization
│       ├── planfix.py                   # Planfix REST API (chat-pipeline only)
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
│   │       └── _components.tsx          # Integrations, Changelog, etc
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
├── supabase-*.sql                      # ~39 migration files
├── Dockerfile                          # Backend Docker (used by Render)
├── docker-compose.yml                  # Local dev
├── render.yaml                         # Render deployment
├── deploy-render.sh                    # Render deploy
├── setup-local.sh                      # Local dev setup
├── DEPLOY.md
├── README.md
├── HANDOFF.md                          # Цей документ
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

---

## Видалено (SM remnants cleanup, 2026-08-31)

Під час cleanup було видалено:

- **Backend**: `app/db/` (base.py, session.py), `app/models/` (user.py, conversation.py), `app/routers/managers.py`, `app/routers/conversations.py`
- **Frontend**: `components/ui/deal-loss-reason-modal.tsx`
- **SQL migrations**: 10 SM-specific файлів (contragents, deals, loss/win reasons)
- **Logos**: `lumi-icon.png`, `lumi-logo.png`, `lumi-logo-dark.png`, `inweb-logo-black.png`, `logo_lumi.ai_black.png`, `logo_lumi.ai_white.png`, `logo_lumi.ai.png`, `logo_lumi.ai.jpg`, `logo2_lumi.ai.jpg`, `logo3_lumi.ai.png`, `logo4_lumi.ai.png`
- **Scripts**: `deploy.sh`, `test-deployment.sh`
- **Debug artifacts**: `.playwright-mcp/`, `combined.log`, `error.log`
- **planfix.py**: видалено deal-related functions (SERVICE_NAMES, DEAL_* constants, get_task, get_deal_*, guess_service, get_contact_deal_task_ids_and_group)
- **config.py**: видалено `ANTHROPIC_API_KEY_DEAL_REASONS`
- **Ringostat**: повністю видалено з backend + frontend
