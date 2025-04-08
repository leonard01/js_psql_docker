const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

// Serve static files from the "public" folder
app.use(express.static('public'));

// Create a PostgreSQL pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD
});

// Function to create the table automatically if it doesn't exist
async function createTableIfNotExists() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS key_value_table (
      id SERIAL PRIMARY KEY,
      k TEXT NOT NULL,
      v TEXT NOT NULL
    );
  `;
  try {
    await pool.query(createTableQuery);
    console.log('Table "key_value_table" created or already exists.');
  } catch (error) {
    console.error('Error creating table:', error);
    process.exit(1); // stop the app if table creation fails
  }
}

// Test connection & create table, then start server
(async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('PostgreSQL connected. Server time:', res.rows[0].now);

    await createTableIfNotExists();

    // Start the server only after the DB is ready
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  }
})();

// POST route to insert a key-value pair
app.post('/insert', async (req, res) => {
    const { key, value } = req.body;
    const insertQuery = 'INSERT INTO key_value_table (k, v) VALUES ($1, $2)';
    try {
      await pool.query(insertQuery, [key, value]);
      // Return a page with a success message AND a link back home or to /list
      res.send(`
        <h2>Data inserted successfully!</h2>
        <p><strong>Key:</strong> ${key}</p>
        <p><strong>Value:</strong> ${value}</p>
        <hr>
        <a href="/">Back to Home</a> |
        <a href="/list">View All Entries</a>
      `);
    } catch (error) {
      console.error('Error inserting data:', error);
      res.status(500).send('Error inserting data into the database.');
    }
  });

// GET route to list all key-value pairs
app.get('/list', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM key_value_table ORDER BY id');
    const rows = result.rows;

    // Build a simple HTML table
    let html = `
      <h1>All Key-Value Pairs</h1>
      <table border="1" cellpadding="5" cellspacing="0">
        <tr><th>ID</th><th>Key</th><th>Value</th></tr>
    `;

    rows.forEach((row) => {
      html += `<tr>
        <td>${row.id}</td>
        <td>${row.k}</td>
        <td>${row.v}</td>
      </tr>`;
    });

    html += `</table>
      <br>
      <a href="/">Back to Home</a>
    `;

    res.send(html);
  } catch (error) {
    console.error('Error retrieving data:', error);
    res.status(500).send('Error retrieving data from the database.');
  }
});
