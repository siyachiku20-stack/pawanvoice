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

const FIREBASE_DB =
  process.env.FIREBASE_DB_URL ||
  "https://pawanvoice-68c5e-default-rtdb.firebaseio.com";

const MAX_SEATS = 9;

const rooms = new Map();

/* --------------------------------------------------
   FIREBASE HELPERS
-------------------------------------------------- */

async function firebaseGet(path) {
  try {
    const response = await fetch(
      `${FIREBASE_DB}/${path}.json`
    );

    if (!response.ok) return null;

    return await response.json();
  } catch (e) {
    console.error("Firebase GET:", e.message);
    return null;
  }
}

async function firebasePut(path, data) {
  try {
    const response = await fetch(
      `${FIREBASE_DB}/${path}.json`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      }
    );

    return response.ok;
  } catch (e) {
    console.error("Firebase PUT:", e.message);
    return false;
  }
}

async function firebasePatch(path, data) {
  try {
    const response = await fetch(
      `${FIREBASE_DB}/${path}.json`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      }
    );

    return response.ok;
  } catch (e) {
    console.error("Firebase PATCH:", e.message);
    return false;
  }
}

async function firebaseDelete(path) {
  try {
    const response = await fetch(
      `${FIREBASE_DB}/${path}.json`,
      {
        method: "DELETE"
      }
    );

    return response.ok;
  } catch (e) {
    return false;
  }
}

/* --------------------------------------------------
   USER HELPERS
-------------------------------------------------- */

function cleanText(value, fallback = "") {
  return String(value ?? fallback)
    .trim()
    .slice(0, 100);
}

function makeUserId() {
  return (
    "PVU" +
    Date.now().toString(36).toUpperCase() +
    Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase()
  );
}

function safeUser(user) {
  if (!user) return null;

  return {
    userId: user.userId,
    name: user.name || "User",
    dp: user.dp || "",
    socketId: user.socketId || "",
    seatNo: user.seatNo || null,
    micOn: !!user.micOn,
    speakerOn:
      user.speakerOn !== false,
    isHost: !!user.isHost,
    isAdmin: !!user.isAdmin
  };
}

/* --------------------------------------------------
   ROOM HELPERS
-------------------------------------------------- */

function createEmptySeats() {
  return Array.from(
    { length: MAX_SEATS },
    (_, index) => ({
      seatNo: index + 1,
      userId: null
    })
  );
}

function createRoom(roomId, roomName, owner) {
  return {
    roomId,
    roomName:
      roomName || "PawanVoice Room",

    roomDp:
      owner.dp || "",

    hostUserId:
      owner.userId,

    createdAt:
      Date.now(),

    seats:
      createEmptySeats(),

    users:
      new Map(),

    banned:
      new Set()
  };
}

function publicRoom(room) {
  const users = [];

  room.users.forEach(user => {
    users.push(safeUser(user));
  });

  const seats = room.seats.map(seat => {
    const user =
      seat.userId
        ? room.users.get(seat.userId)
        : null;

    return {
      seatNo: seat.seatNo,
      user: safeUser(user)
    };
  });

  return {
    roomId: room.roomId,
    roomName: room.roomName,
    roomDp: room.roomDp,
    hostUserId: room.hostUserId,
    users,
    seats
  };
}

function findUser(room, userId) {
  if (!room) return null;

  return room.users.get(
    String(userId)
  );
}

function isAdmin(room, userId) {
  const user =
    findUser(room, userId);

  return !!(
    user &&
    (user.isHost || user.isAdmin)
  );
}

function findSeat(room, userId) {
  return room.seats.find(
    seat =>
      String(seat.userId) ===
      String(userId)
  );
}

function removeFromSeat(room, userId) {
  room.seats.forEach(seat => {
    if (
      String(seat.userId) ===
      String(userId)
    ) {
      seat.userId = null;
    }
  });
}

