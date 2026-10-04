const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
}));

app.use(express.json({ limit: "1mb" }));

// Serve all files from this GitHub/Render project folder
app.use(express.static(__dirname));

// ----------------------------------------------------
// BASIC ROUTES
// ----------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    seats: 9,
    rooms: rooms.size
  });
});

app.get("/room.html", (req, res) => {
  res.sendFile(__dirname + "/room.html");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    app: "PawanVoice",
    rooms: rooms.size,
    time: Date.now()
  });
});

// ----------------------------------------------------
// WEBRTC CONFIG
// ----------------------------------------------------

app.get("/rtc-config", (req, res) => {
  const iceServers = [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302"
      ]
    }
  ];

  // Optional TURN server from Render Environment Variables
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

// ----------------------------------------------------
// SOCKET.IO
// ----------------------------------------------------

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

// ----------------------------------------------------
// ROOM STORAGE
// ----------------------------------------------------

const rooms = new Map();

function cleanText(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim().slice(0, 500);
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  return n;
}

function makeRoom(roomId) {
  return {
    id: roomId,
    name: "PawanVoice Room",
    dp: "https://i.pravatar.cc/200?img=12",

    seats: Array(9).fill(null),

    users: new Map(),

    messages: [],

    gifts: [],

    createdAt: Date.now()
  };
}

function getRoom(roomId) {
  const id = cleanText(roomId, "main") || "main";

  if (!rooms.has(id)) {
    rooms.set(id, makeRoom(id));
  }

  return rooms.get(id);
}

// ----------------------------------------------------
// USER DATA
// ----------------------------------------------------

function cleanUser(data = {}, socketId = "") {
  const userId =
    cleanText(data.userId) ||
    cleanText(data.id) ||
    socketId;

  return {
    userId,

    socketId,

    name:
      cleanText(data.name, "Guest").slice(0, 40) ||
      "Guest",

    dp:
      cleanText(
        data.dp,
        "https://i.pravatar.cc/200?img=12"
      ),

    level: Math.max(
      1,
      safeNumber(data.level, 1)
    ),

    exp: Math.max(
      0,
      safeNumber(data.exp, 0)
    ),

    vipLevel: Math.max(
      0,
      safeNumber(data.vipLevel, 0)
    ),

    vipExp: Math.max(
      0,
      safeNumber(data.vipExp, 0)
    ),

    avatarFrame:
      data.avatarFrame &&
      typeof data.avatarFrame === "object"
        ? data.avatarFrame
        : {
            id: "default",
            name: "Default Frame",
            image: "",
            active: true
          },

    badge:
      data.badge &&
      typeof data.badge === "object"
        ? data.badge
        : {
            id: "default",
            name: "New User",
            image: "",
            active: true
          },

    entryEffect:
      data.entryEffect &&
      typeof data.entryEffect === "object"
        ? data.entryEffect
        : {
            id: "default",
            name: "Default Entry",
            image: "",
            active: true
          },

    mic:
      data.mic === false
        ? false
        : true,

    joinedAt: Date.now()
  };
}

// ----------------------------------------------------
// ROOM STATE
// ----------------------------------------------------

function roomState(room) {
  const users = {};

  for (const [userId, user] of room.users.entries()) {
    users[userId] = {
      userId: user.userId,
      socketId: user.socketId,

      name: user.name,
      dp: user.dp,

      level: user.level,
      exp: user.exp,

      vipLevel: user.vipLevel,
      vipExp: user.vipExp,

      avatarFrame: user.avatarFrame,
      badge: user.badge,
      entryEffect: user.entryEffect,

      mic: user.mic
    };
  }

  return {
    id: room.id,

    name: room.name,

    dp: room.dp,

    seats: room.seats,

    users,

    messages: room.messages.slice(-100),

    gifts: room.gifts.slice(-100)
  };
}

// ----------------------------------------------------
// FIND USER
// ----------------------------------------------------

function findUserSocket(room, userId) {
  const user = room.users.get(userId);

  if (!user) {
    return null;
  }

  return user.socketId;
}

function removeUserFromSeats(room, userId) {
  for (let i = 0; i < room.seats.length; i++) {
    if (room.seats[i] === userId) {
      room.seats[i] = null;
    }
  }
}

// ----------------------------------------------------
// SOCKET CONNECTION
// ----------------------------------------------------

