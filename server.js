// ============================================================
// PAWANVOICE - COMPLETE REALTIME VOICE ROOM SERVER
// FULL REPLACEMENT SERVER.JS
// ============================================================

const express = require("express");
const http = require("http");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const { Server } = require("socket.io");

// ============================================================
// APP
// ============================================================

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// ============================================================
// FIREBASE
// ============================================================

const FIREBASE_DB_URL =
  process.env.FIREBASE_DB_URL ||
  "https://pawanvoice-68c5e-default-rtdb.firebaseio.com";

// Firebase persistence can be disabled if needed.
const FIREBASE_ENABLED =
  String(process.env.FIREBASE_ENABLED || "true").toLowerCase() !== "false";

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(
  cors({
    origin: "*",
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS"
    ]
  })
);

app.use(
  express.json({
    limit: "5mb"
  })
);

app.use(
  express.urlencoded({
    extended: true
  })
);

// ============================================================
// STATIC FILES
// ============================================================

app.use(
  express.static(__dirname, {
    extensions: ["html"],
    index: "index.html"
  })
);

// ============================================================
// SOCKET.IO
// ============================================================

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 60000
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

const followRelations = {};
const cpRequests = {};

const MAX_GIFT_HISTORY = 10000;
const MAX_ROOM_MESSAGES = 300;
const MAX_ROOM_GIFTS = 100;
const MAX_USER_GIFTS = 1000;

// ============================================================
// GENERAL HELPERS
// ============================================================

function now() {
  return Date.now();
}

function makeId(prefix = "") {
  return (
    prefix +
    crypto.randomBytes(8).toString("hex")
  );
}

function cleanText(value, fallback = "") {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  return String(value)
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 300);
}

