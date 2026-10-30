const crypto = require('crypto');

/**
 * In-memory room storage for CollabBoard MVP
 * Structure:
 * rooms = {
 *   [roomId]: {
 *     id: string,
 *     createdAt: number,
 *     users: Map<string, { socketId: string, username: string, color: string, joinedAt: number }>,
 *     drawingData: Array<DrawAction>,
 *     messages: Array<ChatMessage>,
 *     cleanupTimer: Timeout | null
 *   }
 * }
 */
const rooms = new Map();

// Preset distinct user avatar / stroke colors (Doodlebook pastel & vibrant stationery accents)
const USER_COLORS = [
  '#FF8066', // Coral
  '#6C9ED2', // Notebook Blue
  '#8EBB91', // Sage Green
  '#D9A7CE', // Pastel Pink
  '#F5D77A', // Butter Yellow
  '#B7A4DD', // Lavender
  '#FB923C', // Tangerine
  '#2DD4BF', // Mint/Teal
  '#F43F5E', // Rose
  '#38BDF8'  // Sky
];

/**
 * Generate a clean, readable Room ID (e.g., "7FK2A3" or 6 alphanumeric characters)
 */
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars like 0, O, 1, I
  let id = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return id;
}

/**
 * Pick a color for a new user in a room, preferring unused colors
 */
function pickUserColor(room) {
  const usedColors = new Set(Array.from(room.users.values()).map(u => u.color));
  for (const color of USER_COLORS) {
    if (!usedColors.has(color)) {
      return color;
    }
  }
  // If all colors are used, pick a pseudo-random one
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

/**
 * Create a new room
 * @param {string} [customId] - Optional custom room ID
 * @param {string} [name] - Optional room name
 * @param {string} [description] - Optional room description
 * @returns {object} The created room object
 */
function createRoom(customId = null, name = 'Chill Doodles', description = '') {
  let roomId = customId ? customId.trim().toUpperCase() : generateRoomId();

  // If auto-generated and already exists, generate until unique
  while (!customId && rooms.has(roomId)) {
    roomId = generateRoomId();
  }

  const room = {
    id: roomId,
    name: (name || 'Chill Doodles').trim().slice(0, 50),
    description: (description || '').trim().slice(0, 200),
    createdAt: Date.now(),
    users: new Map(),
    drawingData: [],
    messages: [],
    cleanupTimer: null
  };

  rooms.set(roomId, room);
  return room;
}

/**
 * Get a room by ID
 * @param {string} roomId 
 * @returns {object|null}
 */
function getRoom(roomId) {
  if (!roomId || typeof roomId !== 'string') return null;
  return rooms.get(roomId.trim().toUpperCase()) || null;
}

/**
 * Check if a room exists
 * @param {string} roomId 
 * @returns {boolean}
 */
function roomExists(roomId) {
  if (!roomId || typeof roomId !== 'string') return false;
  return rooms.has(roomId.trim().toUpperCase());
}

/**
 * Add a user to a room
 * @param {string} roomId 
 * @param {string} socketId 
 * @param {string} username 
 * @returns {object|null} The joined user object
 */
function addUserToRoom(roomId, socketId, username) {
  const room = getRoom(roomId);
  if (!room) return null;

  // Cancel any pending cleanup timer since a user is joining
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }

  const sanitizedUsername = (username || 'Anonymous').trim().slice(0, 25);
  const color = pickUserColor(room);

  const user = {
    socketId,
    username: sanitizedUsername,
    color,
    joinedAt: Date.now()
  };

  room.users.set(socketId, user);
  return user;
}

/**
 * Remove a user from a room
 * @param {string} roomId 
 * @param {string} socketId 
 * @returns {{ user: object|null, remainingCount: number }}
 */
function removeUserFromRoom(roomId, socketId) {
  const room = getRoom(roomId);
  if (!room) return { user: null, remainingCount: 0 };

  const user = room.users.get(socketId) || null;
  if (user) {
    room.users.delete(socketId);
  }

  const remainingCount = room.users.size;

  // If room is empty, schedule cleanup with a grace period (20 minutes)
  // This prevents room deletion if a user refreshes or temporarily reconnects
  if (remainingCount === 0) {
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    room.cleanupTimer = setTimeout(() => {
      // Re-verify room is still empty before deleting
      const r = rooms.get(room.id);
      if (r && r.users.size === 0) {
        rooms.delete(room.id);
      }
    }, 1200000); // 20 minutes
  }

  return { user, remainingCount };
}

/**
 * Get list of safe user info for a room
 * @param {string} roomId 
 * @returns {Array<{ socketId: string, username: string, color: string }>}
 */
