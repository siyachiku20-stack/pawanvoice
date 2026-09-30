const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Room structure
const rooms = {};

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      seats: Array(9).fill(null),
      users: {},
      gifts: []
    };
  }

  return rooms[roomId];
}

function roomData(room) {
  return {
    id: room.id,
    seats: room.seats,
    users: Object.values(room.users),
    gifts: room.gifts
  };
}

io.on("connection", socket => {

  // JOIN ROOM
  socket.on("joinRoom", data => {
    const roomId = String(data.roomId || "main");
    const userId = String(data.userId || socket.id);
    const name = String(data.name || "Guest");

    const room = getRoom(roomId);

    // Already joined
    if (room.users[userId]) {
      socket.emit("roomError", {
        message: "User already joined"
      });
      return;
    }

    // Find empty seat
    const seatIndex = room.seats.findIndex(seat => seat === null);

    if (seatIndex === -1) {
      socket.emit("roomError", {
        message: "All 9 seats are full"
      });
      return;
    }

    room.users[userId] = {
      userId,
      name,
      socketId: socket.id,
      seat: seatIndex + 1
    };

    room.seats[seatIndex] = userId;

    socket.join(roomId);

    socket.data.roomId = roomId;
    socket.data.userId = userId;

    io.to(roomId).emit("roomUpdated", roomData(room));

    socket.emit("joinedRoom", {
      room: roomData(room),
      user: room.users[userId]
    });
  });


  // LEAVE ROOM
  socket.on("leaveRoom", () => {
    removeUser(socket);
  });


  // SELECT SEAT
  socket.on("selectSeat", data => {

    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms[roomId];

    if (!room || !room.users[userId]) return;

    const newSeat = Number(data.seat);

    if (newSeat < 1 || newSeat > 9) return;

    const targetIndex = newSeat - 1;

    // Seat occupied
    if (
      room.seats[targetIndex] !== null &&
      room.seats[targetIndex] !== userId
    ) {
      socket.emit("roomError", {
        message: "This seat is already occupied"
      });
      return;
    }

    const oldSeat = room.users[userId].seat;

    room.seats[oldSeat - 1] = null;

    room.seats[targetIndex] = userId;

    room.users[userId].seat = newSeat;

    io.to(roomId).emit("roomUpdated", roomData(room));
  });


  // SEND GIFT
  socket.on("sendGift", data => {

    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    if (!roomId || !userId) return;

    const room = rooms[roomId];

    if (!room || !room.users[userId]) return;

    const sender = room.users[userId];

    const gift = {
      id: Date.now(),
      senderId: sender.userId,
      senderName: sender.name,
      giftId: String(data.giftId || "rose"),
      giftName: String(data.giftName || "Rose"),
      amount: Number(data.amount || 1),
      time: new Date().toISOString()
    };

    room.gifts.push(gift);

    // Keep last 100 gifts
    if (room.gifts.length > 100) {
      room.gifts.shift();
    }

    io.to(roomId).emit("giftReceived", gift);
  });


  // ROOM STATE REQUEST
  socket.on("getRoom", data => {

    const roomId = String(data.roomId || "main");

    const room = getRoom(roomId);

    socket.emit("roomUpdated", roomData(room));
  });


  // DISCONNECT
  socket.on("disconnect", () => {
    removeUser(socket);
  });

});


function removeUser(socket) {

  const roomId = socket.data.roomId;
  const userId = socket.data.userId;

  if (!roomId || !userId) return;

  const room = rooms[roomId];

  if (!room || !room.users[userId]) return;

  const user = room.users[userId];

  // Remove seat
  if (
    user.seat >= 1 &&
    user.seat <= 9 &&
    room.seats[user.seat - 1] === userId
  ) {
    room.seats[user.seat - 1] = null;
  }

  delete room.users[userId];

  socket.leave(roomId);

  io.to(roomId).emit("roomUpdated", roomData(room));

  // Delete empty room
  if (Object.keys(room.users).length === 0) {
    delete rooms[roomId];
  }
}


// Simple test page
app.get("/", (req, res) => {
  res.send(`
    <h1>Voice Chat App Server</h1>
    <p>Server is running.</p>
    <p>Socket.IO room system active.</p>
  `);
});


server.listen(PORT, () => {
  console.log("--------------------------------");
  console.log("Voice Chat Server Started");
  console.log("Port:", PORT);
  console.log("--------------------------------");
});
