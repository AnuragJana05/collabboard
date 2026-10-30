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
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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

// Sample featured scrapbook notebooks for the gallery
const FEATURED_NOTEBOOKS = [
  {
    id: 'CHILL-101',
    name: 'Chill Doodles',
    description: 'Cozy weekend sketching with tea and cats',
    participantCount: 4,
    lastEditedText: '2 hours ago',
    theme: 'pastel',
    tags: ['doodles', 'cozy', 'cats']
  },
  {
    id: 'CHAOS-88',
    name: 'Random Chaos',
    description: 'When nobody has a plan and everyone has markers',
    participantCount: 6,
    lastEditedText: '1 day ago',
    theme: 'vibrant',
    tags: ['chaos', 'monsters', 'stickers']
  },
  {
    id: 'TEAM-FUN',
    name: 'Team Brainstorm Fun',
    description: 'Design team Friday scrapbook & product ideas',
    participantCount: 5,
    lastEditedText: '3 days ago',
    theme: 'notebook',
    tags: ['work', 'ideas', 'sketches']
  },
  {
    id: 'BDAY-CARD',
    name: 'Aarav’s Birthday Card',
    description: 'Group birthday card signed by the whole gang',
    participantCount: 8,
    lastEditedText: '1 week ago',
    theme: 'celebration',
    tags: ['birthday', 'celebration', 'notes']
  }
];

/**
 * Landing page
 */
app.get('/', (req, res) => {
  const error = req.query.error || null;
  const invalidRoomId = req.query.roomId ? escapeHtml(req.query.roomId) : '';
  const currentView = req.query.view || 'home';
  res.render('index', { error, invalidRoomId, currentView });
});

/**
 * Create Room view route
 */
app.get('/create', (req, res) => {
  res.render('index', { error: null, invalidRoomId: '', currentView: 'create' });
});

/**
 * Join Room view route
 */
app.get('/join', (req, res) => {
  const prefillRoomId = req.query.roomId ? escapeHtml(req.query.roomId) : '';
  res.render('index', { error: null, invalidRoomId: prefillRoomId, currentView: 'join' });
});

/**
 * Gallery / My Notebooks page
 */
app.get(['/gallery', '/notebooks'], (req, res) => {
  const activeRooms = roomManager.getAllActiveRooms();
  res.render('gallery', { activeRooms, featuredNotebooks: FEATURED_NOTEBOOKS });
});

/**
 * About / How It Works page
 */
app.get('/about', (req, res) => {
  res.render('about', {});
});

/**
 * API: Get all active & featured notebooks
 */
app.get('/api/notebooks', (req, res) => {
  const activeRooms = roomManager.getAllActiveRooms();
  res.json({
    activeRooms,
    featuredNotebooks: FEATURED_NOTEBOOKS
  });
});

/**
 * Create Room endpoint
 */
app.post('/create-room', (req, res) => {
  const rawNickname = req.body.nickname || '';
  const nickname = rawNickname.trim().slice(0, 25) || 'Anonymous';
  const rawRoomName = req.body.roomName || '';
  const roomName = rawRoomName.trim().slice(0, 50) || 'Chill Doodles';
  const rawDesc = req.body.description || '';
  const description = rawDesc.trim().slice(0, 200);

  const room = roomManager.createRoom(null, roomName, description);

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({ success: true, roomId: room.id, roomName: room.name, nickname });
  }

  res.redirect(`/room/${room.id}?nickname=${encodeURIComponent(nickname)}`);
});

/**
 * Check if a room exists API
 */
app.get('/api/rooms/:roomId/exists', (req, res) => {
  const roomId = (req.params.roomId || '').trim().toUpperCase();
  const isValid = /^[A-Z0-9_-]{3,16}$/.test(roomId);
  const exists = roomManager.roomExists(roomId) || isValid;
  res.json({ exists, roomId });
});

/**
 * Get room info API
 */
app.get('/api/rooms/:roomId/info', (req, res) => {
  const roomId = (req.params.roomId || '').trim().toUpperCase();
  const room = roomManager.getRoom(roomId);
  if (!room) {
    return res.status(404).json({ exists: false });
  }
  res.json({
    exists: true,
    roomId: room.id,
    name: room.name,
    description: room.description,
    participantCount: room.users.size,
    strokeCount: room.drawingData.length,
    createdAt: room.createdAt
  });
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

  if (!/^[A-Z0-9_-]{3,16}$/.test(rawRoomId)) {
    return res.redirect('/?error=invalid_room_id');
  }

  if (!roomManager.roomExists(rawRoomId)) {
    roomManager.createRoom(rawRoomId, 'Chill Doodles');
  }

  res.redirect(`/room/${rawRoomId}?nickname=${encodeURIComponent(rawNickname)}`);
});

/**
 * Collaborative Drawing Workspace Room page
 */
