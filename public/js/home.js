document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - Forms & Inputs
  const createForm = document.getElementById('createRoomForm');
  const joinForm = document.getElementById('joinRoomForm');
  const createNicknameInput = document.getElementById('createNickname');
  const createRoomNameInput = document.getElementById('createRoomName');
  const joinNicknameInput = document.getElementById('joinNickname');
  const joinRoomIdInput = document.getElementById('joinRoomId');
  const joinErrorMsg = document.getElementById('joinErrorMsg');
  const btnJoinRoom = document.getElementById('btnJoinRoom');

  const recentRoomsContainer = document.getElementById('recentRoomsContainer');
  const recentRoomsList = document.getElementById('recentRoomsList');
  const btnClearRecents = document.getElementById('btnClearRecents');

  // Prepopulate nickname from localStorage
  const savedNickname = localStorage.getItem('doodle_nickname') || localStorage.getItem('collabboard_nickname') || '';
  if (savedNickname) {
    if (createNicknameInput) createNicknameInput.value = savedNickname;
    if (joinNicknameInput) joinNicknameInput.value = savedNickname;
  }

  // Prepopulate Room ID from URL if present (?roomId=XYZ or ?join=XYZ)
  const urlParams = new URLSearchParams(window.location.search);
  const paramRoomId = (urlParams.get('roomId') || urlParams.get('join') || '').trim().toUpperCase();
  if (paramRoomId && joinRoomIdInput) {
    joinRoomIdInput.value = paramRoomId;
    if (joinNicknameInput && !joinNicknameInput.value) {
      joinNicknameInput.focus();
    }
  }

  // Auto uppercase and sanitize Room ID input
  if (joinRoomIdInput) {
    joinRoomIdInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      if (joinErrorMsg) {
        joinErrorMsg.style.display = 'none';
        joinErrorMsg.textContent = '';
      }
    });
  }

  // Sync nicknames between forms
  if (createNicknameInput && joinNicknameInput) {
    createNicknameInput.addEventListener('input', (e) => {
      if (!joinNicknameInput.value || joinNicknameInput.value === savedNickname) {
        joinNicknameInput.value = e.target.value;
      }
    });
    joinNicknameInput.addEventListener('input', (e) => {
      if (!createNicknameInput.value || createNicknameInput.value === savedNickname) {
        createNicknameInput.value = e.target.value;
      }
    });
  }

  // Helper to save recent rooms
  function saveRecentRoom(roomId, roomName = 'Doodle Session') {
    if (!roomId) return;
    try {
      let recents = JSON.parse(localStorage.getItem('doodle_recent_rooms') || '[]');
      recents = recents.filter(r => r.roomId !== roomId);
      recents.unshift({ roomId, roomName, visitedAt: Date.now() });
      if (recents.length > 8) recents = recents.slice(0, 8);
      localStorage.setItem('doodle_recent_rooms', JSON.stringify(recents));
    } catch (err) {
      console.warn('Failed to save recent room:', err);
    }
  }

  // Render recent rooms with scrapbook card style
  function renderRecentRooms() {
    if (!recentRoomsContainer || !recentRoomsList) return;
    try {
      const recents = JSON.parse(localStorage.getItem('doodle_recent_rooms') || '[]');
      if (!recents || recents.length === 0) {
        recentRoomsContainer.style.display = 'none';
        return;
      }

      recentRoomsContainer.style.display = 'block';
      recentRoomsList.innerHTML = '';

      const currentNick = createNicknameInput?.value || joinNicknameInput?.value || savedNickname || 'Guest';

      recents.forEach(room => {
        const timeAgo = formatTimeAgo(room.visitedAt);
        const card = document.createElement('a');
        card.className = 'notebook-thumb-card';
        card.href = `/room/${encodeURIComponent(room.roomId)}?nickname=${encodeURIComponent(currentNick)}`;
        
        card.innerHTML = `
          <div class="washi-tape washi-yellow tape-top-right" style="width: 55px; height: 16px;"></div>
          <div class="thumb-preview-box" style="height: 100px;">
            <span style="font-size: 2.2rem;">📓</span>
          </div>
          <h4 class="thumb-title">${escapeHtml(room.roomName || room.roomId)}</h4>
          <div class="thumb-meta">
            <span class="thumb-participants">Code: ${escapeHtml(room.roomId)}</span>
            <span>${timeAgo}</span>
          </div>
        `;

        recentRoomsList.appendChild(card);
      });
    } catch (err) {
      console.warn('Error loading recent rooms:', err);
    }
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'recently';
    const elapsedSec = Math.floor((Date.now() - timestamp) / 1000);
    if (elapsedSec < 60) return 'just now';
    const elapsedMin = Math.floor(elapsedSec / 60);
    if (elapsedMin < 60) return `${elapsedMin}m ago`;
    const elapsedHours = Math.floor(elapsedMin / 60);
    if (elapsedHours < 24) return `${elapsedHours}h ago`;
    return `${Math.floor(elapsedHours / 24)}d ago`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s]));
  }

  if (btnClearRecents) {
    btnClearRecents.addEventListener('click', () => {
      localStorage.removeItem('doodle_recent_rooms');
      renderRecentRooms();
    });
  }

  renderRecentRooms();

  // Create Room Submission
  if (createForm) {
    createForm.addEventListener('submit', (e) => {
      const nickname = (createNicknameInput.value || '').trim();
      const roomName = (createRoomNameInput ? createRoomNameInput.value : '').trim() || 'Chill Doodles';
      if (!nickname) {
        e.preventDefault();
        alert('Please enter your nickname to create a notebook.');
        createNicknameInput.focus();
        return;
      }
      localStorage.setItem('doodle_nickname', nickname);
      localStorage.setItem('collabboard_nickname', nickname);
    });
  }

  // Join Room Submission
  if (joinForm) {
    joinForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nickname = (joinNicknameInput.value || '').trim();
      const roomId = (joinRoomIdInput.value || '').trim().toUpperCase();

      if (!nickname) {
        showJoinError('Please enter your nickname.');
        joinNicknameInput.focus();
        return;
      }

      if (!roomId) {
        showJoinError('Please enter a room code.');
        joinRoomIdInput.focus();
        return;
      }

      localStorage.setItem('doodle_nickname', nickname);
      localStorage.setItem('collabboard_nickname', nickname);

      if (btnJoinRoom) {
        btnJoinRoom.disabled = true;
        btnJoinRoom.querySelector('span').textContent = 'Opening notebook...';
      }

      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/exists`);
        const data = await response.json();

        if (data.exists) {
          saveRecentRoom(roomId);
          window.location.href = `/room/${encodeURIComponent(roomId)}?nickname=${encodeURIComponent(nickname)}`;
        } else {
          showJoinError(`Room "${roomId}" was not found or has expired.`);
          if (btnJoinRoom) {
            btnJoinRoom.disabled = false;
            btnJoinRoom.querySelector('span').textContent = 'Join Drawing Session →';
          }
        }
      } catch (err) {
        console.error('Error validating room:', err);
        joinForm.submit();
      }
    });
  }

  function showJoinError(message) {
    if (joinErrorMsg) {
      joinErrorMsg.textContent = message;
      joinErrorMsg.style.display = 'flex';
    } else {
      alert(message);
    }
  }

  // =========================================================================
  // HERO OPEN NOTEBOOK INTERACTIVE PREVIEW CANVAS
  // =========================================================================
  const previewCanvas = document.getElementById('heroDoodleCanvas');
  const previewContainer = document.getElementById('previewCanvasContainer');
  const simCursor1 = document.getElementById('simCursor1');
  const simCursor2 = document.getElementById('simCursor2');
  const simCursor3 = document.getElementById('simCursor3');
  const btnResetPreview = document.getElementById('btnResetPreview');

  if (previewCanvas && previewContainer) {
    const ctx = previewCanvas.getContext('2d');
    let width = 0;
    let height = 0;

    function resizePreview() {
      const rect = previewContainer.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = window.devicePixelRatio || 1;
      previewCanvas.width = width * dpr;
      previewCanvas.height = height * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      renderBaseNotebookDoodles();
    }

    // Render charming sketchbook base doodles
    function renderBaseNotebookDoodles() {
      ctx.clearRect(0, 0, width, height);

      // Subtle notebook ruled lines / grid
      ctx.strokeStyle = 'rgba(108, 158, 210, 0.12)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Red notebook margin line on left
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(28, 0);
      ctx.lineTo(28, height);
      ctx.stroke();

      // 1. Smiling Sun (Warm yellow marker)
      drawSunDoodle(ctx, width * 0.45, height * 0.25, 30);

      // 2. Cute Cat Face
      drawCatDoodle(ctx, width * 0.25, height * 0.65, 34);

      // 3. Cute House
      drawHouseDoodle(ctx, width * 0.52, height * 0.72, 36);

      // 4. Little Green Dinosaur
      drawDinoDoodle(ctx, width * 0.82, height * 0.75, 32);

      // 5. Planet with ring
      drawPlanetDoodle(ctx, width * 0.78, height * 0.24, 20);

      // 6. Pastel Heart & Flowers
      drawHeartDoodle(ctx, width * 0.66, height * 0.28, 20, '#FF8066');
      drawFlowerDoodle(ctx, width * 0.20, height * 0.85, 14, '#FF8066');
      drawFlowerDoodle(ctx, width * 0.72, height * 0.88, 14, '#8EBB91');

      // 7. Hand-drawn text
      ctx.save();
      ctx.fillStyle = '#292723';
      ctx.font = 'bold 16px "Patrick Hand", cursive';
      ctx.fillText('a good vibes only!', width * 0.73, height * 0.45);
      ctx.restore();
    }

    // Helper: Draw Smiling Sun
    function drawSunDoodle(c, x, y, r) {
      c.save();
      // Sun fill
      c.fillStyle = '#F5D77A';
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#292723';
      c.lineWidth = 2.2;
      c.stroke();

      // Sun face
      c.fillStyle = '#292723';
      c.beginPath();
      c.arc(x - 9, y - 4, 3, 0, Math.PI * 2);
      c.arc(x + 9, y - 4, 3, 0, Math.PI * 2);
      c.fill();
      // Smile
      c.beginPath();
      c.arc(x, y + 2, 10, 0.1 * Math.PI, 0.9 * Math.PI);
      c.stroke();

      // Rays
      c.strokeStyle = '#F97316';
      c.lineWidth = 2.5;
      c.lineCap = 'round';
      const numRays = 8;
      for (let i = 0; i < numRays; i++) {
        const angle = (i * 2 * Math.PI) / numRays;
        const x1 = x + Math.cos(angle) * (r + 4);
        const y1 = y + Math.sin(angle) * (r + 4);
        const x2 = x + Math.cos(angle) * (r + 14);
        const y2 = y + Math.sin(angle) * (r + 14);
        c.beginPath();
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.stroke();
      }
      c.restore();
    }

    // Helper: Draw Cat Doodle
    function drawCatDoodle(c, x, y, r) {
      c.save();
      c.fillStyle = '#FFFDF7';
      c.strokeStyle = '#292723';
      c.lineWidth = 2.2;
      // Head
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      c.stroke();

      // Ears with orange patches
      c.fillStyle = '#FB923C';
      c.beginPath();
      c.moveTo(x - r * 0.7, y - r * 0.5);
      c.lineTo(x - r * 0.9, y - r * 1.1);
      c.lineTo(x - r * 0.2, y - r * 0.85);
      c.closePath();
      c.fill();
      c.stroke();

      c.beginPath();
      c.moveTo(x + r * 0.7, y - r * 0.5);
      c.lineTo(x + r * 0.9, y - r * 1.1);
      c.lineTo(x + r * 0.2, y - r * 0.85);
      c.closePath();
      c.fill();
      c.stroke();

      // Eyes
      c.fillStyle = '#292723';
      c.beginPath();
      c.arc(x - 10, y - 2, 3, 0, Math.PI * 2);
      c.arc(x + 10, y - 2, 3, 0, Math.PI * 2);
      c.fill();

      // Nose & mouth
      c.beginPath();
      c.arc(x, y + 5, 2.5, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(x - 5, y + 8, 5, 0, Math.PI);
      c.arc(x + 5, y + 8, 5, 0, Math.PI);
      c.stroke();

      // Whiskers
      c.beginPath();
      c.moveTo(x - 16, y + 5); c.lineTo(x - 28, y + 3);
      c.moveTo(x - 16, y + 9); c.lineTo(x - 26, y + 11);
      c.moveTo(x + 16, y + 5); c.lineTo(x + 28, y + 3);
      c.moveTo(x + 16, y + 9); c.lineTo(x + 26, y + 11);
      c.stroke();
      c.restore();
    }

    // Helper: Draw House Doodle
    function drawHouseDoodle(c, x, y, s) {
      c.save();
      c.strokeStyle = '#292723';
      c.lineWidth = 2.2;
      c.fillStyle = '#FAF6ED';

      // Base
      c.fillRect(x - s * 0.6, y, s * 1.2, s);
      c.strokeRect(x - s * 0.6, y, s * 1.2, s);

      // Roof (red)
      c.fillStyle = '#FF8066';
      c.beginPath();
      c.moveTo(x - s * 0.75, y);
      c.lineTo(x, y - s * 0.7);
      c.lineTo(x + s * 0.75, y);
      c.closePath();
      c.fill();
      c.stroke();

      // Door
      c.fillStyle = '#F5D77A';
      c.beginPath();
      c.arc(x, y + s * 0.45, s * 0.25, Math.PI, 0);
      c.lineTo(x + s * 0.25, y + s);
      c.lineTo(x - s * 0.25, y + s);
      c.closePath();
      c.fill();
      c.stroke();

      c.restore();
    }

    // Helper: Draw Dino Doodle
    function drawDinoDoodle(c, x, y, s) {
      c.save();
      c.fillStyle = '#8EBB91';
      c.strokeStyle = '#292723';
      c.lineWidth = 2.2;

      // Dino body
      c.beginPath();
      c.moveTo(x, y + s);
      c.quadraticCurveTo(x - s * 0.6, y + s, x - s * 0.5, y + s * 0.3);
      c.quadraticCurveTo(x - s * 0.4, y - s * 0.4, x, y - s * 0.4);
      c.quadraticCurveTo(x + s * 0.6, y - s * 0.4, x + s * 0.5, y + s * 0.1);
      c.quadraticCurveTo(x + s * 0.9, y + s * 0.4, x + s * 0.8, y + s * 0.8);
      c.lineTo(x + s * 0.5, y + s);
      c.closePath();
      c.fill();
      c.stroke();

      // Spikes on back
      c.fillStyle = '#F5D77A';
      for (let i = 0; i < 3; i++) {
        const sx = x - s * 0.4 + i * (s * 0.3);
        const sy = y - s * 0.2 + (i === 1 ? -6 : 0);
        c.beginPath();
        c.moveTo(sx - 4, sy);
        c.lineTo(sx, sy - 8);
        c.lineTo(sx + 4, sy);
        c.closePath();
        c.fill();
        c.stroke();
      }

      // Eye
      c.fillStyle = '#292723';
      c.beginPath();
      c.arc(x + s * 0.3, y - s * 0.2, 2.5, 0, Math.PI * 2);
      c.fill();

      // Cheerful smile
      c.beginPath();
      c.arc(x + s * 0.35, y - s * 0.05, 4, 0, Math.PI * 0.7);
      c.stroke();

      c.restore();
    }

    // Helper: Draw Planet
    function drawPlanetDoodle(c, x, y, r) {
      c.save();
      c.fillStyle = '#D9A7CE';
      c.strokeStyle = '#292723';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      c.stroke();

      // Ring
      c.beginPath();
      c.ellipse(x, y, r * 1.8, r * 0.45, -0.3, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }

    // Helper: Draw Heart
    function drawHeartDoodle(c, x, y, size, color) {
      c.save();
      c.fillStyle = color;
      c.strokeStyle = '#292723';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, y);
      c.bezierCurveTo(x - size, y - size, x - size * 1.4, y + size * 0.3, x, y + size * 1.1);
      c.bezierCurveTo(x + size * 1.4, y + size * 0.3, x + size, y - size, x, y);
      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
    }

    // Helper: Draw Flower
    function drawFlowerDoodle(c, x, y, r, color) {
      c.save();
      c.fillStyle = color;
      c.strokeStyle = '#292723';
      c.lineWidth = 1.8;
      for (let i = 0; i < 5; i++) {
        const ang = (i * 2 * Math.PI) / 5;
        const px = x + Math.cos(ang) * r;
        const py = y + Math.sin(ang) * r;
        c.beginPath();
        c.arc(px, py, r * 0.7, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
      c.fillStyle = '#F5D77A';
      c.beginPath();
      c.arc(x, y, r * 0.6, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.restore();
    }

    resizePreview();
    window.addEventListener('resize', resizePreview);

    // Interactive user drawing on preview canvas
    let userDrawing = false;
    let uLastX = 0;
    let uLastY = 0;

    function getCoords(e) {
      const rect = previewCanvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }

    previewCanvas.addEventListener('pointerdown', (e) => {
      userDrawing = true;
      const { x, y } = getCoords(e);
      uLastX = x;
      uLastY = y;
      drawPreviewStroke(x, y, x + 0.1, y + 0.1, '#FF8066', 4);
    });

    previewCanvas.addEventListener('pointermove', (e) => {
      if (!userDrawing) return;
      const { x, y } = getCoords(e);
      drawPreviewStroke(uLastX, uLastY, x, y, '#FF8066', 4);
      uLastX = x;
      uLastY = y;
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach(evt => {
      previewCanvas.addEventListener(evt, () => { userDrawing = false; });
    });

    function drawPreviewStroke(x0, y0, x1, y1, color, size = 4) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
    }

    if (btnResetPreview) {
      btnResetPreview.addEventListener('click', () => {
        renderBaseNotebookDoodles();
      });
    }

    // Automated participant simulated cursor trajectories
    let animAngle = 0;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function animateSimCursors() {
      if (!prefersReducedMotion && previewContainer) {
        animAngle += 0.02;
        const cx1 = width * 0.65 + Math.cos(animAngle) * 35;
        const cy1 = height * 0.35 + Math.sin(animAngle * 1.5) * 20;

        const cx2 = width * 0.35 + Math.cos(animAngle * 0.8) * 40;
        const cy2 = height * 0.65 + Math.sin(animAngle) * 25;

        const cx3 = width * 0.82 + Math.sin(animAngle * 1.2) * 25;
        const cy3 = height * 0.78 + Math.cos(animAngle * 0.9) * 15;

        if (simCursor1) simCursor1.style.transform = `translate3d(${cx1}px, ${cy1}px, 0)`;
        if (simCursor2) simCursor2.style.transform = `translate3d(${cx2}px, ${cy2}px, 0)`;
        if (simCursor3) simCursor3.style.transform = `translate3d(${cx3}px, ${cy3}px, 0)`;
      }

      requestAnimationFrame(animateSimCursors);
    }
    requestAnimationFrame(animateSimCursors);
  }
});
