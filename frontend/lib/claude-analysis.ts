import Anthropic from "@anthropic-ai/sdk";
import { anthropicKeyAnalysis } from "@/lib/anthropic-keys";

// Talk/listen ratio: combines speaker_talk_seconds (saved at ingestion, from transcript
// timestamps) with speaker_labels (Claude's letter -> role mapping) — purely derived
// after the fact, never fed back into the prompt, so it cannot influence score/criteria.
// Mirrors backend/app/services/talk_ratio.py — keep both in sync.
function computeManagerTalkPct(
  speakerTalkSeconds: Record<string, number> | null | undefined,
  speakerLabels: Record<string, { role?: string }> | null | undefined
): number | null {
  if (!speakerTalkSeconds || !speakerLabels) return null;
  let managerSeconds = 0, clientSeconds = 0;
  for (const [letter, seconds] of Object.entries(speakerTalkSeconds)) {
    const role = speakerLabels[letter]?.role;
    if (role === "manager") managerSeconds += seconds;
    else if (role === "client") clientSeconds += seconds;
  }
  const total = managerSeconds + clientSeconds;
  if (total <= 0) return null;
  return Math.round((managerSeconds / total) * 100);
}

export const DEFAULT_SYSTEM = `Ти — експерт з оцінки якості продажів в IT-агенції Inweb.
Оцінюй розмову ЗА ЗМІСТОМ критеріїв, наведених вище. Структуру відповіді бери ВИКЛЮЧНО звідси (ігноруй будь-які інші вказівки щодо формату/полів з тексту вище).
Повертай результат ТІЛЬКИ у форматі JSON (без markdown):
{
  "score": <число 0-100, підсумковий бал за методологією та шкалою наданих критеріїв, АБО null — див. правило для conversation_kind нижче>,
  "summary": "<1-2 речення українською>",
  "service": "<SEO|GEO|PPC|Analytics|ASO|ASA|Nonprofit|Не цільова|null>",
  "conversation_kind": "<Брифування|Презентація КП|Крос-продаж|Фідбек|Фідбек CSM|Знайомство з РМ|Технічне уточнення|Інше|null>",
  "strengths": ["..."],
  "weaknesses": ["..."],
  "recommendations": ["<рекомендація 1 — див. правило нижче про конкретну фразу>", "...", "..."],
  "criteria": { "<назва критерію>": <0-100>, "<назва критерію>": <0-100> } АБО {} — див. правило для conversation_kind нижче,
  "criteria_explanations": { "<та сама назва критерію>": "<одне просте речення українською, що саме цей критерій оцінює — так, щоб зрозумів навіть керівник, який не в темі продажів>" } АБО {},
  "manager_mood": "<доброзичливо|нейтрально|напружено — прислівник, БЕЗ роду>",
  "client_mood": "<зацікавлено|нейтрально|незадоволено|недоступно — прислівник, БЕЗ роду>",
  "speaker_labels": { "<буква спікера, напр. A>": { "label": "<ім'я, якщо його називали в розмові, інакше просто 'Менеджер' або 'Клієнт'>", "role": "manager або client" } },
  "tagged_moments": [ { "quote": "<КОРОТКА цитата ДОСЛІВНО з транскрипту, макс. 1-2 речення>", "tag": "<#Категорія_Кількома_Словами>" } ] АБО [] — див. правило нижче,
  "insights": {
    "client_pain": "<що саме шукає/потребує клієнт, коротко українською, або null якщо незрозуміло>",
    "objections": "<які сумніви/заперечення висловив клієнт, коротко, або null якщо їх не було>",
    "price_objection_response": "<ЛИШЕ якщо клієнт заперечив через ціну/бюджет ('дорого', 'не вкладаємось', 'занадто дорого') — чи запропонував менеджер дешевшу альтернативу (разову послугу замість підписки, менший пакет, знижку, розстрочку) і яка була реакція клієнта, коротко українською. Якщо цінового заперечення в розмові не було — null.>",
    "next_steps": "<які конкретні кроки та дедлайни зафіксовані наприкінці розмови, або null якщо нічого не зафіксовано>",
    "conversion_probability": <число 0-100 — див. правило нижче "Про conversion_probability", або null якщо оцінити неможливо>,
    "conversion_reasoning": "<одне речення українською — коротке обґрунтування оцінки ймовірності конверсії>",
    "goal_achieved": "<досягнуто, частково, не досягнуто, або null — див. правило нижче "Про goal_achieved">",
    "goal_achieved_reasoning": "<одне речення українською — що саме сталось чи не сталось відносно мети розмови>"
  }
}
Поле criteria: розбий оцінку САМЕ за критеріями з наданого промту. Ключі об'єкта criteria — це назва кожного критерію СКОПІЙОВАНА ДОСЛІВНО з наданого тексту (той самий регістр, ті самі пробіли, той самий пунктуаційний знак після номера), шкала 0-100. НЕ скорочуй назву до абревіатури чи одного слова, НЕ заміняй пробіли на підкреслення чи інші символи, НЕ вигадуй власних формулювань. Якщо промт не задає явного переліку — використай: greeting, needs_discovery, presentation, objection_handling, closing.
Якщо критерій описаний лише кількома рівнями (напр. "1 бал / 2 бали / 3 бали") — це ОРІЄНТИРИ для калібрування, а НЕ єдині дозволені значення. Виконання менеджера рідко ідеально відповідає одному рівню — оцінюй нюанс і став проміжні значення на шкалі 0-100 (напр. 45, 58, 72), якщо результат знаходиться між рівнями або частково відповідає вищому. Уникай механічного округлення до 33/67/100 у кожному критерії.
Для criteria_explanations: створи по одному реченню на кожен критерій з criteria, простою мовою, без професійного сленгу продажів — поясни, що саме перевіряється в цьому пункті.
Про speaker_labels: заповнюй ЗАВЖДИ, якщо транскрипт розмічений нейтральними літерами як "Спікер A:", "Спікер B:" і т.д. — це просто мітка діаризації, вона НЕ означає, хто говорив першим. Визнач з контексту хто з якої сторони: представник Inweb — role: manager; співрозмовник з боку клієнта — role: client. Якщо в транскрипті нема такої розмітки — поверни порожній об'єкт {}.
Для поля service: "Не цільова" повертай ЛИШЕ якщо (а) дзвінок короткий і ділової розмови не було / клієнт не зацікавлений / помилковий номер / голосова пошта, АБО (б) клієнт цікавиться послугою, якої Inweb не надає (email-маркетинг, розробка сайту "під ключ" тощо — усе поза SEO/GEO/PPC/Analytics/ASO/ASA/Nonprofit). Сервісний follow-up, збір фідбеку чи скарга клієнта на вже надану послугу — це НЕ "Не цільова", навіть без брифування в цій розмові: поверни реальну послугу, про яку йшлося.
Для поля conversation_kind: визнач МЕТУ цієї розмови окремо від того, ЩО обговорювали (це service): Брифування (перший/повторний збір вимог перед КП), Презентація КП, Крос-продаж (пропозиція додаткової послуги існуючому клієнту), Фідбек (перевірка як справи, збір побажань/скарг без брифу), Фідбек CSM (окремий структурований опитувальник Customer Success Manager по ЗАКРИТІЙ угоді — успішній чи неуспішній, не звичайний чек-ін; розпізнавай за характерним набором питань, а не за фразою-маркером, бо CSM може не називати себе: для неуспішних — що сподобалось у комунікації, які слабкі місця в пропозиції/процесі продажу заважали рішенню, чи розглядали інші агенції і чому обрали їх, що могли зробити краще щоб обрали нас, чи цікавлять інші послуги в майбутньому, за потреби промокод на аудит; для успішних — паралельний набір про сумніви перед рішенням, що сподобалось/можна покращити в комунікації, які агенції порівнювали, вирішальний фактор, інтерес до розширення співпраці; ознака — розмова про ЗАВЕРШЕНУ угоду, а не поточний проєкт), Знайомство з РМ (перший контакт без брифу — СЮДИ Ж належить будь-яка перша стартова (kickoff) зустріч команди/проєктного менеджера одразу після підписання/оплати, навіть якщо там вже обговорюють технічні деталі, дедлайни чи бюджети — головна ознака це ПЕРША робоча зустріч, а не глибина деталей), Технічне уточнення (деталі вже узгодженої роботи З КОМАНДОЮ, З ЯКОЮ КЛІЄНТ ВЖЕ ДАВНО ПРАЦЮЄ — не перша зустріч; НЕ використовуй для kickoff-зустрічі одразу після старту співпраці), Інше. Якщо розмова занадто коротка/не цільова — поверни null.
ВАЖЛИВО про score/criteria залежно від conversation_kind: надані вище критерії написані під розмови типу "Брифування" та "Презентація КП" — це ЄДИНІ два типи, для яких повертається повний score+criteria. Для будь-якого іншого conversation_kind ("Фідбек", "Фідбек CSM", "Технічне уточнення", "Крос-продаж", "Знайомство з РМ", "Інше") ці критерії буквально не застосовні до мети розмови — поверни "score": null та "criteria": {}, не підганяй розмову під критерії, які їй не відповідають, і не занижуй бал штучно.
ТЕ САМЕ ПРАВИЛО діє, якщо service визначено як "Не цільова" — навіть якщо формально це виглядало як "Брифування", розмова про послугу, якої Inweb не надає, тож критерії оцінки брифу не мають сенсу. Поверни "score": null та "criteria": {} і в цьому разі, незалежно від conversation_kind.
Про insights: заповнюй завжди, коли в розмові досить контексту — це окремі аналітичні висновки для керівника, не пов'язані напряму з балом за критеріями. ВАЖЛИВО: не занижуй criteria/score лише тому, що угода зрештою не відбулась чи клієнт обрав конкурента/зник — оцінюй ДІЇ менеджера в цій конкретній розмові, а не кінцевий результат перемовин, на який менеджер міг не впливати. Низька ймовірність конверсії — це самостійний висновок в insights, а не привід автоматично знижувати criteria.
Про price_objection_response: заповнюй ЛИШЕ якщо клієнт явно висловив цінове заперечення (дорого, не вкладаємось у бюджет, зависока вартість тощо) — в іншому випадку завжди null, навіть якщо ціна просто прозвучала без заперечення. Коли заперечення було: коротко зафіксуй (а) чи запропонував менеджер дешевшу альтернативу (разову послугу замість підписки/абонплати, менший пакет, знижку, розстрочку) — чи взагалі не запропонував нічого і просто погодився з відмовою; (б) яка була реакція клієнта на цю пропозицію, якщо вона була. Самостійний сигнал, не впливає на score/criteria.
ВАЖЛИВО про конкурентів у summary/insights: якщо клієнт згадує іншого виконавця (наприклад "ще одну людину порекомендували", "розглядаємо ще варіант"), НЕ уточнюй сам, що це саме агенція, фрілансер чи інхаус-команда, якщо клієнт це прямо не назвав. Пиши нейтрально ("розглядає ще один варіант", "згадав ще одного підрядника") — конкретний тип додавай лише якщо він дослівно прозвучав у розмові.
Про conversion_probability: це НЕ прогноз "скільки таких угод статистично закриється" (для цього немає даних) і НЕ оцінка за формальним етапом угоди (брифування/КП/договір/оплата) — етап угоди сам по собі не має напряму визначати число. Оцінюй за силою і однозначністю конкретних сигналів САМЕ В ЦІЙ розмові:
Підвищують ймовірність (незалежно від етапу): клієнт прямо каже про готовність співпрацювати/рухатись далі; вже співпрацювали раніше і лишились задоволені чи лояльні; немає жодних незакритих заперечень; є конкретна домовленість про наступний крок (дата, дія, дедлайн).
Знижують ймовірність: розмиті відповіді клієнта ("подумаємо", "передзвонимо самі"); тривала мовчанка чи зникнення клієнта; порівняння з конкурентами або явний пошук дешевшого варіанту; незакрите заперечення (ціна, бюджет, "не той час").
Число та conversion_reasoning мають бути внутрішньо узгоджені: якщо в поясненні описані сильні позитивні сигнали (немає заперечень, є явна домовленість) — число не може бути середнім чи низьким лише через те, що формальність (підпис, оплата) ще не відбулась.
ВИНЯТОК — якщо клієнт у цій розмові вже прямо підтвердив, що ОПЛАТИВ чи ПІДПИСАВ договір на обговорювану послугу (це стартова/kickoff-зустріч по вже оплаченому проєкту, а не перемовини) — конверсія вже відбулась, "ймовірність" більше не застосовна. У такому разі поверни "conversion_probability": null (НЕ 100, НЕ будь-яке інше число) та в conversion_reasoning коротко поясни: клієнт вже оплатив/підписав, тому оцінка ймовірності не має сенсу.
ЩЕ ОДИН ВИНЯТОК — якщо conversation_kind визначено як "Знайомство з РМ", завжди поверни "conversion_probability": null незалежно від змісту розмови: це або справжній перший контакт без брифу (зарано щось оцінювати), або стартова зустріч по вже оплаченому проєкту (конверсія вже відбулась) — в обох випадках оцінка ймовірності не застосовна для цього типу розмови.
ВАЖЛИВО про manager_mood/client_mood: завжди використовуй форму прислівника (закінчення на -о), а не прикметника — стать менеджера чи клієнта невідома, прикметник (доброзичлива/доброзичливий) буде граматично невірний для частини випадків.
Про tagged_moments: познач у транскрипті 3-8 НАЙВАЖЛИВІШИХ моментів, щоб керівник міг швидко пробігтись розмовою, не читаючи весь текст. Це ДОДАТКОВА розмітка поверх звичайного аналізу — вона НЕ впливає на score/criteria і не повторює їх дослівно. Кожен tagged_moment — це:
- "quote": цитата СКОПІЙОВАНА ДОСЛІВНО з транскрипту (той самий текст, без перефразування) — коротка, 1-2 речення, без префіксу "Спікер X:"/таймкоду.
- "tag": позначка у форматі "#Категорія_Кількома_Словами" (українською, з підкресленнями замість пробілів). Приклади категорій (не вичерпний список, вигадуй доречні): #Заперечення_Ціна, #Заперечення_Бюджет, #Біль_Клієнта, #Домовленість_Наступний_Крок, #Згадка_Конкурента, #Заперечення_Час, #Позитивний_Сигнал.
Обирай лише дійсно значущі моменти (заперечення, домовленості, болі клієнта, сильні сигнали) — не тегуй кожну репліку. Якщо розмова занадто коротка чи в ній немає таких моментів — поверни [].

ВАЖЛИВО про recommendations: кожна рекомендація має закінчуватись конкретною фразою в лапках, яку менеджер може дослівно сказати на наступній розмові з ЦИМ клієнтом — а не загальною порадою типу "активніше виявляти потреби". Приклад: замість "Слабко з'ясовано бюджет клієнта" напиши "Слабко з'ясовано бюджет клієнта — спробуй наступного разу: «Який бюджет ви закладали на цей напрямок?»". Фраза має бути готова до використання без додаткової адаптації менеджером.
Про goal_achieved: це ОКРЕМИЙ від score/criteria сигнал — чи розмова досягла своєї практичної мети, незалежно від того, наскільки "гарно" пройшли окремі кроки. НЕ впливає на score і НЕ повинен узгоджуватись із ним (розмова може мати високий score за манеру спілкування, але не досягнути мети, якщо клієнт так і не дав відповіді, і навпаки).
Визнач мету відповідно до conversation_kind:
- Брифування: мета досягнута, якщо з'ясовано ключову інформацію (хто ухвалює рішення, цілі клієнта, поточний стан, бюджет, терміновість) І зафіксовано конкретний наступний крок з датою (напр. дзвінок з презентацією КП призначено на конкретний день). "Частково" — якщо інформацію зібрано, але наступний крок без чіткої дати. "Не досягнуто" — якщо клієнт відмовився продовжувати чи розмова обірвалась без жодних домовленостей.
- Презентація КП: мета досягнута, якщо клієнт дав чітке рішення (згода рухатись далі) АБО зафіксовано конкретний наступний крок з датою. "Частково" — клієнт "подумає" без дати наступного контакту. "Не досягнуто" — пряма відмова або клієнт зник без відповіді.
- Для будь-якого іншого conversation_kind (Фідбек, Фідбек CSM, Технічне уточнення, Знайомство з РМ, Крос-продаж, Інше): оціни мету розмови виходячи з її власного контексту (напр. для Фідбека — чи з'ясовано задоволеність клієнта і чи зафіксовано наступний контакт; для Фідбек CSM — чи пройдено опитувальник до кінця і чи зафіксовано реальну причину; для Знайомства з РМ — чи встановлено робочий контакт і наступні кроки співпраці).
Якщо розмова занадто коротка/нецільова, щоб оцінити — поверни null.`;

