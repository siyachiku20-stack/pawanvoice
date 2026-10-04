// PawanVoice - Realtime Voice Room Server
// Node.js + Express + Socket.IO + WebRTC Signaling

const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// --------------------------------------------------
// BASIC CONFIG
// --------------------------------------------------

const PORT = process.env.PORT || 3000;

const SEAT_COUNT = 9;

const TURN_URL = process.env.TURN_URL || "";
const TURN_USERNAME = process.env.TURN_USERNAME || "";
const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL || "";

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"]
  })
);

app.use(express.json({ limit: "2mb" }));

// Serve files from project root
app.use(express.static(path.join(__dirname)));

// --------------------------------------------------
// SOCKET.IO
// --------------------------------------------------

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

// --------------------------------------------------
// ROOMS
// --------------------------------------------------

const rooms = new Map();

function makeRoom(roomId) {
  return {
    id: roomId,

    name: "PawanVoice Room",

    dp: "",

    seats: Array(SEAT_COUNT).fill(null),

    users: new Map(),

    messages: [],

    gifts: [],

    createdAt: Date.now()
  };
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, makeRoom(roomId));
  }

  return rooms.get(roomId);
}

// --------------------------------------------------
// USER CLEANER
// --------------------------------------------------

function cleanUser(user) {
  if (!user) return null;

  return {
    userId: String(user.userId || ""),
    socketId: String(user.socketId || ""),

    name: String(user.name || "Guest"),

    dp: String(user.dp || ""),

    level: Number(user.level || 1),

    exp: Number(user.exp || 0),

    vipLevel: Number(user.vipLevel || 0),

    vipExp: Number(user.vipExp || 0),

    avatarFrame: user.avatarFrame || {
      id: "default",
      name: "Default Frame",
      image: "",
      active: true
    },

    badge: user.badge || {
      id: "default",
      name: "New User",
      image: "",
      active: true
    },

    entryEffect: user.entryEffect || {
      id: "default",
      name: "Default Entry",
      image: "",
      active: true
    },

    mic: Boolean(user.mic),

    joinedAt: Number(user.joinedAt || Date.now())
  };
}

// --------------------------------------------------
// ROOM STATE
// --------------------------------------------------

function roomData(room) {
  const users = {};

  for (const [userId, user] of room.users.entries()) {
    users[userId] = cleanUser(user);
  }

  return {
    id: room.id,

    name: room.name,

    dp: room.dp,

    seats: room.seats,

    users,

    messages: room.messages.slice(-100),

    gifts: room.gifts.slice(-50),

    createdAt: room.createdAt
  };
}

function sendRoomState(room) {
  const data = roomData(room);

  io.to(room.id).emit("room-state", data);

  // Compatibility with older room.html
  io.to(room.id).emit("roomState", data);
}

// --------------------------------------------------
// BASIC ROUTES
// --------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    seats: SEAT_COUNT,
    rooms: rooms.size
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    app: "PawanVoice",
    rooms: rooms.size,
    seats: SEAT_COUNT,
    time: Date.now()
  });
});

// --------------------------------------------------
// WEBRTC CONFIG
// --------------------------------------------------

app.get("/rtc-config", (req, res) => {
  const iceServers = [
    {
      urls: [
        "stun:stun.l.google.com:19302"
      ]
    }
  ];

  // TURN is added only when Render environment
  // variables are configured.
  if (
    TURN_URL &&
    TURN_USERNAME &&
    TURN_CREDENTIAL
  ) {
    iceServers.push({
      urls: TURN_URL,
      username: TURN_USERNAME,
      credential: TURN_CREDENTIAL
    });
  }

  res.json({
    iceServers
  });
});

// --------------------------------------------------
// ROOM.HTML ROUTE
// --------------------------------------------------

app.get("/room.html", (req, res) => {
  res.sendFile(
    path.join(__dirname, "room.html")
  );
});

// --------------------------------------------------
// INDEX.HTML ROUTE
// --------------------------------------------------

