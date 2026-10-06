const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname, { extensions: ["html"] }));

/* =========================================================
   DATABASE - MEMORY
========================================================= */

const rooms = {};
const users = {};
const userSockets = {};
const socketUsers = {};

const dailyData = {};
const inventories = {};
const games = {};

/* =========================================================
   200 GIFTS
========================================================= */

const giftNames = [
  "Rose","Heart","Kiss","Coffee","Cake","Love","Star","Flower","Crown","Diamond",
  "Ring","Teddy","Rabbit","Bear","Panda","Fox","Cat","Dog","Dolphin","Butterfly",
  "Rainbow","Cloud","Moon","Sun","Fire","Ice","Music","Guitar","Drum","Microphone",
  "Rocket","Car","Bike","Plane","Ship","Castle","House","Gold","Money","Treasure",
  "Gem","Crystal","Pearl","Ruby","Emerald","Sapphire","Topaz","Amethyst","Crown Gold","Crown Diamond",
  "Magic Wand","Magic Book","Magic Ball","Magic Heart","Magic Star","Angel","Devil","Phoenix","Dragon","Unicorn",
  "Lion","Tiger","Wolf","Eagle","Peacock","Horse","Deer","Elephant","Giraffe","Monkey",
  "Koala","Penguin","Owl","Parrot","Swan","Bee","Ladybug","Butterfly Gold","Butterfly Diamond","Butterfly Rainbow",
  "Firework","Confetti","Balloon","Gift Box","Golden Box","Diamond Box","Lucky Box","Mystery Box","Treasure Box","Royal Box",
  "VIP Box","King Box","Queen Box","Love Box","Party Box","Music Box","Game Box","Winner Box","Champion Box","Legend Box",
  "Sports Car","Super Car","Golden Car","Diamond Car","Royal Car","Private Jet","Golden Jet","Luxury Yacht","Helicopter","Rocket Ship",
  "Golden Crown","Diamond Crown","Royal Crown","King Crown","Queen Crown","Emperor Crown","Empress Crown","Legend Crown","God Crown","Universe Crown",
  "Small Palace","Big Palace","Royal Palace","Golden Palace","Diamond Palace","Dream Castle","Magic Castle","Sky Castle","Moon Castle","Star Castle",
  "Golden Dragon","Diamond Dragon","Fire Dragon","Ice Dragon","Rainbow Dragon","Royal Dragon","Baby Dragon","King Dragon","Queen Dragon","Universe Dragon",
  "Golden Phoenix","Diamond Phoenix","Fire Phoenix","Ice Phoenix","Rainbow Phoenix","Royal Phoenix","Legend Phoenix","Super Phoenix","Galaxy Phoenix","Universe Phoenix",
  "Golden Unicorn","Diamond Unicorn","Rainbow Unicorn","Royal Unicorn","Magic Unicorn","Legend Unicorn","Galaxy Unicorn","Dream Unicorn","Super Unicorn","Universe Unicorn",
  "Love Rocket","Heart Rocket","Golden Rocket","Diamond Rocket","Royal Rocket","Galaxy Rocket","Universe Rocket","Dream Rocket","Legend Rocket","Super Rocket",
  "Golden Mansion","Diamond Mansion","Royal Mansion","Dream Mansion","Sky Mansion","Ocean Mansion","Galaxy Mansion","Legend Mansion","Universe Mansion","Emperor Mansion",
  "Kingdom","Royal Kingdom","Golden Kingdom","Diamond Kingdom","Dream Kingdom","Magic Kingdom","Galaxy Kingdom","Universe Kingdom","Legend Kingdom","PawanVoice Kingdom"
];

const giftPrices = [
  10,20,30,50,80,100,120,150,200,250,
  300,350,400,450,500,550,600,650,700,750,
  800,850,900,950,1000,1100,1200,1300,1400,1500,
  1600,1700,1800,1900,2000,2200,2400,2600,2800,3000,
  3200,3400,3600,3800,4000,4500,5000,5500,6000,6500,
  7000,7500,8000,8500,9000,9500,10000,11000,12000,13000,
  14000,15000,16000,17000,18000,19000,20000,22000,24000,26000,
  28000,30000,32000,34000,36000,38000,40000,42000,44000,46000,
  48000,50000,55000,60000,65000,70000,75000,80000,85000,90000,
  95000,100000,110000,120000,130000,140000,150000,160000,170000,180000,
  190000,200000,220000,240000,260000,280000,300000,320000,340000,360000,
  380000,400000,450000,500000,550000,600000,650000,700000,750000,800000,
  850000,900000,950000,1000000,1100000,1200000,1300000,1400000,1500000,1600000,
  1700000,1800000,1900000,2000000,2200000,2400000,2600000,2800000,3000000,3200000,
  3400000,3600000,3800000,4000000,4200000,4400000,4600000,4800000,5000000,5500000,
  6000000,6500000,7000000,7500000,8000000,8500000,9000000,9500000,10000000,11000000,
  12000000,13000000,14000000,15000000,16000000,17000000,18000000,19000000,20000000,25000000,
  30000000,35000000,40000000,45000000,50000000,60000000,70000000,80000000,90000000,100000000
];

const GIFTS = giftNames.map((name, i) => ({
  id: `gift_${String(i + 1).padStart(3, "0")}`,
  name,
  price: giftPrices[i] || 100,
  category:
    i < 50 ? "Small" :
    i < 100 ? "Medium" :
    i < 150 ? "Large" :
    "Luxury",
  image: `https://dummyimage.com/100x100/222/fff&text=${encodeURIComponent(name.slice(0, 8))}`
}));

