const pool = require('../db');

async function seed() {
    console.log('Starting DB seed...');

    const dropTables = `
    DROP TABLE IF EXISTS bookings;
    DROP TABLE IF EXISTS seats;
    DROP TABLE IF EXISTS trains;
    DROP TABLE IF EXISTS users;
  `;

    const createTables = `
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL
    );

    CREATE TABLE trains (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      source VARCHAR(100) NOT NULL,
      destination VARCHAR(100) NOT NULL,
      date DATE NOT NULL
    );

    CREATE TABLE seats (
      id SERIAL PRIMARY KEY,
      train_id INTEGER REFERENCES trains(id),
      seat_number VARCHAR(10) NOT NULL,
      status VARCHAR(20) DEFAULT 'available'
    );

    CREATE TABLE bookings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      train_id INTEGER REFERENCES trains(id),
      seat_id INTEGER REFERENCES seats(id),
      booking_time TIMESTAMP DEFAULT NOW()
    );
  `;

    try {
        await pool.query(dropTables);
        console.log('Tables dropped');

        await pool.query(createTables);
        console.log('Tables created');

        // Seed data
        await pool.query("INSERT INTO users (name) VALUES ('Alice'), ('Bob'), ('Charlie')");
        console.log('Users seeded');

        const trainRes = await pool.query(`
      INSERT INTO trains (name, source, destination, date) 
      VALUES ('Express 101', 'Delhi', 'Mumbai', CURRENT_DATE) 
      RETURNING id
    `);
        const trainId = trainRes.rows[0].id;
        console.log('Train seeded');

        // Seed 20 seats
        const seatValues = [];
        for (let i = 1; i <= 20; i++) {
            seatValues.push(`(${trainId}, 'S-${i}')`);
        }
        await pool.query(`INSERT INTO seats (train_id, seat_number) VALUES ${seatValues.join(',')}`);
        console.log('Seats seeded');

        console.log('Seed completed successfully');
    } catch (err) {
        console.error('Error seeding DB:', err);
    } finally {
        await pool.end();
    }
}

seed();
