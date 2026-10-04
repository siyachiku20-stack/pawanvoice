const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const path = require("path");

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;


/* =========================================
   EXPRESS
========================================= */

app.use(
  cors({
    origin: "*"
  })
);

app.use(
  express.json()
);


/*
  IMPORTANT:
  HTML files इसी folder से serve होंगे.
*/

app.use(
  express.static(__dirname)
);


/* =========================================
   HOME
========================================= */

app.get("/", (req, res) => {

  res.sendFile(
    path.join(__dirname, "index.html")
  );

});


/* =========================================
   ROOM PAGE
========================================= */

app.get("/room.html", (req, res) => {

  res.sendFile(
    path.join(__dirname, "room.html")
  );

});


/* =========================================
   PROFILE
========================================= */

app.get("/profile.html", (req, res) => {

  res.sendFile(
    path.join(__dirname, "profile.html")
  );

});


/* =========================================
   VIP
========================================= */

app.get("/vip.html", (req, res) => {

  res.sendFile(
    path.join(__dirname, "vip.html")
  );

});


/* =========================================
   HEALTH
========================================= */

app.get("/health", (req, res) => {

  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    seats: 9,
    rooms: rooms.size,
    time: Date.now()
  });

});


/* =========================================
   RTC CONFIG
========================================= */

app.get("/rtc-config", (req, res) => {

  const iceServers = [

    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302"
      ]
    }

  ];


  /*
    Render Environment Variables से
    TURN server add किया जा सकता है.

    TURN_URL
    TURN_USERNAME
    TURN_PASSWORD
  */

  if (
    process.env.TURN_URL &&
    process.env.TURN_USERNAME &&
    process.env.TURN_PASSWORD
  ) {

    iceServers.push({

      urls: process.env.TURN_URL,

      username:
        process.env.TURN_USERNAME,

      credential:
        process.env.TURN_PASSWORD

    });

  }


  res.json({
    iceServers
  });

});


/* =========================================
   ROOMS
========================================= */

const rooms = new Map();


/* =========================================
   DEFAULT USER
========================================= */

function defaultUser() {

  return {

    userId: "",

    name: "Guest",

    dp:
      "https://i.pravatar.cc/200?img=12",

    level: 1,

    exp: 0,

    vipLevel: 0,

    vipExp: 0,

    avatarFrame: {
      id: "default",
      name: "Default Frame",
      image: "",
      active: true
    },

    badge: {
      id: "default",
      name: "New User",
      image: "",
      active: true
    },

    entryEffect: {
      id: "default",
      name: "Default Entry",
      image: "",
      active: true
    },

    mic: true

  };

}


/* =========================================
   CLEAN USER
========================================= */

function cleanUser(user) {

  const base =
    defaultUser();


  return {

    userId:
      String(
        user?.userId ||
        base.userId
      ),

    name:
      String(
        user?.name ||
        base.name
      ).slice(0, 40),

    dp:
      String(
        user?.dp ||
        base.dp
      ),

    level:
      Number.isFinite(
        Number(user?.level)
      )
        ? Number(user.level)
        : 1,

    exp:
      Number.isFinite(
        Number(user?.exp)
      )
        ? Number(user.exp)
        : 0,

    vipLevel:
      Number.isFinite(
        Number(user?.vipLevel)
      )
        ? Number(user.vipLevel)
        : 0,

    vipExp:
      Number.isFinite(
        Number(user?.vipExp)
      )
        ? Number(user.vipExp)
        : 0,

    avatarFrame:
      user?.avatarFrame &&
      typeof user.avatarFrame === "object"
        ? {
            id:
              String(
                user.avatarFrame.id ||
                "default"
              ),

            name:
              String(
                user.avatarFrame.name ||
                "Default Frame"
              ),

            image:
              String(
                user.avatarFrame.image ||
                ""
              ),

            active:
              user.avatarFrame.active !== false
          }
        : base.avatarFrame,

    badge:
      user?.badge &&
      typeof user.badge === "object"
        ? {
            id:
              String(
                user.badge.id ||
                "default"
              ),

            name:
              String(
                user.badge.name ||
                "New User"
              ),

            image:
              String(
                user.badge.image ||
                ""
              ),

            active:
              user.badge.active !== false
          }
        : base.badge,

    entryEffect:
      user?.entryEffect &&
      typeof user.entryEffect === "object"
        ? {
            id:
              String(
                user.entryEffect.id ||
                "default"
              ),

            name:
              String(
                user.entryEffect.name ||
                "Default Entry"
              ),

            image:
              String(
                user.entryEffect.image ||
                ""
              ),

            active:
              user.entryEffect.active !== false
          }
        : base.entryEffect,

    mic:
      user?.mic !== false

  };

}


/* =========================================
   GET / CREATE ROOM
========================================= */