/* =========================================================
   COLLECTIONS
========================================================= */

function makeItems(prefix, names, count) {
  const result = [];

  for (let i = 1; i <= count; i++) {
    result.push({
      id: `${prefix}_${i}`,
      name: names[(i - 1) % names.length] + ` ${i}`,
      price: i * 1000,
      level: Math.ceil(i / 5)
    });
  }

  return result;
}

const VEHICLES = makeItems(
  "vehicle",
  ["Car","Sports Car","Bike","Motorbike","Jet","Yacht","Helicopter","Rocket","Royal Car","Golden Car"],
  50
);

const AVATAR_FRAMES = makeItems(
  "frame",
  ["Gold","Diamond","Rainbow","Fire","Ice","Royal","VIP","Galaxy","Star","Legend"],
  50
);

const CHAT_BUBBLES = makeItems(
  "bubble",
  ["Love","Star","Fire","Rainbow","Diamond","Gold","Royal","VIP","Galaxy","Magic"],
  50
);

const PROFILE_CARDS = makeItems(
  "card",
  ["Gold","Diamond","Royal","VIP","Galaxy","Love","Legend","King","Queen","Universe"],
  50
);

const RGB_NAMES = makeItems(
  "rgb",
  ["Rainbow","Fire","Ice","Neon","Galaxy","Gold","Diamond","Royal","Magic","Legend"],
  50
);

const THEMES = makeItems(
  "theme",
  ["Dark","Ocean","Galaxy","Royal","Gold","Diamond","Fire","Ice","Rainbow","Magic"],
  50
);

const VISITOR_ITEMS = makeItems(
  "visitor",
  ["Star Visitor","VIP Visitor","Royal Visitor","Diamond Visitor","Galaxy Visitor"],
  50
);

/* =========================================================
   DAILY TASKS - 10 TYPES
========================================================= */

const DAILY_TASKS = [
  {
    id: "task_login",
    title: "Daily Login",
    description: "Open PawanVoice today",
    reward: 5000
  },
  {
    id: "task_room",
    title: "Enter Room",
    description: "Stay active in a room",
    reward: 10000
  },
  {
    id: "task_chat",
    title: "Send Chat",
    description: "Send 10 messages",
    reward: 10000
  },
  {
    id: "task_gift",
    title: "Send Gift",
    description: "Send at least 1 gift",
    reward: 15000
  },
  {
    id: "task_game",
    title: "Play Game",
    description: "Play any room game",
    reward: 15000
  },
  {
    id: "task_follow",
    title: "Follow",
    description: "Follow another user",
    reward: 5000
  },
  {
    id: "task_voice",
    title: "Voice Time",
    description: "Use voice in a room",
    reward: 20000
  },
  {
    id: "task_visit",
    title: "Visit Rooms",
    description: "Visit 3 rooms",
    reward: 10000
  },
  {
    id: "task_collect",
    title: "Collect Reward",
    description: "Collect a daily reward",
    reward: 5000
  },
  {
    id: "task_active",
    title: "Daily Activity",
    description: "Complete daily activity",
    reward: 25000
  }
];

/* =========================================================
   7 DAY LOGIN REWARD
========================================================= */

const WEEKLY_REWARDS = [
  {
    day: 1,
    coins: 100000,
    frame: null,
    vip: 0
  },
  {
    day: 2,
    coins: 200000,
    frame: null,
    vip: 0
  },
  {
    day: 3,
    coins: 300000,
    frame: "frame_3",
    vip: 0
  },
  {
    day: 4,
    coins: 400000,
    frame: null,
    vip: 0
  },
  {
    day: 5,
    coins: 500000,
    frame: "frame_5",
    vip: 0
  },
  {
    day: 6,
    coins: 600000,
    frame: null,
    vip: 0
  },
  {
    day: 7,
    coins: 1000000,
    frame: "frame_7",
    vip: 1
  }
];

/* =========================================================
   20 ROOM GAMES
========================================================= */

const ROOM_GAMES = [
  { id: "game_01", name: "Baby", type: "casual" },
  { id: "game_02", name: "Gareebi", type: "casual" },
  { id: "game_03", name: "Lucky Wheel", type: "luck" },
  { id: "game_04", name: "Dice", type: "luck" },
  { id: "game_05", name: "Guess Number", type: "casual" },
  { id: "game_06", name: "Rock Paper Scissors", type: "casual" },
  { id: "game_07", name: "Treasure Box", type: "luck" },
  { id: "game_08", name: "Bomb Game", type: "luck" },
  { id: "game_09", name: "Lucky Card", type: "luck" },
  { id: "game_10", name: "Number King", type: "competition" },
  { id: "game_11", name: "Fast Tap", type: "competition" },
  { id: "game_12", name: "Emoji Battle", type: "competition" },
  { id: "game_13", name: "Guess Emoji", type: "casual" },
  { id: "game_14", name: "Memory Card", type: "casual" },
  { id: "game_15", name: "Color Battle", type: "competition" },
  { id: "game_16", name: "Lucky Egg", type: "luck" },
  { id: "game_17", name: "Gift Battle", type: "competition" },
  { id: "game_18", name: "King Queen", type: "competition" },
  { id: "game_19", name: "Treasure Hunt", type: "luck" },
  { id: "game_20", name: "Pawan Challenge", type: "competition" }
];

/* =========================================================
   HELPERS
========================================================= */

function clean(value) {
  return String(value ?? "").trim();
}

function safe(value, fallback = "") {
  const x = clean(value);
  return x ? x.slice(0, 500) : fallback;
}

