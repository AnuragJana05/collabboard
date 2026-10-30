# Doodlebook 🎨✨

> **Your friends. One notebook. Endless doodles.**
> A cozy, playful collaborative drawing website and digital scrapbook where friends, students, and teams can draw together in real time without signing up, pass around infinite digital sketchbooks, chat live, and react with playful floating emojis.

---

## 📋 Table of Contents
1. [Project Overview](#-project-overview)
2. [Key Features](#-key-features)
3. [Tech Stack](#-tech-stack)
4. [Project Structure](#-project-structure)
5. [Installation & Setup](#-installation--setup)
6. [Running Locally](#-running-locally)
7. [Deploying to Vercel](#-deploying-to-vercel)
8. [Deploying to Render](#-deploying-to-render)
9. [How Real-Time Synchronization Works](#-how-real-time-synchronization-works)
10. [Automated Integration Testing](#-automated-integration-testing)
11. [License](#-license)

---

## 🌟 Project Overview

**Doodlebook** turns the classic charm of a physical spiral sketchbook into a shared digital canvas. Built with standard web technologies (**Node.js**, **Express.js**, **EJS**, **Socket.IO**, **WebRTC PeerJS**, and vanilla **HTML5 Canvas**), it requires **zero authentication, no account creation, and no external database setup**.

Users create a notebook with a custom name and description, grab a shareable room link or code, and invite friends to draw simultaneously. On persistent servers (such as Render or local Node), real-time updates flow through low-latency **Socket.IO WebSockets**. When deployed to serverless hosts like **Vercel**, the application automatically activates **WebRTC Peer-to-Peer (P2P) Data Channels**, allowing peers to stream strokes and cursors directly between browsers without needing persistent server instances.

---

## ✨ Key Features

- ✏️ **Stationery Drawing Tools**: Fine pencil, smooth calligraphy ink brush, translucent highlighter with blend modes, eraser (`destination-out`), and straight line tool.
- 📐 **Geometric & Scrapbook Shapes**: Instant rectangles, circles, triangles, and 5-point stars.
- 🔤 **Text & Handwritten Notes**: Type directly onto the paper using hand-drawn Google Fonts (`Caveat`, `Patrick Hand`).
- 👥 **Multiplayer Live Cursors**: Live remote cursors with user names and avatar tags, smoothly animated using frame-rate independent interpolation (lerp).
- 💖 **Floating Reaction Bursts**: Tap emoji reactions (❤️, ✨, 🔥, 👏, 🎨, 🐱) that burst across collaborators' viewports with floating physics.
- ↩️ **Global & Local Undo / Redo**: Stroke-based undo history synchronized across all peers.
- 🔍 **Smooth Zoom & Pan**: Infinite navigation with mouse wheel, zoom buttons, and reset view.
- 💬 **Live Scrapbook Chat**: Chat sidebar with user color coding, formatted timestamps, auto-scroll, unread indicators, and strict HTML sanitization.
- 📖 **Notebooks Gallery & Saved Sessions**: Browse active sessions, sample sketchbooks, and access your recent notebooks stored in localStorage.
- 📷 **High-Res Paper Export**: Download artwork anytime to PNG with warm dotted paper texture and subtle grid lines.
- ⚡ **Dual Real-Time Engine (Socket.IO + WebRTC P2P)**: Automatic fallback to WebRTC P2P data channels when deployed on serverless environments like Vercel.

---

## 🛠️ Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Backend Runtime** | Node.js | Fast JavaScript server runtime |
| **Server Framework** | Express.js (v4) | Minimalist web application server & routing |
| **Templating Engine**| EJS (Embedded JavaScript) | Dynamic server-side HTML rendering |
| **Real-Time Transport** | Socket.IO (v4) + PeerJS (WebRTC) | WebSocket rooms with seamless P2P data channel fallback |
| **Frontend UI** | Vanilla HTML5 + CSS3 + JS | Handcrafted stationery design system with zero UI frameworks |
| **Whiteboard Canvas** | HTML5 2D Canvas API | High-performance hardware-accelerated 2D rendering |
| **Room State** | In-Memory JavaScript Objects | Pure RAM data structures (`Map`, arrays) with auto-cleanup |
| **Package Manager** | npm | Standard Node package manager |

---

## 📂 Project Structure

```text
doodlebook/
│
├── server.js               # Express application, HTTP routes, and Socket.IO hub
├── package.json            # Project manifest, scripts, and dependencies
├── render.yaml             # Render.com persistent web service configuration
├── vercel.json             # Vercel serverless function rewrites and file tracing
├── .vercelignore           # Excluded files for Vercel deployment bundles
├── README.md               # Complete project documentation
│
├── api/
│   └── index.js            # Vercel Serverless Function entry point
│
├── views/
│   ├── index.ejs           # Landing page (Hero, Create Notebook, Join, Features)
│   ├── room.ejs            # Workspace room (Canvas, Toolbar, Sidebar, Reactions)
│   ├── gallery.ejs         # My Notebooks & Scrapbook Gallery page
│   └── about.ejs           # Philosophy, Stationery Guide, and Tips page
│
├── public/
│   ├── css/
│   │   ├── style.css       # Landing, gallery, and about page styling
│   │   └── room.css        # Workspace styling, canvas viewport, toolbar, chat
│   │
│   └── js/
│       ├── home.js         # Landing page interactions, recent notebooks, API checks
│       ├── room.js         # Canvas engine, tools, Socket.IO & WebRTC P2P engine
│       ├── socket.io.min.js# Bundled Socket.IO client library
│       └── peerjs.min.js   # Bundled PeerJS WebRTC client library
│
├── utils/
│   └── roomManager.js      # In-memory room manager (rooms, users, strokes, messages)
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
Open your terminal in the project directory:

```bash
npm install
```

---

## 💻 Running Locally

### Development Mode (with Auto-Reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

Once started, open your browser to:
```text
http://localhost:3000
```

---

## ⚡ Deploying to Vercel

Doodlebook is fully configured for immediate zero-config deployment to **Vercel** via Serverless Functions:

### How It Works on Vercel
1. **Serverless HTTP**: `vercel.json` rewrites all incoming traffic to `api/index.js`, where Express renders EJS templates (`index`, `room`, `gallery`, `about`) and serves JSON APIs.
2. **WebRTC P2P Fallback**: Because Vercel serverless functions do not maintain long-lived WebSocket connections, `public/js/room.js` automatically detects serverless environments and initiates **PeerJS WebRTC P2P channels** between collaborators in the room.

### Option 1: Deploy with Vercel CLI
```bash
npm install -g vercel
vercel
```
Follow the interactive prompts:
- Set up and deploy: **Y**
- Project name: **doodlebook**
- Directory: **./**
- Modify settings: **N**

For production deployment:
```bash
vercel --prod
```

### Option 2: Deploy via Vercel Web Dashboard (GitHub)
1. Push your repository to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new).
3. Import your `doodlebook` repository.
4. Leave Framework Preset as **Other** (Vercel automatically detects `vercel.json`).
5. Click **Deploy**.

---

## 🌐 Deploying to Render

If you prefer continuous, persistent WebSocket connections with Socket.IO, deploy to **Render**:

1. Push your repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com/), click **New -> Blueprint**.
3. Connect your repository. Render automatically reads `render.yaml`:
   - Environment: `node`
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Click **Apply**.

---

## 🔄 How Real-Time Synchronization Works

```text
 Client A (Drawing)                    Server / P2P Host                  Client B (Observer)
       |                                      |                                    |
       | --- (1) emit 'draw' ---------------> |                                    |
       |     {tool, color, size, nx, ny...}   | --- (2) broadcast 'draw' --------> |
       |                                      |                                    |
       | --- (3) emit 'cursor-move' --------> |                                    |
       |     {nx, ny, username, color}        | --- (4) broadcast 'cursor-move' -> |
       |                                      |                                    |
       | --- (5) emit 'reaction' -----------> |                                    |
       |     {emoji, x, y}                    | --- (6) broadcast 'reaction' -----> |
```

1. **Lightweight Vector Streaming**: Strokes are transmitted as normalized fractional coordinate segments (`0.0` to `1.0`), ensuring identical appearance across phone screens, tablets, and 4K desktop displays.
2. **Late-Joiner Catchup**: When joining an existing notebook, new peers receive the complete stroke history (`initial-board-state`) and chat log (`chat-history`) to immediately reconstruct the artwork.
3. **Automatic Room Cleanup**: In-memory rooms without active participants are preserved for a 20-minute grace period before safe deallocation.

---

## 🧪 Automated Integration Testing

Doodlebook includes an automated multi-client integration test runner that tests 12 critical end-to-end scenarios:

```bash
npm test
```

### Test Coverage:
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
- ✅ **Test 12**: Connection to invalid room format is safely rejected with `room-error`.

---

## 📄 License

MIT License. Designed and crafted with ❤️ for collaborative drawing and joyful digital scrapbooking.
