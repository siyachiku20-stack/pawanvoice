const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const rooms = new Map();

/* =========================
   BASIC ROUTES
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
    seats: 9,
    rooms: rooms.size
  });
});

/* =========================
   ROOM HELPERS
========================= */

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      hostSocketId: null,
      users: new Map()
    });
  }

  return rooms.get(roomId);
}

function roomUsers(room) {
  return Array.from(room.users.values()).map((u) => ({
    socketId: u.socketId,
    userId: u.userId,
    name: u.name,
    dp: u.dp || "",
    seat: u.seat,
    mic: !!u.mic,
    speaker: !!u.speaker,
    mutedByAdmin: !!u.mutedByAdmin
  }));
}

function sendRoomState(roomId) {
  const room = rooms.get(roomId);

  if (!room) return;

  io.to(roomId).emit("room-state", {
    users: roomUsers(room),
    hostSocketId: room.hostSocketId,
    count: room.users.size
  });
}

/* =========================
   SOCKET CONNECTION
========================= */

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  /* =========================
     JOIN ROOM
  ========================= */

  socket.on("join-room", (data = {}) => {
    const roomId = String(data.roomId || "10001");
    const userId = String(data.userId || "");
    const name = String(data.name || "Guest");
    const dp = String(data.dp || "");

    if (!userId) {
      socket.emit("room-error", {
        message: "User ID missing"
      });
      return;
    }

    const room = getRoom(roomId);

    /* If same socket was already in another room */
    if (socket.data.roomId) {
      const oldRoom = rooms.get(socket.data.roomId);

      if (oldRoom) {
        oldRoom.users.delete(socket.id);

        if (oldRoom.hostSocketId === socket.id) {
          const firstUser = oldRoom.users.values().next().value;
          oldRoom.hostSocketId = firstUser
            ? firstUser.socketId
            : null;
        }

        sendRoomState(socket.data.roomId);
      }

      socket.leave(socket.data.roomId);
    }

    socket.data.roomId = roomId;
    socket.data.userId = userId;
    socket.data.name = name;

    socket.join(roomId);

    /* Host = first user */
    if (!room.hostSocketId) {
      room.hostSocketId = socket.id;
    }

    room.users.set(socket.id, {
      socketId: socket.id,
      userId,
      name,
      dp,
      seat: null,
      mic: false,
      speaker: true,
      mutedByAdmin: false
    });

    socket.emit("joined-room", {
      roomId,
      hostSocketId: room.hostSocketId
    });

    sendRoomState(roomId);

    /* Tell existing users about new peer */
    socket.to(roomId).emit("peer-joined", {
      socketId: socket.id,
      userId,
      name
    });
  });

  /* =========================
     TAKE SEAT
  ========================= */

  socket.on("take-seat", (seat) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) return;

    const user = room.users.get(socket.id);

    if (!user) return;

    seat = Number(seat);

    if (seat < 1 || seat > 9) {
      socket.emit("room-error", {
        message: "Invalid seat"
      });
      return;
    }

    /* Check if another user already occupies seat */
    const occupied = Array.from(room.users.values()).find(
      (u) => u.seat === seat && u.socketId !== socket.id
    );

    if (occupied) {
      socket.emit("seat-error", {
        message: "This seat is already occupied"
      });
      return;
    }

    user.seat = seat;

    sendRoomState(roomId);
  });

  /* =========================
     LEAVE SEAT
  ========================= */

  socket.on("leave-seat", () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) return;

    const user = room.users.get(socket.id);

    if (!user) return;

    user.seat = null;
    user.mic = false;

    sendRoomState(roomId);
  });

  /* =========================
     MIC STATUS
  ========================= */

  socket.on("mic-status", (enabled) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) return;

    const user = room.users.get(socket.id);

    if (!user) return;

    if (user.mutedByAdmin && enabled) {
      socket.emit("room-error", {
        message: "Admin has muted you"
      });
      return;
    }

    user.mic = !!enabled;

    io.to(roomId).emit("user-mic-status", {
      socketId: socket.id,
      enabled: user.mic
    });

    sendRoomState(roomId);
  });

  /* =========================
     SPEAKER STATUS
  ========================= */

  socket.on("speaker-status", (enabled) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) return;

    const user = room.users.get(socket.id);

    if (!user) return;

    user.speaker = !!enabled;

    sendRoomState(roomId);
  });

  /* =========================
     CHAT
  ========================= */

  socket.on("chat-message", (message) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) return;

    const user = room.users.get(socket.id);

    if (!user) return;

    const cleanMessage = String(message || "").trim();

    if (!cleanMessage) return;

    io.to(roomId).emit("chat-message", {
      socketId: socket.id,
      userId: user.userId,
      name: user.name,
      message: cleanMessage,
      time: new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit"
      })
    });
  });

  /* =========================
     GIFT
  ========================= */

  socket.on("send-gift", (gift = {}) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) return;

    const user = room.users.get(socket.id);

    if (!user) return;

    io.to(roomId).emit("gift-event", {
      fromSocketId: socket.id,
      fromName: user.name,
      giftName: String(gift.name || "Gift"),
      giftIcon: String(gift.icon || "🎁")
    });
  });

  /* =========================
     ADMIN KICK
  ========================= */

  socket.on("admin-kick", (targetSocketId) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) return;

    if (room.hostSocketId !== socket.id) {
      socket.emit("room-error", {
        message: "Only room host can kick users"
      });
      return;
    }

    const target = room.users.get(targetSocketId);

    if (!target) return;

    if (targetSocketId === socket.id) return;

    const targetSocket = io.sockets.sockets.get(targetSocketId);

    if (targetSocket) {
      targetSocket.emit("kicked-from-room", {
        message: "You were removed by the room host"
      });

      targetSocket.leave(roomId);
      targetSocket.data.roomId = null;
    }

    room.users.delete(targetSocketId);

    sendRoomState(roomId);
  });

  /* =========================
     ADMIN MUTE
  ========================= */

  socket.on("admin-mute", (targetSocketId) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) return;

    if (room.hostSocketId !== socket.id) {
      socket.emit("room-error", {
        message: "Only room host can mute users"
      });
      return;
    }

    const target = room.users.get(targetSocketId);

    if (!target) return;

    target.mutedByAdmin = true;
    target.mic = false;

    const targetSocket = io.sockets.sockets.get(targetSocketId);

    if (targetSocket) {
      targetSocket.emit("forced-mute", {
        message: "You were muted by the room host"
      });
    }

    sendRoomState(roomId);
  });

  /* =========================
     WEBRTC OFFER
  ========================= */

  socket.on("webrtc-offer", ({ target, offer }) => {
    io.to(target).emit("webrtc-offer", {
      from: socket.id,
      offer
    });
  });

  /* =========================
     WEBRTC ANSWER
  ========================= */

  socket.on("webrtc-answer", ({ target, answer }) => {
    io.to(target).emit("webrtc-answer", {
      from: socket.id,
      answer
    });
  });

  /* =========================
     ICE CANDIDATE
  ========================= */

  socket.on("webrtc-ice", ({ target, candidate }) => {
    io.to(target).emit("webrtc-ice", {
      from: socket.id,
      candidate
    });
  });

  /* =========================
     DISCONNECT
  ========================= */

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);

    const roomId = socket.data.roomId;

    if (!roomId) return;

    const room = rooms.get(roomId);

    if (!room) return;

    room.users.delete(socket.id);

    if (room.hostSocketId === socket.id) {
      const firstUser = room.users.values().next().value;

      room.hostSocketId = firstUser
        ? firstUser.socketId
        : null;
    }

    socket.to(roomId).emit("peer-left", {
      socketId: socket.id
    });

    sendRoomState(roomId);

    if (room.users.size === 0) {
      rooms.delete(roomId);
    }
  });
});

/* =========================
   SERVER
========================= */

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("PawanVoice server running on port " + PORT);
});
