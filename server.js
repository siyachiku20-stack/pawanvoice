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

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      hostSocketId: null,
      users: new Map()
    });
  }

  return rooms.get(roomId);
}

function getUsers(room) {
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
    users: getUsers(room),
    hostSocketId: room.hostSocketId,
    count: room.users.size
  });
}

function removeUserFromRoom(socket) {
  const roomId = socket.data.roomId;

  if (!roomId) return;

  const room = rooms.get(roomId);

  if (!room) return;

  room.users.delete(socket.id);

  if (room.hostSocketId === socket.id) {
    const nextUser = room.users.values().next().value;
    room.hostSocketId = nextUser
      ? nextUser.socketId
      : null;
  }

  socket.to(roomId).emit("peer-left", {
    socketId: socket.id
  });

  sendRoomState(roomId);

  if (room.users.size === 0) {
    rooms.delete(roomId);
  }

  socket.data.roomId = null;
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/room.html", (req, res) => {
  res.sendFile(path.join(__dirname, "room.html"));
});

app.get("/health", (req, res) => {
  res.json({
    app: "PawanVoice",
    status: "running",
    socketIO: true,
    webRTC: true,
    seats: 9,
    rooms: rooms.size
  });
});

io.on("connection", (socket) => {

  console.log("CONNECTED:", socket.id);

  /* JOIN */

  socket.on("join-room", (data = {}) => {

    const roomId =
      String(data.roomId || "10001");

    const userId =
      String(data.userId || "");

    const name =
      String(data.name || "Guest");

    const dp =
      String(data.dp || "");

    if (!userId) {
      socket.emit("room-error", {
        message: "User ID missing"
      });
      return;
    }

    if (socket.data.roomId) {
      removeUserFromRoom(socket);
      socket.leave(socket.data.roomId);
    }

    const room = getRoom(roomId);

    socket.join(roomId);

    socket.data.roomId = roomId;
    socket.data.userId = userId;
    socket.data.name = name;

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

    socket.to(roomId).emit("peer-joined", {
      socketId: socket.id,
      userId,
      name
    });

    sendRoomState(roomId);

  });


  /* TAKE SEAT */

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

    const occupied =
      Array.from(room.users.values()).find(
        u =>
          Number(u.seat) === seat &&
          u.socketId !== socket.id
      );

    if (occupied) {
      socket.emit("seat-error", {
        message: "This seat is already occupied"
      });
      return;
    }

    user.seat = seat;

    sendRoomState(roomId);

    io.to(roomId).emit("voice-topology-change");

  });


  /* LEAVE SEAT */

  socket.on("leave-seat", () => {

    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) return;

    const user = room.users.get(socket.id);

    if (!user) return;

    user.seat = null;
    user.mic = false;

    sendRoomState(roomId);

    io.to(roomId).emit("voice-topology-change");

  });


  /* MIC */

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

    if (!user.seat && enabled) {

      socket.emit("room-error", {
        message: "Take a seat first"
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


  /* SPEAKER */

  socket.on("speaker-status", (enabled) => {

    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) return;

    const user = room.users.get(socket.id);

    if (!user) return;

    user.speaker = !!enabled;

    socket.emit("speaker-status-confirmed", {
      enabled: user.speaker
    });

  });


  /* CHAT */

  socket.on("chat-message", (message) => {

    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) return;

    const user = room.users.get(socket.id);

    if (!user) return;

    const clean =
      String(message || "").trim().slice(0, 500);

    if (!clean) return;

    io.to(roomId).emit("chat-message", {
      socketId: socket.id,
      userId: user.userId,
      name: user.name,
      message: clean,
      time: new Date().toLocaleTimeString(
        "en-IN",
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      )
    });

  });


  /* GIFT */

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


  /* ADMIN KICK */

  socket.on("admin-kick", (targetSocketId) => {

    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) return;

    if (room.hostSocketId !== socket.id) {

      socket.emit("room-error", {
        message: "Only host can kick users"
      });

      return;
    }

    const target =
      room.users.get(targetSocketId);

    if (!target) return;

    if (targetSocketId === socket.id) return;

    const targetSocket =
      io.sockets.sockets.get(targetSocketId);

    if (targetSocket) {

      targetSocket.emit(
        "kicked-from-room",
        {
          message:
            "You were removed by room host"
        }
      );

      targetSocket.leave(roomId);

      targetSocket.data.roomId = null;

    }

    room.users.delete(targetSocketId);

    sendRoomState(roomId);

    io.to(roomId).emit("voice-topology-change");

  });


  /* ADMIN MUTE */

  socket.on("admin-mute", (targetSocketId) => {

    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) return;

    if (room.hostSocketId !== socket.id) {

      socket.emit("room-error", {
        message: "Only host can mute users"
      });

      return;
    }

    const target =
      room.users.get(targetSocketId);

    if (!target) return;

    target.mutedByAdmin = true;
    target.mic = false;

    const targetSocket =
      io.sockets.sockets.get(targetSocketId);

    if (targetSocket) {

      targetSocket.emit(
        "forced-mute",
        {
          message:
            "You were muted by room host"
        }
      );

    }

    sendRoomState(roomId);

  });


  /* WEBRTC OFFER */

  socket.on("webrtc-offer", (data = {}) => {

    if (!data.target || !data.offer) return;

    io.to(data.target).emit(
      "webrtc-offer",
      {
        from: socket.id,
        offer: data.offer
      }
    );

  });


  /* WEBRTC ANSWER */

  socket.on("webrtc-answer", (data = {}) => {

    if (!data.target || !data.answer) return;

    io.to(data.target).emit(
      "webrtc-answer",
      {
        from: socket.id,
        answer: data.answer
      }
    );

  });


  /* ICE */

  socket.on("webrtc-ice", (data = {}) => {

    if (!data.target || !data.candidate) return;

    io.to(data.target).emit(
      "webrtc-ice",
      {
        from: socket.id,
        candidate: data.candidate
      }
    );

  });


  /* DISCONNECT */

  socket.on("disconnect", () => {

    console.log("DISCONNECTED:", socket.id);

    removeUserFromRoom(socket);

  });

});


const PORT =
  process.env.PORT || 3000;

server.listen(PORT, () => {

  console.log(
    "PawanVoice server running on port " + PORT
  );

});
