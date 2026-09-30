const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

/*
====================================================
PAWANVOICE SERVER
====================================================
Features:
- 9 seat voice rooms
- Host
- Users
- Seat change
- Mic ON/OFF state
- Admin
- Mute
- Kick
- Ban
- Room chat
- Gifts
- Room list
- Room information
- Socket.IO real-time updates
====================================================
*/

const rooms = {};
const bannedUsers = {};

/* ==================================================
   ROOM CREATE
================================================== */

function createRoom(roomId, roomName = "PawanVoice Room") {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      name: roomName,
      maxSeats: 9,

      seats: Array(9).fill(null),

      users: {},

      admins: {},

      gifts: [],

      messages: [],

      createdAt: new Date().toISOString()
    };
  }

  return rooms[roomId];
}


/* ==================================================
   ROOM DATA
================================================== */

function getRoomData(room) {
  return {
    id: room.id,
    name: room.name,
    maxSeats: room.maxSeats,

    seats: room.seats,

    users: Object.values(room.users),

    admins: Object.keys(room.admins),

    gifts: room.gifts.slice(-50),

    messages: room.messages.slice(-50),

    createdAt: room.createdAt
  };
}


/* ==================================================
   USER DATA
================================================== */

function createUser(userId, name, dp = "") {
  return {
    userId: userId,
    name: name,
    dp: dp,

    socketId: null,

    seat: null,

    micOn: false,

    speakerOn: true,

    mutedByAdmin: false,

    isHost: false,

    isAdmin: false,

    joinedAt: new Date().toISOString()
  };
}


/* ==================================================
   BROADCAST ROOM
================================================== */

function broadcastRoom(roomId) {
  const room = rooms[roomId];

  if (!room) return;

  io.to(roomId).emit("roomUpdated", getRoomData(room));
}


/* ==================================================
   FIND EMPTY SEAT
================================================== */

function findEmptySeat(room) {
  return room.seats.findIndex((seat) => seat === null);
}


/* ==================================================
   REMOVE USER
================================================== */

function removeUser(socket) {
  const roomId = socket.data.roomId;
  const userId = socket.data.userId;

  if (!roomId || !userId) return;

  const room = rooms[roomId];

  if (!room) return;

  const user = room.users[userId];

  if (!user) return;

  /* Remove seat */

  if (
    user.seat >= 1 &&
    user.seat <= 9 &&
    room.seats[user.seat - 1] === userId
  ) {
    room.seats[user.seat - 1] = null;
  }

  /* Remove admin */

  delete room.admins[userId];

  /* Remove user */

  delete room.users[userId];

  /* Tell room */

  broadcastRoom(roomId);

  /* Empty room */

  if (Object.keys(room.users).length === 0) {
    delete rooms[roomId];
  }
}


/* ==================================================
   SOCKET CONNECTION
================================================== */

