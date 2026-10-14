"use strict";

const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST", "PATCH", "DELETE"] },
  pingInterval: 25000,
  pingTimeout: 60000
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 10000;
const users = new Map();
const rooms = new Map();
const gameStates = new Map();
const gameTimers = new Map();
const recentResults = new Map();

const managerId = cleanManagerId(process.env.PAWAN_MANAGER_ID || "");
const managerPin = String(process.env.PAWAN_MANAGER_PIN || "");
const staffRoles = new Map();
const staffFrames = new Map();
const ownedFrames = new Map();
const moderation = new Map();
const managerAuditLog = [];
let maintenanceMode = false;
let announcement = "";

const STAFF_ROLE_NAMES = [
  "Super Admin",
  "Admin",
  "Official",
  "BD",
  "Customer Service"
];

const STAFF_ROLE_FRAMES = Object.fromEntries(
  ["Manager", ...STAFF_ROLE_NAMES].map(role => [
    role,
    Array.from({ length: 5 }, (_, i) => ({
      id: `staff_${role.toLowerCase().replace(/[^a-z]+/g, "_")}_${i + 1}`,
      name: `${role} Frame ${i + 1}`,
      role,
      number: i + 1,
      style: [
        "Royal Gold",
        "Neon Crown",
        "Crystal Halo",
        "Galaxy Ring",
        "Imperial Flame"
      ][i]
    }))
  ])
);

const NORMAL_AVATAR_FRAMES = [
  ["Royal Crown", "👑", "gold"],
  ["Peach Blossom", "🌸", "peach"],
  ["Golden Royal", "✨", "royal"],
  ["Neon Festival", "💠", "neon"],
  ["Dragon Galaxy", "🐉", "dragon"],
  ["Rainbow Crystal", "🌈", "rainbow"],
  ["Diamond Aura", "💎", "diamond"],
  ["Moonlight", "🌙", "moon"],
  ["Sunrise Glow", "🌅", "sunrise"],
  ["Rose Garden", "🌹", "rose"],
  ["Ocean Wave", "🌊", "ocean"],
  ["Fire Phoenix", "🔥", "fire"],
  ["Emerald Vine", "🍃", "emerald"],
  ["Butterfly Dream", "🦋", "butterfly"],
  ["Starry Night", "⭐", "stars"],
  ["Purple Magic", "🔮", "purple"],
  ["Silver Ice", "❄️", "ice"],
  ["Golden Lotus", "🪷", "lotus"],
  ["Royal Peacock", "🦚", "peacock"],
  ["Aurora", "🌌", "aurora"],
  ["Heart Spark", "💖", "heart"],
  ["Cyber Pulse", "⚡", "cyber"],
  ["Velvet Bloom", "🌺", "velvet"],
  ["Crystal Wings", "🪽", "wings"],
  ["Mystic Orb", "🪄", "mystic"],
  ["Festival Lights", "🎆", "festival"],
  ["Pearl Halo", "🤍", "pearl"],
  ["Ruby Flame", "♦️", "ruby"],
  ["Sapphire Edge", "🔷", "sapphire"],
  ["Golden Sun", "☀️", "sun"],
  ["Royal Palace", "🏰", "palace"],
  ["Galaxy Portal", "🪐", "portal"],
  ["Enchanted Forest", "🌳", "forest"],
  ["Diamond Snow", "❄️", "snow"],
  ["Legendary Aura", "🏆", "legend"]
].map((x, i) => ({
  id: `avatar_${i + 1}`,
  name: x[0],
  icon: x[1],
  style: x[2],
  price: (i + 1) * 25000,
  durations: [7, 15, 30]
}));

function cleanManagerId(v) {
  return String(v || "").trim().slice(0, 100);
}

function managerAuthorized(req) {
  const id = cleanManagerId(req.get("x-manager-id"));
  const pin = String(req.get("x-manager-pin") || "");
  return Boolean(managerId && managerPin && id === managerId && pin === managerPin);
}

function audit(action, actor, details = {}) {
  managerAuditLog.push({
    at: now(),
    actor: String(actor || ""),
    action: String(action || ""),
    details
  });

  if (managerAuditLog.length > 1000) {
    managerAuditLog.splice(0, managerAuditLog.length - 1000);
  }
}

function ensureStaffUser(userId, name = "Staff") {
  const id = cleanId(userId);
  if (!id) return null;

  return getUser(
    id,
    name,
    "https://i.pravatar.cc/200?u=" + encodeURIComponent(id)
  );
}

function staffPublic() {
  return Array.from(staffRoles.entries()).map(([userId, rec]) => ({
    userId,
    role: rec.role,
    name: (users.get(userId) || {}).name || rec.name || "Staff",
    createdAt: rec.createdAt,
    frames: STAFF_ROLE_FRAMES[rec.role] || []
  }));
}

function blockedAccount(userId) {
  const m = moderation.get(cleanId(userId)) || {};
  return Boolean(m.banned || Number(m.suspendedUntil || 0) > now());
}

const FESTIVAL_GIFTS = [
  { id: "festival_diwali_diya", name: "Diwali Diya", icon: "🪔", price: 1000, festival: "Diwali" },
  { id: "festival_golden_candle", name: "Golden Candle", icon: "🕯️", price: 5000, festival: "Diwali" },
  { id: "festival_sparkler", name: "Sparkler", icon: "🎇", price: 10000, festival: "Diwali" },
  { id: "festival_fireworks", name: "Fireworks", icon: "🎆", price: 50000, festival: "Diwali" },
  { id: "festival_diwali_box", name: "Diwali Gift Box", icon: "🎁", price: 100000, festival: "Diwali" },
  { id: "festival_golden_lotus", name: "Golden Lotus", icon: "🪷", price: 200000, festival: "Diwali" },
  { id: "festival_peacock", name: "Royal Peacock", icon: "🦚", price: 500000, festival: "Diwali" },
  { id: "festival_golden_palace", name: "Golden Palace", icon: "🏮", price: 1000000, festival: "Diwali" },
  { id: "festival_diamond_diwali", name: "Diamond Diwali", icon: "💎", price: 5000000, festival: "Diwali" },
  { id: "festival_diwali_king", name: "Diwali Royal King", icon: "👑", price: 10000000, festival: "Diwali" },
  { id: "festival_red_rose", name: "Red Rose", icon: "🌺", price: 1000, festival: "Navratri" },
  { id: "festival_mata_blessing", name: "Mata Rani Blessing", icon: "🙏", price: 5000, festival: "Navratri" },
  { id: "festival_navratri_diya", name: "Navratri Diya", icon: "🪔", price: 10000, festival: "Navratri" },
  { id: "festival_garba", name: "Garba Dance", icon: "💃", price: 50000, festival: "Navratri" },
  { id: "festival_dandiya", name: "Dandiya Night", icon: "🥁", price: 100000, festival: "Navratri" },
  { id: "festival_flower_shower", name: "Flower Shower", icon: "🌸", price: 200000, festival: "Navratri" },
  { id: "festival_sherawali", name: "Sherawali Mata", icon: "🦁", price: 500000, festival: "Navratri" },
  { id: "festival_temple", name: "Golden Temple", icon: "🛕", price: 1000000, festival: "Navratri" },
  { id: "festival_divine_blessing", name: "Divine Blessing", icon: "✨", price: 5000000, festival: "Navratri" },
  { id: "festival_navratri_queen", name: "Navratri Royal Queen", icon: "👑", price: 10000000, festival: "Navratri" }
];

