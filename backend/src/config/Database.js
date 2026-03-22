const { Pool } = require('pg');
const Redis = require('ioredis');
require('dotenv').config();

// Postgres Database Singleton
class PostgresClient {
    constructor() {
        if (!PostgresClient.instance) {
            this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
            PostgresClient.instance = this;
        }
        return PostgresClient.instance;
    }

    async query(text, params) {
        return this.pool.query(text, params);
    }
}

// Redis Cache Singleton
class RedisClient {
    constructor() {
        if (!RedisClient.instance) {
            this.client = new Redis(process.env.REDIS_URL);
            RedisClient.instance = this;
        }
        return RedisClient.instance;
    }

    getClient() { return this.client; }
}

module.exports = {
    db: new PostgresClient(),
    redis: new RedisClient().getClient()
};
