# 🏗️ IRCTC Dismantled: Architecture & Design Guide

This project was built explicitly to serve as a deep-dive workshop into **System Design, Concurrency, and Scalability**. 

While simple enough to be explainable in a 60-minute workshop, the codebase rigorously adheres to production-grade **High-Level Design (HLD)** and **Low-Level Design (LLD)** patterns.

---

## 🌍 1. High-Level Design (HLD) Architecture

The application is built on a modern **3-Tier Web Architecture**:

1. **Presentation Layer (Client):** 
   - A React Single Page Application (SPA).
   - Uses a Component-Based architecture to decouple logic (e.g., `SeatMap`, `BookingList`).
   - Handles real-time polling to ensure sync across distributed users.

2. **Application Layer (Node.js/Express Backend):**
   - Completely **Stateless**. The backend stores zero user state in memory.
   - Being stateless makes the backend **Horizontally Scalable**—you could spin up 100 instances of this Node app behind an NGINX Load Balancer, and they would all work flawlessly together.

3. **Data Layer (PostgreSQL & Redis):**
   - **PostgreSQL:** Acts as the persistent "Source of Truth". Handles ACID transactions for critical financial/booking data.
   - **Redis:** Acts as an ultra-fast, in-memory distributed synchronization layer. It offloads compute-heavy locking mechanisms from the main database.

---

## ⚙️ 2. Low-Level Design (LLD) & Code Patterns

At the module level, the code utilizes several strict software engineering patterns:

### A. Strict LLD Architectural Layers (Controller/Service/Repository/Strategy)
Instead of stuffing database queries directly into API endpoints, the code is strictly separated:
* **`AppController.js` (Controller):** Only responsible for parsing HTTP requests, parameter validation, and mapping JSON responses.
* **`BookingService.js` (Service):** The pure orchestrator of business logic. It handles the core booking mechanics using injected strategies.
* **`Repositories.js` (Repository Pattern):** Abstracted Data Access Layer containing isolated classes like `SeatRepository` and `BookingRepository`. This protects SQL queries from leaching into business logic.
* **`BookingStrategies.js` (Strategy Pattern):** Defines interchangeable classes for locking (Naive, DB Lock, Redis Lock) injected on-the-fly depending on user interaction.
* **Why Layering?** This satisfies SOLID and **Single Responsibility (SRP)**. If you choose to migrate from Express to GraphQL or from PostgreSQL to MongoDB tomorrow, your main `bookingService.js` and Strategy mechanisms remain 100% untouched.

### B. Pessimistic Locking Pattern
* Found in `bookDBLock()`.
* We use PostgreSQL's `SELECT ... FOR UPDATE` directive. 
* This tells the database kernel at a microscopic hardware level: *"Do not let any other connection read or write to this row until my transaction is complete."*

### C. Distributed Mutex (Mutual Exclusion) Pattern
* Found in `bookRedisLock()`.
* Implemented using `SET key value NX PX timeframe`.
* This ensures that across dozens of differently scaled backend servers, only *one server globally* can acquire the lock for a specific seat, preventing Double-Booking at the infrastructure level.

---

## 🧱 3. Component Breakdown (Basic to Advanced)

Here is a breakdown of every piece of the puzzle, categorized by complexity for your workshop:

### 🟢 Basic Components (Fundamentals)
* **Express Router (`routes.js`):** Basic REST API design (`GET`, `POST`).
* **React State (`App.jsx`):** Using `useState` and `useEffect` to fetch data and render UI dynamically.
* **UI Components (`TrainList.jsx`, `SeatMap.jsx`):** Mapping arrays of JSON objects into visual HTML elements (`map()`).

### 🟡 Intermediate Components (Engineering)
* **Environment Configuration (`.env` & `db.js`):** Decoupling hardcoded credentials from the source code, a strict requirement for production deployments.
* **Connection Pooling (`pool.query`):** Instead of opening a new TCP connection to Postgres for every user (which is slow and crashes the DB), the app uses a `Pool` of reusable connection pipelines.
* **Frontend Real-time Polling Engine:** The React app uses `setInterval` combined with `useEffect` cleanup functions to constantly fetch new bookings without causing browser memory leaks.

### 🔴 Advanced Components (System Design Masters)
* **Simulated Network Latency (`await delay(200)`):** We intentionally introduce a non-blocking 200ms delay in the Naive function to force the Node.js Event Loop to yield, explicitly exposing race conditions.
* **Database Transactions (`BEGIN`, `COMMIT`, `ROLLBACK`):** Used in the DB Lock mode to ensure that reading a seat and writing a booking happen as one unbreakable, atomic operation.
* **Atomic Redis Operations:** Utilizing Redis's single-threaded nature to guarantee thread-safe checks across an entire distributed network without using a database query.
* **Automated Load Testing (Artillery):** YAML scripts designed to instantly fire 100 simultaneous HTTP requests at extreme velocity, proving mathematical vulnerability and resolution.

---

## 🚀 4. Why is this Production-Ready?

If you were to deploy this to AWS today, the core logic is fully safe because:
1. **Never Fails Open:** If Redis crashes, our code throws a `500 Server Error` instead of falling back to Naive Double-Booking.
2. **Deadlock Prevention:** The Redis locks possess explicit `PX 5000` (5-second) time-to-live expirations. If a backend server completely powers off mid-transaction, the lock automatically self-destructs after 5 seconds, freeing the seat.
3. **Foreign Key Integrity:** Our `bookings` table strictly enforces relationships with `users` and `seats` via SQL Foreign Keys. It is impossible to insert corrupted or orphaned data into the database.
4. **SQL Injection Protection:** We use parameterized queries (`pool.query('... $1', [variable])`) instead of raw string interpolation, completely neutralizing SQL Injection hacking attempts.
