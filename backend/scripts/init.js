const pool = require('../db');
const { execSync } = require('child_process');

async function checkAndSeed() {
    try {
        console.log('Checking if database needs initialization...');
        const res = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'users'
            );
        `);
        
        if (!res.rows[0].exists) {
            console.log('Tables do not exist. Seeding database...');
            execSync('node scripts/seed.js', { stdio: 'inherit' });
        } else {
            console.log('Database already initialized. Skipping seed.');
        }
        process.exit(0);
    } catch (err) {
        console.error('Error checking database status:', err);
        process.exit(1);
    }
}

checkAndSeed();