io.on("connection", (socket) => {

  console.log("User connected:", socket.id);


  /* ==================================================
     JOIN ROOM
  ================================================== */

  socket.on("joinRoom", (data = {}) => {

    const roomId = String(data.roomId || "main").trim();

    const userId = String(
      data.userId || socket.id
    ).trim();

    const name = String(
      data.name || "Guest"
    ).trim();

    const dp = String(
      data.dp || ""
    ).trim();

    const roomName = String(
      data.roomName || "PawanVoice Room"
    ).trim();


    /* Check banned */

    if (
      bannedUsers[roomId] &&
      bannedUsers[roomId][userId]
    ) {
      socket.emit("roomError", {
        message: "You are banned from this room."
      });

      return;
    }


    /* Create room */

    const room = createRoom(roomId, roomName);


    /* User already in room */

    if (room.users[userId]) {

      socket.emit("roomError", {
        message: "User already joined this room."
      });

      return;
    }


    /* Find seat */

    const seatIndex = findEmptySeat(room);


    if (seatIndex === -1) {

      socket.emit("roomError", {
        message: "All 9 seats are full."
      });

      return;
    }


    /* Create user */

    const user = createUser(
      userId,
      name,
      dp
    );


    user.socketId = socket.id;

    user.seat = seatIndex + 1;


    /* First user = host */

    if (
      Object.keys(room.users).length === 0
    ) {

      user.isHost = true;

      user.isAdmin = true;

      room.admins[userId] = true;
    }


    /* Save user */

    room.users[userId] = user;

    room.seats[seatIndex] = userId;


    /* Socket room */

    socket.join(roomId);

    socket.data.roomId = roomId;

    socket.data.userId = userId;


    /* Welcome message */

    room.messages.push({
      id: Date.now(),
      type: "system",
      message: `${name} joined the room.`,
      time: new Date().toISOString()
    });


    /* Send room */

    broadcastRoom(roomId);


    /* Send joined */

    socket.emit("joinedRoom", {
      room: getRoomData(room),
      user: user
    });


    console.log(
      `[JOIN] ${name} (${userId}) -> ${roomId}`
    );
  });


  /* ==================================================
     GET ROOM
  ================================================== */

  socket.on("getRoom", (data = {}) => {

    const roomId = String(
      data.roomId || "main"
    ).trim();

    const room = rooms[roomId];

    if (!room) {

      socket.emit("roomUpdated", {
        id: roomId,
        name: "PawanVoice Room",
        maxSeats: 9,
        seats: Array(9).fill(null),
        users: [],
        admins: [],
        gifts: [],
        messages: []
      });

      return;
    }

    socket.emit(
      "roomUpdated",
      getRoomData(room)
    );
  });


  /* ==================================================
     SELECT SEAT
  ================================================== */

  socket.on("selectSeat", (data = {}) => {

    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms[roomId];

    if (!room) return;

    const user = room.users[userId];

    if (!user) return;


    const newSeat = Number(data.seat);


    if (
      !Number.isInteger(newSeat) ||
      newSeat < 1 ||
      newSeat > 9
    ) {
      return;
    }


    const targetIndex = newSeat - 1;


    /* Occupied */

    if (
      room.seats[targetIndex] !== null &&
      room.seats[targetIndex] !== userId
    ) {

      socket.emit("roomError", {
        message: "This seat is already occupied."
      });

      return;
    }


    /* Old seat */

    if (user.seat) {
      room.seats[user.seat - 1] = null;
    }


    /* New seat */

    room.seats[targetIndex] = userId;

    user.seat = newSeat;


    broadcastRoom(roomId);
  });


  /* ==================================================
     LEAVE SEAT
  ================================================== */

  socket.on("leaveSeat", () => {

    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms[roomId];

    if (!room) return;

    const user = room.users[userId];

    if (!user) return;


    if (user.seat) {

      room.seats[user.seat - 1] = null;

      user.seat = null;
    }


    user.micOn = false;

    broadcastRoom(roomId);
  });


  /* ==================================================
     MIC ON / OFF
  ================================================== */

  socket.on("micToggle", (data = {}) => {

    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms[roomId];

    if (!room) return;

    const user = room.users[userId];

    if (!user) return;


    /* Admin muted user */

    if (
      user.mutedByAdmin &&
      data.on === true
    ) {

      socket.emit("roomError", {
        message: "Your microphone is muted by admin."
      });

      return;
    }


    user.micOn = Boolean(data.on);


    io.to(roomId).emit("userMicChanged", {
      userId: userId,
      micOn: user.micOn
    });


    broadcastRoom(roomId);
  });


  /* ==================================================
     SPEAKER ON / OFF
  ================================================== */

  socket.on("speakerToggle", (data = {}) => {

    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms[roomId];

    if (!room) return;

    const user = room.users[userId];

    if (!user) return;


    user.speakerOn = Boolean(data.on);


    socket.emit("speakerChanged", {
      on: user.speakerOn
    });
  });


  /* ==================================================
     SEND CHAT MESSAGE
  ================================================== */

  socket.on("sendMessage", (data = {}) => {

    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms[roomId];

    if (!room) return;

    const user = room.users[userId];

    if (!user) return;


    const message = String(
      data.message || ""
    ).trim();


    if (!message) return;

    if (message.length > 500) return;


    const chat = {
      id: Date.now() + Math.random(),

      type: "chat",

      userId: user.userId,

      name: user.name,

      dp: user.dp,

      message: message,

      time: new Date().toISOString()
    };


    room.messages.push(chat);


    if (room.messages.length > 200) {
      room.messages.shift();
    }


    io.to(roomId).emit(
      "messageReceived",
      chat
    );
  });


  /* ==================================================
     SEND GIFT
  ================================================== */

  socket.on("sendGift", (data = {}) => {

    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms[roomId];

    if (!room) return;

    const sender = room.users[userId];

    if (!sender) return;


    const gift = {

      id: Date.now() + Math.random(),

      senderId: sender.userId,

      senderName: sender.name,

      senderDp: sender.dp,

      receiverId: String(
        data.receiverId || ""
      ),

      giftId: String(
        data.giftId || "rose"
      ),

      giftName: String(
        data.giftName || "Rose"
      ),

      amount: Number(
        data.amount || 1
      ),

      time: new Date().toISOString()
    };


    /* Check receiver */

    if (
      gift.receiverId &&
      !room.users[gift.receiverId]
    ) {

      socket.emit("roomError", {
        message: "Receiver is not in this room."
      });

      return;
    }


    room.gifts.push(gift);


    if (room.gifts.length > 100) {
      room.gifts.shift();
    }


    io.to(roomId).emit(
      "giftReceived",
      gift
    );


    console.log(
      `[GIFT] ${sender.name} -> ${gift.giftName}`
    );
  });


  /* ==================================================
     MAKE ADMIN
  ================================================== */

  socket.on("makeAdmin", (data = {}) => {

    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms[roomId];

    if (!room) return;


    const host = room.users[userId];

    if (!host || !host.isHost) {

      socket.emit("roomError", {
        message: "Only host can make admin."
      });

      return;
    }


    const targetId = String(
      data.userId || ""
    );


    const target = room.users[targetId];

    if (!target) return;


    target.isAdmin = true;

    room.admins[targetId] = true;


    broadcastRoom(roomId);


    io.to(roomId).emit(
      "adminChanged",
      {
        userId: targetId,
        isAdmin: true
      }
    );
  });


  /* ==================================================
     REMOVE ADMIN
  ================================================== */

  socket.on("removeAdmin", (data = {}) => {

    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms[roomId];

    if (!room) return;


    const host = room.users[userId];

    if (!host || !host.isHost) return;


    const targetId = String(
      data.userId || ""
    );


    const target = room.users[targetId];

    if (!target) return;

    if (target.isHost) return;


    target.isAdmin = false;

    delete room.admins[targetId];


    broadcastRoom(roomId);
  });


  /* ==================================================
     MUTE USER
  ================================================== */

  socket.on("muteUser", (data = {}) => {

    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms[roomId];

    if (!room) return;


    const admin = room.users[userId];

    if (
      !admin ||
      (!admin.isAdmin && !admin.isHost)
    ) {

      socket.emit("roomError", {
        message: "Admin permission required."
      });

      return;
    }


    const targetId = String(
      data.userId || ""
    );


    const target = room.users[targetId];

    if (!target) return;

    if (target.isHost) return;


    target.mutedByAdmin = Boolean(
      data.muted
    );

    target.micOn = false;


    io.to(roomId).emit(
      "userMuted",
      {
        userId: targetId,
        muted: target.mutedByAdmin
      }
    );


    broadcastRoom(roomId);
  });


  /* ==================================================
     KICK USER
  ================================================== */

  socket.on("kickUser", (data = {}) => {

    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms[roomId];

    if (!room) return;


    const admin = room.users[userId];

    if (
      !admin ||
      (!admin.isAdmin && !admin.isHost)
    ) {

      socket.emit("roomError", {
        message: "Admin permission required."
      });

      return;
    }


    const targetId = String(
      data.userId || ""
    );


    if (targetId === userId) return;


    const target = room.users[targetId];

    if (!target) return;

    if (target.isHost) return;


    const targetSocketId =
      target.socketId;


    const targetSocket =
      io.sockets.sockets.get(
        targetSocketId
      );


    if (targetSocket) {

      targetSocket.emit(
        "kicked",
        {
          message: "You were removed from the room."
        }
      );

      targetSocket.leave(roomId);

      targetSocket.data.roomId = null;

      targetSocket.data.userId = null;
    }


    /* Remove target */

    if (
      target.seat &&
      room.seats[target.seat - 1] === targetId
    ) {

      room.seats[target.seat - 1] = null;
    }


    delete room.users[targetId];

    delete room.admins[targetId];


    room.messages.push({
      id: Date.now(),
      type: "system",
      message: `${target.name} was removed from the room.`,
      time: new Date().toISOString()
    });


    broadcastRoom(roomId);
  });


  /* ==================================================
     BAN USER
  ================================================== */

  socket.on("banUser", (data = {}) => {

    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms[roomId];

    if (!room) return;


    const admin = room.users[userId];

    if (
      !admin ||
      (!admin.isAdmin && !admin.isHost)
    ) {

      socket.emit("roomError", {
        message: "Admin permission required."
      });

      return;
    }


    const targetId = String(
      data.userId || ""
    );


    if (targetId === userId) return;


    const target = room.users[targetId];

    if (!target) return;

    if (target.isHost) return;


    if (!bannedUsers[roomId]) {
      bannedUsers[roomId] = {};
    }


    bannedUsers[roomId][targetId] = true;


    const targetSocket =
      io.sockets.sockets.get(
        target.socketId
      );


    if (targetSocket) {

      targetSocket.emit(
        "banned",
        {
          message: "You are banned from this room."
        }
      );

      targetSocket.leave(roomId);

      targetSocket.data.roomId = null;

      targetSocket.data.userId = null;
    }


    if (
      target.seat &&
      room.seats[target.seat - 1] === targetId
    ) {

      room.seats[target.seat - 1] = null;
    }


    delete room.users[targetId];

    delete room.admins[targetId];


    broadcastRoom(roomId);
  });


  /* ==================================================
     CHANGE ROOM NAME
  ================================================== */

  socket.on("changeRoomName", (data = {}) => {

    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms[roomId];

    if (!room) return;


    const user = room.users[userId];

    if (
      !user ||
      !user.isHost
    ) return;


    const newName = String(
      data.name || ""
    ).trim();


    if (!newName) return;

    if (newName.length > 60) return;


    room.name = newName;


    broadcastRoom(roomId);
  });


  /* ==================================================
     ROOM INVITE
  ================================================== */

  socket.on("getInvite", () => {

    const roomId = socket.data.roomId;

    if (!roomId) return;


    const inviteUrl =
      `/room.html?room=${encodeURIComponent(roomId)}`;


    socket.emit(
      "inviteCreated",
      {
        roomId: roomId,
        url: inviteUrl
      }
    );
  });


  /* ==================================================
     ROOM LIST
  ================================================== */

  socket.on("getRooms", () => {

    const list = Object.values(rooms)
      .map((room) => {

        return {
          id: room.id,
          name: room.name,
          users: Object.keys(room.users).length,
          maxSeats: room.maxSeats,
          host: Object.values(room.users)
            .find((u) => u.isHost) || null
        };

      })
      .filter((room) => room.users > 0);


    socket.emit(
      "roomsList",
      list
    );
  });


  /* ==================================================
     DISCONNECT
  ================================================== */

  socket.on("disconnect", () => {

    console.log(
      "User disconnected:",
      socket.id
    );

    removeUser(socket);
  });

});


/* ==================================================
   HEALTH CHECK
================================================== */

app.get("/", (req, res) => {

  res.status(200).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>PawanVoice Server</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #111;
          color: white;
          text-align: center;
          padding: 50px;
        }

        h1 {
          color: #ff4f91;
        }
      </style>
    </head>

    <body>

      <h1>🎙️ PawanVoice Server</h1>

      <p>Server is running successfully.</p>

      <p>Socket.IO Room System: ACTIVE</p>

      <p>9 Seat Voice Room System: ACTIVE</p>

    </body>
    </html>
  `);

});


/* ==================================================
   SERVER START
================================================== */

server.listen(PORT, () => {

  console.log("");
  console.log("================================");
  console.log("       PAWANVOICE SERVER");
  console.log("================================");
  console.log("Server running on port:", PORT);
  console.log("9 Seat Room System: ACTIVE");
  console.log("Socket.IO: ACTIVE");
  console.log("================================");
  console.log("");

});
