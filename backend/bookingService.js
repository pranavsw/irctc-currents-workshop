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
