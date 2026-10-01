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

const PORT = process.env.PORT || 10000;
const MAX_SEATS = 9;

const rooms = new Map();

function clean(value, fallback = "") {
  return String(value ?? fallback).trim().slice(0, 80);
}

function makeRoom(roomId) {
  return {
    roomId,
    roomName: "PawanVoice Room",
    seats: Array.from({ length: MAX_SEATS }, (_, i) => ({
      seatNo: i + 1,
      userId: null
    })),
    users: new Map(),
    banned: new Set()
  };
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, makeRoom(roomId));
  }
  return rooms.get(roomId);
}

function publicUser(user) {
  return {
    userId: user.userId,
    name: user.name,
    dp: user.dp,
    socketId: user.socketId,
    seatNo: user.seatNo,
    micOn: user.micOn,
    speakerOn: user.speakerOn,
    isHost: user.isHost,
    isAdmin: user.isAdmin
  };
}

function roomState(room) {
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    seats: room.seats.map(s => ({
      seatNo: s.seatNo,
      userId: s.userId
    })),
    users: [...room.users.values()].map(publicUser)
  };
}

function broadcastRoom(room) {
  io.to(room.roomId).emit("room-state", roomState(room));
}

function findUser(room, userId) {
  return room.users.get(String(userId));
}

function canAdmin(room, socket) {
  const user = room.users.get(socket.userId);
  return !!user && (user.isHost || user.isAdmin);
}

function firstFreeSeat(room, from = 2) {
  for (let i = from; i <= MAX_SEATS; i++) {
    if (!room.seats[i - 1].userId) return i;
  }
  return null;
}

function putOnSeat(room, user, seatNo) {
  if (seatNo < 1 || seatNo > MAX_SEATS) return false;

  const seat = room.seats[seatNo - 1];

  if (seat.userId) return false;

  if (user.seatNo) {
    room.seats[user.seatNo - 1].userId = null;
  }

  seat.userId = user.userId;
  user.seatNo = seatNo;

  return true;
}

function removeFromSeat(room, user) {
  if (!user || !user.seatNo) return;

  const seat = room.seats[user.seatNo - 1];

  if (seat && seat.userId === user.userId) {
    seat.userId = null;
  }

  user.seatNo = null;
}

function promoteHost(room) {
  const users = [...room.users.values()];

  if (!users.length) return;

  users.forEach(u => {
    u.isHost = false;
  });

  const newHost = users[0];
  newHost.isHost = true;
  newHost.isAdmin = true;

  if (!newHost.seatNo) {
    const oldSeat1 = room.seats[0];

    if (!oldSeat1.userId) {
      oldSeat1.userId = newHost.userId;
      newHost.seatNo = 1;
    } else {
      const free = firstFreeSeat(room, 1);
      if (free) {
        room.seats[free - 1].userId = newHost.userId;
        newHost.seatNo = free;
      }
    }
  }
}

app.get("/", (req, res) => {
  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    seats: MAX_SEATS,
    rooms: rooms.size
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    seats: MAX_SEATS
  });
});

