const express = require("express");
const http = require("http");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 10000;

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

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
  transports: ["websocket", "polling"]
});


/* =========================================================
   MEMORY DATABASE
   ========================================================= */

const rooms = {};
const users = {};
const userSockets = {};
const socketUsers = {};

const dailyData = {};
const taskProgress = {};
const weeklyClaims = {};
const inventories = {};
const giftHistory = {};
const inbox = {};
const follows = {};
const cpRequests = {};
const cpPairs = {};
const families = {};
const familyMembers = {};
const games = {};
const roomRewards = {};
const giftLocks = {};
const visitors = {};
const rankings = {};


/* =========================================================
   COUNTERS
   ========================================================= */

/*
  New user IDs:
  100052
  100053
  100054
  ...

  New room IDs:
  200001
  200002
  200003
  ...
*/

let nextUserId = 100052;
let nextRoomId = 200001;


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

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function randomId(prefix = "") {
  return (
    prefix +
    crypto.randomBytes(5).toString("hex")
  );
}

function cleanName(name) {
  const n = safeString(name, "Pawan User").trim();
  return n.slice(0, 40) || "Pawan User";
}

function cleanDp(dp) {
  return (
    safeString(
      dp,
      "https://i.pravatar.cc/200?img=12"
    ).slice(0, 2000)
  );
}

function generateUserId() {
  while (users[String(nextUserId)]) {
    nextUserId++;
  }

  return String(nextUserId++);
}

function generateRoomId() {
  while (rooms[String(nextRoomId)]) {
    nextRoomId++;
  }

  return String(nextRoomId++);
}

function ensureObject(obj, key, fallback) {
  if (!obj[key]) obj[key] = fallback;
  return obj[key];
}

function getExpForNextLevel(level) {
  return Math.max(10000, safeNumber(level, 1) * 10000);
}

function normalizeUserId(id) {
  return safeString(id).trim();
}


/* =========================================================
   200 GIFTS
   ========================================================= */

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

const giftIcons = [
  "🌹","❤️","💋","💎","👑","🎁",
  "🎂","🍫","🍰","🍔","🍕","🍓",
  "🧸","🐻","🐼","🐯","🦄","🐱",
  "🎈","🎉","🎊","🎀","🔥","💐",
  "🚗","🏎️","🏍️","✈️","🚀","🛥️"
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

  gifts.push({
    id: `gift${i}`,
    name: `Gift ${i}`,
    category: giftCategories[(i - 1) % giftCategories.length],
    icon: giftIcons[(i - 1) % giftIcons.length],
    price: Math.max(100, price),
    animation: i >= 151 ? "luxury" : "normal"
  });
}


/* =========================================================
   STORE ITEMS
   ========================================================= */

const store = {
  vehicles: [],
  avatarFrames: [],
  chatBubbles: [],
  profileCards: [],
  rgbNames: [],
  themes: [],
  entryEffects: []
};

for (let i = 1; i <= 50; i++) {

  store.vehicles.push({
    id: `vehicle${i}`,
    name: `Vehicle ${i}`,
    price: i * 1000,
    icon: ["🚗","🏎️","🏍️","🚀","✈️"][i % 5]
  });

  store.avatarFrames.push({
    id: `frame${i}`,
    name: `Frame ${i}`,
    price: i * 500,
    icon: "🖼️"
  });

  store.chatBubbles.push({
    id: `bubble${i}`,
    name: `Bubble ${i}`,
    price: i * 300,
    icon: "💬"
  });

  store.profileCards.push({
    id: `card${i}`,
    name: `Profile Card ${i}`,
    price: i * 700,
    icon: "🪪"
  });

  store.rgbNames.push({
    id: `rgb${i}`,
    name: `RGB Name ${i}`,
    price: i * 1000,
    icon: "🌈"
  });

  store.themes.push({
    id: `theme${i}`,
    name: `Theme ${i}`,
    price: i * 800,
    icon: "🎨"
  });

  store.entryEffects.push({
    id: `entry${i}`,
    name: `Entry Effect ${i}`,
    price: i * 1500,
    icon: "✨"
  });
}


/* =========================================================
   ROOM THEMES
   ========================================================= */

const roomThemes = [
  {
    id: "galaxy",
    name: "Galaxy",
    background: "linear-gradient(180deg,#14002b,#070015)"
  },
  {
    id: "sakura",
    name: "Sakura",
    background: "linear-gradient(180deg,#5b174a,#190818)"
  },
  {
    id: "ocean",
    name: "Ocean",
    background: "linear-gradient(180deg,#063c56,#041622)"
  },
  {
    id: "fire",
    name: "Fire",
    background: "linear-gradient(180deg,#621d08,#180703)"
  },
  {
    id: "purple",
    name: "Purple",
    background: "linear-gradient(180deg,#4a136e,#160820)"
  },
  {
    id: "love",
    name: "Love",
    background: "linear-gradient(180deg,#741c4e,#190710)"
  },
  {
    id: "night",
    name: "Night",
    background: "linear-gradient(180deg,#111,#050505)"
  },
  {
    id: "rainbow",
    name: "Rainbow",
    background: "linear-gradient(180deg,#462080,#092d49)"
  },
  {
    id: "luxury",
    name: "Luxury",
    background: "linear-gradient(180deg,#4a3907,#110d02)"
  }
];


/* =========================================================
   DAILY TASKS - 10
   ========================================================= */

const dailyTasks = [
  {
    id: "task_01",
    name: "Daily Login",
    target: 1,
    coins: 5000,
    exp: 5000
  },
  {
    id: "task_02",
    name: "Enter Room",
    target: 1,
    coins: 5000,
    exp: 5000
  },
  {
    id: "task_03",
    name: "Send Gift",
    target: 1,
    coins: 10000,
    exp: 5000
  },
  {
    id: "task_04",
    name: "Send Message",
    target: 1,
    coins: 5000,
    exp: 5000
  },
  {
    id: "task_05",
    name: "Take Seat",
    target: 1,
    coins: 10000,
    exp: 5000
  },
  {
    id: "task_06",
    name: "Follow User",
    target: 1,
    coins: 5000,
    exp: 5000
  },
  {
    id: "task_07",
    name: "Play Game",
    target: 1,
    coins: 5000,
    exp: 5000
  },
  {
    id: "task_08",
    name: "Send Emoji",
    target: 1,
    coins: 5000,
    exp: 5000
  },
  {
    id: "task_09",
    name: "Visit Profile",
    target: 1,
    coins: 5000,
    exp: 5000
  },
  {
    id: "task_10",
    name: "Complete Daily Mission",
    target: 10,
    coins: 25000,
    exp: 10000
  }
];


/* =========================================================
   7 DAY REWARDS
   ========================================================= */

const weeklyRewards = [
  {
    day: 1,
    coins: 100000,
    diamonds: 0,
    frame: null,
    gift: null,
    vip: 0
  },
  {
    day: 2,
    coins: 200000,
    diamonds: 0,
    frame: null,
    gift: null,
    vip: 0
  },
  {
    day: 3,
    coins: 300000,
    diamonds: 0,
    frame: "Special Frame",
    gift: null,
    vip: 0
  },
  {
    day: 4,
    coins: 400000,
    diamonds: 0,
    frame: null,
    gift: null,
    vip: 0
  },
  {
    day: 5,
    coins: 500000,
    diamonds: 0,
    frame: null,
    gift: "Special Gift",
    vip: 0
  },
  {
    day: 6,
    coins: 600000,
    diamonds: 1000,
    frame: null,
    gift: null,
    vip: 0
  },
  {
    day: 7,
    coins: 700000,
    diamonds: 0,
    frame: null,
    gift: null,
    vip: 1
  }
];


