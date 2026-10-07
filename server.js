const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 10000;

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));

app.use(
  express.static(__dirname, {
    extensions: ["html"],
    index: "index.html"
  })
);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"]
  },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 60000
});

/* =========================================================
   MEMORY DATABASE
   ========================================================= */

const rooms = {};
const users = {};
const userSockets = {};
const socketUsers = {};

const dailyData = {};
const inventories = {};
const games = {};
const giftHistory = {};
const giftLocks = {};
const taskProgress = {};
const weeklyClaims = {};
const roomRewards = {};
const inbox = {};

/* =========================================================
   HELPERS
   ========================================================= */

function safeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function now() {
  return Date.now();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function randomId(prefix = "") {
  return prefix + crypto.randomBytes(5).toString("hex");
}

function cleanName(name) {
  const n = safeString(name, "Pawan User").trim();
  return n.substring(0, 40) || "Pawan User";
}

function cleanDp(dp) {
  const d = safeString(dp, "https://i.pravatar.cc/200?img=12");
  return d.substring(0, 2000);
}

function getExpForNextLevel(level) {
  return Math.max(10000, safeNumber(level, 1) * 10000);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

/* =========================================================
   200 GIFTS
   ========================================================= */

const giftEmojis = [
  "🌹","❤️","💖","💎","👑","🎁","💋","💕",
  "🌸","🍫","🎂","🍰","🧸","🐻","🐰","🐼",
  "🍓","🍒","🍎","🍉","🍕","🍔","🍟","🍗",
  "🍩","🍪","🍭","🍬","☕","🍵","🍹","🥤",
  "🎈","🎉","🎊","🎀","✨","🔥","⭐","🌟",
  "⚡","🌈","☀️","🌙","🌺","🌷","🌻","🍀"
];

const giftCategories = [
  "Love",
  "Cute",
  "Food",
  "Fun",
  "Game",
  "Premium",
  "Vehicle",
  "Luxury"
];

const gifts = [];

for (let i = 1; i <= 200; i++) {
  let price;

  if (i <= 50) {
    price = i * 100;
  } else if (i <= 100) {
    price = (i - 50) * 1000;
  } else if (i <= 150) {
    price = (i - 100) * 10000;
  } else {
    price = (i - 150) * 50000;
  }

  if (price <= 0) price = 100;

  gifts.push({
    id: "gift_" + i,
    name: giftCategories[Math.floor((i - 1) / 25)] + " Gift " + i,
    emoji: giftEmojis[(i - 1) % giftEmojis.length],
    category: giftCategories[Math.floor((i - 1) / 25)],
    price,
    size:
      i <= 50
        ? "Small"
        : i <= 100
        ? "Medium"
        : i <= 150
        ? "Large"
        : i <= 190
        ? "Luxury"
        : "Mega"
  });
}

function getGift(id) {
  return gifts.find(g => String(g.id) === String(id));
}

/* =========================================================
   STORE
   ========================================================= */

const store = {
  vehicles: [],
  avatarFrames: [],
  chatBubbles: [],
  profileCards: [],
  rgbNames: [],
  themes: [],
  visitors: []
};

for (let i = 1; i <= 50; i++) {
  store.vehicles.push({
    id: "vehicle_" + i,
    name: "Vehicle " + i,
    price: i * 5000
  });

  store.avatarFrames.push({
    id: "frame_" + i,
    name: "Avatar Frame " + i,
    price: i * 3000
  });

  store.chatBubbles.push({
    id: "bubble_" + i,
    name: "Chat Bubble " + i,
    price: i * 2000
  });

  store.profileCards.push({
    id: "card_" + i,
    name: "Profile Card " + i,
    price: i * 4000
  });

  store.rgbNames.push({
    id: "rgb_" + i,
    name: "RGB Name " + i,
    price: i * 6000
  });

  store.themes.push({
    id: "theme_" + i,
    name: "Room Theme " + i,
    price: i * 7000
  });

  store.visitors.push({
    id: "visitor_" + i,
    name: "Visitor Effect " + i,
    price: i * 8000
  });
}

/* =========================================================
   DAILY TASKS
   ========================================================= */

const dailyTasks = [
  {
    id: "task_01",
    name: "Daily Login",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_02",
    name: "Enter Room",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_03",
    name: "Send Gift",
    rewardCoins: 10000,
    rewardExp: 5000
  },
  {
    id: "task_04",
    name: "Chat",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_05",
    name: "Voice",
    rewardCoins: 10000,
    rewardExp: 5000
  },
  {
    id: "task_06",
    name: "Follow User",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_07",
    name: "Game",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_08",
    name: "Emoji",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_09",
    name: "Visit Profile",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_10",
    name: "Daily Mission",
    rewardCoins: 25000,
    rewardExp: 10000
  }
];

/* =========================================================
   WEEKLY REWARDS
   ========================================================= */

const weeklyRewards = [
  {
    day: 1,
    coins: 100000,
    diamonds: 0,
    item: null,
    vipLevel: 0
  },
  {
    day: 2,
    coins: 200000,
    diamonds: 0,
    item: null,
    vipLevel: 0
  },
  {
    day: 3,
    coins: 300000,
    diamonds: 0,
    item: {
      type: "avatarFrame",
      id: "weekly_frame_03",
      name: "Special Weekly Frame"
    },
    vipLevel: 0
  },
  {
    day: 4,
    coins: 400000,
    diamonds: 0,
    item: null,
    vipLevel: 0
  },
  {
    day: 5,
    coins: 500000,
    diamonds: 0,
    item: {
      type: "gift",
      id: "weekly_special_gift",
      name: "Special Gift"
    },
    vipLevel: 0
  },
  {
    day: 6,
    coins: 600000,
    diamonds: 1000,
    item: null,
    vipLevel: 0
  },
  {
    day: 7,
    coins: 700000,
    diamonds: 0,
    item: {
      type: "vip",
      id: "vip_reward",
      name: "VIP Reward"
    },
    vipLevel: 1
  }
];

/* =========================================================
   GAMES
   ========================================================= */

const gameList = [
  "Dice",
  "Lucky Shot",
  "Cards",
  "Lucky Spin",
  "Quiz",
  "Bowling",
  "Football",
  "Basketball",
  "Pool",
  "Race",
  "Puzzle",
  "Rock Paper Scissors",
  "Treasure Hunt",
  "Wheel",
  "Number Guess",
  "Memory",
  "Battle",
  "Fishing",
  "Lottery",
  "Jackpot"
];

/* =========================================================
   USER
   ========================================================= */

function ensureUser(input = {}) {
  const id = safeString(
    input.userId ||
    input.id ||
    input.userid ||
    randomId("PV")
  );

  if (!users[id]) {
    users[id] = {
      id,
      userId: id,
      name: cleanName(input.name),
      dp: cleanDp(input.dp),
      gender: safeString(input.gender, "Male"),

      level: Math.max(1, safeNumber(input.level, 1)),
      exp: Math.max(0, safeNumber(input.exp, 0)),

      coins: Math.max(
        0,
        safeNumber(
          input.coins,
          100000
        )
      ),

      diamonds: Math.max(
        0,
        safeNumber(
          input.diamonds !== undefined
            ? input.diamonds
            : input.diamond,
          0
        )
      ),

      following: Math.max(0, safeNumber(input.following, 0)),
      followers: Math.max(0, safeNumber(input.followers, 0)),
      visitors: Math.max(0, safeNumber(input.visitors, 0)),

      vipLevel: Math.max(0, safeNumber(input.vipLevel, 0)),
      vipExp: Math.max(0, safeNumber(input.vipExp, 0)),

      avatarFrame: input.avatarFrame || null,
      badge: input.badge || null,
      entryEffect: input.entryEffect || null,

      followingUsers: {},
      createdAt: now(),
      updatedAt: now()
    };
  } else {
    const u = users[id];

    if (input.name !== undefined) u.name = cleanName(input.name);
    if (input.dp !== undefined) u.dp = cleanDp(input.dp);
    if (input.gender !== undefined) u.gender = input.gender;

    if (input.level !== undefined)
      u.level = Math.max(1, safeNumber(input.level, u.level));

    if (input.exp !== undefined)
      u.exp = Math.max(0, safeNumber(input.exp, u.exp));

    if (input.avatarFrame !== undefined)
      u.avatarFrame = input.avatarFrame;

    if (input.badge !== undefined)
      u.badge = input.badge;

    if (input.entryEffect !== undefined)
      u.entryEffect = input.entryEffect;

    u.updatedAt = now();
  }

  levelUpUser(users[id]);

  return users[id];
}

function levelUpUser(user) {
  let safety = 0;

  while (
    user.exp >= getExpForNextLevel(user.level) &&
    safety < 1000
  ) {
    user.exp -= getExpForNextLevel(user.level);
    user.level += 1;
    safety++;
  }

  return user;
}

function publicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    userId: user.userId,
    name: user.name,
    dp: user.dp,
    gender: user.gender,

    level: user.level,
    exp: user.exp,

    coins: user.coins,
    diamonds: user.diamonds,
    diamond: user.diamonds,

    following: user.following,
    followers: user.followers,
    visitors: user.visitors,

    vipLevel: user.vipLevel,
    vipExp: user.vipExp,

    avatarFrame: user.avatarFrame || null,
    badge: user.badge || null,
    entryEffect: user.entryEffect || null
  };
}

