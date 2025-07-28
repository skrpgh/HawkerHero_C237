const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const session = require('express-session');
const flash = require('connect-flash');
const app = express();

// Multer config for food image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/images'),
    filename: (req, file, cb) => cb(null, Date.now() + file.originalname)
});
const upload = multer({ storage });

// MySQL connection
const connection = mysql.createConnection({
    host: 'llr4jx.h.filess.io',
    port: 61002,
    user: 'HawkerHero_movesupply',
    password: '96383785232dfb2073f21e023bdad6a85e59e45d',
    database: 'HawkerHero_movesupply'
});
connection.connect(err => {
    if (err) {
        console.error('MySQL error:', err);
        return;
    }
    console.log('Connected to MySQL');
});

// Express config
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));
app.use(flash());

// Session setup
app.use(session({
    secret: 'hawker_hero_secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week
}));

// Middleware to expose user role to all views
app.use((req, res, next) => {
    res.locals.userRole = req.session.user?.role || null;
    next();
});

// Auth middleware
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    req.flash('error', 'Please log in to view this resource');
    res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
    if (req.session.user?.role === 'admin') return next();
    req.flash('error', 'Access denied');
    res.redirect('/login');
};


app.get('/', (req, res) => {
    const sql = 'SELECT * FROM food_items';  // Fetch food items from MySQL

    // Query the database
    connection.query(sql, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving food items');
        }

        // Render the HTML page with the data (pass results to EJS template)
        res.render('index', { foodItems: results, userRole: req.session.user?.role });
    });
});


// Login routes
app.get('/login', (req, res) => {
    res.render('login', {
        messages: req.flash('success'),
        errors: req.flash('error')
    });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
        connection.query(sql, [email, password], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            req.session.user = results[0];
            req.flash('success', 'Login Successful');

            // Check if user is admin
            if (results[0].role === 'admin') {
                res.redirect('/dashboard');
            } else {
                res.redirect('/hawker-centers');
            }
        } else {
            req.flash('error', 'Invalid email or password');
            res.redirect('/login');
        }
    });
});


// Dashboard routes
app.get('/dashboard', checkAuthenticated, (req, res) => {
    res.render('dashboard', { user: req.session.user });
});

app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('admin', { user: req.session.user });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

app.get('/register', (req, res) => {
    res.render('register', {
        messages: req.flash('error'),
        formData: req.flash('formData')[0]
    });
});

const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact, role } = req.body;

    if (!username || !email || !password || !address || !contact || !role) {
        req.flash('error', 'All fields are required.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }

    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 characters long.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }

    next();
};

app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact, role } = req.body;
    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';

    connection.query(sql, [username, email, password, address, contact, role], (err) => {
        if (err) {
            req.flash('error', 'Email already exists or server error.');
            req.flash('formData', req.body);
            return res.redirect('/register');
        }

        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/hawker-centers', checkAuthenticated, (req, res) => {
  const sql = 'SELECT * FROM hawker_centers';
  connection.query(sql, (err, results) => {
    if (err) {
      console.error('Error retrieving hawker centers:', err);
      return res.status(500).send('Failed to retrieve hawker centers');
    }

    // ✅ RENDER the EJS page and PASS the user + results
        // Pass both centers and user data to the view
        res.render('hawker_centers', {
            centers: results,  // List of hawker centers
            user: user,         // Pass user object to the view
            userRole: user ? user.role : null  // Pass user role (if available
    });
  });
});


app.get('/hawker-centers/:centerId', (req, res) => {
    const centerId = req.params.centerId;

    // Query to get all stalls for the given center
    const query = 'SELECT * FROM stalls WHERE center_id = ?';
    connection.query(query, [centerId], (err, stalls) => {
        if (err) {
            console.error('Error retrieving stalls:', err);
            return res.status(500).send('Failed to retrieve stalls');
        }

        // Render the page with the list of stalls for the specific center
        res.render('hawker_centers', { stalls: stalls, centerId: centerId });
    });
});


