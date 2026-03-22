const { Client } = require('pg');
const client = new Client({
    connectionString: 'postgres://postgres:postgres@localhost:5432/postgres'
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
