document.addEventListener('DOMContentLoaded', () => {
  // Extract configuration from template
  const { roomId, nickname } = window.COLLAB_CONFIG || {};

  if (!roomId) {
    alert('Invalid room. Returning to home page.');
    window.location.href = '/';
    return;
  }

  // DOM Elements - Canvas & Tools
  const canvasViewport = document.getElementById('canvasViewport');
  const canvas = document.getElementById('whiteboardCanvas');
  const ctx = canvas.getContext('2d');

  const toolPen = document.getElementById('toolPen');
  const toolEraser = document.getElementById('toolEraser');
  const brushSizeSlider = document.getElementById('brushSizeSlider');
  const brushSizeValue = document.getElementById('brushSizeValue');
  const sizePreviewDot = document.getElementById('sizePreviewDot');
  const customColorPicker = document.getElementById('customColorPicker');
  const colorSwatches = document.querySelectorAll('.color-swatch');

  const btnClearBoard = document.getElementById('btnClearBoard');
  const btnDownloadBoard = document.getElementById('btnDownloadBoard');
  const clearModal = document.getElementById('clearModal');
  const btnCancelClear = document.getElementById('btnCancelClear');
  const btnConfirmClear = document.getElementById('btnConfirmClear');

  // DOM Elements - Header & Sidebar
  const btnCopyRoomId = document.getElementById('btnCopyRoomId');
  const participantCountText = document.getElementById('participantCountText');
  const sidebarParticipantsCount = document.getElementById('sidebarParticipantsCount');
  const participantsList = document.getElementById('participantsList');
  const myAvatar = document.getElementById('myAvatar');
  const myNicknameDisplay = document.getElementById('myNicknameDisplay');
  const toastContainer = document.getElementById('toastContainer');

  // DOM Elements - Chat
  const chatMessages = document.getElementById('chatMessages');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const collabSidebar = document.getElementById('collabSidebar');
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const unreadDot = document.getElementById('unreadDot');

  // Whiteboard State
  let currentTool = 'pen'; // 'pen' or 'eraser'
  let currentColor = '#ffffff';
  let currentSize = 4;
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  // Stored drawing history for perfect redrawing on resize
  let drawingHistory = [];

  // Local user nickname resolution
  let activeNickname = (nickname || '').trim();
  if (!activeNickname) {
    activeNickname = (localStorage.getItem('collabboard_nickname') || '').trim();
  }
  if (!activeNickname) {
    const entered = window.prompt('Enter your nickname to join the whiteboard:');
    if (entered && entered.trim()) {
      activeNickname = entered.trim().slice(0, 25);
      localStorage.setItem('collabboard_nickname', activeNickname);
    } else {
      activeNickname = 'Guest';
    }
  }

  // Local user info assigned by server
  let currentUser = {
    socketId: null,
    username: activeNickname,
    color: '#3b82f6'
  };

  // ----------------------------------------------------
  // 1. CANVAS SETUP & HIGH-DPI SCALING
  // ----------------------------------------------------
  let logicalWidth = 0;
  let logicalHeight = 0;

  function resizeCanvas() {
    const rect = canvasViewport.getBoundingClientRect();
    logicalWidth = rect.width;
    logicalHeight = rect.height;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(logicalWidth * dpr);
    canvas.height = Math.floor(logicalHeight * dpr);

    // Reset transform & scale for High DPI
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // Replay full drawing history onto the newly resized canvas
    redrawAllStrokes();
  }

  // Redraw all strokes from memory
  function redrawAllStrokes() {
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    for (let i = 0; i < drawingHistory.length; i++) {
      renderStroke(drawingHistory[i]);
    }
  }

  // Render a single stroke segment
  function renderStroke(data) {
    if (!data) return;

    // Support both normalized coordinates and absolute coordinates
    let x0 = data.prevX;
    let y0 = data.prevY;
    let x1 = data.x;
    let y1 = data.y;

    if (data.nx !== null && data.ny !== null && typeof data.nx === 'number') {
      x1 = data.nx * logicalWidth;
      y1 = data.ny * logicalHeight;
      x0 = (data.prevNx !== null && typeof data.prevNx === 'number') 
           ? data.prevNx * logicalWidth 
           : x1;
      y0 = (data.prevNy !== null && typeof data.prevNy === 'number') 
           ? data.prevNy * logicalHeight 
           : y1;
    }

    ctx.save();

    if (data.tool === 'eraser') {
      // Use destination-out compositing for true erasing
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = data.size * 1.5; // Eraser slightly wider for ergonomics
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = data.color || '#ffffff';
      ctx.lineWidth = data.size || 4;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    const targetX = (x0 === x1 && y0 === y1) ? x1 + 0.1 : x1;
    ctx.lineTo(targetX, y1);
    ctx.stroke();
    ctx.closePath();

    ctx.restore();
  }

  window.addEventListener('resize', resizeCanvas);
  // Initial size setup
  resizeCanvas();

  // ----------------------------------------------------
  // 2. REAL-TIME ENGINE (SOCKET.IO + WEBRTC P2P FALLBACK)
  // ----------------------------------------------------
  const statusIndicator = document.getElementById('statusIndicator') || document.querySelector('.status-indicator');
  const connectionBanner = document.getElementById('connectionBanner');

  function updateConnectionStatus(state, modeText) {
    if (!statusIndicator) return;
    statusIndicator.classList.remove('status-connected', 'status-connecting', 'status-disconnected');

    if (state === 'connected') {
      statusIndicator.classList.add('status-connected');
      statusIndicator.title = `Connected (${modeText || 'Real-time'})`;
      if (connectionBanner) connectionBanner.style.display = 'none';
    } else if (state === 'connecting') {
      statusIndicator.classList.add('status-connecting');
      statusIndicator.title = 'Connecting to real-time server...';
      if (participantCountText) participantCountText.textContent = 'Connecting...';
    } else {
      statusIndicator.classList.add('status-disconnected');
      statusIndicator.title = 'Disconnected from real-time server';
      if (participantCountText) participantCountText.textContent = 'Offline (1)';
      if (connectionBanner) connectionBanner.style.display = 'flex';
    }
  }

  // Set initial status to connecting
  updateConnectionStatus('connecting');

  // Clear whiteboard helper that works in all environments
  function clearWhiteboard(clearedByName) {
    drawingHistory = [];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    if (clearedByName) {
      showToast(`${clearedByName} cleared the whiteboard.`);
    }
  }

  // Core Real-Time Event Handlers
  function handleUserInfo(info) {
    currentUser = info;
    if (myNicknameDisplay) myNicknameDisplay.textContent = info.username;
    if (myAvatar) {
      myAvatar.style.backgroundColor = info.color;
      myAvatar.textContent = info.username.charAt(0).toUpperCase();
    }
  }

  function handleInitialBoardState(strokes) {
    drawingHistory = Array.isArray(strokes) ? strokes.slice() : [];
    redrawAllStrokes();
  }

  function handleIncomingDraw(data) {
    drawingHistory.push(data);
    renderStroke(data);
  }

  function handleClearBoard(data) {
    clearWhiteboard(data.clearedBy || 'Someone');
  }

  function handleParticipantsUpdate({ participants, count }) {
    if (participantCountText) participantCountText.textContent = `Participants: ${count}`;
    if (sidebarParticipantsCount) sidebarParticipantsCount.textContent = `${count}`;

    if (participantsList) {
      participantsList.innerHTML = '';
      participants.forEach((user) => {
        const isSelf = user.socketId === currentUser.socketId;
        const item = document.createElement('div');
        item.className = 'participant-item';

        const avatar = document.createElement('div');
        avatar.className = 'user-avatar-small';
        avatar.style.backgroundColor = user.color || '#3b82f6';
        avatar.textContent = (user.username || 'G').charAt(0).toUpperCase();

        const nameSpan = document.createElement('span');
        nameSpan.className = 'user-name-text';
        nameSpan.textContent = user.username;

        item.appendChild(avatar);
        item.appendChild(nameSpan);

        if (isSelf) {
          const youTag = document.createElement('span');
          youTag.className = 'you-tag';
          youTag.textContent = '(You)';
          item.appendChild(youTag);
        }

        participantsList.appendChild(item);
      });
    }
  }

  function handleUserJoined(data) {
    showToast(`${data.username} joined the room.`);
  }

  function handleUserLeft(data) {
    showToast(`${data.username} left the room.`);
  }

  function handleChatHistory(messages) {
    if (chatMessages) {
      chatMessages.innerHTML = '';
      if (Array.isArray(messages)) {
        messages.forEach(appendChatMessage);
      }
    }
  }

  function handleChatMessage(message) {
    appendChatMessage(message);
    if (collabSidebar && !collabSidebar.classList.contains('open') && window.innerWidth <= 900) {
      if (unreadDot) unreadDot.style.display = 'block';
    }
  }

  // --- 2A. Socket.IO Transport ---
  const socket = io({ timeout: 2500 });
  let p2pActive = false;
  let p2pFallbackTimer = null;

  socket.on('connect', () => {
    if (p2pFallbackTimer) clearTimeout(p2pFallbackTimer);
    updateConnectionStatus('connected', 'Socket.IO');
    socket.emit('join-room', {
      roomId,
      username: activeNickname
    });
  });

  socket.on('connect_error', () => {
    // If Socket.IO fails (e.g. on Vercel Serverless), immediately activate WebRTC P2P
    if (!p2pActive) {
      initP2PFallback();
    }
  });

  socket.on('disconnect', (reason) => {
    console.warn('Socket.IO disconnected:', reason);
    if (!p2pActive) {
      updateConnectionStatus('disconnected');
    }
  });

  socket.on('user-info', handleUserInfo);
  socket.on('initial-board-state', handleInitialBoardState);
  socket.on('draw', handleIncomingDraw);
  socket.on('clear-board', handleClearBoard);
  socket.on('participants-update', handleParticipantsUpdate);
  socket.on('user-joined', handleUserJoined);
  socket.on('user-left', handleUserLeft);
  socket.on('chat-history', handleChatHistory);
  socket.on('chat-message', handleChatMessage);
  socket.on('room-error', (data) => {
    alert(data.message || 'Room error encountered.');
    window.location.href = '/';
  });

  // Activate P2P fallback if Socket.IO doesn't connect within 1.5 seconds (Vercel serverless)
  p2pFallbackTimer = setTimeout(() => {
    if (!socket.connected && !p2pActive) {
      initP2PFallback();
    }
  }, 1500);

  // --- 2B. WebRTC Peer-to-Peer Fallback (for Vercel Serverless hosting) ---
  const USER_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#14b8a6', '#f97316', '#6366f1'
  ];

  let isHost = false;
  let myPeer = null;
  const p2pConnections = new Map();
  let p2pHostConn = null;
  const p2pUsers = new Map();
  const p2pChatHistory = [];

  function initP2PFallback() {
    if (p2pActive || (socket && socket.connected)) return;
    if (typeof Peer === 'undefined') {
      console.warn('PeerJS library not available.');
      updateConnectionStatus('disconnected');
      return;
    }

    p2pActive = true;
    console.log('Activating WebRTC P2P fallback for serverless hosting...');

    const cleanRoomId = (roomId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const hostPeerId = `collabboard-room-${cleanRoomId}`;

    try {
      myPeer = new Peer(hostPeerId, { debug: 0 });
    } catch (e) {
      startAsGuest(hostPeerId);
      return;
    }

    myPeer.on('open', (id) => {
      setupHost(id);
    });

    myPeer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        // Host already exists, connect as guest
        if (myPeer) {
          myPeer.destroy();
        }
        startAsGuest(hostPeerId);
      } else {
        console.warn('P2P Peer error:', err.type, err.message);
      }
    });
  }

  function setupHost(hostId) {
    isHost = true;
    updateConnectionStatus('connected', 'WebRTC P2P');

    const hostUser = {
      socketId: hostId,
      username: activeNickname,
      color: '#3b82f6',
      isHost: true
    };
    p2pUsers.set(hostId, hostUser);
    handleUserInfo(hostUser);
    broadcastP2PParticipants();

    myPeer.on('connection', (conn) => {
      conn.on('open', () => {
        p2pConnections.set(conn.peer, conn);

        conn.on('data', (packet) => {
          handleGuestPacket(conn, packet);
        });

        conn.on('close', () => {
          p2pConnections.delete(conn.peer);
          const departed = p2pUsers.get(conn.peer);
          p2pUsers.delete(conn.peer);
          if (departed) {
            handleUserLeft({ username: departed.username });
            broadcastToP2PGuests({ type: 'user-left', data: { username: departed.username } });
            broadcastP2PParticipants();
          }
        });
      });
    });
  }

  function handleGuestPacket(conn, packet) {
    if (!packet || typeof packet !== 'object') return;
    const { type, data } = packet;

    if (type === 'join-room') {
      const usedColors = new Set(Array.from(p2pUsers.values()).map(u => u.color));
      const color = USER_COLORS.find(c => !usedColors.has(c)) || USER_COLORS[p2pUsers.size % USER_COLORS.length];
      const guestUser = {
        socketId: conn.peer,
        username: (data.username || 'Guest').slice(0, 25),
        color: color,
        isHost: false
      };
      p2pUsers.set(conn.peer, guestUser);

      conn.send({ type: 'user-info', data: guestUser });
      conn.send({ type: 'initial-board-state', data: drawingHistory });
      conn.send({ type: 'chat-history', data: p2pChatHistory });

      handleUserJoined({ username: guestUser.username, color: guestUser.color });
      broadcastToP2PGuests({ type: 'user-joined', data: { username: guestUser.username, color: guestUser.color } });
      broadcastP2PParticipants();

      const joinMsg = {
        id: Math.random().toString(36).substring(2, 9),
        username: 'System',
        message: `${guestUser.username} joined the room`,
        isSystem: true,
        timestamp: Date.now()
      };
      p2pChatHistory.push(joinMsg);
      handleChatMessage(joinMsg);
      broadcastToP2PGuests({ type: 'chat-message', data: joinMsg });

    } else if (type === 'draw') {
      drawingHistory.push(data);
      renderStroke(data);
      broadcastToP2PGuests({ type: 'draw', data }, conn.peer);

    } else if (type === 'clear-board') {
      const user = p2pUsers.get(conn.peer);
      const name = user ? user.username : 'Someone';
      clearWhiteboard(name);
      broadcastToP2PGuests({ type: 'clear-board', data: { clearedBy: name } }, conn.peer);

    } else if (type === 'chat-message') {
      const user = p2pUsers.get(conn.peer);
      const chatMsg = {
        id: Math.random().toString(36).substring(2, 9),
        socketId: conn.peer,
        username: user ? user.username : 'Guest',
        color: user ? user.color : '#3b82f6',
        message: data.message,
        isSystem: false,
        timestamp: Date.now()
      };
      p2pChatHistory.push(chatMsg);
      handleChatMessage(chatMsg);
      broadcastToP2PGuests({ type: 'chat-message', data: chatMsg });

    } else if (type === 'change-nickname') {
      const user = p2pUsers.get(conn.peer);
      if (user && data.username) {
        const oldName = user.username;
        user.username = data.username.slice(0, 25);
        broadcastP2PParticipants();
        const renameMsg = {
          id: Math.random().toString(36).substring(2, 9),
          username: 'System',
          message: `${oldName} changed their name to ${user.username}`,
          isSystem: true,
          timestamp: Date.now()
        };
        p2pChatHistory.push(renameMsg);
        handleChatMessage(renameMsg);
        broadcastToP2PGuests({ type: 'chat-message', data: renameMsg });
      }
    }
  }

  function broadcastToP2PGuests(packet, excludePeerId = null) {
    for (const [peerId, conn] of p2pConnections) {
      if (peerId !== excludePeerId && conn.open) {
        try {
          conn.send(packet);
        } catch (err) {
          console.warn('Failed to send to peer:', peerId, err);
        }
      }
    }
  }

  function broadcastP2PParticipants() {
    const participants = Array.from(p2pUsers.values()).map(u => ({
      socketId: u.socketId,
      username: u.username,
      color: u.color
    }));
    const updateData = { participants, count: participants.length };
    handleParticipantsUpdate(updateData);
    broadcastToP2PGuests({ type: 'participants-update', data: updateData });
  }

  function startAsGuest(hostPeerId) {
    isHost = false;
    updateConnectionStatus('connecting');

    myPeer = new Peer(null, { debug: 0 });

    myPeer.on('open', () => {
      p2pHostConn = myPeer.connect(hostPeerId, { reliable: true });

      p2pHostConn.on('open', () => {
        updateConnectionStatus('connected', 'WebRTC P2P');
        p2pHostConn.send({
          type: 'join-room',
          data: { username: activeNickname }
        });
      });

      p2pHostConn.on('data', (packet) => {
        if (!packet || typeof packet !== 'object') return;
        const { type, data } = packet;

        if (type === 'user-info') {
          handleUserInfo(data);
        } else if (type === 'initial-board-state') {
          handleInitialBoardState(data);
        } else if (type === 'draw') {
          handleIncomingDraw(data);
        } else if (type === 'clear-board') {
          handleClearBoard(data);
        } else if (type === 'participants-update') {
          handleParticipantsUpdate(data);
        } else if (type === 'user-joined') {
          handleUserJoined(data);
        } else if (type === 'user-left') {
          handleUserLeft(data);
        } else if (type === 'chat-history') {
          handleChatHistory(data);
        } else if (type === 'chat-message') {
          handleChatMessage(data);
        }
      });

      p2pHostConn.on('close', () => {
        console.warn('Disconnected from Host.');
        updateConnectionStatus('disconnected');
        showToast('Room host disconnected. Reconnecting...');
        setTimeout(() => {
          p2pActive = false;
          initP2PFallback();
        }, 1500);
      });
    });

    myPeer.on('error', (err) => {
      console.warn('Guest peer error:', err);
      updateConnectionStatus('disconnected');
    });
  }

  function p2pEmit(event, data) {
    if (isHost) {
      if (event === 'draw') {
        broadcastToP2PGuests({ type: 'draw', data });
      } else if (event === 'clear-board') {
        broadcastToP2PGuests({ type: 'clear-board', data: { clearedBy: currentUser.username || 'You' } });
      } else if (event === 'chat-message') {
        const chatMsg = {
          id: Math.random().toString(36).substring(2, 9),
          socketId: myPeer ? myPeer.id : 'host',
          username: currentUser.username || 'Host',
          color: currentUser.color || '#3b82f6',
          message: data.message,
          isSystem: false,
          timestamp: Date.now()
        };
        p2pChatHistory.push(chatMsg);
        handleChatMessage(chatMsg);
        broadcastToP2PGuests({ type: 'chat-message', data: chatMsg });
      } else if (event === 'change-nickname') {
        if (myPeer && p2pUsers.has(myPeer.id)) {
          const u = p2pUsers.get(myPeer.id);
          const oldName = u.username;
          u.username = data.username;
          broadcastP2PParticipants();
          const renameMsg = {
            id: Math.random().toString(36).substring(2, 9),
            username: 'System',
            message: `${oldName} changed their name to ${data.username}`,
            isSystem: true,
            timestamp: Date.now()
          };
          p2pChatHistory.push(renameMsg);
          handleChatMessage(renameMsg);
          broadcastToP2PGuests({ type: 'chat-message', data: renameMsg });
        }
      }
    } else if (p2pHostConn && p2pHostConn.open) {
      p2pHostConn.send({ type: event, data });
    }
  }

  function emitRealtime(event, data) {
    if (socket && socket.connected) {
      socket.emit(event, data);
    } else if (p2pActive) {
      p2pEmit(event, data);
    }
  }

  // ----------------------------------------------------
  // 3. DRAWING INTERACTION (POINTER EVENTS)
  // ----------------------------------------------------
  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  function startDrawing(e) {
    // Only primary mouse button or touch
    if (e.button !== undefined && e.button !== 0) return;

    isDrawing = true;
    const { x, y } = getCanvasCoords(e);
    lastX = x;
    lastY = y;

    // Draw single dot on pointerdown for responsiveness
    drawSegment(x, y);

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignored if capture unsupported
    }
  }

  function continueDrawing(e) {
    if (!isDrawing) return;

    const { x, y } = getCanvasCoords(e);

    // Avoid redundant zero-movement events
    if (Math.abs(x - lastX) < 0.5 && Math.abs(y - lastY) < 0.5) return;

    drawSegment(x, y);
    lastX = x;
    lastY = y;
  }

  function stopDrawing(e) {
    if (!isDrawing) return;
    isDrawing = false;
    try {
      if (e && e.pointerId) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch (err) {
      // Ignored
    }
  }

  function drawSegment(x, y) {
    const strokeData = {
      x: x,
      y: y,
      prevX: lastX,
      prevY: lastY,
      nx: logicalWidth > 0 ? x / logicalWidth : null,
      ny: logicalHeight > 0 ? y / logicalHeight : null,
      prevNx: logicalWidth > 0 ? lastX / logicalWidth : null,
      prevNy: logicalHeight > 0 ? lastY / logicalHeight : null,
      color: currentColor,
      size: currentSize,
      tool: currentTool
    };

    // Render locally immediately
    renderStroke(strokeData);
    drawingHistory.push(strokeData);

    // Broadcast stroke in real-time
    emitRealtime('draw', strokeData);
  }

  // Pointer event listeners for unified mouse, stylus, and touch handling
  canvas.addEventListener('pointerdown', startDrawing);
  canvas.addEventListener('pointermove', continueDrawing);
  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);
  canvas.addEventListener('pointerleave', stopDrawing);

  // ----------------------------------------------------
  // 4. TOOLBAR CONTROLS
  // ----------------------------------------------------
  // Tool switching
  toolPen.addEventListener('click', () => {
    currentTool = 'pen';
    toolPen.classList.add('active');
    toolEraser.classList.remove('active');
    updateSizePreview();
  });

  toolEraser.addEventListener('click', () => {
    currentTool = 'eraser';
    toolEraser.classList.add('active');
    toolPen.classList.remove('active');
    updateSizePreview();
  });

  // Keyboard shortcuts (P: Pen, E: Eraser)
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'p' || e.key === 'P') {
      toolPen.click();
    } else if (e.key === 'e' || e.key === 'E') {
      toolEraser.click();
    }
  });

  // Color Swatches
  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      colorSwatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      currentColor = swatch.getAttribute('data-color');
      if (currentTool === 'eraser') {
        toolPen.click(); // Auto switch back to pen on color select
      }
      updateSizePreview();
    });
  });

  // Custom Color Picker
  customColorPicker.addEventListener('input', (e) => {
    currentColor = e.target.value;
    colorSwatches.forEach(s => s.classList.remove('active'));
    if (currentTool === 'eraser') {
      toolPen.click();
    }
    updateSizePreview();
  });

  // Brush Size & Presets
  const sizePresetBtns = document.querySelectorAll('.size-preset-btn');
  
  function setBrushSize(newSize) {
    currentSize = newSize;
    if (brushSizeSlider) brushSizeSlider.value = newSize;
    if (brushSizeValue) brushSizeValue.textContent = `${newSize}px`;
    
    // Update active preset button highlight
    sizePresetBtns.forEach(btn => {
      const val = parseInt(btn.getAttribute('data-size'), 10);
      if (val === newSize) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    
    updateSizePreview();
  }

  sizePresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sizeVal = parseInt(btn.getAttribute('data-size'), 10);
      setBrushSize(sizeVal);
    });
  });

  brushSizeSlider.addEventListener('input', (e) => {
    setBrushSize(parseInt(e.target.value, 10));
  });

  function updateSizePreview() {
    if (sizePreviewDot) {
      const displaySize = Math.max(4, Math.min(24, currentSize));
      sizePreviewDot.style.width = `${displaySize}px`;
      sizePreviewDot.style.height = `${displaySize}px`;
      sizePreviewDot.style.backgroundColor = currentTool === 'eraser' ? '#94a3b8' : currentColor;
    }
  }
  updateSizePreview();

  // ----------------------------------------------------
  // 5. CLEAR BOARD & EXPORT
  // ----------------------------------------------------
  btnClearBoard.addEventListener('click', () => {
    clearModal.style.display = 'flex';
  });

  btnCancelClear.addEventListener('click', () => {
    clearModal.style.display = 'none';
  });

  // Close modal when clicking on overlay background
  clearModal.addEventListener('click', (e) => {
    if (e.target === clearModal) {
      clearModal.style.display = 'none';
    }
  });

  // Close modal on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && clearModal.style.display === 'flex') {
      clearModal.style.display = 'none';
    }
  });

  btnConfirmClear.addEventListener('click', () => {
    clearModal.style.display = 'none';
    clearWhiteboard('You');
    emitRealtime('clear-board', {});
  });

  // Download whiteboard image
  btnDownloadBoard.addEventListener('click', () => {
    if (!canvas) return;

    // Create export canvas with solid background to preserve drawing visibility
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext('2d');

    // Fill background with slate dark board tone
    exportCtx.fillStyle = '#0e121e';
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Draw whiteboard artwork over it
    exportCtx.drawImage(canvas, 0, 0);

    const dataUrl = exportCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `collabboard-${roomId}.png`;
    link.href = dataUrl;
    link.click();
    showToast('Whiteboard exported as PNG.');
  });

  // ----------------------------------------------------
  // 6. COPY ROOM ID & INVITE LINK
  // ----------------------------------------------------
  btnCopyRoomId.addEventListener('click', async () => {
    const copyTextSpan = btnCopyRoomId.querySelector('.copy-text');
    try {
      await navigator.clipboard.writeText(roomId);
    } catch (err) {
      // Fallback for older browsers
      const tempInput = document.createElement('input');
      tempInput.value = roomId;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
    }

    if (copyTextSpan) {
      const originalText = copyTextSpan.textContent;
      copyTextSpan.textContent = 'Copied!';
      btnCopyRoomId.style.borderColor = 'var(--accent-emerald)';
      setTimeout(() => {
        copyTextSpan.textContent = originalText;
        btnCopyRoomId.style.borderColor = '';
      }, 2000);
    }

    showToast(`Copied Room ID: ${roomId}`);
  });

  // Share direct invite link for easy 1-click joining
  const btnCopyInviteLink = document.getElementById('btnCopyInviteLink');
  if (btnCopyInviteLink) {
    btnCopyInviteLink.addEventListener('click', async () => {
      const inviteUrl = `${window.location.origin}/room/${roomId}`;
      const inviteText = btnCopyInviteLink.querySelector('.invite-text');

      try {
        await navigator.clipboard.writeText(inviteUrl);
      } catch (err) {
        const tempInput = document.createElement('input');
        tempInput.value = inviteUrl;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
      }

      if (inviteText) {
        const originalText = inviteText.textContent;
        inviteText.textContent = 'Copied!';
        btnCopyInviteLink.style.borderColor = 'var(--accent-emerald)';
        setTimeout(() => {
          inviteText.textContent = originalText;
          btnCopyInviteLink.style.borderColor = '';
        }, 2000);
      }

      showToast('Invite link copied! Send it to your friend to draw together.');
    });
  }

  // Allow clicking on nickname badge to customize nickname anytime
  const currentUserBadge = document.getElementById('currentUserBadge');
  if (currentUserBadge) {
    currentUserBadge.addEventListener('click', () => {
      const currentName = currentUser.username || activeNickname || 'Guest';
      const newName = window.prompt('Change your nickname:', currentName);
      if (newName && newName.trim() && newName.trim() !== currentName) {
        const cleanName = newName.trim().slice(0, 25);
        activeNickname = cleanName;
        currentUser.username = cleanName;
        localStorage.setItem('collabboard_nickname', cleanName);
        if (myNicknameDisplay) myNicknameDisplay.textContent = cleanName;
        if (myAvatar) myAvatar.textContent = cleanName.charAt(0).toUpperCase();

        emitRealtime('change-nickname', { username: cleanName });
        showToast(`Nickname updated to "${cleanName}".`);
      }
    });
  }

  // ----------------------------------------------------
  // 7. REAL-TIME CHAT
  // ----------------------------------------------------
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = (chatInput.value || '').trim();
    if (!text) return;

    emitRealtime('chat-message', { message: text });
    chatInput.value = '';
    chatInput.focus();
  });

  function formatTime(timestamp) {
    const d = new Date(timestamp || Date.now());
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function appendChatMessage(msg) {
    if (!chatMessages) return;

    if (msg.isSystem) {
      const sysDiv = document.createElement('div');
      sysDiv.className = 'system-notification';
      sysDiv.textContent = msg.message;
      chatMessages.appendChild(sysDiv);
    } else {
      const isSelf = (msg.socketId && currentUser.socketId && msg.socketId === currentUser.socketId) || 
                     (msg.username === currentUser.username);
      const msgDiv = document.createElement('div');
      msgDiv.className = `chat-msg ${isSelf ? 'msg-self' : 'msg-other'}`;

      const headerDiv = document.createElement('div');
      headerDiv.className = 'chat-msg-header';

      const senderSpan = document.createElement('span');
      senderSpan.className = 'chat-sender';
      senderSpan.style.color = msg.color || '#94a3b8';
      senderSpan.textContent = isSelf ? 'You' : msg.username;

      const timeSpan = document.createElement('span');
      timeSpan.className = 'chat-time';
      timeSpan.textContent = formatTime(msg.timestamp);

      headerDiv.appendChild(senderSpan);
      headerDiv.appendChild(timeSpan);

      const bubbleDiv = document.createElement('div');
      bubbleDiv.className = 'chat-msg-bubble';
      bubbleDiv.textContent = msg.message; // textContent securely prevents XSS

      msgDiv.appendChild(headerDiv);
      msgDiv.appendChild(bubbleDiv);

      chatMessages.appendChild(msgDiv);
    }

    // Auto scroll chat to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Mobile sidebar toggle
  if (btnToggleSidebar && collabSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      collabSidebar.classList.toggle('open');
      if (unreadDot) unreadDot.style.display = 'none';
    });
  }

  // ----------------------------------------------------
  // 8. TOAST NOTIFICATIONS
  // ----------------------------------------------------
  function showToast(text) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 2800);
  }
});