function putUserOnSeat(
  room,
  userId,
  seatNo
) {
  const seat =
    room.seats.find(
      s =>
        Number(s.seatNo) ===
        Number(seatNo)
    );

  if (!seat) {
    return false;
  }

  if (seat.userId) {
    return false;
  }

  removeFromSeat(
    room,
    userId
  );

  seat.userId =
    userId;

  const user =
    room.users.get(userId);

  if (user) {
    user.seatNo =
      Number(seatNo);
  }

  return true;
}

/* --------------------------------------------------
   FIREBASE ROOM SAVE
-------------------------------------------------- */

async function saveRoomToFirebase(room) {
  if (!room) return;

  const data = {
    roomId: room.roomId,
    roomName: room.roomName,
    roomDp: room.roomDp,
    hostUserId: room.hostUserId,
    createdAt: room.createdAt,
    onlineCount: room.users.size
  };

  await firebasePut(
    `rooms/${room.roomId}`,
    data
  );
}

async function saveUserProfile(user) {
  if (!user || !user.userId) {
    return;
  }

  await firebasePatch(
    `users/${user.userId}`,
    {
      userId: user.userId,
      name: user.name,
      dp: user.dp,
      updatedAt: Date.now()
    }
  );
}

/* --------------------------------------------------
   API
-------------------------------------------------- */

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
    time: Date.now()
  });
});

/*
  Live rooms.
  Combines Firebase room metadata and
  currently active Socket.IO rooms.
*/
app.get("/api/rooms", async (req, res) => {
  const result = {};
  const firebaseRooms =
    await firebaseGet("rooms");

  if (
    firebaseRooms &&
    typeof firebaseRooms === "object"
  ) {
    Object.values(firebaseRooms)
      .forEach(room => {
        if (!room || !room.roomId) {
          return;
        }

        result[room.roomId] = {
          roomId: room.roomId,
          roomName:
            room.roomName ||
            "PawanVoice Room",
          roomDp:
            room.roomDp || "",
          hostUserId:
            room.hostUserId || "",
          onlineCount:
            Number(room.onlineCount || 0),
          createdAt:
            room.createdAt || 0,
          online:
            rooms.has(room.roomId)
        };
      });
  }

  rooms.forEach(room => {
    result[room.roomId] = {
      roomId: room.roomId,
      roomName: room.roomName,
      roomDp: room.roomDp,
      hostUserId: room.hostUserId,
      onlineCount: room.users.size,
      createdAt: room.createdAt,
      online: true
    };
  });

  res.json(
    Object.values(result)
      .sort(
        (a, b) =>
          Number(b.online) -
          Number(a.online)
      )
  );
});


/*
  Get/create profile.
*/
app.get(
  "/api/user/:userId",
  async (req, res) => {
    const userId =
      cleanText(
        req.params.userId
      );

    const user =
      await firebaseGet(
        `users/${userId}`
      );

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    res.json(user);
  }
);


/*
  Save profile.
*/
app.put(
  "/api/user/:userId",
  async (req, res) => {
    const userId =
      cleanText(
        req.params.userId
      );

    const data = {
      userId,
      name:
        cleanText(
          req.body.name,
          "Pawan"
        ).slice(0, 40),

      dp:
        cleanText(
          req.body.dp,
          ""
        ).slice(0, 500000),

      updatedAt:
        Date.now()
    };

    const ok =
      await firebasePut(
        `users/${userId}`,
        data
      );

    res.json({
      ok
    });
  }
);