function time() {
  return Date.now();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getUser(userId, data = {}) {
  userId = clean(userId);

  if (!userId) return null;

  if (!users[userId]) {
    users[userId] = {
      userId,
      name: safe(data.name, "Pawan User"),
      dp: safe(data.dp, "https://i.pravatar.cc/150?img=12"),
      gender: safe(data.gender, "Male"),
      level: Number(data.level) || 1,
      exp: Number(data.exp) || 0,
      coins: Number(data.coins) || 0,
      diamonds: Number(data.diamonds) || 0,
      vipLevel: Number(data.vipLevel) || 0,
      following: Number(data.following) || 0,
      followers: Number(data.followers) || 0,
      visitors: Number(data.visitors) || 0,
      createdAt: time(),
      updatedAt: time()
    };
  } else {
    if (data.name) users[userId].name = safe(data.name, users[userId].name);
    if (data.dp) users[userId].dp = safe(data.dp, users[userId].dp);
    if (data.gender) users[userId].gender = safe(data.gender, users[userId].gender);
  }

  return users[userId];
}

function publicUser(user) {
  if (!user) return null;

  return {
    ...user,
    updatedAt: user.updatedAt
  };
}

function getRoom(roomId, data = {}) {
  roomId = clean(roomId);

  if (!roomId) return null;

  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      name: safe(data.roomName || data.name, "PawanVoice Room"),
      roomName: safe(data.roomName || data.name, "PawanVoice Room"),
      dp: safe(data.roomDp || data.dp, "https://i.pravatar.cc/300?img=12"),
      category: safe(data.category, "General"),
      ownerId: clean(data.ownerId || data.userId),
      owner: safe(data.owner || data.name, "Room Owner"),
      ownerDp: safe(data.ownerDp || data.dp, "https://i.pravatar.cc/150?img=12"),
      seats: Array(9).fill(null),
      users: {},
      messages: [],
      gifts: [],
      games: [],
      createdAt: time(),
      updatedAt: time()
    };
  }

  return rooms[roomId];
}

function roomState(room) {
  const seatList = Array(9).fill(null);

  for (let i = 0; i < 9; i++) {
    const seat = room.seats[i];

    if (!seat) continue;

    const uid =
      typeof seat === "string"
        ? seat
        : clean(seat.userId || seat.id);

    if (room.users[uid]) {
      seatList[i] = {
        ...publicUser(room.users[uid]),
        seatIndex: i
      };
    }
  }

  return {
    id: room.id,
    name: room.name,
    roomName: room.roomName,
    dp: room.dp,
    category: room.category,
    ownerId: room.ownerId,
    owner: room.owner,
    ownerDp: room.ownerDp,
    seats: seatList,
    users: Object.fromEntries(
      Object.entries(room.users).map(([id, u]) => [id, publicUser(u)])
    ),
    members: Object.fromEntries(
      Object.entries(room.users).map(([id, u]) => [id, publicUser(u)])
    ),
    userCount: Object.keys(room.users).length,
    gifts: room.gifts.slice(-100),
    messages: room.messages.slice(-100),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt
  };
}

function broadcastRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.updatedAt = time();

  const state = roomState(room);

  io.to(roomId).emit("room-state", state);
  io.to(roomId).emit("roomState", state);
  io.to(roomId).emit("room-updated", state);
}

function emitUserUpdate(userId) {
  const socketId = userSockets[userId];

  if (!socketId) return;

  const socket = io.sockets.sockets.get(socketId);

  if (socket) {
    socket.emit("profile-updated", publicUser(users[userId]));
  }
}

function addCoins(userId, amount) {
  const user = getUser(userId);

  if (!user) return false;

  user.coins = Math.max(
    0,
    Number(user.coins || 0) + Number(amount || 0)
  );

  user.updatedAt = time();

  emitUserUpdate(userId);

  return true;
}

function addExp(userId, amount) {
  const user = getUser(userId);

  if (!user) return false;

  user.exp = Number(user.exp || 0) + Number(amount || 0);

  while (user.exp >= 100000) {
    user.exp -= 100000;
    user.level += 1;
  }

  user.updatedAt = time();

  emitUserUpdate(userId);

  return true;
}

/* =========================================================
   DAILY DATA
========================================================= */

function getDaily(userId) {
  const date = today();

  if (!dailyData[userId]) {
    dailyData[userId] = {
      date,
      loginClaimed: false,
      weeklyDay: 1,
      tasks: {},
      roomEntered: false,
      gamePlayed: false,
      voiceUsed: false,
      chatCount: 0,
      giftsSent: 0,
      roomsVisited: 0,
      levelExpAdded: false
    };
  }

  if (dailyData[userId].date !== date) {
    dailyData[userId] = {
      date,
      loginClaimed: false,
      weeklyDay: Math.min(
        7,
        Number(dailyData[userId].weeklyDay || 1) + 1
      ),
      tasks: {},
      roomEntered: false,
      gamePlayed: false,
      voiceUsed: false,
      chatCount: 0,
      giftsSent: 0,
      roomsVisited: 0,
      levelExpAdded: false
    };
  }

  return dailyData[userId];
}

