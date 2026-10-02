const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

/* =========================
   VOICE ROOM CLASS
========================= */

class VoiceRoom {
  constructor(roomId) {
    this.roomId = String(roomId);

    this.seats = Array.from({ length: 9 }, (_, i) => ({
      seatNo: i + 1,
      user: null,
      mic: false
    }));

    this.users = new Map();
  }

  join(userId, nickname, dp) {
    this.users.set(String(userId), {
      userId: String(userId),
      nickname: nickname || "User",
      dp: dp || "",
      coins: 0
    });
  }

  leave(userId) {
    userId = String(userId);

    this.users.delete(userId);

    this.seats.forEach(seat => {
      if (seat.user && seat.user.userId === userId) {
        seat.user = null;
        seat.mic = false;
      }
    });
  }

  takeSeat(userId, seatNo) {
    userId = String(userId);

    const user = this.users.get(userId);
    const seat = this.seats.find(
      s => s.seatNo === Number(seatNo)
    );

    if (!user || !seat) return false;

    if (seat.user) return false;

    // User can only occupy one seat
    this.seats.forEach(s => {
      if (s.user && s.user.userId === userId) {
        s.user = null;
        s.mic = false;
      }
    });

    seat.user = user;
    seat.mic = false;

    return true;
  }

  leaveSeat(userId) {
    userId = String(userId);

    this.seats.forEach(seat => {
      if (seat.user && seat.user.userId === userId) {
        seat.user = null;
        seat.mic = false;
      }
    });
  }

  setMic(userId, status) {
    userId = String(userId);

    const seat = this.seats.find(
      s => s.user && s.user.userId === userId
    );

    if (!seat) return false;

    seat.mic = Boolean(status);

    return true;
  }

  getState() {
    return {
      roomId: this.roomId,
      seats: this.seats,
      users: Array.from(this.users.values()).map(user => ({
        userId: user.userId,
        nickname: user.nickname,
        dp: user.dp
      }))
    };
  }
}

/* =========================
   ROOM STORAGE
========================= */

const rooms = new Map();

function getRoom(roomId) {
  roomId = String(roomId);

  if (!rooms.has(roomId)) {
    rooms.set(roomId, new VoiceRoom(roomId));
  }

  return rooms.get(roomId);
}

function sendRoomState(roomId) {
  const room = rooms.get(String(roomId));

  if (!room) return;

  io.to(String(roomId)).emit(
    "roomState",
    room.getState()
  );
}

/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/room.html", (req, res) => {
  res.sendFile(path.join(__dirname, "room.html"));
});

app.get("/health", (req, res) => {
  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    webRTC: true,
    firebaseClient: true,
    seats: 9,
    rooms: rooms.size
  });
});

/* =========================
   SOCKET.IO
========================= */

io.on("connection", socket => {

  socket.on("joinRoom", data => {

    if (!data) return;

    const roomId = String(data.roomId || "10001");
    const userId = String(
      data.userId || ("PV" + Math.floor(10000 + Math.random() * 90000))
    );

    const nickname = data.nickname || "User";
    const dp = data.dp || "";

    const room = getRoom(roomId);

    socket.join(roomId);

    socket.pvRoomId = roomId;
    socket.pvUserId = userId;

    room.join(
      userId,
      nickname,
      dp
    );

    socket.emit(
      "existingUsers",
      Array.from(room.users.values())
        .filter(u => u.userId !== userId)
        .map(u => ({
          userId: u.userId,
          nickname: u.nickname,
          dp: u.dp
        }))
    );

    sendRoomState(roomId);
  });

  /* TAKE SEAT */

  socket.on("takeSeat", seatNo => {

    const roomId = socket.pvRoomId;
    const userId = socket.pvUserId;

    if (!roomId || !userId) return;

    const room = rooms.get(roomId);

    if (!room) return;

    const success = room.takeSeat(
      userId,
      Number(seatNo)
    );

    if (success) {
      sendRoomState(roomId);
    }
  });

  /* LEAVE SEAT */

  socket.on("leaveSeat", () => {

    const roomId = socket.pvRoomId;
    const userId = socket.pvUserId;

    if (!roomId || !userId) return;

    const room = rooms.get(roomId);

    if (!room) return;

    room.leaveSeat(userId);

    sendRoomState(roomId);
  });

  /* MIC */

  socket.on("micStatus", status => {

    const roomId = socket.pvRoomId;
    const userId = socket.pvUserId;

    if (!roomId || !userId) return;

    const room = rooms.get(roomId);

    if (!room) return;

    room.setMic(
      userId,
      Boolean(status)
    );

    sendRoomState(roomId);
  });

  /* CHAT */

  socket.on("message", message => {

    const roomId = socket.pvRoomId;

    if (!roomId) return;

    io.to(roomId).emit(
      "message",
      {
        userId: socket.pvUserId,
        nickname: message.nickname || "User",
        dp: message.dp || "",
        text: String(message.text || "").slice(0, 500),
        time: Date.now()
      }
    );
  });

  /* =========================
     WEBRTC SIGNALING
  ========================= */

  socket.on("webrtc-offer", data => {

    if (!data || !data.to) return;

    io.to(data.to).emit(
      "webrtc-offer",
      {
        from: socket.id,
        fromUserId: socket.pvUserId,
        offer: data.offer
      }
    );
  });

  socket.on("webrtc-answer", data => {

    if (!data || !data.to) return;

    io.to(data.to).emit(
      "webrtc-answer",
      {
        from: socket.id,
        answer: data.answer
      }
    );
  });

  socket.on("webrtc-ice", data => {

    if (!data || !data.to) return;

    io.to(data.to).emit(
      "webrtc-ice",
      {
        from: socket.id,
        candidate: data.candidate
      }
    );
  });

  /* =========================
     LEAVE ROOM
  ========================= */

  socket.on("leaveRoom", () => {

    removeSocketFromRoom(socket);
  });

  socket.on("disconnect", () => {

    removeSocketFromRoom(socket);
  });

  function removeSocketFromRoom(socket) {

    const roomId = socket.pvRoomId;
    const userId = socket.pvUserId;

    if (!roomId || !userId) return;

    const room = rooms.get(roomId);

    if (!room) return;

    room.leave(userId);

    socket.to(roomId).emit(
      "peerLeft",
      {
        socketId: socket.id,
        userId
      }
    );

    sendRoomState(roomId);

    // Empty room delete
    if (room.users.size === 0) {
      rooms.delete(roomId);
    }

    socket.leave(roomId);

    socket.pvRoomId = null;
    socket.pvUserId = null;
  }
});

/* =========================
   START
========================= */

server.listen(PORT, () => {

  console.log(
    `PawanVoice server running on port ${PORT}`
  );

});
