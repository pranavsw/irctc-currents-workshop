// Service Layer (Business Logic orchestrator)
class BookingService {
    constructor(strategies) {
        this.strategies = strategies; // Dependency Injection of strategies
    }

    async processBooking(mode, userId, trainId, seatId) {
        const strategy = this.strategies[mode];
        if (!strategy) {
            throw new Error(`Invalid booking mode: ${mode}`);
        }
        return await strategy.execute(userId, trainId, seatId);
    }
}

module.exports = BookingService;