function claimDailyLogin(userId) {
  const user = getUser(userId);
  const daily = getDaily(userId);

  if (!user) {
    return {
      ok: false,
      error: "User not found"
    };
  }

  if (daily.loginClaimed) {
    return {
      ok: false,
      error: "Today's reward already claimed",
      daily
    };
  }

  const day = Math.min(
    7,
    Number(daily.weeklyDay || 1)
  );

  const reward =
    WEEKLY_REWARDS[day - 1];

  addCoins(userId, reward.coins);

  if (reward.vip) {
    user.vipLevel = Math.max(
      Number(user.vipLevel || 0),
      reward.vip
    );
  }

  if (reward.frame) {
    inventories[userId] =
      inventories[userId] || {
        frames: [],
        vehicles: [],
        bubbles: [],
        cards: [],
        rgb: [],
        themes: []
      };

    if (!inventories[userId].frames.includes(reward.frame)) {
      inventories[userId].frames.push(reward.frame);
    }
  }

  daily.loginClaimed = true;

  emitUserUpdate(userId);

  return {
    ok: true,
    day,
    reward,
    user: publicUser(user)
  };
}

function addDailyExp(userId) {
  const daily = getDaily(userId);

  if (daily.levelExpAdded) {
    return {
      ok: false,
      alreadyAdded: true
    };
  }

  daily.levelExpAdded = true;

  addExp(userId, 50000);

  return {
    ok: true,
    exp: 50000,
    user: publicUser(users[userId])
  };
}

/* =========================================================
   SOCKET.IO
========================================================= */

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

