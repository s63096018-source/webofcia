# CIA Field Operations — Reports Portal

A secure web portal for managing CIA field operation reports in your FiveM GTA 5 roleplay server.

## Features

- **Secure login system** with JWT authentication
- **Three access levels:**
  - **Viewer** — can browse and read all reports
  - **Agent** — can create reports and edit or delete only reports they filed
  - **Full Access** — can create, edit, and delete any report, and review the activity log
- **Full report fields:**
  - Auto-generated report number (e.g. `CIA-2026-0003`)
  - Title, description, internal notes
  - Reporter name and callsign
  - Unit callsigns (multiple)
  - Incident date and time
  - Location
  - Classification level (Unclassified → Top Secret)
  - Status and priority
  - Tags
  - Image evidence attachments
- **Premium dark intelligence-agency UI**
- **Search and filter** by status, classification, priority
- **Agent Roster** for ranks, names, Discord IDs, citizen IDs, and responsibilities. All signed-in roles can view it; Full Access can add, edit, delete, and reorder entries.
- **SQLite database** — all data persists locally

## Quick Start

```bash
npm install
npm start
```

Open **http://localhost:3000** in your browser.

## Default Accounts

| Username | Password    | Role   | Access                          |
|----------|-------------|--------|---------------------------------|
| `full`   | `full123`   | Full Access | All reports and activity logs |
| `agent`  | `agent123`  | Agent  | Create reports; manage own reports |
| `viewer` | `viewer123` | Viewer | Read-only — view reports only   |

> Change these passwords before deploying to a public server.

## Usage

1. Log in with your operative credentials
2. Browse reports on the dashboard
3. Click any report to view full details and evidence
4. **Agents and Full Access:** click **New Report** to file a report. Agents can manage only reports they created.
5. Upload screenshot evidence from in-game operations
6. Use search and filters to find specific reports
7. **Full Access:** open **Activity Logs** to search and browse the complete activity history.

## Project Structure

```
crafting/
├── server.js           # Express server
├── database.js         # SQLite setup & seed data
├── middleware/auth.js  # JWT authentication
├── routes/
│   ├── auth.js         # Login/logout
│   ├── reports.js      # Report CRUD + file uploads
│   └── roster.js       # Agent roster, editable by Full Access
├── public/
│   ├── css/style.css   # Premium CIA theme
│   ├── js/             # Frontend logic
│   ├── login.html
│   └── dashboard.html
└── data/               # SQLite database (auto-created)
```

## Environment

| Variable     | Default              | Description          |
|--------------|----------------------|----------------------|
| `PORT`       | `3000`               | Server port          |
| `JWT_SECRET` | (built-in dev value) | Change for production |
