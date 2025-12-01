/**
 * Test Web Application for AgentQA Testing
 * A comprehensive demo app with authentication, forms, CRUD operations
 */

const express = require('express');
const session = require('express-session');

const app = express();
const PORT = 4000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'agentqa-test-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// In-memory database
const db = {
  users: [
    { id: 1, email: 'admin@test.com', password: 'admin123', name: 'Admin User', role: 'admin' },
    { id: 2, email: 'user@test.com', password: 'user123', name: 'Regular User', role: 'user' },
    { id: 3, email: 'guest@test.com', password: 'guest123', name: 'Guest User', role: 'guest' }
  ],
  products: [
    { id: 1, name: 'Laptop Pro', price: 1299.99, category: 'Electronics', stock: 50, description: 'High-performance laptop' },
    { id: 2, name: 'Wireless Mouse', price: 49.99, category: 'Electronics', stock: 200, description: 'Ergonomic wireless mouse' },
    { id: 3, name: 'Office Chair', price: 299.99, category: 'Furniture', stock: 30, description: 'Comfortable office chair' }
  ],
  orders: [],
  nextUserId: 4,
  nextProductId: 4,
  nextOrderId: 1
};

// Auth middleware
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send(getErrorPage('Access Denied', 'You do not have permission to access this page.'));
  }
  next();
};

