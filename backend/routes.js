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
