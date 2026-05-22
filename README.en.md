[![中文](https://img.shields.io/badge/Language-中文-lightgrey)](README.md) [![English](https://img.shields.io/badge/Language-English-blue)](README.en.md)

# LLM Arena — Chatbot Competition Platform

LLM Arena is a Kaggle-like platform for LLM teaching and classroom competitions. Instructors publish activities, configure question banks and judge profiles, while students subscribe to activities, submit Prompts or Chatbot/API configurations, run model-based evaluations, view leaderboards, and present final awards.

## Interface Preview

Instructors can create, clone, and manage competition activities from the Arena dashboard:

![Instructor dashboard](docs/assets/system-02-admin-dashboard-en.png)

Students can enter an activity, configure a Prompt or Chatbot, run public trials, submit evaluations, and view rankings:

![Student activity page](docs/assets/system-05-student-task-en.png)

## Features

- **Four participation modes**: organizer-provided LLM, OpenAI-compatible API, Dify, and Coze.
- **Two judging modes**: exact/objective scoring and LLM judge subjective scoring.
- **Competition lifecycle**: Draft -> Preliminary -> Finals -> Ended.
- **Automatic advancement**: rank by hidden test score, with tie expansion.
- **Leaderboard and awards**: live ranking during the activity and podium-style awards after it ends.
- **Worker-thread evaluation**: asynchronous submission processing with LLM concurrency control.
- **SSO login**: supports jAccount and can be extended to other SSO providers.
- **In-app notifications and email notifications**.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js App Router + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Database | SQLite with Prisma ORM |
| Auth | Custom JWT + SSO |
| Deployment | Docker (`node:20-alpine`), multi-stage build |
| Worker | Worker thread bundled with esbuild |

## Online Demo and Guides

A public demo is available for testing:

- Demo URL: https://arena.sjtu.edu.cn
- Demo activity: `Demo: Game 24（算24点）`
- Subscription code: `945351`

Suggested test flow: register or sign in, open the Arena dashboard, click “Enter subscription code”, enter `945351`, join the demo activity, enroll, configure a Prompt or Chatbot, run public trials, and check the leaderboard.

Guides:

- [Arena System Guide](docs/en/system-guide.md): roles, lifecycle, question splits, judge profiles, student workflow, and launch checklist.
- [LLM Prompt Contest Guide: Game 24](docs/en/prompt-contest-guide.md): recommended setup for a Prompt-only contest where the instructor provides the model.
- [LLM Agent Contest Guide: Game 24](docs/en/agent-contest-guide.md): recommended setup for an agent contest where students connect OpenAI-compatible APIs, Dify, or Coze.

## Quick Deployment with Docker

1. Install Docker and Docker Compose.
2. Clone the repository:

   ```bash
   git clone https://github.com/xuan-wei/LLMArena.git
   cd LLMArena
   ```

3. Configure environment variables:

   ```bash
   cp .env.example .env
   # Edit .env and set JWT_SECRET to a long random string.
   ```

4. Create the data directory and start the service:

   ```bash
   mkdir -p data
   docker compose up -d --build
   ```

5. Visit http://localhost:3000.

On first startup, the database is initialized automatically and default accounts are created.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | SQLite database path | `file:/data/arena.db` |
| `JWT_SECRET` | JWT signing secret, required | - |
| `LLM_CONCURRENCY` | Concurrent calls per LLM account | `15` |
| `SUBMISSION_CONCURRENCY` | Concurrent submissions handled by the worker | `10` |
| `FOOTER_COPYRIGHT` | Footer copyright text | - |
| `FOOTER_ICP` | Footer ICP registration number | - |
| `ALLOWED_DEV_ORIGINS` | Extra allowed origins in development, comma-separated | - |
| `JACCOUNT_CLIENT_ID` | jAccount SSO client ID | - |
| `JACCOUNT_CLIENT_SECRET` | jAccount SSO client secret | - |
| `JACCOUNT_REDIRECT_URI` | SSO callback URL | - |
| `SMTP_HOST/PORT/USER/PASS` | SMTP email configuration | - |

See `.env.example` for the full list.

## Data Persistence

All data is stored in a single SQLite file at `./data/arena.db`, mounted through Docker volume configuration. Rebuilding the container does not remove the database.

## Local Development

```bash
npm install
npx prisma db push
npx prisma db seed
npm run dev
```

Then visit http://localhost:3000.

## Default Accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@arena.edu | admin123 |
| Sample student | student@arena.edu | student123 |

## Data Migration

```bash
# Old server: stop the container first, then archive data.
docker compose down
tar czf arena-backup.tar.gz data/arena.db .env

# New server: restore and start.
git clone https://github.com/xuan-wei/arena.git && cd arena
tar xzf /path/to/arena-backup.tar.gz
docker compose up -d --build
```

Stop the container before copying the database to avoid WAL-related corruption. The `.env` file, especially `JWT_SECRET`, must be migrated together; otherwise existing sessions become invalid.

## Updating Deployment

```bash
git pull
docker compose up -d --build
```
