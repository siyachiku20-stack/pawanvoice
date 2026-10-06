const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// --------------------------------------------------
// EXPRESS
// --------------------------------------------------

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve index.html, room.html and other files
app.use(express.static(__dirname, { extensions: ["html"] }));

// --------------------------------------------------
// BASIC ROUTES
// --------------------------------------------------

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
    seats: 9,
    rooms: Object.keys(rooms).length,
    users: Object.keys(userSockets).length,
    time: new Date().toISOString(),
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    seats: 9,
    rooms: Object.keys(rooms).length,
    users: Object.keys(userSockets).length,
  });
});

// --------------------------------------------------
// SOCKET.IO
// --------------------------------------------------

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

// --------------------------------------------------
// MEMORY DATA
// --------------------------------------------------

const rooms = {};
const userSockets = {};
const socketUsers = {};

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function cleanId(value) {
  return String(value || "").trim();
}

function safeText(value, fallback = "") {
  const text = String(value ?? "").trim();

  if (!text) return fallback;

  return text.slice(0, 500);
}

function now() {
  return Date.now();
}

function getRoom(roomId, initialData = {}) {
  roomId = cleanId(roomId);

  if (!roomId) return null;

  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,

      name:
        safeText(
          initialData.roomName ||
            initialData.name ||
            initialData.title,
          "PawanVoice Room"
        ),

      roomName:
        safeText(
          initialData.roomName ||
            initialData.name ||
            initialData.title,
          "PawanVoice Room"
        ),

      dp:
        safeText(
          initialData.dp ||
            initialData.roomDp ||
            initialData.ownerDp,
          "https://i.pravatar.cc/300?img=12"
        ),

      category: safeText(initialData.category, "General"),

      ownerId:
        cleanId(
          initialData.ownerId ||
            initialData.userId
        ) || "",

      owner:
        safeText(
          initialData.owner ||
            initialData.name,
          "Room Owner"
        ),

      ownerDp:
        safeText(
          initialData.ownerDp ||
            initialData.dp,
          "https://i.pravatar.cc/300?img=12"
        ),

      seats: Array(9).fill(null),

      users: {},

      messages: [],

      gifts: [],

      createdAt:
        Number(initialData.createdAt) || now(),

      updatedAt: now(),
    };
  }

  return rooms[roomId];
}

function getUserFromSocket(socket) {
  const userId = socketUsers[socket.id];

  if (!userId) return null;

  return {
    userId,
    socketId: socket.id,
  };
}

function getRoomUserCount(room) {
  if (!room || !room.users) return 0;

  return Object.keys(room.users).length;
}

function makeUser(data = {}, socket) {
  const userId =
    cleanId(data.userId) ||
    cleanId(data.id) ||
    cleanId(socketUsers[socket.id]) ||
    cleanId(socket.id);

  return {
    userId,

    name:
      safeText(
        data.name ||
          data.username,
        "Guest"
      ),

    dp:
      safeText(
        data.dp ||
          data.avatar ||
          data.photoURL,
        "https://i.pravatar.cc/150?img=12"
      ),

    gender:
      safeText(data.gender, "Male"),

    level:
      Number(data.level) || 1,

    exp:
      Number(data.exp) || 0,

    vipLevel:
      Number(data.vipLevel) || 0,

    coins:
      Number(data.coins) || 0,

    diamonds:
      Number(data.diamonds) || 0,

    following:
      Number(data.following) || 0,

    followers:
      Number(data.followers) || 0,

    socketId: socket.id,

    joinedAt: now(),

    muted: false,

    micOn: false,

    seatIndex: null,
  };
}

function publicUser(user) {
  if (!user) return null;

  return {
    userId: user.userId,
    name: user.name,
    dp: user.dp,
    gender: user.gender,
    level: user.level,
    exp: user.exp,
    vipLevel: user.vipLevel,
    coins: user.coins,
    diamonds: user.diamonds,
    following: user.following,
    followers: user.followers,
    socketId: user.socketId,
    joinedAt: user.joinedAt,
    muted: !!user.muted,
    micOn: !!user.micOn,
    seatIndex:
      user.seatIndex === null
        ? null
        : user.seatIndex,
  };
}

