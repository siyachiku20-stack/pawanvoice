const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const path = require("path");

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
   VOICE ROOM
========================= */

class VoiceRoom {
  constructor(roomId) {
    this.roomId = String(roomId);

    this.seats = Array.from({ length: 9 }, (_, i) => ({
      seatNo: i + 1,
      user: null,
      mic: false
    }));

    this.users = new Map();
  }

  join(userId, nickname, dp) {
    this.users.set(String(userId), {
      userId: String(userId),
      nickname: nickname || "User",
      dp: dp || ""
    });
  }

  leave(userId) {
    userId = String(userId);

    this.users.delete(userId);

    this.seats.forEach(seat => {
      if (
        seat.user &&
        seat.user.userId === userId
      ) {
        seat.user = null;
        seat.mic = false;
      }
    });
  }

  takeSeat(userId, seatNo) {
    userId = String(userId);

    const user = this.users.get(userId);

    const seat = this.seats.find(
      s => s.seatNo === Number(seatNo)
    );

    if (!user || !seat) return false;

    if (seat.user) return false;

    /* remove old seat */
    this.seats.forEach(s => {
      if (
        s.user &&
        s.user.userId === userId
      ) {
        s.user = null;
        s.mic = false;
      }
    });

    seat.user = user;
    seat.mic = false;

    return true;
  }

  leaveSeat(userId) {
    userId = String(userId);

    this.seats.forEach(seat => {
      if (
        seat.user &&
        seat.user.userId === userId
      ) {
        seat.user = null;
        seat.mic = false;
      }
    });
  }

  setMic(userId, status) {
    userId = String(userId);

    const seat = this.seats.find(
      s =>
        s.user &&
        s.user.userId === userId
    );

    if (!seat) return false;

    seat.mic = Boolean(status);

    return true;
  }

  getState() {
    return {
      roomId: this.roomId,

      seats: this.seats,

      users: Array.from(
        this.users.values()
      )
    };
  }
}

/* =========================
   ROOMS
========================= */

const rooms = new Map();

function getRoom(roomId) {

  roomId = String(roomId);

  if (!rooms.has(roomId)) {
    rooms.set(
      roomId,
      new VoiceRoom(roomId)
    );
  }

  return rooms.get(roomId);
}

function sendRoomState(roomId) {

  const room =
    rooms.get(String(roomId));

  if (!room) return;

  io.to(String(roomId)).emit(
    "roomState",
    room.getState()
  );
}

/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

app.get("/room.html", (req, res) => {
  res.sendFile(
    path.join(__dirname, "room.html")
  );
});

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

/* =========================
   SOCKET.IO
========================= */

