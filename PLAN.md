# Financial Reconciliation System - Development Plan

This document tracks the progress of the MVP implementation. Every task must adhere to the project's architectural rules and SCSS module standards.

## Phase 1: Infrastructure & Core Identity (Foundation)
- [x] **1.1 Environment & Dependencies**
    - [x] Install `react-router-dom`, `@supabase/supabase-js`, `lucide-react`, `clsx`, `tailwind-merge`.
    - [x] Scaffold directory structure.
    - [x] Initialize Supabase client.
- [x] **1.2 Authentication & RBAC**
    - [x] Create `AuthService` for Supabase Auth abstraction.
    - [x] Implement `AuthContext` with Profile hydration (Role & Company ID).
    - [x] Create `useAuth` hook.
- [x] **1.3 Routing & Layout**
    - [x] Setup `react-router-dom` with role-based Route Guards.
    - [x] Create `MainLayout` with responsive navigation.
    - [x] Implement Spanish-language `Login` page.
- [x] **1.4 Supabase Project Configuration (User Task)**
    - [x] Create Supabase project and retrieve API credentials.
    - [x] Configure local `.env` file.
    - [x] Verify connection from the frontend to the backend.

## Phase 2: Database & Operational Console (Staff Input)
- [x] **2.1 Database Schema & RLS**
    - [x] Execute SQL migrations for core tables.
    - [x] Configure Row-Level Security (RLS) for data isolation.
    - [x] Setup DB trigger for `auth.users` -> `public.profiles` replication.
- [x] **2.2 Staff Ledger System**
    - [x] Implement `DatabaseService` generic CRUD wrapper.
    - [x] Implement `useDatabase` hook for real-time ledger updates.
    - [x] Build **Ops Console** page with optimized forms for ledger entry.

## Phase 3: Executive Insights (Owner Dashboard) & FE Check
- [x] **3.1 Financial Aggregation**
    - [x] Develop "Retainer" logic (Saldos a Favor) as operational liabilities.
    - [x] Implement queries for True Net Utility vs. Total Cash Flow.
- [x] **3.2 Owner Dashboard**
    - [x] Create KPI cards for aggregate bank balances across 17 entities.
    - [x] Implement unmatched transaction alerts and "Red Flag" indicators.
- [x] **3.3 Frontend Architecture Check**
    - [x] Review component modularity and SCSS consistency.
    - [x] Verify state management efficiency for upcoming reconciliation complexity.

## Phase 4: Bank Ingestion & Reconciliation Matrix
- [ ] **4.1 Bank Data Ingestion**
    - [x] Create **Auditor Workspace** for bank statement management.
    - [ ] Implement PDF parsing interface (Edge Function or Service integration).
- [ ] **4.2 Reconciliation Engine**
    - [ ] Develop **Auto-Match Routine** (Amount + Date proximity).
    - [ ] Build **Assisted Manual Match UI** (Two-column layout).
    - [ ] Implement reconciliation state flags (Matched, Unmatched, Non-Invoiced).

## Phase 5: Validation & Hardening
- [ ] **5.1 Security & Integrity**
    - [ ] Audit RLS policies for cross-entity leakage.
    - [ ] Verify immutable bank record constraints.
- [ ] **5.2 Final Polish**
    - [ ] Full Spanish UI translation check.
    - [ ] Accessibility and mobile responsiveness.