function addCoins(userId, amount) {
  const user = users[userId];
  if (!user) return 0;

  user.coins = Math.max(
    0,
    user.coins + safeNumber(amount, 0)
  );

  user.updatedAt = now();

  return user.coins;
}

function addDiamonds(userId, amount) {
  const user = users[userId];
  if (!user) return 0;

  user.diamonds = Math.max(
    0,
    user.diamonds + safeNumber(amount, 0)
  );

  user.updatedAt = now();

  return user.diamonds;
}

function addExp(userId, amount) {
  const user = users[userId];
  if (!user) return;

  user.exp += Math.max(
    0,
    safeNumber(amount, 0)
  );

  levelUpUser(user);
}

/* =========================================================
   DAILY LOGIN
   ========================================================= */

function getWeeklyDay(userId) {
  if (!weeklyClaims[userId]) {
    weeklyClaims[userId] = {
      day: 1,
      lastClaimDate: null,
      claimed: {}
    };
  }

  return weeklyClaims[userId];
}

function applyDailyLogin(userId) {
  const user = users[userId];

  if (!user) return null;

  const key = todayKey();

  if (!dailyData[userId]) {
    dailyData[userId] = {};
  }

  if (dailyData[userId].loginDate === key) {
    return {
      alreadyClaimed: true
    };
  }

  dailyData[userId].loginDate = key;

  addCoins(userId, 5000);
  addExp(userId, 5000);

  return {
    alreadyClaimed: false,
    coins: 5000,
    exp: 5000
  };
}

/* =========================================================
   TASKS
   ========================================================= */

function getTaskState(userId) {
  const key = todayKey();

  if (!taskProgress[userId]) {
    taskProgress[userId] = {};
  }

  if (taskProgress[userId].date !== key) {
    taskProgress[userId] = {
      date: key,
      progress: {},
      claimed: {}
    };
  }

  return taskProgress[userId];
}

function increaseTask(userId, taskId, amount = 1) {
  const state = getTaskState(userId);

  state.progress[taskId] =
    safeNumber(state.progress[taskId], 0) +
    amount;

  return state.progress[taskId];
}

