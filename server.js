const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

const TURN_URL = process.env.TURN_URL || "";
const TURN_USERNAME = process.env.TURN_USERNAME || "";
const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL || "";

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"]
}));

app.use(express.json());

/*
====================================================
STATIC FILES
====================================================
*/

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/room.html", (req, res) => {
  res.sendFile(path.join(__dirname, "room.html"));
});

/*
====================================================
HEALTH
====================================================
*/

app.get("/health", (req, res) => {

  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    webRTC: true,
    turnConfigured: Boolean(
      TURN_URL &&
      TURN_USERNAME &&
      TURN_CREDENTIAL
    ),
    seats: 9,
    rooms: rooms.size
  });

});

/*
====================================================
WEBRTC / TURN CONFIG
====================================================
*/

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
    TURN_URL &&
    TURN_USERNAME &&
    TURN_CREDENTIAL
  ) {

    iceServers.push({

      urls: [
        TURN_URL,
        TURN_URL.replace(
          "turn:",
          "turns:"
        ) + "?transport=tcp"
      ],

      username: TURN_USERNAME,

      credential: TURN_CREDENTIAL

    });

  }

  res.json({
    iceServers
  });

});

/*
====================================================
SOCKET.IO
====================================================
*/

const io = new Server(server, {

  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },

  transports: [
    "websocket",
    "polling"
  ]

});

/*
====================================================
ROOM STORAGE
====================================================
*/

const rooms = new Map();

const SEAT_COUNT = 9;

function makeRoom(roomId) {

  return {

    id: roomId,

    name: "PawanVoice Room",

    dp: "https://i.pravatar.cc/300?img=12",

    seats: Array(SEAT_COUNT).fill(null),

    users: new Map(),

    messages: [],

    gifts: [],

    createdAt: Date.now()

  };

}

function getRoom(roomId) {

  if (!rooms.has(roomId)) {

    rooms.set(
      roomId,
      makeRoom(roomId)
    );

  }

  return rooms.get(roomId);

}

/*
====================================================
USER CLEAN
====================================================
*/

function cleanUser(user) {

  if (!user) return null;

  return {

    userId: user.userId,

    socketId: user.socketId,

    name: user.name || "Guest",

    dp:
      user.dp ||
      "https://i.pravatar.cc/200?img=12",

    level: Number(user.level || 1),

    exp: Number(user.exp || 0),

    vipLevel:
      Number(user.vipLevel || 0),

    vipExp:
      Number(user.vipExp || 0),

    avatarFrame:
      user.avatarFrame || null,

    badge:
      user.badge || null,

    entryEffect:
      user.entryEffect || null,

    mic:
      Boolean(user.mic),

    muted:
      Boolean(user.muted),

    joinedAt:
      user.joinedAt || Date.now()

  };

}

/*
====================================================
ROOM STATE
====================================================
*/

function roomState(room) {

  return {

    id: room.id,

    name: room.name,

    dp: room.dp,

    seats: room.seats,

    users:
      Array.from(room.users.values())
        .map(cleanUser),

    messages:
      room.messages.slice(-100),

    gifts:
      room.gifts.slice(-100)

  };

}

function broadcastRoom(room) {

  io.to(room.id).emit(
    "room-state",
    roomState(room)
  );

  io.to(room.id).emit(
    "roomState",
    roomState(room)
  );

}

/*
====================================================
JOIN ROOM
====================================================
*/