const EXTRA_GIFTS = [
  {"category":"cp","id":"cp_heart","name":"CP Heart","icon":"💗","price":5000},
  {"category":"cp","id":"cp_ring","name":"Couple Ring","icon":"💍","price":25000},
  {"category":"cp","id":"cp_love_boat","name":"Love Boat","icon":"💘","price":100000},
  {"category":"cp","id":"cp_forever","name":"Forever Love","icon":"💕","price":500000},
  {"category":"friendship","id":"friend_star","name":"Best Friend Star","icon":"🌟","price":1000},
  {"category":"friendship","id":"friend_handshake","name":"Friendship Bond","icon":"🤝","price":10000},
  {"category":"friendship","id":"friend_cake","name":"Friendship Cake","icon":"🎂","price":50000},
  {"category":"friendship","id":"friend_galaxy","name":"Friendship Galaxy","icon":"🌌","price":250000},
  {"category":"family","id":"family_home","name":"Family Home","icon":"🏡","price":5000},
  {"category":"family","id":"family_tree","name":"Family Tree","icon":"🌳","price":25000},
  {"category":"family","id":"family_feast","name":"Family Feast","icon":"🍱","price":100000},
  {"category":"family","id":"family_castle","name":"Family Castle","icon":"🏰","price":500000},
  {"category":"lucky","id":"lucky_clover","name":"Lucky Clover","icon":"🍀","price":1000},
  {"category":"lucky","id":"lucky_dice","name":"Lucky Dice","icon":"🎲","price":10000},
  {"category":"lucky","id":"lucky_chest","name":"Lucky Chest","icon":"🧰","price":50000},
  {"category":"lucky","id":"lucky_jackpot","name":"Lucky Jackpot","icon":"🎰","price":250000},
  {"category":"vip","id":"vip_crown","name":"VIP Crown","icon":"👑","price":100000},
  {"category":"vip","id":"vip_royal_car","name":"Royal Car","icon":"🏎️","price":500000},
  {"category":"vip","id":"vip_jet","name":"VIP Private Jet","icon":"🛩️","price":2500000},
  {"category":"vip","id":"vip_galaxy","name":"VIP Galaxy","icon":"🌌","price":5000000},
  {"category":"video","id":"video_rose","name":"Video Rose","icon":"🌹","price":10000},
  {"category":"video","id":"video_dance","name":"Video Dance","icon":"💃","price":50000},
  {"category":"video","id":"video_fireworks","name":"Video Fireworks","icon":"🎆","price":250000},
  {"category":"video","id":"video_custom","name":"Custom Video Gift","icon":"🎬","price":1000000}
];

const giftHistory = [];
const giftCategoryPoints = new Map();

const ALL_GIFT_CATALOG = [
  ...FESTIVAL_GIFTS.map(g => ({
    ...g,
    category: g.festival === "Diwali" ? "diwali" : "navratri"
  })),
  ...EXTRA_GIFTS,
  ...Array.from({ length: 200 }, (_, i) => {
    const n = i + 1;
    const price = n <= 20 ? n * 10 :
      n <= 50 ? n * 50 :
      n <= 100 ? n * 100 : n * 500;

    return { id: "gift" + n, name: "Gift " + n, icon: "🎁", price, category: "all" };
  }),
  ...Array.from({ length: 20 }, (_, i) => {
    const n = i + 1;
    const price = n <= 50 ? n * 100 :
      n <= 100 ? (n - 50) * 1000 :
      n <= 150 ? (n - 100) * 10000 : (n - 150) * 50000;

    return { id: "gift_" + n, name: "Gift " + n, icon: "🎁", price, category: "all" };
  })
];

const ROOM_FESTIVAL_GIFTS = [
  { id: "diwali_diya", name: "Diwali Diya", icon: "🪔", price: 5000, category: "diwali", festival: "Diwali" },
  { id: "diwali_ladoo", name: "Diwali Ladoo", icon: "🍬", price: 10000, category: "diwali", festival: "Diwali" },
  { id: "diwali_rangoli", name: "Royal Rangoli", icon: "🌈", price: 25000, category: "diwali", festival: "Diwali" },
  { id: "diwali_lakshmi", name: "Lakshmi Blessing", icon: "🪷", price: 50000, category: "diwali", festival: "Diwali" },
  { id: "diwali_fireworks", name: "Diwali Fireworks", icon: "🎆", price: 100000, category: "diwali", festival: "Diwali" },
  { id: "diwali_gold_coin", name: "Golden Coin Shower", icon: "🪙", price: 250000, category: "diwali", festival: "Diwali" },
  { id: "diwali_palace", name: "Festival Palace", icon: "🏰", price: 500000, category: "diwali", festival: "Diwali" },
  { id: "diwali_rocket", name: "Diwali Rocket", icon: "🚀", price: 1000000, category: "diwali", festival: "Diwali" },
  { id: "diwali_mahalaxmi", name: "Maha Lakshmi Crown", icon: "👑", price: 2500000, category: "diwali", festival: "Diwali" },
  { id: "diwali_galaxy", name: "Diwali Galaxy", icon: "✨", price: 5000000, category: "diwali", festival: "Diwali" },
  { id: "navratri_dandiya", name: "Dandiya Dance", icon: "🪇", price: 5000, category: "navratri", festival: "Navratri" },
  { id: "navratri_ghagra", name: "Garba Ghagra", icon: "💃", price: 10000, category: "navratri", festival: "Navratri" },
  { id: "navratri_dhol", name: "Navratri Dhol", icon: "🥁", price: 25000, category: "navratri", festival: "Navratri" },
  { id: "navratri_trishul", name: "Divine Trishul", icon: "🔱", price: 50000, category: "navratri", festival: "Navratri" },
  { id: "navratri_durga", name: "Maa Durga Blessing", icon: "🙏", price: 100000, category: "navratri", festival: "Navratri" },
  { id: "navratri_temple", name: "Golden Temple", icon: "🛕", price: 250000, category: "navratri", festival: "Navratri" },
  { id: "navratri_lion", name: "Maa Durga Lion", icon: "🦁", price: 500000, category: "navratri", festival: "Navratri" },
  { id: "navratri_crown", name: "Shakti Crown", icon: "👑", price: 1000000, category: "navratri", festival: "Navratri" },
  { id: "navratri_divine_light", name: "Divine Light Show", icon: "🌟", price: 2500000, category: "navratri", festival: "Navratri" },
  { id: "navratri_mahashakti", name: "Maha Shakti Celebration", icon: "💫", price: 5000000, category: "navratri", festival: "Navratri" }
];

