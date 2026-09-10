# HuyumiAI (Lumi AI) — Документ передачі проєкту розробнику

**Відповідальний за подальшу розробку:** `s.doksov@inweb.ua` (роль у системі: `admin`)  
**Дата оновлення:** 10 вересня 2026  
**GitHub репозиторій:** [https://github.com/igorgenov/lumi-ai-source](https://github.com/igorgenov/lumi-ai-source) (гілка `main`)

---

## 1. Архітектура системи

```
Vercel (Frontend: Next.js 14) ───► Supabase (PostgreSQL + Auth) ◄─── Render (Backend: FastAPI)
          │                                                                │
          ├── NextAuth (Google OAuth @inweb.ua)                            ├── Claude 3.5 Sonnet (AI scoring)
          ├── 15 сторінок аналітики & дашбордів                            ├── AssemblyAI (транскрибація аудіо/відео)
          └── ~35 Next.js API Routes                                       ├── Google Drive API (Meet polling)
                                                                           └── Planfix REST API (Telegram чати)
```

- **Frontend (Vercel):** `https://frontend-5dx8augyq-igenov-4615s-projects.vercel.app` *(Next.js 14 App Router, Tailwind CSS, Lucide Icons)*
- **Backend (Render):** `https://lumi-ai-backend-0cyt.onrender.com` *(Python 3.11, FastAPI, Uvicorn, Pydantic v2)*
- **База даних (Supabase):** `https://innnhytlkbmhnaqrijtd.supabase.co`  
  - Організація: `Gesha`  
  - Проєкт: `gesha's Project`  
  - Регіон: `eu-west-1` (Ireland)  
  - База містить 25 таблиць (повна схема в `supabase-full-schema.sql`). Старий проєкт `yxodvhgyutatzqshiiua` в `igorgenov's Org` відключено і закріплено за іншим інструментом.

---

## 2. Доступи, які необхідно надати `s.doksov@inweb.ua`

Для повноцінного ведення та підтримки проєкту новому розробнику потрібні такі доступи:

| Платформа / Сервіс | Рівень доступу | Для чого потрібно |
| :--- | :--- | :--- |
| **GitHub** (`igorgenov/lumi-ai-source`) | **Admin / Collaborator** (push/pull права) | Робота з кодом, налаштування CI/CD, мердж PR |
| **Supabase** (Орг `Gesha`, проєкт `innnhytlkbmhnaqrijtd`) | **Administrator / Developer** | Доступ до SQL Editor, перегляду таблиць, логів, керування RLS |
| **Vercel** (Проєкт фронтенду) | **Member / Admin** команди Vercel | Керування Environment Variables, доменами, перегляд Build Logs |
| **Render** (Сервіс `lumi-ai-backend-0cyt`) | **Collaborator / Member** | Перегляд логів бекенду, редеплой, налаштування Environment |
| **Google Cloud Console** | **Editor / OAuth Configurator** | Керування OAuth 2.0 Client IDs, додавання нових Redirect URIs |
| **Anthropic Console** | Член воркспейсу / API Key access | Керування ключами `sk-ant-...`, лімітами та витратами |
| **AssemblyAI Console** | Доступ до аккаунту / API Key | Моніторинг балансу та ключ транскрибації |
| **Planfix** | API доступ + налаштування шаблонів | Робота з інтеграцією переписок Telegram (Template ID: `2540515`) |
| **Google Drive** | Доступ до папки записів Google Meet | Моніторинг вхідних записів дзвінків агентства |

---

## 3. Що вже зроблено та працює

1. **База даних Supabase:**
   - Повністю відокремлена, налаштована в організації `Gesha`.
   - Таблиця `managers` містить актуальних співробітників. `s.doksov@inweb.ua` призначений роллю `admin`.
   - Перевірено працездатність та наявність таблиць: `conversations`, `notifications`, `chat_sync_settings`, `planfix_manager_map`, `prompts`, `prompt_versions`.
2. **Фронтенд (Next.js 14):**
   - Усі 10 захардкоджені Cloud Run URL замінено на `process.env.NEXT_PUBLIC_API_URL`.
   - Синхронізовано типи TypeScript (`UserRole`, `ConversationType`, `ConversationStatus`, `Role`).
   - Виправлено Next.js App Router конфлікт сторінкових експортів (спільний функціонал винесено в `frontend/app/(dashboard)/insights/shared.tsx`).
   - Увімкнено суворий білд: прапорці `ignoreBuildErrors` та `ignoreDuringBuilds` видалено, збірка `npm run build` проходить з кодом 0.
   - Бойові змінні оточення прописано у Vercel, виконано свіжий редеплой.
3. **Google Cloud OAuth:**
   - Додано дозволені Redirect URIs для фронтенду та для веб-авторизації Google Drive бекенду.
4. **Очищення репозиторію:**
   - Видалено застарілий код SQLAlchemy, мертві роутери, специфічний SM-код і модуль Ringostat.

---

## 4. План дій для `s.doksov@inweb.ua` (Що робити далі)

### Крок 1. Заповнити Environment Variables у Render (Блокер запуску бекенду)
У [Render Dashboard](https://dashboard.render.com) у сервісі `lumi-ai-backend-0cyt` в розділі **Environment** прописати:

```env
SUPABASE_URL=https://innnhytlkbmhnaqrijtd.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlubm5oeXRsa2JtaG5hcXJpanRkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODUyNjEwNCwiZXhwIjoyMTA0MTAyMTA0fQ.PYoquN2rGZwaQmiObaxDmY-hNiR1ArkPhHjHT9Ki7bc
BACKEND_BASE_URL=https://lumi-ai-backend-0cyt.onrender.com
FRONTEND_BASE_URL=https://frontend-5dx8augyq-igenov-4615s-projects.vercel.app
MEETINGS_POLL_SECRET=fca7085e28d4e50c883686cf1db6ae91ad5a8a2821445cc7

# Ключі сторонніх API:
ANTHROPIC_API_KEY=<бойовий_ключ_claude_sk-ant-...>
ASSEMBLYAI_API_KEY=<ключ_assemblyai>
PLANFIX_API_TOKEN=<токен_planfix>

# Google Drive (Desktop OAuth - системний опрос):
GOOGLE_DRIVE_CLIENT_ID=<desktop_oauth_client_id>
GOOGLE_DRIVE_CLIENT_SECRET=<desktop_oauth_client_secret>
GOOGLE_DRIVE_REFRESH_TOKEN=<refresh_token_диска>

# Google Drive (Web OAuth - авторизація менеджерів):
GOOGLE_DRIVE_WEB_CLIENT_ID=<web_oauth_client_id>
GOOGLE_DRIVE_WEB_CLIENT_SECRET=<web_oauth_client_secret>
```
Після збереження натиснути **Manual Deploy** → **Deploy latest commit**.

---

### Крок 2. Наскрізне тестування (End-to-End verification)
1. **Google Meet Pipeline:**
   - Завантажити тестовий файл `.mp4` у папку записів Google Meet або скористатись ручним завантаженням на сторінці `/conversations`.
   - Перевірити логи бекенду: `download` → `AssemblyAI transcribe` → `Claude score` → збереження у `conversations` та `ai_analysis`.
   - Перевірити відображення результату та балів на Дашборді.
2. **Planfix Telegram Pipeline:**
   - У розділі `/settings` вкладка **Інтеграції** перевірити стан синхронізації чатів Planfix (`POST /api/integrations/chat-sync`).
   - Перевірити співставлення менеджерів через `planfix_manager_map`.
3. **Модуль AI Інсайтів:**
   - Перейти на `/insights`, ввести довільний запит (наприклад, *"Які топ-3 заперечення по вартості послуг?"*) та перевірити генерацію звіту з експортом у PDF.

---

### Крок 3. Налаштування промптів оцінки під послуги
- У розділі `/prompts` перевірити та за потреби відредагувати спеціалізовані критерії оцінки для послуг Inweb:
  - `SEO`, `PPC`, `GEO`, `Analytics`, `ASO`, `ASA`.
- Зверніть увагу: редагування промпту автоматично створює новий запис у `prompt_versions` та фіксується в `audit_log`.

---

## 5. Довідник для локальної розробки

### Клонування:
```bash
git clone https://github.com/igorgenov/lumi-ai-source.git
cd lumi-ai-source
```

### Бекенд:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Файл локальних змінних: `backend/.env`.

### Фронтенд:
```bash
cd frontend
npm install
npm run dev
```
Файл локальних змінних: `frontend/.env.local`.  
Перевірка строгої збірки перед пушем:
```bash
npm run build
```

---

## 6. База даних: Користувачі та ролі

Авторизація налаштована через корпоративні пошти `@inweb.ua`.  
Поточні користувачі в таблиці `managers`:
- `s.doksov@inweb.ua` — **admin**
- `i.genov@inweb.ua` — **admin**
- `v.naumov@inweb.ua` — **admin**
- `v.nazarenko@inweb.ua` — **admin**
- `s.mykhailiuk@inweb.ua` — **admin**
- `a.mamontov@inweb.ua` — **admin**
- `v.badiuk@inweb.ua` — **viewer**
- `o.voitenko@inweb.ua` — **viewer**

Будь-який інший співробітник з доменом `@inweb.ua` при першому вході отримує базову роль `viewer`. Призначити роль адміністратора можна прямо в базі або через API.