// Deliberately untyped — the two call sites each build their own Supabase client via
// their own adminSupabase() helper, whose exact generic instantiation doesn't need to
// match here; only the .from()/.select() call shape matters.
type Db = any;

/**
 * Fetches the active prompt for this manager/conversation-type (manager_roles stores
 * manager UUIDs directly), runs Claude analysis on the transcript, and persists the
 * result against an EXISTING conversation row. Shared by reanalyze (existing
 * conversation) and manual entry (freshly-inserted conversation) so the prompt-lookup
 * and JSON schema never drift between the two call sites.
 */
export async function runAnalysisAndSave(
  db: Db,
  conversationId: string,
  transcript: string,
  managerId: string | null,
  convType: "call" | "meeting",
  existing?: { service?: string | null; conversationKind?: string | null }
): Promise<{ ok: boolean; score?: unknown; error?: string }> {
  // Flat shape (not a strict discriminated union) on purpose — this project's tsconfig
  // has strict:false, under which TS doesn't narrow `if (result.ok)` the way it would
  // under strictNullChecks, so callers check `result.error` directly instead.
  let systemPrompt = DEFAULT_SYSTEM;
  try {
    const { data: prompts } = await db
      .from("prompts")
      .select("text, name, manager_roles")
      .eq("active", true)
      .eq("conversation_type", convType)
      .order("updated_at", { ascending: false });

    let matchedText: string | null = null;
    if (prompts?.length) {
      if (managerId) {
        const match = prompts.find((p: any) => (p.manager_roles ?? []).includes(managerId));
        if (match) matchedText = match.text;
      }
      if (!matchedText) matchedText = prompts[0].text;
    }
    if (matchedText) {
      systemPrompt = `Ти — експерт з оцінки якості продажів в IT-агенції Inweb.\n\n${matchedText}\n\n${DEFAULT_SYSTEM.split("\n").slice(1).join("\n")}`;
    }
  } catch { /* use default */ }

  const client = new Anthropic({ apiKey: anthropicKeyAnalysis() });
  let analysis: Record<string, unknown>;
  let analysisCostUsd = 0;
  let analysisInputTokens = 0;
  let analysisOutputTokens = 0;
  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-5",
      // A long multi-stakeholder meeting can need more than 8192 output tokens — one
      // hit stop_reason="max_tokens" mid-JSON (2026-07-27), breaking JSON.parse with a
      // cryptic "Unterminated string" error instead of the response just being cut off.
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: "user", content: `Проаналізуй цю транскрипцію ${convType === "meeting" ? "зустрічі" : "дзвінка"}:\n\n${transcript}` }],
    });
    if (msg.stop_reason === "refusal" || msg.content.length === 0) {
      throw new Error("AI відмовився аналізувати цю розмову (спрацював фільтр безпеки)");
    }
    if (msg.stop_reason === "max_tokens") {
      throw new Error("Відповідь AI обірвалась — забагато даних для аналізу за один раз");
    }
    const textBlock = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) {
      throw new Error("AI не повернув текстову відповідь");
    }
    let raw = textBlock.text.trim();
    if (raw.startsWith("```")) { raw = raw.split("```")[1]; if (raw.startsWith("json")) raw = raw.slice(4); }
    analysis = JSON.parse(raw);
    // Claude Sonnet 5 intro pricing ($2/$10 per 1M tokens) — same rate used for Insights cost tracking.
    analysisCostUsd = (msg.usage.input_tokens / 1_000_000) * 2 + (msg.usage.output_tokens / 1_000_000) * 10;
    analysisInputTokens = msg.usage.input_tokens;
    analysisOutputTokens = msg.usage.output_tokens;
  } catch (e: any) {
    await db.from("conversations").update({ status: "failed" }).eq("id", conversationId);
    return { ok: false, error: `Claude analysis failed: ${e.message}` };
  }

  await db.from("ai_analysis").delete().eq("conversation_id", conversationId);
  await db.from("ai_analysis").insert({
    conversation_id: conversationId,
    score: analysis.score,
    summary: analysis.summary,
    strengths: analysis.strengths ?? [],
    weaknesses: analysis.weaknesses ?? [],
    recommendations: analysis.recommendations ?? [],
  });

  try {
    const extra: Record<string, unknown> = {};
    if (analysis.criteria != null) extra.criteria = analysis.criteria;
    if (analysis.criteria_explanations != null) extra.criteria_explanations = analysis.criteria_explanations;
    if (analysis.manager_mood) extra.manager_mood = analysis.manager_mood;
    if (analysis.client_mood) extra.client_mood = analysis.client_mood;
    if (analysis.speaker_labels != null) extra.speaker_labels = analysis.speaker_labels;
    if (analysis.insights != null) extra.insights = analysis.insights;
    if (analysis.tagged_moments != null) extra.tagged_moments = analysis.tagged_moments;
    extra.cost_usd = analysisCostUsd;
    if (Object.keys(extra).length > 0) {
      await db.from("ai_analysis").update(extra).eq("conversation_id", conversationId);
    }
  } catch { /* criteria columns not migrated yet — ignore */ }

  // Talk/listen ratio — reuses speaker_talk_seconds already saved on this
  // conversation at ingestion (recording/transcript doesn't change on reanalyze).
  try {
    if (analysis.speaker_labels != null) {
      const { data: convRow } = await db.from("conversations").select("speaker_talk_seconds").eq("id", conversationId).single();
      const managerTalkPct = computeManagerTalkPct(convRow?.speaker_talk_seconds, analysis.speaker_labels as any);
      if (managerTalkPct != null) {
        await db.from("conversations").update({ manager_talk_pct: managerTalkPct }).eq("id", conversationId);
      }
    }
  } catch { /* talk ratio columns not migrated yet — ignore */ }

  // Append-only cost log — unlike ai_analysis.cost_usd (overwritten on every
  // re-analysis), this survives every run so total spend is never lost.
  try {
    await db.from("ai_cost_log").insert({
      conversation_id: conversationId,
      cost_usd: analysisCostUsd,
      input_tokens: analysisInputTokens,
      output_tokens: analysisOutputTokens,
    });
  } catch { /* cost log table not migrated yet — ignore */ }

  // Never clobber a service/kind tag that's already set (manually corrected, or from a
  // prior analysis) — only fill it in if it was empty, so re-running analysis can't
  // silently undo a human's manual correction. Always empty for a brand-new manual entry.
  const updateData: Record<string, unknown> = { status: "analyzed" };
  if (analysis.service && !existing?.service) updateData.service = analysis.service;
  if (analysis.conversation_kind && !existing?.conversationKind) updateData.conversation_kind = analysis.conversation_kind;
  await db.from("conversations").update(updateData).eq("id", conversationId);

  return { ok: true, score: analysis.score };
}
