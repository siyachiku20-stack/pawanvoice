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

app.use(express.json());

const PORT = process.env.PORT || 10000;

/*
  PawanVoice
  9-seat realtime room server
*/

const rooms = new Map();

/* ----------------------------- */
/* Helpers                        */
/* ----------------------------- */

function clean(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim().slice(0, 200);
}

function makeRoomId() {
  return (
    "PV" +
    Math.floor(100000 + Math.random() * 900000)
  );
}

function makeUserId() {
  return (
    "PVU" +
    Math.random()
      .toString(36)
      .substring(2, 10)
      .toUpperCase()
  );
}

function createRoom(roomId, roomName = "PawanVoice Room") {
  const room = {
    roomId,
    roomName,
    roomDp: "",
    hostId: null,

    seats: Array.from({ length: 9 }, (_, index) => ({
      seatNo: index + 1,
      userId: null
    })),

    users: new Map(),
    admins: new Set(),
    bannedUsers: new Set(),

    createdAt: Date.now()
  };

  rooms.set(roomId, room);

  return room;
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    return createRoom(roomId);
  }

  return rooms.get(roomId);
}

function publicUser(user) {
  return {
    userId: user.userId,
    nickname: user.nickname,
    dp: user.dp,

    seatNo: user.seatNo,

    micOn: user.micOn,
    speakerOn: user.speakerOn,

    isHost: user.isHost,
    isAdmin: user.isAdmin,

    frame: user.frame || ""
  };
}

function publicRoom(room) {
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    roomDp: room.roomDp,
    hostId: room.hostId,

    users: Array.from(room.users.values())
      .map(publicUser),

    seats: room.seats
  };
}

function broadcastRoom(room) {
  io.to(room.roomId).emit(
    "roomState",
    publicRoom(room)
  );
}

function findUser(room, userId) {
  return room.users.get(userId);
}

function removeUserFromSeat(room, userId) {
  const user = findUser(room, userId);

  if (!user) return;

  if (user.seatNo) {
    const seat = room.seats.find(
      s => s.seatNo === user.seatNo
    );

    if (seat) {
      seat.userId = null;
    }
  }

  user.seatNo = null;
}

/* ----------------------------- */
/* Health                         */
/* ----------------------------- */

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
    ok: true,
    rooms: rooms.size
  });
});

/* ----------------------------- */
/* Room API                      */
/* ----------------------------- */

app.get("/rooms", (req, res) => {
  const list = Array.from(rooms.values()).map(room => ({
    roomId: room.roomId,
    roomName: room.roomName,
    roomDp: room.roomDp,
    hostId: room.hostId,
    userCount: room.users.size,
    maxSeats: 9
  }));

  res.json(list);
});

app.post("/rooms", (req, res) => {
  const roomId =
    clean(req.body.roomId) || makeRoomId();

  const roomName =
    clean(req.body.roomName) ||
    "PawanVoice Room";

  if (rooms.has(roomId)) {
    return res.status(409).json({
      error: "Room already exists"
    });
  }

  const room =
    createRoom(
      roomId,
      roomName
    );

  res.json(publicRoom(room));
});

/* ----------------------------- */
/* Socket.IO                     */
/* ----------------------------- */

