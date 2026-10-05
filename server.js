const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

const PORT = process.env.PORT || 3000;

/* =========================================================
   EXPRESS
   ========================================================= */

app.use(express.json({ limit: "2mb" }));

// IMPORTANT:
// index.html and room.html must be in the SAME folder as server.js
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/room.html", (req, res) => {
  res.sendFile(path.join(__dirname, "room.html"));
});

/*
   WebRTC configuration.

   STUN works for many networks.
   TURN can be added later through environment variables
   when production-grade voice connectivity is required.
*/
app.get("/rtc-config", (req, res) => {
  const iceServers = [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "stun:stun1.l.google.com:19302"
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

/*
   Simple server status
*/
app.get("/api/status", (req, res) => {
  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    seats: 9,
    rooms: Object.keys(rooms).length
  });
});

/* =========================================================
   ROOM STORAGE
   ========================================================= */

const rooms = Object.create(null);

function createRoom(roomId) {
  return {
    id: roomId,
    name: "PawanVoice Room",
    dp: "",
    category: "General",

    seats: Array(9).fill(null),

    users: Object.create(null),

    gifts: [],

    exp: 0,

    createdAt: Date.now()
  };
}

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = createRoom(roomId);
  }

  return rooms[roomId];
}

/* =========================================================
   HELPERS
   ========================================================= */

function cleanText(value, maxLength = 500) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim().slice(0, maxLength);
}

function cleanUserId(value) {
  return cleanText(value, 100);
}

function findUserSocket(room, userId) {
  const user = room.users[userId];

  if (!user) {
    return null;
  }

  return user.socketId || null;
}

function findSeatOfUser(room, userId) {
  for (let i = 0; i < room.seats.length; i++) {
    const seat = room.seats[i];

    if (seat && seat.userId === userId) {
      return i;
    }
  }

  return -1;
}

function isHost(room, userId) {
  const host = room.seats[0];

  return !!(
    host &&
    host.userId === userId
  );
}

function removeUserFromSeats(room, userId) {
  for (let i = 0; i < room.seats.length; i++) {
    if (
      room.seats[i] &&
      room.seats[i].userId === userId
    ) {
      room.seats[i] = null;
    }
  }
}

function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    userId: user.userId,
    name: user.name,
    dp: user.dp,
    level: Number(user.level || 1),
    gender: user.gender || "",
    vip: user.vip || "",
    followers: Number(user.followers || 0),
    coins: Number(user.coins || 0),
    micEnabled: user.micEnabled !== false,
    seatIndex:
      typeof user.seatIndex === "number"
        ? user.seatIndex
        : null
  };
}

function roomData(room) {
  const users = {};

  Object.keys(room.users).forEach((userId) => {
    users[userId] = publicUser(room.users[userId]);
  });

  const seats = room.seats.map((seat) => {
    if (!seat) {
      return null;
    }

    return publicUser(seat);
  });

  return {
    id: room.id,
    name: room.name,
    dp: room.dp,
    category: room.category,
    seats,
    users,
    gifts: room.gifts.slice(-100),
    exp: room.exp || 0
  };
}

function sendRoomState(roomId) {
  const room = rooms[roomId];

  if (!room) {
    return;
  }

  io.to(roomId).emit(
    "room-state",
    roomData(room)
  );

  // Compatibility with older client versions
  io.to(roomId).emit(
    "roomState",
    roomData(room)
  );

  io.to(roomId).emit(
    "room-count",
    Object.keys(room.users).length
  );
}

function leaveCurrentRoom(socket, reason = "leave") {
  const roomId = socket.data.roomId;
  const userId = socket.data.userId;

  if (!roomId || !userId) {
    return;
  }

  const room = rooms[roomId];

  if (!room) {
    socket.data.roomId = null;
    socket.data.userId = null;
    return;
  }

  removeUserFromSeats(room, userId);

  delete room.users[userId];

  socket.leave(roomId);

  io.to(roomId).emit("user-left", {
    userId,
    reason
  });

  sendRoomState(roomId);

  if (Object.keys(room.users).length === 0) {
    delete rooms[roomId];
  }

  socket.data.roomId = null;
  socket.data.userId = null;
}

/* =========================================================
   SOCKET.IO
   ========================================================= */