// Search hawker centers
app.post('/hawker-centers/search', checkAuthenticated, (req, res) => {
    const search = '%' + req.body.search + '%';
    const sql = 'SELECT * FROM hawker_centers WHERE name LIKE ? OR address LIKE ?';
    connection.query(sql, [search, search], (err, results) => {
        if (err) throw err;
        res.render('hawker_centers', { centers: results, user: req.session.user });
    });
});

// Add new center (admin only)
app.post('/hawker-centers/new', checkAuthenticated, checkAdmin, upload.single('image'), (req, res) => {
    const { name, address, facilities, imageUrl } = req.body;
    let image;

    if (imageUrl && imageUrl.trim() !== "") {
        image = imageUrl.trim();  // External link for image
    } else if (req.file) {
        image = `/uploads/${req.file.filename}`;  // Uploaded file path
    } else {
        image = null;
    }

    // Ensure name and address are provided
    if (!name || !address) {
        req.flash('error', 'Name and address are required.');
        return res.redirect('/hawker-centers/new');
    }

    const sql = 'INSERT INTO hawker_centers (name, address, facilities, image_url) VALUES (?, ?, ?, ?)';
    connection.query(sql, [name, address, facilities, image], (err) => {
        if (err) {
            console.error('Error inserting hawker center:', err);
            req.flash('error', 'Failed to add hawker center.');
            return res.redirect('/hawker-centers/new');
        } else {
            req.flash('success', 'Hawker center added successfully.');
            res.redirect('/hawker-centers');
        }
    });
});
// Edit center (admin only)



app.post('/hawker-centers/edit/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const { name, address, facilities, image_url } = req.body;
    const sql = 'UPDATE hawker_centers SET name = ?, address = ?, facilities = ?, image_url = ? WHERE id = ?';
    connection.query(sql, [name, address, facilities, image_url, req.params.id], (err) => {
        if (err) throw err;
        res.redirect('/hawker-centers');
    });
});

// Delete center (admin only)
app.post('/hawker-centers/delete/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const sql = 'DELETE FROM hawker_centers WHERE id = ?';
    connection.query(sql, [req.params.id], (err) => {
        if (err) {
            console.error('Error deleting hawker center:', err);
            return res.status(500).send('Failed to delete hawker center');
        }
        req.flash('success', 'Hawker Center deleted successfully!');
        res.redirect('/hawker-centers');
    });
});


// Route to display all stalls for a specific hawker center
app.get('/view-stalls/:centerId', (req, res) => {
    const centerId = req.params.centerId; // Get the center ID from the URL
    const sqlQuery = 'SELECT * FROM stalls WHERE center_id = ?'; // Query stalls by center_id
    
    connection.query(sqlQuery, [centerId], (err, result) => {
        if (err) {
            console.log(err);
            req.flash('error', 'Error fetching stalls');
            return res.redirect('/');
        }

        // Render the page with the filtered stalls
        res.render('view-stalls', { stalls: result });
    });
});



app.get('/view-stalls', checkAuthenticated, (req, res) => {
  const sql = 'SELECT * FROM stalls';
  connection.query(sql, (err, results) => {
    if (err) {
      console.error('Error retrieving stalls:', err);
      return res.status(500).send('Failed to retrieve stalls');
    }

    // ✅ RENDER the EJS page and PASS the user + results
    res.render('view-stalls', {
      stalls: results,
      user: req.session.user || null
    });
  });
});

// Route to display all stalls for a specific hawker center
app.get('/view-stalls/:centerId', (req, res) => {
    const centerId = req.params.centerId; // Get the center ID from the URL
    const sqlQuery = 'SELECT * FROM stalls WHERE center_id = ?'; // Query stalls by center_id
    
    connection.query(sqlQuery, [centerId], (err, result) => {
        if (err) {
            console.log(err);
            req.flash('error', 'Error fetching stalls');
            return res.redirect('/');
        }

        // Render the page with the filtered stalls
        res.render('view-stalls', { stalls: result });
    });
});

// Add Stall Route (GET)
app.get('/stalls/add', checkAuthenticated, (req, res) => {
    if (req.session.user && req.session.user.role === 'admin') {
        res.render('addStall');
    } else {
        req.flash('error', 'Only admin can add stalls');
        res.redirect('/view-stalls/:id');
    }
});

