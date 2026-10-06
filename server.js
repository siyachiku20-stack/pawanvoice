// ============================================================
// PawanVoice - Complete Realtime Voice Room Server
// ============================================================

const express = require("express");
const http = require("http");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
}));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ------------------------------------------------------------
// Static files
// ------------------------------------------------------------

app.use(express.static(__dirname, {
  extensions: ["html"],
  index: "index.html"
}));

// ------------------------------------------------------------
// Socket.IO
// ------------------------------------------------------------

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

// ============================================================
// MEMORY DATABASE
// ============================================================

const rooms = {};
const users = {};
const userSockets = {};
const socketUsers = {};

const dailyData = {};
const inventories = {};
const games = {};
const giftHistory = [];

const giftLocks = new Set();

const MAX_GIFT_HISTORY = 10000;

// ============================================================
// HELPERS
// ============================================================

function now() {
  return Date.now();
}

function makeId(prefix = "") {
  return prefix + crypto.randomBytes(5).toString("hex");
}

function cleanText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;

  return String(value)
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 200);
}

function cleanUserId(value) {
  return cleanText(value, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function numberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positiveInt(value, fallback = 1) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

function todayKey() {
  const d = new Date();

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
}

function randomRoomId() {
  return "PV" + Math.floor(100000 + Math.random() * 900000);
}

// ============================================================
// 200 GIFTS
// ============================================================

const giftCategories = [
  "Small",
  "Medium",
  "Large",
  "Luxury"
];

const giftNames = [
  "Heart",
  "Rose",
  "Kiss",
  "Star",
  "Like",
  "Love",
  "Tulip",
  "Sunflower",
  "Cherry",
  "Apple",
  "Orange",
  "Mango",
  "Watermelon",
  "Strawberry",
  "Lollipop",
  "Candy",
  "Cupcake",
  "Cake",
  "Donut",
  "Ice Cream",
  "Coffee",
  "Tea",
  "Burger",
  "Pizza",
  "Fries",
  "Hot Dog",
  "Popcorn",
  "Chocolate",
  "Diamond",
  "Ruby",
  "Emerald",
  "Sapphire",
  "Pearl",
  "Crown",
  "King Crown",
  "Queen Crown",
  "Ring",
  "Necklace",
  "Bracelet",
  "Watch",
  "Gift Box",
  "Present",
  "Balloon",
  "Party",
  "Firework",
  "Rocket",
  "Car",
  "Sports Car",
  "Bike",
  "Motorcycle",
  "Scooter",
  "Jet",
  "Helicopter",
  "Yacht",
  "Ship",
  "Airplane",
  "Rainbow",
  "Cloud",
  "Moon",
  "Sun",
  "Galaxy",
  "Planet",
  "Earth",
  "Moon Star",
  "Magic Wand",
  "Fairy",
  "Angel",
  "Butterfly",
  "Phoenix",
  "Dragon",
  "Unicorn",
  "Tiger",
  "Lion",
  "Panda",
  "Rabbit",
  "Cat",
  "Dog",
  "Fox",
  "Bear",
  "Monkey",
  "Koala",
  "Penguin",
  "Owl",
  "Eagle",
  "Dolphin",
  "Whale",
  "Fish",
  "Golden Fish",
  "Treasure",
  "Treasure Chest",
  "Money Bag",
  "Gold Coin",
  "Money Rain",
  "Cash",
  "Golden Crown",
  "Golden Heart",
  "Golden Rose",
  "Golden Ring",
  "Golden Car",
  "Golden Jet",
  "Golden Yacht",
  "Luxury Car",
  "Super Car",
  "Lamborghini",
  "Ferrari",
  "Rolls Royce",
  "Private Jet",
  "Royal Yacht",
  "Royal Palace",
  "Castle",
  "Diamond Castle",
  "Crystal Palace",
  "Magic Castle",
  "Love Castle",
  "Royal Horse",
  "Pegasus",
  "Dragon King",
  "Phoenix King",
  "Galaxy King",
  "Universe",
  "Galaxy Heart",
  "Planet Heart",
  "Meteor",
  "Comet",
  "Solar System",
  "Moon Palace",
  "Star Palace",
  "Space Ship",
  "Time Machine",
  "Magic Portal",
  "Magic Book",
  "Magic Sword",
  "Royal Sword",
  "Legend Sword",
  "Hero",
  "Super Hero",
  "Super Girl",
  "Princess",
  "Prince",
  "King",
  "Queen",
  "Emperor",
  "Empress",
  "Royal Couple",
  "Love Couple",
  "Wedding",
  "Wedding Ring",
  "Wedding Cake",
  "Wedding Car",
  "Love Boat",
  "Love Plane",
  "Love Rocket",
  "Cupid",
  "Cupid Arrow",
  "Love Bomb",
  "Love Firework",
  "Romantic Night",
  "Red Heart",
  "Pink Heart",
  "Blue Heart",
  "Purple Heart",
  "Rainbow Heart",
  "Crystal Heart",
  "Diamond Heart",
  "Royal Heart",
  "Super Heart",
  "Mega Heart",
  "Ultra Heart",
  "Legend Heart",
  "My Love",
  "Forever Love",
  "True Love",
  "Infinite Love",
  "Pawan Love",
  "Pawan Crown",
  "Pawan Rocket",
  "Pawan Galaxy",
  "Pawan King",
  "Pawan VIP",
  "Pawan Legend",
  "Pawan Royal",
  "Pawan Universe",
  "Pawan Grand Gift"
];

const giftEmojis = [
  "❤️",
  "🌹",
  "💋",
  "⭐",
  "👍",
  "💖",
  "🌷",
  "🌻",
  "🍒",
  "🍎",
  "🍊",
  "🥭",
  "🍉",
  "🍓",
  "🍭",
  "🍬",
  "🧁",
  "🎂",
  "🍩",
  "🍦",
  "☕",
  "🍵",
  "🍔",
  "🍕",
  "🍟",
  "🌭",
  "🍿",
  "🍫",
  "💎",
  "♦️",
  "💚",
  "💙",
  "🤍",
  "👑",
  "👑",
  "👸",
  "💍",
  "📿",
  "💎",
  "⌚",
  "🎁",
  "🎁",
  "🎈",
  "🎉",
  "🎆",
  "🚀",
  "🚗",
  "🏎️",
  "🏍️",
  "🛵",
  "🚲",
  "🚁",
  "🛥️",
  "🚢",
  "✈️",
  "🌈",
  "☁️",
  "🌙",
  "☀️",
  "🌌",
  "🪐",
  "🌍",
  "🌙",
  "🪄",
  "🧚",
  "👼",
  "🦋",
  "🔥",
  "🐉",
  "🦄",
  "🐯",
  "🦁",
  "🐼",
  "🐰",
  "🐱",
  "🐶",
  "🦊",
  "🐻",
  "🐒",
  "🐨",
  "🐧",
  "🦉",
  "🦅",
  "🐬",
  "🐋",
  "🐟",
  "🐠",
  "🐠",
  "💰",
  "🧰",
  "💰",
  "🪙",
  "💸",
  "💵",
  "👑",
  "💛",
  "🌹",
  "💍",
  "🚗",
  "✈️",
  "🚘",
  "🏎️",
  "🏎️",
  "🏎️",
  "🚗",
  "✈️",
  "🛥️",
  "🏰",
  "🏯",
  "🏛️",
  "🏰",
  "🏰",
  "🐎",
  "🪽",
  "🐉",
  "🔥",
  "🌌",
  "🌎",
  "💫",
  "🪐",
  "☄️",
  "☄️",
  "🌞",
  "🌙",
  "⭐",
  "🚀",
  "⏳",
  "🌀",
  "📖",
  "⚔️",
  "⚔️",
  "🗡️",
  "🦸",
  "🦸‍♀️",
  "👸",
  "🤴",
  "👑",
  "👑",
  "👑",
  "👸",
  "💑",
  "💞",
  "💒",
  "💍",
  "🎂",
  "🚘",
  "🚢",
  "✈️",
  "🚀",
  "🏹",
  "💘",
  "💣",
  "🎆",
  "🌃",
  "❤️",
  "💗",
  "💙",
  "💜",
  "💓",
  "💎",
  "💎",
  "❤️",
  "💖",
  "💗",
  "💝",
  "💘",
  "❤️",
  "💞",
  "💕",
  "♾️",
  "❤️",
  "👑",
  "🚀",
  "🌌",
  "👑",
  "💎",
  "🔥",
  "🏰",
  "🌌",
  "🎁"
];

const gifts = {};

function getGiftPrice(index) {
  if (index < 50) {
    return (index + 1) * 100;
  }

  if (index < 100) {
    return (index - 49) * 1000;
  }

  if (index < 150) {
    return (index - 99) * 10000;
  }

  return (index - 149) * 50000;
}

for (let i = 0; i < 200; i++) {
  const id = `gift_${String(i + 1).padStart(3, "0")}`;

  let category = "Small";

  if (i >= 50 && i < 100) category = "Medium";
  if (i >= 100 && i < 150) category = "Large";
  if (i >= 150) category = "Luxury";

  gifts[id] = {
    id,
    name: giftNames[i] || `Pawan Gift ${i + 1}`,
    emoji: giftEmojis[i] || "🎁",
    image: "",
    category,
    price: getGiftPrice(i),
    sort: i + 1
  };
}

// ============================================================
// STORE ITEMS
// ============================================================

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
    id: `vehicle_${String(i).padStart(2, "0")}`,
    name: `Vehicle ${i}`,
    price: i * 50000,
    type: "vehicle"
  });

  store.avatarFrames.push({
    id: `avatar_frame_${String(i).padStart(2, "0")}`,
    name: `Avatar Frame ${i}`,
    price: i * 10000,
    type: "avatarFrame"
  });

  store.chatBubbles.push({
    id: `chat_bubble_${String(i).padStart(2, "0")}`,
    name: `Chat Bubble ${i}`,
    price: i * 5000,
    type: "chatBubble"
  });

  store.profileCards.push({
    id: `profile_card_${String(i).padStart(2, "0")}`,
    name: `Profile Card ${i}`,
    price: i * 8000,
    type: "profileCard"
  });

  store.rgbNames.push({
    id: `rgb_name_${String(i).padStart(2, "0")}`,
    name: `RGB Name ${i}`,
    price: i * 12000,
    type: "rgbName"
  });

  store.themes.push({
    id: `theme_${String(i).padStart(2, "0")}`,
    name: `Theme ${i}`,
    price: i * 15000,
    type: "theme"
  });

  store.visitors.push({
    id: `visitor_${String(i).padStart(2, "0")}`,
    name: `Visitor Effect ${i}`,
    price: i * 7000,
    type: "visitor"
  });
}

