const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

const PORT = process.env.PORT || 3000;

/* =========================================================
   EXPRESS
========================================================= */

app.use(express.json({ limit: "2mb" }));

/*
   IMPORTANT:
   index.html, room.html etc. must be in the SAME
   folder as this server.js
*/
app.use(express.static(__dirname));

/* =========================================================
   PAGE ROUTES
========================================================= */

app.get("/", (req, res) => {
  const file = path.join(__dirname, "index.html");

  if (fs.existsSync(file)) {
    return res.sendFile(file);
  }

  res.status(404).send("index.html not found");
});

app.get("/index.html", (req, res) => {
  const file = path.join(__dirname, "index.html");

  if (fs.existsSync(file)) {
    return res.sendFile(file);
  }

  res.status(404).send("index.html not found");
});

app.get("/room.html", (req, res) => {
  const file = path.join(__dirname, "room.html");

  if (fs.existsSync(file)) {
    return res.sendFile(file);
  }

  res.status(404).send(
    "room.html not found. Put room.html in the same folder as server.js"
  );
});

/*
   Optional pages.
   If these files exist, they will work automatically.
*/
app.get("/profile.html", (req, res) => {
  const file = path.join(__dirname, "profile.html");

  if (fs.existsSync(file)) {
    return res.sendFile(file);
  }

  res.status(404).send("profile.html not found");
});

app.get("/chat.html", (req, res) => {
  const file = path.join(__dirname, "chat.html");

  if (fs.existsSync(file)) {
    return res.sendFile(file);
  }

  res.status(404).send("chat.html not found");
});

/* =========================================================
   RTC CONFIG
========================================================= */

app.get("/rtc-config", (req, res) => {
  const iceServers = [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "stun:stun1.l.google.com:19302"
    }
  ];

  /*
     Optional TURN server.

     Render Environment Variables:

     TURN_URL
     TURN_USERNAME
     TURN_CREDENTIAL
  */

  if (
    process.env.TURN_URL &&
    process.env.TURN_USERNAME &&
    process.env.TURN_CREDENTIAL
  ) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }

  res.json({
    iceServers
  });
});

/* =========================================================
   ROOM STORAGE
========================================================= */

const rooms = Object.create(null);

/*
   Maximum seats
*/
const MAX_SEATS = 9;

/*
   User ID starts from 100052.

   NOTE:
   This in-memory counter resets if Render restarts.
   For truly permanent global IDs, Firebase/database
   allocation should be used later.
*/
let nextUserId = 100052;

/* =========================================================
   CREATE ROOM
========================================================= */

function createRoom(roomId, ownerData = {}) {
  return {
    id: roomId,

    name:
      cleanText(ownerData.roomName, 100) ||
      cleanText(ownerData.name, 60) ||
      "PawanVoice Room",

    dp:
      cleanText(ownerData.roomDp, 1000) ||
      cleanText(ownerData.dp, 1000) ||
      "",

    category:
      cleanText(ownerData.category, 50) ||
      "General",

    ownerId:
      cleanText(ownerData.userId, 100) ||
      "",

    ownerName:
      cleanText(ownerData.name, 60) ||
      "Guest",

    ownerDp:
      cleanText(ownerData.dp, 1000) ||
      "",

    familyId:
      cleanText(ownerData.familyId, 100),

    familyName:
      cleanText(ownerData.familyName, 100),

    frameId:
      cleanText(ownerData.frameId, 100),

    frameName:
      cleanText(ownerData.frameName, 100),

    seats: Array(MAX_SEATS).fill(null),

    users: Object.create(null),

    gifts: [],

    chat: [],

    exp: 0,

    createdAt: Date.now(),

    lastActivity: Date.now()
  };
}

function getRoom(roomId, ownerData = {}) {
  if (!rooms[roomId]) {
    rooms[roomId] =
      createRoom(roomId, ownerData);
  }

  return rooms[roomId];
}

/* =========================================================
   HELPERS
========================================================= */

function cleanText(value, maxLength = 500) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value)
    .trim()
    .slice(0, maxLength);
}

function cleanUserId(value) {
  return cleanText(value, 100);
}

function getNewUserId() {
  const id = String(nextUserId);

  nextUserId++;

  return id;
}

function findUserSocket(room, userId) {
  if (!room || !userId) {
    return null;
  }

  const user =
    room.users[userId];

  if (!user) {
    return null;
  }

  return user.socketId || null;
}

function findSeatOfUser(room, userId) {
  if (!room) {
    return -1;
  }

  for (
    let i = 0;
    i < room.seats.length;
    i++
  ) {
    const seat =
      room.seats[i];

    if (
      seat &&
      seat.userId === userId
    ) {
      return i;
    }
  }

  return -1;
}

function isHost(room, userId) {
  if (!room || !userId) {
    return false;
  }

  return (
    room.ownerId === userId ||
    !!(
      room.seats[0] &&
      room.seats[0].userId === userId
    )
  );
}