app.post('/stalls/add', (req, res) => {
    if (req.session.user && req.session.user.role === 'admin') {
        const { name, location, description } = req.body;
        const sql = 'INSERT INTO stalls (name, location, description) VALUES (?, ?, ?)';
        connection.query(sql, [name, location, description], (err, result) => {
            if (err) {
                console.error('Error adding stall:', err);
                req.flash('error', 'Failed to add stall');
                return res.redirect('/stalls/add');
            }
            req.flash('success', 'Stall added successfully');
            res.redirect('/hawker-centers');
        });
    } else {
        req.flash('error', 'Unauthorized access');
        res.redirect('/login');
    }
});
app.post('/stalls/add', checkAuthenticated, checkAdmin, (req, res) => {
    const { name, location, cuisine_type, center_id, image_url } = req.body;

    const sql = 'INSERT INTO stalls (name, location, cuisine_type, center_id, image_url) VALUES (?, ?, ?, ?, ?)';
    
    connection.query(sql, [name, location, cuisine_type, center_id, image_url], (err, result) => {
        if (err) {
            console.error('Error adding stall:', err);
            req.flash('error', 'Failed to add stall');
            return res.redirect('/stalls/add');
        }

        req.flash('success', 'Stall added successfully');
        res.redirect('/view-stalls');
    });
});



// Edit Stall Details (GET)
app.get('/edit-stall/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const { id } = req.params;
    const sqlGetStall = 'SELECT * FROM stalls WHERE id = ?';

    connection.query(sqlGetStall, [id], (err, result) => {
        if (err || result.length === 0) {
            req.flash('error', 'Stall not found.');
            return res.redirect('/admin');
        }

        res.render('edit', {
            stall: result[0],
            flash: req.flash()
        });
    });
});


// Edit Stall Details (POST)
app.post('/edit-stall/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const { id } = req.params;
    const { name, location, cuisine_type, image_url } = req.body;

    const sqlUpdateStall = `
        UPDATE stalls
        SET name = ?, location = ?, cuisine_type = ?, image_url = ?
        WHERE id = ?
    `;

    connection.query(sqlUpdateStall, [name, location, cuisine_type, image_url, id], (err) => {
        if (err) {
            console.error("Update Error:", err.message);
            req.flash('error', 'Failed to update stall.');
            return res.redirect(`/edit-stall/${id}`);
        }

        req.flash('success', 'Stall updated successfully!');
        res.redirect('/admin');
    });
});

// Deleting a Stall
app.post('/delete-stall/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const { id } = req.params;
    const sqlDeleteStall = 'DELETE FROM stalls WHERE id = ?';
    connection.query(sqlDeleteStall, [id], (err, result) => {
        if (err) {
            req.flash('error', 'Failed to delete stall.');
            return res.redirect('/admin');
        }

        req.flash('success', 'Stall deleted successfully!');
        res.redirect('/admin');
    });
});

app.post('/hawker-stalls/delete/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM stalls WHERE id = ?';

  connection.query(sql, [id], (err, result) => {
    if (err) {
      console.error('Delete Error:', err.message);
      req.flash('error', 'Failed to delete stall.');
      return res.redirect('/hawker-centers');
    }

    req.flash('success', 'Stall deleted successfully!');
    res.redirect('/view-stalls/:id');
  });
});


