# Karpi Finanzas — Reconciliation System

Welcome to the **Karpi Finanzas** codebase! This application is a high-performance financial reconciliation system built with React, TypeScript, Vite, and Supabase. It provides complete tools to import, parse, match, and reconcile bank statement transactions against billing provision records (invoices), commissions, and internal companies.

---

## Table of Contents
1. [Tech Stack Overview](#tech-stack-overview)
2. [Project Architecture & Design Principles](#project-architecture--design-principles)
3. [Directory Structure](#directory-structure)
4. [Domain Model & Database Schema](#domain-model--database-schema)
5. [Core Operations & Workflows](#core-operations--workflows)
6. [Getting Started](#getting-started)

---

## Tech Stack Overview
- **Core Framework:** React 18+ powered by Vite.
- **Language:** TypeScript strictly configured (no implicit `any`).
- **Database / Backend:** Supabase (Auth, PostgreSQL DB client).
- **Styling:** SCSS CSS Modules (`*.module.scss`) for component-level local styling.
- **Routing:** React Router v6.
- **Iconography:** `lucide-react`.

---

## Project Architecture & Design Principles

The application relies on a **layered, decoupled design** where presentation, business logic, and database access are strictly separated:

```
[Pages / Components] ──(Uses Hooks)──> [Custom Hooks] ──(Calls Services)──> [Services] ──(Queries SDK)──> [Supabase Backend]
```

### 1. Smart vs. Dumb Components
- **Pages** (`src/pages/`): Act as the "smart" stateful orchestrators. They handle page-level routing, query databases, execute business mutations, and pass props downwards.
- **Components** (`src/components/`): Act as "dumb" presentational units or isolated modals. They receive raw props, render responsive layouts, and propagate user action signals upward via callbacks.

### 2. Service Layer Abstraction
- Components and Pages never query Supabase/Database clients directly. They hook into custom state wrappers (`useDatabase`), which utilize specialized TypeScript services (`DatabaseService`) encapsulating the database SDK.

### 3. Local Time Safety
- JavaScript dates are prone to timezone offset bugs (e.g. UTC offsets shifting calendar dates). The codebase routes all date evaluations exclusively through a custom utility class `DateEngine` (`src/utils/DateEngine.ts`) using local date formats.

---

## Directory Structure

```
├── src/
│   ├── components/       # Reusable UI components & isolated modal surfaces
│   ├── context/          # Global React Context providers (PeriodContext, etc.)
│   ├── hooks/            # Custom React hooks (useDatabase, useAuth)
│   ├── lib/              # SDK initialization libraries (supabase.ts)
│   ├── pages/            # Top-level smart containers & route entries
│   ├── services/         # Pure TypeScript service classes (Reconciliation, StatementParser)
│   ├── types/            # Centralized TypeScript domain declarations (index.ts, auth.ts)
│   ├── utils/            # Pure, React-agnostic formatting & operational helpers
│   ├── App.tsx           # Application entry and layout wrapper
│   └── main.tsx          # DOM initialization
```

---

## Domain Model & Database Schema

The core database collections are declared in [src/types/index.ts](file:///Users/leonel/Documents/Desarrollo/react-sites/financial-reconciliation/src/types/index.ts):

*   **`clients`**: Contains customer data, commissions, RFCs, and their corresponding group links.
*   **`client_groups`**: High-level groups containing client records.
*   **`internal_companies`**: Entities representing internal companies.
*   **`billing_records`**: XML-invoiced CFDI provision data.
*   **`bank_transactions`**: Transactions imported from bank statements.

---

## Core Operations & Workflows

### 1. XML Ingestion & Client Auto-Creation
- In [Vault.tsx](file:///Users/leonel/Documents/Desarrollo/react-sites/financial-reconciliation/src/pages/Vault.tsx), users upload bulk XML files.
- The parser matches receptor RFC codes to existing clients. If a matching client is not found, the system auto-registers the new client dynamically using the XML receptor details to prevent load interruption.
- A warning count is shown in the success alert, and a notification dot is added to the navigation sidebar using a lightweight window event dispatcher (`clients-updated`).

### 2. Reconciliation matching
- Matches bank transactions against billing records based on RFC codes, payment amounts, and transaction periods.
- Provides visual aids to mark transactions as reconciled or link unmatched items.

---

## Getting Started

### Local Setup
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Start the local Vite development server:
   ```bash
   npm run dev
   ```
3. To compile the production build:
   ```bash
   npm run build
   ```