/*
  Create room.
*/
app.post(
  "/api/create-room",
  async (req, res) => {
    const userId =
      cleanText(
        req.body.userId
      );

    const name =
      cleanText(
        req.body.name,
        "Pawan"
      );

    const dp =
      cleanText(
        req.body.dp,
        ""
      );

    let roomId =
      cleanText(
        req.body.roomId
      );

    if (!roomId) {
      roomId =
        "PV" +
        Math.floor(
          100000 +
          Math.random() *
          900000
        );
    }

    roomId =
      roomId
        .replace(
          /[^A-Za-z0-9_-]/g,
          ""
        )
        .slice(0, 30);

    if (
      rooms.has(roomId)
    ) {
      return res.status(409).json({
        error:
          "Room already active"
      });
    }

    const existing =
      await firebaseGet(
        `rooms/${roomId}`
      );

    if (existing) {
      return res.status(409).json({
        error:
          "Room ID already exists"
      });
    }

    const room =
      createRoom(
        roomId,
        cleanText(
          req.body.roomName,
          "PawanVoice Room"
        ),
        {
          userId,
          name,
          dp
        }
      );

    rooms.set(
      roomId,
      room
    );

    await saveRoomToFirebase(
      room
    );

    await saveUserProfile({
      userId,
      name,
      dp
    });

    res.json({
      ok: true,
      room: {
        roomId: room.roomId,
        roomName: room.roomName,
        roomDp: room.roomDp
      }
    });
  }
);


/* --------------------------------------------------
   SOCKET.IO
-------------------------------------------------- */

