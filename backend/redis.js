require('dotenv').config();
const Redis = require('ioredis');

const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redisClient.on('error', (err) => {
    console.error('Redis error:', err);
});

module.exports = redisClient;