/* =========================================================
   VIP
   ========================================================= */

const vipLevels = [
  { level: 1, requiredLevel: 1 },
  { level: 1, requiredLevel: 5 },
  { level: 1, requiredLevel: 10 },
  { level: 1, requiredLevel: 15 },
  { level: 1, requiredLevel: 20 },
  { level: 2, requiredLevel: 25 },
  { level: 2, requiredLevel: 30 },
  { level: 3, requiredLevel: 35 },
  { level: 3, requiredLevel: 40 },
  { level: 4, requiredLevel: 45 },
  { level: 4, requiredLevel: 50 },
  { level: 5, requiredLevel: 55 },
  { level: 5, requiredLevel: 60 },
  { level: 6, requiredLevel: 65 },
  { level: 6, requiredLevel: 70 },
  { level: 7, requiredLevel: 75 },
  { level: 7, requiredLevel: 80 },
  { level: 8, requiredLevel: 85 },
  { level: 8, requiredLevel: 90 },
  { level: 9, requiredLevel: 95 }
];


/* =========================================================
   GAMES
   ========================================================= */

const availableGames = [
  "dice",
  "wheel",
  "guess",
  "treasure",
  "bounty",
  "challenge",
  "lucky-number",
  "emoji-game",
  "quiz",
  "battle",
  "speed",
  "memory",
  "cards",
  "coin",
  "room-race",
  "gift-race",
  "king",
  "couple",
  "family",
  "party"
];


/* =========================================================
   USER SYSTEM
   ========================================================= */

function ensureUser(input = {}) {

  let id = normalizeUserId(
    input.userId ||
    input.id ||
    ""
  );

  /*
    Old PV IDs are accepted so existing users
    don't suddenly disappear.
  */

  if (!id) {
    id = generateUserId();
  }

  if (!users[id]) {

    users[id] = {
      id,
      userId: id,

      name: cleanName(input.name),
      dp: cleanDp(input.dp),

      gender: input.gender || "Male",

      level: Math.max(
        1,
        safeNumber(input.level, 1)
      ),

      exp: Math.max(
        0,
        safeNumber(input.exp, 0)
      ),

      coins: Math.max(
        0,
        safeNumber(input.coins, 100000)
      ),

      diamonds: Math.max(
        0,
        safeNumber(
          input.diamonds ??
          input.diamond,
          0
        )
      ),

      following: safeNumber(input.following, 0),
      followers: safeNumber(input.followers, 0),
      visitors: safeNumber(input.visitors, 0),

      vipLevel: safeNumber(input.vipLevel, 0),
      vipExp: safeNumber(input.vipExp, 0),

      avatarFrame:
        input.avatarFrame || {
          id: "default",
          name: "Default Frame",
          image: "",
          active: true
        },

      badge:
        input.badge || {
          id: "default",
          name: "New User",
          image: "",
          active: true
        },

      entryEffect:
        input.entryEffect || {
          id: "default",
          name: "Default Entry",
          image: "",
          active: true
        },

      followingUsers: [],
      followersUsers: [],

      createdAt: Date.now(),
      updatedAt: Date.now()
    };

  } else {

    const u = users[id];

    if (input.name) u.name = cleanName(input.name);
    if (input.dp) u.dp = cleanDp(input.dp);

    if (input.gender) {
      u.gender = input.gender;
    }

    if (input.level !== undefined) {
      u.level = Math.max(
        1,
        safeNumber(input.level, u.level)
      );
    }

    if (input.exp !== undefined) {
      u.exp = Math.max(
        0,
        safeNumber(input.exp, u.exp)
      );
    }

    if (input.coins !== undefined) {
      u.coins = Math.max(
        0,
        safeNumber(input.coins, u.coins)
      );
    }

    if (
      input.diamonds !== undefined ||
      input.diamond !== undefined
    ) {
      u.diamonds = Math.max(
        0,
        safeNumber(
          input.diamonds ??
          input.diamond,
          u.diamonds
        )
      );
    }

    u.updatedAt = Date.now();
  }

  return users[id];
}


/* =========================================================
   LEVEL
   ========================================================= */

function addExp(user, amount) {

  let exp = Math.max(
    0,
    safeNumber(amount, 0)
  );

  while (
    exp > 0 &&
    user.level < 1000
  ) {

    const need =
      getExpForNextLevel(user.level);

    const remaining =
      need - user.exp;

    if (exp >= remaining) {

      exp -= remaining;
      user.exp = 0;
      user.level++;

    } else {

      user.exp += exp;
      exp = 0;
    }
  }

  user.updatedAt = Date.now();

  return user;
}

function addCoins(user, amount) {

  user.coins = Math.max(
    0,
    user.coins + safeNumber(amount, 0)
  );

  user.updatedAt = Date.now();

  return user;
}

function addDiamonds(user, amount) {

  user.diamonds = Math.max(
    0,
    user.diamonds + safeNumber(amount, 0)
  );

  user.updatedAt = Date.now();

  return user;
}


/* =========================================================
   PUBLIC USER
   ========================================================= */

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

    avatarFrame: user.avatarFrame,
    badge: user.badge,
    entryEffect: user.entryEffect
  };
}


/* =========================================================
   DAILY LOGIN
   ========================================================= */

function applyDailyLogin(user) {

  const key =
    `${user.id}_${todayKey()}`;

  if (dailyData[key]) {
    return false;
  }

  dailyData[key] = true;

  addCoins(user, 5000);
  addExp(user, 5000);

  increaseTask(user.id, "task_01");

  return true;
}


/* =========================================================
   TASK SYSTEM
   ========================================================= */

function getTaskState(userId) {

  const key =
    `${userId}_${todayKey()}`;

  if (!taskProgress[key]) {
    taskProgress[key] = {};
  }

  return taskProgress[key];
}

function increaseTask(userId, taskId, amount = 1) {

  const state =
    getTaskState(userId);

  state[taskId] =
    safeNumber(state[taskId], 0) +
    Math.max(1, amount);

  return state[taskId];
}

function getTask(taskId) {

  return dailyTasks.find(
    t => t.id === taskId
  );
}


/* =========================================================
   ROOM SYSTEM
   ========================================================= */

function createRoomObject(input = {}) {

  const id =
    safeString(input.id) ||
    generateRoomId();

  const ownerId =
    safeString(
      input.ownerId ||
      input.owner
    );

  const owner =
    ensureUser({
      userId: ownerId || undefined,
      name: input.ownerName || "Room Owner",
      dp: input.ownerDp
    });

  const room = {

    id,

    name:
      cleanName(
        input.name ||
        input.roomName ||
        `${owner.name}'s Room`
      ),

    roomName:
      cleanName(
        input.roomName ||
        input.name ||
        `${owner.name}'s Room`
      ),

    dp:
      cleanDp(
        input.dp ||
        owner.dp
      ),

    owner: owner.id,
    ownerId: owner.id,

    ownerName: owner.name,
    ownerDp: owner.dp,

    category:
      input.category ||
      "General",

    privacy:
      input.privacy ||
      "public",

    password:
      input.password ||
      "",

    maxSeats: 9,

    seats: Array(9).fill(null),

    users: {},

    members: {},

    admins: [],

    mutedUsers: {},

    bannedUsers: {},

    messages: [],

    gifts: [],

    roomExp: 0,

    topUsers: [],

    themeName:
      input.themeName ||
      "Galaxy",

    themeBackground:
      input.themeBackground ||
      roomThemes[0].background,

    announcement:
      input.announcement ||
      "",

    welcomeMessage:
      input.welcomeMessage ||
      "Welcome to PawanVoice",

    createdAt: Date.now(),
    updatedAt: Date.now()
  };


  /* Owner automatically enters room */

  const ownerData = {
    userId: owner.id,
    id: owner.id,
    name: owner.name,
    dp: owner.dp,
    level: owner.level,
    mic: false,
    joinedAt: Date.now()
  };

  room.users[owner.id] = ownerData;
  room.members[owner.id] = ownerData;
  room.seats[0] = ownerData;

  return room;
}


