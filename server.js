// ============================================================
// PAWANVOICE - REALTIME VOICE ROOM SERVER
// Works with:
//   index.html
//   room.html
//   Socket.IO
//   Render
//
// File location:
//   PawanVoice/server.js
// ============================================================

const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// ------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------

const PORT = process.env.PORT || 3000;
const MAX_SEATS = 9;

// ------------------------------------------------------------
// MIDDLEWARE
// ------------------------------------------------------------

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ------------------------------------------------------------
// STATIC FILES
// IMPORTANT:
// index.html and room.html must be in same folder as server.js
// ------------------------------------------------------------

const PUBLIC_DIR = __dirname;

app.use(express.static(PUBLIC_DIR, {
  index: "index.html",
  extensions: ["html"]
}));

// ------------------------------------------------------------
// SOCKET.IO
// ------------------------------------------------------------

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});

// ------------------------------------------------------------
// MEMORY DATA
// ------------------------------------------------------------

const rooms = new Map();
const connectedUsers = new Map();

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function cleanString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

function safeUserId(value, fallback) {
  const id = cleanString(value, fallback);

  if (!id) {
    return fallback;
  }

  return id.slice(0, 100);
}

function safeName(value, fallback = "Guest") {
  const name = cleanString(value, fallback);

  if (!name) {
    return fallback;
  }

  return name.slice(0, 60);
}

function createSeats() {
  return Array.from({ length: MAX_SEATS }, (_, index) => ({
    seat: index,
    userId: null,
    name: "",
    dp: "",
    muted: false,
    socketId: null
  }));
}