app.get('/reviews', checkAuthenticated,(req, res) => {
    const { q } = req.query;

    let sql = 'SELECT * FROM reviews';
    let params = [];

    if (q) {
        sql += ' WHERE rating = ?';
        params.push(q);
    }

    connection.query(sql, params, (error, results) => {
        if (error) throw error;

        res.render('reviews', {
            reviews: results,
            user: req.session.user,
            query: q
        });
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/reviews/:id', checkAuthenticated, (req, res) => {
  const id = req.params.id;

  connection.query('SELECT * FROM reviews WHERE id = ?', [id], (error, results) => {
      if (error) throw error;

      if (results.length > 0) {
          res.render('reviews', { reviews: results[0], user: req.session.user  });
      } else {
          res.status(404).send('reviews not found');
      }
  });
});

app.get('/addreviews', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addreviews', {user: req.session.user} ); 
});

app.post('/addreviews', upload.single('image'),  (req, res) => {
    const { user_id, rating, comment} = req.body;
    let image;
    if (req.file) {
        image = req.file.filename; 
    } else {
        image = null;
    }

    const sql = 'INSERT INTO reviews (user_id, rating, comment, image) VALUES (?, ?, ?, ?)';
    connection.query(sql , [user_id, rating, comment, image], (error, results) => {
        if (error) {
            console.error("Error adding review:", error);
            res.status(500).send('Error adding review');
        } else {
            res.redirect('/reviewadmin');
        }
    });
});

app.get('/updatereview/:id',checkAuthenticated, checkAdmin, (req,res) => {
    const id = req.params.id;
    const sql = 'SELECT * FROM reviews WHERE id = ?';

    connection.query(sql , [id], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            res.render('updatereview', { reviews: results[0] });
        } else {
            res.status(404).send('review not found');
        }
    });
});

app.post('/updatereview/:id', upload.single('image'), (req, res) => {
    const id = req.params.id;
    const { user_id, rating, comment } = req.body;
    let image  = req.body.currentImage; 
    if (req.file) { 
        image = req.file.filename; 
    } 

    const sql = 'UPDATE reviews SET user_id = ?, rating = ?, comment = ?, image =? WHERE id = ?';
    connection.query(sql, [user_id, rating, comment, image, id], (error, results) => {
        if (error) {
            console.error("Error updating review:", error);
            res.status(500).send('Error updating review');
        } else {
            res.redirect('/reviewadmin');
        }
    });
});

app.get('/deletereview/:id', (req, res) => {
    const id = req.params.id;

    connection.query('DELETE FROM reviews WHERE id = ?', [id], (error, results) => {
        if (error) {
            console.error("Error deleting product:", error);
            res.status(500).send('Error deleting review');
        } else {
            res.redirect('/reviewadmin');
        }
    });
});

// Route to display food items for a specific stall
// Route to display food items for a specific stall
app.get('/foodItems/:stallId', checkAuthenticated, (req, res) => {
    const stallId = req.params.stallId;  // Get the stall ID from the URL

    // Query to fetch food items for the specific stall
    const sqlQuery = 'SELECT * FROM food_items WHERE stall_id = ?';
    connection.query(sqlQuery, [stallId], (err, results) => {
        if (err) {
            console.error('Error fetching food items for stall:', err);
            return res.status(500).send('Internal Server Error');
        }

        if (results.length === 0) {
            return res.status(404).send('No food items found for this stall');
        }

        // Render the foodItems page with the results and stallId
        res.render('foodItems', {
            foodItems: results,   // List of food items for the stall
            stallId: stallId,     // Pass the stallId to the view
            userRole: req.session.user?.role || null,  // User role for role-based content
            query: req.query // Pass current filter values back to EJS
        });
    });
});

// Route to display the form for adding a new food item for a specific stall
app.get('/addFood/:stallId', checkAuthenticated, checkAdmin, (req, res) => {
    const stallId = req.params.stallId;
    res.render('addFood', { 
        stallId: stallId,  // Pass the stallId to the form
        flash: req.flash()  // Pass flash messages to the view
    });
});


// Route to handle adding a new food item for a specific stall
app.post('/addFood/:stallId', checkAuthenticated, checkAdmin, upload.single('image'), (req, res) => {
    const { name, price, description, imageUrl } = req.body;
    const stallId = req.params.stallId;  // Get the stall ID from the URL
    const image = req.file ? `/images/${req.file.filename}` : imageUrl;  // Handle image upload

    // Insert food item into the database
    const sql = 'INSERT INTO food_items (name, price, description, stall_id, image_url) VALUES (?, ?, ?, ?, ?)';
    connection.query(sql, [name, price, description, stallId, image], (err) => {
        if (err) {
            console.error('Error inserting food item:', err);
            req.flash('error', 'Failed to add food item');
            return res.redirect(`/addFood/${stallId}`);
        }
        req.flash('success', 'Food item added successfully');
        res.redirect(`/foodItems/${stallId}`);  // Redirect to the food items page for that stall
    });
});