io.on("connection", socket => {
  console.log("Connected:", socket.id);

  /* ---------------------------------------------
     REGISTER USER
  --------------------------------------------- */

  socket.on("register-user", data => {
    const userId =
      clean(data?.userId || data?.id) ||
      clean(socket.id);

    const user = getUser(userId, data || {});

    userSockets[userId] = socket.id;
    socketUsers[socket.id] = userId;

    socket.data.userId = userId;

    socket.emit("profile-updated", publicUser(user));

    // Daily login activity
    getDaily(userId);
  });

  /* ---------------------------------------------
     PROFILE UPDATE
  --------------------------------------------- */

  socket.on("profile-updated", data => {
    const userId =
      clean(data?.userId) ||
      socketUsers[socket.id];

    if (!userId) return;

    const user = getUser(userId, data);

    if (data.name !== undefined) {
      user.name = safe(data.name, user.name);
    }

    if (data.dp !== undefined) {
      user.dp = safe(data.dp, user.dp);
    }

    if (data.gender !== undefined) {
      user.gender = safe(data.gender, user.gender);
    }

    user.updatedAt = time();

    // Update user in every room
    Object.values(rooms).forEach(room => {
      if (!room.users[userId]) return;

      room.users[userId].name = user.name;
      room.users[userId].dp = user.dp;
      room.users[userId].gender = user.gender;

      if (room.ownerId === userId) {
        room.owner = user.name;
        room.ownerDp = user.dp;
      }

      broadcastRoom(room.id);
    });

    socket.emit("profile-updated", publicUser(user));
  });

  socket.on("update-profile", data => {
    socket.emit("profile-updated", data);
  });

  /* ---------------------------------------------
     CREATE ROOM
  --------------------------------------------- */

  socket.on("create-room", (data, callback) => {
    const userId =
      clean(data?.ownerId || data?.userId) ||
      socketUsers[socket.id];

    if (!userId) {
      callback?.({
        ok: false,
        error: "User not registered"
      });
      return;
    }

    const roomId =
      clean(data?.roomId || data?.id) ||
      userId;

    const room = getRoom(roomId, {
      ...data,
      ownerId: userId,
      userId
    });

    room.name =
      safe(data?.roomName || data?.name, room.name);

    room.roomName = room.name;

    room.dp =
      safe(data?.roomDp || data?.dp, room.dp);

    room.category =
      safe(data?.category, room.category);

    room.ownerId = userId;

    const user = getUser(userId, data || {});

    room.owner = user.name;
    room.ownerDp = user.dp;

    socket.join(roomId);

    socket.emit("room-created", roomState(room));

    callback?.({
      ok: true,
      room: roomState(room)
    });
  });

  /* ---------------------------------------------
     JOIN ROOM
  --------------------------------------------- */

  socket.on("join-room", (data, callback) => {
    const roomId =
      clean(data?.roomId || data?.room || data?.id);

    if (!roomId) {
      callback?.({
        ok: false,
        error: "Room ID missing"
      });
      return;
    }

    const userId =
      clean(data?.userId) ||
      socketUsers[socket.id] ||
      clean(socket.id);

    const user = getUser(userId, data || {});
    const room = getRoom(roomId, data || {});

    userSockets[userId] = socket.id;
    socketUsers[socket.id] = userId;

    room.users[userId] = {
      ...user,
      socketId: socket.id,
      seatIndex:
        room.users[userId]?.seatIndex ?? null,
      muted:
        room.users[userId]?.muted || false,
      micOn:
        room.users[userId]?.micOn || false
    };

    if (!room.ownerId) {
      room.ownerId = userId;
      room.owner = user.name;
      room.ownerDp = user.dp;
    }

    // Owner automatically gets first seat
    if (
      room.ownerId === userId &&
      room.seats[0] === null
    ) {
      room.seats[0] = userId;
      room.users[userId].seatIndex = 0;
    }

    socket.join(roomId);

    const daily = getDaily(userId);

    daily.roomEntered = true;
    daily.roomsVisited += 1;

    addDailyExp(userId);

    socket.emit("room-joined", roomState(room));
    socket.emit("room-state", roomState(room));
    socket.emit("roomState", roomState(room));

    socket.to(roomId).emit("user-joined", publicUser(room.users[userId]));

    broadcastRoom(roomId);

    callback?.({
      ok: true,
      room: roomState(room)
    });
  });

  /* ---------------------------------------------
     TAKE SEAT
  --------------------------------------------- */

  socket.on("take-seat", (data, callback) => {
    const roomId = clean(data?.roomId || data?.room);
    const userId =
      clean(data?.userId) ||
      socketUsers[socket.id];

    const seatIndex = Number(
      data?.seatIndex ??
      data?.seat ??
      data?.index
    );

    const room = rooms[roomId];

    if (!room) {
      callback?.({
        ok: false,
        error: "Room not found"
      });
      return;
    }

    if (!room.users[userId]) {
      callback?.({
        ok: false,
        error: "Join room first"
      });
      return;
    }

    if (
      !Number.isInteger(seatIndex) ||
      seatIndex < 0 ||
      seatIndex > 8
    ) {
      callback?.({
        ok: false,
        error: "Invalid seat"
      });
      return;
    }

    if (room.seats[seatIndex]) {
      callback?.({
        ok: false,
        error: "Seat already taken"
      });

      socket.emit("seat-taken", {
        seatIndex
      });

      return;
    }

    // Remove previous seat
    const oldSeat = room.seats.findIndex(seat => {
      const id =
        typeof seat === "string"
          ? seat
          : clean(seat?.userId);

      return id === userId;
    });

    if (oldSeat >= 0) {
      room.seats[oldSeat] = null;
    }

    room.seats[seatIndex] = userId;
    room.users[userId].seatIndex = seatIndex;

    io.to(roomId).emit("seat-update", {
      seatIndex,
      user: publicUser(room.users[userId])
    });

    broadcastRoom(roomId);

    callback?.({
      ok: true,
      seatIndex
    });
  });

  /* ---------------------------------------------
     LEAVE SEAT
  --------------------------------------------- */

  socket.on("leave-seat", data => {
    const roomId = clean(data?.roomId || data?.room);
    const userId =
      clean(data?.userId) ||
      socketUsers[socket.id];

    const room = rooms[roomId];

    if (!room || !room.users[userId]) return;

    const oldSeat = room.seats.findIndex(seat => {
      const id =
        typeof seat === "string"
          ? seat
          : clean(seat?.userId);

      return id === userId;
    });

    if (oldSeat >= 0) {
      room.seats[oldSeat] = null;
    }

    room.users[userId].seatIndex = null;
    room.users[userId].micOn = false;

    broadcastRoom(roomId);
  });

  /* ---------------------------------------------
     MIC
  --------------------------------------------- */

  socket.on("mic-status", data => {
    const roomId = clean(data?.roomId || data?.room);
    const userId =
      clean(data?.userId) ||
      socketUsers[socket.id];

    const room = rooms[roomId];

    if (!room || !room.users[userId]) return;

    const user = room.users[userId];

    if (user.muted) {
      user.micOn = false;
    } else {
      user.micOn = !!(
        data?.micOn ??
        data?.enabled ??
        data?.on
      );

      if (user.micOn) {
        getDaily(userId).voiceUsed = true;
        addDailyExp(userId);
      }
    }

    io.to(roomId).emit("mic-status", {
      roomId,
      userId,
      micOn: user.micOn,
      muted: user.muted
    });

    broadcastRoom(roomId);
  });

  /* ---------------------------------------------
     CHAT
  --------------------------------------------- */

  function handleChat(data) {
    const roomId = clean(data?.roomId || data?.room);
    const userId =
      clean(data?.userId) ||
      socketUsers[socket.id];

    const room = rooms[roomId];

    if (!room || !room.users[userId]) return;

    const user = room.users[userId];

    if (user.muted) return;

    const text = safe(
      data?.message ||
      data?.text ||
      data?.content
    );

    if (!text) return;

    const message = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId,
      name: user.name,
      dp: user.dp,
      message: text,
      text,
      time: time()
    };

    room.messages.push(message);

    if (room.messages.length > 100) {
      room.messages = room.messages.slice(-100);
    }

    const daily = getDaily(userId);

    daily.chatCount += 1;

    addDailyExp(userId);

    io.to(roomId).emit("chat", message);
    io.to(roomId).emit("room-chat", message);
  }

  socket.on("chat", handleChat);
  socket.on("room-chat", handleChat);

  /* ---------------------------------------------
     EMOJI
  --------------------------------------------- */

  socket.on("emoji", data => {
    const roomId = clean(data?.roomId || data?.room);
    const userId =
      clean(data?.userId) ||
      socketUsers[socket.id];

    const room = rooms[roomId];

    if (!room || !room.users[userId]) return;

    io.to(roomId).emit("emoji", {
      userId,
      name: room.users[userId].name,
      emoji: safe(data?.emoji || data?.value, "❤️"),
      time: time()
    });
  });

  /* ---------------------------------------------
     200 GIFTS
  --------------------------------------------- */

  socket.on("gift", data => {
    const roomId = clean(data?.roomId || data?.room);
    const fromUserId =
      clean(data?.fromUserId || data?.senderId || data?.userId) ||
      socketUsers[socket.id];

    const room = rooms[roomId];

    if (!room || !room.users[fromUserId]) return;

    const giftId =
      clean(data?.giftId || data?.id) ||
      "gift_001";

    const gift =
      GIFTS.find(x => x.id === giftId) ||
      GIFTS[0];

    const quantity =
      Math.max(1, Math.min(99, Number(data?.quantity) || 1));

    const total =
      gift.price * quantity;

    const sender = getUser(fromUserId);

    if (Number(sender.coins || 0) < total) {
      socket.emit("gift-error", {
        message: "Not enough coins",
        required: total,
        coins: sender.coins
      });

      return;
    }

    const toUserId =
      clean(data?.toUserId || data?.receiverId);

    const receiver =
      toUserId && room.users[toUserId]
        ? getUser(toUserId)
        : null;

    sender.coins -= total;

    if (receiver) {
      // Receiver gets 50% virtual earning
      receiver.coins += Math.floor(total * 0.5);
      receiver.updatedAt = time();
    }

    sender.updatedAt = time();

    const giftEvent = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      giftId: gift.id,
      giftName: gift.name,
      giftImage: gift.image,
      price: gift.price,
      quantity,
      total,
      fromUserId,
      fromName: sender.name,
      fromDp: sender.dp,
      toUserId,
      toName: receiver?.name || safe(data?.toName, ""),
      time: time()
    };

    room.gifts.push(giftEvent);

    if (room.gifts.length > 100) {
      room.gifts = room.gifts.slice(-100);
    }

    getDaily(fromUserId).giftsSent += quantity;

    addDailyExp(fromUserId);

    emitUserUpdate(fromUserId);

    if (receiver) {
      emitUserUpdate(toUserId);
    }

    io.to(roomId).emit("gift", giftEvent);
  });

  /* ---------------------------------------------
     FOLLOW
  --------------------------------------------- */

  socket.on("follow-user", data => {
    const from =
      clean(data?.fromUserId) ||
      socketUsers[socket.id];

    const to =
      clean(data?.toUserId || data?.targetUserId);

    if (!from || !to || from === to) return;

    const target = getUser(to);

    if (!target) return;

    const user = getUser(from);

    user.following += 1;
    target.followers += 1;

    getDaily(from);

    socket.emit("follow-success", {
      fromUserId: from,
      toUserId: to
    });

    const targetSocket =
      userSockets[to] &&
      io.sockets.sockets.get(userSockets[to]);

    targetSocket?.emit("follow-received", {
      fromUserId: from,
      toUserId: to
    });
  });

  /* ---------------------------------------------
     CP REQUEST
  --------------------------------------------- */

  socket.on("cp-request", data => {
    const from =
      clean(data?.fromUserId) ||
      socketUsers[socket.id];

    const to =
      clean(data?.toUserId || data?.targetUserId);

    const targetSocket =
      userSockets[to] &&
      io.sockets.sockets.get(userSockets[to]);

    targetSocket?.emit("cp-request", {
      fromUserId: from,
      toUserId: to,
      time: time()
    });
  });

  /* ---------------------------------------------
     KICK
  --------------------------------------------- */

  socket.on("kick-user", (data, callback) => {
    const roomId = clean(data?.roomId || data?.room);
    const targetId =
      clean(data?.targetUserId || data?.userId);

    const ownerId = socketUsers[socket.id];

    const room = rooms[roomId];

    if (!room) return;

    if (room.ownerId !== ownerId) {
      callback?.({
        ok: false,
        error: "Only owner can kick"
      });
      return;
    }

    if (targetId === room.ownerId) {
      callback?.({
        ok: false,
        error: "Owner cannot be kicked"
      });
      return;
    }

    if (!room.users[targetId]) {
      callback?.({
        ok: false,
        error: "User not found"
      });
      return;
    }

    const seat = room.seats.findIndex(s => {
      const id =
        typeof s === "string"
          ? s
          : clean(s?.userId);

      return id === targetId;
    });

    if (seat >= 0) {
      room.seats[seat] = null;
    }

    delete room.users[targetId];

    const targetSocket =
      userSockets[targetId] &&
      io.sockets.sockets.get(userSockets[targetId]);

    if (targetSocket) {
      targetSocket.leave(roomId);

      targetSocket.emit("user-kicked", {
        roomId,
        userId: targetId
      });

      targetSocket.emit("kicked", {
        roomId,
        userId: targetId
      });
    }

    io.to(roomId).emit("user-left", {
      userId: targetId,
      reason: "kick"
    });

    broadcastRoom(roomId);

    callback?.({ ok: true });
  });

  /* ---------------------------------------------
     MUTE
  --------------------------------------------- */

  socket.on("mute-user", (data, callback) => {
    const roomId = clean(data?.roomId || data?.room);
    const targetId =
      clean(data?.targetUserId || data?.userId);

    const ownerId = socketUsers[socket.id];
    const room = rooms[roomId];

    if (!room) return;

    if (room.ownerId !== ownerId) {
      callback?.({
        ok: false,
        error: "Only owner can mute"
      });
      return;
    }

    const target = room.users[targetId];

    if (!target) return;

    target.muted =
      data?.muted !== undefined
        ? !!data.muted
        : !target.muted;

    if (target.muted) {
      target.micOn = false;
    }

    const targetSocket =
      userSockets[targetId] &&
      io.sockets.sockets.get(userSockets[targetId]);

    targetSocket?.emit("force-mute", {
      roomId,
      userId: targetId,
      muted: target.muted
    });

    broadcastRoom(roomId);

    callback?.({
      ok: true,
      muted: target.muted
    });
  });

  /* ---------------------------------------------
     WEBRTC
  --------------------------------------------- */

  function relayRTC(eventName, data) {
    const targetId =
      clean(
        data?.targetUserId ||
        data?.toUserId ||
        data?.remoteUserId ||
        data?.to
      );

    if (!targetId) return;

    const targetSocket =
      userSockets[targetId] &&
      io.sockets.sockets.get(userSockets[targetId]);

    if (!targetSocket) return;

    const fromId =
      socketUsers[socket.id];

    targetSocket.emit(eventName, {
      ...data,
      fromUserId: fromId,
      senderId: fromId
    });
  }

  socket.on("webrtc-offer", data => {
    relayRTC("webrtc-offer", data);
  });

  socket.on("webrtc-answer", data => {
    relayRTC("webrtc-answer", data);
  });

  socket.on("webrtc-ice", data => {
    relayRTC("webrtc-ice", data);
  });

  /* ---------------------------------------------
     DAILY REWARD
  --------------------------------------------- */

  socket.on("claim-daily-reward", (data, callback) => {
    const userId =
      clean(data?.userId) ||
      socketUsers[socket.id];

    const result =
      claimDailyLogin(userId);

    callback?.(result);

    if (result.ok) {
      socket.emit("daily-reward-claimed", result);
    }
  });

  /* ---------------------------------------------
     DAILY TASKS
  --------------------------------------------- */

  socket.on("daily-data", (data, callback) => {
    const userId =
      clean(data?.userId) ||
      socketUsers[socket.id];

    const daily = getDaily(userId);

    const tasks = DAILY_TASKS.map(task => ({
      ...task,
      completed:
        !!daily.tasks[task.id],
      claimed:
        !!daily.tasks[`${task.id}_claimed`]
    }));

    callback?.({
      ok: true,
      tasks,
      daily
    });
  });

  socket.on("claim-task", (data, callback) => {
    const userId =
      clean(data?.userId) ||
      socketUsers[socket.id];

    const taskId =
      clean(data?.taskId);

    const task =
      DAILY_TASKS.find(x => x.id === taskId);

    const daily = getDaily(userId);

    if (!task) {
      callback?.({
        ok: false,
        error: "Task not found"
      });
      return;
    }

    if (!daily.tasks[taskId]) {
      callback?.({
        ok: false,
        error: "Task not completed"
      });
      return;
    }

    if (daily.tasks[`${taskId}_claimed`]) {
      callback?.({
        ok: false,
        error: "Already claimed"
      });
      return;
    }

    daily.tasks[`${taskId}_claimed`] = true;

    addCoins(userId, task.reward);

    callback?.({
      ok: true,
      reward: task.reward,
      user: publicUser(users[userId])
    });
  });

  /* ---------------------------------------------
     COMPLETE TASK HELPER
  --------------------------------------------- */

  socket.on("complete-task", data => {
    const userId =
      clean(data?.userId) ||
      socketUsers[socket.id];

    const taskId =
      clean(data?.taskId);

    const daily = getDaily(userId);

    if (DAILY_TASKS.some(x => x.id === taskId)) {
      daily.tasks[taskId] = true;
    }
  });

  /* ---------------------------------------------
     DAILY +50,000 EXP
  --------------------------------------------- */

  socket.on("claim-daily-exp", (data, callback) => {
    const userId =
      clean(data?.userId) ||
      socketUsers[socket.id];

    const result =
      addDailyExp(userId);

    callback?.(result);

    if (result.ok) {
      socket.emit("daily-exp-added", result);
    }
  });

  /* ---------------------------------------------
     GAME START
  --------------------------------------------- */

  socket.on("game-start", (data, callback) => {
    const roomId =
      clean(data?.roomId || data?.room);

    const gameId =
      clean(data?.gameId);

    const room = rooms[roomId];

    const game =
      ROOM_GAMES.find(x => x.id === gameId);

    if (!room || !game) {
      callback?.({
        ok: false,
        error: "Game not found"
      });
      return;
    }

    const gameIdUnique =
      `${roomId}_${gameId}_${Date.now()}`;

    games[gameIdUnique] = {
      id: gameIdUnique,
      roomId,
      gameId,
      game,
      players: {},
      startedAt: time(),
      status: "running"
    };

    room.games.push(games[gameIdUnique]);

    io.to(roomId).emit("game-started", games[gameIdUnique]);

    callback?.({
      ok: true,
      game: games[gameIdUnique]
    });
  });

  /* ---------------------------------------------
     GAME JOIN
  --------------------------------------------- */

  socket.on("game-join", (data, callback) => {
    const gameKey =
      clean(data?.gameKey || data?.gameId);

    const userId =
      clean(data?.userId) ||
      socketUsers[socket.id];

    const game =
      games[gameKey];

    if (!game) {
      callback?.({
        ok: false,
        error: "Game not found"
      });
      return;
    }

    game.players[userId] = {
      userId,
      name: getUser(userId)?.name || "Guest",
      joinedAt: time()
    };

    getDaily(userId).gamePlayed = true;

    addDailyExp(userId);

    io.to(game.roomId).emit("game-player-joined", {
      gameKey,
      player: game.players[userId]
    });

    callback?.({
      ok: true,
      game
    });
  });

  /* ---------------------------------------------
     GAME ACTION
  --------------------------------------------- */

  socket.on("game-action", (data, callback) => {
    const gameKey =
      clean(data?.gameKey || data?.gameId);

    const userId =
      clean(data?.userId) ||
      socketUsers[socket.id];

    const game =
      games[gameKey];

    if (!game) {
      callback?.({
        ok: false,
        error: "Game not found"
      });
      return;
    }

    io.to(game.roomId).emit("game-action", {
      gameKey,
      userId,
      action: data?.action || null,
      value: data?.value ?? null,
      time: time()
    });

    callback?.({
      ok: true
    });
  });

  /* ---------------------------------------------
     DISCONNECT
  --------------------------------------------- */

  socket.on("disconnect", () => {
    const userId =
      socketUsers[socket.id];

    Object.values(rooms).forEach(room => {
      if (!room.users[userId]) return;

      const user =
        room.users[userId];

      const seat =
        room.seats.findIndex(s => {
          const id =
            typeof s === "string"
              ? s
              : clean(s?.userId);

          return id === userId;
        });

      if (seat >= 0) {
        room.seats[seat] = null;
      }

      delete room.users[userId];

      io.to(room.id).emit("user-left", {
        userId,
        name: user.name,
        seatIndex: seat >= 0 ? seat : null
      });

      broadcastRoom(room.id);
    });

    if (
      userId &&
      userSockets[userId] === socket.id
    ) {
      delete userSockets[userId];
    }

    delete socketUsers[socket.id];

    console.log("Disconnected:", socket.id);
  });
});