app.get("/index.html", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

// --------------------------------------------------
// SOCKET CONNECTION
// --------------------------------------------------

io.on("connection", (socket) => {

  console.log(
    "Socket connected:",
    socket.id
  );

  // ------------------------------------------------
  // JOIN ROOM
  // ------------------------------------------------

  socket.on("join-room", (data = {}) => {

    try {

      const roomId =
        String(
          data.roomId ||
          "main"
        ).trim();

      const userId =
        String(
          data.userId ||
          socket.id
        ).trim();

      const room =
        getRoom(roomId);

      // Prevent same socket from joining twice
      if (socket.data.roomId) {

        socket.leave(
          socket.data.roomId
        );

      }

      socket.join(roomId);

      socket.data.roomId = roomId;
      socket.data.userId = userId;

      const user = cleanUser({
        userId,

        socketId: socket.id,

        name:
          data.name ||
          "Guest",

        dp:
          data.dp ||
          "",

        level:
          data.level ||
          1,

        exp:
          data.exp ||
          0,

        vipLevel:
          data.vipLevel ||
          0,

        vipExp:
          data.vipExp ||
          0,

        avatarFrame:
          data.avatarFrame,

        badge:
          data.badge,

        entryEffect:
          data.entryEffect,

        mic: false,

        joinedAt: Date.now()
      });

      // If same user was already in this room,
      // remove old socket's seat/user.
      const oldUser =
        room.users.get(userId);

      if (oldUser) {

        const oldSocketId =
          oldUser.socketId;

        room.seats =
          room.seats.map(
            (seat) => {

              if (
                seat &&
                seat.userId === userId
              ) {
                return null;
              }

              return seat;
            }
          );

        const oldSocket =
          io.sockets.sockets.get(
            oldSocketId
          );

        if (oldSocket) {

          oldSocket.leave(roomId);

          oldSocket.data.roomId = null;
          oldSocket.data.userId = null;
        }
      }

      room.users.set(
        userId,
        user
      );

      // First user automatically becomes host.
      const hasAnySeat =
        room.seats.some(
          seat => seat !== null
        );

      if (!hasAnySeat) {

        room.seats[0] = {
          userId: user.userId,

          socketId: user.socketId,

          name: user.name,

          dp: user.dp,

          level: user.level,

          vipLevel: user.vipLevel,

          mic: false
        };

      }

      // Send current state to new user
      socket.emit(
        "room-state",
        roomData(room)
      );

      socket.emit(
        "roomState",
        roomData(room)
      );

      // Notify existing users about new user.
      socket.to(roomId).emit(
        "user-entry",
        {
          userId: user.userId,

          socketId: user.socketId,

          name: user.name,

          dp: user.dp,

          level: user.level,

          vipLevel: user.vipLevel
        }
      );

      sendRoomState(room);

      console.log(
        `User ${userId} joined room ${roomId}`
      );

    } catch (error) {

      console.error(
        "join-room error:",
        error
      );

      socket.emit(
        "server-error",
        {
          message:
            "Unable to join room"
        }
      );
    }
  });

  // ------------------------------------------------
  // GET ROOM STATE
  // ------------------------------------------------

  socket.on(
    "get-room-state",
    () => {

      const roomId =
        socket.data.roomId;

      if (!roomId) return;

      const room =
        rooms.get(roomId);

      if (!room) return;

      socket.emit(
        "room-state",
        roomData(room)
      );

      socket.emit(
        "roomState",
        roomData(room)
      );
    }
  );

  // ------------------------------------------------
  // TAKE SEAT
  // ------------------------------------------------

  socket.on(
    "take-seat",
    (data = {}) => {

      const roomId =
        socket.data.roomId;

      const userId =
        socket.data.userId;

      if (!roomId || !userId) return;

      const room =
        rooms.get(roomId);

      if (!room) return;

      let seatIndex =
        Number.isInteger(
          data.seatIndex
        )
          ? data.seatIndex
          : Number(data.seat);

      if (!Number.isFinite(seatIndex)) {
        return;
      }

      // Accept 1-9 from older clients
      if (
        seatIndex >= 1 &&
        seatIndex <= SEAT_COUNT
      ) {
        seatIndex =
          seatIndex - 1;
      }

      if (
        seatIndex < 0 ||
        seatIndex >= SEAT_COUNT
      ) {
        return;
      }

      // Remove this user from any previous seat.
      room.seats =
        room.seats.map(
          seat => {

            if (
              seat &&
              seat.userId === userId
            ) {
              return null;
            }

            return seat;
          }
        );

      // Seat occupied?
      if (
        room.seats[seatIndex]
      ) {

        socket.emit(
          "seat-error",
          {
            message:
              "This seat is already occupied"
          }
        );

        sendRoomState(room);

        return;
      }

      const user =
        room.users.get(userId);

      if (!user) return;

      room.seats[seatIndex] = {
        userId: user.userId,

        socketId: user.socketId,

        name: user.name,

        dp: user.dp,

        level: user.level,

        vipLevel: user.vipLevel,

        mic: Boolean(user.mic)
      };

      sendRoomState(room);
    }
  );

  // ------------------------------------------------
  // LEAVE SEAT
  // ------------------------------------------------

  socket.on(
    "leave-seat",
    () => {

      const roomId =
        socket.data.roomId;

      const userId =
        socket.data.userId;

      if (!roomId || !userId) return;

      const room =
        rooms.get(roomId);

      if (!room) return;

      room.seats =
        room.seats.map(
          seat => {

            if (
              seat &&
              seat.userId === userId
            ) {
              return null;
            }

            return seat;
          }
        );

      sendRoomState(room);
    }
  );

  // ------------------------------------------------
  // MIC STATUS
  // ------------------------------------------------

  socket.on(
    "mic-status",
    (data = {}) => {

      const roomId =
        socket.data.roomId;

      const userId =
        socket.data.userId;

      if (!roomId || !userId) return;

      const room =
        rooms.get(roomId);

      if (!room) return;

      const user =
        room.users.get(userId);

      if (!user) return;

      user.mic =
        Boolean(data.mic);

      room.seats =
        room.seats.map(
          seat => {

            if (
              seat &&
              seat.userId === userId
            ) {

              return {
                ...seat,
                mic: user.mic
              };
            }

            return seat;
          }
        );

      io.to(roomId).emit(
        "mic-status",
        {
          userId,
          mic: user.mic
        }
      );

      sendRoomState(room);
    }
  );

  // ------------------------------------------------
  // CHAT MESSAGE
  // ------------------------------------------------

  socket.on(
    "chat-message",
    (data = {}) => {

      const roomId =
        socket.data.roomId;

      const userId =
        socket.data.userId;

      if (!roomId || !userId) return;

      const room =
        rooms.get(roomId);

      if (!room) return;

      const user =
        room.users.get(userId);

      if (!user) return;

      const text =
        String(
          data.text ||
          ""
        ).trim();

      if (!text) return;

      if (text.length > 500) {
        return;
      }

      const message = {
        id:
          Date.now().toString() +
          "-" +
          Math.random()
            .toString(36)
            .slice(2),

        userId: user.userId,

        name: user.name,

        dp: user.dp,

        text,

        time: Date.now()
      };

      room.messages.push(
        message
      );

      if (
        room.messages.length >
        100
      ) {
        room.messages =
          room.messages.slice(-100);
      }

      io.to(roomId).emit(
        "chat-message",
        message
      );
    }
  );

  // ------------------------------------------------
  // SEND GIFT
  // ------------------------------------------------

  socket.on(
    "send-gift",
    (data = {}) => {

      const roomId =
        socket.data.roomId;

      const senderId =
        socket.data.userId;

      if (!roomId || !senderId) {
        return;
      }

      const room =
        rooms.get(roomId);

      if (!room) return;

      const sender =
        room.users.get(senderId);

      if (!sender) return;

      const gift = {
        id:
          data.id ||
          (
            Date.now() +
            "-" +
            Math.random()
              .toString(36)
              .slice(2)
          ),

        giftId:
          String(data.giftId || ""),

        giftName:
          String(
            data.giftName ||
            data.name ||
            "Gift"
          ),

        icon:
          String(
            data.icon ||
            "🎁"
          ),

        price:
          Number(data.price || 0),

        quantity:
          Math.max(
            1,
            Math.min(
              99,
              Number(data.quantity || 1)
            )
          ),

        senderId,

        senderName:
          sender.name,

        senderDp:
          sender.dp,

        receiverId:
          String(
            data.receiverId ||
            ""
          ),

        receiverName:
          String(
            data.receiverName ||
            ""
          ),

        time: Date.now()
      };

      room.gifts.push(
        gift
      );

      if (
        room.gifts.length >
        50
      ) {
        room.gifts =
          room.gifts.slice(-50);
      }

      io.to(roomId).emit(
        "gift-received",
        gift
      );

      io.to(roomId).emit(
        "giftReceived",
        gift
      );
    }
  );

  // ------------------------------------------------
  // ADMIN CHECK
  // ------------------------------------------------

  function isHost() {

    const roomId =
      socket.data.roomId;

    const userId =
      socket.data.userId;

    const room =
      rooms.get(roomId);

    if (!room) return false;

    const host =
      room.seats[0];

    return Boolean(
      host &&
      host.userId === userId
    );
  }

  // ------------------------------------------------
  // ADMIN KICK
  // ------------------------------------------------

  socket.on(
    "admin-kick",
    (data = {}) => {

      if (!isHost()) {

        socket.emit(
          "admin-error",
          {
            message:
              "Only room host can kick users"
          }
        );

        return;
      }

      const roomId =
        socket.data.roomId;

      const room =
        rooms.get(roomId);

      if (!room) return;

      const targetUserId =
        String(
          data.userId ||
          data.targetUserId ||
          ""
        );

      if (!targetUserId) return;

      const targetUser =
        room.users.get(
          targetUserId
        );

      if (!targetUser) return;

      const targetSocket =
        io.sockets.sockets.get(
          targetUser.socketId
        );

      // Remove seats
      room.seats =
        room.seats.map(
          seat => {

            if (
              seat &&
              seat.userId ===
                targetUserId
            ) {
              return null;
            }

            return seat;
          }
        );

      // Remove user
      room.users.delete(
        targetUserId
      );

      if (targetSocket) {

        targetSocket.emit(
          "kicked",
          {
            roomId,
            message:
              "You were removed from the room"
          }
        );

        targetSocket.leave(
          roomId
        );

        targetSocket.data.roomId =
          null;

        targetSocket.data.userId =
          null;
      }

      io.to(roomId).emit(
        "user-kicked",
        {
          userId: targetUserId
        }
      );

      sendRoomState(room);
    }
  );

  // ------------------------------------------------
  // ADMIN MUTE
  // ------------------------------------------------

  socket.on(
    "admin-mute",
    (data = {}) => {

      if (!isHost()) {

        socket.emit(
          "admin-error",
          {
            message:
              "Only room host can mute users"
          }
        );

        return;
      }

      const roomId =
        socket.data.roomId;

      const room =
        rooms.get(roomId);

      if (!room) return;

      const targetUserId =
        String(
          data.userId ||
          data.targetUserId ||
          ""
        );

      const target =
        room.users.get(
          targetUserId
        );

      if (!target) return;

      const muted =
        data.muted !== undefined
          ? Boolean(data.muted)
          : true;

      io.to(roomId).emit(
        "admin-mute",
        {
          userId:
            targetUserId,

          muted
        }
      );
    }
  );

  // ------------------------------------------------
  // WEBRTC OFFER
  // ------------------------------------------------

  socket.on(
    "webrtc-offer",
    (data = {}) => {

      const roomId =
        socket.data.roomId;

      if (!roomId) return;

      const targetSocketId =
        String(
          data.targetSocketId ||
          ""
        );

      if (!targetSocketId) return;

      const targetSocket =
        io.sockets.sockets.get(
          targetSocketId
        );

      if (!targetSocket) return;

      targetSocket.emit(
        "webrtc-offer",
        {
          roomId,

          fromSocketId:
            socket.id,

          fromUserId:
            socket.data.userId,

          offer:
            data.offer
        }
      );
    }
  );

  // ------------------------------------------------
  // WEBRTC ANSWER
  // ------------------------------------------------

  socket.on(
    "webrtc-answer",
    (data = {}) => {

      const roomId =
        socket.data.roomId;

      if (!roomId) return;

      const targetSocketId =
        String(
          data.targetSocketId ||
          ""
        );

      if (!targetSocketId) return;

      const targetSocket =
        io.sockets.sockets.get(
          targetSocketId
        );

      if (!targetSocket) return;

      targetSocket.emit(
        "webrtc-answer",
        {
          roomId,

          fromSocketId:
            socket.id,

          fromUserId:
            socket.data.userId,

          answer:
            data.answer
        }
      );
    }
  );

  // ------------------------------------------------
  // WEBRTC ICE CANDIDATE
  // ------------------------------------------------

  socket.on(
    "ice-candidate",
    (data = {}) => {

      const roomId =
        socket.data.roomId;

      if (!roomId) return;

      const targetSocketId =
        String(
          data.targetSocketId ||
          ""
        );

      if (!targetSocketId) return;

      const targetSocket =
        io.sockets.sockets.get(
          targetSocketId
        );

      if (!targetSocket) return;

      const payload = {
        roomId,

        fromSocketId:
          socket.id,

        fromUserId:
          socket.data.userId,

        candidate:
          data.candidate
      };

      targetSocket.emit(
        "ice-candidate",
        payload
      );

      // Compatibility with older room.html
      targetSocket.emit(
        "iceCandidate",
        payload
      );
    }
  );

  // ------------------------------------------------
  // OLD WEBRTC EVENT NAMES
  // ------------------------------------------------

  socket.on(
    "webrtc-ice-candidate",
    (data = {}) => {

      const targetSocketId =
        String(
          data.targetSocketId ||
          ""
        );

      if (!targetSocketId) return;

      const targetSocket =
        io.sockets.sockets.get(
          targetSocketId
        );

      if (!targetSocket) return;

      const payload = {
        roomId:
          socket.data.roomId,

        fromSocketId:
          socket.id,

        fromUserId:
          socket.data.userId,

        candidate:
          data.candidate
      };

      targetSocket.emit(
        "ice-candidate",
        payload
      );

      targetSocket.emit(
        "iceCandidate",
        payload
      );
    }
  );

  // ------------------------------------------------
  // DISCONNECT
  // ------------------------------------------------

  socket.on(
    "disconnect",
    () => {

      console.log(
        "Socket disconnected:",
        socket.id
      );

      const roomId =
        socket.data.roomId;

      const userId =
        socket.data.userId;

      if (!roomId) return;

      const room =
        rooms.get(roomId);

      if (!room) return;

      // Remove user from seats
      room.seats =
        room.seats.map(
          seat => {

            if (
              seat &&
              (
                seat.socketId ===
                  socket.id ||
                seat.userId ===
                  userId
              )
            ) {
              return null;
            }

            return seat;
          }
        );

      // Remove user
      if (userId) {

        const current =
          room.users.get(
            userId
          );

        if (
          current &&
          current.socketId ===
            socket.id
        ) {
          room.users.delete(
            userId
          );
        }
      }

      // Tell remaining users
      io.to(roomId).emit(
        "user-left",
        {
          userId,
          socketId:
            socket.id
        }
      );

      // If host left, assign first
      // available user as new host.
      if (
        !room.seats[0] &&
        room.users.size > 0
      ) {

        const firstUser =
          room.users.values()
            .next()
            .value;

        if (firstUser) {

          room.seats[0] = {
            userId:
              firstUser.userId,

            socketId:
              firstUser.socketId,

            name:
              firstUser.name,

            dp:
              firstUser.dp,

            level:
              firstUser.level,

            vipLevel:
              firstUser.vipLevel,

            mic:
              Boolean(
                firstUser.mic
              )
          };

          io.to(roomId).emit(
            "new-host",
            {
              userId:
                firstUser.userId,

              socketId:
                firstUser.socketId
            }
          );
        }
      }

      // Delete empty rooms
      if (
        room.users.size === 0
      ) {

        rooms.delete(
          roomId
        );

        console.log(
          "Deleted empty room:",
          roomId
        );

      } else {

        sendRoomState(room);
      }
    }
  );
});

// --------------------------------------------------
// ERROR HANDLING
// --------------------------------------------------

process.on(
  "uncaughtException",
  (error) => {

    console.error(
      "Uncaught exception:",
      error
    );
  }
);

process.on(
  "unhandledRejection",
  (error) => {

    console.error(
      "Unhandled rejection:",
      error
    );
  }
);

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `PawanVoice server running on port ${PORT}`
    );

    console.log(
      `Seats: ${SEAT_COUNT}`
    );

    console.log(
      `TURN configured: ${
        TURN_URL &&
        TURN_USERNAME &&
        TURN_CREDENTIAL
          ? "YES"
          : "NO"
      }`
    );
  }
);