function createRoom(roomId) {
  return {
    id: roomId,
    roomId: roomId,

    name: "PawanVoice Room",
    roomName: "PawanVoice Room",

    dp: "",
    owner: "",
    ownerId: "",
    ownerDp: "",

    category: "General",

    users: {},
    members: {},

    seats: createSeats(),

    gifts: [],
    messages: [],

    roomExp: 0,
    topUsers: [],

    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function getRoom(roomId) {
  const id = cleanString(roomId);

  if (!id) {
    return null;
  }

  if (!rooms.has(id)) {
    rooms.set(id, createRoom(id));
  }

  return rooms.get(id);
}

function normalizeSeat(seat, index) {
  if (!seat) {
    return {
      seat: index,
      userId: null,
      name: "",
      dp: "",
      muted: false,
      socketId: null
    };
  }

  if (typeof seat === "string") {
    return {
      seat: index,
      userId: seat,
      name: "",
      dp: "",
      muted: false,
      socketId: null
    };
  }

  return {
    seat: index,
    userId: seat.userId || seat.id || null,
    name: seat.name || "",
    dp: seat.dp || seat.avatar || "",
    muted: Boolean(seat.muted),
    socketId: seat.socketId || null
  };
}

function normalizeRoom(room) {
  if (!room) {
    return null;
  }

  if (!Array.isArray(room.seats)) {
    room.seats = createSeats();
  }

  const newSeats = createSeats();

  for (let i = 0; i < MAX_SEATS; i++) {
    newSeats[i] = normalizeSeat(room.seats[i], i);
  }

  room.seats = newSeats;

  if (!room.users || typeof room.users !== "object") {
    room.users = {};
  }

  if (!room.members || typeof room.members !== "object") {
    room.members = {};
  }

  if (!Array.isArray(room.gifts)) {
    room.gifts = [];
  }

  if (!Array.isArray(room.messages)) {
    room.messages = [];
  }

  room.updatedAt = Date.now();

  return room;
}

function roomPublicData(room) {
  if (!room) {
    return null;
  }

  const users = {};

  Object.keys(room.users || {}).forEach((userId) => {
    const user = room.users[userId];

    if (!user) {
      return;
    }

    users[userId] = {
      userId: user.userId || userId,
      name: user.name || "Guest",
      dp: user.dp || "",
      socketId: user.socketId || null,
      muted: Boolean(user.muted),
      seat: findUserSeat(room, userId)
    };
  });

  return {
    id: room.id,
    roomId: room.roomId,

    name: room.name,
    roomName: room.roomName,

    dp: room.dp,
    owner: room.owner,
    ownerId: room.ownerId,
    ownerDp: room.ownerDp,

    category: room.category,

    users,
    members: users,

    seats: room.seats.map((seat) => ({
      seat: seat.seat,
      userId: seat.userId,
      name: seat.name,
      dp: seat.dp,
      muted: Boolean(seat.muted)
    })),

    gifts: room.gifts.slice(-50),
    messages: room.messages.slice(-100),

    roomExp: room.roomExp || 0,
    topUsers: room.topUsers || [],

    userCount: Object.keys(users).length,
    memberCount: Object.keys(users).length,

    createdAt: room.createdAt,
    updatedAt: room.updatedAt
  };
}

function findUserSeat(room, userId) {
  if (!room || !userId) {
    return -1;
  }

  for (let i = 0; i < room.seats.length; i++) {
    if (
      room.seats[i] &&
      String(room.seats[i].userId) === String(userId)
    ) {
      return i;
    }
  }

  return -1;
}

function findEmptySeat(room) {
  if (!room) {
    return -1;
  }

  for (let i = 0; i < MAX_SEATS; i++) {
    if (!room.seats[i].userId) {
      return i;
    }
  }

  return -1;
}

function removeUserFromSeats(room, userId) {
  if (!room) {
    return;
  }

  for (let i = 0; i < room.seats.length; i++) {
    if (
      room.seats[i] &&
      String(room.seats[i].userId) === String(userId)
    ) {
      room.seats[i] = {
        seat: i,
        userId: null,
        name: "",
        dp: "",
        muted: false,
        socketId: null
      };
    }
  }
}

function addUserToRoom(room, user) {
  if (!room || !user) {
    return;
  }

  const userId = safeUserId(user.userId, user.socketId);

  const userData = {
    userId,
    name: safeName(user.name),
    dp: cleanString(user.dp),
    socketId: user.socketId || null,
    muted: Boolean(user.muted),
    joinedAt: user.joinedAt || Date.now()
  };

  room.users[userId] = userData;
  room.members[userId] = userData;

  if (!room.ownerId) {
    room.ownerId = userId;
    room.owner = userData.name;
    room.ownerDp = userData.dp;
  }

  room.updatedAt = Date.now();
}

function removeUserFromRoom(room, userId) {
  if (!room || !userId) {
    return;
  }

  delete room.users[userId];
  delete room.members[userId];

  removeUserFromSeats(room, userId);

  room.updatedAt = Date.now();
}

function broadcastRoomState(room) {
  if (!room) {
    return;
  }

  const data = roomPublicData(room);

  io.to(`room:${room.id}`).emit("room-state", data);
  io.to(`room:${room.id}`).emit("roomState", data);

  io.to(`room:${room.id}`).emit(
    "room-member-count",
    data.memberCount
  );

  io.to(`room:${room.id}`).emit(
    "room-count",
    data.userCount
  );
}

function emitRoomUpdate(room) {
  if (!room) {
    return;
  }

  room.updatedAt = Date.now();

  const data = roomPublicData(room);

  io.to(`room:${room.id}`).emit("room-updated", data);

  broadcastRoomState(room);
}

function leaveSocketFromCurrentRoom(socket) {
  const roomId = socket.data.roomId;

  if (!roomId) {
    return null;
  }

  const room = rooms.get(roomId);

  if (!room) {
    socket.data.roomId = null;
    return null;
  }

  const userId = socket.data.userId;

  if (userId) {
    removeUserFromRoom(room, userId);
  }

  socket.leave(`room:${roomId}`);

  socket.data.roomId = null;

  broadcastRoomState(room);

  return room;
}

function getSocketByUserId(room, userId) {
  if (!room || !userId) {
    return null;
  }

  const user = room.users[userId];

  if (!user || !user.socketId) {
    return null;
  }

  return io.sockets.sockets.get(user.socketId) || null;
}

function isRoomOwner(room, userId) {
  if (!room || !userId) {
    return false;
  }

  return String(room.ownerId) === String(userId);
}

function isUserInRoom(room, userId) {
  if (!room || !userId) {
    return false;
  }

  return Boolean(room.users[userId]);
}

// ------------------------------------------------------------
// BASIC HTTP ROUTES
// ------------------------------------------------------------

app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/room.html", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "room.html"));
});

