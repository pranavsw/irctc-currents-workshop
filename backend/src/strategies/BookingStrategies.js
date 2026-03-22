// Utility for simulating race condition duration
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Strategy Interface Pattern
class BookingStrategy {
    constructor(seatRepo, bookingRepo) {
        this.seatRepo = seatRepo;
        this.bookingRepo = bookingRepo;
    }
    async execute(userId, trainId, seatId) {
        throw new Error("Method 'execute' must be implemented.");
    }
}

class NaiveBookingStrategy extends BookingStrategy {
    constructor(seatRepo, bookingRepo, db) {
        super(seatRepo, bookingRepo);
        this.db = db;
    }

    async execute(userId, trainId, seatId) {
        const status = await this.seatRepo.getSeatStatus(seatId);
        if (!status) throw new Error('Seat not found');
        if (status !== 'available') throw new Error('Seat already booked');

        // Race condition window
        await delay(200);

        await this.seatRepo.markSeatBooked(this.db, seatId);
        const bookingId = await this.bookingRepo.createBooking(this.db, userId, trainId, seatId);
        
        return { success: true, bookingId, message: 'Naive booking successful (Race Condition possible)' };
    }
}

class DbLockBookingStrategy extends BookingStrategy {
    constructor(seatRepo, bookingRepo, db) {
        super(seatRepo, bookingRepo);
        this.db = db;
    }

    async execute(userId, trainId, seatId) {
        const client = await this.db.pool.connect();
        try {
            await client.query('BEGIN');
            
            const status = await this.seatRepo.getSeatForUpdate(client, seatId);
            if (!status) throw new Error('Seat not found');
            if (status !== 'available') throw new Error('Seat already booked');

            await delay(200);

            await this.seatRepo.markSeatBooked(client, seatId);
            const bookingId = await this.bookingRepo.createBooking(client, userId, trainId, seatId);

            await client.query('COMMIT');
            return { success: true, bookingId, message: 'DB Lock booking successful' };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}

class RedisLockBookingStrategy extends BookingStrategy {
    constructor(seatRepo, bookingRepo, db, redisClient) {
        super(seatRepo, bookingRepo);
        this.db = db;
        this.redis = redisClient;
    }

    async execute(userId, trainId, seatId) {
        const lockKey = `lock:seat:${seatId}`;
        const lockValue = Math.random().toString(36);
        
        // Distributed Mutex Pattern
        const acquired = await this.redis.set(lockKey, lockValue, 'NX', 'PX', 5000);
        if (!acquired) {
            throw new Error('Seat is currently being booked by someone else');
        }

        try {
            const status = await this.seatRepo.getSeatStatus(seatId);
            if (!status) throw new Error('Seat not found');
            if (status !== 'available') throw new Error('Seat already booked');

            await delay(200);

            await this.seatRepo.markSeatBooked(this.db, seatId);
            const bookingId = await this.bookingRepo.createBooking(this.db, userId, trainId, seatId);
            
            return { success: true, bookingId, message: 'Redis Lock booking successful' };
        } finally {
            const currentLock = await this.redis.get(lockKey);
            if (currentLock === lockValue) {
                await this.redis.del(lockKey);
            }
        }
    }
}

module.exports = { NaiveBookingStrategy, DbLockBookingStrategy, RedisLockBookingStrategy };