function getUsersInRoom(roomId) {
  const room = getRoom(roomId);
  if (!room) return [];

  return Array.from(room.users.values()).map(u => ({
    socketId: u.socketId,
    username: u.username,
    color: u.color
  }));
}

/**
 * Add a drawing action to room history
 * @param {string} roomId 
 * @param {object} drawAction 
 */
function addDrawingData(roomId, drawAction) {
  const room = getRoom(roomId);
  if (!room) return false;

  // Basic validation of draw action
  if (!drawAction || typeof drawAction !== 'object') return false;

  room.drawingData.push(drawAction);

  // Safety cap to prevent memory exhaustion in very long sessions (e.g. 50,000 strokes)
  if (room.drawingData.length > 50000) {
    room.drawingData.splice(0, 5000);
  }

  return true;
}

/**
 * Get all drawing data for a room
 * @param {string} roomId 
 * @returns {Array}
 */
function getDrawingData(roomId) {
  const room = getRoom(roomId);
  return room ? room.drawingData : [];
}

/**
 * Clear all drawing data for a room
 * @param {string} roomId 
 */
function clearDrawingData(roomId) {
  const room = getRoom(roomId);
  if (!room) return false;
  room.drawingData = [];
  return true;
}

/**
 * Undo last drawing stroke in room (by strokeId or last item)
 * @param {string} roomId
 * @param {string} [socketId]
 * @returns {Array|null}
 */
function undoLastDrawing(roomId, socketId = null) {
  const room = getRoom(roomId);
  if (!room || room.drawingData.length === 0) return null;

  if (socketId) {
    for (let i = room.drawingData.length - 1; i >= 0; i--) {
      if (room.drawingData[i].socketId === socketId) {
        const targetStrokeId = room.drawingData[i].strokeId;
        if (targetStrokeId) {
          room.drawingData = room.drawingData.filter(s => s.strokeId !== targetStrokeId);
        } else {
          room.drawingData.splice(i, 1);
        }
        return room.drawingData;
      }
    }
  }

  const last = room.drawingData[room.drawingData.length - 1];
  if (last && last.strokeId) {
    const targetStrokeId = last.strokeId;
    room.drawingData = room.drawingData.filter(s => s.strokeId !== targetStrokeId);
  } else {
    room.drawingData.pop();
  }
  return room.drawingData;
}

/**
 * Add a chat message to room history
 * @param {string} roomId 
 * @param {object} messageData 
 * @returns {object|null}
 */
function addChatMessage(roomId, messageData) {
  const room = getRoom(roomId);
  if (!room) return null;

  const msg = {
    id: crypto.randomBytes(8).toString('hex'),
    socketId: messageData.socketId || null,
    username: messageData.username,
    color: messageData.color || '#3b82f6',
    message: messageData.message,
    timestamp: messageData.timestamp || Date.now(),
    isSystem: !!messageData.isSystem
  };

  room.messages.push(msg);

  // Keep last 150 messages in memory
  if (room.messages.length > 150) {
    room.messages.shift();
  }

  return msg;
}

/**
 * Get chat messages for a room
 * @param {string} roomId 
 * @returns {Array}
 */
function getChatMessages(roomId) {
  const room = getRoom(roomId);
  return room ? room.messages : [];
}

/**
 * Find which room a socket currently belongs to
 * @param {string} socketId 
 * @returns {object|null} { room, user }
 */
function findRoomBySocketId(socketId) {
  for (const room of rooms.values()) {
    if (room.users.has(socketId)) {
      return {
        room,
        user: room.users.get(socketId)
      };
    }
  }
  return null;
}

/**
 * Rename a room
 * @param {string} roomId 
 * @param {string} newName 
 * @returns {boolean}
 */
function renameRoom(roomId, newName) {
  const room = getRoom(roomId);
  if (!room || !newName) return false;
  room.name = newName.trim().slice(0, 50);
  return true;
}

/**
 * Get all active rooms metadata (for gallery and scrapbook discovery)
 * @returns {Array<object>}
 */
function getAllActiveRooms() {
  return Array.from(rooms.values()).map(r => ({
    id: r.id,
    name: r.name || 'Chill Doodles',
    description: r.description || '',
    participantCount: r.users.size,
    strokeCount: r.drawingData.length,
    createdAt: r.createdAt
  }));
}

module.exports = {
  createRoom,
  getRoom,
  roomExists,
  addUserToRoom,
  removeUserFromRoom,
  getUsersInRoom,
  addDrawingData,
  getDrawingData,
  clearDrawingData,
  undoLastDrawing,
  addChatMessage,
  getChatMessages,
  findRoomBySocketId,
  renameRoom,
  getAllActiveRooms
};