io.on("connection", socket => {

  console.log(
    "Socket connected:",
    socket.id
  );


  socket.on(
    "join-room",
    async data => {

      const roomId =
        cleanText(
          data.roomId
        );

      const userId =
        cleanText(
          data.userId
        );

      const name =
        cleanText(
          data.name,
          "User"
        );

      const dp =
        cleanText(
          data.dp,
          ""
        );

      if (!roomId || !userId) {
        socket.emit(
          "error-message",
          "Invalid room/user"
        );
        return;
      }


      let room =
        rooms.get(roomId);


      /*
        If the room exists only in Firebase,
        recreate its live room.
      */
      if (!room) {

        const stored =
          await firebaseGet(
            `rooms/${roomId}`
          );

        if (!stored) {
          socket.emit(
            "error-message",
            "Room not found"
          );
          return;
        }

        room =
          createRoom(
            roomId,
            stored.roomName ||
              "PawanVoice Room",
            {
              userId:
                stored.hostUserId ||
                userId,
              name,
              dp
            }
          );

        room.roomDp =
          stored.roomDp || "";

        room.hostUserId =
          stored.hostUserId ||
          userId;

        rooms.set(
          roomId,
          room
        );
      }


      if (
        room.banned.has(
          userId
        )
      ) {
        socket.emit(
          "banned"
        );
        return;
      }


      let user =
        room.users.get(
          userId
        );


      if (user) {

        user.socketId =
          socket.id;

        user.name =
          name || user.name;

        user.dp =
          dp || user.dp;

      } else {

        const isFirst =
          room.users.size === 0;

        user = {
          userId,
          name,
          dp,
          socketId:
            socket.id,
          seatNo: null,
          micOn: false,
          speakerOn: true,
          isHost:
            isFirst ||
            userId ===
              room.hostUserId,
          isAdmin:
            isFirst ||
            userId ===
              room.hostUserId
        };

        room.users.set(
          userId,
          user
        );


        /*
          Host automatically gets seat 1.
        */
        if (
          user.isHost &&
          !findSeat(
            room,
            userId
          )
        ) {

          putUserOnSeat(
            room,
            userId,
            1
          );

        }

      }


      socket.join(
        roomId
      );


      socket.data.roomId =
        roomId;

      socket.data.userId =
        userId;


      await saveUserProfile(
        user
      );

      await saveRoomToFirebase(
        room
      );


      socket.emit(
        "room-state",
        publicRoom(room)
      );


      socket.to(roomId)
        .emit(
          "user-joined",
          safeUser(user)
        );


      io.to(roomId)
        .emit(
          "room-updated",
          publicRoom(room)
        );

    }
  );


  /* PROFILE UPDATE */

  socket.on(
    "update-profile",
    async data => {

      const room =
        rooms.get(
          cleanText(
            data.roomId
          )
        );

      if (!room) return;


      const user =
        findUser(
          room,
          cleanText(
            data.userId
          )
        );

      if (!user) return;


      user.name =
        cleanText(
          data.name,
          user.name
        ).slice(0, 40);

      user.dp =
        cleanText(
          data.dp,
          user.dp
        );


      await saveUserProfile(
        user
      );


      if (
        user.isHost
      ) {
        room.roomDp =
          user.dp;
      }


      await saveRoomToFirebase(
        room
      );


      io.to(room.roomId)
        .emit(
          "room-updated",
          publicRoom(room)
        );

    }
  );


  /* TAKE SEAT */

  socket.on(
    "take-seat",
    data => {

      const room =
        rooms.get(
          cleanText(
            data.roomId
          )
        );

      if (!room) return;


      const userId =
        cleanText(
          data.userId
        );

      const user =
        findUser(
          room,
          userId
        );

      if (!user) return;


      const seatNo =
        Number(
          data.seatNo
        );


      if (
        seatNo === 1 &&
        !user.isHost
      ) {
        socket.emit(
          "error-message",
          "Only host can use seat 1"
        );
        return;
      }


      const ok =
        putUserOnSeat(
          room,
          userId,
          seatNo
        );


      if (!ok) {
        socket.emit(
          "error-message",
          "Seat is already occupied"
        );
        return;
      }


      io.to(room.roomId)
        .emit(
          "room-updated",
          publicRoom(room)
        );

    }
  );


  /* LEAVE SEAT */

  socket.on(
    "leave-seat",
    data => {

      const room =
        rooms.get(
          cleanText(
            data.roomId
          )
        );

      if (!room) return;


      removeFromSeat(
        room,
        cleanText(
          data.userId
        )
      );


      const user =
        findUser(
          room,
          cleanText(
            data.userId
          )
        );

      if (user) {
        user.seatNo = null;
      }


      io.to(room.roomId)
        .emit(
          "room-updated",
          publicRoom(room)
        );

    }
  );


  /* MIC */

  socket.on(
    "mic-toggle",
    data => {

      const room =
        rooms.get(
          cleanText(
            data.roomId
          )
        );

      if (!room) return;


      const user =
        findUser(
          room,
          cleanText(
            data.userId
          )
        );

      if (!user) return;


      user.micOn =
        !!data.micOn;


      io.to(room.roomId)
        .emit(
          "room-updated",
          publicRoom(room)
        );

    }
  );


  /* SPEAKER */

  socket.on(
    "speaker-toggle",
    data => {

      const room =
        rooms.get(
          cleanText(
            data.roomId
          )
        );

      if (!room) return;


      const user =
        findUser(
          room,
          cleanText(
            data.userId
          )
        );

      if (!user) return;


      user.speakerOn =
        data.speakerOn !== false;


      io.to(room.roomId)
        .emit(
          "room-updated",
          publicRoom(room)
        );

    }
  );


  /* CHAT */

  socket.on(
    "send-message",
    data => {

      const room =
        rooms.get(
          cleanText(
            data.roomId
          )
        );

      if (!room) return;


      const user =
        findUser(
          room,
          cleanText(
            data.userId
          )
        );

      if (!user) return;


      const text =
        cleanText(
          data.text
        ).slice(0, 300);

      if (!text) return;


      io.to(room.roomId)
        .emit(
          "message",
          {
            userId:
              user.userId,
            name:
              user.name,
            text,
            time:
              Date.now()
          }
        );

    }
  );


  /* ROOM NAME */

  socket.on(
    "change-room-name",
    async data => {

      const room =
        rooms.get(
          cleanText(
            data.roomId
          )
        );

      if (!room) return;


      const userId =
        cleanText(
          data.userId
        );


      if (
        !isAdmin(
          room,
          userId
        )
      ) {
        socket.emit(
          "error-message",
          "Admin permission required"
        );
        return;
      }


      room.roomName =
        cleanText(
          data.roomName,
          room.roomName
        ).slice(0, 50);


      await saveRoomToFirebase(
        room
      );


      io.to(room.roomId)
        .emit(
          "room-updated",
          publicRoom(room)
        );

    }
  );


  /* MAKE ADMIN */

  socket.on(
    "make-admin",
    data => {

      const room =
        rooms.get(
          cleanText(
            data.roomId
          )
        );

      if (!room) return;


      if (
        !isAdmin(
          room,
          cleanText(
            data.userId
          )
        )
      ) {
        return;
      }


      const target =
        findUser(
          room,
          cleanText(
            data.targetUserId
          )
        );

      if (!target) return;


      target.isAdmin =
        true;


      io.to(room.roomId)
        .emit(
          "room-updated",
          publicRoom(room)
        );

    }
  );


  /* REMOVE ADMIN */

  socket.on(
    "remove-admin",
    data => {

      const room =
        rooms.get(
          cleanText(
            data.roomId
          )
        );

      if (!room) return;


      if (
        !isAdmin(
          room,
          cleanText(
            data.userId
          )
        )
      ) {
        return;
      }


      const target =
        findUser(
          room,
          cleanText(
            data.targetUserId
          )
        );

      if (!target) return;


      if (target.isHost) {
        return;
      }


      target.isAdmin =
        false;


      io.to(room.roomId)
        .emit(
          "room-updated",
          publicRoom(room)
        );

    }
  );


  /* KICK */

  socket.on(
    "kick-user",
    data => {

      const room =
        rooms.get(
          cleanText(
            data.roomId
          )
        );

      if (!room) return;


      if (
        !isAdmin(
          room,
          cleanText(
            data.userId
          )
        )
      ) {
        return;
      }


      const target =
        findUser(
          room,
          cleanText(
            data.targetUserId
          )
        );

      if (!target) return;


      if (
        target.isHost
      ) {
        return;
      }


      const targetSocket =
        io.sockets.sockets.get(
          target.socketId
        );


      if (targetSocket) {
        targetSocket.emit(
          "kicked"
        );
        targetSocket.leave(
          room.roomId
        );
      }


      removeFromSeat(
        room,
        target.userId
      );

      room.users.delete(
        target.userId
      );


      io.to(room.roomId)
        .emit(
          "room-updated",
          publicRoom(room)
        );

    }
  );


  /* BAN */

  socket.on(
    "ban-user",
    data => {

      const room =
        rooms.get(
          cleanText(
            data.roomId
          )
        );

      if (!room) return;


      if (
        !isAdmin(
          room,
          cleanText(
            data.userId
          )
        )
      ) {
        return;
      }


      const target =
        findUser(
          room,
          cleanText(
            data.targetUserId
          )
        );

      if (!target) return;


      if (target.isHost) {
        return;
      }


      room.banned.add(
        target.userId
      );


      const targetSocket =
        io.sockets.sockets.get(
          target.socketId
        );


      if (targetSocket) {
        targetSocket.emit(
          "banned"
        );
        targetSocket.leave(
          room.roomId
        );
      }


      removeFromSeat(
        room,
        target.userId
      );

      room.users.delete(
        target.userId
      );


      io.to(room.roomId)
        .emit(
          "room-updated",
          publicRoom(room)
        );

    }
  );


  /* GIFT EVENT */

  socket.on(
    "send-gift",
    data => {

      const room =
        rooms.get(
          cleanText(
            data.roomId
          )
        );

      if (!room) return;


      const sender =
        findUser(
          room,
          cleanText(
            data.userId
          )
        );

      const receiver =
        findUser(
          room,
          cleanText(
            data.targetUserId
          )
        );

      if (
        !sender ||
        !receiver
      ) {
        return;
      }


      io.to(room.roomId)
        .emit(
          "gift",
          {
            fromUserId:
              sender.userId,
            fromName:
              sender.name,
            toUserId:
              receiver.userId,
            toName:
              receiver.name,
            giftName:
              cleanText(
                data.giftName,
                "Gift"
              ),
            amount:
              Number(
                data.amount || 0
              ),
            time:
              Date.now()
          }
        );

    }
  );


  /* --------------------------------------------------
     WEBRTC SIGNALING
  -------------------------------------------------- */

  socket.on(
    "webrtc-offer",
    data => {

      const target =
        findSocketByUserId(
          data.roomId,
          data.toUserId
        );

      if (target) {
        target.emit(
          "webrtc-offer",
          data
        );
      }

    }
  );


  socket.on(
    "webrtc-answer",
    data => {

      const target =
        findSocketByUserId(
          data.roomId,
          data.toUserId
        );

      if (target) {
        target.emit(
          "webrtc-answer",
          data
        );
      }

    }
  );


  socket.on(
    "webrtc-ice-candidate",
    data => {

      const target =
        findSocketByUserId(
          data.roomId,
          data.toUserId
        );

      if (target) {
        target.emit(
          "webrtc-ice-candidate",
          data
        );
      }

    }
  );


  /* LEAVE ROOM */

  socket.on(
    "leave-room",
    data => {

      disconnectUser(
        socket,
        data.roomId,
        data.userId
      );

    }
  );


  /* DISCONNECT */

  socket.on(
    "disconnect",
    () => {

      disconnectUser(
        socket,
        socket.data.roomId,
        socket.data.userId
      );

    }
  );

});