io.on("connection", socket => {

  let currentRoomId = null;
  let currentUserId = null;

  /* =========================== */
  /* JOIN ROOM                   */
  /* =========================== */

  socket.on("joinRoom", data => {

    try {

      const roomId =
        clean(data?.roomId) || "main";

      const userId =
        clean(data?.userId) || makeUserId();

      const nickname =
        clean(data?.nickname) || "Guest";

      const dp =
        clean(data?.dp);

      const room =
        getRoom(roomId);

      if (
        room.bannedUsers.has(userId)
      ) {

        socket.emit(
          "roomError",
          {
            message:
              "You are banned from this room."
          }
        );

        return;
      }

      /* leave old room if needed */

      if (currentRoomId) {

        leaveCurrentRoom(
          socket,
          currentRoomId,
          currentUserId
        );

      }

      currentRoomId = roomId;
      currentUserId = userId;

      socket.join(roomId);

      let user =
        room.users.get(userId);

      if (!user) {

        const isFirstUser =
          room.users.size === 0;

        user = {
          userId,
          nickname,
          dp,

          seatNo: null,

          micOn: false,
          speakerOn: true,

          isHost: isFirstUser,
          isAdmin: isFirstUser,

          frame: ""
        };

        room.users.set(
          userId,
          user
        );

        if (isFirstUser) {

          room.hostId =
            userId;

          room.admins.add(
            userId
          );
        }

      } else {

        user.nickname = nickname;

        if (dp) {
          user.dp = dp;
        }

        user.isHost =
          user.userId === room.hostId;

        user.isAdmin =
          room.admins.has(user.userId);
      }

      socket.data.roomId =
        roomId;

      socket.data.userId =
        userId;

      /*
        Tell existing users that
        a new peer is available.
      */

      socket.to(roomId).emit(
        "webrtc-peer-joined",
        {
          userId
        }
      );

      /*
        Send complete room state.
      */

      socket.emit(
        "roomState",
        publicRoom(room)
      );

      broadcastRoom(room);

    } catch (error) {

      console.error(
        "joinRoom error:",
        error
      );

      socket.emit(
        "roomError",
        {
          message:
            "Unable to join room."
        }
      );

    }

  });

  /* =========================== */
  /* SELECT SEAT                 */
  /* =========================== */

  socket.on("selectSeat", data => {

    const room =
      rooms.get(
        clean(data?.roomId)
      );

    const userId =
      clean(data?.userId);

    const seatNo =
      Number(data?.seatNo);

    if (!room || !userId) return;

    const user =
      findUser(room, userId);

    if (!user) return;

    if (
      seatNo < 1 ||
      seatNo > 9
    ) {

      socket.emit(
        "roomError",
        {
          message:
            "Invalid seat."
        }
      );

      return;
    }

    const seat =
      room.seats.find(
        s => s.seatNo === seatNo
      );

    if (!seat) return;

    if (
      seat.userId &&
      seat.userId !== userId
    ) {

      socket.emit(
        "roomError",
        {
          message:
            "This seat is already occupied."
        }
      );

      return;
    }

    /*
      Remove old seat first.
    */

    removeUserFromSeat(
      room,
      userId
    );

    seat.userId =
      userId;

    user.seatNo =
      seatNo;

    broadcastRoom(room);

  });

  /* =========================== */
  /* LEAVE SEAT                  */
  /* =========================== */

  socket.on("leaveSeat", data => {

    const room =
      rooms.get(
        clean(data?.roomId)
      );

    const userId =
      clean(data?.userId);

    if (!room || !userId) return;

    removeUserFromSeat(
      room,
      userId
    );

    broadcastRoom(room);

  });

  /* =========================== */
  /* MIC                         */
  /* =========================== */

  socket.on("micToggle", data => {

    const room =
      rooms.get(
        clean(data?.roomId)
      );

    const userId =
      clean(data?.userId);

    if (!room) return;

    const user =
      findUser(room, userId);

    if (!user) return;

    user.micOn =
      Boolean(data?.micOn);

    broadcastRoom(room);

  });

  /* =========================== */
  /* SPEAKER                     */
  /* =========================== */

  socket.on("speakerToggle", data => {

    const room =
      rooms.get(
        clean(data?.roomId)
      );

    const userId =
      clean(data?.userId);

    if (!room) return;

    const user =
      findUser(room, userId);

    if (!user) return;

    user.speakerOn =
      Boolean(data?.speakerOn);

    broadcastRoom(room);

  });

  /* =========================== */
  /* CHAT                        */
  /* =========================== */

  socket.on("sendMessage", data => {

    const room =
      rooms.get(
        clean(data?.roomId)
      );

    const userId =
      clean(data?.userId);

    if (!room) return;

    const user =
      findUser(room, userId);

    if (!user) return;

    const message =
      clean(data?.message);

    if (!message) return;

    const payload = {
      userId: user.userId,
      nickname: user.nickname,
      message,
      timestamp: Date.now()
    };

    io.to(room.roomId).emit(
      "chatMessage",
      payload
    );

    /*
      Compatibility with older client.
    */

    io.to(room.roomId).emit(
      "message",
      payload
    );

  });

  /* =========================== */
  /* CHANGE ROOM NAME            */
  /* =========================== */

  socket.on("changeRoomName", data => {

    const room =
      rooms.get(
        clean(data?.roomId)
      );

    const userId =
      clean(data?.userId);

    if (!room) return;

    const user =
      findUser(room, userId);

    if (!user) return;

    if (
      !user.isHost &&
      !user.isAdmin
    ) {

      socket.emit(
        "roomError",
        {
          message:
            "Only host/admin can change room name."
        }
      );

      return;
    }

    const newName =
      clean(data?.roomName);

    if (!newName) return;

    room.roomName =
      newName.slice(0, 60);

    io.to(room.roomId).emit(
      "roomNameChanged",
      {
        roomName:
          room.roomName
      }
    );

    broadcastRoom(room);

  });

  /* =========================== */
  /* MAKE ADMIN                  */
  /* =========================== */

  socket.on("makeAdmin", data => {

    const room =
      rooms.get(
        clean(data?.roomId)
      );

    const userId =
      clean(data?.userId);

    const targetUserId =
      clean(data?.targetUserId);

    if (!room) return;

    const actor =
      findUser(room, userId);

    const target =
      findUser(
        room,
        targetUserId
      );

    if (!actor || !target) return;

    if (!actor.isHost) {

      socket.emit(
        "roomError",
        {
          message:
            "Only host can make admin."
        }
      );

      return;
    }

    room.admins.add(
      targetUserId
    );

    target.isAdmin =
      true;

    broadcastRoom(room);

  });

  /* =========================== */
  /* REMOVE ADMIN                */
  /* =========================== */

  socket.on("removeAdmin", data => {

    const room =
      rooms.get(
        clean(data?.roomId)
      );

    const userId =
      clean(data?.userId);

    const targetUserId =
      clean(data?.targetUserId);

    if (!room) return;

    const actor =
      findUser(room, userId);

    const target =
      findUser(
        room,
        targetUserId
      );

    if (!actor || !target) return;

    if (!actor.isHost) return;

    room.admins.delete(
      targetUserId
    );

    target.isAdmin =
      false;

    broadcastRoom(room);

  });

  /* =========================== */
  /* MUTE USER                   */
  /* =========================== */

  socket.on("muteUser", data => {

    const room =
      rooms.get(
        clean(data?.roomId)
      );

    const actorId =
      clean(data?.userId);

    const targetId =
      clean(data?.targetUserId);

    if (!room) return;

    const actor =
      findUser(
        room,
        actorId
      );

    const target =
      findUser(
        room,
        targetId
      );

    if (!actor || !target) return;

    if (
      !actor.isHost &&
      !actor.isAdmin
    ) return;

    target.micOn =
      false;

    io.to(room.roomId).emit(
      "userMuted",
      {
        userId:
          targetId
      }
    );

    broadcastRoom(room);

  });

  /* =========================== */
  /* KICK USER                   */
  /* =========================== */

  socket.on("kickUser", data => {

    const room =
      rooms.get(
        clean(data?.roomId)
      );

    const actorId =
      clean(data?.userId);

    const targetId =
      clean(data?.targetUserId);

    if (!room) return;

    const actor =
      findUser(
        room,
        actorId
      );

    const target =
      findUser(
        room,
        targetId
      );

    if (!actor || !target) return;

    if (
      !actor.isHost &&
      !actor.isAdmin
    ) return;

    if (target.isHost) return;

    removeUserFromSeat(
      room,
      targetId
    );

    room.users.delete(
      targetId
    );

    const targetSocket =
      findSocket(
        room.roomId,
        targetId
      );

    if (targetSocket) {

      targetSocket.emit(
        "kicked",
        {
          message:
            "You were removed from the room."
        }
      );

      targetSocket.leave(
        room.roomId
      );

      targetSocket.data.roomId =
        null;

      targetSocket.data.userId =
        null;
    }

    io.to(room.roomId).emit(
      "userLeft",
      {
        userId:
          targetId
      }
    );

    broadcastRoom(room);

  });

  /* =========================== */
  /* BAN USER                    */
  /* =========================== */

  socket.on("banUser", data => {

    const room =
      rooms.get(
        clean(data?.roomId)
      );

    const actorId =
      clean(data?.userId);

    const targetId =
      clean(data?.targetUserId);

    if (!room) return;

    const actor =
      findUser(
        room,
        actorId
      );

    const target =
      findUser(
        room,
        targetId
      );

    if (!actor || !target) return;

    if (!actor.isHost) return;

    if (target.isHost) return;

    room.bannedUsers.add(
      targetId
    );

    removeUserFromSeat(
      room,
      targetId
    );

    room.users.delete(
      targetId
    );

    const targetSocket =
      findSocket(
        room.roomId,
        targetId
      );

    if (targetSocket) {

      targetSocket.emit(
        "banned",
        {
          message:
            "You were banned from this room."
        }
      );

      targetSocket.leave(
        room.roomId
      );

      targetSocket.data.roomId =
        null;

      targetSocket.data.userId =
        null;
    }

    io.to(room.roomId).emit(
      "userLeft",
      {
        userId:
          targetId
      }
    );

    broadcastRoom(room);

  });

  /* =========================== */
  /* WEBRTC OFFER                */
  /* =========================== */

  socket.on(
    "webrtc-offer",
    data => {

      relayWebRTC(
        socket,
        "webrtc-offer",
        data
      );

    }
  );

  /* =========================== */
  /* WEBRTC ANSWER               */
  /* =========================== */

  socket.on(
    "webrtc-answer",
    data => {

      relayWebRTC(
        socket,
        "webrtc-answer",
        data
      );

    }
  );

  /* =========================== */
  /* WEBRTC ICE                  */
  /* =========================== */

  socket.on(
    "webrtc-ice-candidate",
    data => {

      relayWebRTC(
        socket,
        "webrtc-ice-candidate",
        data
      );

    }
  );

  /* =========================== */
  /* LEAVE ROOM                  */
  /* =========================== */

  socket.on("leaveRoom", () => {

    leaveCurrentRoom(
      socket,
      currentRoomId,
      currentUserId
    );

    currentRoomId = null;
    currentUserId = null;

  });

  /* =========================== */
  /* DISCONNECT                  */
  /* =========================== */

  socket.on("disconnect", () => {

    leaveCurrentRoom(
      socket,
      currentRoomId,
      currentUserId
    );

  });

});

