const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// In-memory storage (no database needed)
const users = [];
const messages = [];
let userIdCounter = 1;
let messageIdCounter = 1;

const SECRET_KEY = 'your-secret-key-change-this-in-production';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
path.join(__dirname, 'public');const authenticateToken = (req, res, next) => {
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

// Serve index.html for root path
app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user exists
    const existingUser = users.find(u => u.email === email || u.username === username);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = {
      id: userIdCounter++,
      username,
      email,
      password: hashedPassword,
      avatar: 'default-avatar.png',
      status: 'offline',
      created_at: new Date()
    };

    users.push(newUser);

    res.json({ message: 'User registered successfully', userId: newUser.id });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Update status to online
    user.status = 'online';

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
  const user = users.find(u => u.id === req.user.id);
  if (user) user.status = 'offline';
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// Get current user
app.get('/api/user', authenticateToken, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  const { password, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

// Get all users (for contacts)
app.get('/api/users', authenticateToken, (req, res) => {
  const otherUsers = users
    .filter(u => u.id !== req.user.id)
    .map(u => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      status: u.status
    }));
  res.json(otherUsers);
});

// Get messages between two users
app.get('/api/messages/:userId', authenticateToken, (req, res) => {
  const otherUserId = parseInt(req.params.userId);
  const userMessages = messages.filter(m => 
    (m.sender_id === req.user.id && m.receiver_id === otherUserId) ||
    (m.sender_id === otherUserId && m.receiver_id === req.user.id)
  );
  
  res.json(userMessages);
});

// Send message
app.post('/api/messages', authenticateToken, (req, res) => {
  const { receiverId, message } = req.body;
  
  const sender = users.find(u => u.id === req.user.id);
  
  const newMessage = {
    id: messageIdCounter++,
    sender_id: req.user.id,
    receiver_id: parseInt(receiverId),
    message,
    timestamp: new Date(),
    read: 0,
    sender_username: sender.username,
    sender_avatar: sender.avatar
  };
  
  messages.push(newMessage);
  
  res.json(newMessage);
});

// Socket.io for real-time messaging
const socketUsers = {};

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('user-connected', (userId) => {
    socketUsers[userId] = socket.id;
    const user = users.find(u => u.id === userId);
    if (user) user.status = 'online';
    io.emit('user-status-change', { userId, status: 'online' });
  });

  socket.on('send-message', (data) => {
    const { senderId, receiverId, message } = data;
    
    const sender = users.find(u => u.id === senderId);
    
    const newMessage = {
      id: messageIdCounter++,
      sender_id: senderId,
      receiver_id: receiverId,
      message,
      timestamp: new Date(),
      read: 0,
      sender_username: sender.username,
      sender_avatar: sender.avatar
    };
    
    messages.push(newMessage);
    
    // Send to receiver if online
    if (socketUsers[receiverId]) {
      io.to(socketUsers[receiverId]).emit('receive-message', newMessage);
    }
    
    // Send back to sender for confirmation
    socket.emit('message-sent', newMessage);
  });

  socket.on('typing', (data) => {
    if (socketUsers[data.receiverId]) {
      io.to(socketUsers[data.receiverId]).emit('user-typing', { userId: data.senderId });
    }
  });

  socket.on('stop-typing', (data) => {
    if (socketUsers[data.receiverId]) {
      io.to(socketUsers[data.receiverId]).emit('user-stop-typing', { userId: data.senderId });
    }
  });

  socket.on('disconnect', () => {
    for (const [userId, socketId] of Object.entries(socketUsers)) {
      if (socketId === socket.id) {
        const user = users.find(u => u.id === parseInt(userId));
        if (user) user.status = 'offline';
        io.emit('user-status-change', { userId: parseInt(userId), status: 'offline' });
        delete socketUsers[userId];
        break;
      }
    }
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  Chat Website Server Running!`);
  console.log(`========================================`);
  console.log(`  Open your browser and go to:`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`========================================\n`);
});