/* =========================================================
   API - GIFTS
========================================================= */

app.get("/api/gifts", (req, res) => {
  res.json({
    ok: true,
    total: GIFTS.length,
    gifts: GIFTS
  });
});

/* =========================================================
   API - COLLECTIONS
========================================================= */

app.get("/api/store", (req, res) => {
  res.json({
    ok: true,
    vehicles: VEHICLES,
    avatarFrames: AVATAR_FRAMES,
    chatBubbles: CHAT_BUBBLES,
    profileCards: PROFILE_CARDS,
    rgbNames: RGB_NAMES,
    themes: THEMES,
    visitors: VISITOR_ITEMS
  });
});

/* =========================================================
   API - EVENTS
========================================================= */

app.get("/api/events", (req, res) => {
  res.json({
    ok: true,

    events: [
      {
        id: "event_01",
        title: "7 Day Login",
        type: "daily",
        rewards: WEEKLY_REWARDS
      },
      {
        id: "event_02",
        title: "Gift Festival",
        type: "gift"
      },
      {
        id: "event_03",
        title: "Room King",
        type: "ranking"
      },
      {
        id: "event_04",
        title: "Rich King",
        type: "ranking"
      },
      {
        id: "event_05",
        title: "CP Ranking",
        type: "ranking"
      },
      {
        id: "event_06",
        title: "Family Ranking",
        type: "family"
      },
      {
        id: "event_07",
        title: "Game Festival",
        type: "game"
      },
      {
        id: "event_08",
        title: "VIP Event",
        type: "vip"
      },
      {
        id: "event_09",
        title: "New User Event",
        type: "newuser"
      },
      {
        id: "event_10",
        title: "Level Rush",
        type: "level"
      }
    ]
  });
});