function claimTask(userId, taskId) {
  const task = dailyTasks.find(t => t.id === taskId);

  if (!task) {
    return {
      ok: false,
      message: "Task not found"
    };
  }

  const state = getTaskState(userId);

  if (state.claimed[taskId]) {
    return {
      ok: false,
      message: "Task already claimed"
    };
  }

  const progress = safeNumber(
    state.progress[taskId],
    0
  );

  const target =
    taskId === "task_10" ? 10 : 1;

  if (progress < target) {
    return {
      ok: false,
      message: "Task not completed"
    };
  }

  state.claimed[taskId] = true;

  addCoins(userId, task.rewardCoins);
  addExp(userId, task.rewardExp);

  return {
    ok: true,
    coins: task.rewardCoins,
    exp: task.rewardExp,
    wallet: publicUser(users[userId])
  };
}

/* =========================================================
   ROOMS
   ========================================================= */

function createRoomObject(data = {}) {
  const ownerId = safeString(
    data.ownerId ||
    data.owner ||
    data.userId
  );

  const owner = users[ownerId] ||
    ensureUser({
      userId: ownerId,
      name: data.ownerName,
      dp: data.ownerDp
    });

  const roomId =
    safeString(data.id) ||
    "PV" +
    Math.floor(
      100000 +
      Math.random() * 900000
    );

  return {
    id: roomId,

    name: cleanName(
      data.name ||
      data.roomName ||
      owner.name + "'s Room"
    ),

    roomName: cleanName(
      data.roomName ||
      data.name ||
      owner.name + "'s Room"
    ),

    dp: cleanDp(
      data.dp ||
      owner.dp
    ),

    owner: owner.id,
    ownerId: owner.id,
    ownerDp: owner.dp,

    category: safeString(
      data.category,
      "General"
    ),

    users: 0,

    seats: Array(9).fill(null),

    members: {},

    mutedUsers: {},

    messages: [],

    gifts: [],

    roomExp: 0,

    topUsers: [],

    createdAt: now(),
    updatedAt: now()
  };
}

function ensureRoom(roomId) {
  const id = safeString(roomId, "main");

  if (!rooms[id]) {
    const owner = ensureUser({
      userId: "system",
      name: "PawanVoice",
      dp: "https://i.pravatar.cc/200?img=12"
    });

    rooms[id] = createRoomObject({
      id,
      ownerId: owner.id,
      name: "PawanVoice Room",
      dp: owner.dp
    });
  }

  return rooms[id];
}

function roomData(room) {
  if (!room) return null;

  return {
    id: room.id,
    name: room.name,
    roomName: room.roomName,
    dp: room.dp,

    owner: room.owner,
    ownerId: room.ownerId,
    ownerDp: room.ownerDp,

    category: room.category,

    users: room.members
      ? Object.keys(room.members).length
      : safeNumber(room.users, 0),

    seats: room.seats,

    members: room.members,

    mutedUsers: room.mutedUsers,

    gifts: ensureArray(room.gifts).slice(-100),

    roomExp: safeNumber(room.roomExp, 0),

    topUsers: room.topUsers || [],

    createdAt: room.createdAt,
    updatedAt: room.updatedAt
  };
}

function broadcastRoom(room) {
  if (!room) return;

  room.users =
    Object.keys(room.members).length;

  room.updatedAt = now();

  io.to(room.id).emit(
    "room-state",
    roomData(room)
  );

  io.to(room.id).emit(
    "room-updated",
    roomData(room)
  );
}

function removeUserFromRoom(room, userId, socketId) {
  if (!room || !userId) return;

  const member = room.members[userId];

  if (member) {
    const seat = safeNumber(member.seat, -1);

    if (
      seat >= 0 &&
      seat < 9 &&
      room.seats[seat] &&
      String(room.seats[seat].userId || room.seats[seat].id) ===
        String(userId)
    ) {
      room.seats[seat] = null;
    }

    delete room.members[userId];
  }

  room.users =
    Object.keys(room.members).length;

  if (socketId) {
    try {
      io.sockets.sockets.get(socketId)?.leave(room.id);
    } catch (e) {}
  }

  io.to(room.id).emit("user-left", {
    userId,
    roomId: room.id,
    name: member?.name || "User"
  });

  broadcastRoom(room);
}

/* =========================================================
   FOLLOW
   ========================================================= */

function followUser(fromId, targetId) {
  const from = users[fromId];
  const target = users[targetId];

  if (!from || !target) {
    return {
      ok: false,
      message: "User not found"
    };
  }

  if (String(fromId) === String(targetId)) {
    return {
      ok: false,
      message: "Cannot follow yourself"
    };
  }

  if (!from.followingUsers) {
    from.followingUsers = {};
  }

  if (from.followingUsers[targetId]) {
    return {
      ok: false,
      message: "Already following"
    };
  }

  from.followingUsers[targetId] = true;

  from.following += 1;
  target.followers += 1;

  return {
    ok: true
  };
}

/* =========================================================
   GIFT
   ========================================================= */

