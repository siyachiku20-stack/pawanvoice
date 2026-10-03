const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

/*
  PawanVoice
  Realtime Voice Room Server
  9 seats
*/

const rooms = new Map();

function clean(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim().slice(0, 500);
}

function createRoom(roomId, options = {}) {
  const id = clean(roomId, "main");

  const room = {
    id,
    roomName: clean(options.roomName, `PawanVoice Room ${id}`),
    roomDp: clean(options.roomDp, ""),
    category: clean(options.category, "General"),

    hostSocketId: null,

    seats: Array.from({ length: 9 }, () => null),

    users: {},

    gifts: [],

    messages: [],

    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  rooms.set(id, room);
  return room;
}

function getRoom(roomId, options = {}) {
  const id = clean(roomId, "main");

  if (!rooms.has(id)) {
    return createRoom(id, options);
  }

  return rooms.get(id);
}

function publicUser(user) {
  if (!user) return null;

  return {
    socketId: user.socketId,
    userId: user.userId,
    name: user.name,
    dp: user.dp,
    micOn: !!user.micOn,
    speakerOn: user.speakerOn !== false,
    seat: user.seat,
    isHost: !!user.isHost,
    joinedAt: user.joinedAt
  };
}

function roomPayload(room) {
  return {
    id: room.id,
    roomId: room.id,
    roomName: room.roomName,
    name: room.roomName,
    roomDp: room.roomDp,
    category: room.category,

    hostSocketId: room.hostSocketId,

    seats: room.seats.map(seat => {
      if (!seat) return null;

      const user = room.users[seat.socketId];

      return user ? publicUser(user) : null;
    }),

    users: Object.values(room.users).map(publicUser),

    onlineCount: Object.keys(room.users).length,

    maxSeats: 9,

    gifts: room.gifts.slice(-50),

    messages: room.messages.slice(-50),

    updatedAt: room.updatedAt
  };
}

function broadcastRoom(room) {
  room.updatedAt = Date.now();

  io.to(room.id).emit("room-state", roomPayload(room));
}

function removeUserFromSeat(room, socketId) {
  for (let i = 0; i < room.seats.length; i++) {
    if (room.seats[i] && room.seats[i].socketId === socketId) {
      room.seats[i] = null;
    }
  }
}

function assignHost(room) {
  if (room.hostSocketId && room.users[room.hostSocketId]) {
    return;
  }

  const users = Object.values(room.users);

  if (!users.length) {
    room.hostSocketId = null;
    return;
  }

  const newHost = users.sort((a, b) => a.joinedAt - b.joinedAt)[0];

  room.hostSocketId = newHost.socketId;
  newHost.isHost = true;
}

function leaveRoom(socket) {
  const roomId = socket.data.roomId;

  if (!roomId) return;

  const room = rooms.get(roomId);

  if (!room) {
    socket.data.roomId = null;
    return;
  }

  const user = room.users[socket.id];

  if (user) {
    removeUserFromSeat(room, socket.id);

    delete room.users[socket.id];
  }

  if (room.hostSocketId === socket.id) {
    room.hostSocketId = null;

    Object.values(room.users).forEach(u => {
      u.isHost = false;
    });

    assignHost(room);
  }

  socket.leave(roomId);
  socket.data.roomId = null;

  if (Object.keys(room.users).length === 0) {
    rooms.delete(roomId);
    return;
  }

  broadcastRoom(room);
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
    rooms: rooms.size,
    time: Date.now()
  });
});

app.get("/rtc-config", (req, res) => {
  const iceServers = [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302"
      ]
    }
  ];

  if (
    process.env.TURN_URL &&
    process.env.TURN_USERNAME &&
    process.env.TURN_CREDENTIAL
  ) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }

  res.json({
    iceServers
  });
});

