// Data Access Layer (Repository Pattern)
class UserRepository {
    constructor(db) { this.db = db; }

    async findOrCreate(username) {
        let result = await this.db.query('SELECT * FROM users WHERE name = $1', [username]);
        if (result.rows.length === 0) {
            result = await this.db.query('INSERT INTO users (name) VALUES ($1) RETURNING *', [username]);
        }
        return result.rows[0];
    }
}

class TrainRepository {
    constructor(db) { this.db = db; }

    async getAllTrains() {
        const res = await this.db.query('SELECT * FROM trains');
        return res.rows;
    }
}

class SeatRepository {
    constructor(db) { this.db = db; }

    async getSeatsByTrain(trainId) {
        const query = `
            SELECT s.*, COUNT(b.id) as booking_count 
            FROM seats s 
            LEFT JOIN bookings b ON s.id = b.seat_id 
            WHERE s.train_id = $1 
            GROUP BY s.id 
            ORDER BY s.id
        `;
        const res = await this.db.query(query, [trainId]);
        return res.rows;
    }

    async getSeatStatus(seatId) {
        const res = await this.db.query('SELECT status FROM seats WHERE id = $1', [seatId]);
        return res.rows.length ? res.rows[0].status : null;
    }

    async getSeatForUpdate(client, seatId) {
        // Pessimistic Lock Query
        const res = await client.query('SELECT status FROM seats WHERE id = $1 FOR UPDATE', [seatId]);
        return res.rows.length ? res.rows[0].status : null;
    }

    async markSeatBooked(clientOrDb, seatId) {
        await clientOrDb.query('UPDATE seats SET status = $1 WHERE id = $2', ['booked', seatId]);
    }

    async resetAll() {
        await this.db.query("UPDATE seats SET status = 'available'");
    }
}

class BookingRepository {
    constructor(db) { this.db = db; }

    async getBookingsByTrain(trainId) {
        const query = `
            SELECT b.id as booking_id, b.booking_time, u.name as user_name, s.seat_number 
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN seats s ON b.seat_id = s.id
            WHERE b.train_id = $1
            ORDER BY b.booking_time DESC
        `;
        const res = await this.db.query(query, [trainId]);
        return res.rows;
    }

    async createBooking(clientOrDb, userId, trainId, seatId) {
        const res = await clientOrDb.query(
            'INSERT INTO bookings (user_id, train_id, seat_id) VALUES ($1, $2, $3) RETURNING id',
            [userId, trainId, seatId]
        );
        return res.rows[0].id;
    }

    async deleteAll() {
        await this.db.query("DELETE FROM bookings");
    }
}

module.exports = { UserRepository, TrainRepository, SeatRepository, BookingRepository };