function removeUserFromSeats(
  room,
  userId
) {
  if (!room) {
    return;
  }

  for (
    let i = 0;
    i < room.seats.length;
    i++
  ) {
    if (
      room.seats[i] &&
      room.seats[i].userId === userId
    ) {
      room.seats[i] = null;
    }
  }

  if (room.users[userId]) {
    room.users[userId].seatIndex = null;
  }
}

function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    userId: user.userId,

    name:
      user.name || "Guest",

    dp:
      user.dp || "",

    level:
      Number(user.level || 1),

    exp:
      Number(user.exp || 0),

    gender:
      user.gender || "",

    vip:
      user.vip || "",

    vipLevel:
      Number(user.vipLevel || 0),

    followers:
      Number(user.followers || 0),

    following:
      Number(user.following || 0),

    visitors:
      Number(user.visitors || 0),

    coins:
      Number(user.coins || 0),

    diamonds:
      Number(user.diamonds || 0),

    familyId:
      user.familyId || "",

    familyName:
      user.familyName || "",

    frameId:
      user.frameId || "",

    frameName:
      user.frameName || "",

    cpUserId:
      user.cpUserId || "",

    cpUserName:
      user.cpUserName || "",

    micEnabled:
      user.micEnabled !== false,

    seatIndex:
      typeof user.seatIndex === "number"
        ? user.seatIndex
        : null
  };
}

function roomData(room) {
  if (!room) {
    return null;
  }

  const users = {};

  Object.keys(room.users)
    .forEach((userId) => {
      users[userId] =
        publicUser(
          room.users[userId]
        );
    });

  const seats =
    room.seats.map((seat) => {
      if (!seat) {
        return null;
      }

      return publicUser(seat);
    });

  return {
    id: room.id,

    name:
      room.name,

    dp:
      room.dp,

    category:
      room.category,

    ownerId:
      room.ownerId,

    ownerName:
      room.ownerName,

    ownerDp:
      room.ownerDp,

    familyId:
      room.familyId,

    familyName:
      room.familyName,

    frameId:
      room.frameId,

    frameName:
      room.frameName,

    seats,

    users,

    gifts:
      room.gifts.slice(-100),

    chat:
      room.chat.slice(-100),

    exp:
      room.exp || 0,

    createdAt:
      room.createdAt
  };
}

/* =========================================================
   ROOM LIST
========================================================= */

function roomSummary(room) {
  if (!room) {
    return null;
  }

  const users =
    Object.keys(room.users)
      .length;

  const seatedUsers =
    room.seats.filter(Boolean)
      .length;

  return {
    id: room.id,

    roomId: room.id,

    name:
      room.name,

    roomName:
      room.name,

    dp:
      room.dp,

    roomDp:
      room.dp,

    category:
      room.category,

    ownerId:
      room.ownerId,

    ownerName:
      room.ownerName,

    ownerDp:
      room.ownerDp,

    familyId:
      room.familyId,

    familyName:
      room.familyName,

    frameId:
      room.frameId,

    frameName:
      room.frameName,

    users,

    members:
      users,

    seatedUsers,

    seats:
      MAX_SEATS,

    exp:
      room.exp || 0,

    createdAt:
      room.createdAt
  };
}

function getRoomList() {
  return Object.values(rooms)
    .filter(
      room =>
        room &&
        Object.keys(room.users)
          .length > 0
    )
    .map(roomSummary)
    .sort(
      (a, b) =>
        b.users - a.users ||
        b.exp - a.exp ||
        b.createdAt - a.createdAt
    );
}

/* =========================================================
   ROOM LIST API
========================================================= */

app.get("/api/rooms", (req, res) => {
  res.json({
    success: true,
    count: getRoomList().length,
    rooms: getRoomList()
  });
});

app.get("/api/rooms/:roomId", (req, res) => {
  const roomId =
    cleanText(
      req.params.roomId,
      100
    );

  const room =
    rooms[roomId];

  if (!room) {
    return res.status(404).json({
      success: false,
      message: "Room not found"
    });
  }

  res.json({
    success: true,
    room: roomSummary(room)
  });
});

/* =========================================================
   STATUS API
========================================================= */

app.get("/api/status", (req, res) => {
  res.json({
    app:
      "PawanVoice Room Server",

    status:
      "running",

    socketIO:
      true,

    webRTC:
      true,

    seats:
      MAX_SEATS,

    rooms:
      Object.keys(rooms).length,

    onlineUsers:
      Object.values(rooms)
        .reduce(
          (total, room) =>
            total +
            Object.keys(room.users)
              .length,
          0
        )
  });
});

/* =========================================================
   SEND ROOM STATE
========================================================= */