function cleanUserId(value) {
  return cleanText(value, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function numberValue(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function positiveInt(value, fallback = 1) {
  const n = Math.floor(Number(value));

  if (
    !Number.isFinite(n) ||
    n < 1
  ) {
    return fallback;
  }

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
  return (
    "PV" +
    Math.floor(
      100000 +
      Math.random() * 900000
    )
  );
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

// ============================================================
// FIREBASE REST HELPERS
// ============================================================

function firebaseUrl(pathName = "") {
  const cleanPath = String(pathName)
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  return (
    FIREBASE_DB_URL.replace(/\/+$/, "") +
    "/" +
    cleanPath +
    ".json"
  );
}

async function firebaseRequest(
  method,
  pathName,
  body
) {
  if (!FIREBASE_ENABLED) {
    return null;
  }

  try {
    const options = {
      method,
      headers: {
        "Content-Type": "application/json"
      }
    };

    if (
      body !== undefined &&
      body !== null
    ) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(
      firebaseUrl(pathName),
      options
    );

    if (!response.ok) {
      const text = await response.text();

      console.error(
        "Firebase error:",
        response.status,
        text.slice(0, 500)
      );

      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(
      "Firebase request failed:",
      error.message
    );

    return null;
  }
}

async function firebaseGet(pathName) {
  return firebaseRequest(
    "GET",
    pathName
  );
}

async function firebasePut(
  pathName,
  data
) {
  return firebaseRequest(
    "PUT",
    pathName,
    data
  );
}

async function firebasePatch(
  pathName,
  data
) {
  return firebaseRequest(
    "PATCH",
    pathName,
    data
  );
}

async function firebaseDelete(
  pathName
) {
  return firebaseRequest(
    "DELETE",
    pathName
  );
}

// ============================================================
// FIREBASE SERIALIZATION
// ============================================================

function firebaseSafeUser(user) {
  if (!user) return null;

  return {
    userId: user.id,
    id: user.id,

    name: user.name,
    dp: user.dp,
    gender: user.gender,

    level: numberValue(user.level, 1),
    exp: numberValue(user.exp, 0),

    coins: numberValue(user.coins, 0),

    diamonds: numberValue(
      user.diamonds,
      0
    ),

    diamond: numberValue(
      user.diamonds,
      0
    ),

    following: numberValue(
      user.following,
      0
    ),

    followers: numberValue(
      user.followers,
      0
    ),

    visitors: numberValue(
      user.visitors,
      0
    ),

    vipLevel: numberValue(
      user.vipLevel,
      0
    ),

    createdAt: numberValue(
      user.createdAt,
      now()
    ),

    updatedAt: now()
  };
}

function firebaseSafeRoom(room) {
  if (!room) return null;

  return {
    id: room.id,

    name: room.name,

    roomName:
      room.roomName ||
      room.name,

    dp: room.dp,

    owner: room.owner,
    ownerId: room.ownerId,
    ownerDp: room.ownerDp,

    category: room.category,

    maxSeats: 9,

    users: room.users,

    seats: room.seats,

    members: room.members,

    roomExp: room.roomExp,

    topUsers: room.topUsers,

    createdAt: room.createdAt,

    updatedAt: now()
  };
}

// ============================================================
// FIREBASE PERSISTENCE
// ============================================================

async function persistUser(
  userId
) {
  const user = users[userId];

  if (!user) return;

  await firebasePatch(
    `users/${encodeURIComponent(userId)}`,
    firebaseSafeUser(user)
  );
}

async function persistRoom(
  roomId
) {
  const room = rooms[roomId];

  if (!room) return;

  await firebasePut(
    `rooms/${encodeURIComponent(roomId)}`,
    firebaseSafeRoom(room)
  );
}

async function persistDaily(
  userId
) {
  const data = dailyData[userId];

  if (!data) return;

  await firebasePut(
    `dailyData/${encodeURIComponent(userId)}`,
    data
  );
}

async function persistInventory(
  userId
) {
  const inventory =
    inventories[userId];

  if (!inventory) return;

  await firebasePut(
    `inventories/${encodeURIComponent(userId)}`,
    inventory
  );
}

async function persistFollowRelations(
  userId
) {
  const data =
    followRelations[userId];

  if (!data) return;

  await firebasePut(
    `followRelations/${encodeURIComponent(userId)}`,
    data
  );
}

// ============================================================
// 200 GIFTS
// ============================================================

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
    return (
      (index + 1) * 100
    );
  }

  if (index < 100) {
    return (
      (index - 49) * 1000
    );
  }

  if (index < 150) {
    return (
      (index - 99) * 10000
    );
  }

  return (
    (index - 149) * 50000
  );
}

for (
  let i = 0;
  i < 200;
  i++
) {
  const id =
    `gift_${String(i + 1).padStart(3, "0")}`;

  let category = "Small";

  if (
    i >= 50 &&
    i < 100
  ) {
    category = "Medium";
  }

  if (
    i >= 100 &&
    i < 150
  ) {
    category = "Large";
  }

  if (i >= 150) {
    category = "Luxury";
  }

  gifts[id] = {
    id,
    name:
      giftNames[i] ||
      `Pawan Gift ${i + 1}`,

    emoji:
      giftEmojis[i] ||
      "🎁",

    image: "",

    category,

    price:
      getGiftPrice(i),

    sort: i + 1
  };
}

// ============================================================
// STORE
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

for (
  let i = 1;
  i <= 50;
  i++
) {
  store.vehicles.push({
    id:
      `vehicle_${String(i).padStart(2, "0")}`,
    name:
      `Vehicle ${i}`,
    price:
      i * 50000,
    type: "vehicle"
  });

  store.avatarFrames.push({
    id:
      `avatar_frame_${String(i).padStart(2, "0")}`,
    name:
      `Avatar Frame ${i}`,
    price:
      i * 10000,
    type: "avatarFrame"
  });

  store.chatBubbles.push({
    id:
      `chat_bubble_${String(i).padStart(2, "0")}`,
    name:
      `Chat Bubble ${i}`,
    price:
      i * 5000,
    type: "chatBubble"
  });

  store.profileCards.push({
    id:
      `profile_card_${String(i).padStart(2, "0")}`,
    name:
      `Profile Card ${i}`,
    price:
      i * 8000,
    type: "profileCard"
  });

  store.rgbNames.push({
    id:
      `rgb_name_${String(i).padStart(2, "0")}`,
    name:
      `RGB Name ${i}`,
    price:
      i * 12000,
    type: "rgbName"
  });

  store.themes.push({
    id:
      `theme_${String(i).padStart(2, "0")}`,
    name:
      `Theme ${i}`,
    price:
      i * 15000,
    type: "theme"
  });

  store.visitors.push({
    id:
      `visitor_${String(i).padStart(2, "0")}`,
    name:
      `Visitor Effect ${i}`,
    price:
      i * 7000,
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
    description:
      "Open PawanVoice today",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_02",
    name: "Enter a Room",
    description:
      "Join any voice room",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_03",
    name: "Send a Gift",
    description:
      "Send at least one gift",
    rewardCoins: 10000,
    rewardExp: 5000
  },
  {
    id: "task_04",
    name: "Chat With Friends",
    description:
      "Send 5 chat messages",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_05",
    name: "Use Voice Room",
    description:
      "Stay in a room",
    rewardCoins: 10000,
    rewardExp: 5000
  },
  {
    id: "task_06",
    name: "Follow Someone",
    description:
      "Follow a user",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_07",
    name: "Play a Game",
    description:
      "Play one room game",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_08",
    name: "Send Emoji",
    description:
      "Send 10 emojis",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_09",
    name: "Visit Profile",
    description:
      "Visit another profile",
    rewardCoins: 5000,
    rewardExp: 5000
  },
  {
    id: "task_10",
    name: "Daily Mission",
    description:
      "Complete daily activity",
    rewardCoins: 25000,
    rewardExp: 10000
  }
];

// ============================================================
// WEEKLY REWARDS
// ============================================================

const weeklyRewards = [
  {
    day: 1,
    coins: 100000,
    exp: 5000,
    item: null,
    diamonds: 0,
    vip: 0
  },
  {
    day: 2,
    coins: 200000,
    exp: 10000,
    item: null,
    diamonds: 0,
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
    diamonds: 0,
    vip: 0
  },
  {
    day: 4,
    coins: 400000,
    exp: 20000,
    item: null,
    diamonds: 0,
    vip: 0
  },
  {
    day: 5,
    coins: 500000,
    exp: 25000,
    item: {
      type: "specialGift",
      id: "weekly_gift_05",
      name: "Day 5 Special Gift"
    },
    diamonds: 0,
    vip: 0
  },
  {
    day: 6,
    coins: 600000,
    exp: 30000,
    item: null,
    diamonds: 600,
    vip: 0
  },
  {
    day: 7,
    coins: 700000,
    exp: 50000,
    item: {
      type: "vipReward",
      id: "weekly_vip_07",
      name: "Day 7 VIP Reward"
    },
    diamonds: 700,
    vip: 1
  }
];

// ============================================================
// ROOM GAMES
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

gameNames.forEach(
  (name, index) => {
    const id =
      `game_${String(index + 1).padStart(2, "0")}`;

    games[id] = {
      id,
      name,
      enabled: true,
      minPlayers: 1,
      maxPlayers: 50
    };
  }
);

// ============================================================
// USER FUNCTIONS
// ============================================================

function ensureUser(
  userId,
  data = {}
) {
  userId =
    cleanUserId(userId) ||
    "guest";

  const input = safeObject(data);

  if (!users[userId]) {
    users[userId] = {
      id: userId,

      name:
        cleanText(
          input.name,
          "Guest"
        ),

      dp:
        cleanText(
          input.dp,
          `https://i.pravatar.cc/150?u=${encodeURIComponent(userId)}`
        ),

      gender:
        cleanText(
          input.gender,
          "Male"
        ),

      level:
        numberValue(
          input.level,
          1
        ),

      exp:
        numberValue(
          input.exp,
          0
        ),

      coins:
        numberValue(
          input.coins,
          100000
        ),

      diamonds:
        numberValue(
          input.diamonds ??
          input.diamond,
          0
        ),

      following:
        numberValue(
          input.following,
          0
        ),

      followers:
        numberValue(
          input.followers,
          0
        ),

      visitors:
        numberValue(
          input.visitors,
          0
        ),

      vipLevel:
        numberValue(
          input.vipLevel,
          0
        ),

      createdAt:
        numberValue(
          input.createdAt,
          now()
        ),

      updatedAt:
        now()
    };
  } else {
    const user =
      users[userId];

    if (
      input.name !== undefined &&
      cleanText(input.name)
    ) {
      user.name =
        cleanText(
          input.name,
          user.name
        );
    }

    if (
      input.dp !== undefined &&
      cleanText(input.dp)
    ) {
      user.dp =
        cleanText(
          input.dp,
          user.dp
        );
    }

    if (
      input.gender !== undefined
    ) {
      user.gender =
        cleanText(
          input.gender,
          user.gender
        );
    }
  }

  return users[userId];
}

function publicUser(
  user
) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    userId: user.id,

    name: user.name,
    dp: user.dp,
    gender: user.gender,

    level:
      numberValue(
        user.level,
        1
      ),

    exp:
      numberValue(
        user.exp,
        0
      ),

    coins:
      numberValue(
        user.coins,
        0
      ),

    diamonds:
      numberValue(
        user.diamonds,
        0
      ),

    diamond:
      numberValue(
        user.diamonds,
        0
      ),

    following:
      numberValue(
        user.following,
        0
      ),

    followers:
      numberValue(
        user.followers,
        0
      ),

    visitors:
      numberValue(
        user.visitors,
        0
      ),

    vipLevel:
      numberValue(
        user.vipLevel,
        0
      )
  };
}

function saveUser(
  user
) {
  if (!user) return;

  user.updatedAt =
    now();

  // Fire and forget Firebase persistence.
  persistUser(user.id)
    .catch(() => {});
}

function addCoins(
  userId,
  amount
) {
  const user =
    ensureUser(userId);

  user.coins =
    Math.max(
      0,
      Math.floor(
        numberValue(
          user.coins,
          0
        ) +
        numberValue(
          amount,
          0
        )
      )
    );

  saveUser(user);

  return user.coins;
}

function getExpForNextLevel(
  level
) {
  return Math.max(
    10000,
    Number(level || 1) *
      10000
  );
}

function addExp(
  userId,
  amount
) {
  const user =
    ensureUser(userId);

  user.exp =
    Math.max(
      0,
      Math.floor(
        numberValue(
          user.exp,
          0
        ) +
        numberValue(
          amount,
          0
        )
      )
    );

  while (
    user.exp >=
    getExpForNextLevel(
      user.level
    )
  ) {
    user.exp -=
      getExpForNextLevel(
        user.level
      );

    user.level += 1;
  }

  saveUser(user);

  return {
    level:
      user.level,
    exp:
      user.exp
  };
}

// ============================================================
// DAILY DATA
// ============================================================

function ensureDailyData(
  userId
) {
  if (
    !dailyData[userId]
  ) {
    dailyData[userId] = {
      loginDay: 0,
      lastLoginDate: "",
      streak: 0,

      lastExpDate: "",

      taskDate: "",

      tasks: {},

      taskClaims: {},

      weeklyClaimed: {},

      chatCount: 0,
      emojiCount: 0,
      roomMinutes: 0,

      followingCount: 0,
      giftCount: 0,
      gameCount: 0,
      profileVisits: 0
    };
  }

  return dailyData[userId];
}

function resetDailyIfNeeded(
  userId
) {
  const data =
    ensureDailyData(
      userId
    );

  const today =
    todayKey();

  if (
    data.taskDate !== today
  ) {
    data.taskDate =
      today;

    data.tasks = {};

    data.taskClaims = {};

    data.chatCount = 0;
    data.emojiCount = 0;
    data.roomMinutes = 0;

    data.followingCount = 0;
    data.giftCount = 0;
    data.gameCount = 0;
    data.profileVisits = 0;

    persistDaily(userId)
      .catch(() => {});
  }

  return data;
}

// ============================================================
// DAILY LOGIN
// ============================================================

function applyDailyLogin(
  userId
) {
  const data =
    ensureDailyData(
      userId
    );

  const today =
    todayKey();

  if (
    data.lastLoginDate ===
    today
  ) {
    return {
      alreadyClaimed: true,
      day: data.loginDay,
      streak: data.streak,
      reward: null
    };
  }

  data.loginDay += 1;

  if (
    data.loginDay > 7
  ) {
    data.loginDay = 1;
    data.weeklyClaimed = {};
  }

  data.streak += 1;

  data.lastLoginDate =
    today;

  resetDailyIfNeeded(
    userId
  );

  data.tasks.task_01 =
    true;

  const reward =
    weeklyRewards[
      data.loginDay - 1
    ];

  const user =
    ensureUser(
      userId
    );

  user.coins +=
    reward.coins;

  user.exp +=
    reward.exp;

  if (
    reward.diamonds
  ) {
    user.diamonds +=
      reward.diamonds;
  }

  if (
    reward.vip
  ) {
    user.vipLevel =
      Math.max(
        user.vipLevel,
        reward.vip
      );
  }

  if (
    reward.item
  ) {
    ensureInventory(
      userId
    );

    if (
      reward.item.type ===
      "avatarFrame"
    ) {
      inventories[
        userId
      ].avatarFrames.push({
        id:
          reward.item.id,

        name:
          reward.item.name,

        obtainedAt:
          now()
      });
    }

    if (
      reward.item.type ===
      "specialGift"
    ) {
      inventories[
        userId
      ].specialGifts =
        inventories[
          userId
        ].specialGifts || [];

      inventories[
        userId
      ].specialGifts.push({
        id:
          reward.item.id,

        name:
          reward.item.name,

        obtainedAt:
          now()
      });
    }

    if (
      reward.item.type ===
      "vipReward"
    ) {
      inventories[
        userId
      ].vipRewards =
        inventories[
          userId
        ].vipRewards || [];

      inventories[
        userId
      ].vipRewards.push({
        id:
          reward.item.id,

        name:
          reward.item.name,

        obtainedAt:
          now()
      });
    }
  }

  saveUser(user);

  persistDaily(userId)
    .catch(() => {});

  persistInventory(userId)
    .catch(() => {});

  return {
    alreadyClaimed: false,

    day:
      data.loginDay,

    streak:
      data.streak,

    reward
  };
}

// ============================================================
// INVENTORY
// ============================================================

function ensureInventory(
  userId
) {
  if (
    !inventories[userId]
  ) {
    inventories[userId] = {
      vehicles: [],
      avatarFrames: [],
      chatBubbles: [],
      profileCards: [],
      rgbNames: [],
      themes: [],
      visitors: [],
      gifts: [],
      specialGifts: [],
      vipRewards: []
    };
  }

  return inventories[userId];
}

// ============================================================
// FOLLOW
// ============================================================

function ensureFollowData(
  userId
) {
  if (
    !followRelations[userId]
  ) {
    followRelations[userId] = {
      following: {},
      followers: {}
    };
  }

  return followRelations[userId];
}

function isFollowing(
  fromUserId,
  targetUserId
) {
  const data =
    ensureFollowData(
      fromUserId
    );

  return Boolean(
    data.following[
      targetUserId
    ]
  );
}

function followUser(
  fromUserId,
  targetUserId
) {
  if (
    !fromUserId ||
    !targetUserId ||
    fromUserId === targetUserId
  ) {
    return {
      ok: false,
      error:
        "Invalid follow"
    };
  }

  if (
    isFollowing(
      fromUserId,
      targetUserId
    )
  ) {
    return {
      ok: false,
      error:
        "Already following"
    };
  }

  const fromData =
    ensureFollowData(
      fromUserId
    );

  const targetData =
    ensureFollowData(
      targetUserId
    );

  const fromUser =
    ensureUser(
      fromUserId
    );

  const targetUser =
    ensureUser(
      targetUserId
    );

  fromData.following[
    targetUserId
  ] = {
    userId:
      targetUserId,
    createdAt:
      now()
  };

  targetData.followers[
    fromUserId
  ] = {
    userId:
      fromUserId,
    createdAt:
      now()
  };

  fromUser.following =
    Object.keys(
      fromData.following
    ).length;

  targetUser.followers =
    Object.keys(
      targetData.followers
    ).length;

  saveUser(fromUser);
  saveUser(targetUser);

  persistFollowRelations(
    fromUserId
  ).catch(() => {});

  persistFollowRelations(
    targetUserId
  ).catch(() => {});

  return {
    ok: true,

    fromUser:
      publicUser(
        fromUser
      ),

    targetUser:
      publicUser(
        targetUser
      )
  };
}

// ============================================================
// ROOMS
// ============================================================

function createRoom(
  roomId,
  ownerId,
  data = {}
) {
  roomId =
    cleanText(
      roomId,
      randomRoomId()
    );

  ownerId =
    cleanUserId(
      ownerId
    ) ||
    "guest";

  const owner =
    ensureUser(
      ownerId,
      data
    );

  if (
    !rooms[roomId]
  ) {
    rooms[roomId] = {
      id:
        roomId,

      name:
        cleanText(
          data.name ||
          data.roomName,
          `${owner.name}'s Room`
        ),

      roomName:
        cleanText(
          data.name ||
          data.roomName,
          `${owner.name}'s Room`
        ),

      dp:
        cleanText(
          data.dp,
          owner.dp
        ),

      owner:
        owner.name,

      ownerId:
        owner.id,

      ownerDp:
        owner.dp,

      category:
        cleanText(
          data.category,
          "General"
        ),

      users: 0,

      maxSeats: 9,

      seats:
        Array(9).fill(null),

      members: {},

      mutedUsers: {},

      messages: [],

      gifts: [],

      roomExp: 0,

      topUsers: [],

      createdAt:
        numberValue(
          data.createdAt,
          now()
        ),

      updatedAt:
        now()
    };
  }

  return rooms[roomId];
}

function ensureRoom(
  roomId,
  ownerId = "guest",
  data = {}
) {
  if (
    !rooms[roomId]
  ) {
    return createRoom(
      roomId,
      ownerId,
      data
    );
  }

  return rooms[roomId];
}

function getRoomUserCount(
  room
) {
  if (!room) return 0;

  return Object.keys(
    room.members || {}
  ).length;
}

function roomData(
  room
) {
  if (!room) return null;

  const members = {};

  Object.keys(
    room.members || {}
  ).forEach(
    id => {
      const member =
        room.members[id];

      members[id] = {
        userId:
          member.userId,

        name:
          member.name,

        dp:
          member.dp,

        seatIndex:
          member.seatIndex,

        mic:
          Boolean(
            member.mic
          ),

        speaker:
          member.speaker !== false,

        muted:
          Boolean(
            member.muted
          ),

        joinedAt:
          member.joinedAt
      };
    }
  );

  return {
    id:
      room.id,

    name:
      room.name,

    roomName:
      room.roomName ||
      room.name,

    dp:
      room.dp,

    owner:
      room.owner,

    ownerId:
      room.ownerId,

    ownerDp:
      room.ownerDp,

    category:
      room.category,

    users:
      getRoomUserCount(
        room
      ),

    maxSeats:
      9,

    seats:
      room.seats,

    members,

    messages:
      room.messages.slice(
        -100
      ),

    gifts:
      room.gifts.slice(
        -100
      ),

    roomExp:
      room.roomExp,

    topUsers:
      room.topUsers,

    createdAt:
      room.createdAt,

    updatedAt:
      room.updatedAt
  };
}

function broadcastRoom(
  roomId
) {
  const room =
    rooms[roomId];

  if (!room) return;

  room.users =
    getRoomUserCount(
      room
    );

  room.updatedAt =
    now();

  const data =
    roomData(room);

  io.to(roomId).emit(
    "room-state",
    data
  );

  io.to(roomId).emit(
    "roomState",
    data
  );

  io.to(roomId).emit(
    "room-updated",
    data
  );

  persistRoom(roomId)
    .catch(() => {});
}

function removeUserFromRoom(
  socket,
  roomId
) {
  const room =
    rooms[roomId];

  if (!room) return;

  const userId =
    socketUsers[
      socket.id
    ] ||
    socket.userId;

  if (!userId) return;

  if (
    room.members[userId]
  ) {
    const seatIndex =
      room.members[
        userId
      ].seatIndex;

    if (
      seatIndex !== null &&
      seatIndex !== undefined &&
      room.seats[
        seatIndex
      ]
    ) {
      room.seats[
        seatIndex
      ] = null;
    }

    delete room.members[
      userId
    ];
  }

  room.users =
    getRoomUserCount(
      room
    );

  room.updatedAt =
    now();

  socket.leave(
    roomId
  );

  socket.currentRoom =
    null;

  io.to(roomId).emit(
    "user-left",
    {
      userId,
      roomId
    }
  );

  broadcastRoom(
    roomId
  );

  cleanupEmptyRoom(
    roomId
  );
}

function cleanupEmptyRoom(
  roomId
) {
  const room =
    rooms[roomId];

  if (!room) return;

  if (
    getRoomUserCount(
      room
    ) > 0
  ) {
    return;
  }

  // Do not immediately delete newly-created rooms.
  // Keep them for 10 minutes so Home/Room navigation
  // does not cause accidental deletion.
  if (
    now() -
      room.updatedAt <
    10 * 60 * 1000
  ) {
    return;
  }

  delete rooms[
    roomId
  ];

  firebaseDelete(
    `rooms/${encodeURIComponent(roomId)}`
  ).catch(() => {});
}

// Periodic cleanup.
setInterval(
  () => {
    Object.keys(
      rooms
    ).forEach(
      cleanupEmptyRoom
    );
  },
  5 * 60 * 1000
);

// ============================================================
// ROOM EXP / TOP USERS
// ============================================================

function updateRoomTopUsers(
  room
) {
  if (!room) return;

  const list =
    Object.values(
      room.members || {}
    )
      .map(
        member => {
          const user =
            ensureUser(
              member.userId
            );

          return {
            userId:
              user.id,

            name:
              user.name,

            dp:
              user.dp,

            level:
              user.level,

            roomExp:
              0
          };
        }
      )
      .slice(
        0,
        3
      );

  room.topUsers =
    list;
}

// ============================================================
// DAILY EXP
// ============================================================

function applyDailyExp(
  userId
) {
  const data =
    ensureDailyData(
      userId
    );

  const today =
    todayKey();

  if (
    data.lastExpDate ===
    today
  ) {
    return {
      applied: false,
      amount: 0,

      level:
        ensureUser(
          userId
        ).level,

      exp:
        ensureUser(
          userId
        ).exp
    };
  }

  data.lastExpDate =
    today;

  const result =
    addExp(
      userId,
      50000
    );

  persistDaily(userId)
    .catch(() => {});

  return {
    applied: true,

    amount:
      50000,

    level:
      result.level,

    exp:
      result.exp
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
  senderId =
    cleanUserId(
      senderId
    );

  receiverId =
    cleanUserId(
      receiverId
    );

  giftId =
    cleanText(
      giftId
    );

  const qty =
    Math.min(
      100,
      Math.max(
        1,
        positiveInt(
          quantity,
          1
        )
      )
    );

  if (!senderId) {
    return {
      ok: false,
      error:
        "Sender not found"
    };
  }

  if (!receiverId) {
    return {
      ok: false,
      error:
        "Receiver not found"
    };
  }

  if (
    senderId ===
    receiverId
  ) {
    return {
      ok: false,
      error:
        "You cannot send a gift to yourself"
    };
  }

  const gift =
    gifts[giftId];

  if (!gift) {
    return {
      ok: false,
      error:
        "Invalid gift"
    };
  }

  const sender =
    ensureUser(
      senderId
    );

  const receiver =
    ensureUser(
      receiverId
    );

  const total =
    gift.price * qty;

  if (
    sender.coins <
    total
  ) {
    return {
      ok: false,

      error:
        "Insufficient coins",

      required:
        total,

      balance:
        sender.coins
    };
  }

  const lockKey =
    `${senderId}:${receiverId}:${giftId}`;

  if (
    giftLocks.has(
      lockKey
    )
  ) {
    return {
      ok: false,
      error:
        "Please wait and try again"
    };
  }

  giftLocks.add(
    lockKey
  );

  try {
    // ========================================================
    // SERVER-SIDE COIN DEDUCTION
    // ========================================================

    sender.coins -=
      total;

    // Gift EXP for sender.
    const expResult =
      addExp(
        senderId,
        Math.max(
          10,
          Math.floor(
            total / 100
          )
        )
      );

    ensureInventory(
      receiverId
    );

    const transaction = {
      id:
        makeId(
          "gift_tx_"
        ),

      roomId:
        cleanText(
          roomId,
          ""
        ),

      senderId,

      senderName:
        sender.name,

      senderDp:
        sender.dp,

      receiverId,

      receiverName:
        receiver.name,

      receiverDp:
        receiver.dp,

      giftId:
        gift.id,

      giftName:
        gift.name,

      giftEmoji:
        gift.emoji,

      category:
        gift.category,

      unitPrice:
        gift.price,

      quantity:
        qty,

      totalCoins:
        total,

      senderBalance:
        sender.coins,

      senderLevel:
        expResult.level,

      createdAt:
        now()
    };

    giftHistory.push(
      transaction
    );

    while (
      giftHistory.length >
      MAX_GIFT_HISTORY
    ) {
      giftHistory.shift();
    }

    const receiverInventory =
      inventories[
        receiverId
      ];

    receiverInventory.gifts =
      receiverInventory.gifts ||
      [];

    receiverInventory.gifts.push({
      transactionId:
        transaction.id,

      giftId:
        gift.id,

      giftName:
        gift.name,

      giftEmoji:
        gift.emoji,

      fromUserId:
        senderId,

      fromName:
        sender.name,

      quantity:
        qty,

      totalCoins:
        total,

      receivedAt:
        transaction.createdAt
    });

    if (
      receiverInventory
        .gifts.length >
      MAX_USER_GIFTS
    ) {
      receiverInventory
        .gifts.shift();
    }

    // ========================================================
    // ROOM GIFT
    // ========================================================

    if (
      roomId &&
      rooms[roomId]
    ) {
      const room =
        rooms[roomId];

      room.gifts.push(
        transaction
      );

      if (
        room.gifts.length >
        MAX_ROOM_GIFTS
      ) {
        room.gifts.shift();
      }

      room.roomExp +=
        Math.max(
          1,
          Math.floor(
            total / 100
          )
        );

      updateRoomTopUsers(
        room
      );

      room.updatedAt =
        now();
    }

    saveUser(
      sender
    );

    saveUser(
      receiver
    );

    persistInventory(
      receiverId
    ).catch(() => {});

    return {
      ok: true,

      transaction,

      sender:
        publicUser(
          sender
        ),

      receiver:
        publicUser(
          receiver
        ),

      gift
    };
  } finally {
    giftLocks.delete(
      lockKey
    );
  }
}

// ============================================================
// LOAD FIREBASE DATA
// ============================================================

async function loadFirebaseData() {
  if (
    !FIREBASE_ENABLED
  ) {
    console.log(
      "Firebase persistence disabled."
    );

    return;
  }

  console.log(
    "Loading PawanVoice data from Firebase..."
  );

  try {
    const firebaseUsers =
      await firebaseGet(
        "users"
      );

    if (
      firebaseUsers &&
      typeof firebaseUsers ===
        "object"
    ) {
      Object.entries(
        firebaseUsers
      ).forEach(
        ([id, data]) => {
          if (
            !data ||
            typeof data !==
              "object"
          ) {
            return;
          }

          const userId =
            cleanUserId(
              data.userId ||
              data.id ||
              id
            );

          if (!userId) {
            return;
          }

          users[userId] =
            ensureUser(
              userId,
              {
                ...data,

                diamonds:
                  data.diamonds ??
                  data.diamond ??
                  0
              }
            );

          users[userId].coins =
            numberValue(
              data.coins,
              users[userId].coins
            );

          users[userId].diamonds =
            numberValue(
              data.diamonds ??
              data.diamond,
              users[userId].diamonds
            );

          users[userId].level =
            numberValue(
              data.level,
              users[userId].level
            );

          users[userId].exp =
            numberValue(
              data.exp,
              users[userId].exp
            );

          users[userId].following =
            numberValue(
              data.following,
              0
            );

          users[userId].followers =
            numberValue(
              data.followers,
              0
            );

          users[userId].visitors =
            numberValue(
              data.visitors,
              0
            );

          users[userId].vipLevel =
            numberValue(
              data.vipLevel,
              0
            );
        }
      );
    }

    const firebaseRooms =
      await firebaseGet(
        "rooms"
      );

    if (
      firebaseRooms &&
      typeof firebaseRooms ===
        "object"
    ) {
      Object.entries(
        firebaseRooms
      ).forEach(
        ([id, data]) => {
          if (
            !data ||
            typeof data !==
              "object"
          ) {
            return;
          }

          const room =
            createRoom(
              data.id ||
                id,
              data.ownerId ||
                "guest",
              data
            );

          room.name =
            cleanText(
              data.name ||
              data.roomName,
              room.name
            );

          room.roomName =
            room.name;

          room.dp =
            cleanText(
              data.dp,
              room.dp
            );

          room.owner =
            cleanText(
              data.owner,
              room.owner
            );

          room.ownerId =
            cleanUserId(
              data.ownerId ||
              room.ownerId
            );

          room.ownerDp =
            cleanText(
              data.ownerDp,
              room.ownerDp
            );

          room.category =
            cleanText(
              data.category,
              room.category
            );

          room.roomExp =
            numberValue(
              data.roomExp,
              0
            );

          room.createdAt =
            numberValue(
              data.createdAt,
              now()
            );

          room.updatedAt =
            numberValue(
              data.updatedAt,
              now()
            );

          // Firebase room members are
          // used as room snapshot only.
          room.members = {};

          if (
            data.members &&
            typeof data.members ===
              "object"
          ) {
            Object.entries(
              data.members
            ).forEach(
              ([userId, member]) => {
                if (
                  !member ||
                  typeof member !==
                    "object"
                ) {
                  return;
                }

                const uid =
                  cleanUserId(
                    member.userId ||
                    userId
                  );

                if (!uid) {
                  return;
                }

                room.members[
                  uid
                ] = {
                  userId: uid,

                  name:
                    cleanText(
                      member.name,
                      "Guest"
                    ),

                  dp:
                    cleanText(
                      member.dp,
                      ""
                    ),

                  seatIndex:
                    member.seatIndex ??
                    null,

                  mic:
                    Boolean(
                      member.mic
                    ),

                  speaker:
                    member.speaker !==
                    false,

                  muted:
                    Boolean(
                      member.muted
                    ),

                  joinedAt:
                    numberValue(
                      member.joinedAt,
                      now()
                    )
                };
              }
            );
          }

          // Do not count persisted members
          // as currently online.
          room.users = 0;

          room.members = {};

          if (
            Array.isArray(
              data.seats
            )
          ) {
            room.seats =
              Array(9)
                .fill(null)
                .map(
                  (_, index) =>
                    data.seats[
                      index
                    ] || null
                );
          }
        }
      );
    }

    const firebaseDaily =
      await firebaseGet(
        "dailyData"
      );

    if (
      firebaseDaily &&
      typeof firebaseDaily ===
        "object"
    ) {
      Object.entries(
        firebaseDaily
      ).forEach(
        ([userId, data]) => {
          if (
            data &&
            typeof data ===
              "object"
          ) {
            dailyData[
              cleanUserId(
                userId
              )
            ] = data;
          }
        }
      );
    }

    const firebaseInventories =
      await firebaseGet(
        "inventories"
      );

    if (
      firebaseInventories &&
      typeof firebaseInventories ===
        "object"
    ) {
      Object.entries(
        firebaseInventories
      ).forEach(
        ([userId, data]) => {
          if (
            data &&
            typeof data ===
              "object"
          ) {
            inventories[
              cleanUserId(
                userId
              )
            ] = data;
          }
        }
      );
    }

    const firebaseFollows =
      await firebaseGet(
        "followRelations"
      );

    if (
      firebaseFollows &&
      typeof firebaseFollows ===
        "object"
    ) {
      Object.entries(
        firebaseFollows
      ).forEach(
        ([userId, data]) => {
          if (
            data &&
            typeof data ===
              "object"
          ) {
            followRelations[
              cleanUserId(
                userId
              )
            ] = data;
          }
        }
      );
    }

    console.log(
      "Firebase data loaded:",
      {
        users:
          Object.keys(
            users
          ).length,

        rooms:
          Object.keys(
            rooms
          ).length
      }
    );
  } catch (error) {
    console.error(
      "Firebase startup load failed:",
      error.message
    );
  }
}

// ============================================================
// BASIC API
// ============================================================

app.get(
  "/",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );
  }
);

app.get(
  "/index.html",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );
  }
);

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