function getRoom(roomId) {

  const id =
    String(
      roomId || "main"
    ).trim() || "main";


  if (!rooms.has(id)) {

    rooms.set(
      id,
      {

        id,

        name:
          "PawanVoice Room",

        dp:
          "https://i.pravatar.cc/200?img=12",

        category:
          "General",

        seats:
          Array(9).fill(null),

        users:
          new Map(),

        messages:
          [],

        gifts:
          [],

        createdAt:
          Date.now(),

        hostId:
          null

      }
    );

  }


  return rooms.get(id);

}


/* =========================================
   ROOM STATE
========================================= */

function roomState(room) {

  const users = {};


  for (
    const [userId, user] of room.users.entries()
  ) {

    users[userId] =
      cleanUser(user);

  }


  return {

    id:
      room.id,

    name:
      room.name,

    dp:
      room.dp,

    category:
      room.category,

    seats:
      room.seats.map(
        user =>
          user
            ? cleanUser(user)
            : null
      ),

    users,

    messages:
      room.messages.slice(-50),

    gifts:
      room.gifts.slice(-30)

  };

}


/* =========================================
   BROADCAST ROOM
========================================= */

function broadcastRoom(room) {

  io.to(
    room.id
  ).emit(
    "room-state",
    roomState(room)
  );

}


/* =========================================
   FIND USER SEAT
========================================= */

function findUserSeat(
  room,
  userId
) {

  return room.seats.findIndex(
    user =>
      user &&
      user.userId === userId
  );

}


/* =========================================
   FREE SEAT
========================================= */

function firstFreeSeat(room) {

  return room.seats.findIndex(
    seat => !seat
  );

}


/* =========================================
   SOCKET CONNECTION
========================================= */