// ============================================================
// DAILY TASKS
// ============================================================

const dailyTasks = [
  {
    id: "task_01",
    name: "Login Today",
    description: "Open PawanVoice today",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_02",
    name: "Enter a Room",
    description: "Join any voice room",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_03",
    name: "Send a Gift",
    description: "Send at least one gift",
    rewardCoins: 10000,
    rewardExp: 5000
  },
  {
    id: "task_04",
    name: "Chat With Friends",
    description: "Send 5 chat messages",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_05",
    name: "Use Voice Room",
    description: "Stay in a room",
    rewardCoins: 10000,
    rewardExp: 5000
  },
  {
    id: "task_06",
    name: "Follow Someone",
    description: "Follow a user",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_07",
    name: "Play a Game",
    description: "Play one room game",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_08",
    name: "Send Emoji",
    description: "Send 10 emojis",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_09",
    name: "Visit Profile",
    description: "Visit another profile",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_10",
    name: "Daily Mission",
    description: "Complete all available daily activity",
    rewardCoins: 25000,
    rewardExp: 10000
  }
];

// ============================================================
// 7 DAY LOGIN REWARDS
// ============================================================

const weeklyRewards = [
  {
    day: 1,
    coins: 100000,
    exp: 5000,
    item: null,
    vip: 0
  },
  {
    day: 2,
    coins: 200000,
    exp: 10000,
    item: null,
    vip: 0
  },
  {
    day: 3,
    coins: 300000,
    exp: 15000,
    item: {
      type: "avatarFrame",
      id: "weekly_frame_03",
      name: "Day 3 Special Frame"
    },
    vip: 0
  },
  {
    day: 4,
    coins: 400000,
    exp: 20000,
    item: null,
    vip: 0
  },
  {
    day: 5,
    coins: 500000,
    exp: 25000,
    item: {
      type: "avatarFrame",
      id: "weekly_frame_05",
      name: "Day 5 Special Frame"
    },
    vip: 0
  },
  {
    day: 6,
    coins: 600000,
    exp: 30000,
    item: null,
    vip: 0
  },
  {
    day: 7,
    coins: 1000000,
    exp: 50000,
    item: {
      type: "avatarFrame",
      id: "weekly_frame_07",
      name: "Day 7 VIP Frame"
    },
    vip: 1
  }
];

// ============================================================
// 20 ROOM GAMES
// ============================================================

const gameNames = [
  "Baby",
  "Gareebi",
  "Lucky Wheel",
  "Dice",
  "Guess Number",
  "Rock Paper Scissors",
  "Treasure Box",
  "Bomb Game",
  "Lucky Card",
  "Number King",
  "Fast Tap",
  "Emoji Battle",
  "Guess Emoji",
  "Memory Card",
  "Color Battle",
  "Lucky Egg",
  "Gift Battle",
  "King Queen",
  "Treasure Hunt",
  "Pawan Challenge"
];

gameNames.forEach((name, index) => {
  const id = `game_${String(index + 1).padStart(2, "0")}`;

  games[id] = {
    id,
    name,
    enabled: true,
    minPlayers: 1,
    maxPlayers: 50
  };
});