function processGift(data) {
  const senderId = safeString(
    data.userId ||
    data.senderId
  );

  const receiverId = safeString(
    data.targetUserId ||
    data.receiverUserId
  );

  const sender = users[senderId];
  const receiver = users[receiverId];

  if (!sender || !receiver) {
    return {
      ok: false,
      message: "Sender or receiver not found"
    };
  }

  if (senderId === receiverId) {
    return {
      ok: false,
      message: "You cannot send gift to yourself"
    };
  }

  const gift = getGift(data.giftId);

  if (!gift) {
    return {
      ok: false,
      message: "Invalid gift"
    };
  }

  let quantity = Math.floor(
    safeNumber(data.quantity, 1)
  );

  quantity = Math.max(
    1,
    Math.min(100, quantity)
  );

  const total = gift.price * quantity;

  if (sender.coins < total) {
    return {
      ok: false,
      message: "Not enough coins",
      requiredCoins: total,
      currentCoins: sender.coins
    };
  }

  const lockKey =
    senderId +
    "_" +
    receiverId +
    "_" +
    gift.id;

  if (giftLocks[lockKey]) {
    return {
      ok: false,
      message: "Gift is processing"
    };
  }

  giftLocks[lockKey] = true;

  try {
    sender.coins -= total;

    if (!inventories[receiverId]) {
      inventories[receiverId] = {
        gifts: {},
        frames: [],
        badges: [],
        vehicles: [],
        items: []
      };
    }

    if (!inventories[receiverId].gifts[gift.id]) {
      inventories[receiverId].gifts[gift.id] = 0;
    }

    inventories[receiverId].gifts[gift.id] += quantity;

    const transaction = {
      id: randomId("TX"),
      roomId: safeString(data.roomId),
      senderId,
      senderName: sender.name,
      receiverId,
      receiverName: receiver.name,

      giftId: gift.id,
      giftName: gift.name,
      giftEmoji: gift.emoji,

      price: gift.price,
      quantity,

      totalPrice: total,

      createdAt: now()
    };

    if (!giftHistory[senderId]) {
      giftHistory[senderId] = [];
    }

    if (!giftHistory[receiverId]) {
      giftHistory[receiverId] = [];
    }

    giftHistory[senderId].push(transaction);
    giftHistory[receiverId].push(transaction);

    giftHistory[senderId] =
      giftHistory[senderId].slice(-500);

    giftHistory[receiverId] =
      giftHistory[receiverId].slice(-500);

    const room = rooms[transaction.roomId];

    if (room) {
      room.gifts.push(transaction);

      room.gifts =
        room.gifts.slice(-100);

      room.roomExp +=
        Math.floor(total / 100);

      const member =
        room.members[senderId];

      if (member) {
        member.giftValue =
          safeNumber(member.giftValue, 0) +
          total;
      }

      room.topUsers =
        Object.values(room.members)
          .sort(
            (a, b) =>
              safeNumber(b.giftValue, 0) -
              safeNumber(a.giftValue, 0)
          )
          .slice(0, 3);
    }

    return {
      ok: true,
      transaction,
      remainingCoins: sender.coins,
      sender: publicUser(sender),
      receiver: publicUser(receiver)
    };

  } finally {
    setTimeout(() => {
      delete giftLocks[lockKey];
    }, 500);
  }
}

/* =========================================================
   INBOX
   ========================================================= */

function addInbox(userId, message) {
  if (!inbox[userId]) {
    inbox[userId] = [];
  }

  inbox[userId].push({
    id: randomId("MSG"),
    ...message,
    createdAt: now(),
    read: false
  });

  inbox[userId] =
    inbox[userId].slice(-200);
}

/* =========================================================
   HTTP API
   ========================================================= */

app.get("/", (req, res) => {
  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    seats: 9,
    rooms: Object.keys(rooms).length,
    users: Object.keys(users).length,
    gifts: gifts.length
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    app: "PawanVoice",
    socketIO: true,
    time: now()
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    seats: 9,
    rooms: Object.keys(rooms).length,
    users: Object.keys(users).length,
    gifts: gifts.length
  });
});

app.get("/api/gifts", (req, res) => {
  res.json(gifts);
});

app.get("/api/store", (req, res) => {
  res.json(store);
});

app.get("/api/tasks", (req, res) => {
  res.json(dailyTasks);
});

app.get("/api/events", (req, res) => {
  res.json([
    {
      id: "event_01",
      title: "7 Day Reward",
      description: "Login every day and claim rewards."
    },
    {
      id: "event_02",
      title: "New User Event",
      description: "Complete tasks and earn Coins."
    },
    {
      id: "event_03",
      title: "Room EXP Event",
      description: "Send gifts and increase Room EXP."
    }
  ]);
});

app.get("/api/weekly-rewards", (req, res) => {
  res.json(weeklyRewards);
});

/* USER */

app.get("/api/user/:id", (req, res) => {
  const user = users[req.params.id];

  if (!user) {
    return res.status(404).json({
      error: "User not found"
    });
  }

  res.json(publicUser(user));
});

app.post("/api/user", (req, res) => {
  const user = ensureUser(req.body || {});

  res.json({
    ok: true,
    user: publicUser(user)
  });
});

app.patch("/api/user/:id", (req, res) => {
  const user = ensureUser({
    ...(req.body || {}),
    userId: req.params.id
  });

  if (req.body.coins !== undefined) {
    user.coins = Math.max(
      0,
      safeNumber(req.body.coins, user.coins)
    );
  }

  if (
    req.body.diamonds !== undefined ||
    req.body.diamond !== undefined
  ) {
    user.diamonds = Math.max(
      0,
      safeNumber(
        req.body.diamonds !== undefined
          ? req.body.diamonds
          : req.body.diamond,
        user.diamonds
      )
    );
  }

  updateUserInRooms(user);

  res.json({
    ok: true,
    user: publicUser(user)
  });
});

app.post("/api/user/:userId/wallet", (req, res) => {
  const user = users[req.params.userId];

  if (!user) {
    return res.status(404).json({
      error: "User not found"
    });
  }

  if (req.body.coins !== undefined) {
    user.coins = Math.max(
      0,
      safeNumber(req.body.coins, user.coins)
    );
  }

  if (req.body.diamonds !== undefined) {
    user.diamonds = Math.max(
      0,
      safeNumber(req.body.diamonds, user.diamonds)
    );
  }

  res.json({
    ok: true,
    wallet: {
      coins: user.coins,
      diamonds: user.diamonds
    }
  });
});

/* ROOMS */

app.get("/api/room/:id", (req, res) => {
  const room = rooms[req.params.id];

  if (!room) {
    return res.status(404).json({
      error: "Room not found"
    });
  }

  res.json(roomData(room));
});

app.get("/api/rooms", (req, res) => {
  res.json(
    Object.values(rooms).map(roomData)
  );
});

