const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

// Serve static files from "public" folder
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
    process.exit(1); // Stop if table creation fails
  }
}

// Test connection & create table, then start server
(async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('PostgreSQL connected. Server time:', res.rows[0].now);

    await createTableIfNotExists();

    // Start server only after DB is ready
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  }
})();

// POST: Insert a key-value pair
app.post('/insert', async (req, res) => {
  const { key, value } = req.body;
  const insertQuery = 'INSERT INTO key_value_table (k, v) VALUES ($1, $2)';
  try {
    await pool.query(insertQuery, [key, value]);
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

// POST: Search for a key-value (partial match)
app.post('/search', async (req, res) => {
  const { searchKey } = req.body;
  // Use ILIKE for case-insensitive partial matching
  const searchQuery = `
    SELECT * 
    FROM key_value_table 
    WHERE k ILIKE $1 
    ORDER BY id
  `;
  try {
    const result = await pool.query(searchQuery, [`%${searchKey}%`]);
    if (result.rows.length > 0) {
      let html = `
        <h2>Search Results for "${searchKey}"</h2>
        <table border="1" cellpadding="5" cellspacing="0">
          <tr><th>ID</th><th>Key</th><th>Value</th></tr>
      `;
      result.rows.forEach(row => {
        html += `
          <tr>
            <td>${row.id}</td>
            <td>${row.k}</td>
            <td>${row.v}</td>
          </tr>
        `;
      });
      html += `</table>
        <br>
        <a href="/">Back to Home</a> |
        <a href="/list">View All Entries</a>
      `;
      res.send(html);
    } else {
      res.send(`
        <h2>No entries found containing "${searchKey}".</h2>
        <a href="/">Back to Home</a>
      `);
    }
  } catch (error) {
    console.error('Error searching data:', error);
    res.status(500).send('Error searching data in the database.');
  }
});

// POST: Update an existing key's value
app.post('/update', async (req, res) => {
    const { updateKey, newValue } = req.body;
    
    // Attempt to update the existing record
    const updateQuery = `
      UPDATE key_value_table
      SET v = $2
      WHERE k = $1
      RETURNING *;
    `;
    
    try {
      const result = await pool.query(updateQuery, [updateKey, newValue]);
      
      if (result.rowCount === 0) {
        // No record found. Ask user if they want to create a new record.
        res.send(`
          <script>
            if (confirm("No record found for key: '${updateKey}'. Would you like to create a new key-value pair?")) {
              window.location.href = "/create?key=${encodeURIComponent(updateKey)}&value=${encodeURIComponent(newValue)}";
            } else {
              window.location.href = "/";
            }
          </script>
        `);
      } else {
        // Record found and updated successfully
        const updatedRow = result.rows[0];
        res.send(`
          <h2>Value updated successfully!</h2>
          <p><strong>Key:</strong> ${updatedRow.k}</p>
          <p><strong>New Value:</strong> ${updatedRow.v}</p>
          <hr>
          <a href="/">Back to Home</a> |
          <a href="/list">View All Entries</a>
        `);
      }
    } catch (error) {
      console.error('Error updating data:', error);
      res.status(500).send('Error updating data in the database.');
    }
  });
  

// GET: Show all key-value pairs
app.get('/list', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM key_value_table ORDER BY id');
    const rows = result.rows;

    let html = `
      <h1>All Key-Value Pairs</h1>
      <table border="1" cellpadding="5" cellspacing="0">
        <tr><th>ID</th><th>Key</th><th>Value</th></tr>
    `;
    rows.forEach((row) => {
      html += `
        <tr>
          <td>${row.id}</td>
          <td>${row.k}</td>
          <td>${row.v}</td>
        </tr>
      `;
    });
    html += `
      </table>
      <br>
      <a href="/">Back to Home</a>
    `;
    res.send(html);
  } catch (error) {
    console.error('Error retrieving data:', error);
    res.status(500).send('Error retrieving data from the database.');
  }

// GET: Create a new key-value pair (called after update confirms creation)
app.get('/create', async (req, res) => {
    const { key, value } = req.query;
    if (!key || !value) {
      return res.send(`
        <h2>Missing key or value parameters.</h2>
        <a href="/">Back to Home</a>
      `);
    }
  
    const insertQuery = 'INSERT INTO key_value_table (k, v) VALUES ($1, $2) RETURNING *';
    try {
      const result = await pool.query(insertQuery, [key, value]);
      const newRecord = result.rows[0];
      res.send(`
        <h2>New record created successfully!</h2>
        <p><strong>Key:</strong> ${newRecord.k}</p>
        <p><strong>Value:</strong> ${newRecord.v}</p>
        <hr>
        <a href="/">Back to Home</a> |
        <a href="/list">View All Entries</a>
      `);
    } catch (error) {
      console.error('Error creating new record:', error);
      res.status(500).send('Error creating new record in the database.');
    }
  });  

// New: DELETE functionality - DELETE a key-value pair based on the key
app.post('/delete', async (req, res) => {
    const { deleteKey } = req.body;
  
    const deleteQuery = `
      DELETE FROM key_value_table
      WHERE k = $1
      RETURNING *;
    `;
  
    try {
      const result = await pool.query(deleteQuery, [deleteKey]);
  
      if (result.rowCount === 0) {
        res.send(`
          <h2>No record found with key: "${deleteKey}"</h2>
          <a href="/">Back to Home</a>
        `);
      } else {
        // If deletion was successful, show details of the deleted record(s)
        let html = `
          <h2>Record(s) with key "${deleteKey}" deleted successfully!</h2>
          <table border="1" cellpadding="5" cellspacing="0">
            <tr><th>ID</th><th>Key</th><th>Value</th></tr>
        `;
        result.rows.forEach(row => {
          html += `
            <tr>
              <td>${row.id}</td>
              <td>${row.k}</td>
              <td>${row.v}</td>
            </tr>
          `;
        });
        html += `
          </table>
          <hr>
          <a href="/">Back to Home</a> |
          <a href="/list">View All Entries</a>
        `;
        res.send(html);
      }
    } catch (error) {
      console.error('Error deleting data:', error);
      res.status(500).send('Error deleting data from the database.');
    }
  });
});
