# 💻 IRCTC Dismantled: Participant Coding Guide

Welcome to the workshop! Please follow these steps sequentially to build the backend architecture from scratch. You can copy and paste the code blocks into your IDE as the instructor explains them.

---

## Step 1: Initial Setup

Create a basic backend environment by creating a new folder, opening it in your IDE, and running:
```bash
mkdir backend
cd backend
npm init -y
npm install express pg ioredis cors dotenv
```

**1. Create your Environment Variables (`.env`)**
Create a new file named `.env` inside your `backend` folder:
```env
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/irctc
REDIS_URL=redis://localhost:6379
```

**2. Create your Docker Containers (`docker-compose.yml`)**
Create a new file named `docker-compose.yml` in your *root* folder:
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: irctc
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d irctc"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```
*Run:* `docker-compose up -d` in your terminal to turn on the databases.

---

## Step 2: The Database Pipelines
*(We define our Database and Redis connections cleanly in their own files so we can reuse them across the app!)*

Create file: `backend/db.js`
```javascript
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

module.exports = pool;
```

Create file: `backend/redis.js`
```javascript
require('dotenv').config();
const Redis = require('ioredis');

const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redisClient.on('error', (err) => {
    console.error('Redis error:', err);
});

module.exports = redisClient;
```

---

## Step 3: The Business Logic (Service Layer)
*This is the heart of the workshop. We separate the complex locking mechanisms away from the web-server logic into a dedicated "Service".*

Create file: `backend/bookingService.js`
```javascript
const pool = require('./db');
const redisClient = require('./redis');

// Sleep to simulate latency, making race conditions obvious
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function bookNaive(userId, trainId, seatId) {
    // 1. Check if seat is available
    const seatRes = await pool.query('SELECT status FROM seats WHERE id = $1', [seatId]);
    if (seatRes.rows.length === 0) throw new Error('Seat not found');
    if (seatRes.rows[0].status !== 'available') throw new Error('Seat already booked');

    // SIMULATE LATENCY TO FORCE RACE CONDITION
    await delay(200);

    // 2. Book seat
    await pool.query('UPDATE seats SET status = $1 WHERE id = $2', ['booked', seatId]);

    // 3. Create booking record
    const bookingRes = await pool.query(
        'INSERT INTO bookings (user_id, train_id, seat_id) VALUES ($1, $2, $3) RETURNING id',
        [userId, trainId, seatId]
    );

    return { success: true, mode: 'naive', bookingId: bookingRes.rows[0].id };
}

async function bookDBLock(userId, trainId, seatId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Select for update - locks the row so other transactions wait here
        const seatRes = await client.query('SELECT status FROM seats WHERE id = $1 FOR UPDATE', [seatId]);
        if (seatRes.rows.length === 0) {
            await client.query('ROLLBACK');
            throw new Error('Seat not found');
        }

        if (seatRes.rows[0].status !== 'available') {
            await client.query('ROLLBACK');
            throw new Error('Seat already booked');
        }

        // SIMULATE LATENCY
        await delay(200);

        // 2. Book seat
        await client.query('UPDATE seats SET status = $1 WHERE id = $2', ['booked', seatId]);

        // 3. Create booking record
        const bookingRes = await client.query(
            'INSERT INTO bookings (user_id, train_id, seat_id) VALUES ($1, $2, $3) RETURNING id',
            [userId, trainId, seatId]
        );

        await client.query('COMMIT');
        return { success: true, mode: 'db-lock', bookingId: bookingRes.rows[0].id };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function bookRedisLock(userId, trainId, seatId) {
    const lockKey = `lock:seat:${seatId}`;
    const lockValue = Math.random().toString(36);
    // Acquire lock for 5 seconds
    const acquired = await redisClient.set(lockKey, lockValue, 'NX', 'PX', 5000);

    if (!acquired) {
        throw new Error('Seat is currently being booked by someone else');
    }

    try {
        // 1. Check if seat is available
        const seatRes = await pool.query('SELECT status FROM seats WHERE id = $1', [seatId]);
        if (seatRes.rows.length === 0) throw new Error('Seat not found');
        if (seatRes.rows[0].status !== 'available') throw new Error('Seat already booked');

        // SIMULATE LATENCY
        await delay(200);

        // 2. Book seat
        await pool.query('UPDATE seats SET status = $1 WHERE id = $2', ['booked', seatId]);

        // 3. Create booking record
        const bookingRes = await pool.query(
            'INSERT INTO bookings (user_id, train_id, seat_id) VALUES ($1, $2, $3) RETURNING id',
            [userId, trainId, seatId]
        );

        return { success: true, mode: 'redis-lock', bookingId: bookingRes.rows[0].id };
    } finally {
        // Release the lock safely using a Lua script
        const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
        await redisClient.eval(script, 1, lockKey, lockValue);
    }
}

module.exports = {
    bookNaive,
    bookDBLock,
    bookRedisLock
};
```