// HTML Templates
const getHeader = (title, user = null) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - TestApp</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; }
    .navbar { background: #2563eb; color: white; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
    .navbar a { color: white; text-decoration: none; margin-left: 1.5rem; }
    .navbar a:hover { text-decoration: underline; }
    .container { max-width: 1200px; margin: 2rem auto; padding: 0 1rem; }
    .card { background: white; border-radius: 8px; padding: 2rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 1.5rem; }
    .form-group { margin-bottom: 1rem; }
    .form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; color: #374151; }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: 1rem;
    }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
      outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
    }
    .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-danger { background: #dc2626; color: white; }
    .btn-danger:hover { background: #b91c1c; }
    .btn-secondary { background: #6b7280; color: white; }
    .btn-success { background: #059669; color: white; }
    .alert { padding: 1rem; border-radius: 4px; margin-bottom: 1rem; }
    .alert-success { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
    .alert-error { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
    .alert-warning { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .stat-card { background: white; padding: 1.5rem; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .stat-value { font-size: 2.5rem; font-weight: 700; color: #2563eb; }
    .stat-label { color: #6b7280; margin-top: 0.5rem; }
    .error-text { color: #dc2626; font-size: 0.875rem; margin-top: 0.25rem; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    @media (max-width: 640px) { .grid-2 { grid-template-columns: 1fr; } }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge-admin { background: #fef3c7; color: #92400e; }
    .badge-user { background: #dbeafe; color: #1e40af; }
    .badge-guest { background: #f3f4f6; color: #374151; }
  </style>
</head>
<body>
  <nav class="navbar">
    <div><strong>TestApp</strong></div>
    <div>
      ${user ? `
        <a href="/dashboard">Dashboard</a>
        <a href="/products">Products</a>
        ${user.role === 'admin' ? '<a href="/admin">Admin</a>' : ''}
        <a href="/profile">Profile</a>
        <a href="/logout">Logout (${user.name})</a>
      ` : `
        <a href="/login">Login</a>
        <a href="/register">Register</a>
      `}
    </div>
  </nav>
  <div class="container">
`;

const getFooter = () => `
  </div>
</body>
</html>
`;

const getErrorPage = (title, message) => `
${getHeader(title)}
  <div class="card">
    <h1 style="color: #dc2626;">${title}</h1>
    <p style="margin-top: 1rem;">${message}</p>
    <a href="/" class="btn btn-primary" style="display: inline-block; margin-top: 1rem;">Go Home</a>
  </div>
${getFooter()}
`;

// Routes

// Home
app.get('/', (req, res) => {
  res.send(`
${getHeader('Home', req.session.user)}
    <div class="card">
      <h1>Welcome to TestApp</h1>
      <p style="margin-top: 1rem; color: #6b7280;">
        A comprehensive test application for AgentQA testing platform.
      </p>
      <div style="margin-top: 2rem;">
        ${req.session.user ? `
          <a href="/dashboard" class="btn btn-primary">Go to Dashboard</a>
        ` : `
          <a href="/login" class="btn btn-primary">Login</a>
          <a href="/register" class="btn btn-secondary" style="margin-left: 1rem;">Register</a>
        `}
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${db.products.length}</div>
        <div class="stat-label">Products</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${db.users.length}</div>
        <div class="stat-label">Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${db.orders.length}</div>
        <div class="stat-label">Orders</div>
      </div>
    </div>
${getFooter()}
  `);
});

// Login
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  const error = req.query.error;
  res.send(`
${getHeader('Login')}
    <div class="card" style="max-width: 400px; margin: 2rem auto;">
      <h2>Login</h2>
      ${error ? `<div class="alert alert-error" id="error-message">${error}</div>` : ''}
      <form action="/login" method="POST" id="login-form">
        <div class="form-group">
          <label for="email">Email Address</label>
          <input type="email" id="email" name="email" required placeholder="Enter your email" />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" required minlength="6" placeholder="Enter your password" />
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Login</button>
      </form>
      <p style="margin-top: 1rem; text-align: center; color: #6b7280;">
        Don't have an account? <a href="/register">Register here</a>
      </p>
    </div>
${getFooter()}
  `);
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.redirect('/login?error=Email and password are required');
  }

  const user = db.users.find(u => u.email === email && u.password === password);

  if (!user) {
    return res.redirect('/login?error=Invalid email or password');
  }

  req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  res.redirect('/dashboard');
});

// Register
app.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  const error = req.query.error;
  res.send(`
${getHeader('Register')}
    <div class="card" style="max-width: 500px; margin: 2rem auto;">
      <h2>Create Account</h2>
      ${error ? `<div class="alert alert-error" id="error-message">${error}</div>` : ''}
      <form action="/register" method="POST" id="register-form">
        <div class="form-group">
          <label for="name">Full Name</label>
          <input type="text" id="name" name="name" required minlength="2" maxlength="50" placeholder="Enter your full name" />
        </div>
        <div class="form-group">
          <label for="email">Email Address</label>
          <input type="email" id="email" name="email" required placeholder="Enter your email" />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" required minlength="6" maxlength="20" placeholder="Min 6 characters" />
        </div>
        <div class="form-group">
          <label for="confirm_password">Confirm Password</label>
          <input type="password" id="confirm_password" name="confirm_password" required placeholder="Confirm your password" />
        </div>
        <div class="form-group">
          <label for="phone">Phone Number (optional)</label>
          <input type="tel" id="phone" name="phone" pattern="[0-9]{10}" placeholder="10 digit phone number" />
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" name="terms" required /> I agree to the Terms of Service
          </label>
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Create Account</button>
      </form>
      <p style="margin-top: 1rem; text-align: center; color: #6b7280;">
        Already have an account? <a href="/login">Login here</a>
      </p>
    </div>
${getFooter()}
  `);
});

app.post('/register', (req, res) => {
  const { name, email, password, confirm_password, terms } = req.body;

  // Validation
  if (!name || !email || !password) {
    return res.redirect('/register?error=All fields are required');
  }

  if (name.length < 2 || name.length > 50) {
    return res.redirect('/register?error=Name must be between 2 and 50 characters');
  }

  if (password.length < 6) {
    return res.redirect('/register?error=Password must be at least 6 characters');
  }

  if (password !== confirm_password) {
    return res.redirect('/register?error=Passwords do not match');
  }

  if (db.users.find(u => u.email === email)) {
    return res.redirect('/register?error=Email already exists');
  }

  if (!terms) {
    return res.redirect('/register?error=You must agree to the Terms of Service');
  }

  const newUser = {
    id: db.nextUserId++,
    email,
    password,
    name,
    role: 'user'
  };

  db.users.push(newUser);
  req.session.user = { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role };
  res.redirect('/dashboard?success=Account created successfully');
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Dashboard
app.get('/dashboard', requireAuth, (req, res) => {
  const success = req.query.success;
  const userOrders = db.orders.filter(o => o.userId === req.session.user.id);

  res.send(`
${getHeader('Dashboard', req.session.user)}
    ${success ? `<div class="alert alert-success">${success}</div>` : ''}
    <h1>Dashboard</h1>
    <p style="color: #6b7280; margin-bottom: 2rem;">Welcome back, ${req.session.user.name}!</p>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${userOrders.length}</div>
        <div class="stat-label">My Orders</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">$${userOrders.reduce((sum, o) => sum + o.total, 0).toFixed(2)}</div>
        <div class="stat-label">Total Spent</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${db.products.length}</div>
        <div class="stat-label">Products Available</div>
      </div>
    </div>

    <div class="card" style="margin-top: 2rem;">
      <h3>Recent Orders</h3>
      ${userOrders.length > 0 ? `
        <table style="margin-top: 1rem;">
          <thead>
            <tr><th>Order ID</th><th>Product</th><th>Quantity</th><th>Total</th><th>Date</th></tr>
          </thead>
          <tbody>
            ${userOrders.slice(-5).map(o => `
              <tr>
                <td>#${o.id}</td>
                <td>${o.productName}</td>
                <td>${o.quantity}</td>
                <td>$${o.total.toFixed(2)}</td>
                <td>${new Date(o.date).toLocaleDateString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p style="color: #6b7280; margin-top: 1rem;">No orders yet. <a href="/products">Browse products</a></p>'}
    </div>
${getFooter()}
  `);
});

// Products
app.get('/products', requireAuth, (req, res) => {
  const success = req.query.success;
  const search = req.query.search || '';
  const category = req.query.category || '';

  let filteredProducts = db.products;

  if (search) {
    filteredProducts = filteredProducts.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase())
    );
  }

  if (category) {
    filteredProducts = filteredProducts.filter(p => p.category === category);
  }

  const categories = [...new Set(db.products.map(p => p.category))];

  res.send(`
${getHeader('Products', req.session.user)}
    ${success ? `<div class="alert alert-success">${success}</div>` : ''}
    <h1>Products</h1>

    <div class="card">
      <form method="GET" action="/products" style="display: flex; gap: 1rem; flex-wrap: wrap;">
        <div class="form-group" style="flex: 1; min-width: 200px; margin-bottom: 0;">
          <input type="text" name="search" value="${search}" placeholder="Search products..." />
        </div>
        <div class="form-group" style="min-width: 150px; margin-bottom: 0;">
          <select name="category">
            <option value="">All Categories</option>
            ${categories.map(c => `<option value="${c}" ${category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <button type="submit" class="btn btn-primary">Search</button>
      </form>
    </div>

    <div class="card">
      ${filteredProducts.length > 0 ? `
        <table>
          <thead>
            <tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Action</th></tr>
          </thead>
          <tbody>
            ${filteredProducts.map(p => `
              <tr>
                <td><strong>${p.name}</strong><br><small style="color: #6b7280;">${p.description}</small></td>
                <td>${p.category}</td>
                <td>$${p.price.toFixed(2)}</td>
                <td>${p.stock > 0 ? `<span style="color: #059669;">${p.stock} in stock</span>` : '<span style="color: #dc2626;">Out of stock</span>'}</td>
                <td>
                  ${p.stock > 0 ? `<a href="/order/${p.id}" class="btn btn-primary" style="padding: 0.5rem 1rem;">Order</a>` : '<span style="color: #6b7280;">Unavailable</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p style="color: #6b7280;">No products found.</p>'}
    </div>
${getFooter()}
  `);
});

// Order Form
app.get('/order/:id', requireAuth, (req, res) => {
  const product = db.products.find(p => p.id === parseInt(req.params.id));

  if (!product) {
    return res.status(404).send(getErrorPage('Product Not Found', 'The requested product does not exist.'));
  }

  if (product.stock <= 0) {
    return res.redirect('/products?error=Product is out of stock');
  }

  const error = req.query.error;

  res.send(`
${getHeader('Order ' + product.name, req.session.user)}
    <div class="card" style="max-width: 500px; margin: 2rem auto;">
      <h2>Order: ${product.name}</h2>
      <p style="color: #6b7280; margin-bottom: 1rem;">${product.description}</p>
      ${error ? `<div class="alert alert-error">${error}</div>` : ''}

      <div style="background: #f9fafb; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
        <p><strong>Price:</strong> $${product.price.toFixed(2)}</p>
        <p><strong>Available Stock:</strong> ${product.stock}</p>
      </div>

      <form action="/order/${product.id}" method="POST" id="order-form">
        <div class="form-group">
          <label for="quantity">Quantity</label>
          <input type="number" id="quantity" name="quantity" min="1" max="${product.stock}" value="1" required />
        </div>
        <div class="form-group">
          <label for="shipping_address">Shipping Address</label>
          <textarea id="shipping_address" name="shipping_address" rows="3" required minlength="10" maxlength="200" placeholder="Enter your full shipping address"></textarea>
        </div>
        <div class="form-group">
          <label for="notes">Order Notes (optional)</label>
          <textarea id="notes" name="notes" rows="2" maxlength="500" placeholder="Any special instructions?"></textarea>
        </div>

        <div style="background: #dbeafe; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
          <p><strong>Total:</strong> <span id="total">$${product.price.toFixed(2)}</span></p>
        </div>

        <button type="submit" class="btn btn-success" style="width: 100%;">Place Order</button>
      </form>

      <script>
        document.getElementById('quantity').addEventListener('change', function() {
          const total = (${product.price} * this.value).toFixed(2);
          document.getElementById('total').textContent = '$' + total;
        });
      </script>
    </div>
${getFooter()}
  `);
});

app.post('/order/:id', requireAuth, (req, res) => {
  const product = db.products.find(p => p.id === parseInt(req.params.id));

  if (!product) {
    return res.status(404).send(getErrorPage('Product Not Found', 'The requested product does not exist.'));
  }

  const { quantity, shipping_address, notes } = req.body;
  const qty = parseInt(quantity);

  if (!qty || qty < 1) {
    return res.redirect(`/order/${product.id}?error=Quantity must be at least 1`);
  }

  if (qty > product.stock) {
    return res.redirect(`/order/${product.id}?error=Not enough stock available`);
  }

  if (!shipping_address || shipping_address.length < 10) {
    return res.redirect(`/order/${product.id}?error=Shipping address must be at least 10 characters`);
  }

  // Create order
  const order = {
    id: db.nextOrderId++,
    userId: req.session.user.id,
    productId: product.id,
    productName: product.name,
    quantity: qty,
    total: product.price * qty,
    shippingAddress: shipping_address,
    notes: notes || '',
    date: new Date().toISOString(),
    status: 'pending'
  };

  db.orders.push(order);
  product.stock -= qty;

  res.redirect('/dashboard?success=Order placed successfully!');
});

// Profile
app.get('/profile', requireAuth, (req, res) => {
  const user = db.users.find(u => u.id === req.session.user.id);
  const success = req.query.success;
  const error = req.query.error;

  res.send(`
${getHeader('Profile', req.session.user)}
    <h1>My Profile</h1>
    ${success ? `<div class="alert alert-success">${success}</div>` : ''}
    ${error ? `<div class="alert alert-error">${error}</div>` : ''}

    <div class="grid-2">
      <div class="card">
        <h3>Profile Information</h3>
        <form action="/profile" method="POST">
          <div class="form-group">
            <label for="name">Full Name</label>
            <input type="text" id="name" name="name" value="${user.name}" required minlength="2" maxlength="50" />
          </div>
          <div class="form-group">
            <label for="email">Email Address</label>
            <input type="email" id="email" name="email" value="${user.email}" required />
          </div>
          <button type="submit" class="btn btn-primary">Update Profile</button>
        </form>
      </div>

      <div class="card">
        <h3>Change Password</h3>
        <form action="/profile/password" method="POST">
          <div class="form-group">
            <label for="current_password">Current Password</label>
            <input type="password" id="current_password" name="current_password" required />
          </div>
          <div class="form-group">
            <label for="new_password">New Password</label>
            <input type="password" id="new_password" name="new_password" required minlength="6" />
          </div>
          <div class="form-group">
            <label for="confirm_new_password">Confirm New Password</label>
            <input type="password" id="confirm_new_password" name="confirm_new_password" required />
          </div>
          <button type="submit" class="btn btn-primary">Change Password</button>
        </form>
      </div>
    </div>

    <div class="card" style="margin-top: 1rem;">
      <h3>Account Details</h3>
      <p><strong>Role:</strong> <span class="badge badge-${user.role}">${user.role}</span></p>
      <p><strong>User ID:</strong> ${user.id}</p>
    </div>
${getFooter()}
  `);
});

app.post('/profile', requireAuth, (req, res) => {
  const { name, email } = req.body;
  const user = db.users.find(u => u.id === req.session.user.id);

  if (!name || name.length < 2) {
    return res.redirect('/profile?error=Name must be at least 2 characters');
  }

  if (!email || !email.includes('@')) {
    return res.redirect('/profile?error=Valid email is required');
  }

  // Check if email is taken by another user
  const existingUser = db.users.find(u => u.email === email && u.id !== user.id);
  if (existingUser) {
    return res.redirect('/profile?error=Email already in use');
  }

  user.name = name;
  user.email = email;
  req.session.user.name = name;
  req.session.user.email = email;

  res.redirect('/profile?success=Profile updated successfully');
});

app.post('/profile/password', requireAuth, (req, res) => {
  const { current_password, new_password, confirm_new_password } = req.body;
  const user = db.users.find(u => u.id === req.session.user.id);

  if (user.password !== current_password) {
    return res.redirect('/profile?error=Current password is incorrect');
  }

  if (new_password.length < 6) {
    return res.redirect('/profile?error=New password must be at least 6 characters');
  }

  if (new_password !== confirm_new_password) {
    return res.redirect('/profile?error=New passwords do not match');
  }

  user.password = new_password;
  res.redirect('/profile?success=Password changed successfully');
});

// Admin Panel
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  res.send(`
${getHeader('Admin Panel', req.session.user)}
    <h1>Admin Panel</h1>
    <p style="color: #6b7280; margin-bottom: 2rem;">Manage users, products, and orders.</p>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${db.users.length}</div>
        <div class="stat-label">Total Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${db.products.length}</div>
        <div class="stat-label">Total Products</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${db.orders.length}</div>
        <div class="stat-label">Total Orders</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">$${db.orders.reduce((sum, o) => sum + o.total, 0).toFixed(2)}</div>
        <div class="stat-label">Total Revenue</div>
      </div>
    </div>

    <div class="grid-2" style="margin-top: 2rem;">
      <a href="/admin/users" class="card" style="text-decoration: none; color: inherit;">
        <h3>Manage Users</h3>
        <p style="color: #6b7280;">View, edit, and delete users</p>
      </a>
      <a href="/admin/products" class="card" style="text-decoration: none; color: inherit;">
        <h3>Manage Products</h3>
        <p style="color: #6b7280;">Add, edit, and delete products</p>
      </a>
    </div>

    <div class="card" style="margin-top: 1rem;">
      <h3>Recent Orders</h3>
      ${db.orders.length > 0 ? `
        <table style="margin-top: 1rem;">
          <thead>
            <tr><th>Order ID</th><th>User</th><th>Product</th><th>Total</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${db.orders.slice(-10).reverse().map(o => {
              const user = db.users.find(u => u.id === o.userId);
              return `
                <tr>
                  <td>#${o.id}</td>
                  <td>${user ? user.name : 'Unknown'}</td>
                  <td>${o.productName}</td>
                  <td>$${o.total.toFixed(2)}</td>
                  <td><span class="badge badge-${o.status === 'pending' ? 'user' : 'admin'}">${o.status}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      ` : '<p style="color: #6b7280; margin-top: 1rem;">No orders yet.</p>'}
    </div>
${getFooter()}
  `);
});

// Admin Users
app.get('/admin/users', requireAuth, requireAdmin, (req, res) => {
  const success = req.query.success;

  res.send(`
${getHeader('Manage Users', req.session.user)}
    <h1>Manage Users</h1>
    ${success ? `<div class="alert alert-success">${success}</div>` : ''}

    <div class="card">
      <table>
        <thead>
          <tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${db.users.map(u => `
            <tr>
              <td>${u.id}</td>
              <td>${u.name}</td>
              <td>${u.email}</td>
              <td><span class="badge badge-${u.role}">${u.role}</span></td>
              <td>
                ${u.id !== req.session.user.id ? `
                  <form action="/admin/users/${u.id}/delete" method="POST" style="display: inline;" onsubmit="return confirm('Delete this user?')">
                    <button type="submit" class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.875rem;">Delete</button>
                  </form>
                ` : '<span style="color: #6b7280;">Current user</span>'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <a href="/admin" class="btn btn-secondary" style="margin-top: 1rem;">Back to Admin</a>
${getFooter()}
  `);
});

app.post('/admin/users/:id/delete', requireAuth, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id);

  if (userId === req.session.user.id) {
    return res.redirect('/admin/users?error=Cannot delete yourself');
  }

  const index = db.users.findIndex(u => u.id === userId);
  if (index !== -1) {
    db.users.splice(index, 1);
  }

  res.redirect('/admin/users?success=User deleted successfully');
});

// Admin Products
app.get('/admin/products', requireAuth, requireAdmin, (req, res) => {
  const success = req.query.success;
  const error = req.query.error;

  res.send(`
${getHeader('Manage Products', req.session.user)}
    <h1>Manage Products</h1>
    ${success ? `<div class="alert alert-success">${success}</div>` : ''}
    ${error ? `<div class="alert alert-error">${error}</div>` : ''}

    <div class="card">
      <h3>Add New Product</h3>
      <form action="/admin/products" method="POST">
        <div class="grid-2">
          <div class="form-group">
            <label for="name">Product Name</label>
            <input type="text" id="name" name="name" required minlength="2" maxlength="100" />
          </div>
          <div class="form-group">
            <label for="category">Category</label>
            <input type="text" id="category" name="category" required />
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label for="price">Price ($)</label>
            <input type="number" id="price" name="price" min="0.01" step="0.01" required />
          </div>
          <div class="form-group">
            <label for="stock">Stock</label>
            <input type="number" id="stock" name="stock" min="0" required />
          </div>
        </div>
        <div class="form-group">
          <label for="description">Description</label>
          <textarea id="description" name="description" rows="2" maxlength="500"></textarea>
        </div>
        <button type="submit" class="btn btn-success">Add Product</button>
      </form>
    </div>

    <div class="card" style="margin-top: 1rem;">
      <h3>All Products</h3>
      <table style="margin-top: 1rem;">
        <thead>
          <tr><th>ID</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${db.products.map(p => `
            <tr>
              <td>${p.id}</td>
              <td>${p.name}</td>
              <td>${p.category}</td>
              <td>$${p.price.toFixed(2)}</td>
              <td>${p.stock}</td>
              <td>
                <form action="/admin/products/${p.id}/delete" method="POST" style="display: inline;" onsubmit="return confirm('Delete this product?')">
                  <button type="submit" class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.875rem;">Delete</button>
                </form>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <a href="/admin" class="btn btn-secondary" style="margin-top: 1rem;">Back to Admin</a>
${getFooter()}
  `);
});

app.post('/admin/products', requireAuth, requireAdmin, (req, res) => {
  const { name, category, price, stock, description } = req.body;

  if (!name || name.length < 2) {
    return res.redirect('/admin/products?error=Product name must be at least 2 characters');
  }

  if (!price || parseFloat(price) <= 0) {
    return res.redirect('/admin/products?error=Price must be greater than 0');
  }

  const newProduct = {
    id: db.nextProductId++,
    name,
    category: category || 'Uncategorized',
    price: parseFloat(price),
    stock: parseInt(stock) || 0,
    description: description || ''
  };

  db.products.push(newProduct);
  res.redirect('/admin/products?success=Product added successfully');
});

app.post('/admin/products/:id/delete', requireAuth, requireAdmin, (req, res) => {
  const productId = parseInt(req.params.id);
  const index = db.products.findIndex(p => p.id === productId);

  if (index !== -1) {
    db.products.splice(index, 1);
  }

  res.redirect('/admin/products?success=Product deleted successfully');
});

// 404 handler
app.use((req, res) => {
  res.status(404).send(getErrorPage('Page Not Found', 'The page you are looking for does not exist.'));
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   TestApp is running!                                         ║
║                                                               ║
║   URL: http://localhost:${PORT}                                   ║
║                                                               ║
║   Test Credentials:                                           ║
║   Admin: admin@test.com / admin123                            ║
║   User:  user@test.com  / user123                             ║
║   Guest: guest@test.com / guest123                            ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
