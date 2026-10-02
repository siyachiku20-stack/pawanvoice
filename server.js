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

app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 10000;
const MAX_SEATS = 9;

const rooms = new Map();
const users = new Map();

function clean(value) {
  return String(value || "").trim().slice(0, 60);
}

function cleanRoomId(value) {
  return clean(value)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 30);
}

function publicUser(user) {
  return {
    userId: user.userId,
    name: user.name,
    dp: user.dp || "",
    socketId: user.socketId,
    seatNo: user.seatNo || 0,
    micOn: !!user.micOn,
    speakerOn: user.speakerOn !== false,
    isHost: !!user.isHost,
    isAdmin: !!user.isAdmin
  };
}

function roomState(room) {
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    hostId: room.hostId,
    seats: room.seats,
    users: [...room.users.values()].map(publicUser)
  };
}

function broadcastRoom(room) {
  io.to(room.roomId).emit("room-state", roomState(room));
}

function getRoom(socket) {
  if (!socket.data.roomId) return null;
  return rooms.get(socket.data.roomId);
}

function isAdmin(room, socket) {
  if (!room) return false;

  const user = room.users.get(socket.id);

  return !!(
    user &&
    (user.isHost || user.isAdmin)
  );
}

function ensureUser(socket, data) {
  let user = users.get(socket.id);

  if (!user) {
    user = {
      userId:
        clean(data?.userId) ||
        "PV" +
          Math.random()
            .toString(36)
            .slice(2, 9)
            .toUpperCase(),

      name: clean(data?.name) || "Pawan User",

      dp: data?.dp || "",

      socketId: socket.id,

      seatNo: 0,

      micOn: false,

      speakerOn: true,

      isHost: false,

      isAdmin: false
    };

    users.set(socket.id, user);
  }

  return user;
}

/* ---------------- API ---------------- */

app.get("/", (req, res) => {
  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    seats: 9,
    rooms: rooms.size
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true
  });
});

app.get("/api/rooms", (req, res) => {
  res.json(
    [...rooms.values()].map(room => ({
      roomId: room.roomId,
      roomName: room.roomName,
      hostId: room.hostId,
      count: room.users.size,
      seats: room.seats
    }))
  );
});

app.get("/api/user/:id", (req, res) => {
  const user = [...users.values()].find(
    x => x.userId === req.params.id
  );

  res.json(user ? publicUser(user) : null);
});

/* ---------------- SOCKET ---------------- */