io.on("connection", socket => {

  console.log(
    "Socket connected:",
    socket.id
  );

  /* =========================
     JOIN ROOM
  ========================= */

  socket.on(
    "joinRoom",
    data => {

      if (!data) return;

      const roomId =
        String(
          data.roomId || "10001"
        );

      const userId =
        String(
          data.userId ||
          "PV" +
          Math.floor(
            10000 +
            Math.random() * 90000
          )
        );

      const nickname =
        data.nickname || "User";

      const dp =
        data.dp || "";

      const room =
        getRoom(roomId);

      socket.join(roomId);

      socket.pvRoomId =
        roomId;

      socket.pvUserId =
        userId;

      /* =========================
         SAVE USER -> SOCKET
      ========================= */

      socketMap.set(
        userId,
        socket.id
      );

      socketUserMap.set(
        socket.id,
        userId
      );

      /* =========================
         EXISTING USERS
      ========================= */

      const existingUsers =
        Array.from(
          room.users.values()
        )
        .filter(
          user =>
            user.userId !== userId
        )
        .map(user => {

          return {
            userId: user.userId,
            nickname: user.nickname,
            dp: user.dp,
            socketId:
              socketMap.get(
                user.userId
              ) || null
          };

        });

      socket.emit(
        "existingUsers",
        existingUsers
      );

      /* =========================
         ADD USER
      ========================= */

      room.join(
        userId,
        nickname,
        dp
      );

      /* =========================
         TELL OTHERS
      ========================= */

      socket.to(roomId).emit(
        "newUser",
        {
          userId,
          nickname,
          dp,
          socketId: socket.id
        }
      );

      sendRoomState(roomId);

    }
  );

  /* =========================
     TAKE SEAT
  ========================= */

  socket.on(
    "takeSeat",
    seatNo => {

      const roomId =
        socket.pvRoomId;

      const userId =
        socket.pvUserId;

      if (!roomId || !userId)
        return;

      const room =
        rooms.get(roomId);

      if (!room)
        return;

      if (
        room.takeSeat(
          userId,
          seatNo
        )
      ) {

        sendRoomState(
          roomId
        );

      }

    }
  );

  /* =========================
     LEAVE SEAT
  ========================= */

  socket.on(
    "leaveSeat",
    () => {

      const roomId =
        socket.pvRoomId;

      const userId =
        socket.pvUserId;

      if (!roomId || !userId)
        return;

      const room =
        rooms.get(roomId);

      if (!room)
        return;

      room.leaveSeat(
        userId
      );

      sendRoomState(
        roomId
      );

    }
  );

  /* =========================
     MIC
  ========================= */

  socket.on(
    "micStatus",
    status => {

      const roomId =
        socket.pvRoomId;

      const userId =
        socket.pvUserId;

      if (!roomId || !userId)
        return;

      const room =
        rooms.get(roomId);

      if (!room)
        return;

      room.setMic(
        userId,
        Boolean(status)
      );

      sendRoomState(
        roomId
      );

    }
  );

  /* =========================
     CHAT
  ========================= */

  socket.on(
    "message",
    message => {

      const roomId =
        socket.pvRoomId;

      if (!roomId)
        return;

      io.to(roomId).emit(
        "message",
        {
          userId:
            socket.pvUserId,

          nickname:
            message.nickname ||
            "User",

          dp:
            message.dp || "",

          text:
            String(
              message.text || ""
            ).slice(0, 500),

          time:
            Date.now()
        }
      );

    }
  );

  /* =========================
     WEBRTC OFFER
  ========================= */

  socket.on(
    "webrtc-offer",
    data => {

      if (!data)
        return;

      const targetSocket =
        data.to;

      if (!targetSocket)
        return;

      io.to(
        targetSocket
      ).emit(
        "webrtc-offer",
        {
          from:
            socket.id,

          fromUserId:
            socket.pvUserId,

          offer:
            data.offer
        }
      );

    }
  );

  /* =========================
     WEBRTC ANSWER
  ========================= */

  socket.on(
    "webrtc-answer",
    data => {

      if (!data)
        return;

      if (!data.to)
        return;

      io.to(
        data.to
      ).emit(
        "webrtc-answer",
        {
          from:
            socket.id,

          answer:
            data.answer
        }
      );

    }
  );

  /* =========================
     WEBRTC ICE
  ========================= */

  socket.on(
    "webrtc-ice",
    data => {

      if (!data)
        return;

      if (!data.to)
        return;

      io.to(
        data.to
      ).emit(
        "webrtc-ice",
        {
          from:
            socket.id,

          candidate:
            data.candidate
        }
      );

    }
  );

  /* =========================
     LEAVE
  ========================= */

  socket.on(
    "leaveRoom",
    () => {

      removeUser();

    }
  );

  socket.on(
    "disconnect",
    () => {

      console.log(
        "Socket disconnected:",
        socket.id
      );

      removeUser();

    }
  );

  function removeUser() {

    const roomId =
      socket.pvRoomId;

    const userId =
      socket.pvUserId;

    if (!roomId || !userId)
      return;

    const room =
      rooms.get(roomId);

    if (room) {

      room.leave(
        userId
      );

      socket.to(roomId).emit(
        "peerLeft",
        {
          socketId:
            socket.id,

          userId:
            userId
        }
      );

      sendRoomState(
        roomId
      );

      if (
        room.users.size === 0
      ) {

        rooms.delete(
          roomId
        );

      }

    }

    socketMap.delete(
      userId
    );

    socketUserMap.delete(
      socket.id
    );

    socket.pvRoomId = null;
    socket.pvUserId = null;

  }

});


/* =========================
   USER <-> SOCKET MAP
========================= */

const socketMap =
  new Map();

const socketUserMap =
  new Map();


/* =========================
   START SERVER
========================= */

server.listen(
  PORT,
  () => {

    console.log(
      `PawanVoice server running on port ${PORT}`
    );

  }
);