io.on("connection", (socket) => {

  console.log(
    "Socket connected:",
    socket.id
  );

  // --------------------------------------------------
  // JOIN ROOM
  // --------------------------------------------------

  socket.on("join-room", (data = {}) => {

    try {

      const roomId =
        cleanText(data.roomId, "main") ||
        "main";

      const room = getRoom(roomId);

      const user = cleanUser(
        data,
        socket.id
      );

      // If same user already exists, remove old socket
      const oldUser = room.users.get(user.userId);

      if (oldUser && oldUser.socketId !== socket.id) {

        try {
          io.to(oldUser.socketId).emit(
            "session-replaced"
          );
        } catch (e) {}

        removeUserFromSeats(
          room,
          user.userId
        );
      }

      room.users.set(
        user.userId,
        user
      );

      socket.data.roomId = roomId;
      socket.data.userId = user.userId;

      socket.join(roomId);

      // Host gets first seat automatically
      if (
        room.seats.every(
          seat => seat === null
        )
      ) {
        room.seats[0] = user.userId;
      }

      // Send complete state to joining user
      socket.emit(
        "room-state",
        roomState(room)
      );

      // Also support older room.html listener
      socket.emit(
        "roomState",
        roomState(room)
      );

      // Tell existing users
      socket.to(roomId).emit(
        "user-entry",
        {
          ...user,
          socketId: socket.id
        }
      );

      // Broadcast fresh state
      io.to(roomId).emit(
        "room-state",
        roomState(room)
      );

      console.log(
        "Joined:",
        user.userId,
        "Room:",
        roomId
      );

    } catch (error) {

      console.error(
        "join-room error:",
        error
      );

      socket.emit(
        "room-error",
        {
          message:
            "Unable to join room."
        }
      );
    }
  });

  // --------------------------------------------------
  // GET ROOM STATE
  // --------------------------------------------------

  socket.on("get-room-state", () => {

    const roomId =
      socket.data.roomId;

    if (!roomId) {
      return;
    }

    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    socket.emit(
      "room-state",
      roomState(room)
    );
  });

  // --------------------------------------------------
  // TAKE SEAT
  // --------------------------------------------------

  socket.on("take-seat", (data = {}) => {

    const roomId =
      socket.data.roomId ||
      cleanText(data.roomId, "main");

    const userId =
      socket.data.userId ||
      cleanText(data.userId);

    const room =
      rooms.get(roomId);

    if (!room || !userId) {
      return;
    }

    const user =
      room.users.get(userId);

    if (!user) {
      socket.emit(
        "error-message",
        {
          message:
            "User is not in this room."
        }
      );

      return;
    }

    let seatIndex =
      Number(data.seat);

    if (!Number.isInteger(seatIndex)) {
      seatIndex =
        Number(data.seatIndex);
    }

    if (
      !Number.isInteger(seatIndex) ||
      seatIndex < 0 ||
      seatIndex >= 9
    ) {
      socket.emit(
        "error-message",
        {
          message:
            "Invalid seat."
        }
      );

      return;
    }

    // Already sitting somewhere
    removeUserFromSeats(
      room,
      userId
    );

    // Seat occupied
    if (
      room.seats[seatIndex] &&
      room.seats[seatIndex] !== userId
    ) {

      socket.emit(
        "error-message",
        {
          message:
            "This seat is already occupied."
        }
      );

      return;
    }

    room.seats[seatIndex] =
      userId;

    io.to(roomId).emit(
      "seat-taken",
      {
        seat: seatIndex,
        seatIndex: seatIndex,
        userId: userId,
        user: {
          ...user
        }
      }
    );

    io.to(roomId).emit(
      "room-state",
      roomState(room)
    );
  });

  // --------------------------------------------------
  // LEAVE SEAT
  // --------------------------------------------------

  socket.on("leave-seat", (data = {}) => {

    const roomId =
      socket.data.roomId ||
      cleanText(data.roomId);

    const userId =
      socket.data.userId ||
      cleanText(data.userId);

    const room =
      rooms.get(roomId);

    if (!room) {
      return;
    }

    removeUserFromSeats(
      room,
      userId
    );

    io.to(roomId).emit(
      "room-state",
      roomState(room)
    );
  });

  // --------------------------------------------------
  // MIC STATUS
  // --------------------------------------------------

  socket.on("mic-status", (data = {}) => {

    const roomId =
      socket.data.roomId ||
      cleanText(data.roomId);

    const userId =
      socket.data.userId ||
      cleanText(data.userId);

    const room =
      rooms.get(roomId);

    if (!room) {
      return;
    }

    const user =
      room.users.get(userId);

    if (!user) {
      return;
    }

    user.mic =
      data.mic === false
        ? false
        : true;

    io.to(roomId).emit(
      "mic-status",
      {
        userId,
        mic: user.mic
      }
    );

    io.to(roomId).emit(
      "room-state",
      roomState(room)
    );
  });

  // --------------------------------------------------
  // CHAT MESSAGE
  // --------------------------------------------------

  socket.on("chat-message", (data = {}) => {

    const roomId =
      socket.data.roomId ||
      cleanText(data.roomId);

    const userId =
      socket.data.userId ||
      cleanText(data.userId);

    const room =
      rooms.get(roomId);

    if (!room) {
      return;
    }

    const user =
      room.users.get(userId);

    if (!user) {
      return;
    }

    const messageText =
      cleanText(
        data.message ||
        data.text,
        ""
      );

    if (!messageText) {
      return;
    }

    const message = {
      id:
        "msg_" +
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .slice(2, 8),

      userId,

      name: user.name,

      dp: user.dp,

      text: messageText,

      time: Date.now()
    };

    room.messages.push(
      message
    );

    if (room.messages.length > 100) {
      room.messages.shift();
    }

    io.to(roomId).emit(
      "chat-message",
      message
    );
  });

  // --------------------------------------------------
  // SEND GIFT
  // --------------------------------------------------

  socket.on("send-gift", (data = {}) => {

    const roomId =
      socket.data.roomId ||
      cleanText(data.roomId);

    const senderId =
      socket.data.userId ||
      cleanText(data.senderId);

    const receiverId =
      cleanText(data.receiverId);

    const room =
      rooms.get(roomId);

    if (!room) {
      return;
    }

    const sender =
      room.users.get(senderId);

    if (!sender) {
      return;
    }

    const gift = {
      userId: senderId,

      senderId,

      name: sender.name,

      dp: sender.dp,

      gift:
        data.gift || "Gift",

      receiverId,

      transactionId:
        cleanText(data.transactionId),

      time: Date.now()
    };

    room.gifts.push(
      gift
    );

    if (room.gifts.length > 100) {
      room.gifts.shift();
    }

    // Main event
    io.to(roomId).emit(
      "gift",
      gift
    );

    // Compatibility event
    io.to(roomId).emit(
      "gift-received",
      gift
    );
  });

  // --------------------------------------------------
  // ADMIN KICK
  // --------------------------------------------------

  socket.on("admin-kick", (data = {}) => {

    const roomId =
      socket.data.roomId ||
      cleanText(data.roomId);

    const targetUserId =
      cleanText(
        data.userId ||
        data.targetUserId
      );

    const room =
      rooms.get(roomId);

    if (!room) {
      return;
    }

    const target =
      room.users.get(
        targetUserId
      );

    if (!target) {
      return;
    }

    // Current basic implementation:
    // only host/seat 0 can kick
    const hostId =
      room.seats[0];

    if (
      socket.data.userId !== hostId
    ) {

      socket.emit(
        "error-message",
        {
          message:
            "Only room host can kick users."
        }
      );

      return;
    }

    const targetSocket =
      io.sockets.sockets.get(
        target.socketId
      );

    if (targetSocket) {

      targetSocket.emit(
        "kicked",
        {
          roomId,
          userId: targetUserId
        }
      );

      targetSocket.leave(
        roomId
      );

      targetSocket.data.roomId =
        null;
    }

    removeUserFromSeats(
      room,
      targetUserId
    );

    room.users.delete(
      targetUserId
    );

    io.to(roomId).emit(
      "user-left",
      {
        userId:
          targetUserId
      }
    );

    io.to(roomId).emit(
      "room-state",
      roomState(room)
    );
  });

  // --------------------------------------------------
  // ADMIN MUTE
  // --------------------------------------------------

  socket.on("admin-mute", (data = {}) => {

    const roomId =
      socket.data.roomId ||
      cleanText(data.roomId);

    const targetUserId =
      cleanText(
        data.userId ||
        data.targetUserId
      );

    const room =
      rooms.get(roomId);

    if (!room) {
      return;
    }

    const target =
      room.users.get(
        targetUserId
      );

    if (!target) {
      return;
    }

    const hostId =
      room.seats[0];

    if (
      socket.data.userId !== hostId
    ) {

      socket.emit(
        "error-message",
        {
          message:
            "Only room host can mute users."
        }
      );

      return;
    }

    target.mic = false;

    const targetSocket =
      io.sockets.sockets.get(
        target.socketId
      );

    if (targetSocket) {

      targetSocket.emit(
        "muted",
        {
          roomId,
          userId:
            targetUserId
        }
      );
    }

    io.to(roomId).emit(
      "mic-status",
      {
        userId:
          targetUserId,
        mic: false
      }
    );

    io.to(roomId).emit(
      "room-state",
      roomState(room)
    );
  });

  // --------------------------------------------------
  // LEAVE ROOM
  // --------------------------------------------------

  socket.on("leave-room", () => {

    leaveCurrentRoom(
      socket
    );
  });

  // --------------------------------------------------
  // WEBRTC OFFER
  // --------------------------------------------------

  socket.on(
    "webrtc-offer",
    (data = {}) => {

      const targetSocketId =
        cleanText(
          data.targetSocketId
        );

      if (!targetSocketId) {
        return;
      }

      const targetSocket =
        io.sockets.sockets.get(
          targetSocketId
        );

      if (!targetSocket) {
        return;
      }

      targetSocket.emit(
        "webrtc-offer",
        {
          ...data,

          fromSocketId:
            socket.id,

          fromUserId:
            socket.data.userId || ""
        }
      );
    }
  );

  // --------------------------------------------------
  // WEBRTC ANSWER
  // --------------------------------------------------

  socket.on(
    "webrtc-answer",
    (data = {}) => {

      const targetSocketId =
        cleanText(
          data.targetSocketId
        );

      if (!targetSocketId) {
        return;
      }

      const targetSocket =
        io.sockets.sockets.get(
          targetSocketId
        );

      if (!targetSocket) {
        return;
      }

      targetSocket.emit(
        "webrtc-answer",
        {
          ...data,

          fromSocketId:
            socket.id,

          fromUserId:
            socket.data.userId || ""
        }
      );
    }
  );

  // --------------------------------------------------
  // WEBRTC ICE
  // --------------------------------------------------

  socket.on(
    "webrtc-ice",
    (data = {}) => {

      const targetSocketId =
        cleanText(
          data.targetSocketId
        );

      if (!targetSocketId) {
        return;
      }

      const targetSocket =
        io.sockets.sockets.get(
          targetSocketId
        );

      if (!targetSocket) {
        return;
      }

      targetSocket.emit(
        "webrtc-ice",
        {
          ...data,

          fromSocketId:
            socket.id,

          fromUserId:
            socket.data.userId || ""
        }
      );
    }
  );

  // Some clients use this event name
  socket.on(
    "webrtc-ice-candidate",
    (data = {}) => {

      const targetSocketId =
        cleanText(
          data.targetSocketId
        );

      if (!targetSocketId) {
        return;
      }

      const targetSocket =
        io.sockets.sockets.get(
          targetSocketId
        );

      if (!targetSocket) {
        return;
      }

      targetSocket.emit(
        "webrtc-ice",
        {
          ...data,

          fromSocketId:
            socket.id,

          fromUserId:
            socket.data.userId || ""
        }
      );
    }
  );

  // --------------------------------------------------
  // DISCONNECT
  // --------------------------------------------------

  socket.on("disconnect", () => {

    console.log(
      "Socket disconnected:",
      socket.id
    );

    leaveCurrentRoom(
      socket
    );
  });
});

