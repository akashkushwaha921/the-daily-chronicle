# The Daily Chronicle

A multi-author blogging platform using Node.js, Express, EJS and PostgreSQL.

## Requirements
- Node.js 20+
- npm
- PostgreSQL

## Setup
1. Copy `.env.example` to `.env` and update the values.
2. Create a PostgreSQL database named `daily_chronicle`.
3. Run the SQL in `database/schema.sql`.
4. Install dependencies: `npm install`
5. Start development server: `npm run dev`
6. Open http://localhost:3000

## Team workflow
- `main` is the stable branch.
- Create feature branches from the latest `main`.
- Push your branch and open a Pull Request.
- Do not commit `.env` or `node_modules`.

## Developer ownership
- Developer 1: backend, database, authentication, routes and controllers.
- Developer 2: EJS views, CSS, browser JavaScript and responsive UI.
- Coordinate before changing shared files such as `app.js`, `package.json` and database schema.