io.on("connection", (socket) => {
  console.log(
    "Socket connected:",
    socket.id
  );

  /* -------------------------------------------------------
     JOIN ROOM
     ------------------------------------------------------- */

  socket.on("join-room", (data = {}) => {
    try {
      const roomId =
        cleanText(data.roomId, 100) ||
        "PV100";

      const userId =
        cleanUserId(data.userId) ||
        socket.id;

      const name =
        cleanText(data.name, 60) ||
        "Guest";

      const dp =
        cleanText(data.dp, 1000);

      const level =
        Number(data.level || 1);

      /*
        If socket was already inside another room,
        leave it first.
      */
      if (socket.data.roomId) {
        leaveCurrentRoom(
          socket,
          "room-change"
        );
      }

      const room = getRoom(roomId);

      /*
        Existing user reconnecting:
        update socket and profile information.
      */
      let user = room.users[userId];

      if (!user) {
        user = {
          userId,
          name,
          dp,
          level,
          gender: data.gender || "",
          vip: data.vip || "",
          followers: Number(data.followers || 0),
          coins: Number(data.coins || 0),

          socketId: socket.id,

          seatIndex: null,

          micEnabled: true,

          joinedAt: Date.now()
        };

        room.users[userId] = user;
      } else {
        /*
          Reconnect/update profile
        */
        user.name = name || user.name;
        user.dp = dp || user.dp;
        user.level = level || user.level;
        user.socketId = socket.id;
        user.micEnabled = true;
      }

      socket.data.roomId = roomId;
      socket.data.userId = userId;

      socket.join(roomId);

      /*
        FIRST USER becomes host automatically.
        Host occupies seat 1 / index 0.
      */
      const anyoneInRoom =
        Object.keys(room.users).length === 1;

      if (
        anyoneInRoom &&
        !room.seats[0]
      ) {
        room.seats[0] = user;
        user.seatIndex = 0;

        room.name =
          room.name === "PawanVoice Room"
            ? `${name}'s Room`
            : room.name;

        room.dp = dp || room.dp;
      }

      /*
        Send current state only to this user.
      */
      socket.emit(
        "room-state",
        roomData(room)
      );

      socket.emit(
        "roomState",
        roomData(room)
      );

      socket.emit(
        "room-count",
        Object.keys(room.users).length
      );

      /*
        Notify everyone else.
      */
      socket.to(roomId).emit(
        "user-entry",
        publicUser(user)
      );

      sendRoomState(roomId);

      console.log(
        `${name} joined ${roomId}`
      );
    } catch (error) {
      console.error(
        "join-room error:",
        error
      );
    }
  });

  /* -------------------------------------------------------
     TAKE SEAT
     ------------------------------------------------------- */

  socket.on("take-seat", (data = {}) => {
    try {
      const roomId =
        cleanText(data.roomId, 100);

      const userId =
        cleanUserId(data.userId);

      const seatIndex =
        Number(data.seatIndex);

      const room = rooms[roomId];

      if (!room) {
        return;
      }

      if (!userId) {
        return;
      }

      if (
        !Number.isInteger(seatIndex) ||
        seatIndex < 0 ||
        seatIndex > 8
      ) {
        socket.emit(
          "action-error",
          {
            message: "Invalid seat."
          }
        );
        return;
      }

      const user = room.users[userId];

      if (!user) {
        return;
      }

      /*
        Seat 0 is host seat.
        Only host can occupy it.
      */
      if (
        seatIndex === 0 &&
        !isHost(room, userId) &&
        room.seats[0]
      ) {
        socket.emit(
          "action-error",
          {
            message: "Host seat is occupied."
          }
        );
        return;
      }

      /*
        Cannot take an occupied seat.
      */
      const currentSeat =
        room.seats[seatIndex];

      if (
        currentSeat &&
        currentSeat.userId !== userId
      ) {
        socket.emit(
          "action-error",
          {
            message: "This seat is already occupied."
          }
        );
        return;
      }

      /*
        Remove user from previous seat.
      */
      removeUserFromSeats(
        room,
        userId
      );

      /*
        Set new seat.
      */
      room.seats[seatIndex] = user;

      user.seatIndex = seatIndex;
      user.micEnabled = true;

      sendRoomState(roomId);
    } catch (error) {
      console.error(
        "take-seat error:",
        error
      );
    }
  });

  /* -------------------------------------------------------
     LEAVE ROOM
     ------------------------------------------------------- */

  socket.on("leave-room", () => {
    leaveCurrentRoom(
      socket,
      "leave"
    );
  });

  /* -------------------------------------------------------
     CHAT
     ------------------------------------------------------- */

  socket.on("chat-message", (data = {}) => {
    try {
      const roomId =
        cleanText(data.roomId, 100);

      const room = rooms[roomId];

      if (!room) {
        return;
      }

      const userId =
        cleanUserId(data.userId);

      const user =
        room.users[userId];

      if (!user) {
        return;
      }

      const text =
        cleanText(data.text, 500);

      if (!text) {
        return;
      }

      const message = {
        userId: user.userId,
        name: user.name,
        dp: user.dp,
        text,
        time: Date.now()
      };

      io.to(roomId).emit(
        "chat-message",
        message
      );
    } catch (error) {
      console.error(
        "chat error:",
        error
      );
    }
  });

  /* -------------------------------------------------------
     MIC STATUS
     ------------------------------------------------------- */

  socket.on("mic-status", (data = {}) => {
    try {
      const roomId =
        cleanText(data.roomId, 100);

      const userId =
        cleanUserId(data.userId);

      const room = rooms[roomId];

      if (!room) {
        return;
      }

      const user =
        room.users[userId];

      if (!user) {
        return;
      }

      user.micEnabled =
        data.enabled !== false;

      sendRoomState(roomId);
    } catch (error) {
      console.error(
        "mic-status error:",
        error
      );
    }
  });

  /* -------------------------------------------------------
     SPEAKER STATUS
     -------------------------------------------------------

     Speaker is normally local/browser-side.
     We still accept this event for compatibility.
  */

  socket.on("speaker-status", (data = {}) => {
    // Intentionally local-only.
  });

  /* -------------------------------------------------------
     SEND GIFT
     ------------------------------------------------------- */

  socket.on("send-gift", (data = {}) => {
    try {
      const roomId =
        cleanText(data.roomId, 100);

      const room = rooms[roomId];

      if (!room) {
        return;
      }

      const fromUserId =
        cleanUserId(data.fromUserId);

      const fromUser =
        room.users[fromUserId];

      if (!fromUser) {
        return;
      }

      const toUserId =
        cleanUserId(data.toUserId);

      const gift = {
        id:
          cleanText(data.giftId, 100) ||
          `gift_${Date.now()}`,

        name:
          cleanText(data.giftName, 100) ||
          "Gift",

        emoji:
          cleanText(data.giftEmoji, 20) ||
          "🎁",

        cost:
          Number(data.cost || 0),

        fromUserId,
        fromName: fromUser.name,

        toUserId,
        toName:
          cleanText(data.toName, 60),

        time: Date.now()
      };

      room.gifts.push(gift);

      if (room.gifts.length > 100) {
        room.gifts =
          room.gifts.slice(-100);
      }

      /*
        Room EXP
      */
      room.exp += Math.max(
        0,
        Math.floor(gift.cost / 10)
      );

      io.to(roomId).emit(
        "gift-received",
        gift
      );

      sendRoomState(roomId);
    } catch (error) {
      console.error(
        "send-gift error:",
        error
      );
    }
  });

  /* -------------------------------------------------------
     ADMIN KICK
     ------------------------------------------------------- */

  socket.on("admin-kick", (data = {}) => {
    try {
      const roomId =
        cleanText(data.roomId, 100);

      const targetUserId =
        cleanUserId(
          data.targetUserId
        );

      const room = rooms[roomId];

      if (!room) {
        return;
      }

      const adminUserId =
        socket.data.userId;

      /*
        Only host can kick.
      */
      if (!isHost(room, adminUserId)) {
        socket.emit(
          "action-error",
          {
            message:
              "Only room host can kick users."
          }
        );
        return;
      }

      if (
        !targetUserId ||
        targetUserId === adminUserId
      ) {
        return;
      }

      const target =
        room.users[targetUserId];

      if (!target) {
        return;
      }

      const targetSocketId =
        target.socketId;

      removeUserFromSeats(
        room,
        targetUserId
      );

      delete room.users[targetUserId];

      if (targetSocketId) {
        const targetSocket =
          io.sockets.sockets.get(
            targetSocketId
          );

        if (targetSocket) {
          targetSocket.leave(roomId);

          targetSocket.data.roomId = null;
          targetSocket.data.userId = null;

          targetSocket.emit(
            "user-kicked",
            {
              roomId,
              userId: targetUserId,
              message:
                "You were removed from this room."
            }
          );
        }
      }

      io.to(roomId).emit(
        "user-left",
        {
          userId: targetUserId,
          reason: "kicked"
        }
      );

      sendRoomState(roomId);

      if (
        Object.keys(room.users).length === 0
      ) {
        delete rooms[roomId];
      }
    } catch (error) {
      console.error(
        "admin-kick error:",
        error
      );
    }
  });

  /* -------------------------------------------------------
     ADMIN MUTE
     ------------------------------------------------------- */

  socket.on("admin-mute", (data = {}) => {
    try {
      const roomId =
        cleanText(data.roomId, 100);

      const targetUserId =
        cleanUserId(
          data.targetUserId
        );

      const room = rooms[roomId];

      if (!room) {
        return;
      }

      const adminUserId =
        socket.data.userId;

      if (!isHost(room, adminUserId)) {
        socket.emit(
          "action-error",
          {
            message:
              "Only room host can mute users."
          }
        );
        return;
      }

      if (
        !targetUserId ||
        targetUserId === adminUserId
      ) {
        return;
      }

      const target =
        room.users[targetUserId];

      if (!target) {
        return;
      }

      target.micEnabled = false;

      const targetSocketId =
        target.socketId;

      if (targetSocketId) {
        const targetSocket =
          io.sockets.sockets.get(
            targetSocketId
          );

        if (targetSocket) {
          targetSocket.emit(
            "user-muted",
            {
              roomId,
              userId: targetUserId,
              muted: true,
              message:
                "Host muted your microphone."
            }
          );
        }
      }

      io.to(roomId).emit(
        "user-muted",
        {
          roomId,
          userId: targetUserId,
          muted: true
        }
      );

      sendRoomState(roomId);
    } catch (error) {
      console.error(
        "admin-mute error:",
        error
      );
    }
  });

  /* -------------------------------------------------------
     WEBRTC OFFER
     ------------------------------------------------------- */

  socket.on("webrtc-offer", (data = {}) => {
    try {
      const roomId =
        cleanText(
          data.roomId ||
          socket.data.roomId,
          100
        );

      const fromUserId =
        socket.data.userId;

      const targetUserId =
        cleanUserId(
          data.to ||
          data.targetUserId
        );

      if (
        !roomId ||
        !fromUserId ||
        !targetUserId ||
        !data.offer
      ) {
        return;
      }

      const room =
        rooms[roomId];

      if (!room) {
        return;
      }

      if (
        !room.users[fromUserId] ||
        !room.users[targetUserId]
      ) {
        return;
      }

      const targetSocketId =
        findUserSocket(
          room,
          targetUserId
        );

      if (!targetSocketId) {
        return;
      }

      io.to(targetSocketId).emit(
        "webrtc-offer",
        {
          from: fromUserId,
          offer: data.offer
        }
      );
    } catch (error) {
      console.error(
        "webrtc-offer error:",
        error
      );
    }
  });

  /* -------------------------------------------------------
     WEBRTC ANSWER
     ------------------------------------------------------- */

  socket.on("webrtc-answer", (data = {}) => {
    try {
      const roomId =
        cleanText(
          data.roomId ||
          socket.data.roomId,
          100
        );

      const fromUserId =
        socket.data.userId;

      const targetUserId =
        cleanUserId(
          data.to ||
          data.targetUserId
        );

      if (
        !roomId ||
        !fromUserId ||
        !targetUserId ||
        !data.answer
      ) {
        return;
      }

      const room =
        rooms[roomId];

      if (!room) {
        return;
      }

      if (
        !room.users[fromUserId] ||
        !room.users[targetUserId]
      ) {
        return;
      }

      const targetSocketId =
        findUserSocket(
          room,
          targetUserId
        );

      if (!targetSocketId) {
        return;
      }

      io.to(targetSocketId).emit(
        "webrtc-answer",
        {
          from: fromUserId,
          answer: data.answer
        }
      );
    } catch (error) {
      console.error(
        "webrtc-answer error:",
        error
      );
    }
  });

  /* -------------------------------------------------------
     ICE CANDIDATE
     ------------------------------------------------------- */

  socket.on("ice-candidate", (data = {}) => {
    try {
      const roomId =
        cleanText(
          data.roomId ||
          socket.data.roomId,
          100
        );

      const fromUserId =
        socket.data.userId;

      const targetUserId =
        cleanUserId(
          data.to ||
          data.targetUserId
        );

      if (
        !roomId ||
        !fromUserId ||
        !targetUserId ||
        !data.candidate
      ) {
        return;
      }

      const room =
        rooms[roomId];

      if (!room) {
        return;
      }

      if (
        !room.users[fromUserId] ||
        !room.users[targetUserId]
      ) {
        return;
      }

      const targetSocketId =
        findUserSocket(
          room,
          targetUserId
        );

      if (!targetSocketId) {
        return;
      }

      io.to(targetSocketId).emit(
        "ice-candidate",
        {
          from: fromUserId,
          candidate: data.candidate
        }
      );
    } catch (error) {
      console.error(
        "ice-candidate error:",
        error
      );
    }
  });

  /* -------------------------------------------------------
     DISCONNECT
     ------------------------------------------------------- */

  socket.on("disconnect", (reason) => {
    console.log(
      "Socket disconnected:",
      socket.id,
      reason
    );

    leaveCurrentRoom(
      socket,
      "disconnect"
    );
  });
});

/* =========================================================
   START SERVER
   ========================================================= */

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `PawanVoice Room Server running on port ${PORT}`
  );
});