const giftCatalogById = new Map(ALL_GIFT_CATALOG.map(g => [g.id, g]));
for (const g of ROOM_FESTIVAL_GIFTS) giftCatalogById.set(g.id, g);

const festivalScores = new Map();
const festivalStartedAt = now();
const FESTIVAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
let festivalWinner = null;
let festivalWinnerBannerUntil = 0;
let festivalRewardIssued = false;

function festivalLeaderboard() {
  return Array.from(festivalScores.values())
    .sort((a, b) => b.coins - a.coins || a.firstAt - b.firstAt)
    .slice(0, 50)
    .map((x, i) => ({ ...x, rank: i + 1 }));
}

function publicFestivalState() {
  return {
    title: "BIG FESTIVAL UPDATE",
    gifts: FESTIVAL_GIFTS,
    startedAt: festivalStartedAt,
    endsAt: festivalStartedAt + FESTIVAL_DURATION_MS,
    active: now() < festivalStartedAt + FESTIVAL_DURATION_MS && !festivalRewardIssued,
    leaderboard: festivalLeaderboard(),
    winner: festivalWinner && now() < festivalWinnerBannerUntil
      ? { ...festivalWinner, bannerUntil: festivalWinnerBannerUntil }
      : null
  };
}

function settleFestivalIfDue() {
  if (festivalRewardIssued || now() < festivalStartedAt + FESTIVAL_DURATION_MS) return;

  festivalRewardIssued = true;
  const top = festivalLeaderboard()[0];
  if (!top) return;

  const u = getUser(top.userId, top.name, top.dp);
  u.coins += 10000000;
  u.topAvatarFrameUntil = now() + 30 * 24 * 60 * 60 * 1000;
  u.topEntryUntil = now() + 15 * 24 * 60 * 60 * 1000;
  u.vip = 10;
  u.vip10Until = now() + 15 * 24 * 60 * 60 * 1000;
  u.videoGiftCustomization = true;

  festivalWinner = {
    userId: u.userId,
    name: u.name,
    dp: u.dp,
    coins: top.coins,
    awardedAt: now()
  };

  festivalWinnerBannerUntil = now() + 7 * 24 * 60 * 60 * 1000;

  io.emit("festival:winner", {
    winner: festivalWinner,
    rewards: {
      coins: 10000000,
      topAvatarFrameDays: 30,
      topEntryDays: 15,
      vip: 10,
      vipDays: 15,
      videoGiftCustomization: true
    },
    bannerUntil: festivalWinnerBannerUntil
  });

  const sock = findSocketForUser(u.userId);
  if (sock) sock.emit("wallet", { coins: u.coins, diamonds: u.diamonds });
}

setInterval(settleFestivalIfDue, 15000).unref();

const GAME_CONFIG = {
  greedy: {
    name: "Greedy Baby",
    duration: 15,
    items: [
      { id: "bear", name: "Bear", icon: "🐻", multiplier: 2 },
      { id: "rabbit", name: "Rabbit", icon: "🐰", multiplier: 2 },
      { id: "fox", name: "Fox", icon: "🦊", multiplier: 3 },
      { id: "panda", name: "Panda", icon: "🐼", multiplier: 3 },
      { id: "lion", name: "Lion", icon: "🦁", multiplier: 4 },
      { id: "monkey", name: "Monkey", icon: "🐵", multiplier: 4 },
      { id: "pig", name: "Pig", icon: "🐷", multiplier: 5 },
      { id: "tiger", name: "Tiger", icon: "🐯", multiplier: 5 }
    ]
  },
  animal: {
    name: "Animal Party",
    duration: 15,
    items: [
      { id: "lion", name: "Lion", icon: "🦁", multiplier: 2 },
      { id: "tiger", name: "Tiger", icon: "🐯", multiplier: 2 },
      { id: "monkey", name: "Monkey", icon: "🐵", multiplier: 3 },
      { id: "rabbit", name: "Rabbit", icon: "🐰", multiplier: 3 },
      { id: "fox", name: "Fox", icon: "🦊", multiplier: 4 },
      { id: "panda", name: "Panda", icon: "🐼", multiplier: 4 },
      { id: "bear", name: "Bear", icon: "🐻", multiplier: 5 },
      { id: "pig", name: "Pig", icon: "🐷", multiplier: 5 }
    ]
  },
  lucky: {
    name: "Lucky Spin",
    duration: 15,
    items: [
      { id: "red", name: "Red", icon: "🔴", multiplier: 2 },
      { id: "blue", name: "Blue", icon: "🔵", multiplier: 2 },
      { id: "green", name: "Green", icon: "🟢", multiplier: 3 },
      { id: "yellow", name: "Yellow", icon: "🟡", multiplier: 3 },
      { id: "purple", name: "Purple", icon: "🟣", multiplier: 4 },
      { id: "star", name: "Star", icon: "⭐", multiplier: 5 },
      { id: "crown", name: "Crown", icon: "👑", multiplier: 8 },
      { id: "diamond", name: "Diamond", icon: "💎", multiplier: 10 }
    ]
  }
};

function now() {
  return Date.now();
}

function cleanId(v, fallback = "") {
  return String(v || fallback).trim().slice(0, 100);
}

function publicUser(u) {
  return {
    userId: u.userId,
    name: u.name,
    dp: u.dp,
    coins: u.coins,
    diamonds: u.diamonds,
    level: u.level,
    exp: u.exp,
    vip: u.vip,
    topAvatarFrameUntil: u.topAvatarFrameUntil || 0,
    topEntryUntil: u.topEntryUntil || 0,
    vip10Until: u.vip10Until || 0,
    videoGiftCustomization: Boolean(u.videoGiftCustomization),
    role: (staffRoles.get(u.userId) || {}).role ||
      (managerId && u.userId === managerId ? "Manager" : "User"),
    staffFrame: staffFrames.get(u.userId) ||
      (managerId && u.userId === managerId
        ? STAFF_ROLE_FRAMES.Manager[0].id
        : ""),
    avatarFrame: u.avatarFrame || "",
    avatarFrameExpiresAt: Number(u.avatarFrameExpiresAt || 0),
    banned: Boolean((moderation.get(u.userId) || {}).banned),
    suspendedUntil: Number((moderation.get(u.userId) || {}).suspendedUntil || 0)
  };
}

function getUser(userId, name = "Guest", dp = "") {
  userId = cleanId(userId, "guest");

  if (!users.has(userId)) {
    users.set(userId, {
      userId,
      name: String(name || "Guest").slice(0, 40),
      dp: String(dp || "").slice(0, 1000),
      coins: 1000000,
      diamonds: 0,
      level: 1,
      exp: 0,
      vip: 0,
      createdAt: now()
    });
  }

  const u = users.get(userId);

  if (name) u.name = String(name).slice(0, 40);
  if (dp) u.dp = String(dp).slice(0, 1000);

  return u;
}

