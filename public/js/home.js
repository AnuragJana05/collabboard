document.addEventListener('DOMContentLoaded', () => {
  const createForm = document.getElementById('createRoomForm');
  const joinForm = document.getElementById('joinRoomForm');
  const createNicknameInput = document.getElementById('createNickname');
  const joinNicknameInput = document.getElementById('joinNickname');
  const joinRoomIdInput = document.getElementById('joinRoomId');
  const joinErrorMsg = document.getElementById('joinErrorMsg');
  const btnJoinRoom = document.getElementById('btnJoinRoom');

  // Prepopulate nickname from localStorage if previously used
  const savedNickname = localStorage.getItem('collabboard_nickname');
  if (savedNickname) {
    if (createNicknameInput) createNicknameInput.value = savedNickname;
    if (joinNicknameInput) joinNicknameInput.value = savedNickname;
  }

  // Sync nicknames between inputs for convenience
  if (createNicknameInput && joinNicknameInput) {
    createNicknameInput.addEventListener('input', (e) => {
      if (!joinNicknameInput.value || joinNicknameInput.value === savedNickname) {
        joinNicknameInput.value = e.target.value;
      }
    });
  }

  // Force uppercase on Room ID input
  if (joinRoomIdInput) {
    joinRoomIdInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      if (joinErrorMsg) {
        joinErrorMsg.style.display = 'none';
        joinErrorMsg.textContent = '';
      }
    });
  }

  // Handle Create Room submission
  if (createForm) {
    createForm.addEventListener('submit', (e) => {
      const nickname = (createNicknameInput.value || '').trim();
      if (!nickname) {
        e.preventDefault();
        alert('Please enter a nickname to create a room.');
        createNicknameInput.focus();
        return;
      }
      localStorage.setItem('collabboard_nickname', nickname);
    });
  }

  // Handle Join Room submission with dynamic server-side validation
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
        showJoinError('Please enter a Room ID.');
        joinRoomIdInput.focus();
        return;
      }

      localStorage.setItem('collabboard_nickname', nickname);

      // Disable button and check if room exists
      if (btnJoinRoom) {
        btnJoinRoom.disabled = true;
        btnJoinRoom.querySelector('span').textContent = 'Validating...';
      }

      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/exists`);
        const data = await response.json();

        if (data.exists) {
          // Room exists! Navigate to room
          window.location.href = `/room/${encodeURIComponent(roomId)}?nickname=${encodeURIComponent(nickname)}`;
        } else {
          showJoinError(`Room "${roomId}" was not found or has expired.`);
          if (btnJoinRoom) {
            btnJoinRoom.disabled = false;
            btnJoinRoom.querySelector('span').textContent = 'Join Room';
          }
        }
      } catch (err) {
        console.error('Error validating room:', err);
        // Fallback to direct form submit if fetch fails
        joinForm.submit();
      }
    });
  }

  function showJoinError(message) {
    if (joinErrorMsg) {
      joinErrorMsg.textContent = message;
      joinErrorMsg.style.display = 'block';
    } else {
      alert(message);
    }
  }
});
