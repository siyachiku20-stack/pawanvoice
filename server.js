const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

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
   ROOMS
========================= */

const rooms = new Map();

function createRoom(roomId) {
  return {
    id: roomId,
    name: "PawanVoice Room",
    dp: "https://i.pravatar.cc/200?img=12",
    seats: Array(9).fill(null),
    users: {},
    messages: [],
    gifts: [],
    createdAt: Date.now()
  };
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, createRoom(roomId));
  }

  return rooms.get(roomId);
}

function cleanUser(user) {
  if (!user) return null;

  return {
    userId: user.userId,
    name: user.name || "Pawan User",
    dp: user.dp || "https://i.pravatar.cc/200?img=12",
    level: Number(user.level || 1),
    exp: Number(user.exp || 0),
    mic: Boolean(user.mic)
  };
}

function roomState(room) {
  return {
    id: room.id,
    name: room.name,
    dp: room.dp,
    seats: room.seats,
    users: Object.values(room.users),
    messages: room.messages.slice(-50),
    gifts: room.gifts.slice(-20)
  };
}

function broadcastRoom(roomId) {
  const room = rooms.get(roomId);

  if (!room) return;

  io.to(roomId).emit(
    "room-state",
    roomState(room)
  );
}

/* =========================
   PAGES
========================= */

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.get("/room.html", (req, res) => {
  res.sendFile(__dirname + "/room.html");
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
   RTC CONFIG
========================= */

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
    process.env.TURN_PASSWORD
  ) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD
    });
  }

  res.json({
    iceServers
  });
});

/* =========================
   SOCKET
========================= */

