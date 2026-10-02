const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

class VoiceRoom {
  constructor(roomId, seatCount = 9) {
    this.roomId = roomId;

    this.seats = Array.from(
      { length: seatCount },
      (_, i) => ({
        seatNo: i + 1,
        userId: null
      })
    );

    this.users = new Map();
    this.hostId = null;
  }

  join(userId, nickname, dp = "") {
    if (this.users.has(userId)) {
      return this.users.get(userId);
    }

    const user = {
      userId,
      nickname: nickname || "User",
      dp: dp || "",
      coins: 0,
      mic: false
    };

    this.users.set(userId, user);

    if (!this.hostId) {
      this.hostId = userId;
    }

    return user;
  }

  leave(userId) {
    this.leaveSeat(userId);
    this.users.delete(userId);

    if (this.hostId === userId) {
      const next = this.users.keys().next();
      this.hostId = next.done ? null : next.value;
    }
  }

  takeSeat(userId, seatNo) {
    const user = this.users.get(userId);
    const seat = this.seats.find(
      s => s.seatNo === Number(seatNo)
    );

    if (!user || !seat) return false;

    if (seat.userId) return false;

    const oldSeat = this.seats.find(
      s => s.userId === userId
    );

    if (oldSeat) {
      oldSeat.userId = null;
    }

    seat.userId = userId;
    return true;
  }

  leaveSeat(userId) {
    const seat = this.seats.find(
      s => s.userId === userId
    );

    if (seat) {
      seat.userId = null;
    }
  }

  setMic(userId, mic) {
    const user = this.users.get(userId);

    if (!user) return false;

    user.mic = Boolean(mic);
    return true;
  }

  state() {
    return {
      roomId: this.roomId,
      hostId: this.hostId,

      users: Array.from(
        this.users.values()
      ).map(user => ({
        userId: user.userId,
        nickname: user.nickname,
        dp: user.dp,
        coins: user.coins,
        mic: user.mic
      })),

      seats: this.seats.map(seat => {
        const user = seat.userId
          ? this.users.get(seat.userId)
          : null;

        return {
          seatNo: seat.seatNo,
          user: user
            ? {
                userId: user.userId,
                nickname: user.nickname,
                dp: user.dp,
                coins: user.coins,
                mic: user.mic
              }
            : null
        };
      })
    };
  }
}

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(
      roomId,
      new VoiceRoom(roomId, 9)
    );
  }

  return rooms.get(roomId);
}

app.get("/", (req, res) => {
  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    webRTC: true,
    seats: 9,
    rooms: rooms.size
  });
});

io.on("connection", socket => {

  console.log(
    "Socket connected:",
    socket.id
  );

  /*
   * JOIN ROOM
   */
  socket.on("joinRoom", data => {

    const roomId = String(
      data?.roomId || "10001"
    );

    const name = String(
      data?.name || "Pawan"
    ).substring(0, 30);

    const dp = String(
      data?.dp || ""
    );

    const room = getRoom(roomId);

    const user = room.join(
      socket.id,
      name,
      dp
    );

    socket.join(roomId);

    socket.data.roomId = roomId;

    socket.data.userId = socket.id;

    socket.emit("joined", {
      user,
      room: room.state()
    });

    socket.to(roomId).emit(
      "userJoined",
      {
        userId: socket.id,
        name: user.nickname,
        dp: user.dp
      }
    );

    io.to(roomId).emit(
      "roomState",
      room.state()
    );

    /*
     * Tell existing users that a new
     * WebRTC peer needs to be created.
     */
    const existingUsers =
      Array.from(room.users.values())
        .filter(
          u => u.userId !== socket.id
        );

    existingUsers.forEach(user => {

      socket.emit(
        "existingPeer",
        {
          userId: user.userId
        }
      );

    });

    console.log(
      `${name} joined ${roomId}`
    );
  });


  /*
   * TAKE SEAT
   */
  socket.on("takeSeat", data => {

    const roomId =
      socket.data.roomId;

    if (!roomId) return;

    const room =
      rooms.get(roomId);

    if (!room) return;

    const success =
      room.takeSeat(
        socket.id,
        Number(data?.seatNo)
      );

    socket.emit(
      "seatResult",
      {
        success,
        seatNo: Number(data?.seatNo)
      }
    );

    if (success) {
      io.to(roomId).emit(
        "roomState",
        room.state()
      );
    }
  });


  /*
   * LEAVE SEAT
   */
  socket.on("leaveSeat", () => {

    const roomId =
      socket.data.roomId;

    if (!roomId) return;

    const room =
      rooms.get(roomId);

    if (!room) return;

    room.leaveSeat(socket.id);

    io.to(roomId).emit(
      "roomState",
      room.state()
    );
  });


  /*
   * MICROPHONE STATUS
   */
  socket.on("micStatus", data => {

    const roomId =
      socket.data.roomId;

    if (!roomId) return;

    const room =
      rooms.get(roomId);

    if (!room) return;

    room.setMic(
      socket.id,
      Boolean(data?.mic)
    );

    io.to(roomId).emit(
      "roomState",
      room.state()
    );
  });


  /*
   * CHAT
   */
  socket.on("message", data => {

    const roomId =
      socket.data.roomId;

    if (!roomId) return;

    const room =
      rooms.get(roomId);

    if (!room) return;

    const user =
      room.users.get(socket.id);

    if (!user) return;

    const message =
      String(
        data?.message || ""
      )
      .trim()
      .substring(0, 300);

    if (!message) return;

    io.to(roomId).emit(
      "message",
      {
        userId: socket.id,
        name: user.nickname,
        dp: user.dp,
        message,
        time: Date.now()
      }
    );
  });


  /*
   * WEBRTC OFFER
   */
  socket.on("webrtc-offer", data => {

    if (!data?.to) return;

    io.to(data.to).emit(
      "webrtc-offer",
      {
        from: socket.id,
        offer: data.offer
      }
    );
  });


  /*
   * WEBRTC ANSWER
   */
  socket.on("webrtc-answer", data => {

    if (!data?.to) return;

    io.to(data.to).emit(
      "webrtc-answer",
      {
        from: socket.id,
        answer: data.answer
      }
    );
  });


  /*
   * ICE CANDIDATE
   */
  socket.on("webrtc-ice", data => {

    if (!data?.to) return;

    io.to(data.to).emit(
      "webrtc-ice",
      {
        from: socket.id,
        candidate: data.candidate
      }
    );
  });


  /*
   * LEAVE ROOM
   */
  socket.on("leaveRoom", () => {
    disconnectUser();
  });


  /*
   * DISCONNECT
   */
  socket.on("disconnect", () => {
    disconnectUser();
  });


  function disconnectUser() {

    const roomId =
      socket.data.roomId;

    if (!roomId) return;

    const room =
      rooms.get(roomId);

    if (!room) return;

    const user =
      room.users.get(socket.id);

    if (user) {

      /*
       * Tell everyone to close
       * this user's WebRTC connection.
       */
      socket.to(roomId).emit(
        "peerLeft",
        {
          userId: socket.id
        }
      );

      room.leave(socket.id);

      socket.to(roomId).emit(
        "userLeft",
        {
          userId: socket.id,
          name: user.nickname
        }
      );

      io.to(roomId).emit(
        "roomState",
        room.state()
      );
    }

    if (room.users.size === 0) {
      rooms.delete(roomId);
    }

    socket.data.roomId = null;
  }
});


const PORT =
  process.env.PORT || 3000;

server.listen(PORT, () => {

  console.log(
    `PawanVoice server running on port ${PORT}`
  );

});
