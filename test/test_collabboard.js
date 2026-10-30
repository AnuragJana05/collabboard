const assert = require('assert');
const { io: Client } = require('socket.io-client');

const SERVER_URL = process.env.TEST_URL || 'http://localhost:3000';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCollabBoardTests() {
  console.log('===============================================================');
  console.log(` STARTING COLLABBOARD LIVE INTEGRATION TESTS ON ${SERVER_URL} `);
  console.log('===============================================================\n');

  try {
    // -------------------------------------------------------------
    // TEST 1: Landing page HTTP GET /
    // -------------------------------------------------------------
    console.log('[Test 1] Testing Landing Page GET / ...');
    const landingRes = await fetch(`${SERVER_URL}/`);
    assert.strictEqual(landingRes.status, 200, 'Landing page should return 200 OK');
    const landingHtml = await landingRes.text();
    assert(landingHtml.includes('doodlebook') || landingHtml.includes('CollabBoard'), 'Landing page should contain brand');
    assert(landingHtml.includes('Endless doodles') || landingHtml.includes('Draw. Collaborate. Create.'), 'Landing page should contain tagline');
    assert(landingHtml.includes('Create a Room'), 'Landing page should contain "Create a Room"');
    assert(landingHtml.includes('Join a Room'), 'Landing page should contain "Join a Room"');
    console.log('✓ Landing page responded with 200 OK and expected branding.');

    // -------------------------------------------------------------
    // TEST 2: Create a Room via POST /create-room (Client A: Anurag)
    // -------------------------------------------------------------
    console.log('\n[Test 2] Client A creates room via POST /create-room...');
    const createRes = await fetch(`${SERVER_URL}/create-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ nickname: 'Anurag' })
    });
    assert.strictEqual(createRes.status, 200, 'Create room endpoint should return 200');
    const createData = await createRes.json();
    assert(createData.success, 'Create room should be successful');
    assert(createData.roomId && typeof createData.roomId === 'string', 'Should return a valid roomId');
    const roomId = createData.roomId;
    console.log(`✓ Room created successfully! Room ID: ${roomId}`);

    // Verify room exists via /api/rooms/:roomId/exists
    const existsRes = await fetch(`${SERVER_URL}/api/rooms/${roomId}/exists`);
    const existsData = await existsRes.json();
    assert.strictEqual(existsData.exists, true, 'Room existence check should be true');
    console.log(`✓ Verified room exists via API: ${roomId}`);

    // -------------------------------------------------------------
    // TEST 3: Client A (Anurag) connects via Socket.IO
    // -------------------------------------------------------------
    console.log('\n[Test 3] Client A (Anurag) connects and joins room...');
    const clientA = Client(SERVER_URL);
    let aUserInfo = null;
    let aParticipantsData = null;
    let aInitialBoard = null;

    clientA.on('user-info', info => { aUserInfo = info; });
    clientA.on('participants-update', data => { aParticipantsData = data; });
    clientA.on('initial-board-state', board => { aInitialBoard = board; });

    clientA.emit('join-room', { roomId, username: 'Anurag' });
    await wait(200);

    assert(aUserInfo && aUserInfo.username === 'Anurag', 'Client A should receive user-info');
    assert.strictEqual(aParticipantsData.count, 1, 'Initial room participant count should be 1');
    assert(Array.isArray(aInitialBoard) && aInitialBoard.length === 0, 'New room should have empty initial board');
    console.log(`✓ Client A joined! User: ${aUserInfo.username}, Color: ${aUserInfo.color}, Participants: ${aParticipantsData.count}`);

    // -------------------------------------------------------------
    // TEST 4: Client B (Rahul) joins the same room
    // -------------------------------------------------------------
    console.log('\n[Test 4] Client B (Rahul) joins the room...');
    const clientB = Client(SERVER_URL);
    let bUserInfo = null;
    let aSawUserJoined = null;

    clientA.on('user-joined', data => { aSawUserJoined = data; });
    clientB.on('user-info', info => { bUserInfo = info; });

    clientB.emit('join-room', { roomId, username: 'Rahul' });
    await wait(200);

    assert(bUserInfo && bUserInfo.username === 'Rahul', 'Client B should receive user-info');
    assert(aSawUserJoined && aSawUserJoined.username === 'Rahul', 'Client A should receive user-joined notification');
    assert.strictEqual(aParticipantsData.count, 2, 'Participant count should update to 2');
    console.log(`✓ Client B joined! Total participants: ${aParticipantsData.count}`);

    // -------------------------------------------------------------
    // TEST 5: Client C (Priya) joins the same room
    // -------------------------------------------------------------
    console.log('\n[Test 5] Client C (Priya) joins the room...');
    const clientC = Client(SERVER_URL);
    let cUserInfo = null;
    clientC.on('user-info', info => { cUserInfo = info; });

    clientC.emit('join-room', { roomId, username: 'Priya' });
    await wait(200);

    assert(cUserInfo && cUserInfo.username === 'Priya', 'Client C should receive user-info');
    assert.strictEqual(aParticipantsData.count, 3, 'Participant count should update to 3');
    console.log(`✓ Client C joined! Total participants: ${aParticipantsData.count}`);

    // -------------------------------------------------------------
    // TEST 6: Client A draws a stroke -> B and C receive real-time draw event
    // -------------------------------------------------------------
    console.log('\n[Test 6] Client A draws on whiteboard...');
    let bReceivedStroke = null;
    let cReceivedStroke = null;

    clientB.on('draw', stroke => { bReceivedStroke = stroke; });
    clientC.on('draw', stroke => { cReceivedStroke = stroke; });

    const strokeFromA = {
      x: 250,
      y: 180,
      prevX: 240,
      prevY: 170,
      nx: 0.25,
      ny: 0.18,
      prevNx: 0.24,
      prevNy: 0.17,
      color: '#38bdf8',
      size: 5,
      tool: 'pen'
    };

    clientA.emit('draw', strokeFromA);
    await wait(150);

    assert(bReceivedStroke, 'Client B should receive drawing event');
    assert.strictEqual(bReceivedStroke.x, 250);
    assert.strictEqual(bReceivedStroke.color, '#38bdf8');
    assert(cReceivedStroke, 'Client C should receive drawing event');
    assert.strictEqual(cReceivedStroke.x, 250);
    console.log('✓ Drawing from Client A successfully received by both Client B and Client C.');

    // -------------------------------------------------------------
    // TEST 7: Client B draws with eraser tool -> A and C receive eraser stroke
    // -------------------------------------------------------------
    console.log('\n[Test 7] Client B draws with eraser...');
    let aReceivedEraser = null;
    let cReceivedEraser = null;

    clientA.on('draw', stroke => { aReceivedEraser = stroke; });
    clientC.on('draw', stroke => { cReceivedEraser = stroke; });

    const eraserFromB = {
      x: 245,
      y: 175,
      prevX: 240,
      prevY: 170,
      nx: 0.245,
      ny: 0.175,
      prevNx: 0.24,
      prevNy: 0.17,
      color: '#ffffff',
      size: 20,
      tool: 'eraser'
    };

    clientB.emit('draw', eraserFromB);
    await wait(150);

    assert(aReceivedEraser, 'Client A should receive eraser stroke');
    assert.strictEqual(aReceivedEraser.tool, 'eraser');
    assert(cReceivedEraser, 'Client C should receive eraser stroke');
    assert.strictEqual(cReceivedEraser.tool, 'eraser');
    console.log('✓ Eraser stroke from Client B received by Clients A and C with tool="eraser".');

    // -------------------------------------------------------------
    // TEST 8: Real-Time Chat & XSS Sanitization
    // -------------------------------------------------------------
    console.log('\n[Test 8] Client A sends chat message with HTML injection attempt...');
    let bReceivedChat = null;
    let cReceivedChat = null;

    clientB.on('chat-message', msg => { if (!msg.isSystem) bReceivedChat = msg; });
    clientC.on('chat-message', msg => { if (!msg.isSystem) cReceivedChat = msg; });

    clientA.emit('chat-message', {
      message: 'Hello everyone! <script>alert("xss")</script><img src="x" onerror="alert(1)">'
    });
    await wait(150);

    assert(bReceivedChat, 'Client B should receive chat message');
    assert.strictEqual(bReceivedChat.username, 'Anurag');
    assert(bReceivedChat.message.includes('&lt;script&gt;'), 'HTML script tags must be sanitized/escaped');
    assert(!bReceivedChat.message.includes('<script>'), 'Unescaped script tags must not exist');
    assert(cReceivedChat, 'Client C should receive chat message');
    console.log(`✓ Chat message broadcasted safely: "${bReceivedChat.message}"`);

    // -------------------------------------------------------------
    // TEST 9: Client B leaves the room
    // -------------------------------------------------------------
    console.log('\n[Test 9] Client B leaves the room...');
    let aSawUserLeft = null;
    clientA.on('user-left', data => { aSawUserLeft = data; });

    clientB.disconnect();
    await wait(200);

    assert(aSawUserLeft && aSawUserLeft.username === 'Rahul', 'Client A should receive user-left notification for Rahul');
    assert.strictEqual(aParticipantsData.count, 2, 'Participant count should update to 2');
    console.log(`✓ Client B left. Remaining participants: ${aParticipantsData.count}`);

    // -------------------------------------------------------------
    // TEST 10: Late Joiner Client D receives full existing whiteboard state
    // -------------------------------------------------------------
    console.log('\n[Test 10] Client D (Late Joiner) joins and verifies state synchronization...');
    const clientD = Client(SERVER_URL);
    let dInitialBoardStrokes = null;
    let dChatHistory = null;

    clientD.on('initial-board-state', board => { dInitialBoardStrokes = board; });
    clientD.on('chat-history', history => { dChatHistory = history; });

    clientD.emit('join-room', { roomId, username: 'Deepa' });
    await wait(200);

    assert(Array.isArray(dInitialBoardStrokes), 'Initial board state must be an array');
    assert(dInitialBoardStrokes.length >= 2, `Board state should contain past strokes (found ${dInitialBoardStrokes.length})`);
    assert(Array.isArray(dChatHistory) && dChatHistory.length > 0, 'Late joiner should receive chat history');
    console.log(`✓ Client D received existing board state (${dInitialBoardStrokes.length} strokes) and ${dChatHistory.length} chat messages!`);

    // -------------------------------------------------------------
    // TEST 11: Clear Board
    // -------------------------------------------------------------
    console.log('\n[Test 11] Client A clears the whiteboard with clear-board...');
    let aClearNotice = null;
    let cClearNotice = null;
    let dClearNotice = null;

    clientA.on('clear-board', data => { aClearNotice = data; });
    clientC.on('clear-board', data => { cClearNotice = data; });
    clientD.on('clear-board', data => { dClearNotice = data; });

    clientA.emit('clear-board');
    await wait(150);

    assert(aClearNotice, 'Client A should receive clear-board');
    assert(cClearNotice, 'Client C should receive clear-board');
    assert(dClearNotice, 'Client D should receive clear-board');
    console.log('✓ All clients received clear-board event.');

    // Verify late joiner now receives an empty board
    const clientE = Client(SERVER_URL);
    let eInitialBoard = null;
    clientE.on('initial-board-state', board => { eInitialBoard = board; });
    clientE.emit('join-room', { roomId, username: 'Vikram' });
    await wait(200);

    assert(Array.isArray(eInitialBoard) && eInitialBoard.length === 0, 'After clear-board, new joiners get empty canvas');
    console.log('✓ Verified subsequent joiner receives 0 strokes after clear-board.');

    // -------------------------------------------------------------
    // TEST 12: Invalid Room Handling
    // -------------------------------------------------------------
    console.log('\n[Test 12] Connecting to invalid room format...');
    const clientInvalid = Client(SERVER_URL);
    let invalidRoomError = null;
    clientInvalid.on('room-error', err => { invalidRoomError = err; });
    clientInvalid.emit('join-room', { roomId: '!INVALID@ROOM!', username: 'Tester' });
    await wait(150);

    assert(invalidRoomError, 'Invalid room format must trigger room-error event');
    console.log(`✓ Server safely rejected invalid room: "${invalidRoomError.message}"`);

    // Clean up
    clientA.disconnect();
    clientC.disconnect();
    clientD.disconnect();
    clientE.disconnect();
    clientInvalid.disconnect();

    console.log('\n===============================================================');
    console.log(' ALL 12 INTEGRATION TESTS PASSED WITH 100% SUCCESS ON PORT 3000! ');
    console.log('===============================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('TEST SUITE ERROR:', err);
    process.exit(1);
  }
}

runCollabBoardTests();