app.get(
  "/health",
  (req, res) => {
    res.json({
      ok: true,

      app:
        "PawanVoice",

      status:
        "running",

      firebase:
        FIREBASE_ENABLED,

      time:
        now()
    });
  }
);

app.get(
  "/api/status",
  (req, res) => {
    res.json({
      app:
        "PawanVoice Room Server",

      status:
        "running",

      socketIO:
        true,

      seats:
        9,

      rooms:
        Object.keys(
          rooms
        ).length,

      users:
        Object.keys(
          users
        ).length,

      gifts:
        Object.keys(
          gifts
        ).length,

      giftHistory:
        giftHistory.length,

      games:
        Object.keys(
          games
        ).length,

      firebase:
        FIREBASE_ENABLED
    });
  }
);

// ============================================================
// GIFTS API
// ============================================================

app.get(
  "/api/gifts",
  (req, res) => {
    res.json({
      ok: true,

      count:
        Object.keys(
          gifts
        ).length,

      gifts:
        Object.values(
          gifts
        )
    });
  }
);

// ============================================================
// STORE API
// ============================================================

app.get(
  "/api/store",
  (req, res) => {
    res.json({
      ok: true,
      store
    });
  }
);

// ============================================================
// EVENTS API
// ============================================================

app.get(
  "/api/events",
  (req, res) => {
    res.json({
      ok: true,

      events: [
        {
          id:
            "event_family",
          name:
            "Family Ranking",
          active:
            true
        },

        {
          id:
            "event_cp",
          name:
            "CP Ranking",
          active:
            true
        },

        {
          id:
            "event_rich",
          name:
            "Rich King",
          active:
            true
        },

        {
          id:
            "event_daily",
          name:
            "Daily Login Event",
          active:
            true
        },

        {
          id:
            "event_gift",
          name:
            "Gift Festival",
          active:
            true
        },

        {
          id:
            "event_game",
          name:
            "Room Game Event",
          active:
            true
        },

        {
          id:
            "event_vehicle",
          name:
            "Vehicle Event",
          active:
            true
        },

        {
          id:
            "event_frame",
          name:
            "Avatar Frame Event",
          active:
            true
        },

        {
          id:
            "event_vip",
          name:
            "VIP Event",
          active:
            true
        },

        {
          id:
            "event_pawan",
          name:
            "PawanVoice Exclusive",
          active:
            true
        }
      ]
    });
  }
);

