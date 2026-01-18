// Check if user is logged in
const currentUser = JSON.parse(localStorage.getItem('user'));
if (!currentUser) {
    window.location.href = '/';
}

// Initialize Socket.io
const socket = io();

// State
let selectedUser = null;
let users = [];
let typingTimeout = null;

// DOM Elements
const currentUsername = document.getElementById('current-username');
const currentUserInitial = document.getElementById('current-user-initial');
const contactsList = document.getElementById('contacts-list');
const messagesContainer = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const emptyState = document.getElementById('empty-state');
const chatHeader = document.getElementById('chat-header');
const messagesDiv = document.getElementById('messages-container');
const messageInputContainer = document.getElementById('message-input-container');
const typingIndicator = document.getElementById('typing-indicator');
const logoutBtn = document.getElementById('logout-btn');
const searchInput = document.getElementById('search-users');

// Initialize
currentUsername.textContent = currentUser.username;
currentUserInitial.textContent = currentUser.username.charAt(0).toUpperCase();

// Connect to socket
socket.emit('user-connected', currentUser.id);

// Load users
loadUsers();

async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        users = await response.json();
        renderUsers(users);
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function renderUsers(usersToRender) {
    contactsList.innerHTML = '';
    
    if (usersToRender.length === 0) {
        contactsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #65676b;">No users found</div>';
        return;
    }
    
    usersToRender.forEach(user => {
        const contactItem = document.createElement('div');
        contactItem.className = 'contact-item';
        if (selectedUser && selectedUser.id === user.id) {
            contactItem.classList.add('active');
        }
        
        contactItem.innerHTML = `
            <div class="avatar">
                <span>${user.username.charAt(0).toUpperCase()}</span>
            </div>
            <div class="contact-info">
                <h4>${user.username}</h4>
                <span class="status ${user.status}">${user.status}</span>
            </div>
        `;
        
        contactItem.addEventListener('click', () => selectUser(user));
        contactsList.appendChild(contactItem);
    });
}

async function selectUser(user) {
    selectedUser = user;
    
    // Update UI
    emptyState.style.display = 'none';
    chatHeader.style.display = 'block';
    messagesDiv.style.display = 'block';
    messageInputContainer.style.display = 'block';
    
    // Update chat header
    document.getElementById('chat-username').textContent = user.username;
    document.getElementById('chat-user-initial').textContent = user.username.charAt(0).toUpperCase();
    document.getElementById('chat-user-status').textContent = user.status;
    document.getElementById('chat-user-status').className = `status ${user.status}`;
    
    // Update active contact
    document.querySelectorAll('.contact-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    
    // Load messages
    await loadMessages(user.id);
}

async function loadMessages(userId) {
    try {
        const response = await fetch(`/api/messages/${userId}`);
        const messages = await response.json();
        
        messagesContainer.innerHTML = '';
        
        messages.forEach(message => {
            displayMessage(message);
        });
        
        scrollToBottom();
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

function displayMessage(message) {
    const messageDiv = document.createElement('div');
    const isSent = message.sender_id === currentUser.id;
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    
    const time = new Date(message.timestamp).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit' 
    });
    
    messageDiv.innerHTML = `
        <div class="message-avatar">
            <span>${message.sender_username.charAt(0).toUpperCase()}</span>
        </div>
        <div class="message-content">
            <div class="message-text">${escapeHtml(message.message)}</div>
            <div class="message-time">${time}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Send message
messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!selectedUser || !messageInput.value.trim()) return;
    
    const message = messageInput.value.trim();
    messageInput.value = '';
    
    // Send via socket for real-time delivery
    socket.emit('send-message', {
        senderId: currentUser.id,
        receiverId: selectedUser.id,
        message: message
    });
});

// Socket events
socket.on('receive-message', (message) => {
    if (selectedUser && message.sender_id === selectedUser.id) {
        displayMessage(message);
        scrollToBottom();
    }
});

socket.on('message-sent', (message) => {
    displayMessage(message);
    scrollToBottom();
});

socket.on('user-status-change', ({ userId, status }) => {
    // Update user status in list
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
        users[userIndex].status = status;
        renderUsers(users);
    }
    
    // Update chat header if this is the selected user
    if (selectedUser && selectedUser.id === userId) {
        selectedUser.status = status;
        document.getElementById('chat-user-status').textContent = status;
        document.getElementById('chat-user-status').className = `status ${status}`;
    }
});

socket.on('user-typing', ({ userId }) => {
    if (selectedUser && userId === selectedUser.id) {
        typingIndicator.style.display = 'block';
    }
});

socket.on('user-stop-typing', ({ userId }) => {
    if (selectedUser && userId === selectedUser.id) {
        typingIndicator.style.display = 'none';
    }
});

// Typing indicator
messageInput.addEventListener('input', () => {
    if (!selectedUser) return;
    
    socket.emit('typing', {
        senderId: currentUser.id,
        receiverId: selectedUser.id
    });
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop-typing', {
            senderId: currentUser.id,
            receiverId: selectedUser.id
        });
    }, 1000);
});

// Search users
searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredUsers = users.filter(user => 
        user.username.toLowerCase().includes(searchTerm)
    );
    renderUsers(filteredUsers);
});

// Logout
logoutBtn.addEventListener('click', async () => {
    try {
        await fetch('/api/logout', { method: 'POST' });
        localStorage.removeItem('user');
        window.location.href = '/';
    } catch (error) {
        console.error('Error logging out:', error);
    }
});