app.get("/health", (req, res) => {
  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    seats: MAX_SEATS,
    rooms: rooms.size,
    users: connectedUsers.size,
    time: new Date().toISOString()
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    seats: MAX_SEATS,
    rooms: rooms.size,
    users: connectedUsers.size
  });
});

app.get("/api/rooms", (req, res) => {
  const result = [];

  rooms.forEach((room) => {
    result.push(roomPublicData(room));
  });

  res.json({
    rooms: result
  });
});

app.get("/api/rooms/:roomId", (req, res) => {
  const room = rooms.get(req.params.roomId);

  if (!room) {
    return res.status(404).json({
      error: "Room not found"
    });
  }

  res.json(roomPublicData(room));
});

// ------------------------------------------------------------
// SOCKET CONNECTION
// ------------------------------------------------------------

io.on("connection", (socket) => {

  console.log(
    "Socket connected:",
    socket.id
  );

  // ----------------------------------------------------------
  // REGISTER USER
  // ----------------------------------------------------------

  socket.on("register-user", (data = {}) => {

    const userId = safeUserId(
      data.userId || data.id,
      socket.id
    );

    const user = {
      userId,
      name: safeName(data.name, "Guest"),
      dp: cleanString(data.dp),
      socketId: socket.id,
      muted: Boolean(data.muted),
      joinedAt: Date.now()
    };

    socket.data.userId = userId;
    socket.data.name = user.name;
    socket.data.dp = user.dp;

    connectedUsers.set(userId, {
      socketId: socket.id,
      userId,
      name: user.name,
      dp: user.dp,
      connectedAt: Date.now()
    });

    socket.emit("registered-user", {
      ok: true,
      user
    });

    console.log(
      "User registered:",
      userId,
      user.name
    );
  });

  // ----------------------------------------------------------
  // JOIN ROOM
  // ----------------------------------------------------------

  socket.on("join-room", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      data.id ||
      data.room ||
      "main"
    );

    const userId = safeUserId(
      data.userId ||
      data.id ||
      socket.data.userId,
      socket.id
    );

    const name = safeName(
      data.name ||
      socket.data.name,
      "Guest"
    );

    const dp = cleanString(
      data.dp ||
      socket.data.dp
    );

    // If socket is already inside another room,
    // remove it first.
    if (
      socket.data.roomId &&
      socket.data.roomId !== roomId
    ) {
      leaveSocketFromCurrentRoom();
    }

    const room = getRoom(roomId);

    if (!room) {
      socket.emit("room-error", {
        message: "Invalid room ID"
      });

      return;
    }

    normalizeRoom(room);

    socket.data.userId = userId;
    socket.data.name = name;
    socket.data.dp = dp;
    socket.data.roomId = roomId;

    socket.join(`room:${roomId}`);

    addUserToRoom(room, {
      userId,
      name,
      dp,
      socketId: socket.id
    });

    // Send current state to joining user.
    const state = roomPublicData(room);

    socket.emit("room-state", state);
    socket.emit("roomState", state);

    socket.emit("room-joined", {
      ok: true,
      room: state,
      roomId,
      userId
    });

    // Notify everyone else.
    socket.to(`room:${roomId}`).emit("user-entry", {
      userId,
      name,
      dp,
      socketId: socket.id,
      roomId
    });

    socket.to(`room:${roomId}`).emit("user-joined", {
      userId,
      name,
      dp,
      socketId: socket.id,
      roomId
    });

    broadcastRoomState(room);

    console.log(
      `JOIN ROOM: ${name} (${userId}) -> ${roomId}`
    );
  });

  // ----------------------------------------------------------
  // JOIN ROOM ALIAS
  // ----------------------------------------------------------

  socket.on("joinRoom", (data = {}) => {
    socket.emit("join-room-request-forwarded");

    socket.listeners("join-room");

    // Call the main handler through emit.
    socket.emit("internal-join-room-not-used");
  });

  // ----------------------------------------------------------
  // CREATE ROOM
  // ----------------------------------------------------------

  socket.on("create-room", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      data.id
    );

    if (!roomId) {
      socket.emit("room-error", {
        message: "Room ID required"
      });

      return;
    }

    let room = rooms.get(roomId);

    if (!room) {
      room = createRoom(roomId);
      rooms.set(roomId, room);
    }

    room.name = safeName(
      data.name ||
      data.roomName,
      room.name
    );

    room.roomName = room.name;

    room.dp = cleanString(
      data.dp ||
      room.dp
    );

    room.ownerId = safeUserId(
      data.ownerId ||
      data.userId ||
      socket.data.userId,
      socket.id
    );

    room.owner = safeName(
      data.owner ||
      data.ownerName ||
      socket.data.name,
      "Guest"
    );

    room.ownerDp = cleanString(
      data.ownerDp ||
      data.dp ||
      socket.data.dp
    );

    room.category = safeName(
      data.category,
      "General"
    );

    room.createdAt =
      room.createdAt ||
      Date.now();

    room.updatedAt = Date.now();

    socket.emit("room-created", {
      ok: true,
      room: roomPublicData(room)
    });

    io.emit("room-updated", roomPublicData(room));

    console.log(
      "Room created:",
      roomId
    );
  });

  // ----------------------------------------------------------
  // TAKE SEAT
  // ----------------------------------------------------------

  socket.on("take-seat", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      socket.data.roomId
    );

    const room = rooms.get(roomId);

    if (!room) {
      socket.emit("room-error", {
        message: "Room not found"
      });

      return;
    }

    const userId = safeUserId(
      data.userId ||
      socket.data.userId,
      socket.id
    );

    if (!isUserInRoom(room, userId)) {
      socket.emit("room-error", {
        message: "Join the room first"
      });

      return;
    }

    const requestedSeat = Number(
      data.seat !== undefined
        ? data.seat
        : data.seatIndex
    );

    let seatIndex = Number.isInteger(requestedSeat)
      ? requestedSeat
      : -1;

    // Allow 1-9 as seat number.
    if (seatIndex >= 1 && seatIndex <= MAX_SEATS) {
      seatIndex -= 1;
    }

    if (
      seatIndex < 0 ||
      seatIndex >= MAX_SEATS
    ) {
      seatIndex = findEmptySeat(room);
    }

    // Already seated?
    const oldSeat = findUserSeat(
      room,
      userId
    );

    if (oldSeat !== -1) {
      socket.emit("seat-taken", {
        ok: true,
        seat: oldSeat,
        userId
      });

      return;
    }

    if (seatIndex === -1) {
      socket.emit("seat-error", {
        message: "All 9 seats are occupied"
      });

      return;
    }

    if (room.seats[seatIndex].userId) {
      socket.emit("seat-error", {
        message: "This seat is already occupied"
      });

      return;
    }

    const user = room.users[userId];

    room.seats[seatIndex] = {
      seat: seatIndex,
      userId,
      name: user.name,
      dp: user.dp,
      muted: Boolean(user.muted),
      socketId: socket.id
    };

    room.updatedAt = Date.now();

    socket.emit("seat-taken", {
      ok: true,
      seat: seatIndex,
      userId
    });

    io.to(`room:${roomId}`).emit("seat-update", {
      seat: seatIndex,
      userId,
      name: user.name,
      dp: user.dp,
      muted: Boolean(user.muted)
    });

    broadcastRoomState(room);

    console.log(
      `SEAT: ${userId} -> ${roomId} -> ${seatIndex + 1}`
    );
  });

  // ----------------------------------------------------------
  // LEAVE SEAT
  // ----------------------------------------------------------

  socket.on("leave-seat", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      socket.data.roomId
    );

    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    const userId = safeUserId(
      data.userId ||
      socket.data.userId,
      socket.id
    );

    const seatIndex = findUserSeat(
      room,
      userId
    );

    if (seatIndex === -1) {
      return;
    }

    room.seats[seatIndex] = {
      seat: seatIndex,
      userId: null,
      name: "",
      dp: "",
      muted: false,
      socketId: null
    };

    room.updatedAt = Date.now();

    io.to(`room:${roomId}`).emit(
      "seat-update",
      {
        seat: seatIndex,
        userId: null,
        name: "",
        dp: "",
        muted: false
      }
    );

    broadcastRoomState(room);
  });

  // ----------------------------------------------------------
  // MIC STATUS
  // ----------------------------------------------------------

  socket.on("mic-status", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      socket.data.roomId
    );

    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    const userId = safeUserId(
      data.userId ||
      socket.data.userId,
      socket.id
    );

    const muted = Boolean(
      data.muted ??
      data.isMuted ??
      false
    );

    if (room.users[userId]) {
      room.users[userId].muted = muted;
    }

    const seatIndex = findUserSeat(
      room,
      userId
    );

    if (seatIndex !== -1) {
      room.seats[seatIndex].muted = muted;
    }

    room.updatedAt = Date.now();

    io.to(`room:${roomId}`).emit(
      "mic-status",
      {
        userId,
        muted,
        seat: seatIndex
      }
    );

    broadcastRoomState(room);
  });

  // Alternative event name.
  socket.on("toggle-mic", (data = {}) => {
    socket.emit("mic-status-forwarded");

    const roomId = cleanString(
      data.roomId ||
      socket.data.roomId
    );

    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    const userId = safeUserId(
      data.userId ||
      socket.data.userId,
      socket.id
    );

    const muted = Boolean(
      data.muted ??
      data.isMuted ??
      false
    );

    if (room.users[userId]) {
      room.users[userId].muted = muted;
    }

    const seatIndex = findUserSeat(
      room,
      userId
    );

    if (seatIndex !== -1) {
      room.seats[seatIndex].muted = muted;
    }

    io.to(`room:${roomId}`).emit(
      "mic-status",
      {
        userId,
        muted,
        seat: seatIndex
      }
    );

    broadcastRoomState(room);
  });

  // ----------------------------------------------------------
  // PROFILE UPDATE
  // ----------------------------------------------------------

  socket.on("profile-update", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      socket.data.roomId
    );

    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    const userId = safeUserId(
      data.userId ||
      socket.data.userId,
      socket.id
    );

    if (!room.users[userId]) {
      return;
    }

    if (data.name !== undefined) {
      room.users[userId].name =
        safeName(data.name);
    }

    if (data.dp !== undefined) {
      room.users[userId].dp =
        cleanString(data.dp);
    }

    const seatIndex = findUserSeat(
      room,
      userId
    );

    if (seatIndex !== -1) {
      room.seats[seatIndex].name =
        room.users[userId].name;

      room.seats[seatIndex].dp =
        room.users[userId].dp;
    }

    if (String(room.ownerId) === String(userId)) {
      room.owner =
        room.users[userId].name;

      room.ownerDp =
        room.users[userId].dp;
    }

    socket.data.name =
      room.users[userId].name;

    socket.data.dp =
      room.users[userId].dp;

    room.updatedAt = Date.now();

    io.to(`room:${roomId}`).emit(
      "profile-updated",
      {
        userId,
        name: room.users[userId].name,
        dp: room.users[userId].dp
      }
    );

    broadcastRoomState(room);
  });

  // ----------------------------------------------------------
  // ROOM UPDATE
  // ----------------------------------------------------------

  socket.on("room-update", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      socket.data.roomId
    );

    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    const userId = safeUserId(
      data.userId ||
      socket.data.userId,
      socket.id
    );

    // Only owner can change main room information.
    if (
      room.ownerId &&
      !isRoomOwner(room, userId)
    ) {
      return;
    }

    if (
      data.name !== undefined ||
      data.roomName !== undefined
    ) {
      room.name = safeName(
        data.name ||
        data.roomName,
        room.name
      );

      room.roomName = room.name;
    }

    if (data.dp !== undefined) {
      room.dp = cleanString(data.dp);
    }

    if (data.category !== undefined) {
      room.category = safeName(
        data.category,
        room.category
      );
    }

    room.updatedAt = Date.now();

    emitRoomUpdate(room);
  });

  // ----------------------------------------------------------
  // CHAT
  // ----------------------------------------------------------

  socket.on("chat", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      socket.data.roomId
    );

    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    const userId = safeUserId(
      data.userId ||
      socket.data.userId,
      socket.id
    );

    if (!isUserInRoom(room, userId)) {
      return;
    }

    const user = room.users[userId];

    const messageText = cleanString(
      data.message ||
      data.text
    );

    if (!messageText) {
      return;
    }

    const message = {
      id:
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 8),

      userId,
      name: user.name,
      dp: user.dp,

      message: messageText.slice(0, 500),
      text: messageText.slice(0, 500),

      type: data.type || "text",

      createdAt: Date.now()
    };

    room.messages.push(message);

    if (room.messages.length > 100) {
      room.messages =
        room.messages.slice(-100);
    }

    room.updatedAt = Date.now();

    io.to(`room:${roomId}`).emit(
      "chat",
      message
    );

    io.to(`room:${roomId}`).emit(
      "room-chat",
      message
    );
  });

  // ----------------------------------------------------------
  // EMOJI
  // ----------------------------------------------------------

  socket.on("emoji", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      socket.data.roomId
    );

    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    const userId = safeUserId(
      data.userId ||
      socket.data.userId,
      socket.id
    );

    if (!isUserInRoom(room, userId)) {
      return;
    }

    const user = room.users[userId];

    const emoji = cleanString(
      data.emoji ||
      data.text
    );

    if (!emoji) {
      return;
    }

    const payload = {
      userId,
      name: user.name,
      dp: user.dp,
      emoji: emoji.slice(0, 20),
      createdAt: Date.now()
    };

    io.to(`room:${roomId}`).emit(
      "emoji",
      payload
    );
  });

  // ----------------------------------------------------------
  // GIFTS
  // ----------------------------------------------------------

  socket.on("gift", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      socket.data.roomId
    );

    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    const userId = safeUserId(
      data.userId ||
      socket.data.userId,
      socket.id
    );

    if (!isUserInRoom(room, userId)) {
      return;
    }

    const sender = room.users[userId];

    const gift = {
      id:
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 7),

      userId,
      name: sender.name,
      dp: sender.dp,

      giftId:
        cleanString(data.giftId) ||
        "heart",

      giftName:
        cleanString(data.giftName) ||
        cleanString(data.name) ||
        "Gift",

      giftEmoji:
        cleanString(data.giftEmoji) ||
        "❤️",

      quantity:
        Math.max(
          1,
          Number(data.quantity) || 1
        ),

      createdAt: Date.now()
    };

    room.gifts.push(gift);

    if (room.gifts.length > 50) {
      room.gifts =
        room.gifts.slice(-50);
    }

    room.roomExp =
      Number(room.roomExp || 0) +
      gift.quantity;

    room.updatedAt = Date.now();

    io.to(`room:${roomId}`).emit(
      "gift",
      gift
    );

    io.to(`room:${roomId}`).emit(
      "room-gift",
      gift
    );

    broadcastRoomState(room);
  });

  // ----------------------------------------------------------
  // FOLLOW
  // ----------------------------------------------------------

  socket.on("follow-user", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      socket.data.roomId
    );

    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    const fromUserId = safeUserId(
      data.userId ||
      socket.data.userId,
      socket.id
    );

    const targetUserId = safeUserId(
      data.targetUserId ||
      data.targetId
    );

    if (!targetUserId) {
      return;
    }

    io.to(`room:${roomId}`).emit(
      "follow-updated",
      {
        fromUserId,
        targetUserId,
        following: true
      }
    );
  });

  // ----------------------------------------------------------
  // CP REQUEST
  // ----------------------------------------------------------

  socket.on("cp-request", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      socket.data.roomId
    );

    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    const fromUserId = safeUserId(
      data.userId ||
      socket.data.userId,
      socket.id
    );

    const targetUserId = safeUserId(
      data.targetUserId ||
      data.toUserId
    );

    if (!targetUserId) {
      return;
    }

    const payload = {
      fromUserId,
      targetUserId,
      fromName:
        data.fromName ||
        socket.data.name ||
        "Guest",

      message:
        cleanString(data.message) ||
        "CP Request",

      createdAt: Date.now()
    };

    const targetSocket =
      getSocketByUserId(
        room,
        targetUserId
      );

    if (targetSocket) {
      targetSocket.emit(
        "cp-request",
        payload
      );
    }

    socket.emit(
      "cp-request-sent",
      payload
    );
  });

  // ----------------------------------------------------------
  // MUTE USER
  // ----------------------------------------------------------

  socket.on("mute-user", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      socket.data.roomId
    );

    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    const adminId = safeUserId(
      data.userId ||
      socket.data.userId,
      socket.id
    );

    const targetUserId = safeUserId(
      data.targetUserId ||
      data.targetId
    );

    if (!isRoomOwner(room, adminId)) {
      return;
    }

    if (!room.users[targetUserId]) {
      return;
    }

    const muted = Boolean(
      data.muted ??
      true
    );

    room.users[targetUserId].muted =
      muted;

    const seatIndex =
      findUserSeat(
        room,
        targetUserId
      );

    if (seatIndex !== -1) {
      room.seats[seatIndex].muted =
        muted;
    }

    const targetSocket =
      getSocketByUserId(
        room,
        targetUserId
      );

    if (targetSocket) {
      targetSocket.emit(
        "force-mute",
        {
          userId: targetUserId,
          muted
        }
      );
    }

    io.to(`room:${roomId}`).emit(
      "user-muted",
      {
        userId: targetUserId,
        muted
      }
    );

    broadcastRoomState(room);
  });

  // ----------------------------------------------------------
  // KICK USER
  // ----------------------------------------------------------

  socket.on("kick-user", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      socket.data.roomId
    );

    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    const adminId = safeUserId(
      data.userId ||
      socket.data.userId,
      socket.id
    );

    const targetUserId = safeUserId(
      data.targetUserId ||
      data.targetId
    );

    if (!isRoomOwner(room, adminId)) {
      socket.emit("room-error", {
        message: "Only room owner can kick users"
      });

      return;
    }

    if (!targetUserId) {
      return;
    }

    if (
      String(targetUserId) ===
      String(room.ownerId)
    ) {
      return;
    }

    const targetSocket =
      getSocketByUserId(
        room,
        targetUserId
      );

    removeUserFromRoom(
      room,
      targetUserId
    );

    if (targetSocket) {

      targetSocket.emit(
        "kicked",
        {
          roomId,
          message:
            "You were removed from this room."
        }
      );

      targetSocket.leave(
        `room:${roomId}`
      );

      targetSocket.data.roomId =
        null;
    }

    io.to(`room:${roomId}`).emit(
      "user-kicked",
      {
        userId: targetUserId
      }
    );

    broadcastRoomState(room);

    console.log(
      `KICK: ${targetUserId} from ${roomId}`
    );
  });

  // ----------------------------------------------------------
  // WEBRTC OFFER
  // ----------------------------------------------------------

  socket.on("webrtc-offer", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      socket.data.roomId
    );

    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    const targetUserId =
      cleanString(
        data.targetUserId ||
        data.to ||
        data.target
      );

    if (!targetUserId) {
      return;
    }

    const targetSocket =
      getSocketByUserId(
        room,
        targetUserId
      );

    if (!targetSocket) {
      return;
    }

    targetSocket.emit(
      "webrtc-offer",
      {
        ...data,
        fromUserId:
          data.fromUserId ||
          socket.data.userId,
        from:
          data.from ||
          socket.data.userId
      }
    );
  });

  // ----------------------------------------------------------
  // WEBRTC ANSWER
  // ----------------------------------------------------------

  socket.on("webrtc-answer", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      socket.data.roomId
    );

    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    const targetUserId =
      cleanString(
        data.targetUserId ||
        data.to ||
        data.target
      );

    if (!targetUserId) {
      return;
    }

    const targetSocket =
      getSocketByUserId(
        room,
        targetUserId
      );

    if (!targetSocket) {
      return;
    }

    targetSocket.emit(
      "webrtc-answer",
      {
        ...data,
        fromUserId:
          data.fromUserId ||
          socket.data.userId,
        from:
          data.from ||
          socket.data.userId
      }
    );
  });

  // ----------------------------------------------------------
  // WEBRTC ICE
  // ----------------------------------------------------------

  socket.on("webrtc-ice", (data = {}) => {

    const roomId = cleanString(
      data.roomId ||
      socket.data.roomId
    );

    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    const targetUserId =
      cleanString(
        data.targetUserId ||
        data.to ||
        data.target
      );

    if (!targetUserId) {
      return;
    }

    const targetSocket =
      getSocketByUserId(
        room,
        targetUserId
      );

    if (!targetSocket) {
      return;
    }

    targetSocket.emit(
      "webrtc-ice",
      {
        ...data,
        fromUserId:
          data.fromUserId ||
          socket.data.userId,
        from:
          data.from ||
          socket.data.userId
      }
    );
  });

  // ----------------------------------------------------------
  // GENERIC SIGNAL ALIASES
  // ----------------------------------------------------------

  socket.on("offer", (data = {}) => {
    socket.emit(
      "webrtc-offer-forwarded"
    );

    socket.listeners("webrtc-offer");

    const room =
      rooms.get(
        cleanString(
          data.roomId ||
          socket.data.roomId
        )
      );

    if (!room) {
      return;
    }

    const targetUserId =
      cleanString(
        data.targetUserId ||
        data.to
      );

    const targetSocket =
      getSocketByUserId(
        room,
        targetUserId
      );

    if (targetSocket) {
      targetSocket.emit(
        "webrtc-offer",
        {
          ...data,
          fromUserId:
            data.fromUserId ||
            socket.data.userId
        }
      );
    }
  });

  socket.on("answer", (data = {}) => {

    const room =
      rooms.get(
        cleanString(
          data.roomId ||
          socket.data.roomId
        )
      );

    if (!room) {
      return;
    }

    const targetUserId =
      cleanString(
        data.targetUserId ||
        data.to
      );

    const targetSocket =
      getSocketByUserId(
        room,
        targetUserId
      );

    if (targetSocket) {
      targetSocket.emit(
        "webrtc-answer",
        {
          ...data,
          fromUserId:
            data.fromUserId ||
            socket.data.userId
        }
      );
    }
  });

  socket.on("ice-candidate", (data = {}) => {

    const room =
      rooms.get(
        cleanString(
          data.roomId ||
          socket.data.roomId
        )
      );

    if (!room) {
      return;
    }

    const targetUserId =
      cleanString(
        data.targetUserId ||
        data.to
      );

    const targetSocket =
      getSocketByUserId(
        room,
        targetUserId
      );

    if (targetSocket) {
      targetSocket.emit(
        "webrtc-ice",
        {
          ...data,
          fromUserId:
            data.fromUserId ||
            socket.data.userId
        }
      );
    }
  });

  // ----------------------------------------------------------
  // LEAVE ROOM
  // ----------------------------------------------------------

  socket.on("leave-room", () => {

    const roomId =
      socket.data.roomId;

    if (!roomId) {
      return;
    }

    const userId =
      socket.data.userId;

    const room =
      rooms.get(roomId);

    if (room && userId) {

      removeUserFromRoom(
        room,
        userId
      );

      io.to(`room:${roomId}`).emit(
        "user-left",
        {
          userId
        }
      );

      broadcastRoomState(room);
    }

    socket.leave(
      `room:${roomId}`
    );

    socket.data.roomId = null;

    console.log(
      `LEAVE ROOM: ${userId} -> ${roomId}`
    );
  });

  // ----------------------------------------------------------
  // DISCONNECT
  // ----------------------------------------------------------

  socket.on("disconnect", (reason) => {

    const roomId =
      socket.data.roomId;

    const userId =
      socket.data.userId;

    console.log(
      "Socket disconnected:",
      socket.id,
      reason
    );

    if (roomId) {

      const room =
        rooms.get(roomId);

      if (room && userId) {

        removeUserFromRoom(
          room,
          userId
        );

        io.to(`room:${roomId}`).emit(
          "user-left",
          {
            userId
          }
        );

        broadcastRoomState(room);

        // Remove empty room after a short period.
        if (
          Object.keys(room.users).length === 0
        ) {
          setTimeout(() => {

            const current =
              rooms.get(roomId);

            if (
              current &&
              Object.keys(
                current.users
              ).length === 0
            ) {
              rooms.delete(roomId);

              console.log(
                "Empty room removed:",
                roomId
              );
            }

          }, 5 * 60 * 1000);
        }
      }
    }

    if (userId) {
      connectedUsers.delete(
        userId
      );
    }
  });
});

// ------------------------------------------------------------
// START SERVER
// ------------------------------------------------------------

server.listen(PORT, "0.0.0.0", () => {

  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    "        PAWANVOICE ROOM SERVER"
  );
  console.log(
    "=============================================="
  );
  console.log(
    "Server running on port:",
    PORT
  );
  console.log(
    "Max seats:",
    MAX_SEATS
  );
  console.log(
    "Socket.IO:",
    "enabled"
  );
  console.log(
    "Static directory:",
    PUBLIC_DIR
  );
  console.log(
    "=============================================="
  );
  console.log("");
});