// ============================================================
// TASK API
// ============================================================

app.get(
  "/api/tasks",
  (req, res) => {
    const userId =
      cleanUserId(
        req.query.userId
      );

    if (!userId) {
      return res.json({
        ok: true,
        tasks:
          dailyTasks
      });
    }

    const data =
      resetDailyIfNeeded(
        userId
      );

    res.json({
      ok: true,

      date:
        todayKey(),

      tasks:
        dailyTasks.map(
          task => ({
            ...task,

            completed:
              Boolean(
                data.tasks[
                  task.id
                ]
              ),

            claimed:
              Boolean(
                data.taskClaims[
                  task.id
                ]
              )
          })
        )
    });
  }
);

// ============================================================
// CLAIM DAILY TASK
// ============================================================

app.post(
  "/api/tasks/claim",
  (req, res) => {
    const userId =
      cleanUserId(
        req.body.userId ||
        req.body.id
      );

    const taskId =
      cleanText(
        req.body.taskId
      );

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error:
          "userId required"
      });
    }

    const task =
      dailyTasks.find(
        x =>
          x.id ===
          taskId
      );

    if (!task) {
      return res.status(404).json({
        ok: false,
        error:
          "Task not found"
      });
    }

    const data =
      resetDailyIfNeeded(
        userId
      );

    if (
      !data.tasks[
        task.id
      ]
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Task not completed"
      });
    }

    if (
      data.taskClaims[
        task.id
      ]
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Task already claimed"
      });
    }

    data.taskClaims[
      task.id
    ] = true;

    const user =
      ensureUser(
        userId
      );

    user.coins +=
      task.rewardCoins;

    const expResult =
      addExp(
        userId,
        task.rewardExp
      );

    saveUser(user);

    persistDaily(userId)
      .catch(() => {});

    res.json({
      ok: true,

      task,

      user:
        publicUser(
          user
        ),

      exp:
        expResult
    });
  }
);

// ============================================================
// WEEKLY REWARDS
// ============================================================

app.get(
  "/api/weekly-rewards",
  (req, res) => {
    res.json({
      ok: true,
      rewards:
        weeklyRewards
    });
  }
);

app.post(
  "/api/weekly-rewards/claim",
  (req, res) => {
    const userId =
      cleanUserId(
        req.body.userId
      );

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error:
          "userId required"
      });
    }

    const data =
      ensureDailyData(
        userId
      );

    const today =
      todayKey();

    if (
      data.lastLoginDate !==
      today
    ) {
      const result =
        applyDailyLogin(
          userId
        );

      return res.json({
        ok: true,

        result,

        user:
          publicUser(
            ensureUser(
              userId
            )
          )
      });
    }

    return res.json({
      ok: false,

      error:
        "Today's reward already claimed",

      user:
        publicUser(
          ensureUser(
            userId
          )
        )
    });
  }
);