// ============================================================
// USER FUNCTIONS
// ============================================================

function ensureUser(userId, data = {}) {
  userId = cleanUserId(userId) || "guest";

  if (!users[userId]) {
    users[userId] = {
      id: userId,
      name: cleanText(data.name, "Guest"),
      dp: cleanText(
        data.dp,
        `https://i.pravatar.cc/150?u=${encodeURIComponent(userId)}`
      ),
      gender: cleanText(data.gender, "Male"),
      level: numberValue(data.level, 1),
      exp: numberValue(data.exp, 0),
      coins: numberValue(data.coins, 100000),
      diamonds: numberValue(data.diamonds, 0),
      following: numberValue(data.following, 0),
      followers: numberValue(data.followers, 0),
      visitors: numberValue(data.visitors, 0),
      vipLevel: numberValue(data.vipLevel, 0),
      createdAt: now(),
      updatedAt: now()
    };
  }

  return users[userId];
}

function publicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    dp: user.dp,
    gender: user.gender,
    level: user.level,
    exp: user.exp,
    coins: user.coins,
    diamonds: user.diamonds,
    following: user.following,
    followers: user.followers,
    visitors: user.visitors,
    vipLevel: user.vipLevel
  };
}

function saveUser(user) {
  if (!user) return;

  user.updatedAt = now();
}

function addCoins(userId, amount) {
  const user = ensureUser(userId);

  user.coins = Math.max(
    0,
    Math.floor(numberValue(user.coins, 0) + numberValue(amount, 0))
  );

  saveUser(user);

  return user.coins;
}

function addExp(userId, amount) {
  const user = ensureUser(userId);

  user.exp = Math.max(
    0,
    Math.floor(numberValue(user.exp, 0) + numberValue(amount, 0))
  );

  while (user.exp >= getExpForNextLevel(user.level)) {
    user.exp -= getExpForNextLevel(user.level);
    user.level += 1;
  }

  saveUser(user);

  return {
    level: user.level,
    exp: user.exp
  };
}

function getExpForNextLevel(level) {
  return Math.max(10000, Number(level || 1) * 10000);
}

// ============================================================
// DAILY DATA
// ============================================================

function ensureDailyData(userId) {
  if (!dailyData[userId]) {
    dailyData[userId] = {
      loginDay: 0,
      lastLoginDate: "",
      streak: 0,
      lastExpDate: "",
      tasks: {},
      weeklyClaimed: {}
    };
  }

  return dailyData[userId];
}

function applyDailyLogin(userId) {
  const data = ensureDailyData(userId);
  const today = todayKey();

  if (data.lastLoginDate === today) {
    return {
      alreadyClaimed: true,
      day: data.loginDay,
      reward: null
    };
  }

  data.loginDay += 1;

  if (data.loginDay > 7) {
    data.loginDay = 1;
    data.weeklyClaimed = {};
  }

  data.streak += 1;
  data.lastLoginDate = today;

  const reward = weeklyRewards[data.loginDay - 1];

  const user = ensureUser(userId);

  user.coins += reward.coins;
  user.exp += reward.exp;

  if (reward.vip) {
    user.vipLevel = Math.max(user.vipLevel, reward.vip);
  }

  if (reward.item) {
    ensureInventory(userId);

    inventories[userId].avatarFrames.push({
      id: reward.item.id,
      name: reward.item.name,
      obtainedAt: now()
    });
  }

  saveUser(user);

  return {
    alreadyClaimed: false,
    day: data.loginDay,
    streak: data.streak,
    reward
  };
}

// ============================================================
// INVENTORY
// ============================================================

function ensureInventory(userId) {
  if (!inventories[userId]) {
    inventories[userId] = {
      vehicles: [],
      avatarFrames: [],
      chatBubbles: [],
      profileCards: [],
      rgbNames: [],
      themes: [],
      visitors: []
    };
  }

  return inventories[userId];
}

// ============================================================
// ROOMS
// ============================================================

function createRoom(roomId, ownerId, data = {}) {
  roomId = cleanText(roomId, randomRoomId());
  ownerId = cleanUserId(ownerId) || "guest";

  const owner = ensureUser(ownerId, data);

  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      name: cleanText(data.name || data.roomName, `${owner.name}'s Room`),
      roomName: cleanText(
        data.name || data.roomName,
        `${owner.name}'s Room`
      ),
      dp: cleanText(data.dp, owner.dp),
      owner: owner.name,
      ownerId: owner.id,
      ownerDp: owner.dp,
      category: cleanText(data.category, "General"),
      users: 0,
      seats: Array(9).fill(null),
      members: {},
      mutedUsers: {},
      messages: [],
      gifts: [],
      roomExp: 0,
      topUsers: [],
      createdAt: numberValue(data.createdAt, now()),
      updatedAt: now()
    };
  }

  return rooms[roomId];
}

function ensureRoom(roomId, ownerId = "guest", data = {}) {
  if (!rooms[roomId]) {
    return createRoom(roomId, ownerId, data);
  }

  return rooms[roomId];
}

function getRoomUserCount(room) {
  if (!room) return 0;

  return Object.keys(room.members || {}).length;
}

function roomData(room) {
  if (!room) return null;

  const members = {};

  Object.keys(room.members || {}).forEach(id => {
    const member = room.members[id];

    members[id] = {
      userId: member.userId,
      name: member.name,
      dp: member.dp,
      seatIndex: member.seatIndex,
      mic: member.mic,
      speaker: member.speaker,
      muted: member.muted
    };
  });

  return {
    id: room.id,
    name: room.name,
    roomName: room.roomName,
    dp: room.dp,
    owner: room.owner,
    ownerId: room.ownerId,
    ownerDp: room.ownerDp,
    category: room.category,
    users: getRoomUserCount(room),
    seats: room.seats,
    members,
    gifts: room.gifts.slice(-100),
    roomExp: room.roomExp,
    topUsers: room.topUsers,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt
  };
}

function broadcastRoom(roomId) {
  const room = rooms[roomId];

  if (!room) return;

  room.users = getRoomUserCount(room);
  room.updatedAt = now();

  io.to(roomId).emit("room-state", roomData(room));
  io.to(roomId).emit("room-updated", roomData(room));
}

function removeUserFromRoom(socket, roomId) {
  const room = rooms[roomId];

  if (!room) return;

  const userId = socketUsers[socket.id];

  if (!userId) return;

  if (room.members[userId]) {
    const seatIndex = room.members[userId].seatIndex;

    if (
      seatIndex !== null &&
      seatIndex !== undefined &&
      room.seats[seatIndex]
    ) {
      room.seats[seatIndex] = null;
    }

    delete room.members[userId];
  }

  room.users = getRoomUserCount(room);
  room.updatedAt = now();

  socket.leave(roomId);

  socket.currentRoom = null;

  io.to(roomId).emit("user-left", {
    userId,
    roomId
  });

  broadcastRoom(roomId);
}