// Route to display the form for editing an existing food item
app.get('/editFood/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const id = req.params.id;  // Get the food item ID from the URL
    const sqlGetFood = 'SELECT * FROM food_items WHERE id = ?';

    connection.query(sqlGetFood, [id], (err, result) => {
        if (err || result.length === 0) {
            req.flash('error', 'Food item not found.');
            return res.redirect('/foodItems');
        }

        res.render('editFood', {
            food: result[0],   // Pass the food item data to the view
            flash: req.flash()  // Flash messages for error/success
        });
    });
});

// Route to handle updating an existing food item
app.post('/editFood/:id', checkAuthenticated, checkAdmin, upload.single('image'), (req, res) => {
    const id = req.params.id;  // Get the food item ID from the URL
    const { name, price, description, stall_id, currentImage } = req.body;
    const image = req.file ? `/images/${req.file.filename}` : currentImage;  // Handle image upload

    const sqlUpdateFood = 'UPDATE food_items SET name = ?, price = ?, description = ?, stall_id = ?, image_url = ? WHERE id = ?';
    connection.query(sqlUpdateFood, [name, price, description, stall_id, image, id], (err) => {
        if (err) {
            req.flash('error', 'Failed to update food item.');
            return res.redirect(`/editFood/${id}`);
        }

        req.flash('success', 'Food item updated successfully!');
        res.redirect(`/foodItems/${stall_id}`);  // Redirect back to the food items page for the stall
    });
});

// Route to handle deleting a food item
app.post('/deleteFood/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const id = req.params.id;  // Get the food item ID from the URL
    const sqlDeleteFood = 'DELETE FROM food_items WHERE id = ?';

    connection.query(sqlDeleteFood, [id], (err) => {
        if (err) {
            req.flash('error', 'Failed to delete food item.');
            return res.redirect('/foodItems');
        }

        req.flash('success', 'Food item deleted successfully!');
        res.redirect('/foodItems/$[stallId]');  // Redirect back to the food items list
    });
});

app.get('/recommendations', checkAuthenticated, (req, res) => {
    const search = req.query.search || '';

    let sql = 'SELECT * FROM recommendations';
    let params = [];

    if (search) {
        sql += ' WHERE title LIKE ? OR description LIKE ?';
        params = [`%${search}%`, `%${search}%`];
    }

    connection.query(sql, params, (err, results) => {
        if (err) {
            console.error('Database query error:', err);

        // Get errors from flash, or fallback to a single error string in array
            const errors = req.flash('error');
            if (errors.length === 0) errors.push('Error loading recommendations');

            return res.render('recommendations', {
                user: req.session.user,
                messages: [],        // no success messages
                errors: errors,      // errors from flash or fallback
                recommendations: [],
                search
            });
        }

    // Get any flash messages and errors BEFORE rendering
        const messages = req.flash('success');
        const errors = req.flash('error');

        res.render('recommendations', {
            user: req.session.user,
            messages: messages.length > 0 ? messages : [],
            errors: errors.length > 0 ? errors : [],
            recommendations: results,
            search
        });
    });
});

app.get('/recommendations/add', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('Forbidden');
    }

    res.render('add_recommendations', {
        user: req.session.user,
        errors: [],
        messages: []
    });
});

// Add recommendation (Admin only)
app.post('/recommendations/add', checkAuthenticated, (req, res) => {
    if (req.session.user.role !== 'admin') {
        req.flash('error', 'You are not authorized to add recommendations.');
        return res.redirect('/recommendations');
    }

    const { title, description, image_url, food_id } = req.body;
    const userId = req.session.user.id; 
    const stallId = req.session.user.stall_id || null;  // handle if undefined

    if (!title || !description) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/recommendations/add');
    }

    const sql = 'INSERT INTO recommendations (title, description, image_url, user_id, stall_id, food_id) VALUES (?, ?, ?, ?, ?, ?)';
    connection.query(sql, [title, description, image_url, userId, stallId, food_id], (err, result) => {
        if (err) {
            console.error('Error inserting recommendation:', err);
            req.flash('error', 'Failed to add recommendation');
            return res.redirect('/recommendations/add');
        }
        req.flash('success', 'Recommendation added!');
        res.redirect('/recommendations');
    });
});