io.on("connection", socket => {

  console.log(
    "Socket connected:",
    socket.id
  );

  socket.on(
    "join-room",
    data => {

      try {

        data = data || {};

        const roomId =
          String(
            data.roomId ||
            "main"
          ).trim();

        const userId =
          String(
            data.userId ||
            socket.id
          );

        const room =
          getRoom(roomId);

        const user = cleanUser({

          userId,

          socketId: socket.id,

          name:
            data.name ||
            "Guest",

          dp:
            data.dp ||
            "https://i.pravatar.cc/200?img=12",

          level:
            data.level || 1,

          exp:
            data.exp || 0,

          vipLevel:
            data.vipLevel || 0,

          vipExp:
            data.vipExp || 0,

          avatarFrame:
            data.avatarFrame || null,

          badge:
            data.badge || null,

          entryEffect:
            data.entryEffect || null,

          mic: false,

          joinedAt:
            Date.now()

        });

        socket.join(roomId);

        socket.data.roomId =
          roomId;

        socket.data.userId =
          userId;

        room.users.set(
          socket.id,
          user
        );

        /*
        First user becomes host.
        */

        if (
          !room.seats.some(Boolean)
        ) {

          room.seats[0] =
            socket.id;

        }

        /*
        Send current state.
        */

        socket.emit(
          "room-state",
          roomState(room)
        );

        socket.emit(
          "roomState",
          roomState(room)
        );

        /*
        Tell existing users about
        newly connected socket.
        */

        socket.to(roomId).emit(
          "user-entry",
          {
            socketId: socket.id,
            userId: userId,
            name: user.name
          }
        );

        broadcastRoom(room);

        console.log(
          `${user.name} joined ${roomId}`
        );

      } catch (error) {

        console.error(
          "join-room error:",
          error
        );

      }

    }
  );

  /*
  ==================================================
  TAKE SEAT
  ==================================================
  */

  socket.on(
    "take-seat",
    data => {

      const room =
        rooms.get(
          socket.data.roomId
        );

      if (!room) return;

      const user =
        room.users.get(
          socket.id
        );

      if (!user) return;

      let seatIndex =
        Number(
          data?.seatIndex ??
          data?.seat
        );

      if (
        !Number.isInteger(seatIndex) ||
        seatIndex < 0 ||
        seatIndex >= SEAT_COUNT
      ) {
        return;
      }

      /*
      Remove old seat.
      */

      for (
        let i = 0;
        i < room.seats.length;
        i++
      ) {

        if (
          room.seats[i] ===
          socket.id
        ) {

          room.seats[i] = null;

        }

      }

      /*
      Don't allow occupied seat.
      */

      if (
        room.seats[seatIndex]
      ) {

        socket.emit(
          "seat-error",
          {
            message:
              "This seat is already occupied."
          }
        );

        return;

      }

      room.seats[seatIndex] =
        socket.id;

      broadcastRoom(room);

    }
  );

  /*
  ==================================================
  LEAVE SEAT
  ==================================================
  */

  socket.on(
    "leave-seat",
    () => {

      const room =
        rooms.get(
          socket.data.roomId
        );

      if (!room) return;

      for (
        let i = 0;
        i < room.seats.length;
        i++
      ) {

        if (
          room.seats[i] ===
          socket.id
        ) {

          room.seats[i] = null;

        }

      }

      const user =
        room.users.get(
          socket.id
        );

      if (user) {

        user.mic = false;

      }

      broadcastRoom(room);

    }
  );

  /*
  ==================================================
  MIC STATUS
  ==================================================
  */

  socket.on(
    "mic-status",
    data => {

      const room =
        rooms.get(
          socket.data.roomId
        );

      if (!room) return;

      const user =
        room.users.get(
          socket.id
        );

      if (!user) return;

      user.mic =
        Boolean(data?.mic);

      broadcastRoom(room);

    }
  );

  /*
  ==================================================
  CHAT
  ==================================================
  */

  socket.on(
    "chat-message",
    data => {

      const room =
        rooms.get(
          socket.data.roomId
        );

      if (!room) return;

      const user =
        room.users.get(
          socket.id
        );

      if (!user) return;

      const text =
        String(
          data?.text || ""
        ).trim();

      if (!text) return;

      const message = {

        id:
          `${Date.now()}_${Math.random()}`,

        userId:
          user.userId,

        socketId:
          socket.id,

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

      io.to(room.id).emit(
        "chat-message",
        message
      );

      broadcastRoom(room);

    }
  );

  /*
  ==================================================
  GIFTS
  ==================================================
  */

  socket.on(
    "send-gift",
    data => {

      const room =
        rooms.get(
          socket.data.roomId
        );

      if (!room) return;

      const gift = {

        id:
          data?.id ||
          `${Date.now()}`,

        name:
          data?.name ||
          "Gift",

        icon:
          data?.icon ||
          "🎁",

        price:
          Number(data?.price || 0),

        quantity:
          Number(data?.quantity || 1),

        fromUserId:
          socket.data.userId,

        fromName:
          data?.fromName ||
          "Guest",

        toUserId:
          data?.toUserId ||
          "",

        toName:
          data?.toName ||
          "",

        time:
          Date.now()

      };

      room.gifts.push(
        gift
      );

      io.to(room.id).emit(
        "gift-received",
        gift
      );

      broadcastRoom(room);

    }
  );

  /*
  ==================================================
  ADMIN KICK
  ==================================================
  */

  socket.on(
    "admin-kick",
    data => {

      const room =
        rooms.get(
          socket.data.roomId
        );

      if (!room) return;

      const hostSocket =
        room.seats[0];

      if (
        hostSocket !==
        socket.id
      ) {

        return;

      }

      const targetSocketId =
        data?.targetSocketId;

      if (!targetSocketId) return;

      const targetSocket =
        io.sockets.sockets.get(
          targetSocketId
        );

      if (targetSocket) {

        targetSocket.emit(
          "kicked",
          {
            message:
              "You were removed from the room."
          }
        );

        targetSocket.disconnect(
          true
        );

      }

    }
  );

  /*
  ==================================================
  ADMIN MUTE
  ==================================================
  */

  socket.on(
    "admin-mute",
    data => {

      const room =
        rooms.get(
          socket.data.roomId
        );

      if (!room) return;

      if (
        room.seats[0] !==
        socket.id
      ) {

        return;

      }

      const targetSocketId =
        data?.targetSocketId;

      const target =
        room.users.get(
          targetSocketId
        );

      if (!target) return;

      target.muted = true;

      io.to(
        targetSocketId
      ).emit(
        "force-mute"
      );

      broadcastRoom(room);

    }
  );

  /*
  ==================================================
  WEBRTC OFFER
  ==================================================
  */

  socket.on(
    "webrtc-offer",
    data => {

      const target =
        data?.targetSocketId;

      if (!target) return;

      io.to(target).emit(
        "webrtc-offer",
        {
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

  /*
  ==================================================
  WEBRTC ANSWER
  ==================================================
  */

  socket.on(
    "webrtc-answer",
    data => {

      const target =
        data?.targetSocketId;

      if (!target) return;

      io.to(target).emit(
        "webrtc-answer",
        {
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

  /*
  ==================================================
  ICE CANDIDATE
  ==================================================
  */

  socket.on(
    "ice-candidate",
    data => {

      const target =
        data?.targetSocketId;

      if (!target) return;

      io.to(target).emit(
        "ice-candidate",
        {
          fromSocketId:
            socket.id,

          candidate:
            data.candidate
        }
      );

    }
  );

  /*
  compatibility
  */

  socket.on(
    "iceCandidate",
    data => {

      const target =
        data?.targetSocketId;

      if (!target) return;

      io.to(target).emit(
        "iceCandidate",
        {
          fromSocketId:
            socket.id,

          candidate:
            data.candidate
        }
      );

    }
  );

  /*
  ==================================================
  GET ROOM STATE
  ==================================================
  */

  socket.on(
    "get-room-state",
    () => {

      const room =
        rooms.get(
          socket.data.roomId
        );

      if (!room) return;

      socket.emit(
        "room-state",
        roomState(room)
      );

    }
  );

  /*
  ==================================================
  DISCONNECT
  ==================================================
  */

  socket.on(
    "disconnect",
    reason => {

      const roomId =
        socket.data.roomId;

      if (!roomId) return;

      const room =
        rooms.get(roomId);

      if (!room) return;

      /*
      Remove from seats.
      */

      for (
        let i = 0;
        i < room.seats.length;
        i++
      ) {

        if (
          room.seats[i] ===
          socket.id
        ) {

          room.seats[i] = null;

        }

      }

      room.users.delete(
        socket.id
      );

      /*
      If host left,
      first remaining user becomes host.
      */

      if (
        room.seats[0] === null &&
        room.users.size > 0
      ) {

        const first =
          room.users.keys().next().value;

        room.seats[0] =
          first;

      }

      /*
      Delete empty room.
      */

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

        return;

      }

      broadcastRoom(room);

      console.log(
        "Socket disconnected:",
        socket.id,
        reason
      );

    }
  );

});

/*
====================================================
START
====================================================
*/

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `PawanVoice server running on port ${PORT}`
    );

    console.log(
      "TURN configured:",
      Boolean(
        TURN_URL &&
        TURN_USERNAME &&
        TURN_CREDENTIAL
      )
    );

  }
);