app.post("/api/room", (req, res) => {
  const data = req.body || {};

  const ownerId =
    safeString(
      data.ownerId ||
      data.owner ||
      data.userId
    );

  const owner =
    ensureUser({
      userId: ownerId,
      name: data.ownerName || data.name,
      dp: data.ownerDp || data.dp
    });

  let roomId =
    safeString(data.id) ||
    "PV" +
    Math.floor(
      100000 +
      Math.random() * 900000
    );

  while (rooms[roomId]) {
    roomId =
      "PV" +
      Math.floor(
        100000 +
        Math.random() * 900000
      );
  }

  const room =
    createRoomObject({
      ...data,
      id: roomId,
      ownerId: owner.id
    });

  rooms[roomId] = room;

  res.json({
    ok: true,
    room: roomData(room)
  });
});

app.patch("/api/room/:id", (req, res) => {
  const room = rooms[req.params.id];

  if (!room) {
    return res.status(404).json({
      error: "Room not found"
    });
  }

  const requester =
    safeString(
      req.body.userId ||
      req.body.ownerId
    );

  if (
    requester &&
    requester !== room.ownerId
  ) {
    return res.status(403).json({
      error: "Only room owner can edit room"
    });
  }

  if (req.body.name !== undefined) {
    room.name =
      cleanName(req.body.name);
    room.roomName =
      room.name;
  }

  if (req.body.roomName !== undefined) {
    room.roomName =
      cleanName(req.body.roomName);
    room.name =
      room.roomName;
  }

  if (req.body.dp !== undefined) {
    room.dp =
      cleanDp(req.body.dp);
  }

  if (req.body.category !== undefined) {
    room.category =
      safeString(req.body.category);
  }

  room.updatedAt = now();

  broadcastRoom(room);

  res.json({
    ok: true,
    room: roomData(room)
  });
});

/* GIFT API */

app.post("/api/gifts/send", (req, res) => {
  const result =
    processGift(req.body || {});

  if (!result.ok) {
    return res.status(400).json(result);
  }

  res.json(result);
});

app.get("/api/gifts/history/:userId", (req, res) => {
  res.json(
    giftHistory[req.params.userId] || []
  );
});

/* WEEKLY CLAIM */

app.post("/api/weekly-rewards/claim", (req, res) => {
  const userId =
    safeString(req.body.userId);

  const user =
    users[userId] ||
    ensureUser({ userId });

  const state =
    getWeeklyDay(userId);

  const day =
    Math.min(
      7,
      Math.max(
        1,
        safeNumber(state.day, 1)
      )
    );

  const today = todayKey();

  if (state.lastClaimDate === today) {
    return res.status(400).json({
      ok: false,
      message: "Today's weekly reward already claimed"
    });
  }

  const reward =
    weeklyRewards.find(
      r => r.day === day
    );

  if (!reward) {
    return res.status(400).json({
      ok: false,
      message: "Reward not found"
    });
  }

  addCoins(
    userId,
    reward.coins
  );

  addDiamonds(
    userId,
    reward.diamonds
  );

  addExp(
    userId,
    reward.day * 5000
  );

  if (reward.item) {

    if (
      reward.item.type ===
      "avatarFrame"
    ) {

      user.avatarFrame =
        reward.item;

      if (!inventories[userId]) {
        inventories[userId] = {
          gifts: {},
          frames: [],
          badges: [],
          vehicles: [],
          items: []
        };
      }

      inventories[userId].frames.push(
        reward.item
      );
    }

    if (
      reward.item.type ===
      "gift"
    ) {

      if (!inventories[userId]) {
        inventories[userId] = {
          gifts: {},
          frames: [],
          badges: [],
          vehicles: [],
          items: []
        };
      }

      inventories[userId].items.push(
        reward.item
      );
    }

    if (
      reward.item.type ===
      "vip"
    ) {
      user.vipLevel =
        Math.max(
          user.vipLevel,
          reward.vipLevel || 1
        );
    }
  }

  state.lastClaimDate = today;
  state.claimed[day] = today;

  if (day >= 7) {
    state.day = 1;
  } else {
    state.day = day + 1;
  }

  res.json({
    ok: true,
    day,
    reward,
    user: publicUser(user)
  });
});

/* TASK CLAIM */

app.post("/api/tasks/claim", (req, res) => {
  const userId =
    safeString(req.body.userId);

  ensureUser({
    userId
  });

  const result =
    claimTask(
      userId,
      safeString(req.body.taskId)
    );

  if (!result.ok) {
    return res.status(400).json(result);
  }

  res.json(result);
});

/* =========================================================
   ROOM UPDATE USER DATA
   ========================================================= */

function updateUserInRooms(user) {

 Object.values(rooms).forEach(room => {

  const member =
   room.members[user.id];

  if (member) {

   member.name=user.name;
   member.dp=user.dp;
   member.level=user.level;

   const seat=
    safeNumber(member.seat,-1);

   if(
    seat>=0 &&
    seat<9 &&
    room.seats[seat]
   ){

    room.seats[seat]={
     ...room.seats[seat],
     name:user.name,
     dp:user.dp,
     level:user.level
    };
   }

   broadcastRoom(room);
  }
 });
}

/* =========================================================
   SOCKET.IO
   ========================================================= */

