# 👨‍🏫 IRCTC Dismantled: Teacher's Guide

This guide is for **you, the instructor**. It outlines how to run the 2.5-hour workshop safely without overwhelming beginners, exactly what concepts to teach during the slideshow, and what to emphasize when the students are copying the code.

---

## 🕒 Workshop Schedule Overview
* **0:00 - 0:10 (10 min):** The Hook (Live Demo of the Bug)
* **0:10 - 1:10 (60 min):** Theory & Concepts (PPT Presentation)
* **1:10 - 2:45 (1h 35m):** Live Coding Session (Students use the `Participant_Guide.md` file)

---

## 🎣 Part 1: The Hook (5-10 mins)
**Goal:** Hook the audience by breaking a system they use every day.
1. Have the completed front-end running on your machine.
2. Select "Naive Mode" in the UI.
3. Open your terminal and run `npx artillery run load-testing/naive.yaml`.
4. Point to the screen and show how a single seat was just successfully booked by 100 different people simultaneously!
5. **The Pitch:** *"Today, we are going to learn why this happens, and how tech giants solve it using System Design."*

---

## 📊 Part 2: PPT Concepts Outline (60 mins)
*Teach these topics visually BEFORE touching any code.*

### 1. What is Concurrency?
* Define Concurrency (dealing with lots of things overlapping) vs. Parallelism (doing lots of things mathematically at the exact same time).
* Briefly explain the Node.js Event Loop.
* **Analogy:** Two people independently trying to sit in the exact same empty chair.

### 2. The Race Condition
* Explain the "Read-Modify-Write" cycle.
* Show a timeline diagram: Node A reads "Available", Node B reads "Available", both write "Booked" -> **BUG**.

### 3. ACID Transactions
* Define Atomicity, Consistency, Isolation, Durability.
* Focus on **Isolation**—how databases attempt to keep simultaneous transactions perfectly separated.

### 4. Deep Dive: Pessimistic DB Locking
* **What is it?** Assuming the worst-case scenario. Locking the row inside the database hard drive so nobody else can even look at it (`SELECT ... FOR UPDATE`). 
* **How it works:** When Transaction 1 reads the seat, it puts a physical padlock on that row. If Transaction 2 arrives, the database kernel forces Transaction 2 to pause and wait in a queue until Transaction 1 is finished.
* **Pros:** It guarantees perfect data consistency. Highly secure.
* **Cons:** Extremely taxing on Database CPU and Connection Pools. If 10,000 people try to book the same seat, 9,999 database connections hang open simultaneously, crashing the database (often what happens during early Tatkal spikes).

### 5. Deep Dive: Redis Distributed Locking
* **What is it?** Using a fast, single-threaded, in-memory RAM cache (Redis) as a "Bouncer" outside the database club.
* **How it works:** The **Distributed Mutex (Mutual Exclusion)** pattern. Before anyone talks to PostgreSQL, they ask Redis: *"Can I have the lock for Seat 1?"* (`SET key value NX PX 5000`). If Redis says yes, they proceed to Postgres. If Redis says no, they are instantly rejected.
* **Pros:** Protects the database. If 10,000 people hit the server, Redis instantly rejects 9,999 in sub-milliseconds in RAM. Only 1 request ever touches the slow PostgreSQL database.
* **Cons:** Introduces complexity. You must strictly expire the lock (`PX 5000`) so deadlocks don't occur if a backend server inevitably crashes midway through.

### 6. Real-World Case Study: Complete IRCTC Architecture
* **How does a system like IRCTC actually scale during Tatkal?**
  1. **Load Balancers & API Gateways:** Distributing millions of inbound hits across thousands of Node.js/Java servers.
  2. **Caching Layer (Redis/Memcached):** Storing train schedules and seat layouts directly in RAM so the database isn't queried 50 million times a minute just for people looking at timetables.
  3. **Message Queues (Kafka/RabbitMQ):** When you click "Book", your request is thrown into a high-speed Queue. A background worker picks it up sequentially, locks the row in Redis, and books the ticket asynchronously. This prevents the primary server from crashing during traffic spikes.
  4. **Database Sharding:** Splitting the PostgreSQL database geographically so no single database takes the entire load.

### 7. Clean Service-Controller Design
*Briefly explain the clean architectural logic they are about to code.*
* We are strictly avoiding messy "Spaghetti Code" by employing a clean **Service-Controller Design Pattern**. We completely sever our Database Locking algorithms away from our HTTP routes. Our Web logic handles endpoints, and our Business Service dictates the Locks.

---

## 💻 Part 3: Live Coding Instructor Notes (1h 35m)
*Have the students open their `Participant_Guide.md` and copy the code step-by-step. Here is what you should verbally explain at each step:*

### Step 1 & 2: Setup & Database Pipes
* **What to teach:** Briefly explain the `docker-compose.yml` (spinning up Postgres and Redis). Point out how we explicitly defined DB and Redis separately in `db.js` and `redis.js` so we can cleanly reuse those socket connections anywhere in the app!

### Step 3: The Business Logic (The Climax)
* **What to teach:** Point out how there is ZERO web routing code in `bookingService.js`.
  * *Naive Booking:* Point out the `await delay(200)` mimicking network latency to expose the exact Race Condition they learned about in the slides.
  * *DB Lock Booking:* Point to the `FOR UPDATE` string which is the iron core of Pessimistic DB Locking at the SQL level. Show how the `BEGIN` and `COMMIT` rigidly wrap the transaction, making it completely Atomic (the 'A' in ACID).
  * *Redis Lock Booking:* Highlight `SET lock:seat:1 NX PX 5000`. Elaborate that `NX` (Not Exists) strictly permits the 1st request through, and the expiration `PX 5000` is the emergency timeout failsafe.

### Step 4 & 5: Routes & Server Hooks
* **What to teach:** Point out how we securely hook the Business Service directly into the `routes.js`, and subsequently wrap those routes cleanly into `server.js`. Emphasize that adding a brand new mobile app interface tomorrow would require zero changes to our locking algorithms natively!

### Step 6: Load Testing Proof
* **What to teach:** Run the 3 Artillery scripts right in front of them to prove the entire systemic architecture mathematically!
