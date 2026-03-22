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
*Run:* `docker-compose up -d` in your terminal to turn on the databases.

---

## Step 2: The Database Pipelines
*(We define our Database and Redis connections cleanly in their own files so we can reuse them across the app!)*

Create file: `backend/db.js`
```javascript
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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

## Step 3: The Business Logic (Service Layer)
*This is the heart of the workshop. We separate the complex locking mechanisms away from the web-server logic into a dedicated "Service".*

Create file: `backend/bookingService.js`
```javascript
const pool = require('./db');
const redisClient = require('./redis');

// A helper to mimic a slow 200ms internet connection
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function bookNaive(userId, trainId, seatId) {
    const seatRes = await pool.query('SELECT status FROM seats WHERE id = $1', [seatId]);
    if (seatRes.rows[0].status !== 'available') throw new Error('Seat already booked');

    await delay(200); // During these 200ms, 100 people will slip past this check!

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
        await client.query('BEGIN'); // Start Atomic Transaction
        
        // Lock the exact row in the PostgreSQL hard drive
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
    
    // REDIS BOUNCER: 'NX' means Only Set if Not Exists. 'PX' expires the lock in 5000ms.
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
        // Free the lock so others can safely try purchasing it
        const currentLock = await redisClient.get(lockKey);
        if (currentLock === lockValue) await redisClient.del(lockKey);
    }
}

module.exports = { bookNaive, bookDBLock, bookRedisLock };
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

router.post('/login', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required' });
    try {
        let result = await pool.query('SELECT * FROM users WHERE name = $1', [username]);
        if (result.rows.length === 0) {
            result = await pool.query('INSERT INTO users (name) VALUES ($1) RETURNING *', [username]);
        }
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/trains', async (req, res) => {
    const result = await pool.query('SELECT * FROM trains');
    res.json(result.rows);
});

router.get('/trains/:id/seats', async (req, res) => {
    const query = `
        SELECT s.*, COUNT(b.id) as booking_count 
        FROM seats s 
        LEFT JOIN bookings b ON s.id = b.seat_id 
        WHERE s.train_id = $1 GROUP BY s.id ORDER BY s.id
    `;
    const result = await pool.query(query, [req.params.id]);
    res.json(result.rows);
});

router.get('/trains/:id/bookings', async (req, res) => {
    const query = `
        SELECT b.id as booking_id, b.booking_time, u.name as user_name, s.seat_number 
        FROM bookings b JOIN users u ON b.user_id = u.id JOIN seats s ON b.seat_id = s.id
        WHERE b.train_id = $1 ORDER BY b.booking_time DESC
    `;
    const result = await pool.query(query, [req.params.id]);
    res.json(result.rows);
});

router.post('/book/:mode', async (req, res) => {
    const { userId, trainId, seatId } = req.body;
    try {
        let result;
        if (req.params.mode === 'naive') result = await bookingService.bookNaive(userId, trainId, seatId);
        else if (req.params.mode === 'db-lock') result = await bookingService.bookDBLock(userId, trainId, seatId);
        else if (req.params.mode === 'redis-lock') result = await bookingService.bookRedisLock(userId, trainId, seatId);
        else throw new Error('Invalid mode');
        res.json(result);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/reset', async (req, res) => {
    await pool.query("UPDATE seats SET status = 'available'");
    await pool.query("DELETE FROM bookings");
    res.json({ success: true });
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

// Expose our robust Service/Controller structure globally:
app.use('/api', routes);

const PORT = process.env.PORT || 3000;
app.listen(3000, '0.0.0.0', () => {
    console.log(`Server running on port 3000!`);
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