// ============================================================
// GAMES
// ============================================================

app.get(
  "/api/games",
  (req, res) => {
    res.json({
      ok: true,

      count:
        Object.keys(
          games
        ).length,

      games:
        Object.values(
          games
        )
    });
  }
);

// ============================================================
// USER API
// ============================================================

app.get(
  "/api/user/:id",
  (req, res) => {
    const userId =
      cleanUserId(
        req.params.id
      );

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error:
          "Invalid userId"
      });
    }

    const user =
      ensureUser(
        userId
      );

    res.json({
      ok: true,

      user:
        publicUser(
          user
        )
    });
  }
);

app.post(
  "/api/user",
  (req, res) => {
    const userId =
      cleanUserId(
        req.body.userId ||
        req.body.id
      );

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error:
          "userId required"
      });
    }

    const user =
      ensureUser(
        userId,
        req.body
      );

    if (
      req.body.name !==
      undefined
    ) {
      user.name =
        cleanText(
          req.body.name,
          user.name
        );
    }

    if (
      req.body.dp !==
      undefined
    ) {
      user.dp =
        cleanText(
          req.body.dp,
          user.dp
        );
    }

    if (
      req.body.gender !==
      undefined
    ) {
      user.gender =
        cleanText(
          req.body.gender,
          user.gender
        );
    }

    if (
      req.body.diamonds !==
      undefined ||
      req.body.diamond !==
      undefined
    ) {
      user.diamonds =
        numberValue(
          req.body.diamonds ??
          req.body.diamond,
          user.diamonds
        );
    }

    saveUser(user);

    res.json({
      ok: true,

      user:
        publicUser(
          user
        )
    });
  }
);

app.patch(
  "/api/user/:id",
  (req, res) => {
    const userId =
      cleanUserId(
        req.params.id
      );

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error:
          "Invalid userId"
      });
    }

    const user =
      ensureUser(
        userId
      );

    if (
      req.body.name !==
      undefined
    ) {
      user.name =
        cleanText(
          req.body.name,
          user.name
        );
    }

    if (
      req.body.dp !==
      undefined
    ) {
      user.dp =
        cleanText(
          req.body.dp,
          user.dp
        );
    }

    if (
      req.body.gender !==
      undefined
    ) {
      user.gender =
        cleanText(
          req.body.gender,
          user.gender
        );
    }

    if (
      req.body.diamonds !==
      undefined ||
      req.body.diamond !==
      undefined
    ) {
      user.diamonds =
        numberValue(
          req.body.diamonds ??
          req.body.diamond,
          user.diamonds
        );
    }

    saveUser(user);

    // Update user's data in every room.
    Object.values(
      rooms
    ).forEach(
      room => {
        if (
          room.ownerId ===
          userId
        ) {
          room.owner =
            user.name;

          room.ownerDp =
            user.dp;

          room.dp =
            room.dp ||
            user.dp;
        }

        if (
          room.members[
            userId
          ]
        ) {
          const member =
            room.members[
              userId
            ];

          member.name =
            user.name;

          member.dp =
            user.dp;

          const seatIndex =
            member.seatIndex;

          if (
            seatIndex !==
              null &&
            seatIndex !==
              undefined &&
            room.seats[
              seatIndex
            ]
          ) {
            room.seats[
              seatIndex
            ].name =
              user.name;

            room.seats[
              seatIndex
            ].dp =
              user.dp;
          }
        }

        room.updatedAt =
          now();

        broadcastRoom(
          room.id
        );
      }
    );

    res.json({
      ok: true,

      user:
        publicUser(
          user
        )
    });
  }
);

// ============================================================
// WALLET
// ============================================================

app.get(
  "/api/user/:userId/wallet",
  (req, res) => {
    const userId =
      cleanUserId(
        req.params.userId
      );

    const user =
      ensureUser(
        userId
      );

    res.json({
      ok: true,

      userId,

      coins:
        user.coins,

      diamonds:
        user.diamonds,

      diamond:
        user.diamonds,

      level:
        user.level,

      exp:
        user.exp,

      vipLevel:
        user.vipLevel
    });
  }
);

// ============================================================
// INVENTORY API
// ============================================================

app.get(
  "/api/user/:userId/inventory",
  (req, res) => {
    const userId =
      cleanUserId(
        req.params.userId
      );

    const inventory =
      ensureInventory(
        userId
      );

    res.json({
      ok: true,

      userId,

      inventory
    });
  }
);

// ============================================================
// FOLLOW API
// ============================================================

app.get(
  "/api/user/:userId/following",
  (req, res) => {
    const userId =
      cleanUserId(
        req.params.userId
      );

    const data =
      ensureFollowData(
        userId
      );

    res.json({
      ok: true,

      userId,

      following:
        Object.values(
          data.following
        )
    });
  }
);

app.get(
  "/api/user/:userId/followers",
  (req, res) => {
    const userId =
      cleanUserId(
        req.params.userId
      );

    const data =
      ensureFollowData(
        userId
      );

    res.json({
      ok: true,

      userId,

      followers:
        Object.values(
          data.followers
        )
    });
  }
);

app.post(
  "/api/follow",
  (req, res) => {
    const fromUserId =
      cleanUserId(
        req.body.fromUserId ||
        req.body.userId
      );

    const targetUserId =
      cleanUserId(
        req.body.targetUserId ||
        req.body.targetId
      );

    const result =
      followUser(
        fromUserId,
        targetUserId
      );

    if (!result.ok) {
      return res.status(400).json(
        result
      );
    }

    const data =
      resetDailyIfNeeded(
        fromUserId
      );

    data.followingCount += 1;

    data.tasks.task_06 =
      true;

    persistDaily(
      fromUserId
    ).catch(() => {});

    res.json(
      result
    );
  }
);

// ============================================================
// GIFT SEND API
// ============================================================

app.post(
  "/api/gifts/send",
  (req, res) => {
    const senderId =
      cleanUserId(
        req.body.senderId ||
        req.body.userId ||
        req.body.fromUserId
      );

    const receiverId =
      cleanUserId(
        req.body.receiverId ||
        req.body.targetUserId ||
        req.body.toUserId
      );

    const giftId =
      cleanText(
        req.body.giftId
      );

    const quantity =
      positiveInt(
        req.body.quantity,
        1
      );

    const roomId =
      cleanText(
        req.body.roomId
      );

    const result =
      processGift({
        senderId,
        receiverId,
        giftId,
        quantity,
        roomId
      });

    if (!result.ok) {
      return res.status(400).json(
        result
      );
    }

    const data =
      resetDailyIfNeeded(
        senderId
      );

    data.tasks.task_03 =
      true;

    data.giftCount +=
      quantity;

    persistDaily(
      senderId
    ).catch(() => {});

    if (roomId) {
      broadcastRoom(
        roomId
      );
    }

    res.json(
      result
    );
  }
);

// ============================================================
// GIFT HISTORY
// ============================================================

app.get(
  "/api/gift-history",
  (req, res) => {
    const userId =
      cleanUserId(
        req.query.userId
      );

    let list =
      giftHistory;

    if (userId) {
      list =
        giftHistory.filter(
          x =>
            x.senderId ===
              userId ||
            x.receiverId ===
              userId
        );
    }

    const limit =
      Math.min(
        500,
        Math.max(
          1,
          numberValue(
            req.query.limit,
            100
          )
        )
      );

    res.json({
      ok: true,

      count:
        list.length,

      history:
        list
          .slice(-limit)
          .reverse()
    });
  }
);

app.get(
  "/api/user/:userId/gift-history",
  (req, res) => {
    const userId =
      cleanUserId(
        req.params.userId
      );

    const list =
      giftHistory
        .filter(
          x =>
            x.senderId ===
              userId ||
            x.receiverId ===
              userId
        )
        .slice(-500)
        .reverse();

    res.json({
      ok: true,

      userId,

      count:
        list.length,

      history:
        list
    });
  }
);

// ============================================================
// ROOM API
// ============================================================

app.get(
  "/api/rooms",
  (req, res) => {
    res.json({
      ok: true,

      rooms:
        Object.values(
          rooms
        )
          .filter(
            room =>
              getRoomUserCount(
                room
              ) > 0 ||
              now() -
                room.createdAt <
                10 * 60 * 1000
          )
          .map(
            room =>
              roomData(
                room
              )
          )
    });
  }
);

app.get(
  "/api/room/:id",
  (req, res) => {
    const roomId =
      cleanText(
        req.params.id
      );

    const room =
      rooms[roomId];

    if (!room) {
      return res.status(404).json({
        ok: false,
        error:
          "Room not found"
      });
    }

    res.json({
      ok: true,

      room:
        roomData(
          room
        )
    });
  }
);

app.post(
  "/api/room",
  (req, res) => {
    const ownerId =
      cleanUserId(
        req.body.ownerId ||
        req.body.userId
      );

    if (!ownerId) {
      return res.status(400).json({
        ok: false,
        error:
          "ownerId required"
      });
    }

    let roomId =
      cleanText(
        req.body.roomId
      );

    if (!roomId) {
      roomId =
        randomRoomId();
    }

    // Avoid duplicate room IDs.
    while (
      rooms[roomId]
    ) {
      roomId =
        randomRoomId();
    }

    const room =
      createRoom(
        roomId,
        ownerId,
        req.body
      );

    persistRoom(
      roomId
    ).catch(() => {});

    res.json({
      ok: true,

      room:
        roomData(
          room
        )
    });
  }
);

app.patch(
  "/api/room/:id",
  (req, res) => {
    const roomId =
      cleanText(
        req.params.id
      );

    const room =
      rooms[roomId];

    if (!room) {
      return res.status(404).json({
        ok: false,
        error:
          "Room not found"
      });
    }

    const requesterId =
      cleanUserId(
        req.body.ownerId ||
        req.body.userId
      );

    // Existing API accepted updates without
    // checking owner. For safety, now owner is required.
    if (
      requesterId &&
      requesterId !==
        room.ownerId
    ) {
      return res.status(403).json({
        ok: false,
        error:
          "Only room owner can update room"
      });
    }

    if (
      req.body.name !==
      undefined
    ) {
      room.name =
        cleanText(
          req.body.name,
          room.name
        );

      room.roomName =
        room.name;
    }

    if (
      req.body.roomName !==
      undefined
    ) {
      room.name =
        cleanText(
          req.body.roomName,
          room.name
        );

      room.roomName =
        room.name;
    }

    if (
      req.body.dp !==
      undefined
    ) {
      room.dp =
        cleanText(
          req.body.dp,
          room.dp
        );
    }

    if (
      req.body.category !==
      undefined
    ) {
      room.category =
        cleanText(
          req.body.category,
          room.category
        );
    }

    room.updatedAt =
      now();

    broadcastRoom(
      roomId
    );

    res.json({
      ok: true,

      room:
        roomData(
          room
        )
    });
  }
);

