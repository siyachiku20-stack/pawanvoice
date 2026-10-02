const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const rooms = new Map();

/*
  TURN credentials are read from Render Environment Variables.

  Optional variables:
  TURN_URL
  TURN_USERNAME
  TURN_CREDENTIAL

  Example:
  TURN_URL = turn:your-turn-server:3478
*/

function getIceServers() {

  const servers = [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "stun:stun1.l.google.com:19302"
    }
  ];

  const turnUrl = process.env.TURN_URL;
  const turnUsername = process.env.TURN_USERNAME;
  const turnCredential = process.env.TURN_CREDENTIAL;

  if (
    turnUrl &&
    turnUsername &&
    turnCredential
  ) {

    servers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential
    });

  }

  return servers;
}


/* ---------------------------
   ROOM
--------------------------- */

function getRoom(roomId) {

  if (!rooms.has(roomId)) {

    rooms.set(roomId, {
      id: roomId,
      hostSocketId: null,
      roomName: "PawanVoice Room",
      roomDp: "",
      category: "General",
      createdAt: Date.now(),
      users: new Map()
    });

  }

  return rooms.get(roomId);
}


/* ---------------------------
   ROOM USERS
--------------------------- */

function getUsers(room) {

  return Array.from(
    room.users.values()
  ).map(user => ({

    socketId: user.socketId,
    userId: user.userId,
    name: user.name,
    dp: user.dp || "",

    seat:
      user.seat === null
        ? null
        : Number(user.seat),

    mic: !!user.mic,
    speaker: !!user.speaker,
    mutedByAdmin:
      !!user.mutedByAdmin

  }));

}


/* ---------------------------
   ROOM STATE
--------------------------- */

function sendRoomState(roomId) {

  const room =
    rooms.get(roomId);

  if (!room) return;

  io.to(roomId).emit(
    "room-state",
    {

      room: {
        id: room.id,
        name: room.roomName,
        dp: room.roomDp,
        category: room.category,
        hostSocketId:
          room.hostSocketId
      },

      users:
        getUsers(room),

      hostSocketId:
        room.hostSocketId,

      count:
        room.users.size

    }
  );

}


/* ---------------------------
   DELETE SOCKET USER
--------------------------- */

function removeUser(socket) {

  const roomId =
    socket.data.roomId;

  if (!roomId) return;

  const room =
    rooms.get(roomId);

  if (!room) return;

  room.users.delete(
    socket.id
  );

  if (
    room.hostSocketId ===
    socket.id
  ) {

    const next =
      room.users
      .values()
      .next()
      .value;

    room.hostSocketId =
      next
        ? next.socketId
        : null;

  }

  socket.to(roomId).emit(
    "peer-left",
    {
      socketId:
        socket.id
    }
  );

  sendRoomState(roomId);

  io.to(roomId).emit(
    "voice-topology-change"
  );

  if (
    room.users.size === 0
  ) {

    rooms.delete(roomId);

  }

  socket.data.roomId =
    null;

}


/* ---------------------------
   HOME
--------------------------- */

app.get("/", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "index.html"
    )
  );

});


/* ---------------------------
   ROOM
--------------------------- */

app.get(
  "/room.html",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "room.html"
      )
    );

  }
);


/* ---------------------------
   HEALTH
--------------------------- */

app.get(
  "/health",
  (req, res) => {

    res.json({

      app: "PawanVoice",

      status: "running",

      socketIO: true,

      webRTC: true,

      firebaseRooms:
        true,

      seats: 9,

      rooms:
        rooms.size,

      turn:
        !!(
          process.env.TURN_URL &&
          process.env.TURN_USERNAME &&
          process.env.TURN_CREDENTIAL
        )

    });

  }
);


/* ---------------------------
   RTC CONFIG
--------------------------- */

app.get(
  "/rtc-config",
  (req, res) => {

    res.json({

      iceServers:
        getIceServers()

    });

  }
);


/* ---------------------------
   SOCKET
--------------------------- */

