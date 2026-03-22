# 🚆 IRCTC Dismantled (Concurrency & Scaling Workshop)

A complete demonstration project showing race conditions and locking strategies (Database level and Redis level) for a high-concurrency ticket booking system.

## Project Structure
- `/backend`: Node.js + Express backend to handle booking APIs and database connections.
- `/frontend`: React + Vite frontend for user interaction.
- `/load-testing`: Artillery scripts to demonstrate concurrency scenarios.

## 🛠️ Prerequisites
- Node.js (v18+)
- PostgreSQL (running on `localhost:5432` with user/pass `postgres:postgres` or modify `.env`)
- Redis (running on `localhost:6379` or modify `.env`)
- Artillery (installed globally: `npm install -g artillery`)

## 🚀 Setup Instructions

### 1. Database Setup (Recommended via Docker)
1. Ensure Docker is running locally.
2. Open your terminal and start the databases:
   ```bash
   docker compose up -d
   ```
   *(Wait a few seconds for them to be fully ready)*
3. Open a terminal in the `/backend` folder.
4. Run the seed script to create tables and sample data:
   ```bash
   node scripts/seed.js
   ```

### 2. Start the Backend
Open a terminal in the `/backend` folder:
```bash
npm install
npm run dev
# Server will run on http://localhost:3000
```

### 3. Start the Frontend
Open another terminal in the `/frontend` folder:
```bash
npm install
npm run dev
# Vite will open the app on http://localhost:5173
```

## 🎤 Workshop Demonstration Flow

### The Race Condition (Naive Mode)
1. Open the frontend URL in **two different browser windows side-by-side**.
2. Select the same train and the *exact same seat* in both windows. 
3. Select "Naive Mode".
4. Click "Book" on both windows simultaneously.
5. Notice how *both* succeed and double-book the seat.

### Fix #1: Database Lock
1. Reset the DB using the "Reset DB" button on the UI (top right).
2. Select a seat, change the mode to "Database Lock".
3. Book from both windows simultaneously.
4. Only one will succeed, the other will fail safely.

### Fix #2: Redis Distributed Lock
1. Reset the DB.
2. Change the mode to "Redis Distributed Lock".
3. Book from both windows again.
4. Only one will succeed, the other is blocked immediately by Redis.

### Load Testing Demonstration
To mathematically prove the race condition across ~100 concurrent requests:

```bash
cd load-testing

# 1. Shows massive failure (multiple 200 OKs for the exact same seat!)
artillery run naive.yaml 

# 2. Shows correct locking (Exactly one 200 OK, multiple 400 Bad Requests)
artillery run db-lock.yaml 

# 3. Shows distributed locking effectiveness
artillery run redis-lock.yaml
```