// ============================================================
// SOCKET.IO
// ============================================================

io.on(
  "connection",
  socket => {
    console.log(
      "Socket connected:",
      socket.id
    );

    // ========================================================
    // REGISTER USER
    // ========================================================

    socket.on(
      "register-user",
      payload => {
        payload =
          safeObject(
            payload
          );

        const userId =
          cleanUserId(
            payload.userId ||
            payload.id ||
            socket.id
          );

        const user =
          ensureUser(
            userId,
            payload
          );

        socketUsers[
          socket.id
        ] = userId;

        if (
          !userSockets[
            userId
          ]
        ) {
          userSockets[
            userId
          ] = new Set();
        }

        userSockets[
          userId
        ].add(
          socket.id
        );

        socket.userId =
          userId;

        resetDailyIfNeeded(
          userId
        );

        const loginReward =
          applyDailyLogin(
            userId
          );

        const dailyExp =
          applyDailyExp(
            userId
          );

        socket.emit(
          "user-registered",
          {
            ok: true,

            user:
              publicUser(
                user
              ),

            loginReward,

            dailyExp
          }
        );

        socket.emit(
          "registered-user",
          {
            ok: true,

            user:
              publicUser(
                user
              )
          }
        );

        socket.emit(
          "wallet-updated",
          {
            userId,

            coins:
              user.coins,

            diamonds:
              user.diamonds,

            diamond:
              user.diamonds,

            level:
              user.level,

            exp:
              user.exp,

            vipLevel:
              user.vipLevel
          }
        );
      }
    );

    // ========================================================
    // JOIN ROOM
    // ========================================================

    socket.on(
      "join-room",
      payload => {
        payload =
          safeObject(
            payload
          );

        const roomId =
          cleanText(
            payload.roomId ||
            payload.id ||
            "main"
          );

        const userId =
          socketUsers[
            socket.id
          ] ||
          cleanUserId(
            payload.userId
          ) ||
          socket.id;

        const user =
          ensureUser(
            userId,
            payload
          );

        socketUsers[
          socket.id
        ] = userId;

        socket.userId =
          userId;

        if (
          !userSockets[
            userId
          ]
        ) {
          userSockets[
            userId
          ] = new Set();
        }

        userSockets[
          userId
        ].add(
          socket.id
        );

        // Leave old room first.
        if (
          socket.currentRoom &&
          socket.currentRoom !==
            roomId
        ) {
          removeUserFromRoom(
            socket,
            socket.currentRoom
          );
        }

        const room =
          ensureRoom(
            roomId,
            userId,
            payload
          );

        socket.join(
          roomId
        );

        socket.currentRoom =
          roomId;

        if (
          !room.members[
            userId
          ]
        ) {
          room.members[
            userId
          ] = {
            userId,

            name:
              user.name,

            dp:
              user.dp,

            seatIndex:
              null,

            mic:
              false,

            speaker:
              true,

            muted:
              Boolean(
                room.mutedUsers[
                  userId
                ]
              ),

            joinedAt:
              now()
          };
        } else {
          room.members[
            userId
          ].name =
            user.name;

          room.members[
            userId
          ].dp =
            user.dp;
        }

        room.users =
          getRoomUserCount(
            room
          );

        room.updatedAt =
          now();

        // Daily task.
        const daily =
          resetDailyIfNeeded(
            userId
          );

        daily.tasks.task_02 =
          true;

        // Daily voice-room activity.
        daily.tasks.task_05 =
          true;

        persistDaily(
          userId
        ).catch(() => {});

        const state =
          roomData(
            room
          );

        socket.emit(
          "room-state",
          state
        );

        socket.emit(
          "roomState",
          state
        );

        socket.emit(
          "room-joined",
          state
        );

        socket.to(
          roomId
        ).emit(
          "user-entry",
          {
            userId,

            name:
              user.name,

            dp:
              user.dp,

            roomId
          }
        );

        socket.to(
          roomId
        ).emit(
          "user-joined",
          {
            userId,

            name:
              user.name,

            dp:
              user.dp,

            roomId
          }
        );

        broadcastRoom(
          roomId
        );
      }
    );

    // ========================================================
    // LEAVE ROOM
    // ========================================================

    socket.on(
      "leave-room",
      payload => {
        const roomId =
          cleanText(
            payload &&
              payload.roomId
          ) ||
          socket.currentRoom;

        if (roomId) {
          removeUserFromRoom(
            socket,
            roomId
          );
        }
      }
    );

    // ========================================================
    // TAKE SEAT
    // ========================================================

    socket.on(
      "take-seat",
      payload => {
        payload =
          safeObject(
            payload
          );

        const roomId =
          cleanText(
            payload.roomId
          ) ||
          socket.currentRoom;

        const seatIndex =
          Number(
            payload.seatIndex
          );

        const userId =
          socketUsers[
            socket.id
          ] ||
          socket.userId;

        if (
          !roomId ||
          !userId
        ) {
          return;
        }

        const room =
          rooms[roomId];

        if (!room) {
          return socket.emit(
            "error-message",
            {
              message:
                "Room not found"
            }
          );
        }

        if (
          !Number.isInteger(
            seatIndex
          ) ||
          seatIndex < 0 ||
          seatIndex >= 9
        ) {
          return socket.emit(
            "error-message",
            {
              message:
                "Invalid seat"
            }
          );
        }

        const member =
          room.members[
            userId
          ];

        if (!member) {
          return socket.emit(
            "error-message",
            {
              message:
                "Join the room first"
            }
          );
        }

        // If muted by owner, do not allow mic.
        if (
          room.mutedUsers[
            userId
          ]
        ) {
          member.mic =
            false;
        }

        // Check occupation BEFORE removing old seat.
        const occupied =
          room.seats[
            seatIndex
          ];

        if (
          occupied &&
          occupied.userId !==
            userId
        ) {
          return socket.emit(
            "seat-taken",
            {
              seatIndex,

              userId:
                occupied.userId,

              name:
                occupied.name
            }
          );
        }

        // Remove previous seat.
        room.seats =
          room.seats.map(
            (seat, index) => {
              if (
                seat &&
                seat.userId ===
                  userId &&
                index !==
                  seatIndex
              ) {
                return null;
              }

              return seat;
            }
          );

        member.seatIndex =
          seatIndex;

        room.seats[
          seatIndex
        ] = {
          userId,

          name:
            member.name,

          dp:
            member.dp,

          mic:
            Boolean(
              member.mic
            ),

          speaker:
            member.speaker !==
            false
        };

        room.updatedAt =
          now();

        io.to(
          roomId
        ).emit(
          "seat-update",
          {
            seatIndex,

            userId,

            name:
              member.name,

            dp:
              member.dp,

            mic:
              member.mic,

            speaker:
              member.speaker
          }
        );

        broadcastRoom(
          roomId
        );
      }
    );

    // ========================================================
    // LEAVE SEAT
    // ========================================================

    socket.on(
      "leave-seat",
      payload => {
        payload =
          safeObject(
            payload
          );

        const roomId =
          cleanText(
            payload.roomId
          ) ||
          socket.currentRoom;

        const userId =
          socketUsers[
            socket.id
          ] ||
          socket.userId;

        const room =
          rooms[roomId];

        if (
          !room ||
          !userId
        ) {
          return;
        }

        const member =
          room.members[
            userId
          ];

        if (!member) {
          return;
        }

        const oldSeat =
          member.seatIndex;

        if (
          oldSeat !==
            null &&
          oldSeat !==
            undefined
        ) {
          room.seats[
            oldSeat
          ] = null;
        }

        member.seatIndex =
          null;

        member.mic =
          false;

        io.to(
          roomId
        ).emit(
          "seat-update",
          {
            seatIndex:
              oldSeat,

            userId,

            name:
              member.name,

            dp:
              member.dp,

            mic:
              false,

            speaker:
              member.speaker
          }
        );

        broadcastRoom(
          roomId
        );
      }
    );

    // ========================================================
    // MIC
    // ========================================================

    function handleMic(
      payload
    ) {
      payload =
        safeObject(
          payload
        );

      const roomId =
        cleanText(
          payload.roomId
        ) ||
        socket.currentRoom;

      const userId =
        socketUsers[
          socket.id
        ] ||
        socket.userId;

      const room =
        rooms[roomId];

      if (
        !room ||
        !userId
      ) {
        return;
      }

      const member =
        room.members[
          userId
        ];

      if (!member) {
        return;
      }

      if (
        room.mutedUsers[
          userId
        ]
      ) {
        member.mic =
          false;

        return socket.emit(
          "error-message",
          {
            message:
              "You are muted by room owner"
          }
        );
      }

      member.mic =
        Boolean(
          payload.enabled
        );

      if (
        member.seatIndex !==
          null &&
        member.seatIndex !==
          undefined
      ) {
        room.seats[
          member.seatIndex
        ] = {
          ...room.seats[
            member.seatIndex
          ],

          mic:
            member.mic
        };
      }

      io.to(
        roomId
      ).emit(
        "mic",
        {
          userId,

          enabled:
            member.mic
        }
      );

      io.to(
        roomId
      ).emit(
        "mic-status",
        {
          userId,

          enabled:
            member.mic
        }
      );

      broadcastRoom(
        roomId
      );
    }

    socket.on(
      "mic",
      handleMic
    );

    socket.on(
      "toggle-mic",
      handleMic
    );

    // ========================================================
    // SPEAKER
    // ========================================================

    function handleSpeaker(
      payload
    ) {
      payload =
        safeObject(
          payload
        );

      const roomId =
        cleanText(
          payload.roomId
        ) ||
        socket.currentRoom;

      const userId =
        socketUsers[
          socket.id
        ] ||
        socket.userId;

      const room =
        rooms[roomId];

      if (
        !room ||
        !userId
      ) {
        return;
      }

      const member =
        room.members[
          userId
        ];

      if (!member) {
        return;
      }

      member.speaker =
        Boolean(
          payload.enabled
        );

      if (
        member.seatIndex !==
          null &&
        member.seatIndex !==
          undefined
      ) {
        room.seats[
          member.seatIndex
        ] = {
          ...room.seats[
            member.seatIndex
          ],

          speaker:
            member.speaker
        };
      }

      io.to(
        roomId
      ).emit(
        "speaker",
        {
          userId,

          enabled:
            member.speaker
        }
      );

      broadcastRoom(
        roomId
      );
    }

    socket.on(
      "speaker",
      handleSpeaker
    );

    socket.on(
      "toggle-speaker",
      handleSpeaker
    );

    // ========================================================
    // CHAT
    // ========================================================

    function handleChat(
      payload
    ) {
      payload =
        safeObject(
          payload
        );

      const roomId =
        cleanText(
          payload.roomId
        ) ||
        socket.currentRoom;

      const userId =
        socketUsers[
          socket.id
        ] ||
        socket.userId;

      const room =
        rooms[roomId];

      if (
        !room ||
        !userId
      ) {
        return;
      }

      const user =
        ensureUser(
          userId
        );

      const textMessage =
        cleanText(
          payload.message ||
          payload.text,
          ""
        );

      if (
        !textMessage
      ) {
        return;
      }

      const message = {
        id:
          makeId(
            "msg_"
          ),

        roomId,

        userId,

        name:
          user.name,

        dp:
          user.dp,

        text:
          textMessage,

        createdAt:
          now()
      };

      room.messages.push(
        message
      );

      if (
        room.messages.length >
        MAX_ROOM_MESSAGES
      ) {
        room.messages.shift();
      }

      const daily =
        resetDailyIfNeeded(
          userId
        );

      daily.chatCount +=
        1;

      if (
        daily.chatCount >=
        5
      ) {
        daily.tasks.task_04 =
          true;
      }

      persistDaily(
        userId
      ).catch(() => {});

      io.to(
        roomId
      ).emit(
        "chat",
        message
      );

      io.to(
        roomId
      ).emit(
        "room-chat",
        message
      );
    }

    socket.on(
      "chat",
      handleChat
    );

    socket.on(
      "room-chat",
      handleChat
    );

    // ========================================================
    // EMOJI
    // ========================================================

    socket.on(
      "emoji",
      payload => {
        payload =
          safeObject(
            payload
          );

        const roomId =
          cleanText(
            payload.roomId
          ) ||
          socket.currentRoom;

        const userId =
          socketUsers[
            socket.id
          ] ||
          socket.userId;

        const user =
          ensureUser(
            userId
          );

        if (!roomId) {
          return;
        }

        const daily =
          resetDailyIfNeeded(
            userId
          );

        daily.emojiCount +=
          1;

        if (
          daily.emojiCount >=
          10
        ) {
          daily.tasks.task_08 =
            true;
        }

        persistDaily(
          userId
        ).catch(() => {});

        io.to(
          roomId
        ).emit(
          "emoji",
          {
            userId,

            name:
              user.name,

            emoji:
              cleanText(
                payload.emoji,
                "❤️"
              ),

            createdAt:
              now()
          }
        );
      }
    );

    // ========================================================
    // GIFT
    // ========================================================

    socket.on(
      "gift",
      payload => {
        payload =
          safeObject(
            payload
          );

        const senderId =
          socketUsers[
            socket.id
          ] ||
          socket.userId;

        const roomId =
          cleanText(
            payload.roomId
          ) ||
          socket.currentRoom;

        const receiverId =
          cleanUserId(
            payload.targetUserId ||
            payload.receiverId ||
            payload.toUserId
          );

        const giftId =
          cleanText(
            payload.giftId
          );

        const quantity =
          positiveInt(
            payload.quantity,
            1
          );

        const result =
          processGift({
            senderId,

            receiverId,

            giftId,

            quantity,

            roomId
          });

        if (!result.ok) {
          return socket.emit(
            "gift-error",
            result
          );
        }

        const daily =
          resetDailyIfNeeded(
            senderId
          );

        daily.tasks.task_03 =
          true;

        daily.giftCount +=
          quantity;

        persistDaily(
          senderId
        ).catch(() => {});

        const event = {
          ...result.transaction,

          sender:
            result.sender,

          receiver:
            result.receiver,

          gift:
            result.gift
        };

        if (roomId) {
          io.to(
            roomId
          ).emit(
            "gift-sent",
            event
          );

          io.to(
            roomId
          ).emit(
            "gift",
            event
          );
        }

        // Receiver notification.
        const receiverSockets =
          userSockets[
            receiverId
          ];

        if (
          receiverSockets
        ) {
          receiverSockets.forEach(
            socketId => {
              io.to(
                socketId
              ).emit(
                "gift-received",
                event
              );
            }
          );
        }

        // Sender wallet.
        socket.emit(
          "wallet-updated",
          {
            userId:
              senderId,

            coins:
              result.sender.coins,

            diamonds:
              result.sender.diamonds,

            diamond:
              result.sender.diamonds,

            level:
              result.sender.level,

            exp:
              result.sender.exp,

            vipLevel:
              result.sender.vipLevel
          }
        );

        if (roomId) {
          broadcastRoom(
            roomId
          );
        }
      }
    );

    // ========================================================
    // FOLLOW
    // ========================================================

    socket.on(
      "follow",
      payload => {
        payload =
          safeObject(
            payload
          );

        const fromUserId =
          socketUsers[
            socket.id
          ] ||
          socket.userId;

        const targetUserId =
          cleanUserId(
            payload.targetUserId ||
            payload.userId
          );

        const result =
          followUser(
            fromUserId,
            targetUserId
          );

        if (!result.ok) {
          return socket.emit(
            "error-message",
            {
              message:
                result.error
            }
          );
        }

        const data =
          resetDailyIfNeeded(
            fromUserId
          );

        data.tasks.task_06 =
          true;

        data.followingCount +=
          1;

        persistDaily(
          fromUserId
        ).catch(() => {});

        socket.emit(
          "follow-updated",
          {
            targetUserId,

            following:
              result.fromUser
                .following,

            user:
              result.fromUser
          }
        );

        const targetSockets =
          userSockets[
            targetUserId
          ];

        if (
          targetSockets
        ) {
          targetSockets.forEach(
            socketId => {
              io.to(
                socketId
              ).emit(
                "followers-updated",
                {
                  followers:
                    result
                      .targetUser
                      .followers
                }
              );
            }
          );
        }
      }
    );

    // ========================================================
    // CP REQUEST
    // ========================================================

    socket.on(
      "cp-request",
      payload => {
        payload =
          safeObject(
            payload
          );

        const fromUserId =
          socketUsers[
            socket.id
          ] ||
          socket.userId;

        const targetUserId =
          cleanUserId(
            payload.targetUserId ||
            payload.userId
          );

        if (
          !targetUserId ||
          targetUserId ===
            fromUserId
        ) {
          return;
        }

        const sender =
          ensureUser(
            fromUserId
          );

        const receiver =
          ensureUser(
            targetUserId
          );

        const request = {
          id:
            makeId(
              "cp_"
            ),

          fromUserId,

          fromName:
            sender.name,

          fromDp:
            sender.dp,

          targetUserId,

          targetName:
            receiver.name,

          targetDp:
            receiver.dp,

          status:
            "pending",

          createdAt:
            now()
        };

        cpRequests[
          request.id
        ] = request;

        firebasePut(
          `cpRequests/${request.id}`,
          request
        ).catch(
          () => {}
        );

        const targetSockets =
          userSockets[
            targetUserId
          ];

        if (
          targetSockets
        ) {
          targetSockets.forEach(
            socketId => {
              io.to(
                socketId
              ).emit(
                "cp-request",
                request
              );
            }
          );
        }

        socket.emit(
          "cp-request-sent",
          request
        );
      }
    );

    // ========================================================
    // CP ACCEPT
    // ========================================================

    socket.on(
      "cp-accept",
      payload => {
        payload =
          safeObject(
            payload
          );

        const requestId =
          cleanText(
            payload.requestId
          );

        const request =
          cpRequests[
            requestId
          ];

        if (!request) {
          return socket.emit(
            "error-message",
            {
              message:
                "CP request not found"
            }
          );
        }

        const currentUserId =
          socketUsers[
            socket.id
          ] ||
          socket.userId;

        if (
          request.targetUserId !==
          currentUserId
        ) {
          return;
        }

        request.status =
          "accepted";

        request.acceptedAt =
          now();

        firebasePut(
          `cpRequests/${requestId}`,
          request
        ).catch(
          () => {}
        );

        socket.emit(
          "cp-updated",
          request
        );

        const senderSockets =
          userSockets[
            request.fromUserId
          ];

        if (
          senderSockets
        ) {
          senderSockets.forEach(
            socketId => {
              io.to(
                socketId
              ).emit(
                "cp-updated",
                request
              );
            }
          );
        }
      }
    );

    // ========================================================
    // KICK
    // ========================================================

    function handleKick(
      payload
    ) {
      payload =
        safeObject(
          payload
        );

      const roomId =
        cleanText(
          payload.roomId
        ) ||
        socket.currentRoom;

      const targetUserId =
        cleanUserId(
          payload.targetUserId ||
          payload.userId
        );

      const room =
        rooms[roomId];

      if (
        !room ||
        !targetUserId
      ) {
        return;
      }

      const requesterId =
        socketUsers[
          socket.id
        ] ||
        socket.userId;

      if (
        room.ownerId !==
        requesterId
      ) {
        return socket.emit(
          "error-message",
          {
            message:
              "Only room owner can kick users"
          }
        );
      }

      const targetSockets =
        userSockets[
          targetUserId
        ];

      if (!targetSockets) {
        return;
      }

      targetSockets.forEach(
        socketId => {
          const targetSocket =
            io.sockets.sockets.get(
              socketId
            );

          if (!targetSocket) {
            return;
          }

          if (
            targetSocket.currentRoom ===
            roomId
          ) {
            targetSocket.emit(
              "kicked",
              {
                roomId,

                userId:
                  targetUserId
              }
            );

            targetSocket.emit(
              "user-kicked",
              {
                roomId,

                userId:
                  targetUserId
              }
            );

            removeUserFromRoom(
              targetSocket,
              roomId
            );
          }
        }
      );
    }

    socket.on(
      "kick",
      handleKick
    );

    socket.on(
      "kick-user",
      handleKick
    );

    // ========================================================
    // MUTE
    // ========================================================

    function handleMute(
      payload
    ) {
      payload =
        safeObject(
          payload
        );

      const roomId =
        cleanText(
          payload.roomId
        ) ||
        socket.currentRoom;

      const targetUserId =
        cleanUserId(
          payload.targetUserId ||
          payload.userId
        );

      const room =
        rooms[roomId];

      if (
        !room ||
        !targetUserId
      ) {
        return;
      }

      const requesterId =
        socketUsers[
          socket.id
        ] ||
        socket.userId;

      if (
        room.ownerId !==
        requesterId
      ) {
        return socket.emit(
          "error-message",
          {
            message:
              "Only room owner can mute users"
          }
        );
      }

      const member =
        room.members[
          targetUserId
        ];

      if (!member) {
        return;
      }

      const muted =
        payload.muted ===
        undefined
          ? true
          : Boolean(
              payload.muted
            );

      member.muted =
        muted;

      room.mutedUsers[
        targetUserId
      ] = muted;

      if (muted) {
        member.mic =
          false;

        if (
          member.seatIndex !==
            null &&
          member.seatIndex !==
            undefined &&
          room.seats[
            member.seatIndex
          ]
        ) {
          room.seats[
            member.seatIndex
          ].mic =
            false;
        }
      }

      io.to(
        roomId
      ).emit(
        "mute",
        {
          userId:
            targetUserId,

          muted
        }
      );

      io.to(
        roomId
      ).emit(
        "force-mute",
        {
          userId:
            targetUserId,

          muted
        }
      );

      broadcastRoom(
        roomId
      );
    }

    socket.on(
      "mute",
      handleMute
    );

    socket.on(
      "mute-user",
      handleMute
    );

    // ========================================================
    // ROOM SETTINGS
    // ========================================================

    function handleRoomUpdate(
      payload
    ) {
      payload =
        safeObject(
          payload
        );

      const roomId =
        cleanText(
          payload.roomId
        ) ||
        socket.currentRoom;

      const room =
        rooms[roomId];

      if (!room) {
        return;
      }

      const requesterId =
        socketUsers[
          socket.id
        ] ||
        socket.userId;

      if (
        room.ownerId !==
        requesterId
      ) {
        return socket.emit(
          "error-message",
          {
            message:
              "Only room owner can update room"
          }
        );
      }

      if (
        payload.name !==
        undefined
      ) {
        room.name =
          cleanText(
            payload.name,
            room.name
          );

        room.roomName =
          room.name;
      }

      if (
        payload.roomName !==
        undefined
      ) {
        room.name =
          cleanText(
            payload.roomName,
            room.name
          );

        room.roomName =
          room.name;
      }

      if (
        payload.dp !==
        undefined
      ) {
        room.dp =
          cleanText(
            payload.dp,
            room.dp
          );
      }

      if (
        payload.category !==
        undefined
      ) {
        room.category =
          cleanText(
            payload.category,
            room.category
          );
      }

      room.updatedAt =
        now();

      broadcastRoom(
        roomId
      );
    }

    socket.on(
      "room-update",
      handleRoomUpdate
    );

    socket.on(
      "update-room",
      handleRoomUpdate
    );

    // ========================================================
    // ROOM GAME
    // ========================================================

    socket.on(
      "game-start",
      payload => {
        payload =
          safeObject(
            payload
          );

        const roomId =
          cleanText(
            payload.roomId
          ) ||
          socket.currentRoom;

        const gameId =
          cleanText(
            payload.gameId
          );

        const room =
          rooms[roomId];

        if (
          !room ||
          !games[gameId]
        ) {
          return;
        }

        const userId =
          socketUsers[
            socket.id
          ] ||
          socket.userId;

        const gameSession = {
          id:
            makeId(
              "game_session_"
            ),

          gameId,

          gameName:
            games[gameId]
              .name,

          roomId,

          startedBy:
            userId,

          startedAt:
            now(),

          status:
            "running"
        };

        games[
          gameId
        ].lastSession =
          gameSession;

        const daily =
          resetDailyIfNeeded(
            userId
          );

        daily.tasks.task_07 =
          true;

        daily.gameCount +=
          1;

        persistDaily(
          userId
        ).catch(() => {});

        io.to(
          roomId
        ).emit(
          "game-started",
          gameSession
        );
      }
    );

    // ========================================================
    // GAME ACTION
    // ========================================================

    socket.on(
      "game-action",
      payload => {
        payload =
          safeObject(
            payload
          );

        const roomId =
          cleanText(
            payload.roomId
          ) ||
          socket.currentRoom;

        if (!roomId) {
          return;
        }

        const userId =
          socketUsers[
            socket.id
          ] ||
          socket.userId;

        io.to(
          roomId
        ).emit(
          "game-action",
          {
            ...payload,

            userId,

            createdAt:
              now()
          }
        );
      }
    );

    // ========================================================
    // ROOM EXP
    // ========================================================

    socket.on(
      "room-exp",
      payload => {
        payload =
          safeObject(
            payload
          );

        const roomId =
          cleanText(
            payload.roomId
          ) ||
          socket.currentRoom;

        const room =
          rooms[roomId];

        if (!room) {
          return;
        }

        const amount =
          Math.min(
            1000000,
            Math.max(
              0,
              Math.floor(
                numberValue(
                  payload.amount,
                  0
                )
              )
            )
          );

        room.roomExp +=
          amount;

        updateRoomTopUsers(
          room
        );

        broadcastRoom(
          roomId
        );
      }
    );

    // ========================================================
    // PROFILE VISIT
    // ========================================================

    socket.on(
      "profile-visit",
      payload => {
        payload =
          safeObject(
            payload
          );

        const visitorId =
          socketUsers[
            socket.id
          ] ||
          socket.userId;

        const targetUserId =
          cleanUserId(
            payload.targetUserId ||
            payload.userId
          );

        if (
          !targetUserId ||
          visitorId ===
            targetUserId
        ) {
          return;
        }

        const target =
          ensureUser(
            targetUserId
          );

        target.visitors +=
          1;

        saveUser(target);

        const daily =
          resetDailyIfNeeded(
            visitorId
          );

        daily.profileVisits +=
          1;

        daily.tasks.task_09 =
          true;

        persistDaily(
          visitorId
        ).catch(() => {});

        socket.emit(
          "profile-visit-updated",
          {
            targetUserId,

            visitors:
              target.visitors
          }
        );
      }
    );

    // ========================================================
    // WEBRTC SIGNALING
    // ========================================================

    function sendToPeer(
      eventName,
      payload
    ) {
      payload =
        safeObject(
          payload
        );

      const targetUserId =
        cleanUserId(
          payload.targetUserId ||
          payload.toUserId ||
          payload.peerId ||
          payload.targetId
        );

      if (
        !targetUserId
      ) {
        return;
      }

      const targetSockets =
        userSockets[
          targetUserId
        ];

      if (
        !targetSockets
      ) {
        return;
      }

      targetSockets.forEach(
        socketId => {
          io.to(
            socketId
          ).emit(
            eventName,
            {
              ...payload,

              fromUserId:
                socketUsers[
                  socket.id
                ] ||
                socket.userId
            }
          );
        }
      );
    }

    socket.on(
      "webrtc-offer",
      payload => {
        sendToPeer(
          "webrtc-offer",
          payload
        );
      }
    );

    socket.on(
      "webrtc-answer",
      payload => {
        sendToPeer(
          "webrtc-answer",
          payload
        );
      }
    );

    socket.on(
      "webrtc-ice",
      payload => {
        sendToPeer(
          "webrtc-ice",
          payload
        );
      }
    );

    socket.on(
      "webrtc-ice-candidate",
      payload => {
        sendToPeer(
          "webrtc-ice-candidate",
          payload
        );
      }
    );

    // Old aliases.
    socket.on(
      "offer",
      payload => {
        sendToPeer(
          "webrtc-offer",
          payload
        );
      }
    );

    socket.on(
      "answer",
      payload => {
        sendToPeer(
          "webrtc-answer",
          payload
        );
      }
    );

    socket.on(
      "ice-candidate",
      payload => {
        sendToPeer(
          "webrtc-ice-candidate",
          payload
        );
      }
    );

    // ========================================================
    // DISCONNECT
    // ========================================================

    socket.on(
      "disconnect",
      () => {
        console.log(
          "Socket disconnected:",
          socket.id
        );

        const userId =
          socketUsers[
            socket.id
          ];

        const roomId =
          socket.currentRoom;

        if (roomId) {
          removeUserFromRoom(
            socket,
            roomId
          );
        }

        if (
          userId &&
          userSockets[
            userId
          ]
        ) {
          userSockets[
            userId
          ].delete(
            socket.id
          );

          if (
            userSockets[
              userId
            ].size === 0
          ) {
            delete userSockets[
              userId
            ];
          }
        }

        delete socketUsers[
          socket.id
        ];
      }
    );
  }
);

