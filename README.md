# ChatApp - Real-time Messaging Website

A modern, real-time chat application similar to Instagram and Facebook messaging, built with Node.js, Express, Socket.io, and SQLite.

## Features

- 🔐 **User Authentication** - Secure login and registration with password hashing
- 💬 **Real-time Messaging** - Instant message delivery using WebSocket (Socket.io)
- 👥 **User List** - See all registered users and their online/offline status
- ⏱️ **Typing Indicators** - See when someone is typing
- 📱 **Responsive Design** - Works on desktop and mobile devices
- 💾 **Message History** - All messages are saved in the database
- 🟢 **Online Status** - Real-time online/offline status updates
- 🔍 **User Search** - Search for users in your contact list

## Technologies Used

- **Backend**: Node.js, Express.js
- **Real-time Communication**: Socket.io
- **Database**: SQLite (better-sqlite3)
- **Authentication**: JWT (JSON Web Tokens), bcryptjs
- **Frontend**: Vanilla JavaScript, HTML5, CSS3

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

### Steps

1. **Navigate to the project directory**
   ```bash
   cd chat-website
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

   For development with auto-restart:
   ```bash
   npm run dev
   ```

4. **Open your browser**
   
   Navigate to: `http://localhost:3000`

## Usage

### First Time Setup

1. **Register a new account**
   - Click "Sign Up" on the login page
   - Enter username, email, and password
   - Click "Sign Up" button

2. **Login**
   - Enter your email and password
   - Click "Log In" button

3. **Start Chatting**
   - You'll see a list of all registered users on the left sidebar
   - Click on any user to start a conversation
   - Type your message and press Enter or click the send button

### Testing with Multiple Users

To test the real-time features:

1. Open the app in multiple browser windows or different browsers
2. Register different accounts in each window
3. Login with different users
4. Send messages between them to see real-time delivery

## Project Structure

```
chat-website/
├── server.js              # Main server file with API routes and Socket.io
├── package.json           # Project dependencies and scripts
├── chat.db                # SQLite database (created automatically)
├── README.md              # This file
└── public/                # Frontend files
    ├── index.html         # Login/Register page
    ├── chat.html          # Main chat interface
    ├── styles.css         # All CSS styles
    ├── auth.js            # Authentication logic
    └── chat.js            # Chat functionality and Socket.io client
```

## API Endpoints

### Authentication
- `POST /api/register` - Register a new user
- `POST /api/login` - Login user
- `POST /api/logout` - Logout user
- `GET /api/user` - Get current user info

### Users
- `GET /api/users` - Get all users (except current user)

### Messages
- `GET /api/messages/:userId` - Get message history with a specific user
- `POST /api/messages` - Send a message (also handled via Socket.io)

## Socket.io Events

### Client to Server
- `user-connected` - User connects to chat
- `send-message` - Send a message
- `typing` - User is typing
- `stop-typing` - User stopped typing

### Server to Client
- `receive-message` - Receive a new message
- `message-sent` - Confirmation that message was sent
- `user-status-change` - User went online/offline
- `user-typing` - Another user is typing
- `user-stop-typing` - Another user stopped typing

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  avatar TEXT DEFAULT 'default-avatar.png',
  status TEXT DEFAULT 'offline',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Messages Table
```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  read INTEGER DEFAULT 0,
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (receiver_id) REFERENCES users(id)
);
```

## Security Notes

- Passwords are hashed using bcryptjs before storing
- JWT tokens are used for authentication
- Tokens are stored in HTTP-only cookies
- **Important**: Change the `SECRET_KEY` in `server.js` before deploying to production

## Customization

### Changing Colors

Edit `public/styles.css` and modify the color variables:
- Primary color: `#667eea`
- Secondary color: `#764ba2`

### Changing Port

Edit `server.js` and modify:
```javascript
const PORT = process.env.PORT || 3000;
```

## Troubleshooting

### Port already in use
If port 3000 is already in use, either:
- Stop the other application using port 3000
- Change the port in `server.js`

### Database errors
If you encounter database errors:
- Delete `chat.db` file
- Restart the server (it will create a new database)

### Socket.io connection issues
- Make sure you're accessing the app via `http://localhost:3000` not `file://`
- Check browser console for errors
- Ensure no firewall is blocking WebSocket connections

## Future Enhancements

Possible features to add:
- Group chats
- File/image sharing
- Voice/video calls
- Message reactions
- Read receipts
- User profiles with avatars
- Message search
- Push notifications
- Dark mode

## License

MIT License - feel free to use this project for learning or commercial purposes.

## Support

If you encounter any issues or have questions, please check the troubleshooting section above.