// ----------------------------------------------------
// LEAVE CURRENT ROOM FUNCTION
// ----------------------------------------------------

function leaveCurrentRoom(socket) {

  const roomId =
    socket.data.roomId;

  const userId =
    socket.data.userId;

  if (!roomId || !userId) {
    return;
  }

  const room =
    rooms.get(roomId);

  if (!room) {
    return;
  }

  const user =
    room.users.get(userId);

  // Make sure this socket is really the
  // current socket of this user
  if (
    user &&
    user.socketId !== socket.id
  ) {
    return;
  }

  removeUserFromSeats(
    room,
    userId
  );

  room.users.delete(
    userId
  );

  try {
    socket.leave(roomId);
  } catch (e) {}

  io.to(roomId).emit(
    "user-left",
    {
      userId
    }
  );

  // If host left, assign first remaining user
  if (
    room.seats[0] === null &&
    room.users.size > 0
  ) {

    const firstUser =
      room.users.values().next().value;

    if (firstUser) {
      room.seats[0] =
        firstUser.userId;
    }
  }

  // Send updated room
  if (room.users.size > 0) {

    io.to(roomId).emit(
      "room-state",
      roomState(room)
    );

  } else {

    // Delete empty room
    rooms.delete(roomId);

    console.log(
      "Empty room deleted:",
      roomId
    );
  }

  socket.data.roomId = null;
  socket.data.userId = null;
}

// ----------------------------------------------------
// START SERVER
// ----------------------------------------------------

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `PawanVoice server running on port ${PORT}`
    );

  }
);