io.on("connection", socket => {

  socket.on("register-user", data => {

    const user =
      ensureUser(data || {});

    userSockets[user.id] = socket.id;
    socketUsers[socket.id] = user.id;

    socket.emit(
      "user-registered",
      publicUser(user)
    );

    socket.emit(
      "wallet-updated",
      {
        coins:user.coins,
        diamonds:user.diamonds
      }
    );

    const login =
      applyDailyLogin(user.id);

    if (login && !login.alreadyClaimed) {

      socket.emit(
        "daily-login-reward",
        login
      );
    }
  });

  /* JOIN ROOM */

  socket.on("join-room", data => {

    const roomId =
      safeString(
        data.roomId ||
        data.room ||
        "main"
      );

    const user =
      ensureUser({
        ...(data || {}),
        userId:
          data.userId ||
          data.id
      });

    const room =
      ensureRoom(roomId);

    const oldRoomId =
      socket.data.roomId;

    if (
      oldRoomId &&
      oldRoomId !== roomId
    ) {

      const oldRoom =
        rooms[oldRoomId];

      if (oldRoom) {
        removeUserFromRoom(
          oldRoom,
          user.id,
          socket.id
        );
      }
    }

    socket.join(roomId);

    socket.data.roomId =
      roomId;

    socket.data.userId =
      user.id;

    userSockets[user.id] =
      socket.id;

    socketUsers[socket.id] =
      user.id;

    room.members[user.id]={
      userId:user.id,
      id:user.id,
      name:user.name,
      dp:user.dp,
      level:user.level,
      exp:user.exp,
      micEnabled:false,
      speakerEnabled:true,
      seat:-1,
      giftValue:0,
      joinedAt:now()
    };

    increaseTask(
      user.id,
      "task_02",
      1
    );

    room.users =
      Object.keys(room.members).length;

    socket.emit(
      "room-state",
      roomData(room)
    );

    socket.emit(
      "room-joined",
      roomData(room)
    );

    socket.to(roomId).emit(
      "user-joined",
      {
        userId:user.id,
        name:user.name,
        dp:user.dp,
        roomId
      }
    );

    socket.to(roomId).emit(
      "user-entry",
      {
        userId:user.id,
        name:user.name,
        dp:user.dp
      }
    );

    broadcastRoom(room);
  });

  /* LEAVE ROOM */

  socket.on("leave-room", data => {

    const roomId =
      safeString(
        data?.roomId ||
        socket.data.roomId
      );

    const userId =
      safeString(
        data?.userId ||
        socket.data.userId
      );

    const room =
      rooms[roomId];

    if (room) {

      removeUserFromRoom(
        room,
        userId,
        socket.id
      );
    }

    socket.data.roomId=null;
  });

  /* TAKE SEAT */

  socket.on("take-seat", data => {

    const room =
      rooms[safeString(data?.roomId)];

    const userId =
      safeString(
        data?.userId ||
        socket.data.userId
      );

    const seat =
      Math.floor(
        safeNumber(data?.seat,-1)
      );

    if (!room) {
      return socket.emit(
        "seat-error",
        { message:"Room not found" }
      );
    }

    if (seat < 0 || seat > 8) {
      return socket.emit(
        "seat-error",
        { message:"Invalid seat" }
      );
    }

    if (!room.members[userId]) {
      return socket.emit(
        "seat-error",
        { message:"Join room first" }
      );
    }

    if (room.seats[seat]) {
      return socket.emit(
        "seat-taken",
        { seat }
      );
    }

    const member =
      room.members[userId];

    /* Remove old seat */

    if (
      member.seat >= 0 &&
      member.seat < 9
    ) {

      if (
        room.seats[member.seat] &&
        String(
          room.seats[member.seat].userId
        ) === String(userId)
      ) {
        room.seats[member.seat]=null;
      }
    }

    const user =
      users[userId];

    room.seats[seat]={
      userId,
      id:userId,
      name:user?.name || member.name,
      dp:user?.dp || member.dp,
      level:user?.level || member.level,
      seat,
      micEnabled:false
    };

    member.seat=seat;

    increaseTask(
      userId,
      "task_05",
      1
    );

    socket.emit(
      "seat-update",
      roomData(room)
    );

    broadcastRoom(room);
  });

  /* LEAVE SEAT */

  socket.on("leave-seat", data => {

    const room =
      rooms[safeString(data?.roomId)];

    const userId =
      safeString(
        data?.userId ||
        socket.data.userId
      );

    if (!room) return;

    const member =
      room.members[userId];

    if (!member) return;

    const seat =
      safeNumber(member.seat,-1);

    if (
      seat >= 0 &&
      seat < 9
    ) {
      room.seats[seat]=null;
    }

    member.seat=-1;
    member.micEnabled=false;

    broadcastRoom(room);
  });

  /* MIC */

  socket.on("mic-status", data => {

    const room =
      rooms[safeString(data?.roomId)];

    const userId =
      safeString(
        data?.userId ||
        socket.data.userId
      );

    if (!room) return;

    const enabled =
      data?.enabled !== false;

    const member =
      room.members[userId];

    if (member) {
      member.micEnabled=enabled;
    }

    const seat =
      safeNumber(
        member?.seat,
        -1
      );

    if (
      seat >= 0 &&
      seat < 9 &&
      room.seats[seat]
    ) {
      room.seats[seat].micEnabled=
        enabled;
    }

    io.to(room.id).emit(
      "mic-status",
      {
        roomId:room.id,
        userId,
        enabled
      }
    );

    broadcastRoom(room);
  });

  /* SPEAKER */

  socket.on("speaker-status", data => {

    const room =
      rooms[safeString(data?.roomId)];

    const userId =
      safeString(
        data?.userId ||
        socket.data.userId
      );

    if (!room) return;

    const member =
      room.members[userId];

    if (member) {
      member.speakerEnabled =
        data?.enabled !== false;
    }

    socket.emit(
      "speaker-status",
      {
        userId,
        enabled:
          data?.enabled !== false
      }
    );
  });

  /* CHAT */

  function handleChat(data) {

    const room =
      rooms[safeString(data?.roomId)];

    const userId =
      safeString(
        data?.userId ||
        socket.data.userId
      );

    if (!room) return;

    if (!room.members[userId]) {
      return;
    }

    const user =
      users[userId];

    const message =
      safeString(data?.message)
        .trim()
        .substring(0,300);

    if (!message) return;

    const item={
      id:randomId("CHAT"),
      userId,
      name:user?.name || data.name || "User",
      dp:user?.dp || data.dp || "",
      message,
      createdAt:now()
    };

    room.messages.push(item);

    room.messages =
      room.messages.slice(-300);

    increaseTask(
      userId,
      "task_04",
      1
    );

    io.to(room.id).emit(
      "chat",
      item
    );

    io.to(room.id).emit(
      "room-chat",
      item
    );
  }

  socket.on("chat",handleChat);
  socket.on("room-chat",handleChat);

  /* EMOJI */

  socket.on("emoji", data => {

    const room =
      rooms[safeString(data?.roomId)];

    const userId =
      safeString(
        data?.userId ||
        socket.data.userId
      );

    if (!room) return;

    const emoji =
      safeString(
        data?.emoji,
        "😀"
      ).substring(0,10);

    increaseTask(
      userId,
      "task_08",
      1
    );

    io.to(room.id).emit(
      "emoji",
      {
        userId,
        name:
          users[userId]?.name ||
          data?.name ||
          "User",
        emoji
      }
    );
  });

  /* GIFT */

  socket.on("gift", data => {

    const result =
      processGift(data || {});

    if (!result.ok) {

      socket.emit(
        "gift-error",
        result
      );

      return;
    }

    const transaction =
      result.transaction;

    const room =
      rooms[transaction.roomId];

    increaseTask(
      transaction.senderId,
      "task_03",
      1
    );

    socket.emit(
      "gift-sent",
      {
        ...transaction,
        remainingCoins:
          result.remainingCoins
      }
    );

    if (room) {

      io.to(room.id).emit(
        "gift-received",
        {
          ...transaction
        }
      );

      broadcastRoom(room);
    }

    socket.emit(
      "wallet-updated",
      {
        coins:
          result.remainingCoins,
        diamonds:
          users[transaction.senderId].diamonds
      }
    );
  });

  /* FOLLOW */

  socket.on("follow", data => {

    const fromId =
      safeString(
        data?.fromUserId ||
        data?.userId ||
        socket.data.userId
      );

    const targetId =
      safeString(
        data?.targetUserId
      );

    const result =
      followUser(
        fromId,
        targetId
      );

    socket.emit(
      "follow-result",
      result
    );

    if (result.ok) {

      increaseTask(
        fromId,
        "task_06",
        1
      );

      addInbox(
        targetId,
        {
          type:"follow",
          fromUserId:fromId,
          fromName:
            users[fromId]?.name ||
            "User",
          text:
            (users[fromId]?.name || "Someone")+
            " started following you."
        }
      );

      const targetSocket =
        userSockets[targetId];

      if (targetSocket) {

        io.to(targetSocket).emit(
          "inbox-message",
          inbox[targetId]?.slice(-1)[0]
        );
      }
    }
  });

  /* CP */

  socket.on("cp-request", data => {

    const fromId =
      safeString(
        data?.fromUserId ||
        data?.userId ||
        socket.data.userId
      );

    const targetId =
      safeString(
        data?.targetUserId
      );

    if (
      !users[fromId] ||
      !users[targetId]
    ) {

      return socket.emit(
        "cp-result",
        {
          ok:false,
          message:"User not found"
        }
      );
    }

    const request={
      id:randomId("CP"),
      fromUserId:fromId,
      fromName:users[fromId].name,
      targetUserId:targetId,
      status:"pending",
      createdAt:now()
    };

    addInbox(
      targetId,
      {
        type:"cp-request",
        request
      }
    );

    const targetSocket =
      userSockets[targetId];

    if (targetSocket) {

      io.to(targetSocket).emit(
        "cp-request",
        request
      );

      io.to(targetSocket).emit(
        "inbox-message",
        inbox[targetId]?.slice(-1)[0]
      );
    }

    socket.emit(
      "cp-result",
      {
        ok:true,
        request
      }
    );
  });

  /* KICK */

  socket.on("kick", data => {

    const room =
      rooms[safeString(data?.roomId)];

    const ownerId =
      safeString(
        data?.userId ||
        socket.data.userId
      );

    const targetId =
      safeString(
        data?.targetUserId
      );

    if (!room) return;

    if (
      String(room.ownerId) !==
      String(ownerId)
    ) {

      return socket.emit(
        "kick-error",
        {
          message:
            "Only room owner can kick"
        }
      );
    }

    const targetSocket =
      userSockets[targetId];

    removeUserFromRoom(
      room,
      targetId,
      targetSocket
    );

    if (targetSocket) {

      io.to(targetSocket).emit(
        "user-kicked",
        {
          userId:targetId,
          roomId:room.id
        }
      );

      io.to(targetSocket).emit(
        "kicked",
        {
          userId:targetId,
          roomId:room.id
        }
      );
    }
  });

  /* MUTE */

  socket.on("mute", data => {

    const room =
      rooms[safeString(data?.roomId)];

    const ownerId =
      safeString(
        data?.userId ||
        socket.data.userId
      );

    const targetId =
      safeString(
        data?.targetUserId
      );

    if (!room) return;

    if (
      String(room.ownerId) !==
      String(ownerId)
    ) {

      return socket.emit(
        "mute-error",
        {
          message:
            "Only room owner can mute"
        }
      );
    }

    room.mutedUsers[targetId]=
      data?.muted !== false;

    const targetSocket =
      userSockets[targetId];

    if (targetSocket) {

      io.to(targetSocket).emit(
        "force-mute",
        {
          userId:targetId,
          muted:true
        }
      );
    }

    broadcastRoom(room);
  });

  /* ROOM UPDATE */

  socket.on("room-update", data => {

    const room =
      rooms[safeString(data?.roomId)];

    const userId =
      safeString(
        data?.userId ||
        socket.data.userId
      );

    if (!room) return;

    if (
      String(room.ownerId) !==
      String(userId)
    ) {

      return socket.emit(
        "room-update-error",
        {
          message:
            "Only room owner can update room"
        }
      );
    }

    if (data.name !== undefined) {
      room.name =
        cleanName(data.name);
    }

    if (data.roomName !== undefined) {
      room.roomName =
        cleanName(data.roomName);
      room.name =
        room.roomName;
    }

    if (data.dp !== undefined) {
      room.dp =
        cleanDp(data.dp);
    }

    if (data.category !== undefined) {
      room.category =
        safeString(data.category);
    }

    const owner =
      users[room.ownerId];

    if (owner) {
      room.ownerDp =
        owner.dp;
    }

    broadcastRoom(room);

    socket.emit(
      "room-update-success",
      roomData(room)
    );
  });

  /* ROOM EXP */

  socket.on("room-exp", data => {

    const room =
      rooms[safeString(data?.roomId)];

    const userId =
      safeString(
        data?.userId ||
        socket.data.userId
      );

    if (!room) return;

    const amount =
      Math.max(
        0,
        safeNumber(
          data?.amount,
          0
        )
      );

    room.roomExp +=
      Math.min(amount,100000);

    broadcastRoom(room);

    socket.emit(
      "room-exp-updated",
      {
        roomId:room.id,
        roomExp:room.roomExp,
        userId
      }
    );
  });

  /* DAILY REWARD */

  socket.on("daily-reward", data => {

    const userId =
      safeString(
        data?.userId ||
        socket.data.userId
      );

    const user =
      users[userId];

    if (!user) return;

    const key =
      "daily_" +
      userId +
      "_" +
      todayKey();

    if (dailyData[key]) {

      return socket.emit(
        "daily-reward-result",
        {
          ok:false,
          message:
            "Already claimed today"
        }
      );
    }

    dailyData[key]=true;

    addCoins(userId,100000);

    socket.emit(
      "daily-reward-result",
      {
        ok:true,
        coins:100000,
        user:publicUser(user)
      }
    );

    socket.emit(
      "wallet-updated",
      {
        coins:user.coins,
        diamonds:user.diamonds
      }
    );
  });

  /* GAME */

  socket.on("game-start", data => {

    const room =
      rooms[safeString(data?.roomId)];

    const userId =
      safeString(
        data?.userId ||
        socket.data.userId
      );

    if (!room) return;

    const gameName =
      safeString(
        data?.game,
        "Dice"
      );

    const gameId =
      randomId("GAME");

    const result =
      Math.floor(
        Math.random()*100
      )+1;

    const game={
      id:gameId,
      roomId:room.id,
      userId,
      game:gameName,
      result,
      createdAt:now()
    };

    games[gameId]=game;

    increaseTask(
      userId,
      "task_07",
      1
    );

    io.to(room.id).emit(
      "game-result",
      game
    );
  });

  socket.on("game-action", data => {

    const room =
      rooms[safeString(data?.roomId)];

    if (!room) return;

    io.to(room.id).emit(
      "game-action",
      {
        ...data,
        createdAt:now()
      }
    );
  });

  /* =======================================================
     WEBRTC SIGNALING
     ======================================================= */

  socket.on("offer", data => {

    const target =
      userSockets[
        safeString(data?.to)
      ];

    if (!target) return;

    io.to(target).emit(
      "offer",
      {
        ...data,
        from:
          data.from ||
          socket.data.userId
      }
    );
  });

  socket.on("answer", data => {

    const target =
      userSockets[
        safeString(data?.to)
      ];

    if (!target) return;

    io.to(target).emit(
      "answer",
      {
        ...data,
        from:
          data.from ||
          socket.data.userId
      }
    );
  });

  socket.on("ice-candidate", data => {

    const target =
      userSockets[
        safeString(data?.to)
      ];

    if (!target) return;

    io.to(target).emit(
      "ice-candidate",
      {
        ...data,
        from:
          data.from ||
          socket.data.userId
      }
    );
  });

  /* aliases */

  socket.on("webrtc-offer", data => {

    const target =
      userSockets[
        safeString(data?.to)
      ];

    if (target) {
      io.to(target).emit(
        "offer",
        data
      );
    }
  });

  socket.on("webrtc-answer", data => {

    const target =
      userSockets[
        safeString(data?.to)
      ];

    if (target) {
      io.to(target).emit(
        "answer",
        data
      );
    }
  });

  socket.on("webrtc-ice", data => {

    const target =
      userSockets[
        safeString(data?.to)
      ];

    if (target) {
      io.to(target).emit(
        "ice-candidate",
        data
      );
    }
  });

  /* DISCONNECT */

  socket.on("disconnect", () => {

    const userId =
      socketUsers[socket.id];

    const roomId =
      socket.data.roomId;

    if (roomId && userId) {

      const room =
        rooms[roomId];

      if (room) {

        removeUserFromRoom(
          room,
          userId,
          socket.id
        );
      }
    }

    if (
      userId &&
      userSockets[userId] ===
      socket.id
    ) {
      delete userSockets[userId];
    }

    delete socketUsers[socket.id];
  });
});

/* =========================================================
   EMPTY ROOM CLEANUP
   ========================================================= */

setInterval(() => {

  const cutoff =
    now() - 30 * 60 * 1000;

  Object.keys(rooms).forEach(id => {

    const room=rooms[id];

    const members =
      Object.keys(
        room.members || {}
      ).length;

    if (
      members===0 &&
      room.updatedAt < cutoff &&
      id!=="main"
    ) {

      delete rooms[id];
    }
  });

}, 5 * 60 * 1000);

/* =========================================================
   START SERVER
   ========================================================= */

server.listen(PORT, () => {

  console.log(
    "===================================="
  );

  console.log(
    "PawanVoice Server Running"
  );

  console.log(
    "PORT:",
    PORT
  );

  console.log(
    "Socket.IO: ENABLED"
  );

  console.log(
    "Seats: 9"
  );

  console.log(
    "Gifts:",
    gifts.length
  );

  console.log(
    "Rooms:",
    Object.keys(rooms).length
  );

  console.log(
    "===================================="
  );
});
