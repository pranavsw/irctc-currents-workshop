# 🚆 IRCTC Dismantled: Master Workshop Guide

This document is your complete playbook for running the 2.5-hour workshop. It includes the presentation outline and all the copy-paste code blocks your students will need to build the backend architecture from zero to production-grade using a clean Service-Controller approach.

---

## 🕒 Workshop Schedule Overview
* **0:00 - 0:10 (10 min):** The Hook (Demonstrating the Double-Booking Bug)
* **0:10 - 1:10 (60 min):** Theory & Concepts (PPT Presentation)
* **1:10 - 2:45 (1h 35m):** Live Coding & Setup (Building the fix step-by-step)

---

## 🎣 Part 1: The Hook (5-10 mins)
**Goal:** Grab their attention immediately by breaking a system they use every day.
1. Have your completed project running on your computer.
2. Open two browser windows side-by-side on the projector.
3. Show the **"Naive Mode"** in the dropdown.
4. Try to book the same seat manually at the same time to show both succeeding (Double Booking).
5. Now, run the Artillery load test in your terminal: `npx artillery run load-testing/naive.yaml`.
6. Look at the UI—show the students how a single seat (e.g. `S-1`) was just booked by 100 different people (pulsing red warning).
7. **The Pitch:** *"Today, we are going to learn exactly why this happens in almost every junior developer's code, and how companies like IRCTC, BookMyShow, and Ticketmaster solve it using System Design."*

---

## 📊 Part 2: PPT Concepts Outline (60 mins)
*Use your slides to visually explain these core topics before writing any code.*

### 1. What is Concurrency?
* Define Concurrency (dealing with lots of things at once) vs. Parallelism (doing lots of things at once).
* Briefly explain the Node.js Event Loop.
* **Analogy:** Two people independently trying to grab the exact same empty chair at a busy restaurant.

### 2. The Race Condition
* Explain the lethal "Read-Modify-Write" cycle.
* Show a timeline diagram: Node A reads -> Node B reads -> Node A writes (Booked) -> Node B writes (Booked) = **THE BUG!**

### 3. ACID Transactions & Pessimistic Locks
* Define ACID. Focus heavily on **Isolation**—how SQL databases try to keep simultaneous queries from stepping on each other's toes.
* **Pessimistic Locking:** Assuming the worst. Locking the row locally so nobody else can even *look* at it until you are completely finished. (`SELECT ... FOR UPDATE`). 

### 4. Redis & Distributed Systems
* What happens when you scale from 1 Node.js server to 10 Node.js servers?
* Introduce **Redis**: An insanely fast, single-threaded, in-memory RAM data store.
* Explain the **Distributed Mutex (Mutual Exclusion)** pattern. Redis acts as a fast "bouncer" outside the database club.

---

## 💻 Part 3: Live Coding (1 Hour 35 Mins)

### Step 1: Initial Setup
Have students create a `backend` folder and run:
```bash
mkdir backend && cd backend
npm init -y
npm install express pg ioredis cors dotenv
```

Create a `.env` file in the root of `backend`:
```env
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/irctc
REDIS_URL=redis://localhost:6379
```

Run Docker containers (provide them this `docker-compose.yml` in the root):
```yaml
version: '3.8'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: irctc
    ports:
      - "5432:5432"
  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

---

### Step 2: The Database Connections
Create file: `backend/db.js`
```javascript
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
module.exports = pool;
```

Create file: `backend/redis.js`
```javascript
const Redis = require('ioredis');
require('dotenv').config();

const redisClient = new Redis(process.env.REDIS_URL);
module.exports = redisClient;
```

---

### Step 3: The Business Logic
Create file: `backend/bookingService.js`
```javascript
const pool = require('./db');
const redisClient = require('./redis');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function bookNaive(userId, trainId, seatId) {
    const seatRes = await pool.query('SELECT status FROM seats WHERE id = $1', [seatId]);
    if (seatRes.rows[0].status !== 'available') throw new Error('Seat already booked');

    await delay(200);

    await pool.query('UPDATE seats SET status = $1 WHERE id = $2', ['booked', seatId]);
    const bookingRes = await pool.query(
        'INSERT INTO bookings (user_id, train_id, seat_id) VALUES ($1, $2, $3) RETURNING id',
        [userId, trainId, seatId]
    );
    return { success: true, bookingId: bookingRes.rows[0].id };
}

async function bookDBLock(userId, trainId, seatId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const seatRes = await client.query('SELECT status FROM seats WHERE id = $1 FOR UPDATE', [seatId]);
        if (seatRes.rows[0].status !== 'available') throw new Error('Seat already booked');

        await delay(200);

        await client.query('UPDATE seats SET status = $1 WHERE id = $2', ['booked', seatId]);
        const bookingRes = await client.query(
            'INSERT INTO bookings (user_id, train_id, seat_id) VALUES ($1, $2, $3) RETURNING id',
            [userId, trainId, seatId]
        );
        await client.query('COMMIT');
        return { success: true, bookingId: bookingRes.rows[0].id };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function bookRedisLock(userId, trainId, seatId) {
    const lockKey = `lock:seat:${seatId}`;
    const lockValue = Math.random().toString(36);
    
    // REDIS BOUNCER 
    const acquired = await redisClient.set(lockKey, lockValue, 'NX', 'PX', 5000);
    if (!acquired) throw new Error('Seat is currently being booked by someone else');

    try {
        const seatRes = await pool.query('SELECT status FROM seats WHERE id = $1', [seatId]);
        if (seatRes.rows[0].status !== 'available') throw new Error('Seat already booked');

        await delay(200);

        await pool.query('UPDATE seats SET status = $1 WHERE id = $2', ['booked', seatId]);
        const bookingRes = await pool.query(
            'INSERT INTO bookings (user_id, train_id, seat_id) VALUES ($1, $2, $3) RETURNING id',
            [userId, trainId, seatId]
        );
        return { success: true, bookingId: bookingRes.rows[0].id };
    } finally {
        const currentLock = await redisClient.get(lockKey);
        if (currentLock === lockValue) await redisClient.del(lockKey);
    }
}

module.exports = { bookNaive, bookDBLock, bookRedisLock };
```

---

### Step 4: Express Setup
Create file: `backend/routes.js`
*(See complete `routes.js` from Participant Guide).*

Create file: `backend/server.js`
```javascript
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const routes = require('./routes');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use('/api', routes);

app.listen(3000, '0.0.0.0', () => console.log('IRCTC Dismantled Running!'));
```

---

### Step 5: Test!
```bash
npx artillery run load-testing/naive.yaml
```