// ============================================================
// DAILY EXP
// ============================================================

function applyDailyExp(userId) {
  const data = ensureDailyData(userId);
  const today = todayKey();

  if (data.lastExpDate === today) {
    return {
      applied: false,
      amount: 0
    };
  }

  data.lastExpDate = today;

  const result = addExp(userId, 50000);

  return {
    applied: true,
    amount: 50000,
    level: result.level,
    exp: result.exp
  };
}

// ============================================================
// GIFT PROCESSING
// ============================================================

function processGift({
  senderId,
  receiverId,
  giftId,
  quantity,
  roomId
}) {
  senderId = cleanUserId(senderId);
  receiverId = cleanUserId(receiverId);
  giftId = cleanText(giftId);

  const qty = Math.min(100, Math.max(1, positiveInt(quantity, 1)));

  if (!senderId) {
    return {
      ok: false,
      error: "Sender not found"
    };
  }

  if (!receiverId) {
    return {
      ok: false,
      error: "Receiver not found"
    };
  }

  if (senderId === receiverId) {
    return {
      ok: false,
      error: "You cannot send a gift to yourself"
    };
  }

  const gift = gifts[giftId];

  // IMPORTANT:
  // Price is ALWAYS taken from server-side gift database.
  // Browser price is ignored.
  if (!gift) {
    return {
      ok: false,
      error: "Invalid gift"
    };
  }

  const sender = ensureUser(senderId);
  const receiver = ensureUser(receiverId);

  const total = gift.price * qty;

  if (sender.coins < total) {
    return {
      ok: false,
      error: "Insufficient coins",
      required: total,
      balance: sender.coins
    };
  }

  const lockKey = `${senderId}:${receiverId}:${giftId}`;

  if (giftLocks.has(lockKey)) {
    return {
      ok: false,
      error: "Please wait and try again"
    };
  }

  giftLocks.add(lockKey);

  try {
    // Secure server-side deduction.
    sender.coins -= total;

    // Receiver gets a record/reward.
    // Receiver coins are not automatically increased here.
    // The gift is recorded as received.
    ensureInventory(receiverId);

    const transaction = {
      id: makeId("gift_tx_"),
      roomId: cleanText(roomId, ""),
      senderId,
      senderName: sender.name,
      senderDp: sender.dp,
      receiverId,
      receiverName: receiver.name,
      receiverDp: receiver.dp,
      giftId: gift.id,
      giftName: gift.name,
      giftEmoji: gift.emoji,
      category: gift.category,
      unitPrice: gift.price,
      quantity: qty,
      totalCoins: total,
      senderBalance: sender.coins,
      createdAt: now()
    };

    giftHistory.push(transaction);

    while (giftHistory.length > MAX_GIFT_HISTORY) {
      giftHistory.shift();
    }

    // Add receiver-side inventory history.
    inventories[receiverId].gifts =
      inventories[receiverId].gifts || [];

    inventories[receiverId].gifts.push({
      transactionId: transaction.id,
      giftId: gift.id,
      giftName: gift.name,
      giftEmoji: gift.emoji,
      fromUserId: senderId,
      fromName: sender.name,
      quantity: qty,
      totalCoins: total,
      receivedAt: transaction.createdAt
    });

    if (inventories[receiverId].gifts.length > 1000) {
      inventories[receiverId].gifts.shift();
    }

    // Room gift display.
    if (roomId && rooms[roomId]) {
      rooms[roomId].gifts.push(transaction);

      if (rooms[roomId].gifts.length > 100) {
        rooms[roomId].gifts.shift();
      }

      rooms[roomId].roomExp += Math.floor(total / 100);
      rooms[roomId].updatedAt = now();
    }

    saveUser(sender);
    saveUser(receiver);

    return {
      ok: true,
      transaction,
      sender: publicUser(sender),
      receiver: publicUser(receiver),
      gift
    };
  } finally {
    giftLocks.delete(lockKey);
  }
}

// ============================================================
// API - BASIC
// ============================================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/room.html", (req, res) => {
  res.sendFile(path.join(__dirname, "room.html"));
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    app: "PawanVoice",
    status: "running",
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
    gifts: Object.keys(gifts).length,
    giftHistory: giftHistory.length,
    games: Object.keys(games).length
  });
});

// ============================================================
// API - GIFTS
// ============================================================

app.get("/api/gifts", (req, res) => {
  res.json({
    ok: true,
    count: Object.keys(gifts).length,
    gifts: Object.values(gifts)
  });
});

// ============================================================
// API - STORE
// ============================================================

app.get("/api/store", (req, res) => {
  res.json({
    ok: true,
    store
  });
});

// ============================================================
// API - EVENTS
// ============================================================

app.get("/api/events", (req, res) => {
  res.json({
    ok: true,
    events: [
      {
        id: "event_family",
        name: "Family Ranking",
        active: true
      },
      {
        id: "event_cp",
        name: "CP Ranking",
        active: true
      },
      {
        id: "event_rich",
        name: "Rich King",
        active: true
      },
      {
        id: "event_daily",
        name: "Daily Login Event",
        active: true
      },
      {
        id: "event_gift",
        name: "Gift Festival",
        active: true
      },
      {
        id: "event_game",
        name: "Room Game Event",
        active: true
      },
      {
        id: "event_vehicle",
        name: "Vehicle Event",
        active: true
      },
      {
        id: "event_frame",
        name: "Avatar Frame Event",
        active: true
      },
      {
        id: "event_vip",
        name: "VIP Event",
        active: true
      },
      {
        id: "event_pawan",
        name: "PawanVoice Exclusive",
        active: true
      }
    ]
  });
});

// ============================================================
// API - TASKS
// ============================================================

app.get("/api/tasks", (req, res) => {
  const userId = cleanUserId(req.query.userId);

  if (!userId) {
    return res.json({
      ok: true,
      tasks: dailyTasks
    });
  }

  const data = ensureDailyData(userId);
  const today = todayKey();

  if (data.taskDate !== today) {
    data.taskDate = today;
    data.tasks = {};
  }

  res.json({
    ok: true,
    date: today,
    tasks: dailyTasks.map(task => ({
      ...task,
      completed: !!data.tasks[task.id]
    }))
  });
});

// ============================================================
// API - WEEKLY REWARDS
// ============================================================

app.get("/api/weekly-rewards", (req, res) => {
  res.json({
    ok: true,
    rewards: weeklyRewards
  });
});

app.post("/api/weekly-rewards/claim", (req, res) => {
  const userId = cleanUserId(req.body.userId);

  if (!userId) {
    return res.status(400).json({
      ok: false,
      error: "userId required"
    });
  }

  const data = ensureDailyData(userId);
  const today = todayKey();

  if (data.lastLoginDate !== today) {
    const result = applyDailyLogin(userId);

    return res.json({
      ok: true,
      result,
      user: publicUser(ensureUser(userId))
    });
  }

  return res.json({
    ok: false,
    error: "Today's reward already claimed",
    user: publicUser(ensureUser(userId))
  });
});

