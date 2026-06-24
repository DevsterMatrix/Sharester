# Sharester

Send files and messages directly to another browser — no accounts, no uploads, no waiting. Built on WebRTC DataChannels so everything goes peer-to-peer and nothing is stored anywhere.

**Live at:** [sharester.vercel.app](https://sharester.vercel.app)

---

## What it does

### Room system
Open the app and you instantly get a 4-character room code — generated in your browser before any server is even contacted. Share the code, a link, or a QR code with whoever you want to connect with. They enter the code and you're connected. No sign-up, no accounts, nothing to install.

### File transfer
Drop any file onto the page and it goes straight to the other person's browser. There's no size limit — it works for small text files and 10 GB videos alike. Files are broken into 64 KB chunks and streamed directly, so memory usage stays low no matter how big the file is.

- Drag and drop or click to browse
- Any file type, any size
- SHA-256 checksum verified on arrival — if even one byte is wrong, you'll know
- Pause, resume, or cancel mid-transfer
- Transfer speed and time remaining shown on both sides
- Failed chunks automatically retry up to 5 times

### Text chat
The right panel is a chat window. Type a message and send it — it goes over the same WebRTC connection as the files, so it's just as private. Pasted text keeps its formatting (line breaks, code, long URLs all render correctly without overflowing). Hover over any received message to copy just that message, or use "copy all" to grab the full conversation.

- Enter to send, Shift+Enter for a new line
- Textarea grows as you type
- Copy button per message (hover to reveal)
- Copy all messages at once

---

## How it works

```
Your browser ─────────────────────────────── Their browser
                WebRTC DataChannel
                (files + messages)
                       │
              only during setup:
                       │
              Signaling server
              (SDP + ICE only)
              hosted on Railway
```

When two people join the same room, the signaling server exchanges a small handshake (~10 JSON messages total) so the browsers can find each other. After that the signaling server is completely out of the picture — all data flows directly between the two browsers, encrypted by WebRTC's built-in DTLS. The signaling server never sees any file data or messages.

---

## Tech

| | |
|---|---|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Transport | Raw WebRTC DataChannels |
| Signaling | Node.js + `ws` on Railway |
| Integrity | SHA-256 via Web Crypto API |

---

## Running locally

**Terminal 1**
```bash
cd signaling-server
npm install
npm start
```

**Terminal 2**
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in two tabs. The room code appears immediately. Paste it in the second tab → connect → transfer.

---

## Privacy

- Files and messages never leave the browser-to-browser connection
- The signaling server only sees room codes and connection metadata
- Room codes expire after 2 hours
- No analytics, no tracking, no accounts

---

## License

MIT