io.on("connection", socket => {

  socket.on("create-room", data => {
    const roomId = clean(data?.roomId, "PV824991");

    if (!rooms.has(roomId)) {
      rooms.set(roomId, makeRoom(roomId));
    }

    socket.emit("room-created", {
      roomId
    });
  });

  socket.on("join-room", data => {
    const roomId = clean(data?.roomId, "PV824991");
    const userId = clean(data?.userId);

    if (!userId) {
      socket.emit("room-error", "User ID missing");
      return;
    }

    const room = getRoom(roomId);

    if (room.banned.has(userId)) {
      socket.emit("room-error", "You are banned from this room.");
      return;
    }

    if (socket.roomId) {
      socket.leave(socket.roomId);
    }

    socket.roomId = roomId;
    socket.userId = userId;

    let user = room.users.get(userId);

    const isFirstUser = room.users.size === 0;

    if (!user) {
      user = {
        userId,
        name: clean(data?.name, "Pawan"),
        dp: clean(data?.dp, ""),
        socketId: socket.id,
        seatNo: null,
        micOn: false,
        speakerOn: true,
        isHost: isFirstUser,
        isAdmin: isFirstUser
      };

      room.users.set(userId, user);
    } else {
      user.socketId = socket.id;
      user.name = clean(data?.name, user.name);
      user.dp = clean(data?.dp, user.dp);
    }

    socket.join(roomId);

    if (user.isHost && !user.seatNo) {
      room.seats[0].userId = user.userId;
      user.seatNo = 1;
    }

    if (!user.seatNo && room.users.size > 1) {
      const freeSeat = firstFreeSeat(room, 2);

      if (freeSeat) {
        room.seats[freeSeat - 1].userId = user.userId;
        user.seatNo = freeSeat;
      }
    }

    socket.emit("room-joined", {
      room: roomState(room),
      myUserId: user.userId,
      mySocketId: socket.id
    });

    socket.to(roomId).emit("user-joined", publicUser(user));

    broadcastRoom(room);
  });

  socket.on("update-profile", data => {
    if (!socket.roomId || !socket.userId) return;

    const room = rooms.get(socket.roomId);
    if (!room) return;

    const user = room.users.get(socket.userId);
    if (!user) return;

    if (data?.name !== undefined) {
      user.name = clean(data.name, user.name);
    }

    if (data?.dp !== undefined) {
      user.dp = clean(data.dp, user.dp);
    }

    broadcastRoom(room);
  });

  socket.on("take-seat", data => {
    if (!socket.roomId || !socket.userId) return;

    const room = rooms.get(socket.roomId);
    const user = findUser(room, socket.userId);

    if (!room || !user) return;

    const seatNo = Number(data?.seatNo);

    if (seatNo === user.seatNo) {
      removeFromSeat(room, user);
      broadcastRoom(room);
      return;
    }

    if (seatNo < 1 || seatNo > MAX_SEATS) return;

    if (seatNo === 1 && !user.isHost) {
      socket.emit("room-error", "Seat 1 is for the host.");
      return;
    }

    if (room.seats[seatNo - 1].userId) {
      socket.emit("room-error", "This seat is already occupied.");
      return;
    }

    removeFromSeat(room, user);

    room.seats[seatNo - 1].userId = user.userId;
    user.seatNo = seatNo;

    broadcastRoom(room);
  });

  socket.on("leave-seat", () => {
    if (!socket.roomId || !socket.userId) return;

    const room = rooms.get(socket.roomId);
    const user = findUser(room, socket.userId);

    if (!room || !user || user.isHost) return;

    removeFromSeat(room, user);

    broadcastRoom(room);
  });

  socket.on("mic-toggle", data => {
    if (!socket.roomId || !socket.userId) return;

    const room = rooms.get(socket.roomId);
    const user = findUser(room, socket.userId);

    if (!room || !user) return;

    user.micOn = !!data?.micOn;

    io.to(room.roomId).emit("user-mic", {
      userId: user.userId,
      micOn: user.micOn
    });

    broadcastRoom(room);
  });

  socket.on("speaker-toggle", data => {
    if (!socket.roomId || !socket.userId) return;

    const room = rooms.get(socket.roomId);
    const user = findUser(room, socket.userId);

    if (!room || !user) return;

    user.speakerOn = !!data?.speakerOn;

    socket.emit("speaker-state", {
      speakerOn: user.speakerOn
    });
  });

  socket.on("send-message", data => {
    if (!socket.roomId || !socket.userId) return;

    const room = rooms.get(socket.roomId);
    const user = findUser(room, socket.userId);

    if (!room || !user) return;

    const message = clean(data?.message);

    if (!message) return;

    io.to(room.roomId).emit("room-message", {
      userId: user.userId,
      name: user.name,
      dp: user.dp,
      message,
      time: Date.now()
    });
  });

  socket.on("change-room-name", data => {
    if (!socket.roomId || !canAdmin(roomSafe(socket))) return;

    const room = rooms.get(socket.roomId);
    if (!room) return;

    const name = clean(data?.roomName);

    if (name) {
      room.roomName = name;
      broadcastRoom(room);
    }
  });

  socket.on("make-admin", data => {
    if (!socket.roomId || !canAdmin(roomSafe(socket))) return;

    const room = rooms.get(socket.roomId);
    if (!room) return;

    const target = findUser(room, clean(data?.userId));

    if (!target) return;

    target.isAdmin = true;

    broadcastRoom(room);
  });

  socket.on("remove-admin", data => {
    if (!socket.roomId || !canAdmin(roomSafe(socket))) return;

    const room = rooms.get(socket.roomId);
    if (!room) return;

    const target = findUser(room, clean(data?.userId));

    if (!target || target.isHost) return;

    target.isAdmin = false;

    broadcastRoom(room);
  });

  socket.on("kick-user", data => {
    if (!socket.roomId || !canAdmin(roomSafe(socket))) return;

    const room = rooms.get(socket.roomId);
    if (!room) return;

    const target = findUser(room, clean(data?.userId));

    if (!target || target.isHost) return;

    const targetSocket = io.sockets.sockets.get(target.socketId);

    if (targetSocket) {
      targetSocket.emit("kicked", "You were kicked from the room.");
      targetSocket.leave(room.roomId);
      targetSocket.roomId = null;
    }

    removeFromSeat(room, target);
    room.users.delete(target.userId);

    broadcastRoom(room);
  });

  socket.on("ban-user", data => {
    if (!socket.roomId || !canAdmin(roomSafe(socket))) return;

    const room = rooms.get(socket.roomId);
    if (!room) return;

    const target = findUser(room, clean(data?.userId));

    if (!target || target.isHost) return;

    room.banned.add(target.userId);

    const targetSocket = io.sockets.sockets.get(target.socketId);

    if (targetSocket) {
      targetSocket.emit("kicked", "You were banned from this room.");
      targetSocket.leave(room.roomId);
      targetSocket.roomId = null;
    }

    removeFromSeat(room, target);
    room.users.delete(target.userId);

    broadcastRoom(room);
  });

  socket.on("send-gift", data => {
    if (!socket.roomId || !socket.userId) return;

    const room = rooms.get(socket.roomId);
    const from = findUser(room, socket.userId);
    const to = findUser(room, clean(data?.toUserId));

    if (!room || !from || !to) return;

    io.to(room.roomId).emit("gift-event", {
      fromUserId: from.userId,
      fromName: from.name,
      toUserId: to.userId,
      toName: to.name,
      gift: clean(data?.gift, "Gift"),
      amount: Number(data?.amount || 0)
    });
  });

  // WebRTC signaling
  socket.on("webrtc-offer", data => {
    if (!data?.targetSocketId || !data?.offer) return;

    io.to(data.targetSocketId).emit("webrtc-offer", {
      fromSocketId: socket.id,
      offer: data.offer
    });
  });

  socket.on("webrtc-answer", data => {
    if (!data?.targetSocketId || !data?.answer) return;

    io.to(data.targetSocketId).emit("webrtc-answer", {
      fromSocketId: socket.id,
      answer: data.answer
    });
  });

  socket.on("webrtc-ice-candidate", data => {
    if (!data?.targetSocketId || !data?.candidate) return;

    io.to(data.targetSocketId).emit("webrtc-ice-candidate", {
      fromSocketId: socket.id,
      candidate: data.candidate
    });
  });

  socket.on("disconnect", () => {
    const roomId = socket.roomId;
    const userId = socket.userId;

    if (!roomId || !userId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const user = room.users.get(userId);

    if (!user || user.socketId !== socket.id) return;

    const wasHost = user.isHost;

    removeFromSeat(room, user);
    room.users.delete(userId);

    socket.to(roomId).emit("user-left", {
      userId,
      socketId: socket.id
    });

    if (wasHost && room.users.size) {
      promoteHost(room);
    }

    if (room.users.size === 0) {
      rooms.delete(roomId);
      return;
    }

    broadcastRoom(room);
  });
});

function roomSafe(socket) {
  return socket;
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`PawanVoice server running on port ${PORT}`);
});