function getRoom(roomId) {
  roomId = cleanId(roomId, "PV100");

  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      roomId,
      name: roomId === "PV100" ? "PawanVoice Games" : "Voice Room",
      dp: "",
      hostId: "",
      hostName: "Host",
      category: "General",
      createdAt: now(),
      members: new Map(),
      seats: Array.from({ length: 9 }, (_, i) => ({
        seat: i + 1,
        userId: null,
        name: "",
        dp: ""
      })),
      chat: []
    });
  }

  return rooms.get(roomId);
}

function gameKey(roomId, gameId) {
  return `${roomId}:${gameId}`;
}

function gameConfig(gameId) {
  return GAME_CONFIG[gameId] || null;
}

function randomItem(config) {
  return config.items[crypto.randomInt(0, config.items.length)];
}

function roomPlayerCount(roomId, gameId) {
  const state = gameStates.get(gameKey(roomId, gameId));
  return state ? state.players.size : 0;
}

function makeGameState(roomId, gameId) {
  const config = gameConfig(gameId);
  const old = gameStates.get(gameKey(roomId, gameId));

  return {
    roomId,
    gameId,
    game: gameId,
    name: config.name,
    active: true,
    status: "running",
    roundId: crypto.randomUUID
      ? crypto.randomUUID()
      : crypto.randomBytes(8).toString("hex"),
    roundNumber: old ? old.roundNumber + 1 : 1,
    startedAt: now(),
    endAt: now() + config.duration * 1000,
    endsAt: now() + config.duration * 1000,
    duration: config.duration,
    items: config.items.map(x => ({
      ...x,
      multiplier: `${x.multiplier}x`
    })),
    players: new Map(),
    result: null
  };
}

function publicGameState(state) {
  return {
    roomId: state.roomId,
    gameId: state.gameId,
    game: state.gameId,
    name: state.name,
    active: state.active,
    status: state.status,
    roundId: state.roundId,
    roundNumber: state.roundNumber,
    startedAt: state.startedAt,
    endAt: state.endAt,
    endsAt: state.endsAt,
    duration: state.duration,
    items: state.items,
    playerCount: state.players.size,
    players: Array.from(state.players.values()).map(p => ({
      userId: p.userId,
      name: p.name,
      dp: p.dp
    })),
    result: state.result
  };
}

function emitGameState(roomId, gameId) {
  const state = gameStates.get(gameKey(roomId, gameId));
  if (!state) return;

  const payload = publicGameState(state);

  io.to(gameKey(roomId, gameId)).emit("game:state", payload);
  io.to(gameKey(roomId, gameId)).emit("game:opened", payload);
  io.to(gameKey(roomId, gameId)).emit("game:players", {
    roomId,
    gameId,
    count: state.players.size,
    playerCount: state.players.size,
    players: payload.players
  });
}

function startGame(roomId, gameId) {
  const key = gameKey(roomId, gameId);
  const existing = gameStates.get(key);

  if (existing && existing.status === "running" && existing.endAt > now()) {
    return existing;
  }

  const state = makeGameState(roomId, gameId);
  gameStates.set(key, state);

  if (gameTimers.has(key)) clearTimeout(gameTimers.get(key));

  emitGameState(roomId, gameId);

  const timer = setTimeout(
    () => finishGame(roomId, gameId),
    state.duration * 1000
  );

  gameTimers.set(key, timer);
  return state;
}

function finishGame(roomId, gameId) {
  const key = gameKey(roomId, gameId);
  const state = gameStates.get(key);
  const config = gameConfig(gameId);

  if (!state || !config || state.status !== "running") return;

  state.status = "finished";
  state.active = false;
  state.endAt = now();
  state.endsAt = state.endAt;

  const winning = randomItem(config);
  const winners = [];
  const results = [];

  for (const player of state.players.values()) {
    let payout = 0;

    for (const bet of player.bets) {
      if (String(bet.itemId) === String(winning.id)) {
        const item = config.items.find(x => x.id === winning.id);
        payout += Math.floor(bet.amount * item.multiplier);
      }
    }

    if (payout > 0) {
      const u = getUser(player.userId);
      u.coins += payout;
      u.exp += Math.max(1, Math.floor(payout / 10000));
      u.level = Math.max(1, Math.floor(u.exp / 1000) + 1);

      winners.push({
        userId: player.userId,
        name: player.name,
        payout,
        coins: u.coins
      });
    }

    results.push({
      userId: player.userId,
      name: player.name,
      payout,
      coins: getUser(player.userId).coins
    });
  }

  state.result = {
    roomId,
    gameId,
    roundId: state.roundId,
    roundNumber: state.roundNumber,
    winningItem: winning.id,
    itemId: winning.id,
    name: winning.name,
    icon: winning.icon,
    winners,
    results,
    finishedAt: now()
  };

  const payload = { ...state.result, result: state.result };

  io.to(key).emit("game:result", payload);
  emitGameState(roomId, gameId);

  recentResults.set(
    key,
    [state.result, ...(recentResults.get(key) || [])].slice(0, 20)
  );

  for (const player of state.players.values()) {
    const u = users.get(player.userId);

    if (u) {
      const sock = findSocketForUser(player.userId);

      if (sock) {
        sock.emit("wallet", {
          coins: u.coins,
          diamonds: u.diamonds
        });
      }
    }
  }

  const timer = setTimeout(() => {
    startGame(roomId, gameId);
  }, 4000);

  gameTimers.set(key, timer);
}

const socketUser = new Map();
const userSockets = new Map();

function findSocketForUser(userId) {
  const ids = userSockets.get(userId);
  if (!ids || !ids.size) return null;

  const id = ids.values().next().value;
  return io.sockets.sockets.get(id) || null;
}

function joinGame(socket, data) {
  const roomId = cleanId(data.roomId, "PV100");
  const gameId = cleanId(data.gameId || data.game, "greedy");
  const config = gameConfig(gameId);

  if (!config) {
    socket.emit("game:error", { message: "Unknown game." });
    return;
  }

  const u = getUser(
    data.userId || socketUser.get(socket.id),
    data.name,
    data.dp
  );

  socketUser.set(socket.id, u.userId);
  socket.join(gameKey(roomId, gameId));

  getRoom(roomId).members.set(u.userId, {
    userId: u.userId,
    name: u.name,
    dp: u.dp
  });

  let state = gameStates.get(gameKey(roomId, gameId));

  if (!state || state.status !== "running" || state.endAt <= now()) {
    state = startGame(roomId, gameId);
  }

  if (!state.players.has(u.userId)) {
    state.players.set(u.userId, {
      userId: u.userId,
      name: u.name,
      dp: u.dp,
      bets: []
    });
  }

  emitGameState(roomId, gameId);
  socket.emit("game:open", publicGameState(state));
}

