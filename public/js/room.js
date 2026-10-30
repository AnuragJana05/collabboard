/* ==========================================================================
   DOODLEBOOK — REAL-TIME COLLABORATIVE DRAWING WORKSPACE ENGINE
   HTML5 Canvas, Socket.IO, WebRTC P2P Fallback, Stationery Tools
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Extract configuration from template
  const { roomId, roomName: initialRoomName, nickname } = window.COLLAB_CONFIG || {};

  if (!roomId) {
    alert('Invalid room. Returning to Doodlebook home.');
    window.location.href = '/';
    return;
  }

  // Active room name state
  let currentRoomName = initialRoomName || 'Chill Doodles';

  // Save room to recent rooms history in localStorage
  try {
    let recents = JSON.parse(localStorage.getItem('doodle_recent_rooms') || '[]');
    recents = recents.filter(r => r.roomId !== roomId);
    recents.unshift({ roomId, roomName: currentRoomName, visitedAt: Date.now() });
    if (recents.length > 8) recents = recents.slice(0, 8);
    localStorage.setItem('doodle_recent_rooms', JSON.stringify(recents));
  } catch (e) {
    // LocalStorage fallback
  }

  // DOM Elements - Canvas & Viewport
  const canvasViewport = document.getElementById('canvasViewport');
  const canvasTransformWrapper = document.getElementById('canvasTransformWrapper');
  const canvas = document.getElementById('whiteboardCanvas');
  const ctx = canvas.getContext('2d');
  const cursorsOverlay = document.getElementById('cursorsOverlay');
  const reactionsOverlay = document.getElementById('reactionsOverlay');

  // DOM Elements - Tools
  const toolSelect = document.getElementById('toolSelect');
  const toolPen = document.getElementById('toolPen');
  const toolBrush = document.getElementById('toolBrush');
  const toolHighlighter = document.getElementById('toolHighlighter');
  const toolEraser = document.getElementById('toolEraser');
  const toolLine = document.getElementById('toolLine');
  const toolShapesDropdown = document.getElementById('toolShapesDropdown');
  const shapesPopover = document.getElementById('shapesPopover');
  const shapeOpts = document.querySelectorAll('.shape-opt');
  const toolText = document.getElementById('toolText');

  // DOM Elements - Colors & Sizes
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const customColorPicker = document.getElementById('customColorPicker');
  const sizePresetBtns = document.querySelectorAll('.size-preset-btn');
  const brushSizeSlider = document.getElementById('brushSizeSlider');
  const brushSizeValue = document.getElementById('brushSizeValue');
  const sizePreviewDot = document.getElementById('sizePreviewDot');

  // DOM Elements - Canvas Actions & Zoom
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  const btnClearBoard = document.getElementById('btnClearBoard');
  const btnDownloadBoard = document.getElementById('btnDownloadBoard');
  const clearModal = document.getElementById('clearModal');
  const btnCancelClear = document.getElementById('btnCancelClear');
  const btnConfirmClear = document.getElementById('btnConfirmClear');

  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnZoomReset = document.getElementById('btnZoomReset');
  const zoomLevelDisplay = document.getElementById('zoomLevelDisplay');

  // DOM Elements - Header & Sidebar
  const btnCopyRoomId = document.getElementById('btnCopyRoomId');
  const btnCopyInviteLink = document.getElementById('btnCopyInviteLink');
  const btnInviteModal = document.getElementById('btnInviteModal');
  const btnEditRoomName = document.getElementById('btnEditRoomName');
  const roomNameDisplay = document.getElementById('roomNameDisplay');
  const participantCountText = document.getElementById('participantCountText');
  const sidebarParticipantsCount = document.getElementById('sidebarParticipantsCount');
  const participantsList = document.getElementById('participantsList');
  const avatarsPreviewStack = document.getElementById('avatarsPreviewStack');
  const myAvatar = document.getElementById('myAvatar');
  const myNicknameDisplay = document.getElementById('myNicknameDisplay');
  const currentUserBadge = document.getElementById('currentUserBadge');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusDot = document.getElementById('statusDot');
  const toastContainer = document.getElementById('toastContainer');

  // DOM Elements - Reactions & Chat
  const reactionButtons = document.querySelectorAll('.btn-reaction');
  const chatMessages = document.getElementById('chatMessages');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const collabSidebar = document.getElementById('collabSidebar');
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const unreadDot = document.getElementById('unreadDot');

  // State Variables
  let currentTool = 'pen'; // 'select', 'pen', 'brush', 'highlighter', 'eraser', 'line', 'rect', 'circle', 'triangle', 'star', 'text'
  let currentColor = '#292723';
  let currentSize = 4;
  let isDrawing = false;
  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let panStartX = 0;
  let panStartY = 0;
  let panOffsetX = 0;
  let panOffsetY = 0;
  let currentStrokeId = null;

  // Zoom state
  let currentZoom = 1.0;
  const MIN_ZOOM = 0.4;
  const MAX_ZOOM = 3.0;

  // Stored drawing history for redraw & undo/redo
  let drawingHistory = [];
  let redoStack = [];

  // Motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Nickname resolution
  let activeNickname = (nickname || '').trim();
  if (!activeNickname) {
    activeNickname = (localStorage.getItem('doodle_nickname') || localStorage.getItem('collabboard_nickname') || '').trim();
  }
  if (!activeNickname) {
    activeNickname = 'Guest';
  }

  let currentUser = {
    socketId: null,
    username: activeNickname,
    color: '#FF8066'
  };

  // -------------------------------------------------------------------------
  // 1. CANVAS SETUP & HIGH-DPI SCALING
  // -------------------------------------------------------------------------
  let logicalWidth = 0;
  let logicalHeight = 0;

  function resizeCanvas() {
    if (!canvasViewport) return;
    const rect = canvasViewport.getBoundingClientRect();
    logicalWidth = rect.width;
    logicalHeight = rect.height;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(logicalWidth * dpr);
    canvas.height = Math.floor(logicalHeight * dpr);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    redrawAllStrokes();
  }

  function redrawAllStrokes() {
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    for (let i = 0; i < drawingHistory.length; i++) {
      renderStroke(drawingHistory[i]);
    }
  }

  // Draw star shape helper
  function drawStar(context, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    context.beginPath();
    context.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      context.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      context.lineTo(x, y);
      rot += step;
    }
    context.lineTo(cx, cy - outerRadius);
    context.closePath();
  }

  // Render a stroke segment or shape onto HTML5 canvas
  function renderStroke(data) {
    if (!data) return;

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
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = (data.size || 6) * 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      const targetX = (x0 === x1 && y0 === y1) ? x1 + 0.1 : x1;
      ctx.lineTo(targetX, y1);
      ctx.stroke();
      ctx.closePath();

    } else if (data.tool === 'highlighter') {
      // Translucent marker effect
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.38;
      ctx.strokeStyle = data.color || '#F5D77A';
      ctx.lineWidth = Math.max(16, (data.size || 4) * 3);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      const targetX = (x0 === x1 && y0 === y1) ? x1 + 0.1 : x1;
      ctx.lineTo(targetX, y1);
      ctx.stroke();
      ctx.closePath();

    } else if (data.tool === 'brush') {
      // Smooth bold ink brush
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = data.color || '#292723';
      ctx.lineWidth = (data.size || 6) * 1.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(41, 39, 35, 0.15)';
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      const targetX = (x0 === x1 && y0 === y1) ? x1 + 0.1 : x1;
      ctx.lineTo(targetX, y1);
      ctx.stroke();
      ctx.closePath();

    } else if (data.tool === 'line') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = data.color || '#292723';
      ctx.lineWidth = data.size || 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.closePath();

    } else if (data.tool === 'rect') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = data.color || '#292723';
      ctx.lineWidth = data.size || 4;
      ctx.lineJoin = 'round';
      const rx = Math.min(x0, x1);
      const ry = Math.min(y0, y1);
      const rw = Math.abs(x1 - x0);
      const rh = Math.abs(y1 - y0);
      ctx.strokeRect(rx, ry, rw, rh);

    } else if (data.tool === 'circle') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = data.color || '#292723';
      ctx.lineWidth = data.size || 4;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const rx = Math.abs(x1 - x0) / 2;
      const ry = Math.abs(y1 - y0) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.closePath();

    } else if (data.tool === 'triangle') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = data.color || '#292723';
      ctx.lineWidth = data.size || 4;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo((x0 + x1) / 2, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x0, y1);
      ctx.closePath();
      ctx.stroke();

    } else if (data.tool === 'star') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = data.color || '#292723';
      ctx.lineWidth = data.size || 4;
      ctx.lineJoin = 'round';
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const rad = Math.max(8, Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2);
      drawStar(ctx, cx, cy, 5, rad, rad * 0.45);
      ctx.stroke();

    } else if (data.tool === 'text') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = data.color || '#292723';
      const fontSize = Math.max(18, (data.size || 4) * 4);
      ctx.font = `bold ${fontSize}px 'Patrick Hand', cursive`;
      ctx.fillText(data.text || '', x1, y1);

    } else {
      // Default fine pencil
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = data.color || '#292723';
      ctx.lineWidth = data.size || 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      const targetX = (x0 === x1 && y0 === y1) ? x1 + 0.1 : x1;
      ctx.lineTo(targetX, y1);
      ctx.stroke();
      ctx.closePath();
    }

    ctx.restore();
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // -------------------------------------------------------------------------
  // 2. ZOOM & PAN CONTROLS
  // -------------------------------------------------------------------------
  function updateTransform() {
    if (!canvasTransformWrapper) return;
    canvasTransformWrapper.style.transform = `translate(${panOffsetX}px, ${panOffsetY}px) scale(${currentZoom})`;
    if (zoomLevelDisplay) {
      zoomLevelDisplay.textContent = `${Math.round(currentZoom * 100)}%`;
    }
  }

  function setZoom(newZoom) {
    currentZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(newZoom * 10) / 10));
    updateTransform();
  }

  if (btnZoomIn) btnZoomIn.addEventListener('click', () => setZoom(currentZoom + 0.15));
  if (btnZoomOut) btnZoomOut.addEventListener('click', () => setZoom(currentZoom - 0.15));
  if (btnZoomReset) {
    btnZoomReset.addEventListener('click', () => {
      currentZoom = 1.0;
      panOffsetX = 0;
      panOffsetY = 0;
      updateTransform();
    });
  }

  // Wheel zoom / pan
  canvasViewport.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 0.1 : -0.1;
      setZoom(currentZoom + zoomFactor);
    }
  }, { passive: false });

  // -------------------------------------------------------------------------
  // 3. MULTIPLAYER PARTICIPANT CURSORS
  // -------------------------------------------------------------------------
  const remoteCursors = new Map(); // socketId -> { el, label, targetX, targetY, currentX, currentY, color }

  function getOrCreateRemoteCursor(socketId, username, color) {
    if (remoteCursors.has(socketId)) {
      const data = remoteCursors.get(socketId);
      if (username && data.label) {
        data.label.textContent = `${username} ✍️`;
      }
      return data;
    }

    const cursorEl = document.createElement('div');
    cursorEl.className = 'live-cursor';

    // SVG Pointer
    const svgWrap = document.createElement('div');
    svgWrap.className = 'live-cursor-pointer';
    svgWrap.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24">
        <path d="M4 4l7 17 2.5-6.5L20 12 4 4z" fill="${color || '#FF8066'}" stroke="#292723" stroke-width="1.8"/>
      </svg>
    `;

    // Username Label
    const label = document.createElement('span');
    label.className = 'live-cursor-label';
    label.style.backgroundColor = color || '#FF8066';
    label.textContent = `${username || 'Friend'} ✍️`;

    cursorEl.appendChild(svgWrap);
    cursorEl.appendChild(label);

    if (cursorsOverlay) {
      cursorsOverlay.appendChild(cursorEl);
    }

    const cursorObj = {
      el: cursorEl,
      label: label,
      color: color || '#FF8066',
      targetX: -100,
      targetY: -100,
      currentX: -100,
      currentY: -100
    };

    remoteCursors.set(socketId, cursorObj);
    return cursorObj;
  }

  function removeRemoteCursor(socketId) {
    if (remoteCursors.has(socketId)) {
      const { el } = remoteCursors.get(socketId);
      if (el && el.parentElement) el.remove();
      remoteCursors.delete(socketId);
    }
  }

  // Smooth lerp animation loop for all remote cursors
  function animateRemoteCursors() {
    remoteCursors.forEach((c) => {
      const dx = c.targetX - c.currentX;
      const dy = c.targetY - c.currentY;
      
      c.currentX += dx * 0.35;
      c.currentY += dy * 0.35;

      const screenX = c.currentX * currentZoom + panOffsetX;
      const screenY = c.currentY * currentZoom + panOffsetY;

      c.el.style.transform = `translate3d(${screenX}px, ${screenY}px, 0)`;

      // Trailing subtle colored dots
      if (!prefersReducedMotion && (Math.abs(dx) > 3 || Math.abs(dy) > 3) && Math.random() < 0.25) {
        spawnCursorTrailDot(screenX, screenY, c.color);
      }
    });

    requestAnimationFrame(animateRemoteCursors);
  }
  requestAnimationFrame(animateRemoteCursors);

  function spawnCursorTrailDot(x, y, color) {
    if (!cursorsOverlay) return;
    const dot = document.createElement('div');
    dot.className = 'cursor-trail-dot';
    dot.style.left = `${x + 6}px`;
    dot.style.top = `${y + 6}px`;
    dot.style.backgroundColor = color;
    cursorsOverlay.appendChild(dot);
    setTimeout(() => {
      if (dot.parentElement) dot.remove();
    }, 750);
  }

  // Broadcast local cursor position
  let lastCursorSent = 0;
  function handleLocalCursorMove(e) {
    const now = Date.now();
    if (now - lastCursorSent < 35) return; // 30fps throttle
    lastCursorSent = now;

    const coords = getCanvasCoords(e);
    const nx = logicalWidth > 0 ? coords.x / logicalWidth : null;
    const ny = logicalHeight > 0 ? coords.y / logicalHeight : null;

    emitRealtime('cursor-move', {
      x: coords.x,
      y: coords.y,
      nx,
      ny
    });
  }

  canvasViewport.addEventListener('pointermove', handleLocalCursorMove);
  canvasViewport.addEventListener('pointerleave', () => {
    emitRealtime('cursor-leave', {});
  });

  // -------------------------------------------------------------------------
  // 4. FLOATING REACTION BURSTS
  // -------------------------------------------------------------------------
  function spawnFloatingReaction(emoji, x, y) {
    if (!reactionsOverlay) return;
    const el = document.createElement('div');
    el.className = 'floating-burst-emoji';
    el.textContent = emoji;

    const driftX = (Math.random() - 0.5) * 120;
    el.style.setProperty('--drift-x', `${driftX}px`);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    reactionsOverlay.appendChild(el);
    setTimeout(() => {
      if (el.parentElement) el.remove();
    }, 2200);
  }

  reactionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.getAttribute('data-emoji') || '❤️';
      const rect = btn.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top;

      // Local burst
      spawnFloatingReaction(emoji, x, y);

      // Broadcast reaction
      emitRealtime('reaction', {
        emoji,
        x: x / window.innerWidth,
        y: y / window.innerHeight
      });
    });
  });

  // -------------------------------------------------------------------------
  // 5. REAL-TIME ENGINE (SOCKET.IO + WEBRTC P2P FALLBACK)
  // -------------------------------------------------------------------------
  function updateConnectionStatus(state, modeText) {
    if (!statusDot || !participantCountText) return;
    if (state === 'connected') {
      statusDot.style.backgroundColor = 'var(--color-green)';
      statusDot.style.boxShadow = '0 0 8px var(--color-green)';
      statusIndicator.title = `Connected via ${modeText || 'Socket.IO'}`;
    } else if (state === 'connecting') {
      statusDot.style.backgroundColor = 'var(--color-yellow)';
      statusDot.style.boxShadow = '0 0 8px var(--color-yellow)';
      participantCountText.textContent = 'Connecting...';
    } else {
      statusDot.style.backgroundColor = 'var(--color-red)';
      statusDot.style.boxShadow = '0 0 8px var(--color-red)';
      participantCountText.textContent = 'Offline (1)';
    }
  }

  updateConnectionStatus('connecting');

  function clearWhiteboard(clearedByName) {
    drawingHistory = [];
    redoStack = [];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    if (clearedByName) {
      showToast(`${clearedByName} cleared the page.`);
    }
  }

  function handleUserInfo(info) {
    currentUser = info;
    if (myNicknameDisplay) myNicknameDisplay.textContent = info.username;
    if (myAvatar) {
      myAvatar.style.backgroundColor = info.color;
      myAvatar.textContent = (info.username || 'G').charAt(0).toUpperCase();
    }
  }

  function handleRoomInfo(info) {
    if (info && info.roomName) {
      currentRoomName = info.roomName;
      if (roomNameDisplay) roomNameDisplay.textContent = currentRoomName;
      document.title = `${currentRoomName} — Doodlebook Workspace`;
    }
  }

  function handleInitialBoardState(strokes) {
    drawingHistory = Array.isArray(strokes) ? strokes.slice() : [];
    redoStack = [];
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
    if (participantCountText) participantCountText.textContent = `${count} online`;
    if (sidebarParticipantsCount) sidebarParticipantsCount.textContent = `${count}`;

    // Update avatar stack in header
    if (avatarsPreviewStack) {
      avatarsPreviewStack.innerHTML = '';
      participants.slice(0, 4).forEach(u => {
        const av = document.createElement('div');
        av.className = 'stack-avatar';
        av.style.backgroundColor = u.color || '#FF8066';
        av.title = u.username;
        av.textContent = (u.username || 'G').charAt(0).toUpperCase();
        avatarsPreviewStack.appendChild(av);
      });
      if (participants.length > 4) {
        const extra = document.createElement('div');
        extra.className = 'stack-avatar';
        extra.style.backgroundColor = '#292723';
        extra.textContent = `+${participants.length - 4}`;
        avatarsPreviewStack.appendChild(extra);
      }
    }

    // Update sidebar participants list
    if (participantsList) {
      participantsList.innerHTML = '';
      participants.forEach((user) => {
        const isSelf = user.socketId === currentUser.socketId;
        const item = document.createElement('div');
        item.className = 'participant-row-item';

        const avatar = document.createElement('div');
        avatar.className = 'part-avatar-dot';
        avatar.style.backgroundColor = user.color || '#FF8066';
        avatar.textContent = (user.username || 'G').charAt(0).toUpperCase();

        const nameSpan = document.createElement('span');
        nameSpan.className = 'part-name-text';
        nameSpan.textContent = user.username;

        item.appendChild(avatar);
        item.appendChild(nameSpan);

        if (isSelf) {
          const youTag = document.createElement('span');
          youTag.className = 'part-you-badge';
          youTag.textContent = '(You)';
          item.appendChild(youTag);
        }

        participantsList.appendChild(item);
      });
    }
  }

  function handleUserJoined(data) {
    showToast(`${data.username} joined the notebook!`);
  }

  function handleUserLeft(data) {
    showToast(`${data.username} left the notebook.`);
    if (data.socketId) {
      removeRemoteCursor(data.socketId);
    }
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

  function handleCursorMove(data) {
    if (!data || !data.socketId) return;
    const cursor = getOrCreateRemoteCursor(data.socketId, data.username, data.color);
    
    let x = data.x;
    let y = data.y;
    if (typeof data.nx === 'number' && typeof data.ny === 'number') {
      x = data.nx * logicalWidth;
      y = data.ny * logicalHeight;
    }

    cursor.targetX = x;
    cursor.targetY = y;
  }

  function handleCursorLeave(data) {
    if (data && data.socketId) {
      const c = remoteCursors.get(data.socketId);
      if (c) {
        c.targetX = -100;
        c.targetY = -100;
      }
    }
  }

  function handleReaction(data) {
    if (!data || !data.emoji) return;
    const x = typeof data.x === 'number' ? data.x * window.innerWidth : window.innerWidth / 2;
    const y = typeof data.y === 'number' ? data.y * window.innerHeight : window.innerHeight / 2;
    spawnFloatingReaction(data.emoji, x, y);
  }

  function handleBoardStateUpdated(updatedHistory) {
    if (Array.isArray(updatedHistory)) {
      drawingHistory = updatedHistory.slice();
      redrawAllStrokes();
    }
  }

  function handleRoomRenamed(data) {
    if (data && data.roomName) {
      currentRoomName = data.roomName;
      if (roomNameDisplay) roomNameDisplay.textContent = currentRoomName;
      document.title = `${currentRoomName} — Doodlebook Workspace`;
      showToast(`Notebook renamed to "${currentRoomName}"`);
    }
  }

  // --- Socket.IO Client Connection ---
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
    if (!p2pActive) initP2PFallback();
  });

  socket.on('disconnect', (reason) => {
    console.warn('Socket.IO disconnected:', reason);
    if (!p2pActive) updateConnectionStatus('disconnected');
  });

  socket.on('user-info', handleUserInfo);
  socket.on('room-info', handleRoomInfo);
  socket.on('initial-board-state', handleInitialBoardState);
  socket.on('draw', handleIncomingDraw);
  socket.on('clear-board', handleClearBoard);
  socket.on('participants-update', handleParticipantsUpdate);
  socket.on('user-joined', handleUserJoined);
  socket.on('user-left', handleUserLeft);
  socket.on('chat-history', handleChatHistory);
  socket.on('chat-message', handleChatMessage);
  socket.on('cursor-move', handleCursorMove);
  socket.on('cursor-leave', handleCursorLeave);
  socket.on('reaction', handleReaction);
  socket.on('board-state-updated', handleBoardStateUpdated);
  socket.on('room-renamed', handleRoomRenamed);
  socket.on('room-error', (data) => {
    alert(data.message || 'Room error encountered.');
    window.location.href = '/';
  });

  p2pFallbackTimer = setTimeout(() => {
    if (!socket.connected && !p2pActive) {
      initP2PFallback();
    }
  }, 1500);

  // --- WebRTC Peer-to-Peer Fallback ---
  const DOODLE_COLORS = [
    '#FF8066', '#6C9ED2', '#8EBB91', '#D9A7CE', '#F5D77A',
    '#B7A4DD', '#FB923C', '#2DD4BF', '#F43F5E', '#38BDF8'
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
      updateConnectionStatus('disconnected');
      return;
    }

    p2pActive = true;
    const cleanRoomId = (roomId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const hostPeerId = `doodlebook-room-${cleanRoomId}`;

    try {
      myPeer = new Peer(hostPeerId, { debug: 0 });
    } catch (e) {
      startAsGuest(hostPeerId);
      return;
    }

    myPeer.on('open', (id) => setupHost(id));
    myPeer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        if (myPeer) myPeer.destroy();
        startAsGuest(hostPeerId);
      } else {
        updateConnectionStatus('disconnected');
      }
    });
  }

  function setupHost(id) {
    isHost = true;
    updateConnectionStatus('connected', 'WebRTC P2P (Host)');

    currentUser = {
      socketId: id,
      username: activeNickname,
      color: DOODLE_COLORS[0],
      isHost: true
    };
    handleUserInfo(currentUser);
    p2pUsers.set(id, currentUser);
    broadcastP2PParticipants();

    myPeer.on('connection', (conn) => {
      p2pConnections.set(conn.peer, conn);

      conn.on('data', (packet) => handleP2PDataFromGuest(conn, packet));
      conn.on('close', () => handleP2PGuestDisconnect(conn.peer));
    });
  }

  function handleP2PGuestDisconnect(peerId) {
    const user = p2pUsers.get(peerId);
    p2pConnections.delete(peerId);
    p2pUsers.delete(peerId);

    if (user) {
      handleUserLeft({ username: user.username, socketId: peerId });
      broadcastToP2PGuests({ type: 'user-left', data: { username: user.username, socketId: peerId } });
      broadcastP2PParticipants();
    }
  }

  function handleP2PDataFromGuest(conn, packet) {
    if (!packet || typeof packet !== 'object') return;
    const { type, data } = packet;

    if (type === 'join-room') {
      const color = DOODLE_COLORS[p2pUsers.size % DOODLE_COLORS.length];
      const guestUser = {
        socketId: conn.peer,
        username: (data.username || 'Guest').slice(0, 25),
        color: color,
        isHost: false
      };
      p2pUsers.set(conn.peer, guestUser);

      conn.send({ type: 'user-info', data: guestUser });
      conn.send({ type: 'room-info', data: { roomName: currentRoomName } });
      conn.send({ type: 'initial-board-state', data: drawingHistory });
      conn.send({ type: 'chat-history', data: p2pChatHistory });

      handleUserJoined({ username: guestUser.username, color: guestUser.color });
      broadcastToP2PGuests({ type: 'user-joined', data: { username: guestUser.username, color: guestUser.color } });
      broadcastP2PParticipants();

    } else if (type === 'draw') {
      drawingHistory.push(data);
      renderStroke(data);
      broadcastToP2PGuests({ type: 'draw', data }, conn.peer);

    } else if (type === 'clear-board') {
      const user = p2pUsers.get(conn.peer);
      const name = user ? user.username : 'Someone';
      clearWhiteboard(name);
      broadcastToP2PGuests({ type: 'clear-board', data: { clearedBy: name } }, conn.peer);

    } else if (type === 'undo') {
      if (drawingHistory.length > 0) {
        drawingHistory.pop();
        redrawAllStrokes();
        broadcastToP2PGuests({ type: 'board-state-updated', data: drawingHistory });
      }

    } else if (type === 'cursor-move') {
      handleCursorMove({ ...data, socketId: conn.peer });
      broadcastToP2PGuests({ type: 'cursor-move', data: { ...data, socketId: conn.peer } }, conn.peer);

    } else if (type === 'cursor-leave') {
      handleCursorLeave({ socketId: conn.peer });
      broadcastToP2PGuests({ type: 'cursor-leave', data: { socketId: conn.peer } }, conn.peer);

    } else if (type === 'reaction') {
      handleReaction(data);
      broadcastToP2PGuests({ type: 'reaction', data }, conn.peer);

    } else if (type === 'chat-message') {
      const user = p2pUsers.get(conn.peer);
      const chatMsg = {
        id: Math.random().toString(36).substring(2, 9),
        socketId: conn.peer,
        username: user ? user.username : 'Guest',
        color: user ? user.color : '#FF8066',
        message: data.message,
        isSystem: false,
        timestamp: Date.now()
      };
      p2pChatHistory.push(chatMsg);
      handleChatMessage(chatMsg);
      broadcastToP2PGuests({ type: 'chat-message', data: chatMsg });
    }
  }

  function broadcastToP2PGuests(packet, excludePeerId = null) {
    for (const [peerId, conn] of p2pConnections) {
      if (peerId !== excludePeerId && conn.open) {
        try {
          conn.send(packet);
        } catch (err) {}
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

        if (type === 'user-info') handleUserInfo(data);
        else if (type === 'room-info') handleRoomInfo(data);
        else if (type === 'initial-board-state') handleInitialBoardState(data);
        else if (type === 'draw') handleIncomingDraw(data);
        else if (type === 'clear-board') handleClearBoard(data);
        else if (type === 'participants-update') handleParticipantsUpdate(data);
        else if (type === 'user-joined') handleUserJoined(data);
        else if (type === 'user-left') handleUserLeft(data);
        else if (type === 'chat-history') handleChatHistory(data);
        else if (type === 'chat-message') handleChatMessage(data);
        else if (type === 'cursor-move') handleCursorMove(data);
        else if (type === 'cursor-leave') handleCursorLeave(data);
        else if (type === 'reaction') handleReaction(data);
        else if (type === 'board-state-updated') handleBoardStateUpdated(data);
      });

      p2pHostConn.on('close', () => {
        updateConnectionStatus('disconnected');
        showToast('Room host disconnected. Reconnecting...');
        setTimeout(() => {
          p2pActive = false;
          initP2PFallback();
        }, 1500);
      });
    });

    myPeer.on('error', () => {
      updateConnectionStatus('disconnected');
    });
  }

  function p2pEmit(event, data) {
    if (isHost) {
      if (event === 'draw') broadcastToP2PGuests({ type: 'draw', data });
      else if (event === 'clear-board') broadcastToP2PGuests({ type: 'clear-board', data: { clearedBy: currentUser.username || 'You' } });
      else if (event === 'undo') {
        if (drawingHistory.length > 0) {
          drawingHistory.pop();
          redrawAllStrokes();
          broadcastToP2PGuests({ type: 'board-state-updated', data: drawingHistory });
        }
      } else if (event === 'cursor-move') broadcastToP2PGuests({ type: 'cursor-move', data: { ...data, socketId: myPeer ? myPeer.id : 'host' } });
      else if (event === 'cursor-leave') broadcastToP2PGuests({ type: 'cursor-leave', data: { socketId: myPeer ? myPeer.id : 'host' } });
      else if (event === 'reaction') broadcastToP2PGuests({ type: 'reaction', data });
      else if (event === 'chat-message') {
        const chatMsg = {
          id: Math.random().toString(36).substring(2, 9),
          socketId: myPeer ? myPeer.id : 'host',
          username: currentUser.username || 'Host',
          color: currentUser.color || '#FF8066',
          message: data.message,
          isSystem: false,
          timestamp: Date.now()
        };
        p2pChatHistory.push(chatMsg);
        handleChatMessage(chatMsg);
        broadcastToP2PGuests({ type: 'chat-message', data: chatMsg });
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

  // -------------------------------------------------------------------------
  // 6. DRAWING & PAN INTERACTION (POINTER EVENTS)
  // -------------------------------------------------------------------------
  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (rect.width * (window.devicePixelRatio || 1));
    const scaleY = canvas.height / (rect.height * (window.devicePixelRatio || 1));
    return {
      x: ((e.clientX - rect.left) / currentZoom) * scaleX,
      y: ((e.clientY - rect.top) / currentZoom) * scaleY
    };
  }

  function startDrawing(e) {
    if (e.button !== undefined && e.button !== 0 && e.button !== 1) return;

    // Pan with Select tool or middle click or spacebar
    if (currentTool === 'select' || e.button === 1 || e.spaceKey) {
      isPanning = true;
      panStartX = e.clientX - panOffsetX;
      panStartY = e.clientY - panOffsetY;
      canvasViewport.style.cursor = 'grabbing';
      return;
    }

    const { x, y } = getCanvasCoords(e);
    startX = x;
    startY = y;
    lastX = x;
    lastY = y;
    isDrawing = true;
    currentStrokeId = Math.random().toString(36).substring(2, 10);

    if (currentTool === 'text') {
      isDrawing = false;
      const textToDraw = window.prompt('Write doodle text note:');
      if (textToDraw && textToDraw.trim()) {
        const textData = {
          x,
          y,
          prevX: x,
          prevY: y,
          nx: logicalWidth > 0 ? x / logicalWidth : null,
          ny: logicalHeight > 0 ? y / logicalHeight : null,
          prevNx: logicalWidth > 0 ? x / logicalWidth : null,
          prevNy: logicalHeight > 0 ? y / logicalHeight : null,
          color: currentColor,
          size: currentSize,
          tool: 'text',
          text: textToDraw.trim(),
          strokeId: currentStrokeId
        };
        drawingHistory.push(textData);
        redoStack = [];
        renderStroke(textData);
        emitRealtime('draw', textData);
      }
      return;
    }

    // Freehand tools immediately draw a dot
    if (['pen', 'brush', 'highlighter', 'eraser'].includes(currentTool)) {
      drawSegment(x, y);
    }

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {}
  }

  function continueDrawing(e) {
    if (isPanning) {
      panOffsetX = e.clientX - panStartX;
      panOffsetY = e.clientY - panStartY;
      updateTransform();
      return;
    }

    if (!isDrawing) return;

    const { x, y } = getCanvasCoords(e);

    if (['pen', 'brush', 'highlighter', 'eraser'].includes(currentTool)) {
      if (Math.abs(x - lastX) < 0.5 && Math.abs(y - lastY) < 0.5) return;
      drawSegment(x, y);
      lastX = x;
      lastY = y;
    } else {
      // Shapes rubber-band live preview
      redrawAllStrokes();
      renderStroke({
        x,
        y,
        prevX: startX,
        prevY: startY,
        color: currentColor,
        size: currentSize,
        tool: currentTool
      });
    }
  }

  function stopDrawing(e) {
    if (isPanning) {
      isPanning = false;
      canvasViewport.style.cursor = currentTool === 'select' ? 'grab' : 'crosshair';
      return;
    }

    if (!isDrawing) return;
    isDrawing = false;

    if (['line', 'rect', 'circle', 'triangle', 'star'].includes(currentTool)) {
      const { x, y } = getCanvasCoords(e);
      const shapeData = {
        x,
        y,
        prevX: startX,
        prevY: startY,
        nx: logicalWidth > 0 ? x / logicalWidth : null,
        ny: logicalHeight > 0 ? y / logicalHeight : null,
        prevNx: logicalWidth > 0 ? startX / logicalWidth : null,
        prevNy: logicalHeight > 0 ? startY / logicalHeight : null,
        color: currentColor,
        size: currentSize,
        tool: currentTool,
        strokeId: currentStrokeId
      };
      drawingHistory.push(shapeData);
      redoStack = [];
      redrawAllStrokes();
      emitRealtime('draw', shapeData);
    }

    try {
      if (e && e.pointerId) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch (err) {}
  }

  function drawSegment(x, y) {
    const strokeData = {
      x,
      y,
      prevX: lastX,
      prevY: lastY,
      nx: logicalWidth > 0 ? x / logicalWidth : null,
      ny: logicalHeight > 0 ? y / logicalHeight : null,
      prevNx: logicalWidth > 0 ? lastX / logicalWidth : null,
      prevNy: logicalHeight > 0 ? lastY / logicalHeight : null,
      color: currentColor,
      size: currentSize,
      tool: currentTool,
      strokeId: currentStrokeId
    };

    renderStroke(strokeData);
    drawingHistory.push(strokeData);
    redoStack = [];
    emitRealtime('draw', strokeData);
  }

  canvas.addEventListener('pointerdown', startDrawing);
  canvas.addEventListener('pointermove', continueDrawing);
  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);
  canvas.addEventListener('pointerleave', stopDrawing);

  // -------------------------------------------------------------------------
  // 7. TOOLBAR ACTIONS & TOOL SELECTION
  // -------------------------------------------------------------------------
  function setActiveTool(toolName, targetBtn) {
    currentTool = toolName;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    if (targetBtn) targetBtn.classList.add('active');
    if (shapesPopover) shapesPopover.classList.remove('open');

    if (toolName === 'select') {
      canvasViewport.style.cursor = 'grab';
    } else {
      canvasViewport.style.cursor = 'crosshair';
    }
  }

  if (toolSelect) toolSelect.addEventListener('click', () => setActiveTool('select', toolSelect));
  if (toolPen) toolPen.addEventListener('click', () => setActiveTool('pen', toolPen));
  if (toolBrush) toolBrush.addEventListener('click', () => setActiveTool('brush', toolBrush));
  if (toolHighlighter) toolHighlighter.addEventListener('click', () => setActiveTool('highlighter', toolHighlighter));
  if (toolEraser) toolEraser.addEventListener('click', () => setActiveTool('eraser', toolEraser));
  if (toolLine) toolLine.addEventListener('click', () => setActiveTool('line', toolLine));
  if (toolText) toolText.addEventListener('click', () => setActiveTool('text', toolText));

  // Shapes Popover
  if (toolShapesDropdown && shapesPopover) {
    toolShapesDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      shapesPopover.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!toolShapesDropdown.contains(e.target) && !shapesPopover.contains(e.target)) {
        shapesPopover.classList.remove('open');
      }
    });

    shapeOpts.forEach(btn => {
      btn.addEventListener('click', () => {
        const shape = btn.getAttribute('data-shape');
        setActiveTool(shape, toolShapesDropdown);
      });
    });
  }

  // Color Swatches
  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      colorSwatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      currentColor = swatch.getAttribute('data-color');
      if (currentTool === 'eraser' || currentTool === 'select') {
        if (toolPen) toolPen.click();
      }
    });
  });

  // Custom Color Picker
  if (customColorPicker) {
    customColorPicker.addEventListener('input', (e) => {
      currentColor = e.target.value;
      colorSwatches.forEach(s => s.classList.remove('active'));
      if (currentTool === 'eraser' || currentTool === 'select') {
        if (toolPen) toolPen.click();
      }
    });
  }

  // Brush Size
  function setBrushSize(newSize) {
    currentSize = newSize;
    if (brushSizeSlider) brushSizeSlider.value = newSize;
    if (brushSizeValue) brushSizeValue.textContent = `${newSize}px`;

    sizePresetBtns.forEach(btn => {
      const val = parseInt(btn.getAttribute('data-size'), 10);
      if (val === newSize) btn.classList.add('active');
      else btn.classList.remove('active');
    });
  }

  sizePresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setBrushSize(parseInt(btn.getAttribute('data-size'), 10));
    });
  });

  if (brushSizeSlider) {
    brushSizeSlider.addEventListener('input', (e) => {
      setBrushSize(parseInt(e.target.value, 10));
    });
  }

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'v' || e.key === 'V') {
      if (toolSelect) toolSelect.click();
    } else if (e.key === 'p' || e.key === 'P') {
      if (toolPen) toolPen.click();
    } else if (e.key === 'b' || e.key === 'B') {
      if (toolBrush) toolBrush.click();
    } else if (e.key === 'h' || e.key === 'H') {
      if (toolHighlighter) toolHighlighter.click();
    } else if (e.key === 'e' || e.key === 'E') {
      if (toolEraser) toolEraser.click();
    } else if (e.key === 'l' || e.key === 'L') {
      if (toolLine) toolLine.click();
    } else if (e.key === 't' || e.key === 'T') {
      if (toolText) toolText.click();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) {
        if (btnRedo) btnRedo.click();
      } else {
        if (btnUndo) btnUndo.click();
      }
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      if (btnRedo) btnRedo.click();
    }
  });

  // Undo & Redo
  if (btnUndo) {
    btnUndo.addEventListener('click', () => {
      if (drawingHistory.length === 0) return;
      
      const lastStroke = drawingHistory[drawingHistory.length - 1];
      const targetStrokeId = lastStroke?.strokeId;

      if (targetStrokeId) {
        const undoneSegments = drawingHistory.filter(s => s.strokeId === targetStrokeId);
        drawingHistory = drawingHistory.filter(s => s.strokeId !== targetStrokeId);
        redoStack.push(undoneSegments);
      } else {
        const popped = drawingHistory.pop();
        if (popped) redoStack.push([popped]);
      }

      redrawAllStrokes();
      emitRealtime('undo', {});
      showToast('Undid stroke.');
    });
  }

  if (btnRedo) {
    btnRedo.addEventListener('click', () => {
      if (redoStack.length === 0) return;

      const itemsToRedo = redoStack.pop();
      if (Array.isArray(itemsToRedo)) {
        itemsToRedo.forEach(item => {
          drawingHistory.push(item);
          renderStroke(item);
          emitRealtime('draw', item);
        });
        showToast('Redid stroke.');
      }
    });
  }

  // Clear Whiteboard
  if (btnClearBoard && clearModal) {
    btnClearBoard.addEventListener('click', () => {
      clearModal.style.display = 'flex';
    });

    if (btnCancelClear) {
      btnCancelClear.addEventListener('click', () => {
        clearModal.style.display = 'none';
      });
    }

    clearModal.addEventListener('click', (e) => {
      if (e.target === clearModal) clearModal.style.display = 'none';
    });

    if (btnConfirmClear) {
      btnConfirmClear.addEventListener('click', () => {
        clearModal.style.display = 'none';
        clearWhiteboard('You');
        emitRealtime('clear-board', {});
      });
    }
  }

  // Export Canvas to PNG on Warm Paper Background
  if (btnDownloadBoard) {
    btnDownloadBoard.addEventListener('click', () => {
      if (!canvas) return;

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const exportCtx = exportCanvas.getContext('2d');

      // Warm paper background (#FFFDF7)
      exportCtx.fillStyle = '#FFFDF7';
      exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

      // Subtle paper grid lines
      exportCtx.strokeStyle = 'rgba(108, 158, 210, 0.12)';
      exportCtx.lineWidth = 1;
      for (let x = 0; x < exportCanvas.width; x += 24) {
        exportCtx.beginPath();
        exportCtx.moveTo(x, 0);
        exportCtx.lineTo(x, exportCanvas.height);
        exportCtx.stroke();
      }
      for (let y = 0; y < exportCanvas.height; y += 24) {
        exportCtx.beginPath();
        exportCtx.moveTo(0, y);
        exportCtx.lineTo(exportCanvas.width, y);
        exportCtx.stroke();
      }

      // Draw all artwork strokes
      exportCtx.drawImage(canvas, 0, 0);

      const dataUrl = exportCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `doodlebook-${roomId}.png`;
      link.href = dataUrl;
      link.click();
      showToast('Exported notebook page as PNG snapshot! 📷');
    });
  }

  // -------------------------------------------------------------------------
  // 8. COPY ROOM CODE & INVITE LINK & RENAME
  // -------------------------------------------------------------------------
  if (btnCopyRoomId) {
    btnCopyRoomId.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(roomId);
      } catch (err) {
        const temp = document.createElement('input');
        temp.value = roomId;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      showToast(`Copied room code: ${roomId}`);
    });
  }

  function copyInvite() {
    const inviteUrl = `${window.location.origin}/room/${roomId}`;
    try {
      navigator.clipboard.writeText(inviteUrl);
    } catch (e) {
      const temp = document.createElement('input');
      temp.value = inviteUrl;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
    }
    showToast('Shareable link copied to clipboard! ✨');
  }

  if (btnCopyInviteLink) btnCopyInviteLink.addEventListener('click', copyInvite);
  if (btnInviteModal) btnInviteModal.addEventListener('click', copyInvite);

  // Rename Notebook
  if (btnEditRoomName) {
    btnEditRoomName.addEventListener('click', () => {
      const newName = window.prompt('Rename this Doodlebook notebook:', currentRoomName);
      if (newName && newName.trim() && newName.trim() !== currentRoomName) {
        const clean = newName.trim().slice(0, 50);
        currentRoomName = clean;
        if (roomNameDisplay) roomNameDisplay.textContent = clean;
        document.title = `${clean} — Doodlebook Workspace`;
        emitRealtime('rename-room', { roomName: clean });
        showToast(`Notebook renamed to "${clean}"`);
      }
    });
  }

  // Change nickname on avatar click
  if (currentUserBadge) {
    currentUserBadge.addEventListener('click', () => {
      const currentName = currentUser.username || activeNickname || 'Guest';
      const newName = window.prompt('Change your nickname:', currentName);
      if (newName && newName.trim() && newName.trim() !== currentName) {
        const cleanName = newName.trim().slice(0, 25);
        activeNickname = cleanName;
        currentUser.username = cleanName;
        localStorage.setItem('doodle_nickname', cleanName);
        localStorage.setItem('collabboard_nickname', cleanName);
        if (myNicknameDisplay) myNicknameDisplay.textContent = cleanName;
        if (myAvatar) myAvatar.textContent = cleanName.charAt(0).toUpperCase();

        emitRealtime('change-nickname', { username: cleanName });
        showToast(`Nickname updated to "${cleanName}".`);
      }
    });
  }

  // -------------------------------------------------------------------------
  // 9. LIVE CHAT
  // -------------------------------------------------------------------------
  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = (chatInput.value || '').trim();
      if (!text) return;

      emitRealtime('chat-message', { message: text });
      chatInput.value = '';
      chatInput.focus();
    });
  }

  function formatTime(timestamp) {
    const d = new Date(timestamp || Date.now());
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function appendChatMessage(msg) {
    if (!chatMessages) return;

    if (msg.isSystem) {
      const sysDiv = document.createElement('div');
      sysDiv.className = 'chat-system-tag';
      sysDiv.textContent = msg.message;
      chatMessages.appendChild(sysDiv);
    } else {
      const isSelf = (msg.socketId && currentUser.socketId && msg.socketId === currentUser.socketId) || 
                     (msg.username === currentUser.username);
      const card = document.createElement('div');
      card.className = `chat-bubble-card ${isSelf ? 'msg-self' : ''}`;

      const header = document.createElement('div');
      header.className = 'chat-author-line';

      const author = document.createElement('span');
      author.className = 'chat-author-name';
      author.style.color = msg.color || '#292723';
      author.textContent = isSelf ? 'You' : msg.username;

      const time = document.createElement('span');
      time.className = 'chat-time-tag';
      time.textContent = formatTime(msg.timestamp);

      header.appendChild(author);
      header.appendChild(time);

      const body = document.createElement('div');
      body.textContent = msg.message;

      card.appendChild(header);
      card.appendChild(body);
      chatMessages.appendChild(card);
    }

    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Toggle mobile sidebar
  if (btnToggleSidebar && collabSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      collabSidebar.classList.toggle('open');
      if (unreadDot) unreadDot.style.display = 'none';
    });
  }

  // -------------------------------------------------------------------------
  // 10. TOAST NOTIFICATIONS
  // -------------------------------------------------------------------------
  function showToast(text) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>✏️</span><span>${text}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 2800);
  }
});