io.on(
  "connection",
  socket => {

    console.log(
      "Socket connected:",
      socket.id
    );


    /* =====================================
       JOIN ROOM
    ===================================== */

    socket.on(
      "join-room",
      data => {

        try {

          const room =
            getRoom(
              data?.roomId
            );


          const user =
            cleanUser({

              userId:
                data?.userId ||
                socket.id,

              name:
                data?.name ||
                "Guest",

              dp:
                data?.dp,

              level:
                data?.level,

              exp:
                data?.exp,

              vipLevel:
                data?.vipLevel,

              vipExp:
                data?.vipExp,

              avatarFrame:
                data?.avatarFrame,

              badge:
                data?.badge,

              entryEffect:
                data?.entryEffect,

              mic:
                data?.mic !== false

            });


          socket.data.roomId =
            room.id;

          socket.data.userId =
            user.userId;


          /*
            Same user अगर पहले से किसी
            seat पर है तो duplicate नहीं.
          */

          const existingSeat =
            findUserSeat(
              room,
              user.userId
            );


          room.users.set(
            user.userId,
            user
          );


          /*
            Host नहीं है तो first user host.
          */

          if (
            !room.hostId
          ) {

            room.hostId =
              user.userId;

          }


          /*
            Existing seat नहीं है तो
            free seat automatically.
          */

          if (
            existingSeat === -1
          ) {

            const freeSeat =
              firstFreeSeat(
                room
              );


            if (
              freeSeat !== -1
            ) {

              room.seats[
                freeSeat
              ] =
                user;

            }

          } else {

            room.seats[
              existingSeat
            ] =
              user;

          }


          socket.join(
            room.id
          );


          /*
            Existing users को entry effect.
          */

          socket.to(
            room.id
          ).emit(
            "user-entry",
            cleanUser(user)
          );


          /*
            Join करने वाले को पूरा state.
          */

          socket.emit(
            "room-state",
            roomState(room)
          );


          broadcastRoom(
            room
          );


          console.log(
            `${user.name} joined ${room.id}`
          );

        } catch (error) {

          console.error(
            "join-room error:",
            error
          );

          socket.emit(
            "room-error",
            "Unable to join room"
          );

        }

      }
    );


    /* =====================================
       TAKE SEAT
    ===================================== */

    socket.on(
      "take-seat",
      data => {

        const room =
          rooms.get(
            String(
              data?.roomId || ""
            )
          );


        if (!room) {

          socket.emit(
            "room-error",
            "Room not found"
          );

          return;

        }


        const userId =
          String(
            data?.userId ||
            socket.data.userId ||
            ""
          );


        const user =
          room.users.get(
            userId
          );


        if (!user) {

          socket.emit(
            "room-error",
            "User not in room"
          );

          return;

        }


        let seat =
          Number(
            data?.seat
          );


        /*
          Client 0-based seat use करता है.
        */

        if (
          !Number.isInteger(seat)
        ) {

          socket.emit(
            "room-error",
            "Invalid seat"
          );

          return;

        }


        if (
          seat < 0 ||
          seat > 8
        ) {

          socket.emit(
            "room-error",
            "Seat must be between 1 and 9"
          );

          return;

        }


        const oldSeat =
          findUserSeat(
            room,
            userId
          );


        /*
          अगर seat already occupied है.
        */

        if (
          room.seats[seat] &&
          room.seats[seat].userId !== userId
        ) {

          socket.emit(
            "room-error",
            "Seat already occupied"
          );

          return;

        }


        if (
          oldSeat !== -1
        ) {

          room.seats[
            oldSeat
          ] =
            null;

        }


        room.seats[
          seat
        ] =
          user;


        broadcastRoom(
          room
        );

      }
    );


    /* =====================================
       LEAVE SEAT
    ===================================== */

    socket.on(
      "leave-seat",
      data => {

        const room =
          rooms.get(
            String(
              data?.roomId || ""
            )
          );


        if (!room) {
          return;
        }


        const userId =
          String(
            data?.userId ||
            socket.data.userId ||
            ""
          );


        const seat =
          findUserSeat(
            room,
            userId
          );


        if (
          seat !== -1
        ) {

          room.seats[
            seat
          ] =
            null;

        }


        broadcastRoom(
          room
        );

      }
    );


    /* =====================================
       MIC STATUS
    ===================================== */

    socket.on(
      "mic-status",
      data => {

        const room =
          rooms.get(
            String(
              data?.roomId || ""
            )
          );


        if (!room) {
          return;
        }


        const userId =
          String(
            data?.userId ||
            socket.data.userId ||
            ""
          );


        const user =
          room.users.get(
            userId
          );


        if (!user) {
          return;
        }


        user.mic =
          data?.mic !== false;


        const seat =
          findUserSeat(
            room,
            userId
          );


        if (
          seat !== -1
        ) {

          room.seats[
            seat
          ] =
            user;

        }


        broadcastRoom(
          room
        );

      }
    );


    /* =====================================
       CHAT MESSAGE
    ===================================== */

    socket.on(
      "chat-message",
      data => {

        const room =
          rooms.get(
            String(
              data?.roomId || ""
            )
          );


        if (!room) {
          return;
        }


        const userId =
          String(
            data?.userId ||
            socket.data.userId ||
            ""
          );


        const user =
          room.users.get(
            userId
          );


        const name =
          user?.name ||
          data?.name ||
          "Guest";


        const message =
          String(
            data?.message || ""
          ).trim();


        if (!message) {
          return;
        }


        const item = {

          userId,

          name,

          dp:
            user?.dp ||
            "",

          message:
            message.slice(0, 300),

          time:
            Date.now()

        };


        room.messages.push(
          item
        );


        if (
          room.messages.length >
          100
        ) {

          room.messages =
            room.messages.slice(-100);

        }


        io.to(
          room.id
        ).emit(
          "chat-message",
          item
        );

      }
    );


    /* =====================================
       SEND GIFT
    ===================================== */

    socket.on(
      "send-gift",
      data => {

        const room =
          rooms.get(
            String(
              data?.roomId || ""
            )
          );


        if (!room) {
          return;
        }


        const senderId =
          String(
            data?.senderId ||
            socket.data.userId ||
            ""
          );


        const sender =
          room.users.get(
            senderId
          );


        if (!sender) {
          return;
        }


        const gift =
          String(
            data?.gift ||
            "Gift"
          );


        const giftData = {

          userId:
            sender.userId,

          name:
            sender.name,

          dp:
            sender.dp,

          gift,

          receiverId:
            String(
              data?.receiverId ||
              ""
            ),

          transactionId:
            String(
              data?.transactionId ||
              ""
            ),

          time:
            Date.now()

        };


        room.gifts.push(
          giftData
        );


        if (
          room.gifts.length >
          50
        ) {

          room.gifts =
            room.gifts.slice(-50);

        }


        io.to(
          room.id
        ).emit(
          "gift-received",
          giftData
        );


        io.to(
          room.id
        ).emit(
          "gift",
          giftData
        );

      }
    );


    /* =====================================
       ADMIN KICK
    ===================================== */

    socket.on(
      "admin-kick",
      data => {

        const room =
          rooms.get(
            String(
              data?.roomId || ""
            )
          );


        if (!room) {
          return;
        }


        const targetId =
          String(
            data?.userId ||
            ""
          );


        if (!targetId) {
          return;
        }


        /*
          Basic authority:
          केवल host admin action कर सकता है.
        */

        const requesterId =
          socket.data.userId;


        if (
          requesterId !==
          room.hostId
        ) {

          socket.emit(
            "room-error",
            "Only host can kick users"
          );

          return;

        }


        const seat =
          findUserSeat(
            room,
            targetId
          );


        if (
          seat !== -1
        ) {

          room.seats[
            seat
          ] =
            null;

        }


        room.users.delete(
          targetId
        );


        for (
          const [
            id,
            connectedSocket
          ]
          of io.sockets.sockets
        ) {

          if (
            connectedSocket.data.roomId ===
              room.id &&
            connectedSocket.data.userId ===
              targetId
          ) {

            connectedSocket.emit(
              "kicked"
            );

            connectedSocket.leave(
              room.id
            );

            connectedSocket.data.roomId =
              null;

          }

        }


        broadcastRoom(
          room
        );

      }
    );


    /* =====================================
       ADMIN MUTE
    ===================================== */

    socket.on(
      "admin-mute",
      data => {

        const room =
          rooms.get(
            String(
              data?.roomId || ""
            )
          );


        if (!room) {
          return;
        }


        const requesterId =
          socket.data.userId;


        if (
          requesterId !==
          room.hostId
        ) {

          socket.emit(
            "room-error",
            "Only host can mute users"
          );

          return;

        }


        const targetId =
          String(
            data?.userId ||
            ""
          );


        const target =
          room.users.get(
            targetId
          );


        if (!target) {
          return;
        }


        target.mic =
          false;


        const seat =
          findUserSeat(
            room,
            targetId
          );


        if (
          seat !== -1
        ) {

          room.seats[
            seat
          ] =
            target;

        }


        for (
          const [
            id,
            connectedSocket
          ]
          of io.sockets.sockets
        ) {

          if (
            connectedSocket.data.roomId ===
              room.id &&
            connectedSocket.data.userId ===
              targetId
          ) {

            connectedSocket.emit(
              "muted",
              true
            );

          }

        }


        broadcastRoom(
          room
        );

      }
    );


    /* =====================================
       WEBRTC OFFER
    ===================================== */

    socket.on(
      "webrtc-offer",
      data => {

        const targetSocketId =
          String(
            data?.targetSocketId ||
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

            offer:
              data?.offer
          }
        );

      }
    );


    /* =====================================
       WEBRTC ANSWER
    ===================================== */

    socket.on(
      "webrtc-answer",
      data => {

        const targetSocketId =
          String(
            data?.targetSocketId ||
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

            answer:
              data?.answer
          }
        );

      }
    );


    /* =====================================
       WEBRTC ICE
    ===================================== */

    socket.on(
      "webrtc-ice",
      data => {

        const targetSocketId =
          String(
            data?.targetSocketId ||
            ""
          );


        if (!targetSocketId) {
          return;
        }


        io.to(
          targetSocketId
        ).emit(
          "webrtc-ice",
          {
            fromSocketId:
              socket.id,

            candidate:
              data?.candidate
          }
        );

      }
    );


    /* =====================================
       GET ROOM STATE
    ===================================== */

    socket.on(
      "get-room-state",
      data => {

        const room =
          rooms.get(
            String(
              data?.roomId || ""
            )
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


    /* =====================================
       LEAVE ROOM
    ===================================== */

    socket.on(
      "leave-room",
      data => {

        leaveRoom(
          socket,
          data?.roomId
        );

      }
    );


    /* =====================================
       DISCONNECT
    ===================================== */

    socket.on(
      "disconnect",
      () => {

        leaveRoom(
          socket,
          socket.data.roomId
        );

        console.log(
          "Socket disconnected:",
          socket.id
        );

      }
    );

  }
);


/* =========================================
   LEAVE ROOM FUNCTION
========================================= */

function leaveRoom(
  socket,
  roomId
) {

  if (!roomId) {
    return;
  }


  const room =
    rooms.get(
      String(roomId)
    );


  if (!room) {
    return;
  }


  const userId =
    String(
      socket.data.userId ||
      ""
    );


  if (!userId) {
    return;
  }


  const user =
    room.users.get(
      userId
    );


  /*
    Seat remove.
  */

  const seat =
    findUserSeat(
      room,
      userId
    );


  if (
    seat !== -1
  ) {

    room.seats[
      seat
    ] =
      null;

  }


  room.users.delete(
    userId
  );


  /*
    Host चला गया तो नया host.
  */

  if (
    room.hostId ===
    userId
  ) {

    const remaining =
      Array.from(
        room.users.values()
      );


    room.hostId =
      remaining.length
        ? remaining[0].userId
        : null;

  }


  socket.leave(
    room.id
  );


  /*
    Remaining users को state.
  */

  if (
    room.users.size > 0
  ) {

    io.to(
      room.id
    ).emit(
      "user-left",
      {
        userId,

        name:
          user?.name ||
          "User",

        time:
          Date.now()
      }
    );


    broadcastRoom(
      room
    );

  } else {

    /*
      Empty room memory से delete.
    */

    rooms.delete(
      room.id
    );

  }


  socket.data.roomId =
    null;

  socket.data.userId =
    null;

}


/* =========================================
   SERVER START
========================================= */

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `PawanVoice server running on port ${PORT}`
    );

  }
);