function normalizeSeats(room) {
  const result = Array(9).fill(null);

  for (let i = 0; i < 9; i++) {
    const seat = room.seats[i];

    if (!seat) continue;

    if (typeof seat === "string") {
      const user = room.users[seat];

      if (user) {
        result[i] = publicUser({
          ...user,
          seatIndex: i,
        });
      }

      continue;
    }

    if (typeof seat === "object") {
      const userId = cleanId(
        seat.userId ||
          seat.id ||
          seat.uid
      );

      const user = room.users[userId];

      if (user) {
        result[i] = publicUser({
          ...user,
          ...seat,
          userId,
          seatIndex: i,
        });
      } else {
        result[i] = {
          ...seat,
          userId,
          seatIndex: i,
        };
      }
    }
  }

  return result;
}

function publicRoom(room) {
  return {
    id: room.id,

    name: room.name,

    roomName: room.roomName,

    dp: room.dp,

    category: room.category,

    ownerId: room.ownerId,

    owner: room.owner,

    ownerDp: room.ownerDp,

    seats: normalizeSeats(room),

    users: Object.fromEntries(
      Object.entries(room.users || {}).map(
        ([id, user]) => [id, publicUser(user)]
      )
    ),

    members: Object.fromEntries(
      Object.entries(room.users || {}).map(
        ([id, user]) => [id, publicUser(user)]
      )
    ),

    userCount: getRoomUserCount(room),

    gifts: room.gifts || [],

    messages: room.messages || [],

    createdAt: room.createdAt,

    updatedAt: room.updatedAt,
  };
}

function broadcastRoom(roomId) {
  const room = rooms[roomId];

  if (!room) return;

  room.updatedAt = now();

  const data = publicRoom(room);

  io.to(roomId).emit("room-state", data);
  io.to(roomId).emit("roomState", data);
  io.to(roomId).emit("room-updated", data);
}

function findUserSocket(userId) {
  const socketId = userSockets[cleanId(userId)];

  if (!socketId) return null;

  return io.sockets.sockets.get(socketId) || null;
}

function isRoomOwner(socket, room) {
  const user = getUserFromSocket(socket);

  if (!user || !room) return false;

  return (
    cleanId(user.userId) ===
    cleanId(room.ownerId)
  );
}

function removeUserFromRoom(socket, roomId) {
  const room = rooms[roomId];

  if (!room) return null;

  const userId = socketUsers[socket.id];

  if (!userId) return null;

  const user = room.users[userId];

  if (!user) return null;

  let seatIndex = user.seatIndex;

  if (
    seatIndex === null ||
    seatIndex === undefined
  ) {
    seatIndex = room.seats.findIndex(
      (seat) => {
        if (!seat) return false;

        if (typeof seat === "string") {
          return seat === userId;
        }

        return (
          cleanId(
            seat.userId ||
              seat.id ||
              seat.uid
          ) === userId
        );
      }
    );
  }

  if (
    seatIndex >= 0 &&
    seatIndex < 9
  ) {
    room.seats[seatIndex] = null;
  }

  delete room.users[userId];

  return {
    userId,
    user,
    seatIndex:
      seatIndex >= 0
        ? seatIndex
        : null,
  };
}

function leaveEveryRoom(socket) {
  const joinedRooms = Array.from(
    socket.rooms
  ).filter(
    (roomId) => roomId !== socket.id
  );

  joinedRooms.forEach((roomId) => {
    const removed =
      removeUserFromRoom(
        socket,
        roomId
      );

    if (!removed) return;

    socket.leave(roomId);

    io.to(roomId).emit(
      "user-left",
      {
        userId: removed.userId,
        name: removed.user.name,
        seatIndex: removed.seatIndex,
      }
    );

    io.to(roomId).emit(
      "user-entry",
      {
        type: "leave",
        userId: removed.userId,
        name: removed.user.name,
      }
    );

    broadcastRoom(roomId);
  });
}

// --------------------------------------------------
// CONNECTION
// --------------------------------------------------