// Edit recommendation (Authenticated users)
app.get('/recommendations/edit/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const id = req.params.id;
    const sql = 'SELECT * FROM recommendations WHERE id = ?';
    connection.query(sql, [id], (err, results) => {
        if (err || results.length === 0) {
            req.flash('error', 'Recommendation not found');
            return res.redirect('/recommendations');
        }
        res.render('edit_recommendations', {
            user: req.session.user,
            recommendation: results[0],
            errors: req.flash('error'),
            messages: req.flash('success')
        });
    });
});

app.post('/recommendations/edit/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const id = req.params.id;
    const { title, description, image_url } = req.body;

    if (!title || !description) {
        req.flash('error', 'All fields are required.');
        return res.redirect(`/recommendations/edit/${id}`);
    }

    const sql = 'UPDATE recommendations SET title = ?, description = ?, image_url = ? WHERE id = ?';
    connection.query(sql, [title, description, image_url, id], (err, result) => {
        if (err) {
            req.flash('error', 'Failed to update recommendation');
            return res.redirect(`/recommendations/edit/${id}`);
        }
        req.flash('success', 'Recommendation updated!');
        res.redirect('/recommendations');
    });
});

// Delete recommendation (Admin only)
app.post('/recommendations/delete/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const id = req.params.id;

    const sql = 'DELETE FROM recommendations WHERE id = ?';
    connection.query(sql, [id], (err, result) => {
    if (err) {
            req.flash('error', 'Failed to delete recommendation');
            return res.redirect('/recommendations');
        }
        req.flash('success', 'Recommendation deleted!');
        res.redirect('/recommendations');
    });
});

app.get('/favorite', checkAuthenticated, (req, res) => {
    const sql = 'SELECT * FROM favorites';
    connection.query(sql, (error, results) => {
        if (error) {
            console.error('Database error:', error.message);
            return res.status(500).send('Error retrieving favorites');
        }
        res.render('favorite', {favorites: results, user: req.session.user, messages: req.flash('success')});
    });
});


// Define routes
app.get('/favorite', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;  // Assuming you're using the logged-in user's ID from the session

    // Query to fetch favorite data for the logged-in user
    const sqlQuery = 'SELECT * FROM favorites WHERE user_id = ?';

    connection.query(sqlQuery, [userId], (err, results) => {
        if (err) {
            console.error('Error fetching favorites:', err);
            return res.status(500).send('Error Retrieving favorites');
        }

        if (results.length === 0) {
            return res.render('favorite', { favorite: null });  // Render with null if no favorites found
        }

        // Pass the favorite data to the EJS view
        res.render('favorite', {
            favorite: results[0],  // Assuming only one favorite per user
            userRole: req.session.user?.role || null  // Optional: User role for role-based content
        });
    });
});


// Search route
app.get('/search', (req, res) => {
    const searchQuery = req.query.q;
    const sql = `SELECT * FROM favorites WHERE username LIKE ? OR stall LIKE ? OR food LIKE ? OR notes LIKE ?`;
    const searchTerm = `%${searchQuery}%`;
    connection.query(sql, [searchTerm, searchTerm, searchTerm, searchTerm], (error, results) => {
        if (error) {
            console.error('Database search error:', error.message);
            return res.status(500).send('Error performing search');
        }
        res.render('favorite', {favorites: results, user: req.session.user, messages: req.flash('success')});
    });
});

// Favorite route

