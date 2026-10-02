const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
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
  },
  transports: ["websocket", "polling"]
});

const PORT = process.env.PORT || 3000;

/* =========================================================
   DATA
========================================================= */

const rooms = new Map();

const socketMap = new Map();      // userId -> socketId
const socketUserMap = new Map();  // socketId -> userId

const MAX_SEATS = 9;

/* =========================================================
   HELPERS
========================================================= */

function clean(value, max = 120) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, max);
}

function makeUserId() {
  return (
    "PV" +
    Math.floor(10000 + Math.random() * 90000)
  );
}

function getRoom(roomId) {
  return rooms.get(String(roomId));
}

function createRoom(roomId) {
  const id = String(roomId);

  const room = {
    id,
    createdAt: Date.now(),
    users: new Map(),
    seats: Array(MAX_SEATS).fill(null)
  };

  rooms.set(id, room);

  return room;
}

function roomState(room) {
  return {
    roomId: room.id,

    seats: room.seats.map((userId, index) => {
      if (!userId) {
        return {
          seat: index,
          occupied: false
        };
      }

      const user = room.users.get(userId);

      if (!user) {
        return {
          seat: index,
          occupied: false
        };
      }

      return {
        seat: index,
        occupied: true,
        userId: user.userId,
        name: user.name,
        dp: user.dp,
        title: user.title,
        mic: user.mic,
        isHost: user.isHost
      };
    }),

    users: [...room.users.values()].map(user => ({
      userId: user.userId,
      name: user.name,
      dp: user.dp,
      title: user.title,
      mic: user.mic,
      seat: user.seat,
      isHost: user.isHost
    })),

    count: room.users.size
  };
}

function removeUserFromSeat(room, userId) {
  const index = room.seats.indexOf(userId);

  if (index !== -1) {
    room.seats[index] = null;
  }
}

function broadcastRoom(room) {
  io.to("room:" + room.id).emit(
    "roomState",
    roomState(room)
  );
}

function leaveCurrentRoom(socket) {
  const userId = socketUserMap.get(socket.id);

  if (!userId) return;

  const user = socket.data.user;

  if (!user) {
    socketUserMap.delete(socket.id);
    socketMap.delete(userId);
    return;
  }

  const roomId = user.roomId;
  const room = getRoom(roomId);

  if (room) {
    removeUserFromSeat(room, userId);
    room.users.delete(userId);

    socket.leave("room:" + roomId);

    io.to("room:" + roomId).emit("peerLeft", {
      userId
    });

    broadcastRoom(room);

    if (room.users.size === 0) {
      rooms.delete(roomId);
    }
  }

  socketMap.delete(userId);
  socketUserMap.delete(socket.id);

  socket.data.user = null;
}

/* =========================================================
   BASIC ROUTES
========================================================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/room.html", (req, res) => {
  res.sendFile(path.join(__dirname, "room.html"));
});

app.get("/health", (req, res) => {
  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    webRTC: true,
    seats: MAX_SEATS,
    rooms: rooms.size
  });
});

/* =========================================================
   SOCKET.IO
========================================================= */