function ensureRoom(roomId, input = {}) {

  let id =
    safeString(roomId || input.roomId);

  if (!id) {
    id = generateRoomId();
  }

  if (!rooms[id]) {

    rooms[id] =
      createRoomObject({
        ...input,
        id
      });
  }

  return rooms[id];
}


function roomMemberCount(room) {

  return Object.keys(
    room.members || room.users || {}
  ).length;
}


function roomData(room) {

  if (!room) return null;

  return {
    ...room,

    userCount:
      roomMemberCount(room),

    onlineCount:
      roomMemberCount(room),

    seats:
      room.seats || Array(9).fill(null)
  };
}


function broadcastRoom(room) {

  io.to(`room:${room.id}`).emit(
    "room-state",
    {
      room: roomData(room)
    }
  );

  io.to(`room:${room.id}`).emit(
    "room-updated",
    roomData(room)
  );
}


/* =========================================================
   ROOM MEMBER UPDATE
   ========================================================= */

function addUserToRoom(room, user) {

  const member = {
    userId: user.id,
    id: user.id,
    name: user.name,
    dp: user.dp,
    level: user.level,
    joinedAt: Date.now()
  };

  room.users[user.id] = member;
  room.members[user.id] = member;

  room.updatedAt = Date.now();

  return member;
}


function removeUserFromRoom(room, userId) {

  const id = String(userId);

  delete room.users[id];
  delete room.members[id];

  for (let i = 0; i < room.seats.length; i++) {

    if (
      room.seats[i] &&
      String(room.seats[i].userId) === id
    ) {
      room.seats[i] = null;
    }
  }

  room.updatedAt = Date.now();
}


/* =========================================================
   ADMIN
   ========================================================= */

function isOwner(room, userId) {

  return String(room.ownerId) ===
    String(userId);
}

function isAdmin(room, userId) {

  if (isOwner(room, userId)) {
    return true;
  }

  return (room.admins || [])
    .map(String)
    .includes(String(userId));
}


/* =========================================================
   FOLLOW SYSTEM
   ========================================================= */

function followUser(
  followerId,
  targetId
) {

  followerId = String(followerId);
  targetId = String(targetId);

  if (followerId === targetId) {
    return {
      ok: false,
      message: "Cannot follow yourself"
    };
  }

  const follower =
    ensureUser({ userId: followerId });

  const target =
    ensureUser({ userId: targetId });

  ensureObject(
    follows,
    followerId,
    []
  );

  const already =
    follows[followerId]
      .map(String)
      .includes(targetId);

  if (already) {

    return {
      ok: true,
      already: true,
      message: "Already following"
    };
  }

  follows[followerId].push(targetId);

  follower.following++;

  target.followers++;

  follower.followingUsers =
    follower.followingUsers || [];

  target.followersUsers =
    target.followersUsers || [];

  if (!follower.followingUsers.includes(targetId)) {
    follower.followingUsers.push(targetId);
  }

  if (!target.followersUsers.includes(followerId)) {
    target.followersUsers.push(followerId);
  }

  increaseTask(followerId, "task_06");

  return {
    ok: true,
    message: "Followed successfully",
    follower: publicUser(follower),
    target: publicUser(target)
  };
}


/* =========================================================
   CP SYSTEM
   ========================================================= */

function createCPRequest(
  senderId,
  receiverId
) {

  senderId = String(senderId);
  receiverId = String(receiverId);

  if (senderId === receiverId) {
    return {
      ok: false,
      message: "Cannot CP yourself"
    };
  }

  const key =
    `${senderId}_${receiverId}`;

  cpRequests[key] = {
    id: randomId("cp_"),
    senderId,
    receiverId,
    status: "pending",
    createdAt: Date.now()
  };

  addInbox(
    receiverId,
    "CP Request",
    `User ${senderId} sent you a CP request.`
  );

  return {
    ok: true,
    message: "CP request sent",
    request: cpRequests[key]
  };
}

function acceptCP(
  senderId,
  receiverId
) {

  const key1 =
    `${senderId}_${receiverId}`;

  const key2 =
    `${receiverId}_${senderId}`;

  const request =
    cpRequests[key1] ||
    cpRequests[key2];

  if (!request) {
    return {
      ok: false,
      message: "CP request not found"
    };
  }

  const id =
    randomId("cpair_");

  cpPairs[id] = {
    id,
    user1: senderId,
    user2: receiverId,
    level: 1,
    exp: 0,
    togetherDays: 0,
    createdAt: Date.now()
  };

  request.status = "accepted";

  return {
    ok: true,
    message: "CP created",
    cp: cpPairs[id]
  };
}


/* =========================================================
   FAMILY SYSTEM
   ========================================================= */

function createFamily(
  ownerId,
  name,
  dp
) {

  const owner =
    ensureUser({
      userId: ownerId
    });

  const id =
    "F" +
    crypto.randomInt(
      100001,
      999999
    );

  families[id] = {

    id,

    name:
      cleanName(name || `${owner.name} Family`),

    dp:
      cleanDp(dp || owner.dp),

    ownerId: owner.id,

    level: 1,

    exp: 0,

    members: {},

    admins: [],

    createdAt: Date.now(),

    updatedAt: Date.now()
  };

  families[id].members[owner.id] = {
    userId: owner.id,
    role: "leader",
    joinedAt: Date.now()
  };

  familyMembers[owner.id] =
    familyMembers[owner.id] || [];

  familyMembers[owner.id].push(id);

  return families[id];
}


function addFamilyMember(
  familyId,
  userId,
  role = "member"
) {

  const family = families[familyId];

  if (!family) {
    return {
      ok: false,
      message: "Family not found"
    };
  }

  const user =
    ensureUser({
      userId
    });

  family.members[user.id] = {
    userId: user.id,
    role,
    joinedAt: Date.now()
  };

  familyMembers[user.id] =
    familyMembers[user.id] || [];

  if (!familyMembers[user.id].includes(familyId)) {
    familyMembers[user.id].push(familyId);
  }

  family.updatedAt = Date.now();

  return {
    ok: true,
    family
  };
}


/* =========================================================
   INBOX
   ========================================================= */

function addInbox(
  userId,
  title,
  message
) {

  userId = String(userId);

  inbox[userId] =
    inbox[userId] || [];

  inbox[userId].unshift({

    id: randomId("msg_"),

    title,
    message,

    read: false,

    createdAt: Date.now()
  });

  inbox[userId] =
    inbox[userId].slice(0, 100);
}


/* =========================================================
   GIFTS
   ========================================================= */

function findGift(giftId) {

  return gifts.find(
    g => g.id === giftId
  );
}


