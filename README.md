# CollabBoard 🎨

> **Draw. Collaborate. Create.**
> A modern, real-time collaborative whiteboard web application where friends, students, and teams can create or join rooms without any sign-up, draw simultaneously on the same canvas, and chat live.

---

## 📋 Table of Contents
1. [Project Overview](#-project-overview)
2. [Key Features](#-key-features)
3. [Tech Stack](#-tech-stack)
4. [Project Structure](#-project-structure)
5. [Installation & Setup](#-installation--setup)
6. [Running Locally](#-running-locally)
7. [How to Create a Room](#-how-to-create-a-room)
8. [How to Join a Room](#-how-to-join-a-room)
9. [How Real-Time Synchronization Works](#-how-real-time-synchronization-works)
10. [Known Limitations](#-known-limitations)
11. [Future Improvements](#-future-improvements)

---

## 🌟 Project Overview

**CollabBoard** is an instant real-time collaborative canvas designed for speed, zero friction, and high responsiveness. Built purely using standard web technologies (**Node.js**, **Express.js**, **EJS**, **Socket.IO**, and vanilla **HTML5 Canvas**), it requires **no authentication, no account creation, and no external database setup**.

Users simply enter a nickname, click **Create Room**, and share their generated Room ID or room link with collaborators. Every stroke, tool change, chat message, and clear event is synchronized with sub-millisecond latency.

---

## ✨ Key Features

- 🖌️ **Real-Time Freehand Drawing**: Multi-user simultaneous drawing with high-frequency coordinate streaming and line smoothing.
- 🧹 **True Composite Eraser**: Implemented with HTML5 Canvas `ctx.globalCompositeOperation = 'destination-out'` to erase strokes without leaving ugly white artifacts over backgrounds.
- 🎨 **Color & Size Customization**: 7 curated modern palette presets, an HTML5 custom color picker, quick brush size buttons (`S: 4px`, `M: 10px`, `L: 22px`), and a granular slider (`2px` to `40px`).
- ⚡ **Full Board State Synchronization**: New participants joining an ongoing session immediately receive the full historical canvas state (`initial-board-state`) and chat history.
- 📱 **Responsive & High-DPI Ready**: Fully responsive layout tailored for desktops, laptops, tablets, and phones. High-DPI scaling (`window.devicePixelRatio`) ensures ultra-sharp lines on Retina displays, while Pointer Events unify mouse, stylus, and touch interactions.
- 💬 **Live Room Chat**: Built-in chat channel with user color tags, formatted timestamps, auto-scroll, unread indicators on mobile, and HTML sanitization to prevent XSS attacks.
- 👥 **Live Participant Tracking**: Shows real-time participant counter (`Participants: N`) and participant list with user nicknames, avatar badges, and personalized `(You)` indicators.
- 📋 **One-Click Room Sharing**: Header bar features a "Copy Room ID" button with instant `"Copied!"` visual feedback.
- 🗑️ **Clear Whiteboard Modal**: Safe clear workflow with confirmation dialog to prevent accidental erasure, resetting board state across all connected peers.
- 💾 **Export Whiteboard**: Export canvas artwork anytime to high-resolution PNG image with dark slate backdrop.

---

## 🛠️ Tech Stack

CollabBoard strictly adheres to the requested technology stack with zero third-party UI frameworks or external database dependencies:

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Backend Runtime** | Node.js | Fast JavaScript server runtime |
| **Server Framework** | Express.js (v4) | Minimalist web application server & routing |
| **Templating Engine**| EJS (Embedded JavaScript) | Dynamic server-side HTML rendering |
| **Real-Time Transport** | Socket.IO (v4) | WebSocket-based low-latency bidirectional rooms & events |
| **Frontend UI** | Vanilla HTML5 + CSS3 + JS | Zero frontend frameworks, pure CSS styling |
| **Whiteboard Canvas** | HTML5 2D Canvas API | High-performance hardware-accelerated 2D rendering |
| **Room State** | In-Memory JavaScript Objects | Pure RAM data structures (`Map`, arrays) with auto-cleanup |
| **Package Manager** | npm | Standard Node package manager |

---

## 📂 Project Structure

```text
collabboard/
│
├── server.js               # Express application and Socket.IO real-time event hub
├── package.json            # Project manifest, scripts, and dependencies
├── README.md               # Complete project documentation
│
├── views/
│   ├── index.ejs           # Landing page template (Create Room & Join Room)
│   └── room.ejs            # Whiteboard room template (Canvas, Toolbar, Chat, Sidebar)
│
├── public/
│   ├── css/
│   │   ├── style.css       # Landing page styling, glassmorphism, responsive grid
│   │   └── room.css        # Workspace styling, toolbar, canvas viewport, chat, sidebar
│   │
│   └── js/
│       ├── home.js         # Landing page form validation, localStorage persistence, API checks
│       └── room.js         # Canvas drawing engine, Pointer Events, Socket.IO client logic
│
├── utils/
│   └── roomManager.js      # In-memory room manager (rooms, users, strokes, messages, cleanup)
│
└── test/
    └── test_collabboard.js # Automated 12-suite live integration test runner
```

---

## 🚀 Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18 or newer recommended)
- [npm](https://www.npmjs.com/) (bundled with Node.js)

### Step 1: Install Dependencies
Open your terminal in the project directory and install the required dependencies:

```bash
npm install
```

---

## 💻 Running Locally

### Development Mode (with Auto-Reload)
Run the application using `nodemon` so the server restarts automatically upon file edits:

```bash
npm run dev
```

### Production Mode
Run the standard Node.js server:

```bash
npm start
```

Once running, navigate to:
```text
http://localhost:3000
```

---

## ⚡ Deploying to Vercel

CollabBoard is configured for immediate deployment to **Vercel** via Serverless Functions:

### Files Added for Vercel
- **[`vercel.json`](file:///d:/Projects/vercel.json)**: Configures rewrites to `/api/index.js` and instructs Vercel to bundle `views/**` EJS templates into the serverless function.
- **[`api/index.js`](file:///d:/Projects/api/index.js)**: Serverless function wrapper exporting the Express application.
- **[`.vercelignore`](file:///d:/Projects/.vercelignore)**: Excludes local test files and unnecessary artifacts from the deployment bundle.
- **[`public/js/socket.io.min.js`](file:///d:/Projects/public/js/socket.io.min.js)**: Static Socket.IO client library delivered directly via Vercel's Edge CDN.

### Option 1: Deploy with Vercel CLI
```bash
npm install -g vercel
vercel
```
Follow the interactive prompts:
- Set up and deploy: **Y**
- Link to existing project: **N**
- Project name: **collabboard**
- Directory: **./**
- Modify settings: **N**

### Option 2: Deploy via Vercel Web Dashboard (GitHub / GitLab)
1. Push your repository to GitHub.
2. In the [Vercel Dashboard](https://vercel.com/new), click **Add New... -> Project**.
3. Import your `collabboard` repository.
4. Leave Framework Preset as **Other** (Vercel automatically detects `vercel.json`).
5. Click **Deploy**.

> [!IMPORTANT]
> **Vercel Serverless Architecture Note**:
> Vercel executes code using short-lived, stateless Serverless Functions (AWS Lambda). While HTTP routing, EJS pages, and static assets work seamlessly on Vercel, persistent bidirectional TCP WebSockets (`ws://`) and in-memory room state across multiple users require a persistent Node.js process.
> 
> If you need full, persistent multi-user WebSocket synchronization in production for free, deploy to **[Render](https://render.com/)**, **[Railway](https://railway.app/)**, or **[Fly.io](https://fly.io/)** where a full persistent Node.js server runs continuously.

---

## 🚪 How to Create a Room

1. Navigate to `http://localhost:3000` in your web browser.
2. In the **Create a Room** card, type your temporary nickname (e.g., `Anurag`).
3. Click **Create New Room**.
4. The server generates a unique alphanumeric Room ID (e.g., `ZSBNDA`), initializes the room in memory, and redirects you to `/room/ZSBNDA`.
5. Click **Copy Room ID** or share your browser URL with friends.

---

## 👥 How to Join a Room

1. On the landing page (`http://localhost:3000`), navigate to the **Join a Room** card.
2. Enter your nickname (e.g., `Rahul`).
3. Enter the shared **Room ID** (e.g., `ZSBNDA`).
4. Click **Join Room**.
5. The client checks the room existence via `/api/rooms/:roomId/exists`. If the room exists, you are immediately routed to the room canvas; otherwise, an inline error is displayed.
6. Alternatively, collaborators can paste the direct room link (`http://localhost:3000/room/ZSBNDA`) into their browser. If no nickname is specified in the URL, the app prompts for one.

---

## 🔄 How Real-Time Synchronization Works

```text
[ Client A (Anurag) ]            [ Server (Express + Socket.IO) ]            [ Client B (Rahul) ]
         |                                     |                                      |
         | --- (1) join-room {roomId} -------> |                                      |
         | <--- (2) initial-board-state ------ |                                      |
         |                                     | <--- (3) join-room {roomId} -------- |
         | <--- (4) user-joined {Rahul} ------ | --- (5) initial-board-state -------> |
         |                                     |                                      |
         | --- (6) draw {x, y, color...} ----> |                                      |
         |                                     | --- (7) broadcast 'draw' ----------> |
         |                                     |                                      |
         |                                     | <--- (8) chat-message -------------- |
         | <--- (9) broadcast 'chat-message' - | -----------------------------------> |
```

### 1. Vector Stroke Events (Not Raster Images)
Rather than broadcasting expensive full-canvas images or screenshots on every frame, CollabBoard streams lightweight vector stroke segments containing:
```javascript
{
  x: 250,        // Current X coordinate
  y: 180,        // Current Y coordinate
  prevX: 240,    // Previous X coordinate
  prevY: 170,    // Previous Y coordinate
  nx: 0.25,      // Normalized proportional X (0.0 to 1.0)
  ny: 0.18,      // Normalized proportional Y (0.0 to 1.0)
  prevNx: 0.24,  // Normalized proportional prevX
  prevNy: 0.17,  // Normalized proportional prevY
  color: "#38bdf8",
  size: 4,
  tool: "pen"    // 'pen' or 'eraser'
}
```

### 2. Resolution & Screen-Independent Replay
Normalized coordinates (`nx`, `ny`) ensure that strokes appear in the exact proportional position regardless of differences in viewport dimensions between devices (e.g., 4K monitor vs. 13-inch laptop vs. mobile).

### 3. Late-Joiner Catchup
Every valid stroke is stored in `room.drawingData`. When a new peer joins an ongoing room:
```javascript
socket.emit("initial-board-state", room.drawingData);
```
The joining client's canvas engine executes `redrawAllStrokes()`, seamlessly reconstructing the entire collaborative artwork.

### 4. Memory Management & Inactivity Cleanup
When all users disconnect from a room (`remainingCount === 0`), a 45-second grace period timer is initiated. If a user refreshes their tab or reconnects within 45 seconds, the timer is cleared and the session persists. If no users return, the room is safely deallocated from memory to prevent leaks.

---

## 🧪 Testing

CollabBoard includes an automated multi-client integration test suite verifying all 15 scenarios from Section 25:

To run the live test suite:
```bash
node test/test_collabboard.js
```

### Test Coverage Highlights:
- ✅ **Test 1**: Landing page HTTP 200 response and branding.
- ✅ **Test 2**: Room generation and `/api/rooms/:roomId/exists` validation.
- ✅ **Test 3**: Client A connection, user color assignment, and initial empty state.
- ✅ **Test 4 & 5**: Simultaneous multi-user join (Clients B & C) and live participant counter updates.
- ✅ **Test 6**: Client A draws pen stroke -> Client B and C receive identical coordinates in real time.
- ✅ **Test 7**: Client B erases with `tool: 'eraser'` -> Client A and C receive composite eraser stroke.
- ✅ **Test 8**: Real-time chat message broadcast with HTML/XSS injection escaping.
- ✅ **Test 9**: Client B leaves -> room updates participant count and emits `user-left`.
- ✅ **Test 10**: Late joiner Client D receives full historical board state (strokes + chat log).
- ✅ **Test 11**: Clear whiteboard confirmation and broadcast event -> subsequent joiners receive empty canvas.
- ✅ **Test 12**: Connection to non-existent or invalid room is safely rejected with `room-error`.

---

## ⚠️ Known Limitations

- **In-Memory Storage**: Rooms, strokes, and chat history are held in RAM. Restarting the server process clears active rooms.
- **Stroke Count Cap**: To prevent memory exhaustion during marathon drawing sessions, individual rooms have a sliding window cap of 50,000 stroke segments.
- **Undo / Redo Across Multiple Users**: Collaborative multi-user undo is intentionally simplified in this MVP to prevent race conditions without an Operational Transformation (OT) or CRDT engine.

---

## 🔮 Future Improvements

- 🔄 **Undo / Redo with Vector Stacks**: Per-user stroke undo stacks using undo tokens.
- 📐 **Shape Tools**: Rectangle, circle, ellipse, arrow, and straight line generators.
- 🔤 **Text Tool**: Text insertion directly on the whiteboard canvas.
- 🔒 **Password-Protected Rooms**: Optional room passcodes for private brainstorming sessions.
- 🖼️ **Image Paste / Upload**: Ability to drag & drop reference images onto the canvas.
- 💾 **Persistent Backends**: Optional Redis adapter for multi-instance horizontal scaling with Socket.IO clusters.

---

## 📄 License
MIT License. Built for collaborative learning and real-time canvas demonstration.