io.on("connection", (socket) => {
  console.log(
    "Socket connected:",
    socket.id
  );

  // -----------------------------------------------
  // REGISTER USER
  // -----------------------------------------------

  socket.on(
    "register-user",
    (data = {}) => {
      const user = makeUser(
        data,
        socket
      );

      const oldSocketId =
        userSockets[user.userId];

      if (
        oldSocketId &&
        oldSocketId !== socket.id
      ) {
        const oldSocket =
          io.sockets.sockets.get(
            oldSocketId
          );

        if (oldSocket) {
          oldSocket.emit(
            "profile-updated",
            {
              ...publicUser(user),
              socketId: socket.id,
            }
          );
        }
      }

      userSockets[user.userId] =
        socket.id;

      socketUsers[socket.id] =
        user.userId;

      socket.data.userId =
        user.userId;

      socket.emit(
        "profile-updated",
        publicUser(user)
      );

      console.log(
        "User registered:",
        user.userId
      );
    }
  );

  // -----------------------------------------------
  // CREATE ROOM
  // -----------------------------------------------

  socket.on(
    "create-room",
    (data = {}, callback) => {
      try {
        const userId =
          cleanId(
            data.ownerId ||
              data.userId ||
              socketUsers[socket.id]
          ) || cleanId(socket.id);

        const roomId =
          cleanId(
            data.roomId ||
              data.id
          ) || userId;

        const room =
          getRoom(
            roomId,
            {
              ...data,
              ownerId: userId,
              userId,
            }
          );

        if (!room.ownerId) {
          room.ownerId = userId;
        }

        room.name =
          safeText(
            data.roomName ||
              data.name,
            room.name
          );

        room.roomName =
          room.name;

        room.category =
          safeText(
            data.category,
            room.category
          );

        room.owner =
          safeText(
            data.owner ||
              data.name,
            room.owner ||
              "Room Owner"
          );

        room.ownerDp =
          safeText(
            data.ownerDp ||
              data.dp,
            room.ownerDp
          );

        room.dp =
          safeText(
            data.dp ||
              data.roomDp,
            room.dp
          );

        room.updatedAt =
          now();

        socket.join(roomId);

        socket.emit(
          "room-created",
          publicRoom(room)
        );

        callback?.({
          ok: true,
          room: publicRoom(room),
        });
      } catch (error) {
        console.error(
          "create-room error:",
          error
        );

        callback?.({
          ok: false,
          error: "Room create failed",
        });
      }
    }
  );

  // -----------------------------------------------
  // JOIN ROOM
  // -----------------------------------------------

  socket.on(
    "join-room",
    (data = {}, callback) => {
      try {
        const roomId =
          cleanId(
            data.roomId ||
              data.id ||
              data.room
          );

        if (!roomId) {
          socket.emit(
            "room-error",
            {
              message:
                "Room ID missing",
            }
          );

          callback?.({
            ok: false,
            error:
              "Room ID missing",
          });

          return;
        }

        const userId =
          cleanId(
            data.userId ||
              data.id ||
              socketUsers[socket.id]
          ) || cleanId(socket.id);

        // Register user automatically
        if (
          !socketUsers[socket.id] ||
          socketUsers[socket.id] !== userId
        ) {
          socketUsers[socket.id] =
            userId;

          userSockets[userId] =
            socket.id;

          socket.data.userId =
            userId;
        }

        const room =
          getRoom(
            roomId,
            data
          );

        // If client supplies room metadata,
        // use it without deleting anything.
        if (data.roomName || data.name) {
          room.name =
            safeText(
              data.roomName ||
                data.name,
              room.name
            );

          room.roomName =
            room.name;
        }

        if (data.dp) {
          room.dp =
            safeText(
              data.dp,
              room.dp
            );
        }

        if (data.category) {
          room.category =
            safeText(
              data.category,
              room.category
            );
        }

        if (
          data.ownerId &&
          !room.ownerId
        ) {
          room.ownerId =
            cleanId(
              data.ownerId
            );
        }

        const user =
          makeUser(
            {
              ...data,
              userId,
            },
            socket
          );

        // Preserve previous user data
        // when reconnecting.
        if (room.users[userId]) {
          const old =
            room.users[userId];

          room.users[userId] = {
            ...old,
            ...user,
            socketId: socket.id,
            joinedAt:
              old.joinedAt ||
              now(),
          };
        } else {
          room.users[userId] =
            user;
        }

        socket.join(roomId);

        // Default owner
        if (!room.ownerId) {
          room.ownerId =
            userId;

          room.owner =
            user.name;

          room.ownerDp =
            user.dp;

          room.dp =
            room.dp ||
            user.dp;
        }

        // Put owner on seat 0 automatically
        if (
          cleanId(room.ownerId) ===
            userId &&
          room.seats[0] === null
        ) {
          room.seats[0] =
            userId;

          room.users[userId]
            .seatIndex = 0;
        }

        room.updatedAt =
          now();

        const state =
          publicRoom(room);

        socket.emit(
          "room-joined",
          state
        );

        socket.emit(
          "room-state",
          state
        );

        socket.emit(
          "roomState",
          state
        );

        socket.to(roomId).emit(
          "user-joined",
          publicUser(
            room.users[userId]
          )
        );

        socket.to(roomId).emit(
          "user-entry",
          {
            type: "join",
            userId,
            name: user.name,
            dp: user.dp,
          }
        );

        broadcastRoom(roomId);

        callback?.({
          ok: true,
          room: state,
        });

        console.log(
          `User ${userId} joined room ${roomId}`
        );
      } catch (error) {
        console.error(
          "join-room error:",
          error
        );

        socket.emit(
          "room-error",
          {
            message:
              "Unable to join room",
          }
        );

        callback?.({
          ok: false,
          error:
            "Unable to join room",
        });
      }
    }
  );

  // -----------------------------------------------
  // LEAVE ROOM
  // -----------------------------------------------

  socket.on(
    "leave-room",
    (data = {}) => {
      const roomId =
        cleanId(
          data.roomId ||
            data.room ||
            data.id
        );

      if (!roomId) return;

      const removed =
        removeUserFromRoom(
          socket,
          roomId
        );

      if (!removed) return;

      socket.leave(roomId);

      socket.to(roomId).emit(
        "user-left",
        {
          userId:
            removed.userId,
          name:
            removed.user.name,
          seatIndex:
            removed.seatIndex,
        }
      );

      broadcastRoom(roomId);
    }
  );

  // -----------------------------------------------
  // TAKE SEAT
  // -----------------------------------------------

  socket.on(
    "take-seat",
    (data = {}, callback) => {
      const roomId =
        cleanId(
          data.roomId ||
            data.room
        );

      let seatIndex =
        Number(
          data.seatIndex ??
            data.seat ??
            data.index
        );

      const userId =
        cleanId(
          data.userId ||
            socketUsers[socket.id]
        );

      if (!roomId) {
        callback?.({
          ok: false,
          error:
            "Room ID missing",
        });

        return;
      }

      if (
        !Number.isInteger(
          seatIndex
        ) ||
        seatIndex < 0 ||
        seatIndex > 8
      ) {
        callback?.({
          ok: false,
          error:
            "Invalid seat",
        });

        socket.emit(
          "seat-error",
          {
            message:
              "Invalid seat",
          }
        );

        return;
      }

      const room =
        rooms[roomId];

      if (!room) {
        callback?.({
          ok: false,
          error:
            "Room not found",
        });

        return;
      }

      if (
        !room.users[userId]
      ) {
        callback?.({
          ok: false,
          error:
            "Join room first",
        });

        return;
      }

      // Seat occupied
      if (
        room.seats[seatIndex] !==
        null
      ) {
        const occupied =
          room.seats[
            seatIndex
          ];

        const occupiedId =
          typeof occupied ===
          "string"
            ? occupied
            : cleanId(
                occupied.userId ||
                  occupied.id ||
                  occupied.uid
              );

        if (
          occupiedId !== userId
        ) {
          socket.emit(
            "seat-taken",
            {
              seatIndex,
              userId:
                occupiedId,
            }
          );

          callback?.({
            ok: false,
            error:
              "Seat already taken",
          });

          return;
        }
      }

      // Remove user from old seat
      const oldSeat =
        room.seats.findIndex(
          (seat) => {
            if (!seat) return false;

            const id =
              typeof seat ===
              "string"
                ? seat
                : cleanId(
                    seat.userId ||
                      seat.id ||
                      seat.uid
                  );

            return id === userId;
          }
        );

      if (
        oldSeat >= 0 &&
        oldSeat !== seatIndex
      ) {
        room.seats[oldSeat] =
          null;
      }

      room.seats[seatIndex] =
        userId;

      room.users[userId]
        .seatIndex =
        seatIndex;

      room.updatedAt =
        now();

      io.to(roomId).emit(
        "seat-update",
        {
          seatIndex,
          user:
            publicUser(
              room.users[userId]
            ),
        }
      );

      broadcastRoom(roomId);

      callback?.({
        ok: true,
        seatIndex,
      });
    }
  );

  // -----------------------------------------------
  // LEAVE SEAT
  // -----------------------------------------------

  socket.on(
    "leave-seat",
    (data = {}, callback) => {
      const roomId =
        cleanId(
          data.roomId ||
            data.room
        );

      const userId =
        cleanId(
          data.userId ||
            socketUsers[socket.id]
        );

      const room =
        rooms[roomId];

      if (!room) {
        callback?.({
          ok: false,
          error:
            "Room not found",
        });

        return;
      }

      const user =
        room.users[userId];

      if (!user) {
        callback?.({
          ok: false,
          error:
            "User not found",
        });

        return;
      }

      let index =
        Number(
          data.seatIndex ??
            user.seatIndex
        );

      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index > 8
      ) {
        index =
          room.seats.findIndex(
            (seat) =>
              typeof seat ===
                "string"
                ? seat === userId
                : seat &&
                  cleanId(
                    seat.userId ||
                      seat.id ||
                      seat.uid
                  ) === userId
          );
      }

      if (
        index >= 0 &&
        index < 9
      ) {
        room.seats[index] =
          null;
      }

      user.seatIndex =
        null;

      user.micOn =
        false;

      broadcastRoom(roomId);

      callback?.({
        ok: true,
      });
    }
  );

  // -----------------------------------------------
  // MIC STATUS
  // -----------------------------------------------

  socket.on(
    "mic-status",
    (data = {}) => {
      const roomId =
        cleanId(
          data.roomId ||
            data.room
        );

      const userId =
        cleanId(
          data.userId ||
            socketUsers[socket.id]
        );

      const room =
        rooms[roomId];

      if (!room) return;

      const user =
        room.users[userId];

      if (!user) return;

      user.micOn =
        !!(
          data.micOn ??
          data.enabled ??
          data.on
        );

      // Muted user cannot turn mic on
      if (user.muted) {
        user.micOn = false;
      }

      io.to(roomId).emit(
        "mic-status",
        {
          roomId,
          userId,
          micOn: user.micOn,
          enabled:
            user.micOn,
        }
      );

      broadcastRoom(roomId);
    }
  );

  // -----------------------------------------------
  // CHAT
  // -----------------------------------------------

  socket.on(
    "chat",
    (data = {}) => {
      sendChat(
        socket,
        data
      );
    }
  );

  socket.on(
    "room-chat",
    (data = {}) => {
      sendChat(
        socket,
        data
      );
    }
  );

  function sendChat(
    currentSocket,
    data
  ) {
    const roomId =
      cleanId(
        data.roomId ||
          data.room
      );

    if (!roomId) return;

    const room =
      rooms[roomId];

    if (!room) return;

    const userId =
      cleanId(
        data.userId ||
          socketUsers[
            currentSocket.id
          ]
      );

    const user =
      room.users[userId];

    if (!user) return;

    if (user.muted) {
      currentSocket.emit(
        "chat-error",
        {
          message:
            "You are muted",
        }
      );

      return;
    }

    const message =
      safeText(
        data.message ||
          data.text ||
          data.content
      );

    if (!message) return;

    const chat = {
      id:
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,

      userId,

      name: user.name,

      dp: user.dp,

      text: message,

      message,

      time: now(),
    };

    room.messages.push(
      chat
    );

    // Keep last 100 messages
    if (
      room.messages.length >
      100
    ) {
      room.messages =
        room.messages.slice(
          -100
        );
    }

    io.to(roomId).emit(
      "chat",
      chat
    );

    io.to(roomId).emit(
      "room-chat",
      chat
    );
  }

  // -----------------------------------------------
  // EMOJI
  // -----------------------------------------------

  socket.on(
    "emoji",
    (data = {}) => {
      const roomId =
        cleanId(
          data.roomId ||
            data.room
        );

      const room =
        rooms[roomId];

      if (!room) return;

      const userId =
        cleanId(
          data.userId ||
            socketUsers[socket.id]
        );

      const user =
        room.users[userId];

      if (!user) return;

      const emoji =
        safeText(
          data.emoji ||
            data.value
        );

      if (!emoji) return;

      io.to(roomId).emit(
        "emoji",
        {
          userId,
          name: user.name,
          emoji,
          time: now(),
        }
      );
    }
  );

  // -----------------------------------------------
  // GIFT
  // -----------------------------------------------

  socket.on(
    "gift",
    (data = {}) => {
      const roomId =
        cleanId(
          data.roomId ||
            data.room
        );

      const room =
        rooms[roomId];

      if (!room) return;

      const fromUserId =
        cleanId(
          data.fromUserId ||
            data.senderId ||
            data.userId ||
            socketUsers[socket.id]
        );

      const fromUser =
        room.users[
          fromUserId
        ];

      if (!fromUser) return;

      const gift = {
        id:
          `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,

        fromUserId,

        fromName:
          fromUser.name,

        fromDp:
          fromUser.dp,

        toUserId:
          cleanId(
            data.toUserId ||
              data.receiverId
          ),

        toName:
          safeText(
            data.toName,
            ""
          ),

        giftId:
          safeText(
            data.giftId ||
              data.id,
            "gift"
          ),

        giftName:
          safeText(
            data.giftName ||
              data.name,
            "Gift"
          ),

        giftImage:
          safeText(
            data.giftImage ||
              data.image,
            ""
          ),

        quantity:
          Number(
            data.quantity
          ) || 1,

        time: now(),
      };

      room.gifts.push(
        gift
      );

      if (
        room.gifts.length >
        100
      ) {
        room.gifts =
          room.gifts.slice(
            -100
          );
      }

      io.to(roomId).emit(
        "gift",
        gift
      );
    }
  );

  // -----------------------------------------------
  // FOLLOW USER
  // -----------------------------------------------

  socket.on(
    "follow-user",
    (data = {}, callback) => {
      const roomId =
        cleanId(
          data.roomId ||
            data.room
        );

      const room =
        rooms[roomId];

      if (!room) {
        callback?.({
          ok: false,
          error:
            "Room not found",
        });

        return;
      }

      const fromUserId =
        cleanId(
          data.fromUserId ||
            data.userId ||
            socketUsers[socket.id]
        );

      const toUserId =
        cleanId(
          data.toUserId ||
            data.targetUserId
        );

      const target =
        room.users[
          toUserId
        ];

      if (!target) {
        callback?.({
          ok: false,
          error:
            "User not found",
        });

        return;
      }

      // Realtime notification
      const targetSocket =
        findUserSocket(
          toUserId
        );

      targetSocket?.emit(
        "follow-received",
        {
          fromUserId,
          toUserId,
        }
      );

      callback?.({
        ok: true,
      });
    }
  );

  // -----------------------------------------------
  // CP REQUEST
  // -----------------------------------------------

  socket.on(
    "cp-request",
    (data = {}, callback) => {
      const roomId =
        cleanId(
          data.roomId ||
            data.room
        );

      const room =
        rooms[roomId];

      if (!room) {
        callback?.({
          ok: false,
          error:
            "Room not found",
        });

        return;
      }

      const fromUserId =
        cleanId(
          data.fromUserId ||
            data.userId ||
            socketUsers[socket.id]
        );

      const toUserId =
        cleanId(
          data.toUserId ||
            data.targetUserId
        );

      const target =
        room.users[
          toUserId
        ];

      if (!target) {
        callback?.({
          ok: false,
          error:
            "User not found",
        });

        return;
      }

      const request = {
        fromUserId,
        toUserId,
        roomId,
        time: now(),
      };

      const targetSocket =
        findUserSocket(
          toUserId
        );

      targetSocket?.emit(
        "cp-request",
        request
      );

      callback?.({
        ok: true,
      });
    }
  );

  // -----------------------------------------------
  // KICK USER
  // -----------------------------------------------

  socket.on(
    "kick-user",
    (data = {}, callback) => {
      const roomId =
        cleanId(
          data.roomId ||
            data.room
        );

      const room =
        rooms[roomId];

      if (!room) {
        callback?.({
          ok: false,
          error:
            "Room not found",
        });

        return;
      }

      if (
        !isRoomOwner(
          socket,
          room
        )
      ) {
        callback?.({
          ok: false,
          error:
            "Only room owner can kick",
        });

        return;
      }

      const targetUserId =
        cleanId(
          data.targetUserId ||
            data.userId ||
            data.targetId
        );

      if (
        !targetUserId
      ) {
        callback?.({
          ok: false,
          error:
            "Target user missing",
        });

        return;
      }

      if (
        targetUserId ===
        cleanId(room.ownerId)
      ) {
        callback?.({
          ok: false,
          error:
            "Owner cannot be kicked",
        });

        return;
      }

      const target =
        room.users[
          targetUserId
        ];

      if (!target) {
        callback?.({
          ok: false,
          error:
            "User not found",
        });

        return;
      }

      let seatIndex =
        target.seatIndex;

      if (
        seatIndex === null ||
        seatIndex === undefined
      ) {
        seatIndex =
          room.seats.findIndex(
            (seat) => {
              if (!seat)
                return false;

              const id =
                typeof seat ===
                "string"
                  ? seat
                  : cleanId(
                      seat.userId ||
                        seat.id ||
                        seat.uid
                    );

              return (
                id ===
                targetUserId
              );
            }
          );
      }

      if (
        seatIndex >= 0
      ) {
        room.seats[
          seatIndex
        ] = null;
      }

      delete room.users[
        targetUserId
      ];

      const targetSocket =
        findUserSocket(
          targetUserId
        );

      if (targetSocket) {
        targetSocket.leave(
          roomId
        );

        targetSocket.emit(
          "user-kicked",
          {
            roomId,
            userId:
              targetUserId,
            reason:
              safeText(
                data.reason,
                "Removed by room owner"
              ),
          }
        );

        targetSocket.emit(
          "kicked",
          {
            roomId,
            userId:
              targetUserId,
          }
        );
      }

      io.to(roomId).emit(
        "user-left",
        {
          userId:
            targetUserId,
          name:
            target.name,
          seatIndex,
          reason: "kick",
        }
      );

      broadcastRoom(
        roomId
      );

      callback?.({
        ok: true,
      });
    }
  );

  // -----------------------------------------------
  // MUTE USER
  // -----------------------------------------------

  socket.on(
    "mute-user",
    (data = {}, callback) => {
      const roomId =
        cleanId(
          data.roomId ||
            data.room
        );

      const room =
        rooms[roomId];

      if (!room) {
        callback?.({
          ok: false,
          error:
            "Room not found",
        });

        return;
      }

      if (
        !isRoomOwner(
          socket,
          room
        )
      ) {
        callback?.({
          ok: false,
          error:
            "Only room owner can mute",
        });

        return;
      }

      const targetUserId =
        cleanId(
          data.targetUserId ||
            data.userId ||
            data.targetId
        );

      const target =
        room.users[
          targetUserId
        ];

      if (!target) {
        callback?.({
          ok: false,
          error:
            "User not found",
        });

        return;
      }

      target.muted =
        data.muted !==
        undefined
          ? !!data.muted
          : !target.muted;

      if (target.muted) {
        target.micOn =
          false;
      }

      const targetSocket =
        findUserSocket(
          targetUserId
        );

      if (targetSocket) {
        targetSocket.emit(
          "force-mute",
          {
            roomId,
            userId:
              targetUserId,
            muted:
              target.muted,
          }
        );
      }

      io.to(roomId).emit(
        "mic-status",
        {
          roomId,
          userId:
            targetUserId,
          micOn:
            target.micOn,
          muted:
            target.muted,
        }
      );

      broadcastRoom(
        roomId
      );

      callback?.({
        ok: true,
        muted:
          target.muted,
      });
    }
  );

  // -----------------------------------------------
  // PROFILE UPDATE
  // -----------------------------------------------

  socket.on(
    "profile-updated",
    (data = {}) => {
      const userId =
        cleanId(
          data.userId ||
            socketUsers[socket.id]
        );

      if (!userId) return;

      userSockets[userId] =
        socket.id;

      socketUsers[socket.id] =
        userId;

      // Update all rooms
      Object.entries(
        rooms
      ).forEach(
        ([
          roomId,
          room,
        ]) => {
          const user =
            room.users[
              userId
            ];

          if (!user) return;

          if (data.name) {
            user.name =
              safeText(
                data.name,
                user.name
              );
          }

          if (data.dp) {
            user.dp =
              safeText(
                data.dp,
                user.dp
              );
          }

          if (data.gender) {
            user.gender =
              safeText(
                data.gender,
                user.gender
              );
          }

          if (
            data.level !==
            undefined
          ) {
            user.level =
              Number(
                data.level
              ) ||
              user.level;
          }

          if (
            data.exp !==
            undefined
          ) {
            user.exp =
              Number(
                data.exp
              ) ||
              user.exp;
          }

          if (
            data.vipLevel !==
            undefined
          ) {
            user.vipLevel =
              Number(
                data.vipLevel
              ) ||
              0;
          }

          if (
            data.coins !==
            undefined
          ) {
            user.coins =
              Number(
                data.coins
              ) ||
              0;
          }

          if (
            data.diamonds !==
            undefined
          ) {
            user.diamonds =
              Number(
                data.diamonds
              ) ||
              0;
          }

          if (
            userId ===
            room.ownerId
          ) {
            room.owner =
              user.name;

            room.ownerDp =
              user.dp;
          }

          broadcastRoom(
            roomId
          );
        }
      );

      socket.emit(
        "profile-updated",
        data
      );
    }
  );

  // Alternative profile event
  socket.on(
    "update-profile",
    (data = {}) => {
      socket.emit(
        "profile-updated",
        data
      );

      io.emit(
        "profile-updated",
        data
      );
    }
  );

  // -----------------------------------------------
  // WEBRTC OFFER
  // -----------------------------------------------

  socket.on(
    "webrtc-offer",
    (data = {}) => {
      relayWebRTC(
        socket,
        "webrtc-offer",
        data
      );
    }
  );

  // -----------------------------------------------
  // WEBRTC ANSWER
  // -----------------------------------------------

  socket.on(
    "webrtc-answer",
    (data = {}) => {
      relayWebRTC(
        socket,
        "webrtc-answer",
        data
      );
    }
  );

  // -----------------------------------------------
  // WEBRTC ICE
  // -----------------------------------------------

  socket.on(
    "webrtc-ice",
    (data = {}) => {
      relayWebRTC(
        socket,
        "webrtc-ice",
        data
      );
    }
  );

  function relayWebRTC(
    senderSocket,
    eventName,
    data
  ) {
    const targetUserId =
      cleanId(
        data.targetUserId ||
          data.toUserId ||
          data.remoteUserId ||
          data.to
      );

    if (!targetUserId) {
      return;
    }

    const targetSocket =
      findUserSocket(
        targetUserId
      );

    if (!targetSocket) {
      return;
    }

    const fromUserId =
      cleanId(
        data.fromUserId ||
          data.senderId ||
          socketUsers[
            senderSocket.id
          ]
      );

    targetSocket.emit(
      eventName,
      {
        ...data,
        fromUserId,
        senderId:
          fromUserId,
      }
    );
  }

  // -----------------------------------------------
  // DISCONNECT
  // -----------------------------------------------

  socket.on(
    "disconnect",
    (reason) => {
      console.log(
        "Socket disconnected:",
        socket.id,
        reason
      );

      const userId =
        socketUsers[
          socket.id
        ];

      leaveEveryRoom(
        socket
      );

      if (
        userId &&
        userSockets[
          userId
        ] === socket.id
      ) {
        delete userSockets[
          userId
        ];
      }

      delete socketUsers[
        socket.id
      ];
    }
  );
});

// --------------------------------------------------
// CLEAN EMPTY ROOMS
// --------------------------------------------------

setInterval(
  () => {
    const currentTime =
      now();

    Object.entries(
      rooms
    ).forEach(
      ([
        roomId,
        room,
      ]) => {
        const userCount =
          getRoomUserCount(
            room
          );

        // Keep room data for a while so
        // Firebase-created rooms don't disappear
        // immediately after everyone leaves.
        const emptyFor =
          currentTime -
          Number(
            room.updatedAt ||
              room.createdAt ||
              currentTime
          );

        // 6 hours
        if (
          userCount === 0 &&
          emptyFor >
            6 * 60 * 60 * 1000
        ) {
          delete rooms[
            roomId
          ];

          console.log(
            "Removed empty room:",
            roomId
          );
        }
      }
    );
  },
  10 * 60 * 1000
);

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "===================================="
    );

    console.log(
      " PawanVoice Room Server"
    );

    console.log(
      ` Port: ${PORT}`
    );

    console.log(
      " Socket.IO: ON"
    );

    console.log(
      " Seats: 9"
    );

    console.log(
      ` Root: http://localhost:${PORT}`
    );

    console.log(
      "===================================="
    );
  }
);

// --------------------------------------------------
// ERROR HANDLING
// --------------------------------------------------

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "Uncaught Exception:",
      error
    );
  }
);

process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "Unhandled Rejection:",
      error
    );
  }
);