function processGift({
  senderId,
  receiverId,
  giftId,
  quantity = 1,
  roomId
}) {

  senderId = String(senderId);
  receiverId = String(receiverId);

  const sender =
    ensureUser({
      userId: senderId
    });

  const receiver =
    ensureUser({
      userId: receiverId
    });

  const gift =
    findGift(giftId);

  if (!gift) {
    return {
      ok: false,
      message: "Gift not found"
    };
  }

  quantity =
    Math.max(
      1,
      Math.floor(
        safeNumber(quantity, 1)
      )
    );

  if (senderId === receiverId) {

    return {
      ok: false,
      message: "Cannot send gift to yourself"
    };
  }

  const total =
    gift.price * quantity;

  if (sender.coins < total) {

    return {
      ok: false,
      message: "Not enough coins"
    };
  }

  const lockKey =
    `${senderId}_${receiverId}_${giftId}`;

  if (giftLocks[lockKey]) {

    return {
      ok: false,
      message: "Gift is processing"
    };
  }

  giftLocks[lockKey] = true;

  try {

    sender.coins -= total;

    addExp(sender, Math.max(100, total / 10));
    addExp(receiver, Math.max(50, total / 20));

    inventories[receiverId] =
      inventories[receiverId] || {};

    inventories[receiverId][giftId] =
      safeNumber(
        inventories[receiverId][giftId],
        0
      ) + quantity;

    giftHistory[senderId] =
      giftHistory[senderId] || [];

    giftHistory[receiverId] =
      giftHistory[receiverId] || [];

    const record = {

      id: randomId("gift_"),

      roomId: roomId || null,

      senderId,
      senderName: sender.name,

      receiverId,
      receiverName: receiver.name,

      giftId,
      giftName: gift.name,
      icon: gift.icon,

      quantity,

      price: gift.price,

      total,

      createdAt: Date.now()
    };

    giftHistory[senderId].unshift(record);
    giftHistory[receiverId].unshift(record);

    if (roomId && rooms[roomId]) {

      const room =
        rooms[roomId];

      room.gifts =
        room.gifts || [];

      room.gifts.unshift(record);

      room.gifts =
        room.gifts.slice(0, 100);

      room.roomExp +=
        Math.max(
          10,
          Math.floor(total / 100)
        );

      updateRoomTopUsers(room);

      room.updatedAt = Date.now();

      broadcastRoom(room);
    }

    increaseTask(
      senderId,
      "task_03"
    );

    addInbox(
      receiverId,
      "Gift Received",
      `${sender.name} sent you ${gift.icon} ${gift.name}`
    );

    return {
      ok: true,

      record,

      wallet: {
        coins: sender.coins,
        diamonds: sender.diamonds
      },

      receiver: publicUser(receiver)
    };

  } finally {

    delete giftLocks[lockKey];
  }
}


/* =========================================================
   ROOM TOP USERS
   ========================================================= */

function updateRoomTopUsers(room) {

  const totals = {};

  (room.gifts || []).forEach(g => {

    totals[g.senderId] =
      safeNumber(
        totals[g.senderId],
        0
      ) + safeNumber(g.total, 0);
  });

  room.topUsers =
    Object.entries(totals)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,3)
      .map(([id,total])=>{

        const u =
          users[id];

        return {
          userId:id,
          id,
          name:u?.name || "User",
          dp:u?.dp ||
            "https://i.pravatar.cc/100?img=12",
          total
        };
      });
}


/* =========================================================
   HTTP ROUTES
   ========================================================= */

app.get("/", (req,res)=>{
  res.sendFile(
    path.join(__dirname,"index.html")
  );
});


app.get("/health",(req,res)=>{

  res.json({
    app:"PawanVoice Room Server",
    status:"running",
    socketIO:true,
    seats:9,
    rooms:Object.keys(rooms).length,
    users:Object.keys(users).length,
    gifts:gifts.length
  });
});


app.get("/api/status",(req,res)=>{

  res.json({
    ok:true,
    app:"PawanVoice",
    server:"online",
    rooms:Object.keys(rooms).length,
    users:Object.keys(users).length,
    gifts:gifts.length
  });
});


/* USERS */

app.get("/api/user/:id",(req,res)=>{

  const user =
    users[String(req.params.id)];

  if (!user) {
    return res.status(404).json({
      ok:false,
      message:"User not found"
    });
  }

  res.json({
    ok:true,
    user:publicUser(user)
  });
});


app.post("/api/user",(req,res)=>{

  const user =
    ensureUser(req.body || {});

  res.json({
    ok:true,
    user:publicUser(user)
  });
});


app.patch("/api/user/:id",(req,res)=>{

  const user =
    ensureUser({
      ...req.body,
      userId:req.params.id
    });

  updateUserInRooms(user);

  res.json({
    ok:true,
    user:publicUser(user)
  });
});


app.post("/api/user/:userId/wallet",(req,res)=>{

  const user =
    ensureUser({
      userId:req.params.userId
    });

  addCoins(
    user,
    safeNumber(req.body.coins,0)
  );

  addDiamonds(
    user,
    safeNumber(req.body.diamonds,0)
  );

  res.json({
    ok:true,
    user:publicUser(user)
  });
});


/* GIFTS */

app.get("/api/gifts",(req,res)=>{

  res.json({
    ok:true,
    gifts
  });
});


app.get("/api/gifts/history/:userId",(req,res)=>{

  res.json({
    ok:true,
    history:
      giftHistory[
        String(req.params.userId)
      ] || []
  });
});


app.post("/api/gifts/send",(req,res)=>{

  const result =
    processGift(req.body || {});

  if (!result.ok) {
    return res.status(400).json(result);
  }

  res.json(result);
});


/* STORE */

app.get("/api/store",(req,res)=>{

  res.json({
    ok:true,
    store
  });
});


/* TASKS */

app.get("/api/tasks",(req,res)=>{

  const userId =
    String(req.query.userId || "");

  res.json({
    ok:true,
    tasks:dailyTasks,
    progress:
      userId
        ? getTaskState(userId)
        : {}
  });
});


app.post("/api/tasks/claim",(req,res)=>{

  const userId =
    String(req.body.userId || "");

  const taskId =
    String(req.body.taskId || "");

  const user =
    ensureUser({
      userId
    });

  const task =
    getTask(taskId);

  if (!task) {

    return res.status(404).json({
      ok:false,
      message:"Task not found"
    });
  }

  const state =
    getTaskState(userId);

  const progress =
    safeNumber(
      state[taskId],
      0
    );

  if (progress < task.target) {

    return res.status(400).json({
      ok:false,
      message:`Complete ${task.target} first`,
      progress,
      target:task.target
    });
  }

  const claimKey =
    `${userId}_${todayKey()}_${taskId}`;

  if (state[claimKey]) {

    return res.status(400).json({
      ok:false,
      message:"Already claimed"
    });
  }

  state[claimKey] = true;

  addCoins(user, task.coins);
  addExp(user, task.exp);

  res.json({
    ok:true,
    message:"Task reward claimed",
    reward:{
      coins:task.coins,
      exp:task.exp
    },
    user:publicUser(user)
  });
});


/* EVENTS */

app.get("/api/events",(req,res)=>{

  res.json({
    ok:true,

    events:[
      {
        id:"event_01",
        title:"7 Day Reward",
        icon:"🎁",
        active:true
      },
      {
        id:"event_02",
        title:"New User Event",
        icon:"🎉",
        active:true
      },
      {
        id:"event_03",
        title:"Room EXP Event",
        icon:"🚀",
        active:true
      },
      {
        id:"event_04",
        title:"Gift Festival",
        icon:"🎀",
        active:true
      },
      {
        id:"event_05",
        title:"Family Event",
        icon:"👨‍👩‍👧‍👦",
        active:true
      }
    ]
  });
});


/* WEEKLY REWARDS */

app.get("/api/weekly-rewards",(req,res)=>{

  const userId =
    String(req.query.userId || "");

  res.json({
    ok:true,
    rewards:weeklyRewards,
    claims:
      weeklyClaims[userId] || {}
  });
});


