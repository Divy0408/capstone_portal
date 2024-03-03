const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

const client = new Client({
    connectionString: "postgres://root:FnIw2h8j8IPtNS1tc0o7cGNxiputsTIJ@dpg-cnfidpicn0vc73e862r0-a.oregon-postgres.render.com/test_db_jl56",
    ssl: {
        rejectUnauthorized: false
    }   
});

// Middleware to parse request bodies as JSON
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files (HTML, CSS, etc.)
app.use(express.static(__dirname));

// Route to serve the login page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Route to handle login form submission
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        await client.connect();

        // Query to check if the user exists with the provided email and password
        const query = 'SELECT * FROM users WHERE email = $1 AND password = $2';
        const result = await client.query(query, [email, password]);

        if (result.rows.length > 0) {
            // User authenticated, redirect to home page
            res.redirect('/home.html');
        } else {
            // Invalid credentials, redirect back to login page with error message
            res.redirect('/?error=Invalid email or password');
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal server error');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});