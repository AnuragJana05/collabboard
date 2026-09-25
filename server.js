const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const roomManager = require('./utils/roomManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Set up EJS view engine
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), 'public')));

// HTML escaping helper to prevent XSS
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ----------------------------------------------------
// HTTP ROUTES
// ----------------------------------------------------

/**
 * Landing page
 */
app.get('/', (req, res) => {
  const error = req.query.error || null;
  const invalidRoomId = req.query.roomId ? escapeHtml(req.query.roomId) : '';
  res.render('index', { error, invalidRoomId });
});

/**
 * Create Room endpoint
 */
app.post('/create-room', (req, res) => {
  const rawNickname = req.body.nickname || '';
  const nickname = rawNickname.trim().slice(0, 25) || 'Anonymous';
  
  const room = roomManager.createRoom();

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({ success: true, roomId: room.id, nickname });
  }

  res.redirect(`/room/${room.id}?nickname=${encodeURIComponent(nickname)}`);
});

/**
 * Check if a room exists API
 */
app.get('/api/rooms/:roomId/exists', (req, res) => {
  const roomId = req.params.roomId;
  const exists = roomManager.roomExists(roomId);
  res.json({ exists, roomId: roomId.toUpperCase() });
});

/**
 * Join Room POST handler
 */
app.post('/join-room', (req, res) => {
  const rawRoomId = (req.body.roomId || '').trim().toUpperCase();
  const rawNickname = (req.body.nickname || '').trim().slice(0, 25) || 'Anonymous';

  if (!rawRoomId) {
    return res.redirect('/?error=empty_room_id');
  }

  if (!roomManager.roomExists(rawRoomId)) {
    return res.redirect(`/?error=room_not_found&roomId=${encodeURIComponent(rawRoomId)}`);
  }

  res.redirect(`/room/${rawRoomId}?nickname=${encodeURIComponent(rawNickname)}`);
});

/**
 * Room page
 */
