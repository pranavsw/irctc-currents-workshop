const express = require('express');

class AppController {
    constructor(userRepo, trainRepo, seatRepo, bookingRepo, bookingService) {
        this.router = express.Router();
        this.userRepo = userRepo;
        this.trainRepo = trainRepo;
        this.seatRepo = seatRepo;
        this.bookingRepo = bookingRepo;
        this.bookingService = bookingService;
        this.initializeRoutes();
    }

    initializeRoutes() {
        this.router.post('/login', this.loginUser.bind(this));
        this.router.get('/trains', this.getTrains.bind(this));
        this.router.get('/trains/:id/seats', this.getSeats.bind(this));
        this.router.get('/trains/:id/bookings', this.getBookings.bind(this));
        this.router.post('/book/:mode', this.bookSeat.bind(this));
        this.router.post('/reset', this.resetDatabase.bind(this));
    }

    async loginUser(req, res) {
        try {
            if (!req.body.username) return res.status(400).json({ error: 'Username is required' });
            const user = await this.userRepo.findOrCreate(req.body.username);
            res.json(user);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async getTrains(req, res) {
        try {
            const trains = await this.trainRepo.getAllTrains();
            res.json(trains);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async getSeats(req, res) {
        try {
            const seats = await this.seatRepo.getSeatsByTrain(req.params.id);
            res.json(seats);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async getBookings(req, res) {
        try {
            const bookings = await this.bookingRepo.getBookingsByTrain(req.params.id);
            res.json(bookings);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async bookSeat(req, res) {
        try {
            const { userId, trainId, seatId } = req.body;
            const mode = req.params.mode;
            const result = await this.bookingService.processBooking(mode, userId, trainId, seatId);
            res.json(result);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }

    async resetDatabase(req, res) {
        try {
            await this.seatRepo.resetAll();
            await this.bookingRepo.deleteAll();
            res.json({ success: true, message: 'Reset successful' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = AppController;
