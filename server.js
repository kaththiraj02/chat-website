const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Database setup
const db = new Database('chat.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    avatar TEXT DEFAULT 'default-avatar.png',
    status TEXT DEFAULT 'offline',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    read INTEGER DEFAULT 0,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    contact_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (contact_id) REFERENCES users(id)
  );
`);

const SECRET_KEY = 'your-secret-key-change-this-in-production';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Access denied' });

  try {
    const verified = jwt.verify(token, SECRET_KEY);
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid token' });
  }
};

// Routes

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user exists
    const existingUser = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const result = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run(username, email, hashedPassword);

    res.json({ message: 'User registered successfully', userId: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Update status to online
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run('online', user.id);

    // Create token
    const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY);

    res.cookie('token', token, { httpOnly: true });
    res.json({ 
      message: 'Logged in successfully', 
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email,
        avatar: user.avatar 
      } 
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Logout
app.post('/api/logout', authenticateToken, (req, res) => {
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run('offline', req.user.id);
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// Get current user
app.get('/api/user', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, username, email, avatar, status FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// Get all users (for contacts)
app.get('/api/users', authenticateToken, (req, res) => {
  const users = db.prepare('SELECT id, username, avatar, status FROM users WHERE id != ?').all(req.user.id);
  res.json(users);
});

// Get messages between two users
app.get('/api/messages/:userId', authenticateToken, (req, res) => {
  const otherUserId = req.params.userId;
  const messages = db.prepare(`
    SELECT m.*, u.username as sender_username, u.avatar as sender_avatar
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE (m.sender_id = ? AND m.receiver_id = ?) 
       OR (m.sender_id = ? AND m.receiver_id = ?)
    ORDER BY m.timestamp ASC
  `).all(req.user.id, otherUserId, otherUserId, req.user.id);
  
  res.json(messages);
});

// Send message
app.post('/api/messages', authenticateToken, (req, res) => {
  const { receiverId, message } = req.body;
  
  const result = db.prepare('INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)').run(req.user.id, receiverId, message);
  
  const newMessage = db.prepare(`
    SELECT m.*, u.username as sender_username, u.avatar as sender_avatar
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);
  
  res.json(newMessage);
});

// Socket.io for real-time messaging
const users = {}; // Store socket connections

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('user-connected', (userId) => {
    users[userId] = socket.id;
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run('online', userId);
    io.emit('user-status-change', { userId, status: 'online' });
  });

  socket.on('send-message', (data) => {
    const { senderId, receiverId, message } = data;
    
    // Save to database
    const result = db.prepare('INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)').run(senderId, receiverId, message);
    
    const newMessage = db.prepare(`
      SELECT m.*, u.username as sender_username, u.avatar as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
    `).get(result.lastInsertRowid);
    
    // Send to receiver if online
    if (users[receiverId]) {
      io.to(users[receiverId]).emit('receive-message', newMessage);
    }
    
    // Send back to sender for confirmation
    socket.emit('message-sent', newMessage);
  });

  socket.on('typing', (data) => {
    if (users[data.receiverId]) {
      io.to(users[data.receiverId]).emit('user-typing', { userId: data.senderId });
    }
  });

  socket.on('stop-typing', (data) => {
    if (users[data.receiverId]) {
      io.to(users[data.receiverId]).emit('user-stop-typing', { userId: data.senderId });
    }
  });

  socket.on('disconnect', () => {
    // Find user by socket id and update status
    for (const [userId, socketId] of Object.entries(users)) {
      if (socketId === socket.id) {
        db.prepare('UPDATE users SET status = ? WHERE id = ?').run('offline', userId);
        io.emit('user-status-change', { userId, status: 'offline' });
        delete users[userId];
        break;
      }
    }
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