// ============================================================
// API - GAMES
// ============================================================

app.get("/api/games", (req, res) => {
  res.json({
    ok: true,
    count: Object.keys(games).length,
    games: Object.values(games)
  });
});

// ============================================================
// API - USER
// ============================================================

app.get("/api/user/:id", (req, res) => {
  const userId = cleanUserId(req.params.id);

  const user = ensureUser(userId);

  res.json({
    ok: true,
    user: publicUser(user)
  });
});

app.post("/api/user", (req, res) => {
  const userId = cleanUserId(req.body.userId || req.body.id);

  if (!userId) {
    return res.status(400).json({
      ok: false,
      error: "userId required"
    });
  }

  const user = ensureUser(userId, req.body);

  if (req.body.name !== undefined) {
    user.name = cleanText(req.body.name, user.name);
  }

  if (req.body.dp !== undefined) {
    user.dp = cleanText(req.body.dp, user.dp);
  }

  if (req.body.gender !== undefined) {
    user.gender = cleanText(req.body.gender, user.gender);
  }

  saveUser(user);

  res.json({
    ok: true,
    user: publicUser(user)
  });
});

app.patch("/api/user/:id", (req, res) => {
  const userId = cleanUserId(req.params.id);

  const user = ensureUser(userId);

  if (req.body.name !== undefined) {
    user.name = cleanText(req.body.name, user.name);
  }

  if (req.body.dp !== undefined) {
    user.dp = cleanText(req.body.dp, user.dp);
  }

  if (req.body.gender !== undefined) {
    user.gender = cleanText(req.body.gender, user.gender);
  }

  saveUser(user);

  // Update all rooms owned by this user.
  Object.values(rooms).forEach(room => {
    if (room.ownerId === userId) {
      room.owner = user.name;
      room.ownerDp = user.dp;
      room.dp = user.dp;
      room.name = room.name;
      room.updatedAt = now();

      broadcastRoom(room.id);
    }

    if (room.members[userId]) {
      room.members[userId].name = user.name;
      room.members[userId].dp = user.dp;
    }
  });

  res.json({
    ok: true,
    user: publicUser(user)
  });
});

// ============================================================
// API - WALLET
// ============================================================

app.get("/api/user/:userId/wallet", (req, res) => {
  const userId = cleanUserId(req.params.userId);

  const user = ensureUser(userId);

  res.json({
    ok: true,
    userId,
    coins: user.coins,
    diamonds: user.diamonds,
    level: user.level,
    exp: user.exp,
    vipLevel: user.vipLevel
  });
});

// ============================================================
// API - GIFT SEND
// ============================================================

app.post("/api/gifts/send", (req, res) => {
  const senderId = cleanUserId(
    req.body.senderId ||
    req.body.userId ||
    req.body.fromUserId
  );

  const receiverId = cleanUserId(
    req.body.receiverId ||
    req.body.targetUserId ||
    req.body.toUserId
  );

  const giftId = cleanText(req.body.giftId);
  const quantity = positiveInt(req.body.quantity, 1);
  const roomId = cleanText(req.body.roomId);

  const result = processGift({
    senderId,
    receiverId,
    giftId,
    quantity,
    roomId
  });

  if (!result.ok) {
    return res.status(400).json(result);
  }

  res.json(result);
});

// ============================================================
// API - GIFT HISTORY
// ============================================================

app.get("/api/gift-history", (req, res) => {
  const userId = cleanUserId(req.query.userId);

  let list = giftHistory;

  if (userId) {
    list = giftHistory.filter(
      x =>
        x.senderId === userId ||
        x.receiverId === userId
    );
  }

  const limit = Math.min(
    500,
    Math.max(1, numberValue(req.query.limit, 100))
  );

  res.json({
    ok: true,
    count: list.length,
    history: list.slice(-limit).reverse()
  });
});

app.get("/api/user/:userId/gift-history", (req, res) => {
  const userId = cleanUserId(req.params.userId);

  const list = giftHistory
    .filter(
      x =>
        x.senderId === userId ||
        x.receiverId === userId
    )
    .slice(-500)
    .reverse();

  res.json({
    ok: true,
    userId,
    count: list.length,
    history: list
  });
});

// ============================================================
// API - ROOM
// ============================================================

app.get("/api/room/:id", (req, res) => {
  const roomId = cleanText(req.params.id);

  const room = rooms[roomId];

  if (!room) {
    return res.status(404).json({
      ok: false,
      error: "Room not found"
    });
  }

  res.json({
    ok: true,
    room: roomData(room)
  });
});

app.post("/api/room", (req, res) => {
  const ownerId = cleanUserId(
    req.body.ownerId ||
    req.body.userId
  );

  if (!ownerId) {
    return res.status(400).json({
      ok: false,
      error: "ownerId required"
    });
  }

  const roomId =
    cleanText(req.body.roomId) ||
    randomRoomId();

  const room = createRoom(roomId, ownerId, req.body);

  res.json({
    ok: true,
    room: roomData(room)
  });
});

app.patch("/api/room/:id", (req, res) => {
  const roomId = cleanText(req.params.id);

  const room = rooms[roomId];

  if (!room) {
    return res.status(404).json({
      ok: false,
      error: "Room not found"
    });
  }

  if (req.body.name !== undefined) {
    room.name = cleanText(req.body.name, room.name);
    room.roomName = room.name;
  }

  if (req.body.roomName !== undefined) {
    room.name = cleanText(req.body.roomName, room.name);
    room.roomName = room.name;
  }

  if (req.body.dp !== undefined) {
    room.dp = cleanText(req.body.dp, room.dp);
  }

  if (req.body.category !== undefined) {
    room.category = cleanText(
      req.body.category,
      room.category
    );
  }

  if (req.body.ownerId) {
    const ownerId = cleanUserId(req.body.ownerId);

    if (ownerId === room.ownerId) {
      const owner = ensureUser(ownerId);

      room.owner = owner.name;
      room.ownerDp = owner.dp;
    }
  }

  room.updatedAt = now();

  broadcastRoom(roomId);

  res.json({
    ok: true,
    room: roomData(room)
  });
});

// ============================================================
// SOCKET.IO
// ============================================================

