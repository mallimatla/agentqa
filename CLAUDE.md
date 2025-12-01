# AgentQA - Project Context

## IMPORTANT: Do NOT overwrite existing code
This project has significant work completed. Always check git history before making changes.

## Current State (Updated: Dec 1, 2024)
- **Branch:** `claude/playwright-e2e-automation-01Ez184cRAQAAYwzBDkP8aw8`
- **Latest Commit:** `ff9aa23` - Vercel + Firebase deployment infrastructure

## Architecture

### Frontend (Next.js 16 + Tailwind)
- `app/` - Next.js App Router pages
  - `app/(auth)/` - Login, Signup pages
  - `app/(dashboard)/` - Dashboard, Projects, Tests pages
  - `app/api/` - API routes for projects, test generation, execution
  - `app/hooks/useAuth.tsx` - Firebase auth hook

### Backend Services
- `src/config/firebase.ts` - Client SDK
- `src/config/firebase-admin.ts` - Admin SDK (server-side)
- `src/services/firestore.ts` - Database operations
- `src/services/storage.ts` - File storage

### Core Testing Engine
- `src/core/intelligence/strategy-engine.ts` - Intelligent test generation
- `src/core/crawler/` - Web crawler
- `src/core/generator/` - Test script generator
- `src/core/executor/` - Test executor

### Test Application
- `test-app/server.js` - Express app for testing AgentQA (891 lines)
  - Auth with 3 user roles (Admin, User, Guest)
  - Products, Orders, Admin panel

## Build Commands
- `npm run dev` - Next.js dev server
- `npm run build` - Build CLI + Next.js
- `npm run build:cli` - Build CLI only

## Deployment
- Configured for Vercel (`vercel.json`)
- Uses Firebase for Auth, Firestore, Storage
- Environment variables in `.env.example`

## DO NOT
- Overwrite files without reading them first
- Remove Firebase/Vercel integration
- Delete the test-app directory
- Reset to old code versions
