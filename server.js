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

const rooms = new Map();

function createRoom(roomId, roomName = "PawanVoice Room") {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      roomId,
      roomName,
      users: new Map(),
      admins: new Set(),
      bannedUsers: new Set()
    });
  }

  return rooms.get(roomId);
}

function publicUser(user) {
  if (!user) return null;

  return {
    userId: user.userId,
    name: user.name,
    dp: user.dp || "",
    seatNo: user.seatNo || null,
    micOn: !!user.micOn,
    speakerOn: user.speakerOn !== false,
    isHost: !!user.isHost,
    isAdmin: !!user.isAdmin
  };
}

function publicRoom(room) {
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    users: Array.from(room.users.values()).map(publicUser)
  };
}

function broadcastRoom(room) {
  io.to(room.roomId).emit("roomUpdated", publicRoom(room));
}

app.get("/", (req, res) => {
  res.send(`
    <h2>PawanVoice Server</h2>
    <p>Server is running.</p>
    <p>Socket.IO + WebRTC signaling active.</p>
  `);
});

io.on("connection", (socket) => {

  // -----------------------------
  // CREATE ROOM
  // -----------------------------
  socket.on("createRoom", ({ roomId, roomName, user }) => {
    if (!roomId || !user || !user.userId) return;

    const room = createRoom(
      roomId,
      roomName || "PawanVoice Room"
    );

    if (room.users.size >= 9) {
      socket.emit("roomError", "Room is full");
      return;
    }

    const newUser = {
      userId: user.userId,
      name: user.name || "User",
      dp: user.dp || "",
      seatNo: 1,
      micOn: false,
      speakerOn: true,
      isHost: true,
      isAdmin: true,
      socketId: socket.id
    };

    room.users.set(user.userId, newUser);
    room.admins.add(user.userId);

    socket.join(roomId);

    socket.data.roomId = roomId;
    socket.data.userId = user.userId;

    socket.emit("joinedRoom", publicRoom(room));
    broadcastRoom(room);
  });


  // -----------------------------
  // JOIN ROOM
  // -----------------------------
  socket.on("joinRoom", ({ roomId, user }) => {
    if (!roomId || !user || !user.userId) return;

    const room = rooms.get(roomId);

    if (!room) {
      socket.emit("roomError", "Room not found");
      return;
    }

    if (room.bannedUsers.has(user.userId)) {
      socket.emit("roomError", "You are banned from this room");
      return;
    }

    if (room.users.size >= 9) {
      socket.emit("roomError", "Room is full");
      return;
    }

    if (room.users.has(user.userId)) {
      const oldUser = room.users.get(user.userId);
      oldUser.socketId = socket.id;

      socket.join(roomId);

      socket.data.roomId = roomId;
      socket.data.userId = user.userId;

      socket.emit("joinedRoom", publicRoom(room));
      broadcastRoom(room);
      return;
    }

    const isFirstUser = room.users.size === 0;

    const newUser = {
      userId: user.userId,
      name: user.name || "User",
      dp: user.dp || "",
      seatNo: isFirstUser ? 1 : null,
      micOn: false,
      speakerOn: true,
      isHost: isFirstUser,
      isAdmin: isFirstUser,
      socketId: socket.id
    };

    room.users.set(user.userId, newUser);

    if (isFirstUser) {
      room.admins.add(user.userId);
    }

    socket.join(roomId);

    socket.data.roomId = roomId;
    socket.data.userId = user.userId;

    // Existing users need to know about new peer
    socket.to(roomId).emit("webrtc-peer-joined", {
      userId: user.userId
    });

    socket.emit("joinedRoom", publicRoom(room));

    broadcastRoom(room);
  });


  // -----------------------------
  // GET ROOMS
  // -----------------------------
  socket.on("getRooms", () => {
    const list = Array.from(rooms.values()).map((room) => ({
      roomId: room.roomId,
      roomName: room.roomName,
      userCount: room.users.size,
      host: Array.from(room.users.values()).find(u => u.isHost)?.name || "Host",
      dp: Array.from(room.users.values()).find(u => u.isHost)?.dp || ""
    }));

    socket.emit("roomsList", list);
  });


  // -----------------------------
  // TAKE / LEAVE SEAT
  // -----------------------------
  socket.on("selectSeat", ({ seatNo }) => {
    const room = rooms.get(socket.data.roomId);
    const userId = socket.data.userId;

    if (!room) return;

    const user = room.users.get(userId);

    if (!user) return;

    if (seatNo < 1 || seatNo > 9) return;

    const occupied = Array.from(room.users.values())
      .find(u => u.seatNo === seatNo);

    if (occupied && occupied.userId !== userId) {
      socket.emit("roomError", "Seat already occupied");
      return;
    }

    user.seatNo = seatNo;

    broadcastRoom(room);
  });


  socket.on("leaveSeat", () => {
    const room = rooms.get(socket.data.roomId);
    const user = room?.users.get(socket.data.userId);

    if (!user) return;

    user.seatNo = null;

    broadcastRoom(room);
  });


  // -----------------------------
  // MIC
  // -----------------------------
  socket.on("micToggle", ({ micOn }) => {
    const room = rooms.get(socket.data.roomId);
    const user = room?.users.get(socket.data.userId);

    if (!user) return;

    user.micOn = !!micOn;

    broadcastRoom(room);
  });


  // -----------------------------
  // SPEAKER
  // -----------------------------
  socket.on("speakerToggle", ({ speakerOn }) => {
    const room = rooms.get(socket.data.roomId);
    const user = room?.users.get(socket.data.userId);

    if (!user) return;

    user.speakerOn = !!speakerOn;

    broadcastRoom(room);
  });


  // ==================================================
  // WEBRTC SIGNALING
  // ==================================================

  socket.on("webrtc-offer", ({ targetUserId, offer }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;

    const target = room.users.get(targetUserId);
    if (!target) return;

    io.to(target.socketId).emit("webrtc-offer", {
      fromUserId: socket.data.userId,
      offer
    });
  });


  socket.on("webrtc-answer", ({ targetUserId, answer }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;

    const target = room.users.get(targetUserId);
    if (!target) return;

    io.to(target.socketId).emit("webrtc-answer", {
      fromUserId: socket.data.userId,
      answer
    });
  });


  socket.on("webrtc-ice-candidate", ({ targetUserId, candidate }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;

    const target = room.users.get(targetUserId);
    if (!target) return;

    io.to(target.socketId).emit("webrtc-ice-candidate", {
      fromUserId: socket.data.userId,
      candidate
    });
  });


  // -----------------------------
  // CHAT
  // -----------------------------
  socket.on("sendMessage", ({ message }) => {
    const room = rooms.get(socket.data.roomId);
    const user = room?.users.get(socket.data.userId);

    if (!room || !user || !message) return;

    io.to(room.roomId).emit("messageReceived", {
      userId: user.userId,
      name: user.name,
      dp: user.dp,
      message: String(message).slice(0, 500),
      time: Date.now()
    });
  });


  // -----------------------------
  // ROOM NAME
  // -----------------------------
  socket.on("changeRoomName", ({ roomName }) => {
    const room = rooms.get(socket.data.roomId);
    const user = room?.users.get(socket.data.userId);

    if (!room || !user) return;

    if (!user.isHost && !user.isAdmin) return;

    room.roomName = String(roomName || "PawanVoice Room")
      .slice(0, 60);

    broadcastRoom(room);
  });


  // -----------------------------
  // MAKE ADMIN
  // -----------------------------
  socket.on("makeAdmin", ({ targetUserId }) => {
    const room = rooms.get(socket.data.roomId);
    const user = room?.users.get(socket.data.userId);

    if (!room || !user || !user.isHost) return;

    const target = room.users.get(targetUserId);

    if (!target) return;

    target.isAdmin = true;
    room.admins.add(targetUserId);

    broadcastRoom(room);
  });


  // -----------------------------
  // REMOVE ADMIN
  // -----------------------------
  socket.on("removeAdmin", ({ targetUserId }) => {
    const room = rooms.get(socket.data.roomId);
    const user = room?.users.get(socket.data.userId);

    if (!room || !user || !user.isHost) return;

    const target = room.users.get(targetUserId);

    if (!target || target.isHost) return;

    target.isAdmin = false;
    room.admins.delete(targetUserId);

    broadcastRoom(room);
  });


  // -----------------------------
  // KICK
  // -----------------------------
  socket.on("kickUser", ({ targetUserId }) => {
    const room = rooms.get(socket.data.roomId);
    const user = room?.users.get(socket.data.userId);

    if (!room || !user || (!user.isHost && !user.isAdmin)) return;

    const target = room.users.get(targetUserId);

    if (!target || target.isHost) return;

    io.to(target.socketId).emit("kicked");

    room.users.delete(targetUserId);

    broadcastRoom(room);
  });


  // -----------------------------
  // BAN
  // -----------------------------
  socket.on("banUser", ({ targetUserId }) => {
    const room = rooms.get(socket.data.roomId);
    const user = room?.users.get(socket.data.userId);

    if (!room || !user || !user.isHost) return;

    const target = room.users.get(targetUserId);

    if (!target || target.isHost) return;

    room.bannedUsers.add(targetUserId);

    io.to(target.socketId).emit("banned");

    room.users.delete(targetUserId);

    broadcastRoom(room);
  });


  // -----------------------------
  // DISCONNECT
  // -----------------------------
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms.get(roomId);

    if (!room) return;

    const user = room.users.get(userId);

    if (user && user.socketId === socket.id) {
      room.users.delete(userId);
    }

    if (room.users.size === 0) {
      rooms.delete(roomId);
    } else {
      // Give host to another user if host left
      const hasHost = Array.from(room.users.values())
        .some(u => u.isHost);

      if (!hasHost) {
        const newHost = Array.from(room.users.values())[0];

        if (newHost) {
          newHost.isHost = true;
          newHost.isAdmin = true;
          room.admins.add(newHost.userId);
        }
      }

      broadcastRoom(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`PawanVoice server running on port ${PORT}`);
});