/* -------------------------------- */
/* WebRTC relay                     */
/* -------------------------------- */

function relayWebRTC(
  socket,
  eventName,
  data
) {

  const roomId =
    clean(data?.roomId);

  const fromUserId =
    clean(data?.fromUserId);

  const toUserId =
    clean(data?.toUserId);

  if (
    !roomId ||
    !fromUserId ||
    !toUserId
  ) return;

  const target =
    findSocket(
      roomId,
      toUserId
    );

  if (!target) return;

  const forwarded = {
    ...data,
    fromUserId
  };

  target.emit(
    eventName,
    forwarded
  );

}

/* -------------------------------- */
/* Find socket for user             */
/* -------------------------------- */

function findSocket(
  roomId,
  userId
) {

  const sockets =
    io.sockets.sockets;

  for (const socket of sockets.values()) {

    if (
      socket.data.roomId === roomId &&
      socket.data.userId === userId
    ) {

      return socket;

    }

  }

  return null;
}

/* -------------------------------- */
/* Leave helper                     */
/* -------------------------------- */

function leaveCurrentRoom(
  socket,
  roomId,
  userId
) {

  if (!roomId || !userId) return;

  const room =
    rooms.get(roomId);

  if (!room) return;

  const user =
    room.users.get(userId);

  if (!user) return;

  removeUserFromSeat(
    room,
    userId
  );

  room.users.delete(
    userId
  );

  room.admins.delete(
    userId
  );

  socket.leave(
    roomId
  );

  io.to(roomId).emit(
    "userLeft",
    {
      userId
    }
  );

  /*
    If host leaves, choose another
    connected user as host.
  */

  if (room.hostId === userId) {

    const nextUser =
      room.users.values().next().value;

    if (nextUser) {

      room.hostId =
        nextUser.userId;

      nextUser.isHost =
        true;

      nextUser.isAdmin =
        true;

      room.admins.add(
        nextUser.userId
      );

    } else {

      room.hostId =
        null;

    }

  }

  /*
    Delete empty rooms.
  */

  if (room.users.size === 0) {

    rooms.delete(
      roomId
    );

    return;
  }

  broadcastRoom(room);

}

/* -------------------------------- */
/* Start                            */
/* -------------------------------- */

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `PawanVoice server running on port ${PORT}`
    );

  }
);
