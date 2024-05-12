const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid'); // For generating unique tokens
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
    res.sendFile(__dirname + '/index.html', { error: errorMessage });
});

app.get('/register', async (req, res) => {
    res.sendFile(__dirname + '/registration.html');
});

// Route to handle form submission of Registration
app.post('/register', async (req, res) => {
    try {

        // Generate a random team_id within the range of 1 to 100
        const team_id = Math.floor(Math.random() * 100) + 1;
        
        // Extract and store team members data
        for (let i = 1; i <= 4; i++) {
            const enrollment = req.body[`member-enrollment-${i}`];
            const password = req.body[`member-enrollment-${i}`];
            const student_name = req.body[`member-name-${i}`];
            const class_name = req.body[`member-class-${i}`];
            const batch = req.body[`member-batch-${i}`];
            const email_id = req.body[`member-email-${i}`];
            const branch = req.body[`member-branch-${i}`];
            const semester = req.body[`semester-${i}`];

            // Check if any required field is null or undefined
            if (!enrollment || !password || !student_name || !class_name || !batch || !email_id || !branch || !semester) {
                console.error(`Some required fields are missing for team member ${i}`);
                continue; // Skip this iteration if any required field is missing
            }

            // Check if the student with the provided enrollment number already exists
            const existingStudent = await client.query('SELECT * FROM students WHERE enrollment = $1', [enrollment]);
            if (existingStudent.rows.length > 0) {
                res.send(`Student with enrollment number ${enrollment} already exists`);
                continue; // Skip registration for this team member
            }

            // Insert or update member data into the database
            await client.query(
                'INSERT INTO students (enrollment, password, student_name, class, batch, email_id, branch, semester, team_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                [enrollment, password, student_name, class_name, batch, email_id, branch, semester, team_id]
            );
        }

        // Send a success response
        res.status(200).send('Registration successful into Capstone Portal.');
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal server error');
    }
});