function sendRoomState(roomId) {
  const room =
    rooms[roomId];

  if (!room) {
    return;
  }

  const state =
    roomData(room);

  io.to(roomId).emit(
    "room-state",
    state
  );

  /*
     Compatibility with old room.html
  */
  io.to(roomId).emit(
    "roomState",
    state
  );

  const count =
    Object.keys(room.users)
      .length;

  /*
     New client
  */
  io.to(roomId).emit(
    "room-count",
    count
  );

  /*
     Compatibility object format
  */
  io.to(roomId).emit(
    "room-member-count",
    {
      count
    }
  );
}

/* =========================================================
   LEAVE CURRENT ROOM
========================================================= */

function leaveCurrentRoom(
  socket,
  reason = "leave"
) {
  const roomId =
    socket.data.roomId;

  const userId =
    socket.data.userId;

  if (
    !roomId ||
    !userId
  ) {
    return;
  }

  const room =
    rooms[roomId];

  if (!room) {
    socket.data.roomId = null;
    socket.data.userId = null;

    return;
  }

  const leavingUser =
    room.users[userId];

  const leavingName =
    leavingUser
      ? leavingUser.name
      : "User";

  removeUserFromSeats(
    room,
    userId
  );

  delete room.users[userId];

  socket.leave(roomId);

  io.to(roomId).emit(
    "user-left",
    {
      userId,
      name: leavingName,
      reason
    }
  );

  room.lastActivity =
    Date.now();

  if (
    Object.keys(room.users)
      .length === 0
  ) {
    delete rooms[roomId];
  } else {
    sendRoomState(roomId);
  }

  socket.data.roomId = null;
  socket.data.userId = null;
}

/* =========================================================
   SOCKET.IO
========================================================= */

