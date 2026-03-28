require('dotenv').config();
const { Client } = require('pg');

const dbUrl = new URL(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/irctc');
dbUrl.pathname = '/postgres'; // Connect to default DB to create the specific one

const client = new Client({
    connectionString: dbUrl.toString()
});

async function createDb() {
    try {
        await client.connect();
        const res = await client.query("SELECT datname FROM pg_database WHERE datname = 'irctc'");
        if (res.rows.length === 0) {
            await client.query('CREATE DATABASE irctc');
            console.log('Database irctc created successfully.');
        } else {
            console.log('Database irctc already exists.');
        }
    } catch (err) {
        console.error('Error creating database:', err);
    } finally {
        await client.end();
    }
}

createDb();