io.on("connection", socket => {

  console.log("CONNECTED:", socket.id);

  /* -------------------------------------------------------
     JOIN ROOM
  ------------------------------------------------------- */

  socket.on("joinRoom", data => {

    try {

      const roomId = clean(data.roomId || "10001");
      const userId = clean(data.userId) || makeUserId();

      const name =
        clean(data.name, 40) ||
        "Pawan User";

      const dp =
        clean(data.dp, 500) ||
        "https://i.pravatar.cc/150?img=12";

      const title =
        clean(data.title, 40) ||
        "New User";

      /* leave old room first */

      leaveCurrentRoom(socket);

      let room = getRoom(roomId);

      if (!room) {
        room = createRoom(roomId);
      }

      /* if same user is connected elsewhere,
         remove old socket */

      const oldSocketId = socketMap.get(userId);

      if (oldSocketId && oldSocketId !== socket.id) {

        const oldSocket = io.sockets.sockets.get(
          oldSocketId
        );

        if (oldSocket) {
          oldSocket.emit("forceLeave", {
            reason: "You joined this account from another device."
          });

          oldSocket.disconnect(true);
        }
      }

      const user = {
        userId,
        name,
        dp,
        title,
        roomId,
        seat: null,
        mic: false,
        isHost: room.users.size === 0
      };

      room.users.set(userId, user);

      socketMap.set(userId, socket.id);
      socketUserMap.set(socket.id, userId);

      socket.data.user = user;

      socket.join("room:" + roomId);

      /* Existing users for WebRTC */

      const existingUsers = [...room.users.values()]
        .filter(u => u.userId !== userId)
        .map(u => ({
          userId: u.userId,
          name: u.name,
          dp: u.dp,
          title: u.title,
          seat: u.seat,
          mic: u.mic,
          isHost: u.isHost
        }));

      socket.emit("joinedRoom", {
        roomId,
        userId,
        isHost: user.isHost,
        state: roomState(room)
      });

      socket.emit("existingUsers", existingUsers);

      socket.to("room:" + roomId).emit(
        "newUser",
        {
          userId,
          name,
          dp,
          title,
          seat: null,
          mic: false,
          isHost: user.isHost
        }
      );

      broadcastRoom(room);

      console.log(
        "JOIN:",
        userId,
        "ROOM:",
        roomId
      );

    } catch (error) {

      console.error("joinRoom error:", error);

      socket.emit("serverError", {
        message: "Unable to join room."
      });
    }
  });

  /* -------------------------------------------------------
     TAKE SEAT
  ------------------------------------------------------- */

  socket.on("takeSeat", data => {

    const user = socket.data.user;

    if (!user) return;

    const room = getRoom(user.roomId);

    if (!room) return;

    const seat = Number(data.seat);

    if (
      !Number.isInteger(seat) ||
      seat < 0 ||
      seat >= MAX_SEATS
    ) {
      socket.emit("seatError", {
        message: "Invalid seat."
      });

      return;
    }

    /* already sitting */

    if (user.seat === seat) {
      return;
    }

    /* seat occupied */

    if (
      room.seats[seat] !== null &&
      room.seats[seat] !== user.userId
    ) {

      socket.emit("seatError", {
        message: "This seat is already occupied."
      });

      return;
    }

    /* remove old seat */

    removeUserFromSeat(
      room,
      user.userId
    );

    room.seats[seat] = user.userId;

    user.seat = seat;

    broadcastRoom(room);

  });

  /* -------------------------------------------------------
     LEAVE SEAT
  ------------------------------------------------------- */

  socket.on("leaveSeat", () => {

    const user = socket.data.user;

    if (!user) return;

    const room = getRoom(user.roomId);

    if (!room) return;

    removeUserFromSeat(
      room,
      user.userId
    );

    user.seat = null;

    broadcastRoom(room);
  });

  /* -------------------------------------------------------
     MIC STATUS
  ------------------------------------------------------- */

  socket.on("micStatus", data => {

    const user = socket.data.user;

    if (!user) return;

    const room = getRoom(user.roomId);

    if (!room) return;

    user.mic = !!data.mic;

    io.to("room:" + room.id).emit(
      "userMicChanged",
      {
        userId: user.userId,
        mic: user.mic
      }
    );

    broadcastRoom(room);
  });

  /* -------------------------------------------------------
     CHAT MESSAGE
  ------------------------------------------------------- */

  socket.on("message", data => {

    const user = socket.data.user;

    if (!user) return;

    const room = getRoom(user.roomId);

    if (!room) return;

    const message = clean(data.message, 500);

    if (!message) return;

    io.to("room:" + room.id).emit(
      "message",
      {
        id:
          Date.now().toString() +
          Math.random().toString(36).slice(2),

        userId: user.userId,
        name: user.name,
        dp: user.dp,
        message,
        time: Date.now()
      }
    );
  });

  /* -------------------------------------------------------
     WEBRTC OFFER
  ------------------------------------------------------- */

  socket.on("webrtc-offer", data => {

    const user = socket.data.user;

    if (!user) return;

    const targetUserId = clean(data.to);

    const targetSocketId =
      socketMap.get(targetUserId);

    if (!targetSocketId) return;

    io.to(targetSocketId).emit(
      "webrtc-offer",
      {
        from: user.userId,
        offer: data.offer
      }
    );
  });

  /* -------------------------------------------------------
     WEBRTC ANSWER
  ------------------------------------------------------- */

  socket.on("webrtc-answer", data => {

    const user = socket.data.user;

    if (!user) return;

    const targetUserId = clean(data.to);

    const targetSocketId =
      socketMap.get(targetUserId);

    if (!targetSocketId) return;

    io.to(targetSocketId).emit(
      "webrtc-answer",
      {
        from: user.userId,
        answer: data.answer
      }
    );
  });

  /* -------------------------------------------------------
     WEBRTC ICE
  ------------------------------------------------------- */

  socket.on("webrtc-ice", data => {

    const user = socket.data.user;

    if (!user) return;

    const targetUserId = clean(data.to);

    const targetSocketId =
      socketMap.get(targetUserId);

    if (!targetSocketId) return;

    io.to(targetSocketId).emit(
      "webrtc-ice",
      {
        from: user.userId,
        candidate: data.candidate
      }
    );
  });

  /* -------------------------------------------------------
     GIFT EVENT
  ------------------------------------------------------- */

  socket.on("gift", data => {

    const user = socket.data.user;

    if (!user) return;

    const room = getRoom(user.roomId);

    if (!room) return;

    io.to("room:" + room.id).emit(
      "gift",
      {
        fromUserId: user.userId,
        fromName: user.name,
        giftId: clean(data.giftId, 50),
        giftName: clean(data.giftName, 50),
        targetUserId: clean(data.targetUserId, 100),
        time: Date.now()
      }
    );
  });

  /* -------------------------------------------------------
     ROOM INVITE
  ------------------------------------------------------- */

  socket.on("roomInvite", () => {

    const user = socket.data.user;

    if (!user) return;

    socket.emit("roomInviteData", {
      roomId: user.roomId,
      url:
        "/room.html?room=" +
        encodeURIComponent(user.roomId)
    });
  });

  /* -------------------------------------------------------
     LEAVE ROOM
  ------------------------------------------------------- */

  socket.on("leaveRoom", () => {

    leaveCurrentRoom(socket);

  });

  /* -------------------------------------------------------
     DISCONNECT
  ------------------------------------------------------- */

  socket.on("disconnect", () => {

    console.log(
      "DISCONNECTED:",
      socket.id
    );

    leaveCurrentRoom(socket);

  });

});

/* =========================================================
   START
========================================================= */

server.listen(PORT, () => {

  console.log(
    `PawanVoice server running on port ${PORT}`
  );

});