/* =========================================================
   API - TASKS
========================================================= */

app.get("/api/tasks", (req, res) => {
  res.json({
    ok: true,
    tasks: DAILY_TASKS
  });
});

/* =========================================================
   API - WEEKLY REWARDS
========================================================= */

app.get("/api/weekly-rewards", (req, res) => {
  res.json({
    ok: true,
    rewards: WEEKLY_REWARDS
  });
});

/* =========================================================
   API - GAMES
========================================================= */

app.get("/api/games", (req, res) => {
  res.json({
    ok: true,
    total: ROOM_GAMES.length,
    games: ROOM_GAMES
  });
});

/* =========================================================
   API - USER
========================================================= */

app.get("/api/user/:id", (req, res) => {
  const user = getUser(req.params.id);

  if (!user) {
    return res.status(404).json({
      ok: false,
      error: "User not found"
    });
  }

  res.json({
    ok: true,
    user: publicUser(user)
  });
});

/* =========================================================
   API - ROOM
========================================================= */

app.get("/api/room/:id", (req, res) => {
  const room = rooms[clean(req.params.id)];

  if (!room) {
    return res.status(404).json({
      ok: false,
      error: "Room not found"
    });
  }

  res.json({
    ok: true,
    room: roomState(room)
  });
});

/* =========================================================
   STATUS
========================================================= */

