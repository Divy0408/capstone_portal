const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
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

const upload = multer({ dest: 'uploads/' }); // Set destination folder for file uploads

// Middleware to parse request bodies as JSON
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Express session middleware
app.use(session({
    secret: 'capstone_portal_2024_secret_key',
    resave: false,
    saveUninitialized: true
}));

// Serve static files (HTML, CSS, etc.)
app.use(express.static(__dirname));

// Route to serve the login page
app.get('/', (req, res) => {
    // Check for error message in URL query parameters
    const errorMessage = req.query.error ? req.query.error : '';
    res.sendFile(__dirname + '/welcomePage.html', { error: errorMessage });
});

// Route to handle login form submission
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        let query;
        if (isEnrollmentNumber(username)){
        query = 'SELECT * FROM students WHERE enrollment = $1 AND password = $2';
        }
        else if (isEmail(username)){
            query = 'SELECT * FROM faculty WHERE email = $1 AND password = $2';
        }
        else{
            res.redirect('/?error=Invalid input format');
            return;
        }

        const result = await client.query(query, [username, password]);

        if (result.rows.length > 0) {
            // User authenticated, redirect to home page
            if (isEnrollmentNumber(username)) {
                req.session.username = username;
                res.redirect('/home.html');
            }
            else if (isEmail(username)) {
                req.session.username = username;
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

app.get('/project', async(req, res) => {
    const enrollment = req.session.username;
    if (!enrollment) {
        res.redirect('/login.html?error=Please login to access your account');
        return;
    }
});

// Route to handle form submission
app.post('/project', upload.single('upload-file'), async (req, res) => {
    const enrollment = req.session.username;
    if (!enrollment) {
        res.redirect('/login.html?error=Please login to access your account');
        return;
    }
    try {
        // Extract form data
        const { studentName, studentErNo, branch, projectTitle, projectDescription, additionalComments } = req.body;

        // Retrieve uploaded file
        const uploadFile = req.file;

        // Insert form data into the database
        const query = 'INSERT INTO projects (student_name, student_er_no, branch, project_title, project_description, file_path, additional_comments) VALUES ($1, $2, $3, $4, $5, $6, $7)';
        await client.query(query, [studentName, studentErNo, branch, projectTitle, projectDescription, uploadFile, additionalComments]);

        // Send a success response
        res.redirect('/home.html');
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal server error');
    }
});

// Route to handle account page
app.get('/account', async (req, res) => {
    const enrollment = req.session.username;
    if (!enrollment) {
        res.redirect('/login.html?error=Please login to access your account');
        return;
    }

    try {
        // Query the database to retrieve student information based on enrollment
        const query = 'SELECT student_name, enrollment, class, batch, email_id FROM students WHERE enrollment = $1';
        const result = await client.query(query, [enrollment]);

        if (result.rows.length > 0) {
            // Render the account.html file with student information injected
            let accountHtml = fs.readFileSync(__dirname + '/account.html', 'utf8');
            const studentInfo = result.rows[0]; // Assuming only one row per user

            // Inject student information into the HTML file
            accountHtml = accountHtml.replace('{{student}}', studentInfo.student_name);
            accountHtml = accountHtml.replace('{{studentName}}', studentInfo.student_name);
            accountHtml = accountHtml.replace('{{enrollment}}', studentInfo.enrollment);
            accountHtml = accountHtml.replace('{{class}}', studentInfo.class);
            accountHtml = accountHtml.replace('{{batch}}', studentInfo.batch);
            accountHtml = accountHtml.replace('{{emailId}}', studentInfo.email_id);

            // Send the modified HTML file
            res.send(accountHtml);
        } else {
            res.status(404).send('Student information not found');
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal server error');
    }
});

// Route to handle viewProject page
app.get('/viewProject', async (req, res) => {
    const enrollment = req.session.username;
    if (!enrollment) {
        res.redirect('/login.html?error=Please login to access your account');
        return;
    }

    try {
        // Query the database to retrieve student information based on enrollment
        const query = 'SELECT student_name, enrollment, branch, project_title, project_description, additional_comments FROM projects WHERE enrollment = $1';
        const result = await client.query(query, [enrollment]);

        if (result.rows.length > 0) {
            // Render the account.html file with student information injected
            let accountHtml = fs.readFileSync(__dirname + '/viewProject.html', 'utf8');
            const studentInfo = result.rows[0]; // Assuming only one row per user

            // Inject student information into the HTML file
            accountHtml = accountHtml.replace('{{studentName}}', studentInfo.student_name);
            accountHtml = accountHtml.replace('{{enrollment}}', studentInfo.enrollment);
            accountHtml = accountHtml.replace('{{branch}}', studentInfo.branch);
            accountHtml = accountHtml.replace('{{project_title}}', studentInfo.project_title);
            accountHtml = accountHtml.replace('{{project_description}}', studentInfo.project_description);
            accountHtml = accountHtml.replace('{{additional_comments}}', studentInfo.additional_comments);

            // Send the modified HTML file
            res.send(accountHtml);
        } else {
            res.status(404).send('Project information not found');
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal server error');
    }
});

app.get('/logout',  function (req, res, next)  {
    try {
        if (req.session) {
            // delete session object
            req.session.destroy(function (err) {
              if (err) {
                return next(err);
              } else {
                return res.redirect('/');
              }
            });
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