function handleBet(socket, data) {
  const roomId = cleanId(data.roomId, "PV100");
  const gameId = cleanId(data.gameId || data.game, "greedy");
  const config = gameConfig(gameId);

  if (!config) {
    return socket.emit("game:error", { message: "Unknown game." });
  }

  const userId = cleanId(data.userId || socketUser.get(socket.id));
  const u = getUser(userId, data.name, data.dp);
  const key = gameKey(roomId, gameId);
  const state = gameStates.get(key);

  if (!state || state.status !== "running" || state.endAt <= now()) {
    return socket.emit("game:error", {
      message: "Betting has closed. Wait for the next round."
    });
  }

  const bets = Array.isArray(data.bets) ? data.bets : [];

  if (!bets.length || bets.length > 8) {
    return socket.emit("game:error", {
      message: "Select an item and a valid bet amount."
    });
  }

  let total = 0;
  const validated = [];

  for (const bet of bets) {
    const itemId = cleanId(bet.itemId || bet.id);
    const amount = Number(bet.amount);

    if (!config.items.some(item => item.id === itemId)) {
      return socket.emit("game:error", { message: "Invalid game item." });
    }

    if (![100000, 200000, 500000].includes(amount)) {
      return socket.emit("game:error", {
        message: "Choose one of the allowed bet amounts."
      });
    }

    total += amount;
    validated.push({ itemId, amount });
  }

  if (total > u.coins) {
    return socket.emit("game:error", { message: "Not enough coins." });
  }

  const player = state.players.get(userId) || {
    userId,
    name: u.name,
    dp: u.dp,
    bets: []
  };

  if (player.bets.length + validated.length > 8) {
    return socket.emit("game:error", {
      message: "Maximum bets reached for this round."
    });
  }

  u.coins -= total;
  player.bets.push(...validated);
  player.name = u.name;
  player.dp = u.dp;
  state.players.set(userId, player);

  const response = {
    ok: true,
    message: "Bet accepted by server.",
    roomId,
    gameId,
    roundId: state.roundId,
    roundNumber: state.roundNumber,
    userId,
    amount: total,
    coins: u.coins,
    wallet: u.coins
  };

  socket.emit("game:joined", response);
  socket.emit("wallet", { coins: u.coins, diamonds: u.diamonds });
  emitGameState(roomId, gameId);
}

function sendWallet(socket) {
  const userId = socketUser.get(socket.id);
  if (!userId) return;

  const u = getUser(userId);
  socket.emit("wallet", { coins: u.coins, diamonds: u.diamonds });
}

app.get("/", (req, res) => {
  const indexPath = path.join(__dirname, "index.html");

  res.sendFile(indexPath, err => {
    if (err && !res.headersSent) {
      res.json({
        app: "PawanVoice Room Server",
        status: "running",
        socketIO: true,
        seats: 9,
        rooms: rooms.size
      });
    }
  });
});

app.get("/health", (req, res) => res.json({
  app: "PawanVoice Room Server",
  status: "running",
  socketIO: true,
  seats: 9,
  rooms: rooms.size,
  users: users.size,
  games: gameStates.size
}));

app.get("/api/festival", (req, res) => {
  settleFestivalIfDue();
  res.json(publicFestivalState());
});

app.get("/api/festival/gifts", (req, res) => res.json(FESTIVAL_GIFTS));
app.get("/api/gifts/catalog", (req, res) => res.json(ALL_GIFT_CATALOG));

app.get("/api/gifts/history", (req, res) => {
  const userId = cleanId(req.query.userId);
  const roomId = cleanId(req.query.roomId);
  let rows = giftHistory.slice();

  if (userId) {
    rows = rows.filter(g => g.senderId === userId || g.receiverId === userId);
  }

  if (roomId) rows = rows.filter(g => g.roomId === roomId);

  res.json({ history: rows.slice(-200).reverse() });
});

app.get("/api/gifts/points/:userId", (req, res) => {
  const userId = cleanId(req.params.userId);

  res.json(giftCategoryPoints.get(userId) || {
    userId,
    cp: 0,
    friendship: 0,
    family: 0,
    lucky: 0,
    vip: 0,
    video: 0,
    diwali: 0,
    navratri: 0
  });
});

app.get("/api/festival/leaderboard", (req, res) => {
  res.json({
    leaderboard: festivalLeaderboard(),
    winner: festivalWinner && now() < festivalWinnerBannerUntil
      ? festivalWinner
      : null
  });
});

app.get("/api/games", (req, res) => {
  res.json(Object.entries(GAME_CONFIG).map(([id, cfg]) => ({
    id,
    name: cfg.name,
    duration: cfg.duration,
    items: cfg.items
  })));
});

app.get("/api/users/:id", (req, res) => {
  const u = users.get(cleanId(req.params.id));

  if (!u) return res.status(404).json({ error: "User not found" });

  res.json(publicUser(u));
});

app.get("/api/rooms", (req, res) => {
  res.json(Array.from(rooms.values()).map(r => ({
    roomId: r.roomId,
    name: r.name,
    dp: r.dp,
    hostId: r.hostId,
    hostName: r.hostName,
    category: r.category,
    online: r.members.size,
    createdAt: r.createdAt,
    seats: r.seats
  })));
});

app.get("/api/ranking", (req, res) => {
  res.json(Array.from(users.values())
    .sort((a, b) => b.coins - a.coins)
    .slice(0, 100)
    .map(publicUser));
});

app.get("/api/ranking/:type", (req, res) => {
  const type = String(req.params.type || "daily").toLowerCase();
  const t = now();

  const windowMs = type === "daily" ? 24 * 60 * 60 * 1000 :
    type === "weekly" ? 7 * 24 * 60 * 60 * 1000 :
    type === "monthly" ? 30 * 24 * 60 * 60 * 1000 : 0;

  if (["daily", "weekly", "monthly", "topgifter", "topreceiver", "richking"].includes(type)) {
    const rows = giftHistory.filter(g =>
      !windowMs || Number(g.createdAt || 0) >= t - windowMs
    );

    const totals = new Map();

    for (const g of rows) {
      const isReceiver = type === "topreceiver";
      const id = isReceiver ? g.receiverId : g.senderId;
      if (!id) continue;

      const row = totals.get(id) || {
        userId: id,
        name: isReceiver ? (g.receiverName || "User") : (g.senderName || "User"),
        dp: isReceiver ? (g.receiverDp || "") : (g.senderDp || ""),
        coins: 0,
        total: 0,
        gifts: 0
      };

      row.coins += Number(g.total || g.price || 0);
      row.total = row.coins;
      row.gifts += Number(g.quantity || 1);
      totals.set(id, row);
    }

    return res.json(Array.from(totals.values())
      .sort((a, b) => b.coins - a.coins)
      .slice(0, 100)
      .map((x, i) => ({ ...x, rank: i + 1 })));
  }

  res.json(Array.from(users.values())
    .sort((a, b) => b.coins - a.coins)
    .slice(0, 100)
    .map((u, i) => ({ ...publicUser(u), rank: i + 1 })));
});