io.on(
  "connection",
  socket => {

    console.log(
      "CONNECTED:",
      socket.id
    );


    /* -----------------------
       JOIN ROOM
    ----------------------- */

    socket.on(
      "join-room",
      data => {

        data =
          data || {};

        const roomId =
          String(
            data.roomId ||
            "10001"
          );

        const userId =
          String(
            data.userId ||
            ""
          );

        const name =
          String(
            data.name ||
            "Guest"
          );

        const dp =
          String(
            data.dp ||
            ""
          );

        const roomName =
          String(
            data.roomName ||
            "PawanVoice Room"
          );

        const roomDp =
          String(
            data.roomDp ||
            dp ||
            ""
          );

        const category =
          String(
            data.category ||
            "General"
          );


        if (!userId) {

          socket.emit(
            "room-error",
            {
              message:
                "User ID missing"
            }
          );

          return;

        }


        if (
          socket.data.roomId
        ) {

          removeUser(
            socket
          );

        }


        const room =
          getRoom(roomId);


        room.roomName =
          roomName;

        room.roomDp =
          roomDp;

        room.category =
          category;


        socket.join(
          roomId
        );


        socket.data.roomId =
          roomId;

        socket.data.userId =
          userId;

        socket.data.name =
          name;


        if (
          !room.hostSocketId
        ) {

          room.hostSocketId =
            socket.id;

        }


        room.users.set(
          socket.id,
          {

            socketId:
              socket.id,

            userId:
              userId,

            name:
              name,

            dp:
              dp,

            seat:
              null,

            mic:
              false,

            speaker:
              true,

            mutedByAdmin:
              false

          }
        );


        socket.emit(
          "joined-room",
          {

            roomId:
              roomId,

            hostSocketId:
              room.hostSocketId,

            iceServers:
              getIceServers()

          }
        );


        socket.to(
          roomId
        ).emit(
          "peer-joined",
          {

            socketId:
              socket.id,

            userId:
              userId,

            name:
              name

          }
        );


        sendRoomState(
          roomId
        );

      }
    );


    /* -----------------------
       TAKE SEAT
    ----------------------- */

    socket.on(
      "take-seat",
      seat => {

        const room =
          rooms.get(
            socket.data.roomId
          );

        if (!room) return;

        const user =
          room.users.get(
            socket.id
          );

        if (!user) return;


        seat =
          Number(seat);


        if (
          seat < 1 ||
          seat > 9
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


        const occupied =
          Array.from(
            room.users.values()
          ).find(
            u =>
              Number(u.seat) ===
              seat &&
              u.socketId !==
              socket.id
          );


        if (occupied) {

          socket.emit(
            "seat-error",
            {
              message:
                "This seat is already occupied"
            }
          );

          return;

        }


        user.seat =
          seat;


        sendRoomState(
          room.id
        );


        io.to(room.id).emit(
          "voice-topology-change"
        );

      }
    );


    /* -----------------------
       LEAVE SEAT
    ----------------------- */

    socket.on(
      "leave-seat",
      () => {

        const room =
          rooms.get(
            socket.data.roomId
          );

        if (!room) return;

        const user =
          room.users.get(
            socket.id
          );

        if (!user) return;


        user.seat =
          null;

        user.mic =
          false;


        sendRoomState(
          room.id
        );


        io.to(room.id).emit(
          "voice-topology-change"
        );

      }
    );


    /* -----------------------
       MIC
    ----------------------- */

    socket.on(
      "mic-status",
      enabled => {

        const room =
          rooms.get(
            socket.data.roomId
          );

        if (!room) return;

        const user =
          room.users.get(
            socket.id
          );

        if (!user) return;


        if (
          enabled &&
          !user.seat
        ) {

          socket.emit(
            "room-error",
            {
              message:
                "Take a seat first"
            }
          );

          return;

        }


        if (
          enabled &&
          user.mutedByAdmin
        ) {

          socket.emit(
            "room-error",
            {
              message:
                "Admin has muted you"
            }
          );

          return;

        }


        user.mic =
          !!enabled;


        io.to(room.id).emit(
          "user-mic-status",
          {

            socketId:
              socket.id,

            enabled:
              user.mic

          }
        );


        sendRoomState(
          room.id
        );

      }
    );


    /* -----------------------
       SPEAKER
    ----------------------- */

    socket.on(
      "speaker-status",
      enabled => {

        const room =
          rooms.get(
            socket.data.roomId
          );

        if (!room) return;

        const user =
          room.users.get(
            socket.id
          );

        if (!user) return;


        user.speaker =
          !!enabled;


        socket.emit(
          "speaker-status-confirmed",
          {
            enabled:
              user.speaker
          }
        );

      }
    );


    /* -----------------------
       CHAT
    ----------------------- */

    socket.on(
      "chat-message",
      message => {

        const room =
          rooms.get(
            socket.data.roomId
          );

        if (!room) return;

        const user =
          room.users.get(
            socket.id
          );

        if (!user) return;


        const clean =
          String(
            message || ""
          )
          .trim()
          .slice(0, 500);


        if (!clean) return;


        io.to(room.id).emit(
          "chat-message",
          {

            socketId:
              socket.id,

            userId:
              user.userId,

            name:
              user.name,

            message:
              clean,

            time:
              new Date()
                .toLocaleTimeString(
                  "en-IN",
                  {
                    hour:
                      "2-digit",
                    minute:
                      "2-digit"
                  }
                )

          }
        );

      }
    );


    /* -----------------------
       GIFT
    ----------------------- */

    socket.on(
      "send-gift",
      gift => {

        const room =
          rooms.get(
            socket.data.roomId
          );

        if (!room) return;

        const user =
          room.users.get(
            socket.id
          );

        if (!user) return;


        gift =
          gift || {};


        io.to(room.id).emit(
          "gift-event",
          {

            fromSocketId:
              socket.id,

            fromName:
              user.name,

            giftName:
              String(
                gift.name ||
                "Gift"
              ),

            giftIcon:
              String(
                gift.icon ||
                "🎁"
              )

          }
        );

      }
    );


    /* -----------------------
       KICK
    ----------------------- */

    socket.on(
      "admin-kick",
      targetSocketId => {

        const room =
          rooms.get(
            socket.data.roomId
          );

        if (!room) return;


        if (
          room.hostSocketId !==
          socket.id
        ) {

          socket.emit(
            "room-error",
            {
              message:
                "Only room host can kick users"
            }
          );

          return;

        }


        if (
          targetSocketId ===
          socket.id
        ) return;


        const target =
          room.users.get(
            targetSocketId
          );

        if (!target) return;


        const targetSocket =
          io.sockets.sockets.get(
            targetSocketId
          );


        if (targetSocket) {

          targetSocket.emit(
            "kicked-from-room",
            {
              message:
                "You were removed by room host"
            }
          );

          targetSocket.leave(
            room.id
          );

          targetSocket.data.roomId =
            null;

        }


        room.users.delete(
          targetSocketId
        );


        sendRoomState(
          room.id
        );


        io.to(room.id).emit(
          "voice-topology-change"
        );

      }
    );


    /* -----------------------
       MUTE
    ----------------------- */

    socket.on(
      "admin-mute",
      targetSocketId => {

        const room =
          rooms.get(
            socket.data.roomId
          );

        if (!room) return;


        if (
          room.hostSocketId !==
          socket.id
        ) {

          socket.emit(
            "room-error",
            {
              message:
                "Only room host can mute users"
            }
          );

          return;

        }


        const target =
          room.users.get(
            targetSocketId
          );

        if (!target) return;


        target.mutedByAdmin =
          true;

        target.mic =
          false;


        const targetSocket =
          io.sockets.sockets.get(
            targetSocketId
          );


        if (targetSocket) {

          targetSocket.emit(
            "forced-mute",
            {
              message:
                "You were muted by room host"
            }
          );

        }


        sendRoomState(
          room.id
        );

      }
    );


    /* -----------------------
       WEBRTC OFFER
    ----------------------- */

    socket.on(
      "webrtc-offer",
      data => {

        if (
          !data ||
          !data.target ||
          !data.offer
        ) return;


        io.to(
          data.target
        ).emit(
          "webrtc-offer",
          {

            from:
              socket.id,

            offer:
              data.offer

          }
        );

      }
    );


    /* -----------------------
       WEBRTC ANSWER
    ----------------------- */

    socket.on(
      "webrtc-answer",
      data => {

        if (
          !data ||
          !data.target ||
          !data.answer
        ) return;


        io.to(
          data.target
        ).emit(
          "webrtc-answer",
          {

            from:
              socket.id,

            answer:
              data.answer

          }
        );

      }
    );


    /* -----------------------
       ICE
    ----------------------- */

    socket.on(
      "webrtc-ice",
      data => {

        if (
          !data ||
          !data.target ||
          !data.candidate
        ) return;


        io.to(
          data.target
        ).emit(
          "webrtc-ice",
          {

            from:
              socket.id,

            candidate:
              data.candidate

          }
        );

      }
    );


    /* -----------------------
       DISCONNECT
    ----------------------- */

    socket.on(
      "disconnect",
      () => {

        console.log(
          "DISCONNECTED:",
          socket.id
        );

        removeUser(
          socket
        );

      }
    );

  }
);


const PORT =
  process.env.PORT || 3000;


server.listen(
  PORT,
  () => {

    console.log(
      "PawanVoice running on port " +
      PORT
    );

    console.log(
      "TURN configured:",
      !!(
        process.env.TURN_URL &&
        process.env.TURN_USERNAME &&
        process.env.TURN_CREDENTIAL
      )
    );

  }
);
