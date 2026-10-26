# OmniCRM — Multi-Tenant Enterprise CRM

A production-ready CRM database architecture and web platform powered by **PostgreSQL 17** with native **Row-Level Security (RLS)**, **UUIDv7** time-ordered indexing, and strict multi-tenant isolation.

---

## Deliverables & Documentation

- 🌐 **[Live Documentation Website (GitHub Pages)](https://syedmahammedafzal.github.io/multi-tenant-crm/)** — Live online architecture whitepaper with interactive Mermaid ERD and 1-click PDF download.
- 📄 **[CRM_Architecture_Documentation.pdf](CRM_Architecture_Documentation.pdf)** — Official 23-page high-contrast PDF specification report.
- 📝 **[DOCUMENTATION.md](DOCUMENTATION.md)** — Comprehensive architecture report in Markdown format.
- 💻 **[schema.sql](schema.sql)** — Production-grade PostgreSQL database schema DDL.
- 🌱 **[seed.sql](seed.sql)** — Sample seed data for multi-tenant organizations, accounts, contacts, pipelines, and deals.

---

## Features

1. **Dual-Layer Multi-Tenant Isolation**:
   - PostgreSQL engine-enforced **Row-Level Security (RLS)** with session-level tenant context (`SET LOCAL app.current_tenant_id = '...'`).
   - Relational defense with **Composite Foreign Keys** `(tenant_id, id)` preventing cross-tenant data leaks.
2. **Deals Pipeline (Kanban Board)**:
   - Interactive drag-and-drop opportunity cards across sales stages (*Discovery*, *Proposal Sent*, *Negotiation*, *Closed Won*).
   - Real-time stage updates synchronized directly to PostgreSQL.
3. **Company Accounts Directory**:
   - Enterprise account management tracking domains, industries, annual revenues, and lifecycle stages.
4. **Contacts Directory**:
   - Key decision-maker directory with company relations, communication links, and primary contact tags.
5. **Modern Native Modals**:
   - Built with semantic HTML `<dialog>` elements featuring backdrop blur, scroll chaining containment, and light-dismiss fallbacks.

---

## Setup & Running Locally

### 1. Prerequisites
- **Node.js** (v18+)
- **PostgreSQL** (v14+, recommended v16 or v17)

### 2. Database Initialization
```bash
# Create the database
createdb -U postgres crm_db

# Run schema and seed scripts
psql -U postgres -d crm_db -f schema.sql
psql -U postgres -d crm_db -f seed.sql
```

### 3. Application Setup
```bash
# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env and set your DB_PASSWORD

# Start the server
npm start
```
The CRM dashboard will be live at `http://localhost:3000`.

---

## Project Structure

```
├── schema.sql              # Core database schema (UUIDv7, RLS, tables, indexes)
├── seed.sql                # Demo dataset for accounts, deals, contacts
├── DOCUMENTATION.md        # Complete Architecture Specification & Data Dictionary
├── server.js               # Node.js Express backend with tenant-scoped transactions
├── package.json            # Project dependencies & scripts
├── .env.example            # Environment configuration template
└── public/
    ├── index.html          # Dashboard markup & native dialogs
    ├── style.css           # Modern dark-mode glassmorphism stylesheet
    └── app.js              # Client-side Kanban drag-and-drop & API logic
```
