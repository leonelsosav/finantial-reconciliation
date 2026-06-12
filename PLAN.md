# Financial Reconciliation System - Development Plan

This document tracks the progress of the MVP implementation. Every task must adhere to the project's architectural rules and SCSS module standards.

## Phase 1: Infrastructure & Core Identity (Foundation)
- [x] **1.1 Environment & Dependencies**
    - [x] Install `react-router-dom`, `@supabase/supabase-js`, `lucide-react`, `clsx`, `tailwind-merge` (optional utilities).
    - [x] Scaffold directory structure: `/services`, `/hooks`, `/context`, `/types`, `/lib`.
    - [x] Initialize Supabase client in `src/lib/supabase.ts`.
- [x] **1.2 Authentication & RBAC**
    - [x] Create `AuthService` for Supabase Auth abstraction.
    - [x] Implement `AuthContext` with Profile hydration (Role & Company ID).
    - [x] Create `useAuth` hook.
- [ ] **1.3 Routing & Layout**
    - [ ] Setup `react-router-dom` with role-based Route Guards.
    - [ ] Create `MainLayout` with responsive navigation.
    - [ ] Implement Spanish-language `Login` page.

## Phase 2: Database & Operational Console (Staff Input)
- [ ] **2.1 Database Schema & RLS**
    - [ ] Execute SQL migrations for `profiles`, `internal_companies`, `clients`, `staff_records`, `bank_transactions`.
    - [ ] Configure Row-Level Security (RLS) for data isolation by Company ID.
    - [ ] Setup DB trigger for `auth.users` -> `public.profiles` replication.
- [ ] **2.2 Staff Ledger System**
    - [ ] Implement `DatabaseService` generic CRUD wrapper.
    - [ ] Build **Ops Console** page with optimized forms for ledger entry.
    - [ ] Implement `useDatabase` hook for real-time ledger updates.

## Phase 3: Bank Ingestion & Reconciliation Matrix
- [ ] **3.1 Bank Data Ingestion**
    - [ ] Create **Auditor Workspace** for bank statement management.
    - [ ] Implement PDF parsing interface (Edge Function or Service integration).
- [ ] **3.2 Reconciliation Engine**
    - [ ] Develop **Auto-Match Routine** (Amount + Date proximity).
    - [ ] Build **Assisted Manual Match UI** (Two-column layout).
    - [ ] Implement reconciliation state flags (Matched, Unmatched, Non-Invoiced).

## Phase 4: Executive Insights (Owner Dashboard)
- [ ] **4.1 Financial Aggregation**
    - [ ] Develop "Retainer" logic (Saldos a Favor) as operational liabilities.
    - [ ] Implement queries for True Net Utility vs. Total Cash Flow.
- [ ] **4.2 Owner Dashboard**
    - [ ] Create KPI cards for aggregate bank balances across 17 entities.
    - [ ] Implement unmatched transaction alerts and "Red Flag" indicators.

## Phase 5: Validation & Hardening
- [ ] **5.1 Security & Integrity**
    - [ ] Audit RLS policies for cross-entity leakage.
    - [ ] Verify immutable bank record constraints.
- [ ] **5.2 Final Polish**
    - [ ] Full Spanish UI translation check.
    - [ ] Accessibility and mobile responsiveness.