---

## Step 4: The Web APIs (Controller Layer)
*Here we build our Web API URLs using Express, mapping them directly to our Databases and Services.*

Create file: `backend/routes.js`
```javascript
const express = require('express');
const router = express.Router();
const bookingService = require('./bookingService');
const pool = require('./db');

// List trains
router.get('/trains', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM trains');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get seats for a train
router.get('/trains/:id/seats', async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT s.*, COUNT(b.id) as booking_count 
            FROM seats s 
            LEFT JOIN bookings b ON s.id = b.seat_id 
            WHERE s.train_id = $1 
            GROUP BY s.id 
            ORDER BY s.id
        `;
        const result = await pool.query(query, [id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all detailed bookings for a train
router.get('/trains/:id/bookings', async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT b.id as booking_id, b.booking_time, u.name as user_name, s.seat_number 
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN seats s ON b.seat_id = s.id
            WHERE b.train_id = $1
            ORDER BY b.booking_time DESC
        `;
        const result = await pool.query(query, [id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Book naive
router.post('/book/naive', async (req, res) => {
    const { userId, trainId, seatId } = req.body;
    try {
        const result = await bookingService.bookNaive(userId, trainId, seatId);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Book db-lock
router.post('/book/db-lock', async (req, res) => {
    const { userId, trainId, seatId } = req.body;
    try {
        const result = await bookingService.bookDBLock(userId, trainId, seatId);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Book redis-lock
router.post('/book/redis-lock', async (req, res) => {
    const { userId, trainId, seatId } = req.body;
    try {
        const result = await bookingService.bookRedisLock(userId, trainId, seatId);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Reset seats (for testing)
router.post('/reset', async (req, res) => {
    try {
        await pool.query("UPDATE seats SET status = 'available'");
        await pool.query("DELETE FROM bookings");
        res.json({ success: true, message: 'Reset successful' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login or Register user
router.post('/login', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required' });
    try {
        let result = await pool.query('SELECT * FROM users WHERE name = $1', [username]);
        if (result.rows.length === 0) {
            result = await pool.query('INSERT INTO users (name) VALUES ($1) RETURNING *', [username]);
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
```

---

## Step 5: Start the App
*We assemble the Express framework globally and attach our single `routes.js` module.*

Create file: `backend/server.js`
```javascript
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const routes = require('./routes');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Mount the centralized routes
app.use('/api', routes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} !`);
});
```

Start your server! 
```bash
node server.js
```

---

## Step 6: Load Testing Proof 💥
*How to unleash artillery and logically prove the Race Condition!*

Create a folder: `load-testing`
Create file: `load-testing/naive.yaml`
```yaml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 5
      arrivalRate: 20
scenarios:
  - flow:
      - post:
          url: "/api/book/naive"
          json:
            userId: 1
            trainId: 1
            seatId: 1
```

Run extreme traffic test from your terminal:
```bash
npx artillery run load-testing/naive.yaml
```
*(Check your web UI to see how many people slipped past the Naive setup!)*