// ============================================================
// 404 API
// ============================================================

app.use(
  "/api",
  (req, res) => {
    res.status(404).json({
      ok: false,

      error:
        "API endpoint not found",

      path:
        req.path
    });
  }
);

// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
  (
    err,
    req,
    res,
    next
  ) => {
    console.error(
      "Server error:",
      err
    );

    if (
      res.headersSent
    ) {
      return next(err);
    }

    res.status(500).json({
      ok: false,

      error:
        "Server error"
    });
  }
);

// ============================================================
// START SERVER
// ============================================================

async function startServer() {
  await loadFirebaseData();

  server.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        "======================================"
      );

      console.log(
        " PawanVoice Server Started"
      );

      console.log(
        "======================================"
      );

      console.log(
        "Port:",
        PORT
      );

      console.log(
        "Static folder:",
        __dirname
      );

      console.log(
        "Rooms:",
        Object.keys(
          rooms
        ).length
      );

      console.log(
        "Users:",
        Object.keys(
          users
        ).length
      );

      console.log(
        "Gifts:",
        Object.keys(
          gifts
        ).length
      );

      console.log(
        "Games:",
        Object.keys(
          games
        ).length
      );

      console.log(
        "Firebase:",
        FIREBASE_ENABLED
      );

      console.log(
        "Firebase DB:",
        FIREBASE_DB_URL
      );

      console.log(
        "======================================"
      );
    }
  );
}

startServer()
  .catch(
    error => {
      console.error(
        "Fatal startup error:",
        error
      );

      process.exit(
        1
      );
    }
  );
