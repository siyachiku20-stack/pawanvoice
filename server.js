const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

/* =========================================================
   CONFIG
========================================================= */

const PORT = process.env.PORT || 3000;

const FIREBASE_DB_URL =
  process.env.FIREBASE_DB_URL ||
  "https://pawanvoice-68c5e-default-rtdb.firebaseio.com";

const TURN_URL =
  process.env.TURN_URL || "";

const TURN_USERNAME =
  process.env.TURN_USERNAME || "";

const TURN_CREDENTIAL =
  process.env.TURN_CREDENTIAL || "";

const MAX_SEATS = 9;

const ROOM_STALE_MS =
  2 * 60 * 1000;


/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(express.json());

/*
  IMPORTANT:
  server.js and room.html/index.html should
  be in the same root folder.
*/
app.use(
  express.static(
    path.join(__dirname)
  )
);


/* =========================================================
   SOCKET.IO
========================================================= */

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});


/* =========================================================
   MEMORY ROOM STORE
========================================================= */

const rooms = new Map();


/* =========================================================
   HELPERS
========================================================= */

function safeString(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const result = value.trim();

  return result || fallback;
}


function safeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function cleanRoomId(value) {
  const id = safeString(value, "");

  if (!id) {
    return "main";
  }

  return id
    .replace(/[.#$[\]/]/g, "_")
    .slice(0, 80);
}


function cleanUserId(value) {
  const id = safeString(value, "");

  if (!id) {
    return "";
  }

  return id
    .replace(/[.#$[\]/]/g, "_")
    .slice(0, 100);
}


function getRoom(roomId) {

  const id =
    cleanRoomId(roomId);

  if (!rooms.has(id)) {

    rooms.set(id, {
      id: id,

      name:
        "PawanVoice Room",

      dp:
        "https://i.pravatar.cc/200?img=12",

      category:
        "General",

      seats:
        Array(MAX_SEATS).fill(null),

      users:
        new Map(),

      messages: [],

      gifts: [],

      createdAt:
        Date.now(),

      lastActiveAt:
        Date.now()
    });
  }

  return rooms.get(id);
}


function getSocketUser(room, socketId) {

  if (!room) {
    return null;
  }

  return room.users.get(socketId) || null;
}


function findUserByUserId(room, userId) {

  if (!room || !userId) {
    return null;
  }

  for (const user of room.users.values()) {

    if (
      user.userId === userId
    ) {
      return user;
    }
  }

  return null;
}


/* =========================================================
   USER CLEANUP
========================================================= */

function cleanUser(socket, data = {}) {

  const userId =
    cleanUserId(
      data.userId ||
      socket.id
    ) ||
    socket.id;

  return {

    userId,

    socketId:
      socket.id,

    name:
      safeString(
        data.name,
        "Guest"
      ).slice(0, 40),

    dp:
      safeString(
        data.dp,
        "https://i.pravatar.cc/200?img=12"
      ),

    level:
      Math.max(
        1,
        safeNumber(
          data.level,
          1
        )
      ),

    exp:
      Math.max(
        0,
        safeNumber(
          data.exp,
          0
        )
      ),

    vipLevel:
      Math.max(
        0,
        safeNumber(
          data.vipLevel,
          0
        )
      ),

    vipExp:
      Math.max(
        0,
        safeNumber(
          data.vipExp,
          0
        )
      ),

    avatarFrame:
      data.avatarFrame || null,

    badge:
      data.badge || null,

    entryEffect:
      data.entryEffect || null,

    mic:
      false,

    muted:
      false,

    joinedAt:
      Date.now()
  };
}


/* =========================================================
   ROOM SERIALIZATION
========================================================= */

function serializeUser(user) {

  return {
    userId: user.userId,
    socketId: user.socketId,
    name: user.name,
    dp: user.dp,
    level: user.level,
    exp: user.exp,
    vipLevel: user.vipLevel,
    vipExp: user.vipExp,
    avatarFrame: user.avatarFrame,
    badge: user.badge,
    entryEffect: user.entryEffect,
    mic: Boolean(user.mic),
    muted: Boolean(user.muted),
    joinedAt: user.joinedAt
  };
}


function roomState(room) {

  const users = {};

  for (const [
    socketId,
    user
  ] of room.users.entries()) {

    users[socketId] =
      serializeUser(user);
  }

  return {

    id: room.id,

    name: room.name,

    dp: room.dp,

    category:
      room.category,

    seats:
      room.seats,

    users,

    userCount:
      room.users.size,

    messages:
      room.messages.slice(-100),

    gifts:
      room.gifts.slice(-100),

    createdAt:
      room.createdAt,

    lastActiveAt:
      room.lastActiveAt
  };
}


/* =========================================================
   FIREBASE SYNC
========================================================= */

async function firebaseRequest(
  pathName,
  options = {}
) {

  const cleanPath =
    String(pathName)
      .replace(/^\/+/, "");

  const url =
    FIREBASE_DB_URL.replace(/\/+$/, "") +
    "/" +
    cleanPath +
    ".json";

  try {

    const response =
      await fetch(
        url,
        {
          ...options,
          headers: {
            "Content-Type":
              "application/json",
            ...(options.headers || {})
          }
        }
      );

    if (!response.ok) {

      const text =
        await response.text();

      throw new Error(
        "Firebase " +
        response.status +
        " " +
        text
      );
    }

    return await response.json();

  } catch (error) {

    console.error(
      "Firebase request error:",
      error.message
    );

    return null;
  }
}


/*
  This is the LIVE room summary shown
  on Home/index.html.
*/
async function syncRoomToFirebase(room) {

  if (!room) {
    return;
  }

  room.lastActiveAt =
    Date.now();

  const host =
    room.seats[0];

  const hostUser =
    host
      ? room.users.get(host)
      : null;

  const firstUser =
    hostUser ||
    room.users.values().next().value ||
    null;

  const roomData = {

    id:
      room.id,

    name:
      room.name ||
      "PawanVoice Room",

    dp:
      room.dp ||
      (firstUser && firstUser.dp) ||
      "https://i.pravatar.cc/200?img=12",

    owner:
      (hostUser && hostUser.name) ||
      (firstUser && firstUser.name) ||
      "Host",

    ownerId:
      (hostUser && hostUser.userId) ||
      (firstUser && firstUser.userId) ||
      "",

    ownerDp:
      (hostUser && hostUser.dp) ||
      (firstUser && firstUser.dp) ||
      room.dp ||
      "https://i.pravatar.cc/200?img=12",

    category:
      room.category ||
      "General",

    users:
      room.users.size,

    seats:
      MAX_SEATS,

    live:
      room.users.size > 0,

    createdAt:
      room.createdAt,

    lastActiveAt:
      room.lastActiveAt
  };

  await firebaseRequest(
    "rooms/" +
    encodeURIComponent(room.id),
    {
      method: "PUT",
      body:
        JSON.stringify(roomData)
    }
  );
}


/*
  Empty room = remove from Firebase.
*/
async function removeRoomFromFirebase(roomId) {

  await firebaseRequest(
    "rooms/" +
    encodeURIComponent(roomId),
    {
      method: "DELETE"
    }
  );
}


/* =========================================================
   BROADCAST
========================================================= */

function broadcastRoom(room) {

  if (!room) {
    return;
  }

  room.lastActiveAt =
    Date.now();

  io.to(room.id).emit(
    "room-state",
    roomState(room)
  );

  /*
    Compatibility event.
  */
  io.to(room.id).emit(
    "roomState",
    roomState(room)
  );
}


function broadcastUserCount(room) {

  if (!room) {
    return;
  }

  io.to(room.id).emit(
    "room-count",
    {
      roomId: room.id,
      users: room.users.size,
      seats: MAX_SEATS
    }
  );
}


/* =========================================================
   HOST / SEAT HELPERS
========================================================= */

function isHost(room, socketId) {

  if (!room) {
    return false;
  }

  return room.seats[0] === socketId;
}


function removeUserFromSeats(
  room,
  socketId
) {

  for (
    let index = 0;
    index < room.seats.length;
    index++
  ) {

    if (
      room.seats[index] ===
      socketId
    ) {

      room.seats[index] =
        null;
    }
  }
}


function firstEmptySeat(room) {

  for (
    let index = 0;
    index < MAX_SEATS;
    index++
  ) {

    if (
      room.seats[index] === null
    ) {

      return index;
    }
  }

  return -1;
}


/* =========================================================
   EXPRESS ROUTES
========================================================= */

app.get(
  "/",
  (req, res) => {

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
        rooms.size,

      firebaseSync:
        true,

      turnConfigured:
        Boolean(
          TURN_URL &&
          TURN_USERNAME &&
          TURN_CREDENTIAL
        )
    });
  }
);


app.get(
  "/health",
  (req, res) => {

    res.json({

      status:
        "ok",

      app:
        "PawanVoice",

      socketIO:
        true,

      webRTC:
        true,

      firebaseSync:
        true,

      seats:
        MAX_SEATS,

      rooms:
        rooms.size,

      turnConfigured:
        Boolean(
          TURN_URL &&
          TURN_USERNAME &&
          TURN_CREDENTIAL
        ),

      uptime:
        Math.round(
          process.uptime()
        )
    });
  }
);


/* =========================================================
   WEBRTC CONFIG
========================================================= */

app.get(
  "/rtc-config",
  (req, res) => {

    const iceServers = [

      {
        urls:
          [
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

      const turnServers = {
        urls: [
          TURN_URL
        ],

        username:
          TURN_USERNAME,

        credential:
          TURN_CREDENTIAL
      };

      /*
        Add TURN TLS/TCP only when the
        provided URL can safely be converted.
      */

      if (
        TURN_URL.startsWith(
          "turn:"
        )
      ) {

        turnServers.urls.push(
          TURN_URL.replace(
            "turn:",
            "turns:"
          ) +
          "?transport=tcp"
        );
      }

      iceServers.push(
        turnServers
      );
    }

    res.json({
      iceServers
    });
  }
);


/* =========================================================
   ROOM HTTP DEBUG
========================================================= */

app.get(
  "/api/rooms",
  (req, res) => {

    const result = [];

    for (
      const room of rooms.values()
    ) {

      result.push({
        id: room.id,
        name: room.name,
        users: room.users.size,
        seats: MAX_SEATS,
        category: room.category,
        createdAt: room.createdAt,
        lastActiveAt: room.lastActiveAt
      });
    }

    res.json({
      rooms: result
    });
  }
);


/* =========================================================
   SOCKET CONNECTION
========================================================= */

io.on(
  "connection",
  (socket) => {

    console.log(
      "Socket connected:",
      socket.id
    );


    /* =====================================================
       JOIN ROOM
    ===================================================== */

    socket.on(
      "join-room",
      async (data = {}) => {

        try {

          const roomId =
            cleanRoomId(
              data.roomId ||
              "main"
            );

          const room =
            getRoom(roomId);

          const user =
            cleanUser(
              socket,
              data
            );

          /*
            If same userId already exists in
            this room from an old socket,
            remove the old socket entry.
          */

          const oldUser =
            findUserByUserId(
              room,
              user.userId
            );

          if (
            oldUser &&
            oldUser.socketId !==
            socket.id
          ) {

            room.users.delete(
              oldUser.socketId
            );

            removeUserFromSeats(
              room,
              oldUser.socketId
            );

            const oldSocket =
              io.sockets.sockets.get(
                oldUser.socketId
              );

            if (oldSocket) {

              oldSocket.leave(
                room.id
              );
            }
          }


          socket.join(
            room.id
          );

          socket.data.roomId =
            room.id;

          socket.data.userId =
            user.userId;


          /*
            Save room metadata from
            the first/current client.
          */

          if (
            data.name
          ) {

            room.name =
              safeString(
                data.name,
                room.name
              );
          }

          if (
            data.dp
          ) {

            room.dp =
              safeString(
                data.dp,
                room.dp
              );
          }

          if (
            data.category
          ) {

            room.category =
              safeString(
                data.category,
                "General"
              );
          }


          room.users.set(
            socket.id,
            user
          );

          room.lastActiveAt =
            Date.now();


          /*
            First user becomes host
            automatically.
          */

          if (
            room.seats[0] === null
          ) {

            room.seats[0] =
              socket.id;
          }


          /*
            If user has no seat and there
            is another free seat, put them
            into the first free seat.
          */

          let alreadySeated =
            room.seats.includes(
              socket.id
            );

          if (!alreadySeated) {

            const seat =
              firstEmptySeat(
                room
              );

            if (seat >= 0) {

              room.seats[seat] =
                socket.id;
            }
          }


          /*
            Send current room state
            to joining user.
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
            the new participant.
          */

          socket.to(room.id).emit(
            "user-entry",
            {
              user:
                serializeUser(user)
            }
          );


          broadcastRoom(
            room
          );

          broadcastUserCount(
            room
          );


          /*
            IMPORTANT:
            Home/index.html gets the
            updated live count from Firebase.
          */

          await syncRoomToFirebase(
            room
          );

          console.log(
            "Joined:",
            user.name,
            "room:",
            room.id,
            "users:",
            room.users.size
          );

        } catch (error) {

          console.error(
            "join-room error:",
            error
          );

          socket.emit(
            "server-error",
            {
              message:
                "Unable to join room"
            }
          );
        }
      }
    );


    /* =====================================================
       TAKE SEAT
    ===================================================== */

    socket.on(
      "take-seat",
      async (data = {}) => {

        const room =
          rooms.get(
            socket.data.roomId
          );

        if (!room) {
          return;
        }

        const user =
          getSocketUser(
            room,
            socket.id
          );

        if (!user) {
          return;
        }

        let seatIndex =
          data.seatIndex;

        if (
          seatIndex === undefined
        ) {

          seatIndex =
            data.seat;
        }

        seatIndex =
          Number(seatIndex);


        /*
          Support both:
          0-8
          and 1-9.
        */

        if (
          seatIndex >= 1 &&
          seatIndex <= 9 &&
          !room.seats[seatIndex]
        ) {

          seatIndex =
            seatIndex - 1;
        }


        if (
          !Number.isInteger(
            seatIndex
          ) ||
          seatIndex < 0 ||
          seatIndex >= MAX_SEATS
        ) {

          socket.emit(
            "seat-error",
            {
              message:
                "Invalid seat"
            }
          );

          return;
        }


        /*
          If seat already occupied,
          don't overwrite it.
        */

        if (
          room.seats[seatIndex] !==
          null &&
          room.seats[seatIndex] !==
          socket.id
        ) {

          socket.emit(
            "seat-error",
            {
              message:
                "Seat already occupied"
            }
          );

          return;
        }


        /*
          Remove user's old seat.
        */

        removeUserFromSeats(
          room,
          socket.id
        );

        room.seats[seatIndex] =
          socket.id;

        room.lastActiveAt =
          Date.now();


        broadcastRoom(
          room
        );

        broadcastUserCount(
          room
        );

        await syncRoomToFirebase(
          room
        );
      }
    );


    /* =====================================================
       LEAVE SEAT
    ===================================================== */

    socket.on(
      "leave-seat",
      async () => {

        const room =
          rooms.get(
            socket.data.roomId
          );

        if (!room) {
          return;
        }

        removeUserFromSeats(
          room,
          socket.id
        );

        room.lastActiveAt =
          Date.now();

        broadcastRoom(
          room
        );

        await syncRoomToFirebase(
          room
        );
      }
    );


    /* =====================================================
       MIC STATUS
    ===================================================== */

    socket.on(
      "mic-status",
      async (data = {}) => {

        const room =
          rooms.get(
            socket.data.roomId
          );

        if (!room) {
          return;
        }

        const user =
          getSocketUser(
            room,
            socket.id
          );

        if (!user) {
          return;
        }

        user.mic =
          Boolean(
            data.mic ??
            data.enabled
          );

        room.lastActiveAt =
          Date.now();

        broadcastRoom(
          room
        );
      }
    );


    /* =====================================================
       CHAT
    ===================================================== */

    socket.on(
      "chat-message",
      async (data = {}) => {

        const room =
          rooms.get(
            socket.data.roomId
          );

        if (!room) {
          return;
        }

        const user =
          getSocketUser(
            room,
            socket.id
          );

        if (!user) {
          return;
        }

        const text =
          safeString(
            data.text,
            ""
          ).slice(0, 500);

        if (!text) {
          return;
        }

        const message = {

          id:
            Date.now() +
            "-" +
            Math.random()
              .toString(36)
              .slice(2),

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

        if (
          room.messages.length >
          100
        ) {

          room.messages =
            room.messages.slice(
              -100
            );
        }

        room.lastActiveAt =
          Date.now();

        io.to(room.id).emit(
          "chat-message",
          message
        );
      }
    );


    /* =====================================================
       SEND GIFT
    ===================================================== */

    socket.on(
      "send-gift",
      async (data = {}) => {

        const room =
          rooms.get(
            socket.data.roomId
          );

        if (!room) {
          return;
        }

        const sender =
          getSocketUser(
            room,
            socket.id
          );

        if (!sender) {
          return;
        }

        const gift = {

          id:
            data.id ||
            Date.now()
              .toString(),

          name:
            safeString(
              data.name,
              "Gift"
            ).slice(0, 60),

          emoji:
            safeString(
              data.emoji,
              "🎁"
            ).slice(0, 10),

          price:
            Math.max(
              0,
              safeNumber(
                data.price,
                0
              )
            ),

          quantity:
            Math.max(
              1,
              Math.min(
                99,
                safeNumber(
                  data.quantity,
                  1
                )
              )
            ),

          senderId:
            sender.userId,

          senderName:
            sender.name,

          senderDp:
            sender.dp,

          receiverId:
            safeString(
              data.receiverId,
              ""
            ),

          receiverName:
            safeString(
              data.receiverName,
              ""
            ),

          time:
            Date.now()
        };

        /*
          IMPORTANT:
          This event is only the room-level
          gift animation/broadcast.

          Wallet deduction should be done
          through a secure backend/Firebase
          transaction before real money use.
        */

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

        room.lastActiveAt =
          Date.now();

        io.to(room.id).emit(
          "gift-received",
          gift
        );

        io.to(room.id).emit(
          "gift",
          gift
        );
      }
    );


    /* =====================================================
       ADMIN KICK
    ===================================================== */

    socket.on(
      "admin-kick",
      async (data = {}) => {

        const room =
          rooms.get(
            socket.data.roomId
          );

        if (!room) {
          return;
        }

        if (
          !isHost(
            room,
            socket.id
          )
        ) {

          socket.emit(
            "admin-error",
            {
              message:
                "Only host can kick users"
            }
          );

          return;
        }

        const targetSocketId =
          safeString(
            data.targetSocketId ||
            data.socketId,
            ""
          );

        if (!targetSocketId) {
          return;
        }

        const target =
          room.users.get(
            targetSocketId
          );

        if (!target) {
          return;
        }

        /*
          Host cannot kick himself.
        */

        if (
          targetSocketId ===
          socket.id
        ) {
          return;
        }

        const targetSocket =
          io.sockets.sockets.get(
            targetSocketId
          );

        if (targetSocket) {

          targetSocket.emit(
            "kicked",
            {
              roomId:
                room.id,

              reason:
                "Removed by host"
            }
          );

          targetSocket.leave(
            room.id
          );
        }

        room.users.delete(
          targetSocketId
        );

        removeUserFromSeats(
          room,
          targetSocketId
        );

        room.lastActiveAt =
          Date.now();

        broadcastRoom(
          room
        );

        broadcastUserCount(
          room
        );

        if (
          room.users.size === 0
        ) {

          rooms.delete(
            room.id
          );

          await removeRoomFromFirebase(
            room.id
          );

        } else {

          await syncRoomToFirebase(
            room
          );
        }
      }
    );


    /* =====================================================
       ADMIN MUTE
    ===================================================== */

    socket.on(
      "admin-mute",
      async (data = {}) => {

        const room =
          rooms.get(
            socket.data.roomId
          );

        if (!room) {
          return;
        }

        if (
          !isHost(
            room,
            socket.id
          )
        ) {

          socket.emit(
            "admin-error",
            {
              message:
                "Only host can mute users"
            }
          );

          return;
        }

        const targetSocketId =
          safeString(
            data.targetSocketId ||
            data.socketId,
            ""
          );

        const target =
          room.users.get(
            targetSocketId
          );

        if (!target) {
          return;
        }

        target.muted =
          data.muted !== undefined
            ? Boolean(data.muted)
            : true;

        const targetSocket =
          io.sockets.sockets.get(
            targetSocketId
          );

        if (targetSocket) {

          targetSocket.emit(
            "force-mute",
            {
              muted:
                target.muted
            }
          );
        }

        room.lastActiveAt =
          Date.now();

        broadcastRoom(
          room
        );
      }
    );


    /* =====================================================
       GET ROOM STATE
    ===================================================== */

    socket.on(
      "get-room-state",
      () => {

        const room =
          rooms.get(
            socket.data.roomId
          );

        if (!room) {
          return;
        }

        socket.emit(
          "room-state",
          roomState(room)
        );
      }
    );


    /* =====================================================
       WEBRTC OFFER
    ===================================================== */

    socket.on(
      "webrtc-offer",
      (data = {}) => {

        const targetSocketId =
          safeString(
            data.targetSocketId ||
            data.toSocketId ||
            data.target,
            ""
          );

        if (!targetSocketId) {
          return;
        }

        io.to(
          targetSocketId
        ).emit(
          "webrtc-offer",
          {
            fromSocketId:
              socket.id,

            fromUserId:
              socket.data.userId ||
              "",

            offer:
              data.offer
          }
        );
      }
    );


    /* =====================================================
       WEBRTC ANSWER
    ===================================================== */

    socket.on(
      "webrtc-answer",
      (data = {}) => {

        const targetSocketId =
          safeString(
            data.targetSocketId ||
            data.toSocketId ||
            data.target,
            ""
          );

        if (!targetSocketId) {
          return;
        }

        io.to(
          targetSocketId
        ).emit(
          "webrtc-answer",
          {
            fromSocketId:
              socket.id,

            fromUserId:
              socket.data.userId ||
              "",

            answer:
              data.answer
          }
        );
      }
    );


    /* =====================================================
       ICE CANDIDATE
    ===================================================== */

    socket.on(
      "ice-candidate",
      (data = {}) => {

        const targetSocketId =
          safeString(
            data.targetSocketId ||
            data.toSocketId ||
            data.target,
            ""
          );

        if (!targetSocketId) {
          return;
        }

        io.to(
          targetSocketId
        ).emit(
          "ice-candidate",
          {
            fromSocketId:
              socket.id,

            fromUserId:
              socket.data.userId ||
              "",

            candidate:
              data.candidate
          }
        );
      }
    );


    /*
      Compatibility event.
    */
    socket.on(
      "iceCandidate",
      (data = {}) => {

        const targetSocketId =
          safeString(
            data.targetSocketId ||
            data.toSocketId ||
            data.target,
            ""
          );

        if (!targetSocketId) {
          return;
        }

        io.to(
          targetSocketId
        ).emit(
          "ice-candidate",
          {
            fromSocketId:
              socket.id,

            fromUserId:
              socket.data.userId ||
              "",

            candidate:
              data.candidate
          }
        );
      }
    );


    /* =====================================================
       DISCONNECT
    ===================================================== */

    socket.on(
      "disconnect",
      async (reason) => {

        console.log(
          "Socket disconnected:",
          socket.id,
          reason
        );

        const roomId =
          socket.data.roomId;

        if (!roomId) {
          return;
        }

        const room =
          rooms.get(
            roomId
          );

        if (!room) {
          return;
        }

        const leavingUser =
          room.users.get(
            socket.id
          );

        room.users.delete(
          socket.id
        );

        removeUserFromSeats(
          room,
          socket.id
        );

        room.lastActiveAt =
          Date.now();


        /*
          If host leaves:
          first remaining user
          becomes host automatically.
        */

        if (
          room.seats[0] === null &&
          room.users.size > 0
        ) {

          const newHost =
            room.users.keys().next().value;

          if (newHost) {

            room.seats[0] =
              newHost;
          }
        }


        /*
          Empty room:
          remove from memory + Firebase.
        */

        if (
          room.users.size === 0
        ) {

          rooms.delete(
            room.id
          );

          await removeRoomFromFirebase(
            room.id
          );

          console.log(
            "Room deleted:",
            room.id
          );

          return;
        }


        broadcastRoom(
          room
        );

        broadcastUserCount(
          room
        );

        await syncRoomToFirebase(
          room
        );

        console.log(
          "User left:",
          leavingUser
            ? leavingUser.name
            : socket.id,

          "room:",
          room.id,

          "users:",
          room.users.size
        );
      }
    );

  }
);


/* =========================================================
   STALE ROOM CLEANUP
========================================================= */

setInterval(
  async () => {

    const now =
      Date.now();

    for (
      const [
        roomId,
        room
      ] of rooms.entries()
    ) {

      if (
        room.users.size === 0
      ) {

        rooms.delete(
          roomId
        );

        await removeRoomFromFirebase(
          roomId
        );

        continue;
      }


      /*
        Refresh active rooms.
      */

      if (
        now -
        room.lastActiveAt <
        ROOM_STALE_MS
      ) {

        await syncRoomToFirebase(
          room
        );
      }
    }

  },
  30000
);


/* =========================================================
   SERVER START
========================================================= */

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "=================================="
    );

    console.log(
      "PawanVoice Room Server"
    );

    console.log(
      "Port:",
      PORT
    );

    console.log(
      "Socket.IO: ON"
    );

    console.log(
      "WebRTC Signaling: ON"
    );

    console.log(
      "Firebase Room Sync: ON"
    );

    console.log(
      "Seats:",
      MAX_SEATS
    );

    console.log(
      "TURN:",
      TURN_URL
        ? "Configured"
        : "Not configured"
    );

    console.log(
      "=================================="
    );
  }
);


/* =========================================================
   PROCESS SAFETY
========================================================= */

process.on(
  "unhandledRejection",
  (error) => {

    console.error(
      "Unhandled rejection:",
      error
    );
  }
);


process.on(
  "uncaughtException",
  (error) => {

    console.error(
      "Uncaught exception:",
      error
    );
  }
);