app.get("/health", (req, res) => {
  res.json({
    app: "PawanVoice",
    status: "running",
    socketIO: true,
    seats: 9,
    gifts: GIFTS.length,
    vehicles: VEHICLES.length,
    avatarFrames: AVATAR_FRAMES.length,
    chatBubbles: CHAT_BUBBLES.length,
    profileCards: PROFILE_CARDS.length,
    rgbNames: RGB_NAMES.length,
    themes: THEMES.length,
    visitors: VISITOR_ITEMS.length,
    games: ROOM_GAMES.length,
    rooms: Object.keys(rooms).length,
    users: Object.keys(users).length,
    onlineUsers: Object.keys(userSockets).length,
    time: new Date().toISOString()
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    app: "PawanVoice",
    rooms: Object.keys(rooms).length,
    users: Object.keys(users).length,
    gifts: GIFTS.length,
    games: ROOM_GAMES.length
  });
});

/* =========================================================
   START
========================================================= */

server.listen(PORT, "0.0.0.0", () => {
  console.log("====================================");
  console.log("       PAWANVOICE SERVER");
  console.log("====================================");
  console.log(`PORT: ${PORT}`);
  console.log("Socket.IO: ON");
  console.log("9 Seats: ON");
  console.log(`Gifts: ${GIFTS.length}`);
  console.log(`Vehicles: ${VEHICLES.length}`);
  console.log(`Avatar Frames: ${AVATAR_FRAMES.length}`);
  console.log(`Chat Bubbles: ${CHAT_BUBBLES.length}`);
  console.log(`Profile Cards: ${PROFILE_CARDS.length}`);
  console.log(`RGB Names: ${RGB_NAMES.length}`);
  console.log(`Themes: ${THEMES.length}`);
  console.log(`Visitors: ${VISITOR_ITEMS.length}`);
  console.log(`Games: ${ROOM_GAMES.length}`);
  console.log("Daily Reward: ON");
  console.log("Daily Tasks: ON");
  console.log("Daily +50,000 EXP: ON");
  console.log("====================================");
});

/* =========================================================
   ERROR HANDLING
========================================================= */

process.on("uncaughtException", error => {
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", error => {
  console.error("Unhandled Rejection:", error);
});