io.on("connection", (socket) => {
  console.log(
    "Socket connected:",
    socket.id
  );

  /* =======================================================
     JOIN ROOM
  ======================================================= */

  socket.on(
    "join-room",
    (data = {}) => {
      try {
        let roomId =
          cleanText(
            data.roomId,
            100
          );

        /*
           If room ID is not supplied,
           use user ID.

           This gives:
           User 100052 -> Room 100052
        */
        const suppliedUserId =
          cleanUserId(
            data.userId
          );

        if (!roomId) {
          roomId =
            suppliedUserId ||
            "100052";
        }

        let userId =
          suppliedUserId;

        /*
           If no user ID exists,
           allocate one.
        */
        if (!userId) {
          userId =
            getNewUserId();
        }

        const name =
          cleanText(
            data.name,
            60
          ) ||
          "Guest";

        const dp =
          cleanText(
            data.dp,
            1000
          );

        const level =
          Math.max(
            1,
            Number(
              data.level || 1
            )
          );

        const exp =
          Math.max(
            0,
            Number(
              data.exp || 0
            )
          );

        /*
           If socket already has another room,
           leave it first.
        */
        if (socket.data.roomId) {
          leaveCurrentRoom(
            socket,
            "room-change"
          );
        }

        /*
           Create room with owner information.
        */
        const room =
          getRoom(
            roomId,
            {
              userId,
              name,
              dp,
              roomName:
                data.roomName,
              roomDp:
                data.roomDp,
              category:
                data.category,
              familyId:
                data.familyId,
              familyName:
                data.familyName,
              frameId:
                data.frameId,
              frameName:
                data.frameName
            }
          );

        /*
           Existing user?
        */
        let user =
          room.users[userId];

        if (!user) {
          user = {
            userId,

            name,

            dp,

            level,

            exp,

            gender:
              cleanText(
                data.gender,
                30
              ),

            vip:
              cleanText(
                data.vip,
                30
              ),

            vipLevel:
              Number(
                data.vipLevel || 0
              ),

            followers:
              Number(
                data.followers || 0
              ),

            following:
              Number(
                data.following || 0
              ),

            visitors:
              Number(
                data.visitors || 0
              ),

            coins:
              Number(
                data.coins || 0
              ),

            diamonds:
              Number(
                data.diamonds || 0
              ),

            familyId:
              cleanText(
                data.familyId,
                100
              ),

            familyName:
              cleanText(
                data.familyName,
                100
              ),

            frameId:
              cleanText(
                data.frameId,
                100
              ),

            frameName:
              cleanText(
                data.frameName,
                100
              ),

            cpUserId:
              cleanText(
                data.cpUserId,
                100
              ),

            cpUserName:
              cleanText(
                data.cpUserName,
                60
              ),

            socketId:
              socket.id,

            seatIndex:
              null,

            micEnabled:
              true,

            joinedAt:
              Date.now()
          };

          room.users[userId] =
            user;
        } else {
          /*
             Reconnect / profile update
          */
          user.name =
            name ||
            user.name;

          user.dp =
            dp ||
            user.dp;

          user.level =
            level ||
            user.level;

          user.exp =
            exp;

          user.gender =
            cleanText(
              data.gender,
              30
            ) ||
            user.gender;

          user.vip =
            cleanText(
              data.vip,
              30
            ) ||
            user.vip;

          user.vipLevel =
            Number(
              data.vipLevel ??
              user.vipLevel ??
              0
            );

          user.followers =
            Number(
              data.followers ??
              user.followers ??
              0
            );

          user.following =
            Number(
              data.following ??
              user.following ??
              0
            );

          user.visitors =
            Number(
              data.visitors ??
              user.visitors ??
              0
            );

          user.coins =
            Number(
              data.coins ??
              user.coins ??
              0
            );

          user.diamonds =
            Number(
              data.diamonds ??
              user.diamonds ??
              0
            );

          user.familyId =
            cleanText(
              data.familyId,
              100
            ) ||
            user.familyId;

          user.familyName =
            cleanText(
              data.familyName,
              100
            ) ||
            user.familyName;

          user.frameId =
            cleanText(
              data.frameId,
              100
            ) ||
            user.frameId;

          user.frameName =
            cleanText(
              data.frameName,
              100
            ) ||
            user.frameName;

          user.cpUserId =
            cleanText(
              data.cpUserId,
              100
            ) ||
            user.cpUserId;

          user.cpUserName =
            cleanText(
              data.cpUserName,
              60
            ) ||
            user.cpUserName;

          user.socketId =
            socket.id;

          user.micEnabled =
            true;
        }

        /*
           Save socket information.
        */
        socket.data.roomId =
          roomId;

        socket.data.userId =
          userId;

        socket.join(roomId);

        room.lastActivity =
          Date.now();

        /*
           FIRST USER / OWNER
        */
        const userCount =
          Object.keys(
            room.users
          ).length;

        if (
          userCount === 1 &&
          !room.ownerId
        ) {
          room.ownerId =
            userId;

          room.ownerName =
            name;

          room.ownerDp =
            dp;

          room.name =
            cleanText(
              data.roomName,
              100
            ) ||
            `${name}'s Room`;

          room.dp =
            cleanText(
              data.roomDp,
              1000
            ) ||
            dp;

          room.category =
            cleanText(
              data.category,
              50
            ) ||
            "General";

          room.familyId =
            cleanText(
              data.familyId,
              100
            );

          room.familyName =
            cleanText(
              data.familyName,
              100
            );

          room.frameId =
            cleanText(
              data.frameId,
              100
            );

          room.frameName =
            cleanText(
              data.frameName,
              100
            );
        }

        /*
           If this is an old room with no owner,
           first user becomes owner.
        */
        if (!room.ownerId) {
          room.ownerId =
            userId;

          room.ownerName =
            name;

          room.ownerDp =
            dp;
        }

        /*
           If owner reconnects,
           keep room name / DP synchronized.
        */
        if (
          room.ownerId ===
          userId
        ) {
          room.ownerName =
            name;

          room.ownerDp =
            dp;

          if (
            cleanText(
              data.roomName,
              100
            )
          ) {
            room.name =
              cleanText(
                data.roomName,
                100
              );
          }

          if (
            cleanText(
              data.roomDp,
              1000
            )
          ) {
            room.dp =
              cleanText(
                data.roomDp,
                1000
              );
          }

          if (
            cleanText(
              data.category,
              50
            )
          ) {
            room.category =
              cleanText(
                data.category,
                50
              );
          }

          room.familyId =
            cleanText(
              data.familyId,
              100
            ) ||
            room.familyId;

          room.familyName =
            cleanText(
              data.familyName,
              100
            ) ||
            room.familyName;

          room.frameId =
            cleanText(
              data.frameId,
              100
            ) ||
            room.frameId;

          room.frameName =
            cleanText(
              data.frameName,
              100
            ) ||
            room.frameName;
        }

        /*
           HOST automatically takes seat 1.
        */
        const ownerAlreadySeated =
          findSeatOfUser(
            room,
            room.ownerId
          );

        if (
          ownerAlreadySeated === -1 &&
          room.ownerId === userId &&
          !room.seats[0]
        ) {
          room.seats[0] =
            user;

          user.seatIndex =
            0;
        }

        /*
           Send state to joining user.
        */
        const state =
          roomData(room);

        socket.emit(
          "room-state",
          state
        );

        socket.emit(
          "roomState",
          state
        );

        socket.emit(
          "room-count",
          Object.keys(
            room.users
          ).length
        );

        /*
           Tell existing users.
        */
        socket.to(roomId).emit(
          "user-entry",
          publicUser(user)
        );

        /*
           Full state for everyone.
        */
        sendRoomState(roomId);

        console.log(
          `${name} (${userId}) joined room ${roomId}`
        );
      } catch (error) {
        console.error(
          "join-room error:",
          error
        );
      }
    }
  );

  /* =======================================================
     TAKE SEAT
  ======================================================= */

  socket.on(
    "take-seat",
    (data = {}) => {
      try {
        const roomId =
          cleanText(
            data.roomId ||
            socket.data.roomId,
            100
          );

        const userId =
          cleanUserId(
            data.userId ||
            socket.data.userId
          );

        const seatIndex =
          Number(
            data.seatIndex
          );

        const room =
          rooms[roomId];

        if (!room || !userId) {
          return;
        }

        if (
          !Number.isInteger(
            seatIndex
          ) ||
          seatIndex < 0 ||
          seatIndex >= MAX_SEATS
        ) {
          socket.emit(
            "action-error",
            {
              message:
                "Invalid seat."
            }
          );

          return;
        }

        const user =
          room.users[userId];

        if (!user) {
          return;
        }

        /*
           Seat 1 / index 0
           belongs to host.
        */
        if (
          seatIndex === 0 &&
          room.ownerId !== userId
        ) {
          socket.emit(
            "action-error",
            {
              message:
                "Only room host can use seat 1."
            }
          );

          return;
        }

        const currentSeat =
          room.seats[seatIndex];

        if (
          currentSeat &&
          currentSeat.userId !== userId
        ) {
          socket.emit(
            "action-error",
            {
              message:
                "This seat is already occupied."
            }
          );

          return;
        }

        /*
           Remove previous seat.
        */
        removeUserFromSeats(
          room,
          userId
        );

        /*
           Occupy new seat.
        */
        room.seats[seatIndex] =
          user;

        user.seatIndex =
          seatIndex;

        user.micEnabled =
          true;

        room.lastActivity =
          Date.now();

        sendRoomState(
          roomId
        );

        /*
           New seat holder can start
           WebRTC from client.
        */
      } catch (error) {
        console.error(
          "take-seat error:",
          error
        );
      }
    }
  );

  /* =======================================================
     LEAVE SEAT ONLY
  ======================================================= */

  socket.on(
    "leave-seat",
    (data = {}) => {
      try {
        const roomId =
          cleanText(
            data.roomId ||
            socket.data.roomId,
            100
          );

        const userId =
          cleanUserId(
            data.userId ||
            socket.data.userId
          );

        const room =
          rooms[roomId];

        if (!room || !userId) {
          return;
        }

        /*
           Host cannot leave host seat
           without leaving room.
        */
        if (
          room.ownerId === userId
        ) {
          socket.emit(
            "action-error",
            {
              message:
                "Room owner cannot leave host seat."
            }
          );

          return;
        }

        removeUserFromSeats(
          room,
          userId
        );

        room.lastActivity =
          Date.now();

        sendRoomState(
          roomId
        );
      } catch (error) {
        console.error(
          "leave-seat error:",
          error
        );
      }
    }
  );

  /* =======================================================
     UPDATE USER PROFILE
  ======================================================= */

  socket.on(
    "update-profile",
    (data = {}) => {
      try {
        const roomId =
          cleanText(
            data.roomId ||
            socket.data.roomId,
            100
          );

        const userId =
          cleanUserId(
            data.userId ||
            socket.data.userId
          );

        const room =
          rooms[roomId];

        if (!room || !userId) {
          return;
        }

        const user =
          room.users[userId];

        if (!user) {
          return;
        }

        if (
          data.name !== undefined
        ) {
          user.name =
            cleanText(
              data.name,
              60
            ) ||
            user.name;
        }

        if (
          data.dp !== undefined
        ) {
          user.dp =
            cleanText(
              data.dp,
              1000
            );
        }

        if (
          data.level !== undefined
        ) {
          user.level =
            Math.max(
              1,
              Number(
                data.level || 1
              )
            );
        }

        if (
          data.exp !== undefined
        ) {
          user.exp =
            Math.max(
              0,
              Number(
                data.exp || 0
              )
            );
        }

        if (
          data.frameId !== undefined
        ) {
          user.frameId =
            cleanText(
              data.frameId,
              100
            );
        }

        if (
          data.frameName !== undefined
        ) {
          user.frameName =
            cleanText(
              data.frameName,
              100
            );
        }

        /*
           If owner changes name/DP,
           room follows owner.
        */
        if (
          room.ownerId ===
          userId
        ) {
          room.ownerName =
            user.name;

          room.ownerDp =
            user.dp;

          room.name =
            cleanText(
              data.roomName,
              100
            ) ||
            `${user.name}'s Room`;

          room.dp =
            cleanText(
              data.roomDp,
              1000
            ) ||
            user.dp;
        }

        /*
           Update seat object too.
        */
        const seatIndex =
          findSeatOfUser(
            room,
            userId
          );

        if (
          seatIndex >= 0
        ) {
          room.seats[
            seatIndex
          ] = user;
        }

        room.lastActivity =
          Date.now();

        sendRoomState(
          roomId
        );
      } catch (error) {
        console.error(
          "update-profile error:",
          error
        );
      }
    }
  );

  /* =======================================================
     CHAT
  ======================================================= */

  socket.on(
    "chat-message",
    (data = {}) => {
      try {
        const roomId =
          cleanText(
            data.roomId ||
            socket.data.roomId,
            100
          );

        const userId =
          cleanUserId(
            data.userId ||
            socket.data.userId
          );

        const room =
          rooms[roomId];

        if (!room || !userId) {
          return;
        }

        const user =
          room.users[userId];

        if (!user) {
          return;
        }

        const messageText =
          cleanText(
            data.text,
            500
          );

        if (!messageText) {
          return;
        }

        const message = {
          userId:
            user.userId,

          name:
            user.name,

          dp:
            user.dp,

          text:
            messageText,

          time:
            Date.now()
        };

        room.chat.push(
          message
        );

        if (
          room.chat.length > 100
        ) {
          room.chat =
            room.chat.slice(-100);
        }

        room.lastActivity =
          Date.now();

        io.to(roomId).emit(
          "chat-message",
          message
        );
      } catch (error) {
        console.error(
          "chat error:",
          error
        );
      }
    }
  );

  /* =======================================================
     MIC STATUS
  ======================================================= */

  socket.on(
    "mic-status",
    (data = {}) => {
      try {
        const roomId =
          cleanText(
            data.roomId ||
            socket.data.roomId,
            100
          );

        const userId =
          cleanUserId(
            data.userId ||
            socket.data.userId
          );

        const room =
          rooms[roomId];

        if (!room || !userId) {
          return;
        }

        const user =
          room.users[userId];

        if (!user) {
          return;
        }

        user.micEnabled =
          data.enabled !== false;

        const seatIndex =
          findSeatOfUser(
            room,
            userId
          );

        if (
          seatIndex >= 0
        ) {
          room.seats[
            seatIndex
          ] = user;
        }

        room.lastActivity =
          Date.now();

        sendRoomState(
          roomId
        );
      } catch (error) {
        console.error(
          "mic-status error:",
          error
        );
      }
    }
  );

  /* =======================================================
     SPEAKER STATUS
  ======================================================= */

  socket.on(
    "speaker-status",
    () => {
      /*
         Speaker is local/browser-side.
      */
    }
  );

  /* =======================================================
     SEND GIFT
  ======================================================= */

  socket.on(
    "send-gift",
    (data = {}) => {
      try {
        const roomId =
          cleanText(
            data.roomId ||
            socket.data.roomId,
            100
          );

        const room =
          rooms[roomId];

        if (!room) {
          return;
        }

        const fromUserId =
          cleanUserId(
            data.fromUserId ||
            socket.data.userId
          );

        const fromUser =
          room.users[
            fromUserId
          ];

        if (!fromUser) {
          return;
        }

        const toUserId =
          cleanUserId(
            data.toUserId
          );

        if (!toUserId) {
          return;
        }

        const toUser =
          room.users[
            toUserId
          ];

        const cost =
          Math.max(
            0,
            Number(
              data.cost || 0
            )
          );

        const gift = {
          id:
            cleanText(
              data.giftId,
              100
            ) ||
            `gift_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2, 8)}`,

          name:
            cleanText(
              data.giftName ||
              data.name,
              100
            ) ||
            "Gift",

          emoji:
            cleanText(
              data.giftEmoji ||
              data.emoji,
              20
            ) ||
            "🎁",

          cost,

          fromUserId,

          fromName:
            fromUser.name,

          toUserId,

          toName:
            toUser
              ? toUser.name
              : cleanText(
                  data.toName,
                  60
                ),

          time:
            Date.now()
        };

        room.gifts.push(
          gift
        );

        if (
          room.gifts.length > 100
        ) {
          room.gifts =
            room.gifts.slice(-100);
        }

        /*
           Room EXP:
           1 EXP per 10 coins.
        */
        room.exp +=
          Math.max(
            0,
            Math.floor(
              cost / 10
            )
          );

        room.lastActivity =
          Date.now();

        io.to(roomId).emit(
          "gift-received",
          gift
        );

        sendRoomState(
          roomId
        );
      } catch (error) {
        console.error(
          "send-gift error:",
          error
        );
      }
    }
  );

  /* =======================================================
     ADMIN KICK
  ======================================================= */

  socket.on(
    "admin-kick",
    (data = {}) => {
      try {
        const roomId =
          cleanText(
            data.roomId ||
            socket.data.roomId,
            100
          );

        const targetUserId =
          cleanUserId(
            data.targetUserId
          );

        const room =
          rooms[roomId];

        if (!room) {
          return;
        }

        const adminUserId =
          socket.data.userId;

        if (
          !isHost(
            room,
            adminUserId
          )
        ) {
          socket.emit(
            "action-error",
            {
              message:
                "Only room host can kick users."
            }
          );

          return;
        }

        if (
          !targetUserId ||
          targetUserId ===
            adminUserId
        ) {
          return;
        }

        const target =
          room.users[
            targetUserId
          ];

        if (!target) {
          return;
        }

        const targetSocketId =
          target.socketId;

        const targetName =
          target.name;

        removeUserFromSeats(
          room,
          targetUserId
        );

        delete room.users[
          targetUserId
        ];

        if (
          targetSocketId
        ) {
          const targetSocket =
            io.sockets.sockets.get(
              targetSocketId
            );

          if (targetSocket) {
            targetSocket.leave(
              roomId
            );

            targetSocket.data.roomId =
              null;

            targetSocket.data.userId =
              null;

            targetSocket.emit(
              "user-kicked",
              {
                roomId,

                userId:
                  targetUserId,

                message:
                  "You were removed from this room."
              }
            );
          }
        }

        io.to(roomId).emit(
          "user-left",
          {
            userId:
              targetUserId,

            name:
              targetName,

            reason:
              "kicked"
          }
        );

        room.lastActivity =
          Date.now();

        if (
          Object.keys(
            room.users
          ).length === 0
        ) {
          delete rooms[
            roomId
          ];
        } else {
          sendRoomState(
            roomId
          );
        }
      } catch (error) {
        console.error(
          "admin-kick error:",
          error
        );
      }
    }
  );

  /* =======================================================
     ADMIN MUTE
  ======================================================= */

  socket.on(
    "admin-mute",
    (data = {}) => {
      try {
        const roomId =
          cleanText(
            data.roomId ||
            socket.data.roomId,
            100
          );

        const targetUserId =
          cleanUserId(
            data.targetUserId
          );

        const room =
          rooms[roomId];

        if (!room) {
          return;
        }

        const adminUserId =
          socket.data.userId;

        if (
          !isHost(
            room,
            adminUserId
          )
        ) {
          socket.emit(
            "action-error",
            {
              message:
                "Only room host can mute users."
            }
          );

          return;
        }

        if (
          !targetUserId ||
          targetUserId ===
            adminUserId
        ) {
          return;
        }

        const target =
          room.users[
            targetUserId
          ];

        if (!target) {
          return;
        }

        target.micEnabled =
          false;

        const seatIndex =
          findSeatOfUser(
            room,
            targetUserId
          );

        if (
          seatIndex >= 0
        ) {
          room.seats[
            seatIndex
          ] = target;
        }

        const targetSocketId =
          target.socketId;

        if (
          targetSocketId
        ) {
          const targetSocket =
            io.sockets.sockets.get(
              targetSocketId
            );

          if (targetSocket) {
            targetSocket.emit(
              "user-muted",
              {
                roomId,

                userId:
                  targetUserId,

                muted:
                  true,

                message:
                  "Host muted your microphone."
              }
            );
          }
        }

        io.to(roomId).emit(
          "user-muted",
          {
            roomId,

            userId:
              targetUserId,

            muted:
              true
          }
        );

        room.lastActivity =
          Date.now();

        sendRoomState(
          roomId
        );
      } catch (error) {
        console.error(
          "admin-mute error:",
          error
        );
      }
    }
  );

  /* =======================================================
     WEBRTC OFFER
  ======================================================= */

  socket.on(
    "webrtc-offer",
    (data = {}) => {
      try {
        const roomId =
          cleanText(
            data.roomId ||
            socket.data.roomId,
            100
          );

        const fromUserId =
          socket.data.userId;

        const targetUserId =
          cleanUserId(
            data.to ||
            data.targetUserId
          );

        if (
          !roomId ||
          !fromUserId ||
          !targetUserId ||
          !data.offer
        ) {
          return;
        }

        const room =
          rooms[roomId];

        if (!room) {
          return;
        }

        if (
          !room.users[
            fromUserId
          ] ||
          !room.users[
            targetUserId
          ]
        ) {
          return;
        }

        const targetSocketId =
          findUserSocket(
            room,
            targetUserId
          );

        if (!targetSocketId) {
          return;
        }

        io.to(
          targetSocketId
        ).emit(
          "webrtc-offer",
          {
            from:
              fromUserId,

            offer:
              data.offer
          }
        );
      } catch (error) {
        console.error(
          "webrtc-offer error:",
          error
        );
      }
    }
  );

  /* =======================================================
     WEBRTC ANSWER
  ======================================================= */

  socket.on(
    "webrtc-answer",
    (data = {}) => {
      try {
        const roomId =
          cleanText(
            data.roomId ||
            socket.data.roomId,
            100
          );

        const fromUserId =
          socket.data.userId;

        const targetUserId =
          cleanUserId(
            data.to ||
            data.targetUserId
          );

        if (
          !roomId ||
          !fromUserId ||
          !targetUserId ||
          !data.answer
        ) {
          return;
        }

        const room =
          rooms[roomId];

        if (!room) {
          return;
        }

        if (
          !room.users[
            fromUserId
          ] ||
          !room.users[
            targetUserId
          ]
        ) {
          return;
        }

        const targetSocketId =
          findUserSocket(
            room,
            targetUserId
          );

        if (!targetSocketId) {
          return;
        }

        io.to(
          targetSocketId
        ).emit(
          "webrtc-answer",
          {
            from:
              fromUserId,

            answer:
              data.answer
          }
        );
      } catch (error) {
        console.error(
          "webrtc-answer error:",
          error
        );
      }
    }
  );

  /* =======================================================
     ICE CANDIDATE
  ======================================================= */

  socket.on(
    "ice-candidate",
    (data = {}) => {
      try {
        const roomId =
          cleanText(
            data.roomId ||
            socket.data.roomId,
            100
          );

        const fromUserId =
          socket.data.userId;

        const targetUserId =
          cleanUserId(
            data.to ||
            data.targetUserId
          );

        if (
          !roomId ||
          !fromUserId ||
          !targetUserId ||
          !data.candidate
        ) {
          return;
        }

        const room =
          rooms[roomId];

        if (!room) {
          return;
        }

        if (
          !room.users[
            fromUserId
          ] ||
          !room.users[
            targetUserId
          ]
        ) {
          return;
        }

        const targetSocketId =
          findUserSocket(
            room,
            targetUserId
          );

        if (!targetSocketId) {
          return;
        }

        io.to(
          targetSocketId
        ).emit(
          "ice-candidate",
          {
            from:
              fromUserId,

            candidate:
              data.candidate
          }
        );
      } catch (error) {
        console.error(
          "ice-candidate error:",
          error
        );
      }
    }
  );

  /* =======================================================
     ROOM INFO UPDATE
  ======================================================= */

  socket.on(
    "update-room",
    (data = {}) => {
      try {
        const roomId =
          cleanText(
            data.roomId ||
            socket.data.roomId,
            100
          );

        const userId =
          cleanUserId(
            socket.data.userId
          );

        const room =
          rooms[roomId];

        if (!room) {
          return;
        }

        if (
          !isHost(
            room,
            userId
          )
        ) {
          socket.emit(
            "action-error",
            {
              message:
                "Only room host can update room."
            }
          );

          return;
        }

        if (
          data.name !== undefined
        ) {
          room.name =
            cleanText(
              data.name,
              100
            ) ||
            room.name;
        }

        if (
          data.roomName !== undefined
        ) {
          room.name =
            cleanText(
              data.roomName,
              100
            ) ||
            room.name;
        }

        if (
          data.dp !== undefined
        ) {
          room.dp =
            cleanText(
              data.dp,
              1000
            );
        }

        if (
          data.roomDp !== undefined
        ) {
          room.dp =
            cleanText(
              data.roomDp,
              1000
            );
        }

        if (
          data.category !== undefined
        ) {
          room.category =
            cleanText(
              data.category,
              50
            ) ||
            room.category;
        }

        room.lastActivity =
          Date.now();

        sendRoomState(
          roomId
        );
      } catch (error) {
        console.error(
          "update-room error:",
          error
        );
      }
    }
  );

  /* =======================================================
     ROOM INVITE
  ======================================================= */

  socket.on(
    "room-invite",
    (data = {}) => {
      try {
        const roomId =
          cleanText(
            data.roomId ||
            socket.data.roomId,
            100
          );

        const room =
          rooms[roomId];

        if (!room) {
          return;
        }

        const invite = {
          roomId,

          roomName:
            room.name,

          roomDp:
            room.dp,

          fromUserId:
            socket.data.userId,

          fromName:
            room.users[
              socket.data.userId
            ]
              ? room.users[
                  socket.data.userId
                ].name
              : "User",

          time:
            Date.now()
        };

        /*
           If target socket exists,
           send direct invite.
        */
        const targetUserId =
          cleanUserId(
            data.toUserId
          );

        if (targetUserId) {
          const target =
            room.users[
              targetUserId
            ];

          if (
            target &&
            target.socketId
          ) {
            io.to(
              target.socketId
            ).emit(
              "room-invite",
              invite
            );
          }
        }
      } catch (error) {
        console.error(
          "room-invite error:",
          error
        );
      }
    }
  );

  /* =======================================================
     DISCONNECT
  ======================================================= */

  socket.on(
    "disconnect",
    (reason) => {
      console.log(
        "Socket disconnected:",
        socket.id,
        reason
      );

      leaveCurrentRoom(
        socket,
        "disconnect"
      );
    }
  );
});

/* =========================================================
   START SERVER
========================================================= */

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `PawanVoice Room Server running on port ${PORT}`
    );
  }
);
