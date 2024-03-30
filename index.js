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

// Connect to PostgreSQL database when the server starts
client.connect()
    .then(() => console.log('Connected to PostgreSQL database'))
    .catch(err => console.error('Error connecting to PostgreSQL database:', err));

// Middleware to parse request bodies as JSON
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files (HTML, CSS, etc.)
app.use(express.static(__dirname));

// Route to serve the login page
app.get('/', (req, res) => {
    // Check for error message in URL query parameters
    const errorMessage = req.query.error ? req.query.error : '';
    res.sendFile(__dirname + '/login.html', { error: errorMessage });
});

// Route to handle login form submission
app.post('/login', async (req, res) => {
    const { credential, password } = req.body;

    try {
        let query;
        if (isEnrollmentNumber(credential)){
        query = 'SELECT * FROM students WHERE enrollment = $1 AND password = $2';
        }
        else if (isEmail(credential)){
            query = 'SELECT * FROM faculty WHERE email = $1 AND password = $2';
        }
        else{
            res.redirect('/?error=Invalid input format');
            return;
        }

        const result = await client.query(query, [credential, password]);

        if (result.rows.length > 0) {
            // User authenticated, redirect to home page
            if (isEnrollmentNumber(credential)) {
                res.redirect('/home.html');
            }
            else if(isEmail(credential)){
                res.redirect('/home.html');
            }
        } else {
            // Invalid credentials, redirect back to login page with error message
            res.redirect('/?error=Invalid Credentials');
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal server error');
    }
});

// Function to check if input resembles an enrollment number
function isEnrollmentNumber(input) {
    // Check if input consists of 11 digits
    return /^\d{11}$/.test(input);
}

// Function to check if input resembles an email address
function isEmail(input) {
    // Simple email validation regex, can be improved for production use
    return /\S+@ganpatuniversity\.ac\.in$/.test(input);
}

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});