app.get('/room/:roomId', (req, res) => {
  const roomId = (req.params.roomId || '').trim().toUpperCase();

  // Validate room ID format (alphanumeric, 3 to 16 chars)
  if (!/^[A-Z0-9_-]{3,16}$/.test(roomId)) {
    return res.redirect('/?error=invalid_room_id');
  }

  // Check if room exists in memory
  if (!roomManager.roomExists(roomId)) {
    return res.redirect(`/?error=room_not_found&roomId=${encodeURIComponent(roomId)}`);
  }

  const rawNickname = req.query.nickname || '';
  const nickname = escapeHtml(rawNickname.trim().slice(0, 25));

  res.render('room', {
    roomId,
    nickname
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('index', {
    error: 'page_not_found',
    invalidRoomId: ''
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).render('index', {
    error: 'server_error',
    invalidRoomId: ''
  });
});

// ----------------------------------------------------
// SOCKET.IO REAL-TIME HANDLING
// ----------------------------------------------------

io.on('connection', (socket) => {
  // Join Room
  socket.on('join-room', ({ roomId, username }) => {
    const cleanRoomId = (roomId || '').trim().toUpperCase();
    const cleanUsername = (username || '').trim().slice(0, 25) || 'Guest';

    if (!cleanRoomId || !roomManager.roomExists(cleanRoomId)) {
      socket.emit('room-error', {
        message: 'Room does not exist or has expired. Please return to the home page.'
      });
      return;
    }

    const user = roomManager.addUserToRoom(cleanRoomId, socket.id, cleanUsername);
    if (!user) {
      socket.emit('room-error', { message: 'Failed to join room.' });
      return;
    }

    // Bind room & user to socket instance
    socket.roomId = cleanRoomId;
    socket.user = user;

    // Join Socket.io room channel
    socket.join(cleanRoomId);

    // 1. Send current user info back to the joining client
    socket.emit('user-info', {
      socketId: user.socketId,
      username: user.username,
      color: user.color,
      roomId: cleanRoomId
    });

    // 2. Send complete initial whiteboard state to newly joined client
    const currentDrawingData = roomManager.getDrawingData(cleanRoomId);
    socket.emit('initial-board-state', currentDrawingData);

    // 3. Send existing chat history
    const chatHistory = roomManager.getChatMessages(cleanRoomId);
    socket.emit('chat-history', chatHistory);

    // 4. Broadcast system message to all participants in room
    const joinMsg = roomManager.addChatMessage(cleanRoomId, {
      username: 'System',
      message: `${user.username} joined the room`,
      isSystem: true,
      timestamp: Date.now()
    });
    io.to(cleanRoomId).emit('chat-message', joinMsg);

    // 5. Notify others that a user joined
    socket.to(cleanRoomId).emit('user-joined', {
      username: user.username,
      color: user.color
    });

    // 6. Broadcast updated participants list and count to everyone in the room
    const participants = roomManager.getUsersInRoom(cleanRoomId);
    io.to(cleanRoomId).emit('participants-update', {
      participants,
      count: participants.length
    });
  });

  // Whiteboard drawing event
  socket.on('draw', (data) => {
    if (!socket.roomId || !roomManager.roomExists(socket.roomId)) return;

    // Sanitize and validate drawing data
    if (
      typeof data !== 'object' ||
      data === null ||
      typeof data.x !== 'number' ||
      typeof data.y !== 'number'
    ) {
      return;
    }

    const safeDrawData = {
      x: data.x,
      y: data.y,
      prevX: typeof data.prevX === 'number' ? data.prevX : data.x,
      prevY: typeof data.prevY === 'number' ? data.prevY : data.y,
      nx: typeof data.nx === 'number' ? data.nx : null,
      ny: typeof data.ny === 'number' ? data.ny : null,
      prevNx: typeof data.prevNx === 'number' ? data.prevNx : null,
      prevNy: typeof data.prevNy === 'number' ? data.prevNy : null,
      color: typeof data.color === 'string' ? data.color : '#ffffff',
      size: typeof data.size === 'number' && data.size > 0 && data.size <= 100 ? data.size : 4,
      tool: data.tool === 'eraser' ? 'eraser' : 'pen'
    };

    // Store in room history
    roomManager.addDrawingData(socket.roomId, safeDrawData);

    // Broadcast to other users in the same room
    socket.to(socket.roomId).emit('draw', safeDrawData);
  });

  // Clear board event
  socket.on('clear-board', () => {
    if (!socket.roomId || !roomManager.roomExists(socket.roomId)) return;

    roomManager.clearDrawingData(socket.roomId);

    // Broadcast clear event to everyone in the room (including the sender)
    io.to(socket.roomId).emit('clear-board', {
      clearedBy: socket.user ? socket.user.username : 'Someone'
    });

    // Add and broadcast system notification
    const clearMsg = roomManager.addChatMessage(socket.roomId, {
      username: 'System',
      message: `${socket.user ? socket.user.username : 'Someone'} cleared the whiteboard`,
      isSystem: true,
      timestamp: Date.now()
    });
    io.to(socket.roomId).emit('chat-message', clearMsg);
  });

  // Real-time chat message event
  socket.on('chat-message', (data) => {
    if (!socket.roomId || !roomManager.roomExists(socket.roomId)) return;
    if (!socket.user) return;

    const rawMessage = (data && typeof data.message === 'string') ? data.message : '';
    const cleanMessage = escapeHtml(rawMessage.trim()).slice(0, 500);

    if (!cleanMessage) return; // Ignore empty messages

    const chatMsg = roomManager.addChatMessage(socket.roomId, {
      socketId: socket.id,
      username: socket.user.username,
      color: socket.user.color,
      message: cleanMessage,
      isSystem: false,
      timestamp: Date.now()
    });

    if (chatMsg) {
      io.to(socket.roomId).emit('chat-message', chatMsg);
    }
  });

  // Client disconnect
  socket.on('disconnect', () => {
    if (socket.roomId) {
      const { user, remainingCount } = roomManager.removeUserFromRoom(socket.roomId, socket.id);

      if (user) {
        // Broadcast user-left notification
        socket.to(socket.roomId).emit('user-left', {
          username: user.username
        });

        // Add and broadcast system message
        const leaveMsg = roomManager.addChatMessage(socket.roomId, {
          username: 'System',
          message: `${user.username} left the room`,
          isSystem: true,
          timestamp: Date.now()
        });
        io.to(socket.roomId).emit('chat-message', leaveMsg);

        // Broadcast updated participants count and list
        const participants = roomManager.getUsersInRoom(socket.roomId);
        io.to(socket.roomId).emit('participants-update', {
          participants,
          count: remainingCount
        });
      }
    }
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(` CollabBoard server running at http://localhost:${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`===============================================`);
  });
}

module.exports = app;
module.exports.app = app;
module.exports.server = server;
module.exports.io = io;