app.get('/room/:roomId', (req, res) => {
  const roomId = (req.params.roomId || '').trim().toUpperCase();

  // Validate room ID format (alphanumeric, 3 to 16 chars)
  if (!/^[A-Z0-9_-]{3,16}$/.test(roomId)) {
    return res.redirect('/?error=invalid_room_id');
  }

  // Check if room exists in memory; auto-create if valid format so joiners never get rejected
  let room = roomManager.getRoom(roomId);
  if (!room) {
    room = roomManager.createRoom(roomId, 'Chill Doodles');
  }

  const rawNickname = req.query.nickname || '';
  const nickname = escapeHtml(rawNickname.trim().slice(0, 25));
  const roomName = escapeHtml(room.name || 'Chill Doodles');

  res.render('room', {
    roomId,
    roomName,
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

    if (!cleanRoomId) {
      socket.emit('room-error', {
        message: 'Room does not exist or has expired. Please return to the home page.'
      });
      return;
    }

    if (!roomManager.roomExists(cleanRoomId)) {
      if (/^[A-Z0-9_-]{3,16}$/.test(cleanRoomId)) {
        roomManager.createRoom(cleanRoomId, 'Chill Doodles');
      } else {
        socket.emit('room-error', {
          message: 'Room does not exist or has expired. Please return to the home page.'
        });
        return;
      }
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
    const roomObj = roomManager.getRoom(cleanRoomId);
    socket.emit('user-info', {
      socketId: user.socketId,
      username: user.username,
      color: user.color,
      roomId: cleanRoomId,
      roomName: roomObj ? roomObj.name : 'Chill Doodles'
    });

    // 1b. Send room metadata
    socket.emit('room-info', {
      roomId: cleanRoomId,
      roomName: roomObj ? roomObj.name : 'Chill Doodles',
      description: roomObj ? roomObj.description : '',
      createdAt: roomObj ? roomObj.createdAt : Date.now()
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
      tool: typeof data.tool === 'string' ? data.tool : 'pen',
      strokeId: typeof data.strokeId === 'string' ? data.strokeId : undefined,
      shape: typeof data.shape === 'string' ? data.shape : undefined,
      x2: typeof data.x2 === 'number' ? data.x2 : undefined,
      y2: typeof data.y2 === 'number' ? data.y2 : undefined,
      nx2: typeof data.nx2 === 'number' ? data.nx2 : undefined,
      ny2: typeof data.ny2 === 'number' ? data.ny2 : undefined,
      text: typeof data.text === 'string' ? data.text.slice(0, 300) : undefined,
      sticker: typeof data.sticker === 'string' ? data.sticker.slice(0, 50) : undefined,
      socketId: socket.id
    };

    // Store in room history
    roomManager.addDrawingData(socket.roomId, safeDrawData);

    // Broadcast to other users in the same room
    socket.to(socket.roomId).emit('draw', safeDrawData);
  });

  // Undo last drawing stroke
  socket.on('undo', () => {
    if (!socket.roomId || !roomManager.roomExists(socket.roomId)) return;
    const updatedHistory = roomManager.undoLastDrawing(socket.roomId, socket.id);
    if (updatedHistory) {
      io.to(socket.roomId).emit('board-state-updated', updatedHistory);
    }
  });

  // Live participant cursor position broadcast
  socket.on('cursor-move', (data) => {
    if (!socket.roomId || typeof data !== 'object' || data === null) return;
    socket.to(socket.roomId).emit('cursor-move', {
      socketId: socket.id,
      username: socket.user ? socket.user.username : 'Guest',
      color: socket.user ? socket.user.color : '#A78BFA',
      x: data.x,
      y: data.y,
      nx: data.nx,
      ny: data.ny
    });
  });

  // Cursor leaves canvas
  socket.on('cursor-leave', () => {
    if (!socket.roomId) return;
    socket.to(socket.roomId).emit('cursor-leave', {
      socketId: socket.id
    });
  });

  // Live playful reaction bursts
  socket.on('reaction', (data) => {
    if (!socket.roomId || typeof data !== 'object' || data === null) return;
    io.to(socket.roomId).emit('reaction', {
      socketId: socket.id,
      username: socket.user ? socket.user.username : 'Guest',
      emoji: (data.emoji || '✨').slice(0, 8),
      x: typeof data.x === 'number' ? data.x : 0.5,
      y: typeof data.y === 'number' ? data.y : 0.5
    });
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

  // Nickname change event
  socket.on('change-nickname', ({ username }) => {
    if (!socket.roomId || !socket.user) return;
    const cleanName = (username || '').trim().slice(0, 25);
    if (!cleanName || cleanName === socket.user.username) return;

    const oldName = socket.user.username;
    socket.user.username = cleanName;

    const room = roomManager.getRoom(socket.roomId);
    if (room && room.users.has(socket.id)) {
      room.users.get(socket.id).username = cleanName;
    }

    const renameMsg = roomManager.addChatMessage(socket.roomId, {
      username: 'System',
      message: `${oldName} changed their name to ${cleanName}`,
      isSystem: true,
      timestamp: Date.now()
    });
    io.to(socket.roomId).emit('chat-message', renameMsg);

    const participants = roomManager.getUsersInRoom(socket.roomId);
    io.to(socket.roomId).emit('participants-update', {
      participants,
      count: participants.length
    });
  });

  // Room rename event
  socket.on('rename-room', ({ roomName }) => {
    if (!socket.roomId || !roomName) return;
    const cleanName = escapeHtml(String(roomName).trim().slice(0, 50));
    if (!cleanName) return;

    roomManager.renameRoom(socket.roomId, cleanName);

    const renameMsg = roomManager.addChatMessage(socket.roomId, {
      username: 'System',
      message: `${socket.user ? socket.user.username : 'Someone'} renamed this notebook to "${cleanName}"`,
      isSystem: true,
      timestamp: Date.now()
    });
    io.to(socket.roomId).emit('chat-message', renameMsg);
    io.to(socket.roomId).emit('room-renamed', { roomName: cleanName });
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
    console.log(` Doodlebook server running at http://localhost:${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`===============================================`);
  });
}

module.exports = app;
module.exports.app = app;
module.exports.server = server;
module.exports.io = io;