io.on("connection", socket => {

  console.log("Connected:", socket.id);

  /*
    JOIN ROOM
  */

  socket.on("join-room", data => {

    data = data || {};

    const roomId = clean(data.roomId || data.room, "main");

    const room = getRoom(roomId, {
      roomName: data.roomName || data.name,
      roomDp: data.roomDp || data.dp,
      category: data.category
    });

    // Leave previous room first
    if (socket.data.roomId && socket.data.roomId !== roomId) {
      leaveRoom(socket);
    }

    socket.join(roomId);

    socket.data.roomId = roomId;

    const userId = clean(
      data.userId,
      `user_${socket.id.slice(0, 6)}`
    );

    const name = clean(
      data.name,
      "Guest"
    );

    const dp = clean(
      data.dp,
      ""
    );

    const existing = room.users[socket.id];

    room.users[socket.id] = {
      socketId: socket.id,

      userId,

      name,

      dp,

      micOn: false,

      speakerOn: true,

      seat: existing ? existing.seat : null,

      isHost: false,

      joinedAt: existing
        ? existing.joinedAt
        : Date.now()
    };

    if (!room.hostSocketId) {
      room.hostSocketId = socket.id;
    }

    Object.values(room.users).forEach(user => {
      user.isHost = user.socketId === room.hostSocketId;
    });

    room.messages.push({
      type: "system",
      text: `${name} joined the room`,
      time: Date.now()
    });

    room.messages = room.messages.slice(-50);

    broadcastRoom(room);

    socket.emit("joined-room", {
      roomId,
      socketId: socket.id,
      host: room.hostSocketId === socket.id
    });
  });

  /*
    TAKE SEAT
  */

  socket.on("take-seat", data => {

    data = data || {};

    const room = rooms.get(socket.data.roomId);

    if (!room) return;

    const user = room.users[socket.id];

    if (!user) return;

    const seatIndex = Number(data.seat);

    if (
      !Number.isInteger(seatIndex) ||
      seatIndex < 0 ||
      seatIndex > 8
    ) {
      socket.emit("room-error", {
        message: "Invalid seat"
      });

      return;
    }

    // If seat already occupied
    if (
      room.seats[seatIndex] &&
      room.seats[seatIndex].socketId !== socket.id
    ) {
      socket.emit("room-error", {
        message: "This seat is already occupied"
      });

      return;
    }

    // Remove user's previous seat
    removeUserFromSeat(room, socket.id);

    room.seats[seatIndex] = {
      socketId: socket.id
    };

    user.seat = seatIndex;

    broadcastRoom(room);
  });

  /*
    LEAVE SEAT
  */

  socket.on("leave-seat", () => {

    const room = rooms.get(socket.data.roomId);

    if (!room) return;

    const user = room.users[socket.id];

    if (!user) return;

    removeUserFromSeat(room, socket.id);

    user.seat = null;
    user.micOn = false;

    broadcastRoom(room);
  });

  /*
    MIC
  */

  socket.on("mic-status", data => {

    const room = rooms.get(socket.data.roomId);

    if (!room) return;

    const user = room.users[socket.id];

    if (!user) return;

    if (user.seat === null || user.seat === undefined) {
      socket.emit("room-error", {
        message: "Seat par baithne ke baad mic use karein"
      });

      return;
    }

    user.micOn = !!data?.on;

    broadcastRoom(room);

    socket.to(room.id).emit("peer-mic-status", {
      socketId: socket.id,
      on: user.micOn
    });
  });

  /*
    SPEAKER
  */

  socket.on("speaker-status", data => {

    const room = rooms.get(socket.data.roomId);

    if (!room) return;

    const user = room.users[socket.id];

    if (!user) return;

    user.speakerOn = !!data?.on;

    broadcastRoom(room);
  });

  /*
    CHAT
  */

  socket.on("chat-message", data => {

    const room = rooms.get(socket.data.roomId);

    if (!room) return;

    const user = room.users[socket.id];

    if (!user) return;

    const text = clean(data?.text, "");

    if (!text) return;

    const message = {
      id:
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 7),

      type: "chat",

      socketId: socket.id,

      userId: user.userId,

      name: user.name,

      dp: user.dp,

      text,

      time: Date.now()
    };

    room.messages.push(message);

    room.messages = room.messages.slice(-50);

    io.to(room.id).emit("chat-message", message);
  });

  /*
    GIFT
  */

  socket.on("send-gift", data => {

    const room = rooms.get(socket.data.roomId);

    if (!room) return;

    const user = room.users[socket.id];

    if (!user) return;

    const gift = {
      id:
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 7),

      fromSocketId: socket.id,

      fromUserId: user.userId,

      fromName: user.name,

      fromDp: user.dp,

      giftId: clean(data?.giftId, "rose"),

      giftName: clean(data?.giftName, "Rose"),

      giftIcon: clean(data?.giftIcon, "🌹"),

      targetSeat:
        Number.isInteger(Number(data?.targetSeat))
          ? Number(data.targetSeat)
          : null,

      time: Date.now()
    };

    room.gifts.push(gift);

    room.gifts = room.gifts.slice(-50);

    io.to(room.id).emit("gift-received", gift);
  });

  /*
    ADMIN MUTE
  */

  socket.on("admin-mute", data => {

    const room = rooms.get(socket.data.roomId);

    if (!room) return;

    const sender = room.users[socket.id];

    if (!sender) return;

    if (
      !sender.isHost &&
      sender.seat !== 0
    ) {
      socket.emit("room-error", {
        message: "Only host can mute users"
      });

      return;
    }

    const targetSocketId = clean(data?.socketId);

    const target = room.users[targetSocketId];

    if (!target) return;

    target.micOn = false;

    io.to(targetSocketId).emit("force-mute");

    broadcastRoom(room);
  });

  /*
    ADMIN KICK
  */

  socket.on("admin-kick", data => {

    const room = rooms.get(socket.data.roomId);

    if (!room) return;

    const sender = room.users[socket.id];

    if (!sender) return;

    if (
      !sender.isHost &&
      sender.seat !== 0
    ) {
      socket.emit("room-error", {
        message: "Only host can kick users"
      });

      return;
    }

    const targetSocketId = clean(data?.socketId);

    const targetSocket = io.sockets.sockets.get(targetSocketId);

    const targetUser = room.users[targetSocketId];

    if (!targetSocket || !targetUser) return;

    targetSocket.emit("kicked");

    targetSocket.disconnect(true);
  });

  /*
    WEBRTC OFFER
  */

  socket.on("webrtc-offer", data => {

    const target = clean(data?.target);

    if (!target) return;

    io.to(target).emit("webrtc-offer", {
      from: socket.id,
      offer: data.offer
    });
  });

  /*
    WEBRTC ANSWER
  */

  socket.on("webrtc-answer", data => {

    const target = clean(data?.target);

    if (!target) return;

    io.to(target).emit("webrtc-answer", {
      from: socket.id,
      answer: data.answer
    });
  });

  /*
    WEBRTC ICE
  */

  socket.on("webrtc-ice", data => {

    const target = clean(data?.target);

    if (!target) return;

    io.to(target).emit("webrtc-ice", {
      from: socket.id,
      candidate: data.candidate
    });
  });

  /*
    ROOM INFO
  */

  socket.on("get-room-state", () => {

    const room = rooms.get(socket.data.roomId);

    if (!room) return;

    socket.emit("room-state", roomPayload(room));
  });

  /*
    DISCONNECT
  */

  socket.on("disconnect", () => {

    console.log("Disconnected:", socket.id);

    leaveRoom(socket);
  });
});

server.listen(PORT, () => {

  console.log(
    `PawanVoice server running on port ${PORT}`
  );

});