app.post("/api/weekly-rewards/claim",(req,res)=>{

  const userId =
    String(req.body.userId || "");

  const day =
    Math.max(
      1,
      Math.min(
        7,
        safeNumber(req.body.day,1)
      )
    );

  const user =
    ensureUser({
      userId
    });

  weeklyClaims[userId] =
    weeklyClaims[userId] || {};

  const key =
    `day_${day}_${todayKey()}`;

  if (weeklyClaims[userId][key]) {

    return res.status(400).json({
      ok:false,
      message:"Reward already claimed"
    });
  }

  const reward =
    weeklyRewards.find(
      r=>r.day===day
    );

  if (!reward) {

    return res.status(404).json({
      ok:false,
      message:"Reward not found"
    });
  }

  weeklyClaims[userId][key] = true;

  addCoins(user,reward.coins);
  addDiamonds(user,reward.diamonds);

  if (reward.frame) {

    user.avatarFrame = {
      id:`weekly_frame_${day}`,
      name:reward.frame,
      image:"",
      active:true
    };
  }

  if (reward.gift) {

    inventories[userId] =
      inventories[userId] || {};

    inventories[userId][
      `special_day_${day}`
    ] =
      safeNumber(
        inventories[userId][
          `special_day_${day}`
        ],
        0
      ) + 1;
  }

  if (reward.vip) {
    user.vipLevel =
      Math.max(
        user.vipLevel,
        reward.vip
      );
  }

  res.json({
    ok:true,
    reward,
    user:publicUser(user)
  });
});


/* ROOMS */

app.get("/api/rooms",(req,res)=>{

  res.json({
    ok:true,
    rooms:Object.values(rooms)
      .map(roomData)
  });
});


app.get("/api/room/:id",(req,res)=>{

  const room =
    rooms[String(req.params.id)];

  if (!room) {

    return res.status(404).json({
      ok:false,
      message:"Room not found"
    });
  }

  res.json({
    ok:true,
    room:roomData(room)
  });
});


app.post("/api/room",(req,res)=>{

  const body=req.body||{};

  const owner =
    ensureUser({
      userId:
        body.ownerId ||
        body.owner ||
        undefined,
      name:body.ownerName,
      dp:body.ownerDp
    });

  const id =
    body.id ||
    generateRoomId();

  if (rooms[id]) {

    return res.status(409).json({
      ok:false,
      message:"Room ID already exists"
    });
  }

  const room =
    createRoomObject({
      ...body,
      id,
      ownerId:owner.id,
      ownerName:owner.name,
      ownerDp:owner.dp
    });

  rooms[id]=room;

  res.json({
    ok:true,
    room:roomData(room)
  });
});


app.patch("/api/room/:id",(req,res)=>{

  const id =
    String(req.params.id);

  const room =
    rooms[id];

  if (!room) {

    return res.status(404).json({
      ok:false,
      message:"Room not found"
    });
  }

  const userId =
    String(
      req.body.userId ||
      ""
    );

  if (
    userId &&
    !isAdmin(room,userId)
  ) {

    return res.status(403).json({
      ok:false,
      message:"Admin permission required"
    });
  }

  const allowed = [
    "name",
    "roomName",
    "dp",
    "category",
    "privacy",
    "password",
    "themeName",
    "themeBackground",
    "announcement",
    "welcomeMessage"
  ];

  allowed.forEach(key=>{

    if (
      req.body[key] !== undefined
    ) {
      room[key]=req.body[key];
    }
  });

  if (room.name) {
    room.roomName=room.name;
  }

  if (room.roomName) {
    room.name=room.roomName;
  }

  room.updatedAt=Date.now();

  broadcastRoom(room);

  res.json({
    ok:true,
    room:roomData(room)
  });
});


/* =========================================================
   FAMILY HTTP
   ========================================================= */

app.post("/api/family",(req,res)=>{

  const family =
    createFamily(
      req.body.ownerId,
      req.body.name,
      req.body.dp
    );

  res.json({
    ok:true,
    family
  });
});


app.get("/api/family/:id",(req,res)=>{

  const family =
    families[String(req.params.id)];

  if (!family) {

    return res.status(404).json({
      ok:false,
      message:"Family not found"
    });
  }

  res.json({
    ok:true,
    family
  });
});


app.post("/api/family/:id/member",(req,res)=>{

  const result =
    addFamilyMember(
      req.params.id,
      req.body.userId,
      req.body.role || "member"
    );

  if (!result.ok) {
    return res.status(400).json(result);
  }

  res.json(result);
});


/* =========================================================
   SOCKET.IO
   ========================================================= */

