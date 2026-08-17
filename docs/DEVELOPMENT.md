# FreeMoney-AI Development & Local Setup Guide

## Prerequisites
- Node.js v20+ / v22+
- npm v10+
- PostgreSQL 15+ (or Supabase local development instance)

---

## Local Setup Instructions

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/Leeak82/Freemoney-AI.git
cd Freemoney-AI
npm install
```

### 2. Configure Environment Variables
Copy the template configuration:
```bash
cp .env.example .env
```
Update `.env` with your PostgreSQL database credentials.

### 3. Initialize Database & Seed Taxonomies
```bash
npm run migrate
npm run seed
```

### 4. Ingest Live Grants.gov Data
Run the ingestion script to populate real federal opportunities:
```bash
npm run sync
```

### 5. Start Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:3000`.

---

## Testing & Quality Assurance
Run the test suite using Vitest:
```bash
npm test
```

Build production TypeScript bundle:
```bash
npm run build
```