// Route to handle login form submission
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        let query;
        if (isEnrollmentNumber(username)){
            query = 'SELECT * FROM students WHERE enrollment = $1';
        } else if (isCoordinatorEmail(username)){
            query = 'SELECT * FROM coordinator WHERE email = $1';
        }
        else if (isGuideEmail(username)) {
            query = 'SELECT * FROM guide WHERE email = $1';
        }else {
            res.redirect('/?error=Invalid input format');
            return;
        }

        const result = await client.query(query, [username]);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            if (password === user.password) {
                // Password is correct
                if (isEnrollmentNumber(username)) {
                    // Check if the password matches the enrollment number
                    if (password === username) {
                        // Password matches the enrollment number, redirect to change password page
                        req.session.student = user;
                        res.redirect('/change-password');
                        return;
                    }
                }
                // Proceed with regular login
                if (isEnrollmentNumber(username)) {
                    req.session.student = user;
                    res.redirect('/student_home.html');
                } else if(isGuideEmail(username)) {
                    req.session.guide = user;
                    res.redirect('/guide_home.html');
                } else{
                    req.session.coordinator = user;
                    res.redirect('/coordinator_home.html');
                }
            } else {
                // Incorrect password, redirect back to login page with error message
                res.redirect('/login.html?error=Incorrect password');
            }
        } else {
            // User not found, redirect back to login page with error message
            res.redirect('/login.html?error=Invalid Credentials');
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

// Function to check if input resembles a coordinator email
function isCoordinatorEmail(input) {
    // Simple email validation regex, can be improved for production use
    return /\S+@gmail\.com$/.test(input);
}

// Function to check if input resembles a guide email
function isGuideEmail(input) {
    // Simple email validation regex, can be improved for production use
    return /\S+@ganpatuniversity\.ac\.in$/.test(input);
}

// Route to handle change password page
app.get('/change-password', async (req, res) => {
    const student = req.session.student;
    if (!student) {
        res.redirect('/login.html?error=Please login to access your account');
        return;
    }

    if (isEnrollmentNumber(student.enrollment)) {
        res.sendFile(__dirname + '/changePassword.html');
    } else {
        res.redirect('/student_home.html'); // Redirect coordinators away from this page
    }
});

// Route to handle password change submission
app.post('/change-password', async (req, res) => {
    const student = req.session.student;
    if (!student) {
        res.redirect('/login.html?error=Please login to access your account');
        return;
    }

    if (isEnrollmentNumber(student.enrollment)) {
        try {
            const { oldPassword, newPassword } = req.body;

            // Check if the old password matches the one stored in the database
            const query = 'SELECT password FROM students WHERE enrollment = $1';
            const result = await client.query(query, [student.enrollment]);

            if (result.rows.length === 0) {
                res.status(404).send('Student not found');
                return;
            }

            const storedPassword = result.rows[0].password;
            if (oldPassword !== storedPassword) {
                res.status(401).send('Invalid old password');
                return;
            }

            // Update the password in the database
            const updateQuery = 'UPDATE students SET password = $1 WHERE enrollment = $2';
            await client.query(updateQuery, [newPassword, student.enrollment]);

            //Update session data with latest user information
            student.password = newPassword;
            req.session.student = student;

            // Redirect to home page or account page after successful password change
            res.redirect('/student_home.html');
        } catch (error) {
            console.error('Error:', error);
            res.status(500).send('Internal server error');
        }
    } else {
        res.redirect('/student_home.html'); // Redirect coordinators away from this page
    }
});

// Route to handle the forgot password page
app.get('/forgot-password', (req, res) => {
    res.sendFile(__dirname + '/forgot-password.html');
});

app.post('/forgot-password', async (req, res) => {
    const { username } = req.body;

    try {
        // Generate a unique token
        const token = uuidv4();

        // Store the token in the database
        await storeResetToken(username, token);

        // Send the reset password email to the user
        await sendResetPasswordEmail(username, token);

        // Redirect to a page indicating that the reset email has been sent
        res.redirect('/password-reset-email-sent');
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal server error');
    }
});

// Function to store reset token in the database
async function storeResetToken(username, token) {
    try {
        // Update the reset token in the database
        const query = 'UPDATE students SET reset_token = $1 WHERE enrollment = $2';
        await client.query(query, [token, username]);
    } catch (error) {
        console.error('Error storing reset token:', error);
        throw error;
    }
}

// Function to send reset password email
async function sendResetPasswordEmail(username, token) {
    try {
        // Query the database to retrieve the email address of the user
        const query = 'SELECT email_id FROM students WHERE enrollment = $1';
        const result = await client.query(query, [username]);

        if (result.rows.length > 0) {
            const userEmail = result.rows[0].email_id;

            // Create a nodemailer transporter
            const transporter = nodemailer.createTransport({
                service: 'Gmail',
                auth: {
                    user: 'divympatel21@gnu.ac.in', // Update with your Gmail email address
                    pass: 'Divyp@tel484' // Update with your Gmail password
                }
            });

            // Configure the email message
            const mailOptions = {
                from: 'Capstone Portal <divympatel21@gnu.ac.in>',
                to: userEmail, // Use the retrieved email address
                subject: 'Password Reset Request',
                text: `Dear user, 
                Please click the following link to reset your password: 
                https://capstone-portal.onrender.com/reset-password?token=${token}`
            };

            // Send the email
            await transporter.sendMail(mailOptions);
        } else {
            // User not found in the database
            console.error('User not found in the database');
        }
    } catch (error) {
        console.error('Error sending reset password email:', error);
    }
}

// Route to handle the password reset confirmation page
app.get('/password-reset-email-sent', (req, res) => {
    res.sendFile(__dirname + '/password-reset-email-sent.html');
});

// Route to handle the password reset form
app.get('/reset-password', (req, res) => {
    const token = req.query.token;
    res.sendFile(__dirname + '/reset-password.html');
});

app.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    try {
        // Check if the token exists in the database
        const username = await getUsernameByToken(token);

        if (username) {
            // Update the user's password in the database
            await updateUserPassword(username, newPassword);

            // Remove the token from the database after reset
            await deleteResetToken(username);

            // Redirect to a page indicating that the password has been reset
            res.redirect('/password-reset-success');
        } else {
            // Token not found, redirect back to reset password page with error message
            res.redirect(`/reset-password?token=${token}&error=Invalid token`);
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal server error');
    }
});