io.on("connection",(socket)=>{

  console.log(
    "Socket connected:",
    socket.id
  );

/* =========================================================
   PAWANVOICE LIVE GAMES - SHARED GAME SYSTEM
   ========================================================= */

const LIVE_GAME_BET_OPTIONS = [
  100000,
  200000,
  500000
];

const LIVE_GAME_CONFIG = {
  greedy: {
    id: "greedy",
    name: "Greedy Baby",
    duration: 15000,
    items: [
      { id: "apple", name: "Apple", icon: "🍎", multiplier: 2 },
      { id: "banana", name: "Banana", icon: "🍌", multiplier: 2 },
      { id: "grapes", name: "Grapes", icon: "🍇", multiplier: 3 },
      { id: "watermelon", name: "Watermelon", icon: "🍉", multiplier: 3 },
      { id: "cake", name: "Cake", icon: "🍰", multiplier: 5 },
      { id: "candy", name: "Candy", icon: "🍬", multiplier: 5 },
      { id: "diamond", name: "Diamond", icon: "💎", multiplier: 10 },
      { id: "crown", name: "Crown", icon: "👑", multiplier: 20 }
    ]
  },

  animal: {
    id: "animal",
    name: "Animal Party",
    duration: 15000,
    items: [
      { id: "cat", name: "Cat", icon: "🐱", multiplier: 2 },
      { id: "dog", name: "Dog", icon: "🐶", multiplier: 2 },
      { id: "rabbit", name: "Rabbit", icon: "🐰", multiplier: 3 },
      { id: "fox", name: "Fox", icon: "🦊", multiplier: 3 },
      { id: "tiger", name: "Tiger", icon: "🐯", multiplier: 5 },
      { id: "panda", name: "Panda", icon: "🐼", multiplier: 5 },
      { id: "lion", name: "Lion", icon: "🦁", multiplier: 10 },
      { id: "unicorn", name: "Unicorn", icon: "🦄", multiplier: 20 }
    ]
  },

  lucky: {
    id: "lucky",
    name: "Lucky Wheel",
    duration: 15000,
    items: [
      { id: "one", name: "1", icon: "1️⃣", multiplier: 2 },
      { id: "two", name: "2", icon: "2️⃣", multiplier: 2 },
      { id: "three", name: "3", icon: "3️⃣", multiplier: 3 },
      { id: "four", name: "4", icon: "4️⃣", multiplier: 3 },
      { id: "five", name: "5", icon: "5️⃣", multiplier: 5 },
      { id: "six", name: "6", icon: "6️⃣", multiplier: 5 },
      { id: "seven", name: "7", icon: "7️⃣", multiplier: 10 },
      { id: "eight", name: "8", icon: "8️⃣", multiplier: 20 }
    ]
  }
};

const liveGames = {};

function getGameUser(userId) {
  const id = String(userId || "").trim();

  if (!id) return null;

  return users[id] || null;
}

function sendGameError(socket, message) {
  socket.emit("game:error", {
    ok: false,
    message
  });

  socket.emit("game-error", {
    ok: false,
    message
  });
}

function getGameConfig(gameId) {
  const aliases = {
    "greedy-baby": "greedy",
    "greedy baby": "greedy",
    "animal-party": "animal",
    "animal party": "animal",
    "lucky-wheel": "lucky",
    "lucky wheel": "lucky",
    "wheel": "lucky"
  };

  const id = String(gameId || "greedy")
    .trim()
    .toLowerCase();

  return LIVE_GAME_CONFIG[aliases[id] || id] || null;
}

function getLiveGame(roomId, gameId) {
  const room = String(roomId || "");
  const config = getGameConfig(gameId);

  if (!room || !config) return null;

  const key = `${room}_${config.id}`;

  if (!liveGames[key]) {
    liveGames[key] = {
      key,
      roomId: room,
      gameId: config.id,
      current: null,
      roundNumber: 0,
      timer: null
    };
  }

  return liveGames[key];
}

function gamePublicState(state) {
  if (!state) return null;

  const config = getGameConfig(state.gameId);
  const round = state.current;

  return {
    roomId: state.roomId,
    gameId: state.gameId,
    gameName: config ? config.name : state.gameId,
    roundNumber: state.roundNumber,
    status: round ? round.status : "waiting",
    endsAt: round ? round.endsAt : null,
    winningItem: round ? round.winningItem : null,

    items: config ? config.items : [],

    betOptions: LIVE_GAME_BET_OPTIONS,

    players: round
      ? Object.values(round.players).map(player => ({
          userId: player.userId,
          name: player.name,
          dp: player.dp,
          bets: player.bets,
          totalBet: player.totalBet
        }))
      : []
  };
}

function broadcastGameState(state) {
  if (!state) return;

  const publicState = gamePublicState(state);

  io.to(`room:${state.roomId}`).emit(
    "game:state",
    publicState
  );

  io.to(`room:${state.roomId}`).emit(
    "game-state",
    publicState
  );
}

function startLiveGameRound(state) {
  if (!state) return;

  if (
    state.current &&
    state.current.status === "playing"
  ) {
    return;
  }

  const config = getGameConfig(state.gameId);

  if (!config) return;

  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }

  state.roundNumber++;

  state.current = {
    roundId: randomId("round_"),
    number: state.roundNumber,
    status: "playing",
    startedAt: Date.now(),
    endsAt: Date.now() + config.duration,
    players: {},
    winningItem: null
  };

  broadcastGameState(state);

  state.timer = setTimeout(() => {
    finishLiveGame(state);
  }, config.duration);
}

function finishLiveGame(state) {
  if (!state || !state.current) return;

  const round = state.current;

  if (round.status !== "playing") return;

  const config = getGameConfig(state.gameId);

  if (!config || !config.items.length) return;

  round.status = "finished";

  const winningIndex = crypto.randomInt(
    0,
    config.items.length
  );

  const winner = config.items[winningIndex];

  round.winningItem = winner;

  const results = [];

  Object.values(round.players).forEach(player => {
    const user = getGameUser(player.userId);

    let payout = 0;

    player.bets.forEach(bet => {
      if (bet.itemId === winner.id) {
        payout += bet.amount * winner.multiplier;
      }
    });

    if (user && payout > 0) {
      addCoins(user, payout);
      addExp(user, Math.max(1, Math.floor(payout / 1000)));

      const socketId = userSockets[user.id];

      if (socketId) {
        io.to(socketId).emit("wallet", {
          coins: user.coins,
          diamonds: user.diamonds
        });

        io.to(socketId).emit("game:wallet", {
          coins: user.coins,
          diamonds: user.diamonds
        });
      }
    }

    results.push({
      userId: player.userId,
      name: player.name,
      totalBet: player.totalBet,
      payout,
      net: payout - player.totalBet,
      won: payout > 0
    });
  });

  const result = {
    roomId: state.roomId,
    gameId: state.gameId,
    roundNumber: round.number,
    roundId: round.roundId,
    winningItem: winner,
    results,
    finishedAt: Date.now()
  };

  io.to(`room:${state.roomId}`).emit(
    "game:result",
    result
  );

  io.to(`room:${state.roomId}`).emit(
    "game-result",
    result
  );

  broadcastGameState(state);

  state.timer = setTimeout(() => {
    state.current = null;

    const room = rooms[state.roomId];

    if (room && roomMemberCount(room) > 0) {
      startLiveGameRound(state);
    } else {
      broadcastGameState(state);
    }
  }, 5000);
    }
  /* REGISTER */

  socket.on(
    "register-user",
    (data={})=>{

      const user =
        ensureUser(data);

      userSockets[user.id]=socket.id;
      socketUsers[socket.id]=user.id;

      applyDailyLogin(user);

      socket.emit(
        "registered",
        {
          ok:true,
          user:publicUser(user)
        }
      );

      socket.emit(
        "wallet",
        {
          coins:user.coins,
          diamonds:user.diamonds
        }
      );
    }
  );


  /* JOIN ROOM */

  socket.on(
    "join-room",
    (data={})=>{

      const roomId =
        safeString(
          data.roomId ||
          data.room ||
          "200001"
        );

      const user =
        ensureUser({
          userId:
            data.userId ||
            data.id,
          name:data.name,
          dp:data.dp,
          level:data.level
        });

      const room =
        ensureRoom(roomId,{
          ownerId:user.id,
          ownerName:user.name,
          ownerDp:user.dp
        });


      if (
        room.bannedUsers &&
        room.bannedUsers[user.id]
      ) {

        socket.emit(
          "join-error",
          {
            message:"You are banned from this room"
          }
        );

        return;
      }


      /*
        Leave previous rooms.
      */

      for (const joinedRoomId of socket.rooms) {

        if (
          joinedRoomId.startsWith("room:") &&
          joinedRoomId !==
          `room:${roomId}`
        ) {

          const oldId =
            joinedRoomId.slice(5);

          const oldRoom =
            rooms[oldId];

          if (oldRoom) {

            removeUserFromRoom(
              oldRoom,
              user.id
            );

            socket.leave(joinedRoomId);

            broadcastRoom(oldRoom);
          }
        }
      }


      socket.join(
        `room:${roomId}`
      );

      addUserToRoom(room,user);

      increaseTask(
        user.id,
        "task_02"
      );


      socket.emit(
        "room-state",
        {
          room:roomData(room)
        }
      );

      socket.emit(
        "room-joined",
        {
          room:roomData(room)
        }
      );

      socket.to(
        `room:${roomId}`
      ).emit(
        "user-joined",
        publicUser(user)
      );

      socket.to(
        `room:${roomId}`
      ).emit(
        "user-entry",
        {
          userId:user.id,
          name:user.name,
          dp:user.dp,
          entryEffect:user.entryEffect
        }
      );

      broadcastRoom(room);
    }
  );


  /* LEAVE ROOM */

  socket.on(
    "leave-room",
    (data={})=>{

      const room =
        rooms[
          String(data.roomId || "")
        ];

      const userId =
        String(
          data.userId ||
          socketUsers[socket.id] ||
          ""
        );

      if (!room)return;

      removeUserFromRoom(
        room,
        userId
      );

      socket.leave(
        `room:${room.id}`
      );

      socket.to(
        `room:${room.id}`
      ).emit(
        "user-left",
        {
          userId
        }
      );

      broadcastRoom(room);
    }
  );


  /* TAKE SEAT */

  socket.on(
    "take-seat",
    (data={})=>{

      const room =
        rooms[
          String(data.roomId || "")
        ];

      const userId =
        String(data.userId || "");

      if (!room)return;

      const user =
        ensureUser({
          userId
        });

      const seat =
        Math.floor(
          safeNumber(data.seat,-1)
        );

      if (seat<0 || seat>8){

        socket.emit(
          "seat-error",
          {
            message:"Invalid seat"
          }
        );

        return;
      }


      /*
        Seat 0 is Owner seat.
      */

      if (
        seat===0 &&
        !isOwner(room,user.id)
      ) {

        socket.emit(
          "seat-error",
          {
            message:"Host seat is reserved for owner"
          }
        );

        return;
      }


      if (
        room.seats[seat] &&
        String(
          room.seats[seat].userId
        ) !== user.id
      ) {

        socket.emit(
          "seat-error",
          {
            message:"Seat is occupied"
          }
        );

        return;
      }


      /*
        Remove user's old seat.
      */

      for(let i=0;i<9;i++){

        if(
          room.seats[i] &&
          String(
            room.seats[i].userId
          )===user.id
        ){

          room.seats[i]=null;
        }
      }


      const seatUser={
        userId:user.id,
        id:user.id,
        name:user.name,
        dp:user.dp,
        level:user.level,
        mic:false,
        joinedAt:Date.now()
      };

      room.seats[seat]=seatUser;

      room.users[user.id]=seatUser;
      room.members[user.id]=seatUser;

      increaseTask(
        user.id,
        "task_05"
      );

      broadcastRoom(room);

      socket.emit(
        "seat-taken",
        {
          seat,
          room:roomData(room)
        }
      );
    }
  );


  /* LEAVE SEAT */

  socket.on(
    "leave-seat",
    (data={})=>{

      const room =
        rooms[
          String(data.roomId || "")
        ];

      const userId =
        String(data.userId || "");

      if(!room)return;

      for(let i=0;i<9;i++){

        if(
          room.seats[i] &&
          String(
            room.seats[i].userId
          )===userId
        ){

          /*
            Owner host seat stays.
          */

          if(i===0 && isOwner(room,userId)){
            continue;
          }

          room.seats[i]=null;
        }
      }

      broadcastRoom(room);
    }
  );


  /* MIC */

  socket.on(
    "mic-status",
    (data={})=>{

      const room =
        rooms[
          String(data.roomId || "")
        ];

      if(!room)return;

      const userId =
        String(data.userId || "");

      room.seats =
        room.seats.map(seat=>{

          if(
            seat &&
            String(seat.userId)===userId
          ){

            return {
              ...seat,
              mic:Boolean(data.mic)
            };
          }

          return seat;
        });

      broadcastRoom(room);
    }
  );


  /* SPEAKER */

  socket.on(
    "speaker-status",
    (data={})=>{

      socket.emit(
        "speaker-updated",
        {
          speaker:Boolean(data.speaker)
        }
      );
    }
  );


  /* CHAT */

  socket.on(
    "chat",
    (data={})=>{

      const room =
        rooms[
          String(data.roomId || "")
        ];

      if(!room)return;

      const user =
        ensureUser({
          userId:
            data.userId ||
            socketUsers[socket.id],
          name:data.name,
          dp:data.dp
        });

      const text =
        safeString(
          data.text ||
          data.message
        ).trim();

      if(!text)return;

      const message={

        id:randomId("chat_"),

        userId:user.id,
        name:user.name,
        dp:user.dp,

        text:text.slice(0,500),

        createdAt:Date.now()
      };

      room.messages.push(message);

      room.messages =
        room.messages.slice(-100);

      increaseTask(
        user.id,
        "task_04"
      );

      io.to(
        `room:${room.id}`
      ).emit(
        "chat",
        message
      );
    }
  );


  /* OLD ROOM CHAT ALIAS */

  socket.on(
    "room-chat",
    (data={})=>{

      socket.emit(
        "chat",
        data
      );
    }
  );


  /* EMOJI */

  socket.on(
    "emoji",
    (data={})=>{

      const room =
        rooms[
          String(data.roomId || "")
        ];

      if(!room)return;

      const userId =
        String(
          data.userId ||
          socketUsers[socket.id] ||
          ""
        );

      const user =
        ensureUser({
          userId
        });

      increaseTask(
        user.id,
        "task_08"
      );

      io.to(
        `room:${room.id}`
      ).emit(
        "emoji",
        {
          userId:user.id,
          name:user.name,
          emoji:safeString(data.emoji)
        }
      );
    }
  );


  /* GIFT */

  socket.on(
    "gift",
    (data={})=>{

      const senderId =
        String(
          data.senderId ||
          data.userId ||
          socketUsers[socket.id] ||
          ""
        );

      const receiverId =
        String(
          data.receiverId ||
          data.targetUserId ||
          ""
        );

      const result =
        processGift({
          senderId,
          receiverId,
          giftId:data.giftId,
          quantity:data.quantity,
          roomId:String(
            data.roomId || ""
          )
        });

      if(!result.ok){

        socket.emit(
          "gift-error",
          result
        );

        return;
      }

      const room =
        rooms[
          String(data.roomId || "")
        ];

      if(room){

        io.to(
          `room:${room.id}`
        ).emit(
          "gift-sent",
          {
            ...result.record,
            wallet:result.wallet
          }
        );

        io.to(
          `room:${room.id}`
        ).emit(
          "gift-received",
          result.record
        );
      }

      socket.emit(
        "wallet",
        result.wallet
      );
    }
  );


  /* FOLLOW */

  socket.on(
    "follow",
    (data={})=>{

      const result =
        followUser(
          data.userId ||
          socketUsers[socket.id],
          data.targetUserId ||
          data.followingId
        );

      socket.emit(
        "follow-result",
        result
      );
    }
  );


  /* CP */

  socket.on(
    "cp-request",
    (data={})=>{

      const result =
        createCPRequest(
          data.userId ||
          socketUsers[socket.id],

          data.targetUserId ||
          data.receiverId
        );

      socket.emit(
        "cp-result",
        result
      );
    }
  );


  /* CP ACCEPT */

  socket.on(
    "cp-accept",
    (data={})=>{

      const result =
        acceptCP(
          data.userId,
          data.targetUserId
        );

      socket.emit(
        "cp-result",
        result
      );
    }
  );


  /* KICK */

  socket.on(
    "kick",
    (data={})=>{

      const room =
        rooms[
          String(data.roomId || "")
        ];

      if(!room)return;

      const adminId =
        String(
          data.userId ||
          socketUsers[socket.id] ||
          ""
        );

      if(!isAdmin(room,adminId)){

        socket.emit(
          "admin-error",
          {
            message:"Admin permission required"
          }
        );

        return;
      }

      const target =
        String(
          data.targetUserId ||
          data.kickedUserId ||
          ""
        );

      if(target===String(room.ownerId)){

        socket.emit(
          "admin-error",
          {
            message:"Owner cannot be kicked"
          }
        );

        return;
      }

      removeUserFromRoom(
        room,
        target
      );

      const targetSocket =
        userSockets[target];

      if(targetSocket){

        io.sockets.sockets
          .get(targetSocket)
          ?.leave(`room:${room.id}`);

        io.to(targetSocket).emit(
          "kicked",
          {
            roomId:room.id
          }
        );
      }

      broadcastRoom(room);
    }
  );


  /* MUTE */

  socket.on(
    "mute",
    (data={})=>{

      const room =
        rooms[
          String(data.roomId || "")
        ];

      if(!room)return;

      const adminId =
        String(
          data.userId ||
          socketUsers[socket.id] ||
          ""
        );

      if(!isAdmin(room,adminId)){

        socket.emit(
          "admin-error",
          {
            message:"Admin permission required"
          }
        );

        return;
      }

      const target =
        String(
          data.targetUserId ||
          data.mutedUserId ||
          ""
        );

      room.mutedUsers[target] =
        data.muted === false
          ? false
          : true;

      io.to(
        `room:${room.id}`
      ).emit(
        "mute-updated",
        {
          userId:target,
          muted:room.mutedUsers[target]
        }
      );
    }
  );


  /* ROOM UPDATE */

  socket.on(
    "room-update",
    (data={})=>{

      const room =
        rooms[
          String(data.roomId || "")
        ];

      if(!room)return;

      const userId =
        String(
          data.userId ||
          socketUsers[socket.id] ||
          ""
        );

      if(!isAdmin(room,userId)){

        socket.emit(
          "admin-error",
          {
            message:"Admin permission required"
          }
        );

        return;
      }

      const allowed=[
        "name",
        "roomName",
        "dp",
        "category",
        "privacy",
        "password",
        "themeName",
        "themeBackground",
        "announcement",
        "welcomeMessage",
        "admins"
      ];

      allowed.forEach(key=>{

        if(
          data[key] !== undefined
        ){
          room[key]=data[key];
        }
      });

      if(data.name){
        room.roomName=data.name;
      }

      if(data.roomName){
        room.name=data.roomName;
      }

      room.updatedAt=Date.now();

      broadcastRoom(room);
    }
  );


  /* ROOM EXP */

  socket.on(
    "room-exp",
    (data={})=>{

      const room =
        rooms[
          String(data.roomId || "")
        ];

      if(!room)return;

      const amount =
        Math.max(
          0,
          safeNumber(data.amount,0)
        );

      room.roomExp += amount;

      updateRoomTopUsers(room);

      broadcastRoom(room);
    }
  );


  /* ROOM SUPPORT */

  socket.on(
    "room-support",
    (data={})=>{

      const room =
        rooms[
          String(data.roomId || "")
        ];

      if(!room)return;

      room.roomExp += 100;

      updateRoomTopUsers(room);

      broadcastRoom(room);

      socket.emit(
        "support-result",
        {
          ok:true,
          amount:100
        }
      );
    }
  );


  /* DAILY REWARD */

  socket.on(
    "daily-reward",
    (data={})=>{

      const user =
        ensureUser({
          userId:data.userId
        });

      const key =
        `${user.id}_${todayKey()}`;

      if(roomRewards[key]){

        socket.emit(
          "reward-error",
          {
            message:"Already claimed"
          }
        );

        return;
      }

      roomRewards[key]=true;

      addCoins(user,100000);
      addExp(user,1000);

      socket.emit(
        "wallet",
        {
          coins:user.coins,
          diamonds:user.diamonds
        }
      );

      socket.emit(
        "daily-reward-result",
        {
          ok:true,
          coins:100000,
          user:publicUser(user)
        }
      );
    }
  );


  /* ROOM REWARD */

  socket.on(
    "room-reward",
    (data={})=>{

      const user =
        ensureUser({
          userId:data.userId
        });

      addCoins(user,10000);
      addExp(user,500);

      socket.emit(
        "room-reward-result",
        {
          ok:true,
          coins:10000,
          exp:500,
          user:publicUser(user)
        }
      );

      socket.emit(
        "wallet",
        {
          coins:user.coins,
          diamonds:user.diamonds
        }
      );
    }
  );


  /* WEBRTC OFFER */

  socket.on(
    "offer",
    (data={})=>{

      const target =
        userSockets[
          String(
            data.to ||
            data.targetUserId ||
            ""
          )
        ];

      if(target){

        io.to(target).emit(
          "offer",
          {
            ...data,
            from:
              data.from ||
              socketUsers[socket.id]
          }
        );
      }
    }
  );


  /* WEBRTC ANSWER */

  socket.on(
    "answer",
    (data={})=>{

      const target =
        userSockets[
          String(
            data.to ||
            data.targetUserId ||
            ""
          )
        ];

      if(target){

        io.to(target).emit(
          "answer",
          {
            ...data,
            from:
              data.from ||
              socketUsers[socket.id]
          }
        );
      }
    }
  );


  /* WEBRTC ICE */

  socket.on(
    "ice-candidate",
    (data={})=>{

      const target =
        userSockets[
          String(
            data.to ||
            data.targetUserId ||
            ""
          )
        ];

      if(target){

        io.to(target).emit(
          "ice-candidate",
          {
            ...data,
            from:
              data.from ||
              socketUsers[socket.id]
          }
        );
      }
    }
  );


  /* ALIASES */

  socket.on(
    "webrtc-offer",
    data=>{
      socket.emit(
        "offer",
        data
      );
    }
  );

  socket.on(
    "webrtc-answer",
    data=>{
      socket.emit(
        "answer",
        data
      );
    }
  );

  socket.on(
    "webrtc-ice",
    data=>{
      socket.emit(
        "ice-candidate",
        data
      );
    }
  );


  /* DISCONNECT */

  socket.on(
    "disconnect",
    ()=>{

      const userId =
        socketUsers[socket.id];

      if(userId){

        delete userSockets[userId];
      }

      delete socketUsers[socket.id];

      /*
        Remove user from every room
        where this socket was present.
      */

      Object.values(rooms)
        .forEach(room=>{

          if(
            room.members?.[userId] ||
            room.users?.[userId]
          ){

            removeUserFromRoom(
              room,
              userId
            );

            broadcastRoom(room);
          }
        });

      console.log(
        "Socket disconnected:",
        socket.id
      );
    }
  );

});


