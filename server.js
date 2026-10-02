const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// IMPORTANT:
// index.html और room.html इसी folder में होने चाहिए
app.use(express.static(__dirname));

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

class VoiceRoom {
  constructor(roomId) {
    this.roomId = roomId;
    this.seats = Array.from({ length: 9 }, (_, i) => ({
      seatNo: i + 1,
      userId: null
    }));

    this.users = new Map();
    this.hostId = null;
  }

  join(userId, nickname, dp) {
    if (!this.users.has(userId)) {
      this.users.set(userId, {
        userId,
        nickname: nickname || "Guest",
        dp: dp || "",
        mic: false,
        joinedAt: Date.now()
      });
    }

    if (!this.hostId) {
      this.hostId = userId;
      this.seats[0].userId = userId;
    }

    return this.getState();
  }

  leave(userId) {
    this.users.delete(userId);

    for (const seat of this.seats) {
      if (seat.userId === userId) {
        seat.userId = null;
      }
    }

    if (this.hostId === userId) {
      this.hostId = this.users.keys().next().value || null;

      this.seats[0].userId = this.hostId || null;
    }

    return this.getState();
  }

  takeSeat(userId, seatNo) {
    const seat = this.seats.find(s => s.seatNo === Number(seatNo));

    if (!seat) {
      return false;
    }

    if (!this.users.has(userId)) {
      return false;
    }

    if (seat.userId && seat.userId !== userId) {
      return false;
    }

    // Remove user from any previous seat
    for (const s of this.seats) {
      if (s.userId === userId) {
        s.userId = null;
      }
    }

    seat.userId = userId;

    return true;
  }

  leaveSeat(userId) {
    // Host seat stays occupied by host
    if (userId === this.hostId) {
      return false;
    }

    for (const seat of this.seats) {
      if (seat.userId === userId) {
        seat.userId = null;
      }
    }

    return true;
  }

  setMic(userId, status) {
    const user = this.users.get(userId);

    if (!user) {
      return false;
    }

    user.mic = Boolean(status);
    return true;
  }

  getState() {
    const users = {};

    this.users.forEach((user, id) => {
      users[id] = user;
    });

    return {
      roomId: this.roomId,
      hostId: this.hostId,
      seats: this.seats,
      users
    };
  }
}

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new VoiceRoom(roomId));
  }

  return rooms.get(roomId);
}

// Home page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Explicit room route
app.get("/room.html", (req, res) => {
  res.sendFile(path.join(__dirname, "room.html"));
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    webRTC: true,
    seats: 9,
    rooms: rooms.size
  });
});

io.on("connection", socket => {
  console.log("Connected:", socket.id);

  socket.on("joinRoom", data => {
    try {
      const roomId = String(data.roomId || "10001");
      const nickname = String(data.nickname || "Guest").slice(0, 30);
      const dp = String(data.dp || "");

      const room = getRoom(roomId);

      socket.data.roomId = roomId;
      socket.data.userId = socket.id;

      room.join(socket.id, nickname, dp);

      socket.join(roomId);

      socket.emit("roomState", room.getState());

      socket.to(roomId).emit("userJoined", {
        userId: socket.id,
        nickname,
        dp
      });

      socket.to(roomId).emit("roomState", room.getState());

      // Tell the new user about existing peers
      const otherUsers = [];

      room.users.forEach((user, id) => {
        if (id !== socket.id) {
          otherUsers.push({
            userId: id,
            nickname: user.nickname,
            dp: user.dp
          });
        }
      });

      socket.emit("existingUsers", otherUsers);

      console.log(
        `${nickname} joined room ${roomId}`
      );
    } catch (err) {
      console.error("joinRoom error:", err);
    }
  });

  socket.on("takeSeat", data => {
    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const ok = room.takeSeat(
      userId,
      Number(data.seatNo)
    );

    socket.emit("seatResult", {
      success: ok,
      seatNo: Number(data.seatNo)
    });

    if (ok) {
      io.to(roomId).emit(
        "roomState",
        room.getState()
      );
    }
  });

  socket.on("leaveSeat", () => {
    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.leaveSeat(userId);

    io.to(roomId).emit(
      "roomState",
      room.getState()
    );
  });

  socket.on("micStatus", data => {
    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.setMic(userId, data.status);

    io.to(roomId).emit(
      "roomState",
      room.getState()
    );
  });

  socket.on("message", data => {
    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const user = room.users.get(userId);
    if (!user) return;

    const message = String(data.message || "")
      .trim()
      .slice(0, 300);

    if (!message) return;

    io.to(roomId).emit("message", {
      userId,
      nickname: user.nickname,
      message,
      time: Date.now()
    });
  });

  // WebRTC signaling
  socket.on("webrtc-offer", data => {
    if (!data || !data.to) return;

    io.to(data.to).emit("webrtc-offer", {
      from: socket.id,
      offer: data.offer
    });
  });

  socket.on("webrtc-answer", data => {
    if (!data || !data.to) return;

    io.to(data.to).emit("webrtc-answer", {
      from: socket.id,
      answer: data.answer
    });
  });

  socket.on("webrtc-ice", data => {
    if (!data || !data.to) return;

    io.to(data.to).emit("webrtc-ice", {
      from: socket.id,
      candidate: data.candidate
    });
  });

  socket.on("leaveRoom", () => {
    leaveCurrentRoom(socket);
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);

    leaveCurrentRoom(socket);
  });
});

function leaveCurrentRoom(socket) {
  const roomId = socket.data.roomId;
  const userId = socket.data.userId;

  if (!roomId || !userId) return;

  const room = rooms.get(roomId);

  if (!room) return;

  room.leave(userId);

  socket.to(roomId).emit("peerLeft", {
    userId
  });

  socket.to(roomId).emit(
    "roomState",
    room.getState()
  );

  socket.leave(roomId);

  if (room.users.size === 0) {
    rooms.delete(roomId);
  }

  socket.data.roomId = null;
  socket.data.userId = null;
}

server.listen(PORT, () => {
  console.log(
    `PawanVoice server running on port ${PORT}`
  );
});