function findSocketByUserId(
  roomId,
  userId
) {

  const room =
    rooms.get(
      cleanText(roomId)
    );

  if (!room) return null;


  const user =
    findUser(
      room,
      cleanText(userId)
    );

  if (!user) return null;


  return io.sockets.sockets.get(
    user.socketId
  ) || null;
}


/* --------------------------------------------------
   DISCONNECT USER
-------------------------------------------------- */

async function disconnectUser(
  socket,
  roomId,
  userId
) {

  if (!roomId || !userId) {
    return;
  }


  const room =
    rooms.get(
      String(roomId)
    );

  if (!room) return;


  const user =
    room.users.get(
      String(userId)
    );

  if (!user) return;


  /*
   * Don't remove a user when an old
   * socket disconnects after reconnect.
   */
  if (
    user.socketId &&
    user.socketId !==
      socket.id
  ) {
    return;
  }


  removeFromSeat(
    room,
    userId
  );

  room.users.delete(
    String(userId)
  );


  socket.leave(
    room.roomId
  );


  /*
   * Promote a new host.
   */
  if (
    user.isHost &&
    room.users.size > 0
  ) {

    const newHost =
      room.users.values()
        .next().value;

    if (newHost) {

      newHost.isHost =
        true;

      newHost.isAdmin =
        true;

      room.hostUserId =
        newHost.userId;


      /*
       * Give host seat 1.
       */
      removeFromSeat(
        room,
        newHost.userId
      );

      putUserOnSeat(
        room,
        newHost.userId,
        1
      );

    }

  }


  if (
    room.users.size === 0
  ) {

    /*
     * Keep metadata in Firebase,
     * but remove live room from RAM.
     */
    await saveRoomToFirebase(
      room
    );

    rooms.delete(
      room.roomId
    );

    return;
  }


  await saveRoomToFirebase(
    room
  );


  io.to(room.roomId)
    .emit(
      "user-left",
      safeUser(user)
    );


  io.to(room.roomId)
    .emit(
      "room-updated",
      publicRoom(room)
    );

}


/* --------------------------------------------------
   START
-------------------------------------------------- */

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `PawanVoice server running on ${PORT}`
    );

  }
);
