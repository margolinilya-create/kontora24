# Скиллы проекта Kontora24

Каталог `.claude/skills/` — навыки, которые Claude Code подхватывает автоматически
по полю `description` в `SKILL.md`. Вызывать вручную ничего не нужно: скилл
срабатывает, когда задача попадает под его триггеры.

Стек проекта: React + Vite (SPA), Zustand, Supabase, Tailwind, Sentry, Vitest + Playwright, GitHub Actions.

## Подключённые внешние скиллы (27.07.2026)

Отобраны из подборки на 52 скилла по критерию «применимо к стеку этого проекта».

### Процесс

| Скилл | Источник | Зачем |
|---|---|---|
| `brainstorming` | [obra/superpowers](https://github.com/obra/superpowers/tree/main/skills/brainstorming) | Вытягивает нормальное ТЗ до кода |
| `systematic-debugging` | [obra/superpowers](https://github.com/obra/superpowers/tree/main/skills/systematic-debugging) | 4 фазы поиска причины бага вместо тыканья наугад |
| `test-driven-development` | [obra/superpowers](https://github.com/obra/superpowers/tree/main/skills/test-driven-development) | Тесты первыми, код вторым |
| `verification-before-completion` | [obra/superpowers](https://github.com/obra/superpowers/tree/main/skills/verification-before-completion) | Запретить «готово» без прогона проверок |
| `writing-plans` | [obra/superpowers](https://github.com/obra/superpowers/tree/main/skills/writing-plans) | Большая задача → шаги по 2–5 минут с путями к файлам |
| `executing-plans` | [obra/superpowers](https://github.com/obra/superpowers/tree/main/skills/executing-plans) | Исполнение плана с чекпойнтами |
| `subagent-driven-development` | [obra/superpowers](https://github.com/obra/superpowers/tree/main/skills/subagent-driven-development) | Свежий субагент на задачу + двухстадийное ревью |
| `using-git-worktrees` | [obra/superpowers](https://github.com/obra/superpowers/tree/main/skills/using-git-worktrees) | Изолированные ветки, чтобы не сломать main |
| `dispatching-parallel-agents` | [obra/superpowers](https://github.com/obra/superpowers/tree/main/skills/dispatching-parallel-agents) | 2+ независимых задачи — параллельно |

### Ревью

| Скилл | Источник | Зачем |
|---|---|---|
| `requesting-code-review` | [obra/superpowers](https://github.com/obra/superpowers/tree/main/skills/requesting-code-review) | Чек-лист перед ревью/мержем |
| `receiving-code-review` | [obra/superpowers](https://github.com/obra/superpowers/tree/main/skills/receiving-code-review) | Разбор замечаний: принять / обсудить / отклонить |
| `finishing-a-development-branch` | [obra/superpowers](https://github.com/obra/superpowers/tree/main/skills/finishing-a-development-branch) | Финальные проверки перед коммитом и пушем |

### Фронтенд

| Скилл | Источник | Зачем |
|---|---|---|
| `react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) | ~70 правил производительности React от Vercel |
| `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines) | Аудит вёрстки и доступности (a11y, фокус, состояния) |

### База данных

| Скилл | Источник | Зачем |
|---|---|---|
| `supabase-postgres-best-practices` | [supabase/agent-skills](https://github.com/supabase/agent-skills/tree/main/skills/supabase-postgres-best-practices) | Производительность Postgres: индексы, схема, планы |

### Безопасность

| Скилл | Источник | Зачем |
|---|---|---|
| `vibesec` | [BehiSecc/VibeSec-Skill](https://github.com/BehiSecc/VibeSec-Skill) | XSS / SQLi / IDOR / SSRF в вебе |
| `security-threat-model` | [openai/skills](https://github.com/openai/skills/tree/main/skills/.curated/security-threat-model) | Модель угроз по репозиторию перед выкаткой |

### GitHub

| Скилл | Источник | Зачем |
|---|---|---|
| `gh-fix-ci` | [openai/skills](https://github.com/openai/skills/tree/main/skills/.curated/gh-fix-ci) | Красные чеки GitHub Actions: читает логи и чинит |
| `gh-address-comments` | [openai/skills](https://github.com/openai/skills/tree/main/skills/.curated/gh-address-comments) | Правки по комментариям ревью в открытом PR |

### Прод

| Скилл | Источник | Зачем |
|---|---|---|
| `sentry` | [openai/skills](https://github.com/openai/skills/tree/main/skills/.curated/sentry) | Разбор ошибок продакшена через Sentry CLI |

### Мета

| Скилл | Источник | Зачем |
|---|---|---|
| `review-claudemd` | [ykdojo/claude-code-tips](https://github.com/ykdojo/claude-code-tips/tree/main/skills/review-claudemd) | Анализ сессий → что дописать в CLAUDE.md |

### Особенности этого проекта

- `react-best-practices` — правила Vercel рассчитаны на Next.js; здесь **Vite SPA**, поэтому `server-*`/RSC-правила не применяются (это прописано в описании скилла).
- `sentry` взят потому, что в проекте подключён `@sentry/react` — скилл разбирает ошибки прода через Sentry CLI, без открывания дашборда.
- `gh-fix-ci` / `gh-address-comments` требуют установленного `gh` CLI (в проекте есть `.github/workflows/ci.yml`).

## Локальные правки внешних скиллов

Скиллы скопированы в репозиторий (vendored), а не подтянуты пакетным менеджером,
и адаптированы под проект:

- **Пути к артефактам**: планы → `docs/plans/`, спеки → `specs/`.
- **Ссылки между скиллами** — убран префикс `superpowers:`; все ссылки ведут на
  скиллы, которые реально установлены здесь же (висячих ссылок нет).
- **Описания дополнены русскими триггерами** — общение в проекте на русском,
  иначе скилл не сработает на «упал CI» или «проверь вёрстку».
- **`name` в frontmatter приведён к имени папки** (требование Claude Code).
- Удалено лишнее: Codex-манифесты `agents/openai.yaml`, ассеты-картинки, `.zip`.

Поэтому **обновлять их через `npx skills update` нельзя** — правки затрутся.
Обновление вручную: скачать новую версию из источника и повторно применить пункты выше.

## Что из подборки сознательно не бралось

| Скилл | Причина |
|---|---|
| `google-labs-code/shadcn-ui` | Репозитория `google-labs-code/skills` по ссылке из таблицы не существует (404) |
| `postgres` (read-only SELECT) | Перекрывается `supabase-postgres-best-practices` |
| `openai/yeet` | Конфликтует с `finishing-a-development-branch` (свои правила коммитов) |
| `mcp-builder`, `skill-creator` | Доступны глобально; MCP-серверы в проекте не пишем |
| `agnix` | Это npm-линтер (CLI), а не скилл — ставится отдельно, если понадобится |
| `csv-data-summarizer`, `firecrawl-*`, `notebooklm` | Разовые утилиты, к стеку проекта отношения не имеют |
| Контент / маркетинг / автоматизация | YouTube, X/Twitter, блоги, Telegram, Obsidian, typefully, courier, remotion, pinme и т.п. — это продуктовый репозиторий, не медиапроект |