// Function to get username by reset token
async function getUsernameByToken(token) {
    try {
        const query = 'SELECT enrollment FROM students WHERE reset_token = $1';
        const result = await client.query(query, [token]);

        if (result.rows.length > 0) {
            return result.rows[0].enrollment;
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error getting username by token:', error);
        throw error;
    }
}

// Function to update user's password in the database
async function updateUserPassword(username, newPassword) {
    try {
        // Update the user's password in the database
        const query = 'UPDATE students SET password = $1 WHERE enrollment = $2';
        await client.query(query, [newPassword, username]);
        console.log(`Password updated successfully for user ${username}`);
    } catch (error) {
        console.error('Error updating password:', error);
        throw error;
    }
}

// Function to delete reset token from the database
async function deleteResetToken(username) {
    try {
        // Update the reset token in the database
        const query = 'UPDATE students SET reset_token = NULL WHERE enrollment = $1';
        await client.query(query, [username]);
    } catch (error) {
        console.error('Error deleting reset token:', error);
        throw error;
    }
}

// Route to handle the password reset success page
app.get('/password-reset-success', (req, res) => {
    res.sendFile(__dirname + '/password-reset-success.html');
});

// Route to handle form submission of project
app.get('/project', async(req, res) => {
    const student = req.session.student;
    if (!student) {
        res.redirect('/login.html?error=Please login to access your account');
        return;
    }
});

// Route to handle form submission of project
app.post('/project', upload.single('upload-file'), async (req, res) => {
    const student = req.session.student;
    if (!student) {
        res.redirect('/login.html?error=Please login to access your account');
        return;
    }
    try {
        // Extract form data
        const {teamID, studentName, studentErNo, branch, projectTitle, projectDescription, additionalComments } = req.body;

        // Retrieve uploaded file
        const uploadFile = req.file;

        // Check if record with the same enrollment number exists
        const existingRecord = await client.query('SELECT * FROM projects WHERE enrollment = $1', [studentErNo]);

        if (existingRecord.rows.length > 0) {
            // If record exists, update it
            const updateQuery = 'UPDATE projects SET team_id = $1, student_name = $2, branch = $3, project_title = $4, project_description = $5, file_path = $6, additional_comments = $7 WHERE enrollment = $8';
            await client.query(updateQuery, [teamID, studentName, branch, projectTitle, projectDescription, uploadFile, additionalComments, studentErNo]);
        } else {
            // If record doesn't exist, insert a new record
            const insertQuery = 'INSERT INTO projects (team_id, student_name, enrollment, branch, project_title, project_description, file_path, additional_comments) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
            await client.query(insertQuery, [teamID, studentName, studentErNo, branch, projectTitle, projectDescription, uploadFile, additionalComments]);
        }
        // Send a success response
        res.redirect('/student_home.html');
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal server error');
    }
});

// Route to handle student info. page
app.get('/info', async (req, res) => {
    const student = req.session.student;
    if (!student) {
        res.redirect('/login.html?error=Please login to access your account');
        return;
    }

    try {
        const enrollment = student.enrollment;
        // Query the database to retrieve student information based on enrollment
        const query = 'SELECT student_name, enrollment, class, batch, email_id, branch, semester, guide_name FROM students WHERE enrollment = $1';
        const result = await client.query(query, [enrollment]);

        if (result.rows.length > 0) {
            // Render the account.html file with student information injected
            let accountHtml = fs.readFileSync(__dirname + '/info.html', 'utf8');
            const studentInfo = result.rows[0]; // Assuming only one row per user

            // Inject student information into the HTML file
            accountHtml = accountHtml.replace('{{student}}', studentInfo.student_name);
            accountHtml = accountHtml.replace('{{studentName}}', studentInfo.student_name);
            accountHtml = accountHtml.replace('{{enrollment}}', studentInfo.enrollment);
            accountHtml = accountHtml.replace('{{class}}', studentInfo.class);
            accountHtml = accountHtml.replace('{{batch}}', studentInfo.batch);
            accountHtml = accountHtml.replace('{{emailId}}', studentInfo.email_id);
            accountHtml = accountHtml.replace('{{branch}}', studentInfo.branch);
            accountHtml = accountHtml.replace('{{semester}}', studentInfo.semester);
            accountHtml = accountHtml.replace('{{guide}}', studentInfo.guide_name);

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

// Route to handle sending notifications from coordinator to students
app.post('/send-notification', async (req, res) => {
    const { message } = req.body;

    try {
        // Get the current timestamp
        const currentTime = new Date();

        // Insert the notification into the database with the current timestamp
        const query = 'INSERT INTO notifications (message, timestamp) VALUES ($1, $2)';
        await client.query(query, [message, currentTime]);

        // Send a success response
        res.status(200).send('Notification sent successfully');
    } catch (error) {
        console.error('Error sending notification:', error);
        res.status(500).send('Internal server error');
    }
});

// Route to handle fetching notifications for students
app.get('/notifications', async (req, res) => {
    try {
        // Query the database to retrieve all notifications sorted by timestamp in descending order
        const query = 'SELECT message, timestamp FROM notifications ORDER BY timestamp DESC';
        const result = await client.query(query);

        // Send the notifications to the client
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).send('Internal server error');
    }
});

// Route to handle fetching list of team-ids for students
app.get('/team-ids', async (req, res) => {
    try {
        const query = 'SELECT DISTINCT team_id FROM students'; // Modify the query according to your database schema
        const result = await client.query(query);
        const teamIds = result.rows.map(row => row.team_id);
        res.json(teamIds);
    } catch (error) {
        console.error('Error fetching team IDs:', error);
        res.status(500).send('Internal server error');
    }
});

// Route to handle fetching team-details of students
app.get('/team-details/:teamId', async (req, res) => {
    const teamId = req.params.teamId;
    try {
        const query = 'SELECT * FROM students WHERE team_id = $1'; // Modify the query according to your database schema
        const result = await client.query(query, [teamId]);
        const teamDetails = result.rows;
        res.json(teamDetails);
    } catch (error) {
        console.error('Error fetching team details:', error);
        res.status(500).send('Internal server error');
    }
});

// Route to handle fetching list of project names
app.get('/project-names', async (req, res) => {
    try {
        const query = 'SELECT DISTINCT project_title FROM projects'; // Modify the query according to your database schema
        const result = await client.query(query);
        const projectNames = result.rows.map(row => row.project_title);
        res.json(projectNames);
    } catch (error) {
        console.error('Error fetching project names:', error);
        res.status(500).send('Internal server error');
    }
});

// Route to handle fetching project details by name
app.get('/project-details/:name', async (req, res) => {
    const projectName = req.params.name;
    try {
        const query = 'SELECT * FROM projects WHERE project_title = $1'; // Modify the query according to your database schema
        const result = await client.query(query, [projectName]);
        const projectDetails = result.rows;
        res.json(projectDetails);
    } catch (error) {
        console.error('Error fetching project details:', error);
        res.status(500).send('Internal server error');
    }
});

// Route to fetch list of guides
app.get('/guides', async (req, res) => {
    try {
        const query = 'SELECT name FROM guide'; // Adjust the query according to your database schema
        const result = await client.query(query);
        const guides = result.rows;
        res.json(guides);
    } catch (error) {
        console.error('Error fetching guides:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Route to allocate guide to a team
app.post('/allocate-guide/:teamId', async (req, res) => {
    const teamId = req.params.teamId;
    const { guide } = req.body;
    try {
        const query = 'UPDATE students SET guide_name = $1 WHERE team_id = $2'; // Adjust the query according to your database schema
        await client.query(query, [guide, teamId]);
        res.json({ message: `Guide ${guide} allocated to team ${teamId}` });
    } catch (error) {
        console.error('Error allocating guide:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Route to handle student attendance page
app.get('/attendance', async (req, res) => {
    const student = req.session.student;
    if (!student) {
        res.redirect('/login.html?error=Please login to access your account');
        return;
    }

    try {
        const enrollment = student.enrollment;
        // Query the database to retrieve student information based on enrollment
        const query = 'SELECT student_name, attendance, first_internal_marks, second_internal_marks FROM students WHERE enrollment = $1';
        const result = await client.query(query, [enrollment]);

        if (result.rows.length > 0) {
            // Render the account.html file with student information injected
            let accountHtml = fs.readFileSync(__dirname + '/attendance.html', 'utf8');
            const studentInfo = result.rows[0]; // Assuming only one row per user

            // Inject student information into the HTML file
            accountHtml = accountHtml.replace('{{student}}', studentInfo.student_name);
            accountHtml = accountHtml.replace('{{attendance}}', studentInfo.attendance);
            accountHtml = accountHtml.replace('{{firstInternalMarks}}', studentInfo.first_internal_marks);
            accountHtml = accountHtml.replace('{{secondInternalMarks}}', studentInfo.second_internal_marks);

            // Send the modified HTML file
            res.send(accountHtml);
        } else {
            res.status(404).send('Attendance information not found');
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal server error');
    }
});

// Route to handle guide info. page
app.get('/guide-info', async (req, res) => {
    const guide = req.session.guide;
    if (!guide) {
        res.redirect('/login.html?error=Please login to access your account');
        return;
    }

    try {
        const email = guide.email;
        // Query the database to retrieve student information based on enrollment
        const query = 'SELECT name, email FROM guide WHERE email = $1';
        const result = await client.query(query, [email]);

        if (result.rows.length > 0) {
            // Render the account.html file with student information injected
            let accountHtml = fs.readFileSync(__dirname + '/guide_info.html', 'utf8');
            const guideInfo = result.rows[0]; // Assuming only one row per user

            // Inject student information into the HTML file
            accountHtml = accountHtml.replace('{{guide}}', guideInfo.name);
            accountHtml = accountHtml.replace('{{guideName}}', guideInfo.name);
            accountHtml = accountHtml.replace('{{emailId}}', guideInfo.email);

            // Send the modified HTML file
            res.send(accountHtml);
        } else {
            res.status(404).send('Guide information not found');
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal server error');
    }
});

// Route to handle coordinator info. page
app.get('/coordinator-info', async (req, res) => {
    const coordinator = req.session.coordinator;
    if (!coordinator) {
        res.redirect('/login.html?error=Please login to access your account');
        return;
    }

    try {
        const email = coordinator.email;
        // Query the database to retrieve student information based on enrollment
        const query = 'SELECT name, email FROM coordinator WHERE email = $1';
        const result = await client.query(query, [email]);

        if (result.rows.length > 0) {
            // Render the account.html file with student information injected
            let accountHtml = fs.readFileSync(__dirname + '/coordinator_info.html', 'utf8');
            const coordinatorInfo = result.rows[0]; // Assuming only one row per user

            // Inject student information into the HTML file
            accountHtml = accountHtml.replace('{{coordinator}}', coordinatorInfo.name);
            accountHtml = accountHtml.replace('{{coordinatorName}}', coordinatorInfo.name);
            accountHtml = accountHtml.replace('{{emailId}}', coordinatorInfo.email);

            // Send the modified HTML file
            res.send(accountHtml);
        } else {
            res.status(404).send('Guide information not found');
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal server error');
    }
});

// Route to handle logout
app.get('/logout', function (req, res) {
    try {
        if (req.session.student) {
            // Destroy student session if exists
            req.session.destroy(function (err) {
                if (err) {
                    console.error('Error destroying session:', err);
                    res.status(500).send('Internal server error');
                } else {
                    // Clear browser history and redirect to login page
                    res.redirect('/login.html');
                }
            });
        } else if (req.session.coordinator) {
            // Destroy coordinator session if exists
            req.session.destroy(function (err) {
                if (err) {
                    console.error('Error destroying session:', err);
                    res.status(500).send('Internal server error');
                } else {
                    // Clear browser history and redirect to login page
                    res.redirect('/login.html');
                }
            });
        } else {
            // No active session found, redirect to login page
            res.redirect('/login.html');
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