"use strict";

/*
===========================================================
 PAWANVOICE — COMPLETE VOICE ROOM + FESTIVAL + SOCIAL SERVER
===========================================================

 FEATURES
 1. Express + Socket.IO
 2. Voice rooms and 9 seats
 3. Room chat and user registration
 4. Gift catalog and server-side coin deduction
 5. Diwali + Navratri events and leaderboard
 6. Festival winner rewards
 7. CP requests, accept/reject, gifts and rankings
 8. Family creation, join, leave, gifts and rankings
 9. Friendship, VIP, Lucky and Video gift points
10. Daily / Weekly / Monthly Rich King
11. Greedy Baby, Animal Party and Lucky Spin
12. Game betting and server-side payout
13. Wallet, EXP, levels and ranking APIs

 IMPORTANT:
 This server stores data in memory.
 Use a persistent database for production.
===========================================================
*/

const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE"]
  },
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

const socketUser = new Map();
const userSockets = new Map();

const giftHistory = [];
const giftCategoryPoints = new Map();

const festivalScores = new Map();

const cpRequests = new Map();
const cpPairs = new Map();
const cpHistory = [];

const families = new Map();
const familyMembers = new Map();
const familyHistory = [];

const richKingHistory = [];

const now = () => Date.now();

/* =========================================================
   COMMON HELPERS
========================================================= */

function cleanId(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 100);
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function makeId(prefix) {
  return prefix + "_" + crypto.randomBytes(6).toString("hex");
}

function emitError(socket, event, message) {
  socket.emit(event, { ok: false, message });
}

function findSocketForUser(userId) {
  const ids = userSockets.get(String(userId));

  if (!ids || !ids.size) return null;

  for (const id of ids) {
    const socket = io.sockets.sockets.get(id);
    if (socket) return socket;
  }

  return null;
}

function emitWallet(userId) {
  const user = users.get(String(userId));
  if (!user) return;

  const ids = userSockets.get(String(userId));
  if (!ids) return;

  for (const id of ids) {
    const socket = io.sockets.sockets.get(id);

    if (socket) {
      socket.emit("wallet", {
        coins: user.coins,
        diamonds: user.diamonds
      });
    }
  }
}

function publicUser(user) {
  return {
    userId: user.userId,
    name: user.name,
    dp: user.dp,
    gender: user.gender,
    coins: user.coins,
    diamonds: user.diamonds,
    level: user.level,
    exp: user.exp,
    vip: user.vip,
    cpId: user.cpId || null,
    familyId: user.familyId || null,
    topAvatarFrameUntil: user.topAvatarFrameUntil || 0,
    topEntryUntil: user.topEntryUntil || 0,
    vip10Until: user.vip10Until || 0,
    videoGiftCustomization: Boolean(user.videoGiftCustomization)
  };
}

function getUser(userId, name = "Guest", dp = "") {
  userId = cleanId(userId, "guest");

  if (!users.has(userId)) {
    users.set(userId, {
      userId,
      name: String(name || "Guest").slice(0, 40),
      dp: String(dp || "").slice(0, 1000),
      gender: "Unknown",
      coins: 1000000,
      diamonds: 0,
      level: 1,
      exp: 0,
      vip: 0,
      cpId: null,
      familyId: null,
      createdAt: now()
    });
  }

  const user = users.get(userId);

  if (name) user.name = String(name).slice(0, 40);
  if (dp) user.dp = String(dp).slice(0, 1000);

  return user;
}

function addExp(user, amount) {
  user.exp = Math.max(0, user.exp + Math.max(0, Math.floor(amount)));
  user.level = Math.max(1, Math.floor(user.exp / 1000) + 1);
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
        dp: "",
        muted: false
      })),
      chat: []
    });
  }

  return rooms.get(roomId);
}

function roomPublic(room) {
  return {
    roomId: room.roomId,
    name: room.name,
    dp: room.dp,
    hostId: room.hostId,
    hostName: room.hostName,
    category: room.category,
    online: room.members.size,
    createdAt: room.createdAt,
    members: Array.from(room.members.values()),
    seats: room.seats
  };
}

/* =========================================================
   FESTIVAL GIFTS
========================================================= */