io.on("connection", socket => {

  console.log("Socket connected:", socket.id);

  // ----------------------------------------------------------
  // REGISTER USER
  // ----------------------------------------------------------

  socket.on("register-user", payload => {
    payload = payload || {};

    const userId = cleanUserId(
      payload.userId ||
      payload.id ||
      socket.id
    );

    const user = ensureUser(userId, payload);

    socketUsers[socket.id] = userId;

    if (!userSockets[userId]) {
      userSockets[userId] = new Set();
    }

    userSockets[userId].add(socket.id);

    socket.userId = userId;

    // Daily login.
    const loginResult = applyDailyLogin(userId);

    // Daily 50,000 EXP once per day.
    const dailyExp = applyDailyExp(userId);

    socket.emit("user-registered", {
      ok: true,
      user: publicUser(user),
      loginReward: loginResult,
      dailyExp
    });

    socket.emit("wallet-updated", {
      userId,
      coins: user.coins,
      diamonds: user.diamonds,
      level: user.level,
      exp: user.exp,
      vipLevel: user.vipLevel
    });
  });

  // ----------------------------------------------------------
  // JOIN ROOM
  // ----------------------------------------------------------

  socket.on("join-room", payload => {
    payload = payload || {};

    const roomId = cleanText(
      payload.roomId ||
      payload.id ||
      "main"
    );

    const userId =
      socketUsers[socket.id] ||
      cleanUserId(payload.userId) ||
      socket.id;

    const user = ensureUser(userId, payload);

    socketUsers[socket.id] = userId;
    socket.userId = userId;

    if (!userSockets[userId]) {
      userSockets[userId] = new Set();
    }

    userSockets[userId].add(socket.id);

    const room = ensureRoom(
      roomId,
      userId,
      payload
    );

    // If socket is already in another room, leave it first.
    if (
      socket.currentRoom &&
      socket.currentRoom !== roomId
    ) {
      removeUserFromRoom(
        socket,
        socket.currentRoom
      );
    }

    socket.join(roomId);
    socket.currentRoom = roomId;

    if (!room.members[userId]) {
      room.members[userId] = {
        userId,
        name: user.name,
        dp: user.dp,
        seatIndex: null,
        mic: false,
        speaker: true,
        muted: false,
        joinedAt: now()
      };
    } else {
      room.members[userId].name = user.name;
      room.members[userId].dp = user.dp;
    }

    room.users = getRoomUserCount(room);
    room.updatedAt = now();

    // Daily task.
    const daily = ensureDailyData(userId);
    daily.taskDate = todayKey();
    daily.tasks = daily.tasks || {};
    daily.tasks.task_02 = true;

    socket.emit("room-state", roomData(room));

    socket.to(roomId).emit("user-entry", {
      userId,
      name: user.name,
      dp: user.dp,
      roomId
    });

    broadcastRoom(roomId);
  });

  // ----------------------------------------------------------
  // LEAVE ROOM
  // ----------------------------------------------------------

  socket.on("leave-room", payload => {
    const roomId =
      cleanText(payload && payload.roomId) ||
      socket.currentRoom;

    if (roomId) {
      removeUserFromRoom(socket, roomId);
    }
  });

  // ----------------------------------------------------------
  // TAKE SEAT
  // ----------------------------------------------------------

  socket.on("take-seat", payload => {
    payload = payload || {};

    const roomId =
      cleanText(payload.roomId) ||
      socket.currentRoom;

    const seatIndex = Number(payload.seatIndex);

    const userId =
      socketUsers[socket.id] ||
      socket.userId;

    if (!roomId || !userId) return;

    const room = rooms[roomId];

    if (!room) {
      return socket.emit("error-message", {
        message: "Room not found"
      });
    }

    if (
      !Number.isInteger(seatIndex) ||
      seatIndex < 0 ||
      seatIndex >= 9
    ) {
      return socket.emit("error-message", {
        message: "Invalid seat"
      });
    }

    const member = room.members[userId];

    if (!member) {
      return socket.emit("error-message", {
        message: "Join the room first"
      });
    }

    // Remove user's previous seat.
    room.seats.forEach((seat, index) => {
      if (seat && seat.userId === userId) {
        room.seats[index] = null;
      }
    });

    // Seat already occupied.
    if (
      room.seats[seatIndex] &&
      room.seats[seatIndex].userId !== userId
    ) {
      return socket.emit("error-message", {
        message: "This seat is occupied"
      });
    }

    member.seatIndex = seatIndex;

    room.seats[seatIndex] = {
      userId,
      name: member.name,
      dp: member.dp,
      mic: member.mic,
      speaker: member.speaker
    };

    room.updatedAt = now();

    io.to(roomId).emit("seat-update", {
      seatIndex,
      userId,
      name: member.name,
      dp: member.dp,
      mic: member.mic,
      speaker: member.speaker
    });

    broadcastRoom(roomId);
  });

  // ----------------------------------------------------------
  // LEAVE SEAT
  // ----------------------------------------------------------

  socket.on("leave-seat", payload => {
    payload = payload || {};

    const roomId =
      cleanText(payload.roomId) ||
      socket.currentRoom;

    const userId =
      socketUsers[socket.id] ||
      socket.userId;

    const room = rooms[roomId];

    if (!room || !userId) return;

    const member = room.members[userId];

    if (!member) return;

    const oldSeat = member.seatIndex;

    if (
      oldSeat !== null &&
      oldSeat !== undefined
    ) {
      room.seats[oldSeat] = null;
    }

    member.seatIndex = null;

    io.to(roomId).emit("seat-update", {
      seatIndex: oldSeat,
      userId,
      name: member.name,
      dp: member.dp,
      mic: false,
      speaker: member.speaker
    });

    broadcastRoom(roomId);
  });

  // ----------------------------------------------------------
  // MIC
  // ----------------------------------------------------------

  socket.on("mic", payload => {
    payload = payload || {};

    const roomId =
      cleanText(payload.roomId) ||
      socket.currentRoom;

    const userId =
      socketUsers[socket.id] ||
      socket.userId;

    const room = rooms[roomId];

    if (!room || !userId) return;

    const member = room.members[userId];

    if (!member) return;

    member.mic = Boolean(payload.enabled);

    if (
      member.seatIndex !== null &&
      member.seatIndex !== undefined
    ) {
      room.seats[member.seatIndex] = {
        ...room.seats[member.seatIndex],
        mic: member.mic
      };
    }

    io.to(roomId).emit("mic", {
      userId,
      enabled: member.mic
    });

    broadcastRoom(roomId);
  });

  // ----------------------------------------------------------
  // SPEAKER
  // ----------------------------------------------------------

  socket.on("speaker", payload => {
    payload = payload || {};

    const roomId =
      cleanText(payload.roomId) ||
      socket.currentRoom;

    const userId =
      socketUsers[socket.id] ||
      socket.userId;

    const room = rooms[roomId];

    if (!room || !userId) return;

    const member = room.members[userId];

    if (!member) return;

    member.speaker = Boolean(payload.enabled);

    if (
      member.seatIndex !== null &&
      member.seatIndex !== undefined
    ) {
      room.seats[member.seatIndex] = {
        ...room.seats[member.seatIndex],
        speaker: member.speaker
      };
    }

    io.to(roomId).emit("speaker", {
      userId,
      enabled: member.speaker
    });

    broadcastRoom(roomId);
  });

  // ----------------------------------------------------------
  // CHAT
  // ----------------------------------------------------------

  function handleChat(payload) {
    payload = payload || {};

    const roomId =
      cleanText(payload.roomId) ||
      socket.currentRoom;

    const userId =
      socketUsers[socket.id] ||
      socket.userId;

    const room = rooms[roomId];

    if (!room || !userId) return;

    const user = ensureUser(userId);

    const textMessage = cleanText(
      payload.message ||
      payload.text,
      ""
    );

    if (!textMessage) return;

    const message = {
      id: makeId("msg_"),
      roomId,
      userId,
      name: user.name,
      dp: user.dp,
      text: textMessage,
      createdAt: now()
    };

    room.messages.push(message);

    if (room.messages.length > 300) {
      room.messages.shift();
    }

    const daily = ensureDailyData(userId);

    daily.taskDate = todayKey();
    daily.tasks = daily.tasks || {};

    daily.chatCount =
      numberValue(daily.chatCount, 0) + 1;

    if (daily.chatCount >= 5) {
      daily.tasks.task_04 = true;
    }

    io.to(roomId).emit("chat", message);
    io.to(roomId).emit("room-chat", message);
  }

  socket.on("chat", handleChat);
  socket.on("room-chat", handleChat);

  // ----------------------------------------------------------
  // EMOJI
  // ----------------------------------------------------------

  socket.on("emoji", payload => {
    payload = payload || {};

    const roomId =
      cleanText(payload.roomId) ||
      socket.currentRoom;

    const userId =
      socketUsers[socket.id] ||
      socket.userId;

    const user = ensureUser(userId);

    if (!roomId) return;

    const daily = ensureDailyData(userId);

    daily.emojiCount =
      numberValue(daily.emojiCount, 0) + 1;

    if (daily.emojiCount >= 10) {
      daily.taskDate = todayKey();
      daily.tasks = daily.tasks || {};
      daily.tasks.task_08 = true;
    }

    io.to(roomId).emit("emoji", {
      userId,
      name: user.name,
      emoji: cleanText(
        payload.emoji,
        "❤️"
      ),
      createdAt: now()
    });
  });

  // ----------------------------------------------------------
  // GIFT
  // ----------------------------------------------------------

  socket.on("gift", payload => {
    payload = payload || {};

    const senderId =
      socketUsers[socket.id] ||
      socket.userId;

    const roomId =
      cleanText(payload.roomId) ||
      socket.currentRoom;

    const receiverId = cleanUserId(
      payload.targetUserId ||
      payload.receiverId ||
      payload.toUserId
    );

    const giftId = cleanText(
      payload.giftId
    );

    const quantity = positiveInt(
      payload.quantity,
      1
    );

    // Browser supplied price/name/emoji are intentionally NOT trusted.
    const result = processGift({
      senderId,
      receiverId,
      giftId,
      quantity,
      roomId
    });

    if (!result.ok) {
      socket.emit("gift-error", result);
      return;
    }

    const daily = ensureDailyData(senderId);

    daily.taskDate = todayKey();
    daily.tasks = daily.tasks || {};
    daily.tasks.task_03 = true;

    const event = {
      ...result.transaction,
      sender: result.sender,
      receiver: result.receiver,
      gift: result.gift
    };

    if (roomId) {
      io.to(roomId).emit("gift-sent", event);
    }

    // Direct receiver notification.
    const receiverSocketSet =
      userSockets[receiverId];

    if (receiverSocketSet) {
      receiverSocketSet.forEach(socketId => {
        io.to(socketId).emit(
          "gift-received",
          event
        );

        io.to(socketId).emit(
          "wallet-updated",
          {
            userId: receiverId,
            coins: result.receiver.coins,
            diamonds: result.receiver.diamonds,
            level: result.receiver.level,
            exp: result.receiver.exp,
            vipLevel: result.receiver.vipLevel
          }
        );
      });
    }

    // Sender wallet.
    socket.emit("wallet-updated", {
      userId: senderId,
      coins: result.sender.coins,
      diamonds: result.sender.diamonds,
      level: result.sender.level,
      exp: result.sender.exp,
      vipLevel: result.sender.vipLevel
    });

    if (roomId) {
      broadcastRoom(roomId);
    }
  });

  // ----------------------------------------------------------
  // FOLLOW
  // ----------------------------------------------------------

  socket.on("follow", payload => {
    payload = payload || {};

    const fromUserId =
      socketUsers[socket.id] ||
      socket.userId;

    const targetUserId =
      cleanUserId(
        payload.targetUserId ||
        payload.userId
      );

    if (
      !fromUserId ||
      !targetUserId ||
      fromUserId === targetUserId
    ) {
      return;
    }

    const fromUser = ensureUser(fromUserId);
    const targetUser = ensureUser(targetUserId);

    fromUser.following += 1;
    targetUser.followers += 1;

    saveUser(fromUser);
    saveUser(targetUser);

    socket.emit("follow-updated", {
      targetUserId,
      following: fromUser.following
    });

    const targetSockets =
      userSockets[targetUserId];

    if (targetSockets) {
      targetSockets.forEach(socketId => {
        io.to(socketId).emit(
          "followers-updated",
          {
            followers: targetUser.followers
          }
        );
      });
    }
  });

  // ----------------------------------------------------------
  // CP REQUEST
  // ----------------------------------------------------------

  socket.on("cp-request", payload => {
    payload = payload || {};

    const fromUserId =
      socketUsers[socket.id] ||
      socket.userId;

    const targetUserId =
      cleanUserId(
        payload.targetUserId ||
        payload.userId
      );

    if (!targetUserId) return;

    const sender = ensureUser(fromUserId);
    const receiver = ensureUser(targetUserId);

    const request = {
      id: makeId("cp_"),
      fromUserId,
      fromName: sender.name,
      fromDp: sender.dp,
      targetUserId,
      targetName: receiver.name,
      targetDp: receiver.dp,
      status: "pending",
      createdAt: now()
    };

    const targetSockets =
      userSockets[targetUserId];

    if (targetSockets) {
      targetSockets.forEach(socketId => {
        io.to(socketId).emit(
          "cp-request",
          request
        );
      });
    }

    socket.emit("cp-request-sent", request);
  });

  // ----------------------------------------------------------
  // KICK
  // ----------------------------------------------------------

  socket.on("kick", payload => {
    payload = payload || {};

    const roomId =
      cleanText(payload.roomId) ||
      socket.currentRoom;

    const targetUserId =
      cleanUserId(
        payload.targetUserId ||
        payload.userId
      );

    const room = rooms[roomId];

    if (!room || !targetUserId) return;

    const requesterId =
      socketUsers[socket.id] ||
      socket.userId;

    // Only room owner can kick in this basic server.
    if (room.ownerId !== requesterId) {
      return socket.emit("error-message", {
        message: "Only room owner can kick users"
      });
    }

    const targetSockets =
      userSockets[targetUserId];

    if (!targetSockets) return;

    targetSockets.forEach(socketId => {
      const targetSocket =
        io.sockets.sockets.get(socketId);

      if (!targetSocket) return;

      if (targetSocket.currentRoom === roomId) {
        targetSocket.emit("kicked", {
          roomId,
          userId: targetUserId
        });

        removeUserFromRoom(
          targetSocket,
          roomId
        );
      }
    });
  });

  // ----------------------------------------------------------
  // MUTE
  // ----------------------------------------------------------

  socket.on("mute", payload => {
    payload = payload || {};

    const roomId =
      cleanText(payload.roomId) ||
      socket.currentRoom;

    const targetUserId =
      cleanUserId(
        payload.targetUserId ||
        payload.userId
      );

    const room = rooms[roomId];

    if (!room || !targetUserId) return;

    const requesterId =
      socketUsers[socket.id] ||
      socket.userId;

    if (room.ownerId !== requesterId) {
      return socket.emit("error-message", {
        message: "Only room owner can mute users"
      });
    }

    const member =
      room.members[targetUserId];

    if (!member) return;

    member.muted =
      payload.muted === undefined
        ? true
        : Boolean(payload.muted);

    room.mutedUsers[targetUserId] =
      member.muted;

    io.to(roomId).emit("mute", {
      userId: targetUserId,
      muted: member.muted
    });

    broadcastRoom(roomId);
  });

  // ----------------------------------------------------------
  // ROOM SETTINGS
  // ----------------------------------------------------------

  socket.on("room-update", payload => {
    payload = payload || {};

    const roomId =
      cleanText(payload.roomId) ||
      socket.currentRoom;

    const room = rooms[roomId];

    if (!room) return;

    const requesterId =
      socketUsers[socket.id] ||
      socket.userId;

    if (room.ownerId !== requesterId) {
      return socket.emit("error-message", {
        message: "Only room owner can update room"
      });
    }

    if (payload.name !== undefined) {
      room.name = cleanText(
        payload.name,
        room.name
      );

      room.roomName = room.name;
    }

    if (payload.roomName !== undefined) {
      room.name = cleanText(
        payload.roomName,
        room.name
      );

      room.roomName = room.name;
    }

    if (payload.dp !== undefined) {
      room.dp = cleanText(
        payload.dp,
        room.dp
      );
    }

    if (payload.category !== undefined) {
      room.category = cleanText(
        payload.category,
        room.category
      );
    }

    room.updatedAt = now();

    broadcastRoom(roomId);
  });

  // ----------------------------------------------------------
  // ROOM GAME
  // ----------------------------------------------------------

  socket.on("game-start", payload => {
    payload = payload || {};

    const roomId =
      cleanText(payload.roomId) ||
      socket.currentRoom;

    const gameId =
      cleanText(payload.gameId);

    const room = rooms[roomId];

    if (!room || !games[gameId]) return;

    const userId =
      socketUsers[socket.id] ||
      socket.userId;

    const gameSession = {
      id: makeId("game_"),
      gameId,
      gameName: games[gameId].name,
      roomId,
      startedBy: userId,
      startedAt: now(),
      status: "running"
    };

    games[gameId].lastSession =
      gameSession;

    io.to(roomId).emit(
      "game-started",
      gameSession
    );
  });

  // ----------------------------------------------------------
  // GAME ACTION
  // ----------------------------------------------------------

  socket.on("game-action", payload => {
    payload = payload || {};

    const roomId =
      cleanText(payload.roomId) ||
      socket.currentRoom;

    if (!roomId) return;

    const userId =
      socketUsers[socket.id] ||
      socket.userId;

    io.to(roomId).emit(
      "game-action",
      {
        ...payload,
        userId,
        createdAt: now()
      }
    );
  });

  // ----------------------------------------------------------
  // ROOM EXP
  // ----------------------------------------------------------

  socket.on("room-exp", payload => {
    payload = payload || {};

    const roomId =
      cleanText(payload.roomId) ||
      socket.currentRoom;

    const room = rooms[roomId];

    if (!room) return;

    const amount = Math.min(
      1000000,
      Math.max(
        0,
        Math.floor(
          numberValue(payload.amount, 0)
        )
      )
    );

    room.roomExp += amount;

    broadcastRoom(roomId);
  });

  // ----------------------------------------------------------
  // WEBRTC OFFER
  // ----------------------------------------------------------

  function sendToPeer(eventName, payload) {
    payload = payload || {};

    const targetUserId =
      cleanUserId(
        payload.targetUserId ||
        payload.toUserId ||
        payload.peerId
      );

    if (!targetUserId) return;

    const targetSockets =
      userSockets[targetUserId];

    if (!targetSockets) return;

    targetSockets.forEach(socketId => {
      io.to(socketId).emit(
        eventName,
        {
          ...payload,
          fromUserId:
            socketUsers[socket.id] ||
            socket.userId
        }
      );
    });
  }

  socket.on("webrtc-offer", payload => {
    sendToPeer(
      "webrtc-offer",
      payload
    );
  });

  socket.on("webrtc-answer", payload => {
    sendToPeer(
      "webrtc-answer",
      payload
    );
  });

  socket.on("webrtc-ice", payload => {
    sendToPeer(
      "webrtc-ice",
      payload
    );
  });

  socket.on("webrtc-ice-candidate", payload => {
    sendToPeer(
      "webrtc-ice-candidate",
      payload
    );
  });

  // ----------------------------------------------------------
  // OLD WEBRTC ALIASES
  // ----------------------------------------------------------

  socket.on("offer", payload => {
    sendToPeer("webrtc-offer", payload);
  });

  socket.on("answer", payload => {
    sendToPeer("webrtc-answer", payload);
  });

  socket.on("ice-candidate", payload => {
    sendToPeer(
      "webrtc-ice-candidate",
      payload
    );
  });

  // ----------------------------------------------------------
  // DISCONNECT
  // ----------------------------------------------------------

  socket.on("disconnect", () => {
    console.log(
      "Socket disconnected:",
      socket.id
    );

    const userId =
      socketUsers[socket.id];

    const roomId =
      socket.currentRoom;

    if (roomId) {
      removeUserFromRoom(
        socket,
        roomId
      );
    }

    if (userId && userSockets[userId]) {
      userSockets[userId].delete(
        socket.id
      );

      if (
        userSockets[userId].size === 0
      ) {
        delete userSockets[userId];
      }
    }

    delete socketUsers[socket.id];
  });
});

// ============================================================
// ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    ok: false,
    error: "Server error"
  });
});

// ============================================================
// START SERVER
// ============================================================

server.listen(PORT, "0.0.0.0", () => {
  console.log("======================================");
  console.log(" PawanVoice Server Started");
  console.log("======================================");
  console.log("Port:", PORT);
  console.log("Static folder:", __dirname);
  console.log("Rooms:", Object.keys(rooms).length);
  console.log("Gifts:", Object.keys(gifts).length);
  console.log("Games:", Object.keys(games).length);
  console.log("======================================");
});