app.get("/api/family", (req, res) => {
  const rows = Array.from(giftCategoryPoints.values())
    .filter(x => Number(x.family || 0) > 0)
    .sort((a, b) => b.family - a.family)
    .slice(0, 100);

  res.json({
    family: null,
    members: [],
    ranking: rows.map((x, i) => ({
      userId: x.userId,
      coins: x.family,
      points: x.family,
      rank: i + 1,
      name: (users.get(x.userId) || {}).name || "User",
      dp: (users.get(x.userId) || {}).dp || ""
    }))
  });
});

app.get("/api/cp", (req, res) => {
  const rows = Array.from(giftCategoryPoints.values())
    .filter(x => Number(x.cp || 0) > 0)
    .sort((a, b) => b.cp - a.cp)
    .slice(0, 100);

  res.json({
    cp: null,
    requests: [],
    ranking: rows.map((x, i) => ({
      userId: x.userId,
      coins: x.cp,
      points: x.cp,
      rank: i + 1,
      name: (users.get(x.userId) || {}).name || "User",
      dp: (users.get(x.userId) || {}).dp || ""
    }))
  });
});

app.get("/api/events", (req, res) => res.json([
  { title: "🎁 Daily Login", description: "Come back daily for rewards." },
  { title: "🎡 Lucky Wheel", description: "Check today's activity." },
  { title: "👨‍👩‍👧 Family Event", description: "Meet your family members." },
  { title: "👑 Rich King", description: "See the community ranking." }
]));

// Manager and staff management API.
// Manager PIN को HTML में नहीं रखना है.
app.get("/api/manager/status", (req, res) => {
  const requested = cleanId(req.query.userId);

  res.json({
    configured: Boolean(managerId && managerPin),
    isManager: Boolean(managerId && requested === managerId),
    role: requested &&
      ((staffRoles.get(requested) || {}).role ||
        (requested === managerId ? "Manager" : "User"))
  });
});

app.get("/api/frames", (req, res) => {
  res.json({
    avatarFrames: NORMAL_AVATAR_FRAMES,
    staffFrames: STAFF_ROLE_FRAMES
  });
});

app.get("/api/frames/user/:id", (req, res) => {
  const userId = cleanId(req.params.id);
  const u = users.get(userId);
  const owned = ownedFrames.get(userId) || {};

  res.json({
    userId,
    coins: u ? u.coins : 0,
    avatarFrame: u ? u.avatarFrame || "" : "",
    avatarFrameExpiresAt: u ? Number(u.avatarFrameExpiresAt || 0) : 0,
    owned: Object.entries(owned)
      .filter(([id, until]) => Number(until) > now())
      .map(([id, until]) => ({ id, until })),
    staffFrame: staffFrames.get(userId) ||
      (managerId && userId === managerId
        ? STAFF_ROLE_FRAMES.Manager[0].id
        : "")
  });
});

app.post("/api/frames/buy", (req, res) => {
  const userId = cleanId(req.body.userId);
  const frame = NORMAL_AVATAR_FRAMES.find(
    f => f.id === cleanId(req.body.frameId)
  );
  const days = Number(req.body.days);
  const u = users.get(userId);

  if (!u) {
    return res.status(404).json({
      error: "User not registered on server yet."
    });
  }

  if (!frame) {
    return res.status(400).json({ error: "Unknown avatar frame." });
  }

  if (![7, 15, 30].includes(days)) {
    return res.status(400).json({
      error: "Choose 7, 15 or 30 days."
    });
  }

  const cost = frame.price * (days === 7 ? 1 : days === 15 ? 2 : 3);

  if (!Number.isSafeInteger(cost) || u.coins < cost) {
    return res.status(400).json({
      error: "Not enough coins for this frame."
    });
  }

  u.coins -= cost;

  const owned = ownedFrames.get(userId) || {};
  owned[frame.id] = now() + days * 86400000;
  ownedFrames.set(userId, owned);

  u.avatarFrame = frame.id;
  u.avatarFrameExpiresAt = owned[frame.id];

  audit("avatar_frame_bought", userId, {
    frameId: frame.id,
    days,
    cost
  });

  const sock = findSocketForUser(userId);

  if (sock) {
    sock.emit("wallet", {
      coins: u.coins,
      diamonds: u.diamonds
    });
  }

  res.json({
    ok: true,
    frame,
    days,
    cost,
    user: publicUser(u),
    owned: Object.entries(owned).map(([id, until]) => ({ id, until }))
  });
});

app.post("/api/frames/equip", (req, res) => {
  const userId = cleanId(req.body.userId);
  const frameId = cleanId(req.body.frameId);
  const u = users.get(userId);

  if (!u) {
    return res.status(404).json({
      error: "User not registered on server yet."
    });
  }

  if (frameId === "") {
    u.avatarFrame = "";
    u.avatarFrameExpiresAt = 0;

    return res.json({
      ok: true,
      user: publicUser(u)
    });
  }

  const owned = ownedFrames.get(userId) || {};

  if (
    !NORMAL_AVATAR_FRAMES.some(f => f.id === frameId) ||
    Number(owned[frameId] || 0) <= now()
  ) {
    return res.status(403).json({
      error: "You do not own an active frame."
    });
  }

  u.avatarFrame = frameId;
  u.avatarFrameExpiresAt = Number(owned[frameId]);

  res.json({
    ok: true,
    user: publicUser(u)
  });
});

app.get("/api/staff/:id", (req, res) => {
  const id = cleanId(req.params.id);
  const role = (staffRoles.get(id) || {}).role ||
    (managerId && id === managerId ? "Manager" : "User");

  res.json({
    userId: id,
    role,
    staffFrame: staffFrames.get(id) || "",
    avatarFrame: (users.get(id) || {}).avatarFrame || ""
  });
});

app.get("/api/manager/overview", (req, res) => {
  if (!managerAuthorized(req)) {
    return res.status(403).json({
      error: "Manager authorization required. Set PAWAN_MANAGER_ID and PAWAN_MANAGER_PIN in Render."
    });
  }

  res.json({
    users: Array.from(users.values()).slice(0, 300).map(publicUser),
    staff: staffPublic(),
    rooms: Array.from(rooms.values()).map(r => ({
      roomId: r.roomId,
      name: r.name,
      online: r.members.size,
      hostId: r.hostId
    })),
    maintenanceMode,
    announcement,
    audit: managerAuditLog.slice(-100).reverse()
  });
});

