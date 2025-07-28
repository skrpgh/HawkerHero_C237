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
            res.redirect('/');
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
        if (err) throw err;
        res.render('hawker_centers', { centers: results, user: req.session.user });
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
app.get('/hawker-centers/new', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('new_center', { user: req.session.user, messages: req.flash('error') });
});

app.post('/hawker-centers/new', checkAuthenticated, checkAdmin, upload.single('image'), (req, res) => {
    const { name, address, facilities, imageUrl } = req.body;
    let image;

    if (imageUrl && imageUrl.trim() !== "") {
        image = imageUrl.trim(); // External link
    } else if (req.file) {
        image = `/uploads/${req.file.filename}`; // Uploaded file (adjust path if needed)
    } else {
        image = null;
    }

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
app.get('/hawker-centers/edit/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const sql = 'SELECT * FROM hawker_centers WHERE id = ?';
    connection.query(sql, [req.params.id], (err, results) => {
        if (err) throw err;
        res.render('edit_center', { center: results[0], user: req.session.user, messages: req.flash('error') });
    });
});

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
        if (err) throw err;
        res.redirect('/hawker-centers');
    });
});


// Route to display all hawker stalls for users
app.get('/view-stalls', (req, res) => {
    const sqlQuery = 'SELECT * FROM stalls';
    connection.query(sqlQuery, (err, result) => {
        if (err) {
            console.log(err);
            req.flash('error', 'Error fetching stalls');
            return res.redirect('/');
        }
        res.render('view-stalls', { stalls: result });
    });
});

// Add Stall Route (GET)
app.get('/add-stall', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('add', { 
        messages: req.flash('success'),  // Display success message if any
        errors: req.flash('error')      // Display error message if any
    });
});

// Add Stall Route (POST)
app.post('/add-stall', checkAuthenticated, checkAdmin, (req, res) => {
    const { name, location, cuisine_type, imageUrl, center_id } = req.body;

    // Validate required fields
    if (!name || !location || !cuisine_type || !center_id) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/add-stall');
    }

    const image_url = imageUrl || null;

    const sql = 'INSERT INTO stalls (name, location, cuisine_type, center_id, image_url) VALUES (?, ?, ?, ?, ?)';
    connection.query(sql, [name, location, cuisine_type, center_id, image_url], (err, result) => {
        if (err) {
            console.error('Error inserting stall:', err.message);
            req.flash('error', 'Failed to add stall.');
            return res.redirect('/add-stall');
        }

        req.flash('success', 'Stall added successfully!');
        res.redirect('/dashboard');
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

app.get('/foodItems', checkAuthenticated, (req, res) => {
    const { name, minPrice, maxPrice } = req.query;
    let sql = 'SELECT * FROM food_items WHERE 1=1';
    const params = [];

    if (name) {
        sql += ' AND name LIKE ?';
        params.push(`%${name}%`);
    }

    if (minPrice) {
        sql += ' AND price >= ?';
        params.push(minPrice);
    }

    if (maxPrice) {
        sql += ' AND price <= ?';
        params.push(maxPrice);
    }

    connection.query(sql, params, (err, results) => {
        if (err) {
            console.error('Error fetching filtered food items:', err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('foodItems', {
            foodItems: results,
            userRole: req.session.user?.role || null,
            query: req.query // pass current filter values back to EJS
        });
    });
});


app.get('/food/:id', checkAuthenticated, (req, res) => {
    const id = req.params.id;
    connection.query('SELECT * FROM food_items WHERE id = ?', [id], (err, results) => {
        if (err || results.length === 0) return res.status(404).send('Food item not found');
        res.render('foodItems', { food: results[0], userRole: req.session.user.role });
    });
});

// Food item routes (Admin-only)
app.get('/addFood', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addFood');
});

app.post('/addFood', upload.single('image'), (req, res) => {
    const { name, price, description, stall_id, imageUrl } = req.body; // Added missing fields
    let image;

    if (imageUrl && imageUrl.trim() !== "") {
        image = imageUrl.trim(); // Use external link
    } else if (req.file) {
        image = `/images/${req.file.filename}`; // Use uploaded file path
    } else {
        image = null;
    }

    // Fixed SQL to match your form fields
    const sql = 'INSERT INTO food_items (name, price, description, stall_id, image_url) VALUES ( ?, ?, ?, ?, ?)';
    connection.query(sql, [name, price, description, stall_id, image], (err) => {
        if (err) {
            console.error('Error inserting food item:', err);
            req.flash('error', 'Failed to add food item');
            return res.redirect('/foodItems'); 
        } else {
            req.flash('success', 'Food item added successfully');
            res.redirect('/foodItems'); 
        }
    });
});

app.get('/editFood/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const id = req.params.id;
    connection.query('SELECT * FROM food_items WHERE id = ?', [id], (err, results) => {
        if (err || results.length === 0) return res.status(404).send('Not Found');

        res.render('editFood', {
            food: results[0],
            messages: req.flash('error') 
        });
    });
});

app.post('/editFood/:id', checkAuthenticated, checkAdmin, upload.single('image'), (req, res) => {
    const id = req.params.id;
    const { name, price, description, stall_id, currentImage } = req.body;
    const image = req.file ? req.file.filename : currentImage;

    const sql = 'UPDATE food_items SET name = ?, price = ?, description = ?, stall_id = ?, image_url = ? WHERE id = ?';
    connection.query(sql, [name, price, description, stall_id, image, id], (err) => {
        if (err) {
            req.flash('error', 'Failed to update food item.');
            return res.redirect(`/editFood/${id}`);
        }

        req.flash('success', 'Food item updated successfully!');
        res.redirect('/foodItems');
    });
});

app.get('/deleteFood/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const id = req.params.id;
    connection.query('DELETE FROM food_items WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).send('Delete error');
        res.redirect('/foodItems');
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
    const sql = 'SELECT * FROM favorites';
    // Fetch data from MySQL
    connection.query(sql, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error Retrieving favorites');
        }
    // Render HTML page with data
    res.render('favorite', {favorites: results, user: req.session.user, messages: req.flash('success')});
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
app.get('/favorite/:id', checkAuthenticated, (req, res) => {
    const id = req.params.id;
    const sql = 'SELECT * FROM favorites WHERE id = ?';

    connection.query(sql, [id], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving favorite');
        }

        if (results.length > 0) {
            res.render('favorite', {
                favorite: results[0],
                user: req.session.user
            });
        } else {
            res.status(404).send('Favorite not found');
        }
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