const FESTIVAL_GIFTS = [
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

const EXTRA_GIFTS = [
  { id: "cp_heart", name: "CP Heart", icon: "💗", price: 5000, category: "cp" },
  { id: "cp_ring", name: "Couple Ring", icon: "💍", price: 25000, category: "cp" },
  { id: "cp_love_boat", name: "Love Boat", icon: "💘", price: 100000, category: "cp" },
  { id: "cp_forever", name: "Forever Love", icon: "💕", price: 500000, category: "cp" },

  { id: "friend_star", name: "Best Friend Star", icon: "🌟", price: 1000, category: "friendship" },
  { id: "friend_handshake", name: "Friendship Bond", icon: "🤝", price: 10000, category: "friendship" },
  { id: "friend_cake", name: "Friendship Cake", icon: "🎂", price: 50000, category: "friendship" },
  { id: "friend_galaxy", name: "Friendship Galaxy", icon: "🌌", price: 250000, category: "friendship" },

  { id: "family_home", name: "Family Home", icon: "🏡", price: 5000, category: "family" },
  { id: "family_tree", name: "Family Tree", icon: "🌳", price: 25000, category: "family" },
  { id: "family_feast", name: "Family Feast", icon: "🍱", price: 100000, category: "family" },
  { id: "family_castle", name: "Family Castle", icon: "🏰", price: 500000, category: "family" },

  { id: "lucky_clover", name: "Lucky Clover", icon: "🍀", price: 1000, category: "lucky" },
  { id: "lucky_dice", name: "Lucky Dice", icon: "🎲", price: 10000, category: "lucky" },
  { id: "lucky_chest", name: "Lucky Chest", icon: "🧰", price: 50000, category: "lucky" },
  { id: "lucky_jackpot", name: "Lucky Jackpot", icon: "🎰", price: 250000, category: "lucky" },

  { id: "vip_crown", name: "VIP Crown", icon: "👑", price: 100000, category: "vip" },
  { id: "vip_royal_car", name: "Royal Car", icon: "🏎️", price: 500000, category: "vip" },
  { id: "vip_jet", name: "VIP Private Jet", icon: "🛩️", price: 2500000, category: "vip" },
  { id: "vip_galaxy", name: "VIP Galaxy", icon: "🌌", price: 5000000, category: "vip" },

  { id: "video_rose", name: "Video Rose", icon: "🌹", price: 10000, category: "video" },
  { id: "video_dance", name: "Video Dance", icon: "💃", price: 50000, category: "video" },
  { id: "video_fireworks", name: "Video Fireworks", icon: "🎆", price: 250000, category: "video" },
  { id: "video_custom", name: "Custom Video Gift", icon: "🎬", price: 1000000, category: "video" }
];

const NORMAL_GIFTS = Array.from({ length: 200 }, (_, index) => {
  const n = index + 1;
  const price = n <= 20 ? n * 10 :
    n <= 50 ? n * 50 :
    n <= 100 ? n * 100 :
    n * 500;

  return {
    id: "gift" + n,
    name: "Gift " + n,
    icon: "🎁",
    price,
    category: "all"
  };
});

const ALL_GIFT_CATALOG = [
  ...FESTIVAL_GIFTS,
  ...EXTRA_GIFTS,
  ...NORMAL_GIFTS
];

const giftCatalogById = new Map(
  ALL_GIFT_CATALOG.map(gift => [gift.id, gift])
);

/* =========================================================
   FESTIVAL LEADERBOARD AND REWARDS
========================================================= */

const festivalStartedAt = now();
const FESTIVAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

let festivalWinner = null;
let festivalWinnerBannerUntil = 0;
let festivalRewardIssued = false;

function festivalLeaderboard() {
  return Array.from(festivalScores.values())
    .sort((a, b) => b.coins - a.coins || a.firstAt - b.firstAt)
    .slice(0, 50)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function publicFestivalState() {
  return {
    title: "DIWALI + NAVRATRI SPECIAL",
    gifts: FESTIVAL_GIFTS,
    startedAt: festivalStartedAt,
    endsAt: festivalStartedAt + FESTIVAL_DURATION_MS,
    active: now() < festivalStartedAt + FESTIVAL_DURATION_MS &&
      !festivalRewardIssued,
    leaderboard: festivalLeaderboard(),
    winner: festivalWinner && now() < festivalWinnerBannerUntil
      ? festivalWinner
      : null
  };
}

function settleFestivalIfDue() {
  if (festivalRewardIssued || now() < festivalStartedAt + FESTIVAL_DURATION_MS) {
    return;
  }

  festivalRewardIssued = true;

  const winner = festivalLeaderboard()[0];
  if (!winner) return;

  const user = getUser(winner.userId, winner.name, winner.dp);

  user.coins += 10000000;
  user.topAvatarFrameUntil = now() + 30 * 86400000;
  user.topEntryUntil = now() + 15 * 86400000;
  user.vip = 10;
  user.vip10Until = now() + 15 * 86400000;
  user.videoGiftCustomization = true;

  festivalWinner = {
    userId: user.userId,
    name: user.name,
    dp: user.dp,
    festivalCoins: winner.coins,
    awardedAt: now()
  };

  festivalWinnerBannerUntil = now() + 7 * 86400000;

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

  emitWallet(user.userId);
}

setInterval(settleFestivalIfDue, 15000).unref();

/* =========================================================
   GIFT POINTS AND RICH KING
========================================================= */

function getPoints(userId) {
  if (!giftCategoryPoints.has(userId)) {
    giftCategoryPoints.set(userId, {
      userId,
      cp: 0,
      friendship: 0,
      family: 0,
      lucky: 0,
      vip: 0,
      video: 0,
      diwali: 0,
      navratri: 0,
      all: 0
    });
  }

  return giftCategoryPoints.get(userId);
}

function richKingLeaderboard(type = "daily") {
  const duration = type === "weekly" ? 7 * 86400000 :
    type === "monthly" ? 30 * 86400000 :
    86400000;

  const cutoff = now() - duration;
  const totals = new Map();

  for (const row of richKingHistory) {
    if (row.createdAt < cutoff) continue;

    const old = totals.get(row.senderId) || {
      userId: row.senderId,
      name: row.senderName,
      dp: row.senderDp,
      coins: 0
    };

    old.coins += row.total;
    old.name = row.senderName;
    old.dp = row.senderDp;

    totals.set(row.senderId, old);
  }

  return Array.from(totals.values())
    .sort((a, b) => b.coins - a.coins)
    .slice(0, 100)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

/* =========================================================
   CP SYSTEM
========================================================= */

function getCpPair(userId) {
  const partnerId = cpPairs.get(String(userId));
  if (!partnerId) return null;

  const user = users.get(String(userId));
  const partner = users.get(String(partnerId));

  if (!user || !partner) return null;

  return {
    userId: user.userId,
    name: user.name,
    dp: user.dp,
    partnerId: partner.userId,
    partnerName: partner.name,
    partnerDp: partner.dp,
    points: cpPairPoints(userId, partnerId)
  };
}

function cpPairPoints(a, b) {
  return cpHistory
    .filter(row =>
      (row.senderId === a && row.receiverId === b) ||
      (row.senderId === b && row.receiverId === a)
    )
    .reduce((sum, row) => sum + row.total, 0);
}

function cpLeaderboard() {
  const pairs = new Map();

  for (const row of cpHistory) {
    const ids = [row.senderId, row.receiverId].sort();
    const key = ids.join(":");

    const entry = pairs.get(key) || {
      user1: ids[0],
      user2: ids[1],
      points: 0
    };

    entry.points += row.total;
    pairs.set(key, entry);
  }

  return Array.from(pairs.values())
    .map(entry => {
      const a = users.get(entry.user1);
      const b = users.get(entry.user2);

      return {
        ...entry,
        user1Name: a ? a.name : entry.user1,
        user1Dp: a ? a.dp : "",
        user2Name: b ? b.name : entry.user2,
        user2Dp: b ? b.dp : ""
      };
    })
    .sort((a, b) => b.points - a.points)
    .slice(0, 100)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function sendCpRequest(socket, data) {
  const senderId = cleanId(socketUser.get(socket.id));
  const receiverId = cleanId(data.receiverId || data.toUserId);

  if (!senderId || !receiverId || senderId === receiverId) {
    return emitError(socket, "cp:error", "Invalid CP request.");
  }

  const sender = getUser(senderId);
  const receiver = getUser(receiverId);

  if (cpPairs.has(senderId) || cpPairs.has(receiverId)) {
    return emitError(socket, "cp:error", "One user is already in a CP pair.");
  }

  const existing = Array.from(cpRequests.values()).find(request =>
    request.senderId === senderId &&
    request.receiverId === receiverId &&
    request.status === "pending"
  );

  if (existing) {
    return emitError(socket, "cp:error", "CP request already sent.");
  }

  const request = {
    id: makeId("cp"),
    senderId,
    senderName: sender.name,
    senderDp: sender.dp,
    receiverId,
    receiverName: receiver.name,
    receiverDp: receiver.dp,
    status: "pending",
    createdAt: now()
  };

  cpRequests.set(request.id, request);

  const target = findSocketForUser(receiverId);
  if (target) target.emit("cp:request-received", request);

  socket.emit("cp:request-sent", request);
}

function respondCpRequest(socket, data) {
  const userId = cleanId(socketUser.get(socket.id));
  const requestId = cleanId(data.requestId || data.id);
  const request = cpRequests.get(requestId);

  if (!request || request.receiverId !== userId || request.status !== "pending") {
    return emitError(socket, "cp:error", "CP request not found.");
  }

  const accept = data.accept === true || data.action === "accept";

  request.status = accept ? "accepted" : "rejected";
  request.respondedAt = now();

  if (accept) {
    if (cpPairs.has(request.senderId) || cpPairs.has(request.receiverId)) {
      request.status = "rejected";
      return emitError(socket, "cp:error", "A user already has a CP partner.");
    }

    cpPairs.set(request.senderId, request.receiverId);
    cpPairs.set(request.receiverId, request.senderId);

    getUser(request.senderId).cpId = request.receiverId;
    getUser(request.receiverId).cpId = request.senderId;
  }

  const result = {
    request,
    cp: accept ? getCpPair(request.senderId) : null
  };

  const senderSocket = findSocketForUser(request.senderId);
  if (senderSocket) senderSocket.emit("cp:request-result", result);

  socket.emit("cp:request-result", result);

  io.emit("cp:ranking", cpLeaderboard());
}

function breakCp(socket, data = {}) {
  const userId = cleanId(socketUser.get(socket.id));
  const partnerId = cpPairs.get(userId);

  if (!partnerId) {
    return emitError(socket, "cp:error", "You do not have a CP partner.");
  }

  cpPairs.delete(userId);
  cpPairs.delete(partnerId);

  const user = users.get(userId);
  const partner = users.get(partnerId);

  if (user) user.cpId = null;
  if (partner) partner.cpId = null;

  const event = {
    userId,
    partnerId,
    createdAt: now()
  };

  io.emit("cp:broken", event);
}

/* =========================================================
   FAMILY SYSTEM
========================================================= */

function getFamily(familyId) {
  return families.get(String(familyId)) || null;
}

function publicFamily(family) {
  if (!family) return null;

  return {
    id: family.id,
    name: family.name,
    icon: family.icon,
    ownerId: family.ownerId,
    ownerName: family.ownerName,
    description: family.description,
    createdAt: family.createdAt,
    points: family.points,
    memberCount: family.members.size,
    members: Array.from(family.members.values())
  };
}

function familyLeaderboard() {
  return Array.from(families.values())
    .sort((a, b) => b.points - a.points)
    .slice(0, 100)
    .map((family, index) => ({
      rank: index + 1,
      id: family.id,
      name: family.name,
      icon: family.icon,
      ownerId: family.ownerId,
      ownerName: family.ownerName,
      points: family.points,
      memberCount: family.members.size
    }));
}

function createFamily(socket, data) {
  const userId = cleanId(socketUser.get(socket.id));
  const user = users.get(userId);

  if (!user) {
    return emitError(socket, "family:error", "Register your account first.");
  }

  if (user.familyId) {
    return emitError(socket, "family:error", "Leave your current family first.");
  }

  const name = String(data.name || "").trim().slice(0, 32);

  if (name.length < 2) {
    return emitError(socket, "family:error", "Family name must have at least 2 characters.");
  }

  const family = {
    id: makeId("family"),
    name,
    icon: String(data.icon || "🏡").slice(0, 20),
    ownerId: userId,
    ownerName: user.name,
    description: String(data.description || "").slice(0, 200),
    createdAt: now(),
    points: 0,
    members: new Map()
  };

  family.members.set(userId, {
    userId,
    name: user.name,
    dp: user.dp,
    role: "owner",
    joinedAt: now()
  });

  families.set(family.id, family);
  familyMembers.set(userId, family.id);
  user.familyId = family.id;

  const result = publicFamily(family);

  socket.emit("family:created", result);
  io.emit("family:ranking", familyLeaderboard());
}

function joinFamily(socket, data) {
  const userId = cleanId(socketUser.get(socket.id));
  const user = users.get(userId);
  const familyId = cleanId(data.familyId || data.id);
  const family = getFamily(familyId);

  if (!user || !family) {
    return emitError(socket, "family:error", "User or family not found.");
  }

  if (user.familyId) {
    return emitError(socket, "family:error", "Leave your current family first.");
  }

  if (family.members.size >= 100) {
    return emitError(socket, "family:error", "Family is full.");
  }

  family.members.set(userId, {
    userId,
    name: user.name,
    dp: user.dp,
    role: "member",
    joinedAt: now()
  });

  familyMembers.set(userId, familyId);
  user.familyId = familyId;

  const event = publicFamily(family);

  io.emit("family:updated", event);
  io.emit("family:ranking", familyLeaderboard());
}

function leaveFamily(socket) {
  const userId = cleanId(socketUser.get(socket.id));
  const user = users.get(userId);

  if (!user || !user.familyId) {
    return emitError(socket, "family:error", "You are not in a family.");
  }

  const family = families.get(user.familyId);

  if (!family) {
    user.familyId = null;
    familyMembers.delete(userId);
    return;
  }

  if (family.ownerId === userId && family.members.size > 1) {
    return emitError(socket, "family:error", "Owner must transfer ownership before leaving.");
  }

  family.members.delete(userId);
  familyMembers.delete(userId);
  user.familyId = null;

  if (family.members.size === 0) {
    families.delete(family.id);
  }

  io.emit("family:updated", publicFamily(family));
  io.emit("family:ranking", familyLeaderboard());
}

/* =========================================================
   GAME CONFIGURATION
========================================================= */

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

function gameKey(roomId, gameId) {
  return `${roomId}:${gameId}`;
}

function randomItem(config) {
  return config.items[crypto.randomInt(0, config.items.length)];
}

function makeGameState(roomId, gameId) {
  const config = GAME_CONFIG[gameId];
  const previous = gameStates.get(gameKey(roomId, gameId));

  return {
    roomId,
    gameId,
    name: config.name,
    active: true,
    status: "running",
    roundId: makeId("round"),
    roundNumber: previous ? previous.roundNumber + 1 : 1,
    startedAt: now(),
    endAt: now() + config.duration * 1000,
    duration: config.duration,
    items: config.items.map(item => ({
      ...item,
      multiplier: `${item.multiplier}x`
    })),
    players: new Map(),
    result: null
  };
}

function publicGameState(state) {
  return {
    roomId: state.roomId,
    gameId: state.gameId,
    name: state.name,
    active: state.active,
    status: state.status,
    roundId: state.roundId,
    roundNumber: state.roundNumber,
    startedAt: state.startedAt,
    endAt: state.endAt,
    endsAt: state.endAt,
    duration: state.duration,
    items: state.items,
    playerCount: state.players.size,
    players: Array.from(state.players.values()).map(player => ({
      userId: player.userId,
      name: player.name,
      dp: player.dp
    })),
    result: state.result
  };
}

function emitGameState(roomId, gameId) {
  const state = gameStates.get(gameKey(roomId, gameId));
  if (!state) return;

  const payload = publicGameState(state);
  const key = gameKey(roomId, gameId);

  io.to(key).emit("game:state", payload);
  io.to(key).emit("game:opened", payload);
  io.to(key).emit("game:players", {
    roomId,
    gameId,
    count: state.players.size,
    playerCount: state.players.size,
    players: payload.players
  });
}

function startGame(roomId, gameId) {
  const key = gameKey(roomId, gameId);
  const current = gameStates.get(key);

  if (current && current.status === "running" && current.endAt > now()) {
    return current;
  }

  const state = makeGameState(roomId, gameId);
  gameStates.set(key, state);

  if (gameTimers.has(key)) clearTimeout(gameTimers.get(key));

  emitGameState(roomId, gameId);

  gameTimers.set(key, setTimeout(() => {
    finishGame(roomId, gameId);
  }, state.duration * 1000));

  return state;
}

function finishGame(roomId, gameId) {
  const key = gameKey(roomId, gameId);
  const state = gameStates.get(key);
  const config = GAME_CONFIG[gameId];

  if (!state || !config || state.status !== "running") return;

  state.status = "finished";
  state.active = false;
  state.endAt = now();

  const winning = randomItem(config);
  const winners = [];
  const results = [];

  for (const player of state.players.values()) {
    let payout = 0;

    for (const bet of player.bets) {
      if (bet.itemId === winning.id) {
        const item = config.items.find(row => row.id === winning.id);
        payout += Math.floor(bet.amount * item.multiplier);
      }
    }

    const user = users.get(player.userId);

    if (user && payout > 0) {
      user.coins += payout;
      addExp(user, Math.max(1, Math.floor(payout / 10000)));

      winners.push({
        userId: user.userId,
        name: user.name,
        payout,
        coins: user.coins
      });
    }

    results.push({
      userId: player.userId,
      name: player.name,
      payout,
      coins: user ? user.coins : 0
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

  io.to(key).emit("game:result", {
    ...state.result,
    result: state.result
  });

  emitGameState(roomId, gameId);

  recentResults.set(
    key,
    [state.result, ...(recentResults.get(key) || [])].slice(0, 20)
  );

  for (const player of state.players.values()) {
    emitWallet(player.userId);
  }

  gameTimers.set(key, setTimeout(() => {
    startGame(roomId, gameId);
  }, 4000));
}

function joinGame(socket, data) {
  const roomId = cleanId(data.roomId, "PV100");
  const gameId = cleanId(data.gameId || data.game, "greedy");
  const config = GAME_CONFIG[gameId];

  if (!config) {
    return emitError(socket, "game:error", "Unknown game.");
  }

  const user = getUser(
    socketUser.get(socket.id) || data.userId,
    data.name,
    data.dp
  );

  socketUser.set(socket.id, user.userId);
  socket.join(gameKey(roomId, gameId));

  let state = gameStates.get(gameKey(roomId, gameId));

  if (!state || state.status !== "running" || state.endAt <= now()) {
    state = startGame(roomId, gameId);
  }

  if (!state.players.has(user.userId)) {
    state.players.set(user.userId, {
      userId: user.userId,
      name: user.name,
      dp: user.dp,
      bets: []
    });
  }

  emitGameState(roomId, gameId);
  socket.emit("game:open", publicGameState(state));
}

function handleBet(socket, data) {
  const roomId = cleanId(data.roomId, "PV100");
  const gameId = cleanId(data.gameId || data.game, "greedy");
  const config = GAME_CONFIG[gameId];

  if (!config) {
    return emitError(socket, "game:error", "Unknown game.");
  }

  const userId = cleanId(socketUser.get(socket.id));

  if (!userId) {
    return emitError(socket, "game:error", "Register before betting.");
  }

  const user = getUser(userId);
  const key = gameKey(roomId, gameId);
  const state = gameStates.get(key);

  if (!state || state.status !== "running" || state.endAt <= now()) {
    return emitError(socket, "game:error", "Betting is closed.");
  }

  const bets = Array.isArray(data.bets) ? data.bets : [];

  if (!bets.length || bets.length > 8) {
    return emitError(socket, "game:error", "Choose 1–8 items.");
  }

  let total = 0;
  const validated = [];

  for (const bet of bets) {
    const itemId = cleanId(bet.itemId || bet.id);
    const amount = Number(bet.amount);

    if (!config.items.some(item => item.id === itemId)) {
      return emitError(socket, "game:error", "Invalid game item.");
    }

    if (![100000, 200000, 500000].includes(amount)) {
      return emitError(socket, "game:error", "Invalid bet amount.");
    }

    total += amount;
    validated.push({ itemId, amount });
  }

  const player = state.players.get(userId) || {
    userId,
    name: user.name,
    dp: user.dp,
    bets: []
  };

  if (player.bets.length + validated.length > 8) {
    return emitError(socket, "game:error", "Maximum 8 bets per round.");
  }

  if (total > user.coins) {
    return emitError(socket, "game:error", "Not enough coins.");
  }

  user.coins -= total;

  player.name = user.name;
  player.dp = user.dp;
  player.bets.push(...validated);

  state.players.set(userId, player);

  socket.emit("game:joined", {
    ok: true,
    roomId,
    gameId,
    roundId: state.roundId,
    roundNumber: state.roundNumber,
    userId,
    amount: total,
    coins: user.coins,
    wallet: user.coins
  });

  emitWallet(userId);
  emitGameState(roomId, gameId);
}

/* =========================================================
   HTTP ROUTES
========================================================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"), err => {
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

app.get("/health", (req, res) => {
  res.json({
    app: "PawanVoice Room Server",
    status: "running",
    socketIO: true,
    seats: 9,
    rooms: rooms.size,
    users: users.size,
    games: gameStates.size,
    families: families.size,
    cpPairs: cpPairs.size / 2
  });
});

app.get("/api/festival", (req, res) => {
  settleFestivalIfDue();
  res.json(publicFestivalState());
});

app.get("/api/festival/gifts", (req, res) => {
  res.json(FESTIVAL_GIFTS);
});

app.get("/api/festival/leaderboard", (req, res) => {
  res.json({
    leaderboard: festivalLeaderboard(),
    winner: festivalWinner && now() < festivalWinnerBannerUntil
      ? festivalWinner
      : null
  });
});

app.get("/api/gifts/catalog", (req, res) => {
  res.json(ALL_GIFT_CATALOG);
});

app.get("/api/gifts/history", (req, res) => {
  const userId = cleanId(req.query.userId);
  const roomId = cleanId(req.query.roomId);

  let rows = giftHistory.slice();

  if (userId) {
    rows = rows.filter(row =>
      row.senderId === userId || row.receiverId === userId
    );
  }

  if (roomId) {
    rows = rows.filter(row => row.roomId === roomId);
  }

  res.json({ history: rows.slice(-200).reverse() });
});

app.get("/api/gifts/points/:userId", (req, res) => {
  const userId = cleanId(req.params.userId);
  res.json(getPoints(userId));
});

app.get("/api/richking/:type", (req, res) => {
  const type = ["daily", "weekly", "monthly"].includes(req.params.type)
    ? req.params.type
    : "daily";

  res.json({
    type,
    leaderboard: richKingLeaderboard(type)
  });
});

app.get("/api/ranking/:type", (req, res) => {
  const type = cleanId(req.params.type, "coins").toLowerCase();

  if (["daily", "weekly", "monthly", "richking"].includes(type)) {
    const period = type === "richking" ? "daily" : type;

    return res.json({
      type: period,
      leaderboard: richKingLeaderboard(period)
    });
  }

  res.json(
    Array.from(users.values())
      .sort((a, b) => b.coins - a.coins)
      .slice(0, 100)
      .map(publicUser)
  );
});

app.get("/api/ranking", (req, res) => {
  res.json(
    Array.from(users.values())
      .sort((a, b) => b.coins - a.coins)
      .slice(0, 100)
      .map(publicUser)
  );
});

app.get("/api/users/:id", (req, res) => {
  const user = users.get(cleanId(req.params.id));

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json(publicUser(user));
});

app.get("/api/rooms", (req, res) => {
  res.json(Array.from(rooms.values()).map(roomPublic));
});

app.get("/api/games", (req, res) => {
  res.json(
    Object.entries(GAME_CONFIG).map(([id, config]) => ({
      id,
      name: config.name,
      duration: config.duration,
      items: config.items
    }))
  );
});

app.get("/api/games/:gameId/results", (req, res) => {
  const gameId = cleanId(req.params.gameId);
  const roomId = cleanId(req.query.roomId, "PV100");

  res.json({
    results: recentResults.get(gameKey(roomId, gameId)) || []
  });
});

/* ---------------- CP API ---------------- */

app.get("/api/cp", (req, res) => {
  const userId = cleanId(req.query.userId);

  if (!userId) {
    return res.json({
      cp: null,
      requests: Array.from(cpRequests.values()).filter(
        request => request.status === "pending"
      ),
      leaderboard: cpLeaderboard()
    });
  }

  const requests = Array.from(cpRequests.values()).filter(request =>
    request.senderId === userId || request.receiverId === userId
  );

  res.json({
    cp: getCpPair(userId),
    requests,
    leaderboard: cpLeaderboard()
  });
});

app.get("/api/cp/leaderboard", (req, res) => {
  res.json({ leaderboard: cpLeaderboard() });
});

/* ---------------- FAMILY API ---------------- */

app.get("/api/family", (req, res) => {
  const userId = cleanId(req.query.userId);
  const familyId = cleanId(req.query.familyId);

  if (familyId) {
    const family = getFamily(familyId);
    return res.json({
      family: publicFamily(family),
      members: family ? Array.from(family.members.values()) : []
    });
  }

  if (userId) {
    const user = users.get(userId);
    const family = user && user.familyId
      ? getFamily(user.familyId)
      : null;

    return res.json({
      family: publicFamily(family),
      members: family ? Array.from(family.members.values()) : []
    });
  }

  res.json({
    families: Array.from(families.values()).map(publicFamily),
    leaderboard: familyLeaderboard()
  });
});

app.get("/api/family/leaderboard", (req, res) => {
  res.json({ leaderboard: familyLeaderboard() });
});

app.get("/api/events", (req, res) => {
  res.json([
    { title: "🪔 Diwali Special", description: "Send Diwali gifts and climb the festival leaderboard." },
    { title: "💃 Navratri Special", description: "Send Navratri gifts and collect festival points." },
    { title: "💗 CP Space", description: "Send CP requests, accept a partner and build CP points." },
    { title: "🏡 Family", description: "Create a family, join members and collect family gift points." },
    { title: "👑 Daily Rich King", description: "Top gifters of the last 24 hours." },
    { title: "👑 Weekly Rich King", description: "Top gifters of the last 7 days." },
    { title: "👑 Monthly Rich King", description: "Top gifters of the last 30 days." }
  ]);
});

/* =========================================================
   SOCKET.IO
========================================================= */

io.on("connection", socket => {
  socket.emit("server:ready", { status: "running" });

  /* ---------------- REGISTER ---------------- */

  function registerUser(data) {
    data = data || {};

    const user = getUser(
      data.userId || data.userid,
      data.name,
      data.dp
    );

    if (data.gender) {
      user.gender = String(data.gender).slice(0, 20);
    }

    socketUser.set(socket.id, user.userId);

    if (!userSockets.has(user.userId)) {
      userSockets.set(user.userId, new Set());
    }

    userSockets.get(user.userId).add(socket.id);

    socket.emit("registered", {
      ...publicUser(user),
      user: publicUser(user),
      wallet: user.coins,
      coins: user.coins
    });

    emitWallet(user.userId);
  }

  socket.on("register-user", registerUser);
  socket.on("register", registerUser);

  /* ---------------- GIFT SENDING ---------------- */

  socket.on("gift", data => {
    data = data || {};

    const senderId = cleanId(socketUser.get(socket.id));
    const receiverId = cleanId(data.receiverId || data.toUserId);

    if (!senderId || !receiverId || senderId === receiverId) {
      return emitError(socket, "gift:error", "Select another user to receive the gift.");
    }

    const sender = users.get(senderId);
    const receiver = getUser(
      receiverId,
      data.receiverName,
      data.receiverDp
    );

    if (!sender) {
      return emitError(socket, "gift:error", "Sender account not found.");
    }

    const gift = giftCatalogById.get(cleanId(data.giftId));

    if (!gift) {
      return emitError(socket, "gift:error", "Unknown gift. Refresh the gift catalog.");
    }

    const quantity = Math.max(
      1,
      Math.min(99, Math.floor(safeNumber(data.quantity, 1)))
    );

    const total = gift.price * quantity;

    if (!Number.isSafeInteger(total) || total <= 0 || sender.coins < total) {
      return emitError(socket, "gift:error", "Not enough coins.");
    }

    sender.coins -= total;

    const category = String(gift.category || "all").toLowerCase();
    const points = getPoints(senderId);

    points.all += total;

    if (Object.prototype.hasOwnProperty.call(points, category)) {
      points[category] += total;
    }

    const timestamp = now();

    const event = {
      roomId: cleanId(data.roomId, "PV100"),
      senderId,
      senderName: sender.name,
      senderDp: sender.dp,
      receiverId,
      receiverName: receiver.name,
      receiverDp: receiver.dp,
      giftId: gift.id,
      giftName: gift.name,
      giftIcon: gift.icon || "🎁",
      price: gift.price,
      quantity,
      total,
      category,
      festival: gift.festival || null,
      createdAt: timestamp
    };

    giftHistory.push(event);

    if (giftHistory.length > 5000) {
      giftHistory.splice(0, giftHistory.length - 5000);
    }

    richKingHistory.push({
      senderId,
      senderName: sender.name,
      senderDp: sender.dp,
      receiverId,
      total,
      createdAt: timestamp
    });

    if (richKingHistory.length > 20000) {
      richKingHistory.splice(0, richKingHistory.length - 20000);
    }

    /* Festival score only for festival gifts */

    if (category === "diwali" || category === "navratri") {
      const score = festivalScores.get(senderId) || {
        userId: senderId,
        name: sender.name,
        dp: sender.dp,
        coins: 0,
        firstAt: timestamp
      };

      score.name = sender.name;
      score.dp = sender.dp;
      score.coins += total;

      festivalScores.set(senderId, score);
    }

    /* CP gift points are awarded only to the actual pair */

    if (category === "cp") {
      const partnerId = cpPairs.get(senderId);

      if (partnerId && partnerId === receiverId) {
        cpHistory.push(event);
      }
    }

    /* Family points require sender and receiver to share a family */

    if (category === "family") {
      const senderFamilyId = sender.familyId;
      const receiverFamilyId = receiver.familyId;

      if (senderFamilyId && senderFamilyId === receiverFamilyId) {
        const family = families.get(senderFamilyId);

        if (family) {
          family.points += total;
          familyHistory.push(event);
        }
      }
    }

    io.to(event.roomId).emit("gift-sent", {
      ...event,
      wallet: {
        coins: sender.coins,
        diamonds: sender.diamonds
      }
    });

    io.to(event.roomId).emit("gift-received", event);

    const receiverSocket = findSocketForUser(receiverId);

    if (receiverSocket) {
      receiverSocket.emit("gift-received", event);
    }

    emitWallet(senderId);

    socket.emit("gift:success", {
      ...event,
      wallet: {
        coins: sender.coins,
        diamonds: sender.diamonds
      },
      points
    });

    io.emit("festival:leaderboard", {
      leaderboard: festivalLeaderboard()
    });

    io.emit("cp:ranking", cpLeaderboard());
    io.emit("family:ranking", familyLeaderboard());

    io.emit("richking:update", {
      daily: richKingLeaderboard("daily"),
      weekly: richKingLeaderboard("weekly"),
      monthly: richKingLeaderboard("monthly")
    });
  });

  /* ---------------- CP EVENTS ---------------- */

  socket.on("cp:request", data => {
    sendCpRequest(socket, data || {});
  });

  socket.on("cp:send-request", data => {
    sendCpRequest(socket, data || {});
  });

  socket.on("cp:respond", data => {
    respondCpRequest(socket, data || {});
  });

  socket.on("cp:accept", data => {
    respondCpRequest(socket, {
      ...(data || {}),
      accept: true
    });
  });

  socket.on("cp:reject", data => {
    respondCpRequest(socket, {
      ...(data || {}),
      accept: false
    });
  });

  socket.on("cp:break", data => {
    breakCp(socket, data || {});
  });

  socket.on("cp:get", () => {
    const userId = cleanId(socketUser.get(socket.id));

    socket.emit("cp:data", {
      cp: getCpPair(userId),
      requests: Array.from(cpRequests.values()).filter(request =>
        request.senderId === userId || request.receiverId === userId
      ),
      leaderboard: cpLeaderboard()
    });
  });

  /* ---------------- FAMILY EVENTS ---------------- */

  socket.on("family:create", data => {
    createFamily(socket, data || {});
  });

  socket.on("family:join", data => {
    joinFamily(socket, data || {});
  });

  socket.on("family:leave", () => {
    leaveFamily(socket);
  });

  socket.on("family:get", data => {
    const userId = cleanId(socketUser.get(socket.id));
    const requestedId = cleanId(data && data.familyId);
    const user = users.get(userId);

    const familyId = requestedId || (user ? user.familyId : null);
    const family = familyId ? getFamily(familyId) : null;

    socket.emit("family:data", {
      family: publicFamily(family),
      members: family ? Array.from(family.members.values()) : [],
      leaderboard: familyLeaderboard()
    });
  });

  /* ---------------- GAME EVENTS ---------------- */

  socket.on("game:open", data => {
    joinGame(socket, data || {});
  });

  socket.on("game-start", data => {
    joinGame(socket, data || {});
  });

  socket.on("game:join", data => {
    handleBet(socket, data || {});
  });

  socket.on("game:bet", data => {
    handleBet(socket, data || {});
  });

  socket.on("game:leave", data => {
    data = data || {};

    const roomId = cleanId(data.roomId, "PV100");
    const gameId = cleanId(data.gameId || data.game, "greedy");
    const userId = cleanId(socketUser.get(socket.id));

    socket.leave(gameKey(roomId, gameId));

    const state = gameStates.get(gameKey(roomId, gameId));

    if (state && userId) {
      /*
       * Keep existing bets until the round settles.
       * A disconnect or leave cannot cancel already accepted bets.
       */
      emitGameState(roomId, gameId);
    }
  });

  /* ---------------- VOICE ROOM JOIN ---------------- */

  socket.on("join-room", data => {
    data = data || {};

    const roomId = cleanId(data.roomId || data.room, "main");
    const userId = cleanId(socketUser.get(socket.id) || data.userId);

    if (!userId) {
      return emitError(socket, "room:error", "Register before joining a room.");
    }

    const user = getUser(userId, data.name, data.dp);
    const room = getRoom(roomId);

    socketUser.set(socket.id, user.userId);

    if (!userSockets.has(user.userId)) {
      userSockets.set(user.userId, new Set());
    }

    userSockets.get(user.userId).add(socket.id);

    if (data.roomName) room.name = String(data.roomName).slice(0, 60);
    if (data.roomDp) room.dp = String(data.roomDp).slice(0, 1000);

    if (!room.hostId) {
      room.hostId = user.userId;
      room.hostName = user.name;
    }

    socket.join(roomId);

    room.members.set(user.userId, {
      userId: user.userId,
      name: user.name,
      dp: user.dp
    });

    socket.emit("room:joined", {
      roomId,
      members: Array.from(room.members.values()),
      seats: room.seats,
      room: roomPublic(room)
    });

    socket.to(roomId).emit(
      "room:users",
      Array.from(room.members.values())
    );

    io.emit("rooms:update", Array.from(rooms.values()).map(roomPublic));
  });

  /* ---------------- ROOM SETTINGS ---------------- */

  socket.on("room:update", data => {
    data = data || {};

    const userId = cleanId(socketUser.get(socket.id));
    const roomId = cleanId(data.roomId || data.room, "main");
    const room = getRoom(roomId);

    if (room.hostId && room.hostId !== userId) {
      return emitError(socket, "room:error", "Only the room host can update room settings.");
    }

    if (data.name) room.name = String(data.name).slice(0, 60);
    if (data.dp !== undefined) room.dp = String(data.dp).slice(0, 1000);
    if (data.category) room.category = String(data.category).slice(0, 40);

    io.to(roomId).emit("room:updated", roomPublic(room));
    io.emit("rooms:update", Array.from(rooms.values()).map(roomPublic));
  });

  /* ---------------- ROOM SEATS ---------------- */

  socket.on("seat:take", data => {
    data = data || {};

    const userId = cleanId(socketUser.get(socket.id));
    const roomId = cleanId(data.roomId || data.room, "main");
    const seatNumber = Math.floor(Number(data.seat));

    const room = getRoom(roomId);
    const user = users.get(userId);

    if (!user || seatNumber < 1 || seatNumber > 9) {
      return emitError(socket, "seat:error", "Invalid seat or user.");
    }

    const seat = room.seats[seatNumber - 1];

    if (seat.userId && seat.userId !== userId) {
      return emitError(socket, "seat:error", "This seat is occupied.");
    }

    const previous = room.seats.find(row => row.userId === userId);

    if (previous) {
      previous.userId = null;
      previous.name = "";
      previous.dp = "";
      previous.muted = false;
    }

    seat.userId = userId;
    seat.name = user.name;
    seat.dp = user.dp;
    seat.muted = false;

    io.to(roomId).emit("seats:update", room.seats);
    io.to(roomId).emit("room:seats", room.seats);
  });

  socket.on("seat:leave", data => {
    data = data || {};

    const userId = cleanId(socketUser.get(socket.id));
    const roomId = cleanId(data.roomId || data.room, "main");
    const room = getRoom(roomId);

    for (const seat of room.seats) {
      if (seat.userId === userId) {
        seat.userId = null;
        seat.name = "";
        seat.dp = "";
        seat.muted = false;
      }
    }

    io.to(roomId).emit("seats:update", room.seats);
    io.to(roomId).emit("room:seats", room.seats);
  });

  /* ---------------- ROOM CHAT ---------------- */

  socket.on("room:chat", data => {
    data = data || {};

    const userId = cleanId(socketUser.get(socket.id));

    if (!userId) {
      return emitError(socket, "chat:error", "Register before chatting.");
    }

    const user = getUser(userId, data.name, data.dp);
    const roomId = cleanId(data.roomId || data.room, "main");
    const message = String(data.message || data.text || "").slice(0, 500);

    if (!message.trim()) return;

    const payload = {
      roomId,
      userId,
      name: user.name,
      dp: user.dp,
      message,
      text: message,
      createdAt: now()
    };

    const room = getRoom(roomId);

    room.chat.push(payload);
    room.chat = room.chat.slice(-100);

    io.to(roomId).emit("room:chat", payload);
  });

  /* ---------------- WEBRTC SIGNALING ---------------- */

  socket.on("webrtc:offer", data => {
    if (!data || !data.to) return;

    io.to(String(data.to)).emit("webrtc:offer", {
      from: socket.id,
      offer: data.offer
    });
  });

  socket.on("webrtc:answer", data => {
    if (!data || !data.to) return;

    io.to(String(data.to)).emit("webrtc:answer", {
      from: socket.id,
      answer: data.answer
    });
  });

  socket.on("webrtc:ice-candidate", data => {
    if (!data || !data.to) return;

    io.to(String(data.to)).emit("webrtc:ice-candidate", {
      from: socket.id,
      candidate: data.candidate
    });
  });

  /* ---------------- DISCONNECT ---------------- */

  socket.on("disconnect", () => {
    const userId = socketUser.get(socket.id);

    socketUser.delete(socket.id);

    if (userId && userSockets.has(userId)) {
      userSockets.get(userId).delete(socket.id);

      if (userSockets.get(userId).size === 0) {
        userSockets.delete(userId);

        for (const room of rooms.values()) {
          room.members.delete(userId);

          for (const seat of room.seats) {
            if (seat.userId === userId) {
              seat.userId = null;
              seat.name = "";
              seat.dp = "";
              seat.muted = false;
            }
          }

          io.to(room.roomId).emit("room:users",
            Array.from(room.members.values())
          );

          io.to(room.roomId).emit("seats:update", room.seats);
        }
      }
    }

    for (const [key, state] of gameStates) {
      if (userId && state.players.has(userId)) {
        emitGameState(state.roomId, state.gameId);
      }
    }

    io.emit("rooms:update", Array.from(rooms.values()).map(roomPublic));
  });
});

/* =========================================================
   CLEANUP
========================================================= */

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

/* =========================================================
   START SERVER
========================================================= */

server.listen(PORT, "0.0.0.0", () => {
  console.log(`PawanVoice server running on port ${PORT}`);
});