app.post("/api/manager/staff", (req, res) => {
  if (!managerAuthorized(req)) {
    return res.status(403).json({
      error: "Manager authorization required."
    });
  }

  const role = String(req.body.role || "");

  if (!STAFF_ROLE_NAMES.includes(role)) {
    return res.status(400).json({ error: "Invalid staff role." });
  }

  const requestedId = cleanId(req.body.userId);
  const userId = requestedId ||
    String(100100 + Math.floor(Math.random() * 899900));

  if (userId === managerId || staffRoles.has(userId)) {
    return res.status(409).json({ error: "ID is already assigned." });
  }

  const u = ensureStaffUser(
    userId,
    String(req.body.name || role).slice(0, 40)
  );

  staffRoles.set(userId, {
    role,
    name: u.name,
    createdAt: now(),
    createdBy: managerId
  });

  staffFrames.set(userId, STAFF_ROLE_FRAMES[role][0].id);

  audit("staff_created", managerId, { userId, role });

  res.json({
    ok: true,
    user: publicUser(u),
    staff: staffPublic()
  });
});

app.patch("/api/manager/staff/:id", (req, res) => {
  if (!managerAuthorized(req)) {
    return res.status(403).json({
      error: "Manager authorization required."
    });
  }

  const userId = cleanId(req.params.id);
  const role = String(req.body.role || "");

  if (!staffRoles.has(userId)) {
    return res.status(404).json({ error: "Staff ID not found." });
  }

  if (!STAFF_ROLE_NAMES.includes(role)) {
    return res.status(400).json({ error: "Invalid staff role." });
  }

  const old = staffRoles.get(userId);
  const oldRole = old.role;

  old.role = role;
  old.updatedAt = now();

  staffRoles.set(userId, old);
  staffFrames.set(userId, STAFF_ROLE_FRAMES[role][0].id);

  audit("staff_role_changed", managerId, {
    userId,
    from: oldRole,
    to: role
  });

  res.json({
    ok: true,
    staff: staffPublic()
  });
});

app.delete("/api/manager/staff/:id", (req, res) => {
  if (!managerAuthorized(req)) {
    return res.status(403).json({
      error: "Manager authorization required."
    });
  }

  const userId = cleanId(req.params.id);

  if (userId === managerId) {
    return res.status(400).json({
      error: "Manager role cannot be revoked here."
    });
  }

  staffRoles.delete(userId);
  staffFrames.delete(userId);

  audit("staff_revoked", managerId, { userId });

  res.json({
    ok: true,
    staff: staffPublic()
  });
});

app.patch("/api/manager/users/:id", (req, res) => {
  if (!managerAuthorized(req)) {
    return res.status(403).json({
      error: "Manager authorization required."
    });
  }

  const userId = cleanId(req.params.id);
  const u = users.get(userId);

  if (!u) {
    return res.status(404).json({
      error: "User not found. They must connect first."
    });
  }

  if (userId === managerId) {
    return res.status(400).json({
      error: "Cannot moderate Manager ID."
    });
  }

  const body = req.body || {};
  const action = String(body.action || "");

  if (action === "coins") {
    const value = Number(body.amount);

    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > 1000000000
    ) {
      return res.status(400).json({
        error: "Coins amount must be 0 to 1,000,000,000."
      });
    }

    u.coins = value;
  } else if (action === "ban") {
    moderation.set(userId, {
      ...(moderation.get(userId) || {}),
      banned: true,
      reason: String(body.reason || "Manager action").slice(0, 200)
    });
  } else if (action === "unban") {
    moderation.set(userId, {
      ...(moderation.get(userId) || {}),
      banned: false,
      reason: ""
    });
  } else if (action === "suspend") {
    const hours = Math.max(1, Math.min(8760, Number(body.hours) || 24));

    moderation.set(userId, {
      ...(moderation.get(userId) || {}),
      suspendedUntil: now() + hours * 3600000,
      reason: String(body.reason || "Manager action").slice(0, 200)
    });
  } else if (action === "vip") {
    const level = Number(body.amount);

    if (!Number.isInteger(level) || level < 0 || level > 10) {
      return res.status(400).json({
        error: "VIP must be 0-10."
      });
    }

    u.vip = level;
  } else {
    return res.status(400).json({ error: "Unknown action." });
  }

  audit("user_" + action, managerId, {
    userId,
    amount: body.amount
  });

  const target = findSocketForUser(userId);

  if (target) {
    target.emit("wallet", {
      coins: u.coins,
      diamonds: u.diamonds
    });
  }

  res.json({
    ok: true,
    user: publicUser(u)
  });
});

app.patch("/api/manager/settings", (req, res) => {
  if (!managerAuthorized(req)) {
    return res.status(403).json({
      error: "Manager authorization required."
    });
  }

  if (typeof req.body.maintenanceMode === "boolean") {
    maintenanceMode = req.body.maintenanceMode;
  }

  if (typeof req.body.announcement === "string") {
    announcement = req.body.announcement.slice(0, 500);
  }

  audit("settings_updated", managerId, {
    maintenanceMode,
    announcement
  });

  io.emit("manager:announcement", {
    maintenanceMode,
    announcement
  });

  res.json({
    ok: true,
    maintenanceMode,
    announcement
  });
});

app.get("/api/manager/settings", (req, res) => {
  res.json({
    maintenanceMode,
    announcement
  });
});