io.on("connection", socket => {

  /* CREATE ROOM */

  socket.on("create-room", (data, callback) => {

    data = data || {};

    let id =
      cleanRoomId(data.roomId) ||
      "PV" +
        Math.floor(
          100000 + Math.random() * 900000
        );

    if (rooms.has(id)) {
      callback?.({
        ok: false,
        error: "Room already exists"
      });

      return;
    }

    const user = ensureUser(socket, data);

    const room = {
      roomId: id,

      roomName:
        clean(data.roomName) ||
        "PawanVoice Room",

      hostId: user.userId,

      seats: Array(MAX_SEATS).fill(null),

      users: new Map(),

      banned: new Set()
    };

    user.isHost = true;
    user.isAdmin = true;
    user.seatNo = 1;

    room.seats[0] = user.userId;

    room.users.set(socket.id, user);

    rooms.set(id, room);

    socket.join(id);
    socket.data.roomId = id;

    callback?.({
      ok: true,
      roomId: id
    });

    broadcastRoom(room);
  });

  /* JOIN ROOM */

  socket.on("join-room", (data, callback) => {

    data = data || {};

    const id = cleanRoomId(data.roomId);

    const room = rooms.get(id);

    if (!room) {
      callback?.({
        ok: false,
        error: "Room not found"
      });

      return;
    }

    const user = ensureUser(socket, data);

    if (room.banned.has(user.userId)) {

      callback?.({
        ok: false,
        error: "You are banned from this room"
      });

      return;
    }

    if (room.users.size >= 50) {

      callback?.({
        ok: false,
        error: "Room full"
      });

      return;
    }

    user.isHost = false;
    user.isAdmin = false;
    user.seatNo = 0;

    room.users.set(socket.id, user);

    socket.join(id);
    socket.data.roomId = id;

    callback?.({
      ok: true
    });

    broadcastRoom(room);

    socket.to(id).emit("peer-joined", {
      socketId: socket.id,
      user: publicUser(user)
    });
  });

  /* PROFILE */

  socket.on("update-profile", data => {

    data = data || {};

    const user = ensureUser(socket, data);

    if (data.name !== undefined) {
      user.name = clean(data.name) || user.name;
    }

    if (data.dp !== undefined) {
      user.dp = String(data.dp).slice(0, 150000);
    }

    const room = getRoom(socket);

    if (room) {
      broadcastRoom(room);
    }
  });

  /* TAKE SEAT */

  socket.on("take-seat", seatNumber => {

    const room = getRoom(socket);

    if (!room) return;

    const user = room.users.get(socket.id);

    if (!user) return;

    const seat = Math.max(
      1,
      Math.min(
        MAX_SEATS,
        Number(seatNumber) || 0
      )
    );

    if (room.seats[seat - 1]) return;

    if (user.seatNo) {
      room.seats[user.seatNo - 1] = null;
    }

    user.seatNo = seat;

    room.seats[seat - 1] = user.userId;

    broadcastRoom(room);
  });

  /* LEAVE SEAT */

  socket.on("leave-seat", () => {

    const room = getRoom(socket);

    if (!room) return;

    const user = room.users.get(socket.id);

    if (!user) return;

    if (user.seatNo) {

      room.seats[user.seatNo - 1] = null;

      user.seatNo = 0;

      broadcastRoom(room);
    }
  });

  /* MIC */

  socket.on("mic-toggle", value => {

    const room = getRoom(socket);

    if (!room) return;

    const user = room.users.get(socket.id);

    if (!user) return;

    user.micOn = !!value;

    broadcastRoom(room);
  });

  /* SPEAKER */

  socket.on("speaker-toggle", value => {

    const room = getRoom(socket);

    if (!room) return;

    const user = room.users.get(socket.id);

    if (!user) return;

    user.speakerOn = !!value;

    broadcastRoom(room);
  });

  /* CHAT */

  socket.on("send-message", message => {

    const room = getRoom(socket);

    if (!room) return;

    const user = room.users.get(socket.id);

    if (!user) return;

    io.to(room.roomId).emit(
      "room-message",
      {
        userId: user.userId,

        name: user.name,

        dp: user.dp || "",

        text: clean(message?.text).slice(0, 500),

        time: Date.now()
      }
    );
  });

  /* ROOM NAME */

  socket.on("change-room-name", name => {

    const room = getRoom(socket);

    if (!room) return;

    if (!isAdmin(room, socket)) return;

    room.roomName =
      clean(name) ||
      room.roomName;

    broadcastRoom(room);
  });

  /* MAKE ADMIN */

  socket.on("make-admin", userId => {

    const room = getRoom(socket);

    if (!room) return;

    if (!isAdmin(room, socket)) return;

    for (const user of room.users.values()) {

      if (user.userId === userId) {
        user.isAdmin = true;
      }
    }

    broadcastRoom(room);
  });

  /* REMOVE ADMIN */

  socket.on("remove-admin", userId => {

    const room = getRoom(socket);

    if (!room) return;

    const me = room.users.get(socket.id);

    if (!me?.isHost) return;

    for (const user of room.users.values()) {

      if (
        user.userId === userId &&
        !user.isHost
      ) {
        user.isAdmin = false;
      }
    }

    broadcastRoom(room);
  });

  /* KICK */

  socket.on("kick-user", userId => {

    const room = getRoom(socket);

    if (!room) return;

    if (!isAdmin(room, socket)) return;

    for (const [sid, user] of room.users) {

      if (
        user.userId === userId &&
        !user.isHost
      ) {

        io.to(sid).emit("kicked");

        removeSocket(sid);

        break;
      }
    }

    if (rooms.has(room.roomId)) {
      broadcastRoom(room);
    }
  });

  /* BAN */

  socket.on("ban-user", userId => {

    const room = getRoom(socket);

    if (!room) return;

    if (!isAdmin(room, socket)) return;

    for (const [sid, user] of room.users) {

      if (
        user.userId === userId &&
        !user.isHost
      ) {

        room.banned.add(userId);

        io.to(sid).emit("banned");

        removeSocket(sid);

        break;
      }
    }

    if (rooms.has(room.roomId)) {
      broadcastRoom(room);
    }
  });

  /* WEBRTC OFFER */

  socket.on("voice-offer", data => {

    if (!data?.target) return;

    io.to(data.target).emit(
      "voice-offer",
      {
        from: socket.id,
        offer: data.offer
      }
    );
  });

  /* WEBRTC ANSWER */

  socket.on("voice-answer", data => {

    if (!data?.target) return;

    io.to(data.target).emit(
      "voice-answer",
      {
        from: socket.id,
        answer: data.answer
      }
    );
  });

  /* ICE */

  socket.on("voice-ice", data => {

    if (!data?.target) return;

    io.to(data.target).emit(
      "voice-ice",
      {
        from: socket.id,
        candidate: data.candidate
      }
    );
  });

  /* DISCONNECT */

  socket.on("disconnect", () => {
    removeSocket(socket.id);
  });
});


function removeSocket(socketId) {

  let room = null;

  for (const r of rooms.values()) {

    if (r.users.has(socketId)) {
      room = r;
      break;
    }
  }

  const user = users.get(socketId);

  if (room) {

    const oldUser = room.users.get(socketId);

    if (oldUser?.seatNo) {
      room.seats[
        oldUser.seatNo - 1
      ] = null;
    }

    room.users.delete(socketId);

    if (
      room.hostId ===
      oldUser?.userId
    ) {

      const next =
        room.users.values().next().value;

      if (next) {

        room.hostId =
          next.userId;

        next.isHost = true;
        next.isAdmin = true;

        if (!next.seatNo) {

          const emptySeat =
            room.seats.findIndex(
              x => !x
            );

          if (emptySeat >= 0) {

            next.seatNo =
              emptySeat + 1;

            room.seats[
              emptySeat
            ] = next.userId;
          }
        }

      } else {

        rooms.delete(
          room.roomId
        );
      }
    }

    if (rooms.has(room.roomId)) {
      broadcastRoom(room);
    }
  }

  users.delete(socketId);
}


server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "PawanVoice server running on port " +
      PORT
    );
  }
);