io.on("connection", (socket) => {

  console.log(
    "Connected:",
    socket.id
  );

  /* JOIN */

  socket.on("join-room", (data = {}) => {

    const roomId =
      String(data.roomId || "PVMAIN");

    const room =
      getRoom(roomId);

    const userId =
      String(
        data.userId ||
        socket.id
      );

    const user = {
      socketId: socket.id,
      userId,
      name:
        data.name ||
        "Pawan User",
      dp:
        data.dp ||
        "https://i.pravatar.cc/200?img=12",
      level:
        Number(data.level || 1),
      exp:
        Number(data.exp || 0),
      mic: false,
      seat: -1
    };

    socket.join(roomId);

    socket.data.roomId = roomId;
    socket.data.userId = userId;

    room.users[socket.id] = user;

    /*
      Host seat:
      अगर seat 0 खाली है तो
      पहला user host बनेगा.
    */

    if (!room.seats[0]) {

      room.seats[0] = cleanUser(user);

      room.seats[0].socketId =
        socket.id;

      room.seats[0].seat = 0;

      user.seat = 0;

    }

    broadcastRoom(roomId);

    socket.emit(
      "joined-room",
      {
        roomId,
        seat: user.seat
      }
    );

    console.log(
      `${user.name} joined ${roomId}`
    );

  });

  /* TAKE SEAT */

  socket.on("take-seat", (data = {}) => {

    const roomId =
      String(
        data.roomId ||
        socket.data.roomId ||
        "PVMAIN"
      );

    const room =
      rooms.get(roomId);

    if (!room) return;

    const user =
      room.users[socket.id];

    if (!user) return;

    let seat =
      Number(data.seat);

    if (
      !Number.isInteger(seat) ||
      seat < 0 ||
      seat > 8
    ) {
      return;
    }

    /*
      पहले user की पुरानी seat हटाओ.
    */

    for (
      let i = 0;
      i < 9;
      i++
    ) {

      if (
        room.seats[i] &&
        room.seats[i].socketId ===
        socket.id
      ) {

        room.seats[i] = null;

      }

    }

    /*
      Seat occupied है तो मत बैठाओ.
    */

    if (room.seats[seat]) {

      socket.emit(
        "seat-error",
        {
          message:
            "This seat is already occupied."
        }
      );

      broadcastRoom(roomId);

      return;
    }

    user.seat = seat;

    room.seats[seat] = {
      ...cleanUser(user),
      socketId: socket.id,
      seat
    };

    broadcastRoom(roomId);

  });

  /* LEAVE SEAT */

  socket.on("leave-seat", () => {

    const roomId =
      socket.data.roomId;

    const room =
      rooms.get(roomId);

    if (!room) return;

    for (
      let i = 0;
      i < 9;
      i++
    ) {

      if (
        room.seats[i] &&
        room.seats[i].socketId ===
        socket.id
      ) {

        room.seats[i] = null;

      }

    }

    if (
      room.users[socket.id]
    ) {
      room.users[socket.id].seat = -1;
    }

    broadcastRoom(roomId);

  });

  /* MIC */

  socket.on("mic-status", (data = {}) => {

    const roomId =
      socket.data.roomId;

    const room =
      rooms.get(roomId);

    if (!room) return;

    const user =
      room.users[socket.id];

    if (!user) return;

    user.mic =
      Boolean(data.enabled);

    for (
      let i = 0;
      i < 9;
      i++
    ) {

      if (
        room.seats[i] &&
        room.seats[i].socketId ===
        socket.id
      ) {

        room.seats[i].mic =
          user.mic;

      }

    }

    broadcastRoom(roomId);

  });

  /* CHAT */

  socket.on("chat-message", (data = {}) => {

    const roomId =
      socket.data.roomId;

    const room =
      rooms.get(roomId);

    if (!room) return;

    const user =
      room.users[socket.id];

    if (!user) return;

    const text =
      String(
        data.text || ""
      ).trim();

    if (!text) return;

    if (text.length > 300) return;

    const message = {
      id:
        Date.now() +
        "-" +
        Math.random()
          .toString(36)
          .slice(2),

      userId:
        user.userId,

      name:
        user.name,

      dp:
        user.dp,

      text,

      time:
        Date.now()
    };

    room.messages.push(
      message
    );

    io.to(roomId).emit(
      "chat-message",
      message
    );

  });

  /* GIFT */

  socket.on("send-gift", (data = {}) => {

    const roomId =
      socket.data.roomId;

    const room =
      rooms.get(roomId);

    if (!room) return;

    const user =
      room.users[socket.id];

    if (!user) return;

    const gift =
      String(
        data.gift || "Gift"
      );

    const giftData = {
      userId:
        user.userId,

      name:
        user.name,

      dp:
        user.dp,

      gift,

      time:
        Date.now()
    };

    room.gifts.push(
      giftData
    );

    io.to(roomId).emit(
      "gift",
      giftData
    );

  });

  /* ADMIN KICK */

  socket.on("admin-kick", (data = {}) => {

    const roomId =
      socket.data.roomId;

    const room =
      rooms.get(roomId);

    if (!room) return;

    const admin =
      room.users[socket.id];

    if (!admin) return;

    /*
      केवल Host seat 0
      kick कर सकता है.
    */

    if (
      !room.seats[0] ||
      room.seats[0].socketId !==
      socket.id
    ) {

      return;

    }

    const targetSocket =
      String(
        data.socketId || ""
      );

    const target =
      room.users[targetSocket];

    if (!target) return;

    for (
      let i = 0;
      i < 9;
      i++
    ) {

      if (
        room.seats[i] &&
        room.seats[i].socketId ===
        targetSocket
      ) {

        room.seats[i] = null;

      }

    }

    const targetClient =
      io.sockets.sockets.get(
        targetSocket
      );

    if (targetClient) {

      targetClient.emit(
        "kicked",
        {
          message:
            "You were removed from the room."
        }
      );

      targetClient.leave(
        roomId
      );

    }

    delete room.users[
      targetSocket
    ];

    broadcastRoom(roomId);

  });

  /* ADMIN MUTE */

  socket.on("admin-mute", (data = {}) => {

    const roomId =
      socket.data.roomId;

    const room =
      rooms.get(roomId);

    if (!room) return;

    const admin =
      room.users[socket.id];

    if (!admin) return;

    if (
      !room.seats[0] ||
      room.seats[0].socketId !==
      socket.id
    ) {

      return;

    }

    const targetSocket =
      String(
        data.socketId || ""
      );

    const target =
      room.users[targetSocket];

    if (!target) return;

    target.mic = false;

    for (
      let i = 0;
      i < 9;
      i++
    ) {

      if (
        room.seats[i] &&
        room.seats[i].socketId ===
        targetSocket
      ) {

        room.seats[i].mic =
          false;

      }

    }

    const targetClient =
      io.sockets.sockets.get(
        targetSocket
      );

    if (targetClient) {

      targetClient.emit(
        "forced-mute"
      );

    }

    broadcastRoom(roomId);

  });

  /* =========================
     WEBRTC SIGNALING
  ========================= */

  socket.on(
    "webrtc-offer",
    (data = {}) => {

      const target =
        io.sockets.sockets.get(
          data.targetSocketId
        );

      if (target) {

        target.emit(
          "webrtc-offer",
          {
            fromSocketId:
              socket.id,

            offer:
              data.offer
          }
        );

      }

    }
  );

  socket.on(
    "webrtc-answer",
    (data = {}) => {

      const target =
        io.sockets.sockets.get(
          data.targetSocketId
        );

      if (target) {

        target.emit(
          "webrtc-answer",
          {
            fromSocketId:
              socket.id,

            answer:
              data.answer
          }
        );

      }

    }
  );

  socket.on(
    "webrtc-ice",
    (data = {}) => {

      const target =
        io.sockets.sockets.get(
          data.targetSocketId
        );

      if (target) {

        target.emit(
          "webrtc-ice",
          {
            fromSocketId:
              socket.id,

            candidate:
              data.candidate
          }
        );

      }

    }
  );

  /* GET ROOM STATE */

  socket.on(
    "get-room-state",
    (data = {}) => {

      const roomId =
        String(
          data.roomId ||
          socket.data.roomId ||
          "PVMAIN"
        );

      const room =
        rooms.get(roomId);

      if (!room) return;

      socket.emit(
        "room-state",
        roomState(room)
      );

    }
  );

  /* DISCONNECT */

  socket.on(
    "disconnect",
    () => {

      const roomId =
        socket.data.roomId;

      if (!roomId) {
        return;
      }

      const room =
        rooms.get(roomId);

      if (!room) {
        return;
      }

      for (
        let i = 0;
        i < 9;
        i++
      ) {

        if (
          room.seats[i] &&
          room.seats[i].socketId ===
          socket.id
        ) {

          room.seats[i] = null;

        }

      }

      delete room.users[
        socket.id
      ];

      /*
        अगर Host चला गया तो
        अगला user Host बनेगा.
      */

      if (!room.seats[0]) {

        for (
          let i = 1;
          i < 9;
          i++
        ) {

          if (room.seats[i]) {

            room.seats[0] =
              room.seats[i];

            room.seats[i] =
              null;

            break;

          }

        }

      }

      if (
        Object.keys(
          room.users
        ).length === 0
      ) {

        rooms.delete(
          roomId
        );

      } else {

        broadcastRoom(
          roomId
        );

      }

      console.log(
        "Disconnected:",
        socket.id
      );

    }
  );

});

/* =========================
   START
========================= */

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `PawanVoice server running on port ${PORT}`
    );

  }
);