io.on("connection", socket => {
  socket.emit("server:ready", { status: "running" });

  socket.on("register-user", data => {
    data = data || {};

    const u = getUser(
      data.userId || data.userid,
      data.name,
      data.dp
    );

    if (blockedAccount(u.userId)) {
      socket.emit("account:blocked", {
        message: "This account is banned or temporarily suspended."
      });
      socket.disconnect(true);
      return;
    }

    socketUser.set(socket.id, u.userId);

    if (!userSockets.has(u.userId)) {
      userSockets.set(u.userId, new Set());
    }

    userSockets.get(u.userId).add(socket.id);

    socket.emit("registered", {
      ...publicUser(u),
      user: publicUser(u),
      wallet: u.coins,
      coins: u.coins
    });

    socket.emit("wallet", {
      coins: u.coins,
      diamonds: u.diamonds
    });
  });

  socket.on("register", data => {
    data = data || {};

    const u = getUser(
      data.userId || data.userid,
      data.name,
      data.dp
    );

    if (blockedAccount(u.userId)) {
      socket.emit("account:blocked", {
        message: "This account is banned or temporarily suspended."
      });
      socket.disconnect(true);
      return;
    }

    socketUser.set(socket.id, u.userId);

    if (!userSockets.has(u.userId)) {
      userSockets.set(u.userId, new Set());
    }

    userSockets.get(u.userId).add(socket.id);

    socket.emit("registered", {
      ...publicUser(u),
      user: publicUser(u),
      wallet: u.coins,
      coins: u.coins
    });

    socket.emit("wallet", {
      coins: u.coins,
      diamonds: u.diamonds
    });
  });

  socket.on("gift", data => {
    data = data || {};

    const authenticatedId = cleanId(socketUser.get(socket.id));
    const senderId = authenticatedId ||
      cleanId(data.senderId || data.userId || data.fromUserId);
    const receiverId = cleanId(data.receiverId || data.toUserId);

    if (!senderId || !receiverId || senderId === receiverId) {
      const error = {
        message: "Select another user to receive the gift."
      };

      socket.emit("gift:error", error);
      socket.emit("gift-error", error);
      return;
    }

    if (blockedAccount(senderId)) {
      const error = {
        message: "This account is banned or suspended."
      };

      socket.emit("gift:error", error);
      return;
    }

    const sender = getUser(
      senderId,
      data.senderName || data.fromName,
      data.senderDp || data.dp
    );

    const receiver = getUser(
      receiverId,
      data.receiverName,
      data.receiverDp || ""
    );

    const giftId = cleanId(data.giftId);
    const gift = giftCatalogById.get(giftId);

    if (!gift) {
      const error = {
        message: "Unknown gift. Please refresh the room."
      };

      socket.emit("gift:error", error);
      socket.emit("gift-error", error);
      return;
    }

    const quantity = Math.max(
      1,
      Math.min(99, Math.floor(Number(data.quantity) || 1))
    );

    const total = gift.price * quantity;

    if (!Number.isSafeInteger(total) || sender.coins < total) {
      const error = {
        message: "Not enough server-side coins."
      };

      socket.emit("gift:error", error);
      socket.emit("gift-error", error);
      return;
    }

    sender.coins -= total;

    const category = String(
      gift.category || data.category || "all"
    ).toLowerCase();

    const points = giftCategoryPoints.get(senderId) || {
      userId: senderId,
      cp: 0,
      friendship: 0,
      family: 0,
      lucky: 0,
      vip: 0,
      video: 0,
      diwali: 0,
      navratri: 0
    };

    if (
      ["cp", "friendship", "family", "lucky", "vip", "video", "diwali", "navratri"].includes(category)
    ) {
      points[category] = (points[category] || 0) + total;
    }

    giftCategoryPoints.set(senderId, points);

    if (category === "diwali" || category === "navratri" || gift.festival) {
      const prev = festivalScores.get(senderId) || {
        userId: senderId,
        name: sender.name,
        dp: sender.dp,
        coins: 0,
        firstAt: now()
      };

      prev.name = sender.name;
      prev.dp = sender.dp;
      prev.coins += total;

      festivalScores.set(senderId, prev);
    }

    const roomId = cleanId(data.roomId, "PV100");

    const event = {
      roomId,
      senderId,
      senderName: sender.name,
      senderDp: sender.dp,
      receiverId,
      receiverName: receiver.name,
      giftId: gift.id,
      giftName: gift.name,
      giftIcon: gift.icon || gift.emoji || "🎁",
      price: gift.price,
      quantity,
      total,
      category,
      festival: gift.festival ||
        (category === "diwali" ? "Diwali" :
          category === "navratri" ? "Navratri" : null),
      createdAt: now()
    };

    giftHistory.push(event);

    if (giftHistory.length > 5000) {
      giftHistory.splice(0, giftHistory.length - 5000);
    }

    io.to(roomId).emit("gift-sent", {
      ...event,
      wallet: {
        coins: sender.coins,
        diamonds: sender.diamonds
      }
    });

    io.to(roomId).emit("gift-received", event);

    const senderSocket = findSocketForUser(senderId);

    if (senderSocket) {
      senderSocket.emit("wallet", {
        coins: sender.coins,
        diamonds: sender.diamonds
      });
    }

    const receiverSocket = findSocketForUser(receiverId);

    if (receiverSocket) {
      receiverSocket.emit("gift-received", event);
    }

    io.emit("festival:leaderboard", {
      leaderboard: festivalLeaderboard()
    });

    socket.emit("gift:success", {
      ...event,
      wallet: {
        coins: sender.coins,
        diamonds: sender.diamonds
      },
      points
    });
  });

  socket.on("game:open", data => joinGame(socket, data || {}));
  socket.on("game-start", data => joinGame(socket, data || {}));
  socket.on("game:join", data => handleBet(socket, data || {}));

  socket.on("join-room", data => {
    data = data || {};

    const roomId = cleanId(data.roomId || data.room, "main");
    const u = getUser(
      data.userId || socketUser.get(socket.id),
      data.name,
      data.dp
    );

    if (blockedAccount(u.userId)) {
      socket.emit("account:blocked", {
        message: "This account is banned or temporarily suspended."
      });
      socket.disconnect(true);
      return;
    }

    socketUser.set(socket.id, u.userId);

    if (!userSockets.has(u.userId)) {
      userSockets.set(u.userId, new Set());
    }

    userSockets.get(u.userId).add(socket.id);

    const room = getRoom(roomId);
    socket.join(roomId);

    room.members.set(u.userId, {
      userId: u.userId,
      name: u.name,
      dp: u.dp
    });

    socket.emit("room:joined", {
      roomId,
      members: Array.from(room.members.values()),
      seats: room.seats
    });

    socket.to(roomId).emit(
      "room:users",
      Array.from(room.members.values())
    );
  });

  socket.on("room:chat", data => {
    data = data || {};

    const roomId = cleanId(data.roomId || data.room, "main");
    const u = getUser(
      data.userId || socketUser.get(socket.id),
      data.name,
      data.dp
    );

    if (blockedAccount(u.userId)) {
      socket.emit("account:blocked", {
        message: "This account is banned or temporarily suspended."
      });
      return;
    }

    const message = String(data.message || data.text || "").slice(0, 500);
    if (!message.trim()) return;

    const payload = {
      roomId,
      userId: u.userId,
      name: u.name,
      dp: u.dp,
      message,
      text: message,
      createdAt: now()
    };

    getRoom(roomId).chat.push(payload);
    getRoom(roomId).chat = getRoom(roomId).chat.slice(-100);

    io.to(roomId).emit("room:chat", payload);
  });

  socket.on("disconnect", () => {
    const userId = socketUser.get(socket.id);
    socketUser.delete(socket.id);

    if (userId && userSockets.has(userId)) {
      userSockets.get(userId).delete(socket.id);

      if (!userSockets.get(userId).size) {
        userSockets.delete(userId);
      }
    }

    for (const room of rooms.values()) {
      if (userId) room.members.delete(userId);
    }

    for (const [key, state] of gameStates) {
      if (userId && state.players.has(userId)) {
        // Bets stay in the round until settlement.
        emitGameState(state.roomId, state.gameId);
      }
    }
  });
});

setInterval(() => {
  const cutoff = now() - 24 * 60 * 60 * 1000;

  for (const [id, room] of rooms) {
    if (
      id !== "PV100" &&
      room.members.size === 0 &&
      room.createdAt < cutoff
    ) {
      rooms.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`PawanVoice server running on port ${PORT}`);
});
