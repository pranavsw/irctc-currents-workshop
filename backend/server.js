const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Connect DB & Redis
const { db, redis } = require('./src/config/Database');

// Repositories
const { UserRepository, TrainRepository, SeatRepository, BookingRepository } = require('./src/repositories/Repositories');

// Strategies
const { NaiveBookingStrategy, DbLockBookingStrategy, RedisLockBookingStrategy } = require('./src/strategies/BookingStrategies');

// Services
const BookingService = require('./src/services/BookingService');

// Controllers
const AppController = require('./src/controllers/AppController');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Initialize Repositories
const userRepo = new UserRepository(db);
const trainRepo = new TrainRepository(db);
const seatRepo = new SeatRepository(db);
const bookingRepo = new BookingRepository(db);

// 2. Initialize Strategies
const strategies = {
    naive: new NaiveBookingStrategy(seatRepo, bookingRepo, db),
    dblock: new DbLockBookingStrategy(seatRepo, bookingRepo, db),
    redislock: new RedisLockBookingStrategy(seatRepo, bookingRepo, db, redis)
};

// 3. Initialize Service
const bookingService = new BookingService(strategies);

// 4. Initialize Controller
const appController = new AppController(userRepo, trainRepo, seatRepo, bookingRepo, bookingService);

// 5. Mount Routes
app.use('/api', appController.router);

app.get('/', (req, res) => {
    res.send('IRCTC LLD Backend is running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`LLD Server is running on port ${PORT}`);
});