/* =========================================================
   UPDATE USER IN ALL ROOMS
   ========================================================= */

function updateUserInRooms(user){

  Object.values(rooms)
    .forEach(room=>{

      let changed=false;

      if(room.users?.[user.id]){

        room.users[user.id].name=
          user.name;

        room.users[user.id].dp=
          user.dp;

        room.users[user.id].level=
          user.level;

        changed=true;
      }

      if(room.members?.[user.id]){

        room.members[user.id].name=
          user.name;

        room.members[user.id].dp=
          user.dp;

        room.members[user.id].level=
          user.level;

        changed=true;
      }

      room.seats =
        (room.seats||[]).map(seat=>{

          if(
            seat &&
            String(seat.userId)===
            String(user.id)
          ){

            changed=true;

            return {
              ...seat,
              name:user.name,
              dp:user.dp,
              level:user.level
            };
          }

          return seat;
        });

      if(changed){

        room.updatedAt=Date.now();

        broadcastRoom(room);
      }
    });
}


/* =========================================================
   EMPTY ROOM CLEANUP
   ========================================================= */

setInterval(()=>{

  const now=Date.now();

  Object.entries(rooms)
    .forEach(([id,room])=>{

      if(id==="main")return;

      const count =
        roomMemberCount(room);

      const age =
        now -
        safeNumber(
          room.updatedAt,
          room.createdAt
        );

      /*
        Empty rooms older than 30 minutes
        can be removed.
      */

      if(
        count===0 &&
        age >
        30*60*1000
      ){

        delete rooms[id];

        console.log(
          "Deleted empty room:",
          id
        );
      }
    });

},5*60*1000);


/* =========================================================
   START SERVER
   ========================================================= */

server.listen(
  PORT,
  ()=>{
    console.log(
      `PawanVoice server running on port ${PORT}`
    );

    console.log(
      "Socket.IO: ON"
    );

    console.log(
      "9 Seats: ON"
    );

    console.log(
      "200 Gifts: ON"
    );

    console.log(
      "Family: ON"
    );

    console.log(
      "CP: ON"
    );

    console.log(
      "Admin: ON"
    );

    console.log(
      "Games: ON"
    );
  }
);