// Add or remove hawker center from favorites
app.post('/hawker/favorite/:id', checkAuthenticated, (req, res) => {
    const hawkerId = req.params.id;
    const userId = req.session.user.id; // Assuming user is logged in

    // Check if the hawker center is already favorited by the user
    const checkFavoriteQuery = 'SELECT * FROM favorites WHERE user_id = ? AND hawker_id = ?';
    connection.query(checkFavoriteQuery, [userId, hawkerId], (err, results) => {
        if (err) {
            console.error('Error checking favorite:', err);
            return res.status(500).send('Error checking favorite');
        }

        if (results.length > 0) {
            // If already favorited, remove from favorites
            const deleteFavoriteQuery = 'DELETE FROM favorites WHERE user_id = ? AND hawker_id = ?';
            connection.query(deleteFavoriteQuery, [userId, hawkerId], (err) => {
                if (err) {
                    console.error('Error removing favorite:', err);
                    return res.status(500).send('Error removing favorite');
                }
                req.flash('success', 'Removed from favorites');
                res.redirect('/hawker-centers');
            });
        } else {
            // If not favorited, add to favorites
            const addFavoriteQuery = 'INSERT INTO favorites (user_id, hawker_id) VALUES (?, ?)';
            connection.query(addFavoriteQuery, [userId, hawkerId], (err) => {
                if (err) {
                    console.error('Error adding favorite:', err);
                    return res.status(500).send('Error adding favorite');
                }
                req.flash('success', 'Added to favorites');
                res.redirect('/hawker-centers');
            });
        }
    });
});

app.get('/favorite', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;  // Assuming you're using the logged-in user's ID from the session

    // Query to fetch the favorite data for the logged-in user
    const sqlQuery = 'SELECT * FROM favorites WHERE user_id = ?';

    connection.query(sqlQuery, [userId], (err, results) => {
        if (err) {
            console.error('Error fetching favorites:', err);
            req.flash('error', 'Failed to load favorite items');
            return res.redirect('/');
        }

        if (results.length === 0) {
            req.flash('error', 'No favorite found');
            return res.render('favorite', { favorite: null });
        }

        // Pass the favorite data to the EJS view
        res.render('favorite', {
            favorite: results[0],  // Assuming only one favorite per user
            flash: req.flash()  // Pass flash messages to the view
        });
    });
});

// Add favorite route
app.get('/addFavorite', checkAuthenticated, (req, res) => {
    res.render('addFavorite', {errors: req.flash('error'), formData: req.flash('formData')[0] || {}, user: req.session.user});
});

app.post('/addFavorite', checkAuthenticated, checkAdmin, (req, res) => {
    // Extract favorite data from the request body
    const {username, stall, food, notes} = req.body;

    if (!username || !stall || !food || !notes) {
    req.flash('error', 'All fields are required.');
    req.flash('formData', req.body);
    return res.redirect('/addFavorite');
    }

    const sql = 'INSERT INTO favorites (username, stall, food, notes) VALUES (?, ?, ?, ?)';
    // Insert the new favorite into the database
    connection.query(sql, [username, stall, food, notes], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error adding favorite:", error);
            res.status(500).send('Error adding favorite');
        } else {
            // Send a success response
            res.redirect('/favorite');
        }
    });
});

// Edit favorite route
app.get('/editFavorite/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const id = req.params.id;
    const sql = 'SELECT * FROM favorites WHERE id = ?';
    // Fetch data from MySQL based on the favorite ID
    connection.query(sql, [id], (error, results) => {
        if (error) {
            console.error('Database querry error:', error.message);
            return res.status(500).send('Error retrieving favorite by ID');
        }
        // Check if any favorite with the given ID was found
        if (results.length > 0) {
            // Render HTML page with the favorite data
            res.render('editFavorite', {favorite: results[0], user: req.session.user});
        } else {
            // If no favorite with the given ID was found, render a 404 page or handle it accordingly
            res.status(404).send('Favorite not found');
        }
    });
});

app.post('/editFavorite/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const id = req.params.id;
    // Extract favourite data from the request body
    const {username, stall, food, notes} = req.body;
    const sql = 'UPDATE favorites SET username = ?, stall = ?, food = ?, notes = ? WHERE id = ?';

    // Insert the new favorite into the database
    connection.query(sql, [username, stall, food, notes, id], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error updating favorite:", error);
            res.status(500).send('Error updating favorite');
        } else {
            // Send a success response
            res.redirect('/');
        }
    });
});

// Delete favorite route
app.get('/deleteFavorite/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const id = req.params.id;
    const sql = 'DELETE FROM favorites WHERE id = ?';
    connection.query(sql, [id], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error('Error deleting favorite:', error);
            res.status(500).send('Error deleting favorite');
        } else {
            // Send a success response
            res.redirect('/');
        }
    });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Hawker Hero running on port ${PORT}`));


//testing 123
