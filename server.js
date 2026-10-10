"use strict";

/*
=========================================================
 PAWANVOICE COMPLETE ROOM + ONLINE GAME SERVER
=========================================================
 Features:
 - Express static hosting
 - Socket.IO realtime communication
 - 9 voice-room seats
 - Room chat and gifts
 - Room settings
 - User profile registration
 - Mic status and mute/kick
 - WebRTC offer, answer and ICE signaling
 - Multiplayer game rooms
 - Game lobby, ready, start, score and chat
 - Health/status APIs
=========================================================
*/

const express = require("express");
const http = require("http");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 10000;

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingInterval: 25000,
    pingTimeout: 60000,
    maxHttpBufferSize: 1e6
});

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({
    extended: true,
    limit: "2mb"
}));
app.use(express.static(__dirname));

// =======================================================
// DATA
// =======================================================

const rooms = new Map();
const gameRooms = new Map();
const onlineUsers = new Map();
const socketUsers = new Map();

const GAME_CATALOG = [
    {
        id: "greedy-baby",
        name: "Greedy Baby",
        category: "casual",
        maxPlayers: 8,
        minPlayers: 1,
        multiplayer: true,
        enabled: true
    },
    {
        id: "ludo",
        name: "Ludo",
        category: "board",
        maxPlayers: 4,
        minPlayers: 1,
        multiplayer: true,
        enabled: true
    },
    {
        id: "uno",
        name: "UNO",
        category: "card",
        maxPlayers: 8,
        minPlayers: 1,
        multiplayer: true,
        enabled: true
    },
    {
        id: "carrom",
        name: "Carrom",
        category: "board",
        maxPlayers: 4,
        minPlayers: 1,
        multiplayer: true,
        enabled: true
    },
    {
        id: "chess",
        name: "Chess",
        category: "board",
        maxPlayers: 2,
        minPlayers: 1,
        multiplayer: true,
        enabled: true
    },
    {
        id: "snake",
        name: "Snake",
        category: "arcade",
        maxPlayers: 1,
        minPlayers: 1,
        multiplayer: false,
        enabled: true
    },
    {
        id: "2048",
        name: "2048",
        category: "puzzle",
        maxPlayers: 1,
        minPlayers: 1,
        multiplayer: false,
        enabled: true
    },
    {
        id: "fruit-cut",
        name: "Fruit Cut",
        category: "arcade",
        maxPlayers: 1,
        minPlayers: 1,
        multiplayer: false,
        enabled: true
    }
];

// =======================================================
// HELPERS
// =======================================================

function makeId(prefix = "") {
    return prefix + crypto.randomBytes(5).toString("hex");
}

function cleanText(value, maxLength = 100) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, maxLength);
}

function safeNumber(value, min = 0, max = 1000000000) {
    const n = Number(value);

    if (!Number.isFinite(n)) return min;

    return Math.max(min, Math.min(max, Math.floor(n)));
}

function getSocketUser(socket) {
    return socketUsers.get(socket.id) || {
        userId: socket.id,
        socketId: socket.id,
        name: "Guest",
        dp: ""
    };
}

function getPublicUser(user) {
    return {
        userId: user.userId,
        socketId: user.socketId,
        name: user.name,
        dp: user.dp || ""
    };
}

function roomChannel(roomId) {
    return "voice:" + roomId;
}

function gameChannel(roomId) {
    return "game:" + roomId;
}

// =======================================================
// VOICE ROOMS
// =======================================================

function createVoiceRoom(roomId) {
    return {
        id: roomId,
        name: "PawanVoice Room",
        dp: "",
        ownerId: null,

        seats: Array.from({ length: 9 }, (_, i) => ({
            seat: i + 1,
            userId: null,
            socketId: null,
            name: "",
            dp: "",
            micOn: false,
            muted: false
        })),

        users: new Map(),
        chat: [],
        gifts: [],
        createdAt: Date.now()
    };
}

function getVoiceRoom(roomId) {
    const id = cleanText(roomId, 60) || "main";

    if (!rooms.has(id)) {
        rooms.set(id, createVoiceRoom(id));
    }

    return rooms.get(id);
}

function publicVoiceRoom(room) {
    return {
        id: room.id,
        name: room.name,
        dp: room.dp,
        ownerId: room.ownerId,

        seats: room.seats.map(seat => ({ ...seat })),

        users: Array.from(room.users.values()).map(user => ({
            userId: user.userId,
            socketId: user.socketId,
            name: user.name,
            dp: user.dp || ""
        })),

        userCount: room.users.size,
        chat: room.chat.slice(-50),
        createdAt: room.createdAt
    };
}

function emitVoiceRoomUpdate(room) {
    const snapshot = publicVoiceRoom(room);

    // Current event names.
    io.to(roomChannel(room.id)).emit("room:update", snapshot);
    io.to(roomChannel(room.id)).emit("roomUpdate", snapshot);

    // Compatibility event for older room.html versions.
    io.to(roomChannel(room.id)).emit("roomState", snapshot);
}

function leaveVoiceRoom(socket) {
    const roomId = socket.data.voiceRoomId;

    if (!roomId) return;

    const room = rooms.get(roomId);

    socket.leave(roomChannel(roomId));
    socket.data.voiceRoomId = null;

    if (!room) return;

    const user = getSocketUser(socket);

    room.users.delete(socket.id);

    room.seats.forEach(seat => {
        if (
            seat.socketId === socket.id ||
            (
                seat.userId === user.userId &&
                !Array.from(room.users.values()).some(
                    member => member.userId === user.userId
                )
            )
        ) {
            Object.assign(seat, {
                userId: null,
                socketId: null,
                name: "",
                dp: "",
                micOn: false,
                muted: false
            });
        }
    });

    if (room.ownerId === user.userId) {
        const nextUser = room.users.values().next().value;
        room.ownerId = nextUser ? nextUser.userId : null;
    }

    io.to(roomChannel(roomId)).emit("user:left", {
        userId: user.userId,
        socketId: socket.id
    });

    io.to(roomChannel(roomId)).emit("userLeft", {
        userId: user.userId,
        socketId: socket.id
    });

    if (room.users.size === 0) {
        rooms.delete(roomId);
    } else {
        emitVoiceRoomUpdate(room);
    }
}

function joinVoiceRoom(socket, data = {}) {
    const user = getSocketUser(socket);

    const roomId = cleanText(
        data.roomId || data.room || data.id,
        60
    ) || "main";

    leaveVoiceRoom(socket);

    // Keep the profile ID stable when provided by the client.
    if (data.userId !== undefined || data.userid !== undefined) {
        user.userId = cleanText(
            String(data.userId || data.userid || ""),
            100
        ) || user.userId;
    }

    user.name = cleanText(data.name, 50) || user.name || "Guest";
    user.dp = cleanText(data.dp, 1000) || user.dp || "";
    user.socketId = socket.id;

    socketUsers.set(socket.id, user);
    onlineUsers.set(socket.id, user);

    const room = getVoiceRoom(roomId);

    room.users.set(socket.id, {
        ...getPublicUser(user),
        joinedAt: Date.now()
    });

    if (!room.ownerId) {
        room.ownerId = user.userId;
    }

    socket.join(roomChannel(roomId));
    socket.data.voiceRoomId = roomId;

    const snapshot = publicVoiceRoom(room);

    socket.emit("room:joined", {
        success: true,
        room: snapshot,
        userId: user.userId
    });

    socket.emit("roomJoined", {
        success: true,
        room: snapshot,
        userId: user.userId
    });

    socket.to(roomChannel(roomId)).emit("user:joined", {
        user: getPublicUser(user),
        roomId
    });

    socket.to(roomChannel(roomId)).emit("userJoined", {
        user: getPublicUser(user),
        roomId
    });

    emitVoiceRoomUpdate(room);

    return room;
}

// =======================================================
// GAME HELPERS
// =======================================================

function getGameDefinition(gameId) {
    return GAME_CATALOG.find(
        game => game.id === cleanText(gameId, 60)
    ) || null;
}

function createGameRoom(gameId, options = {}) {
    const definition = getGameDefinition(gameId);

    if (!definition) return null;

    const maxPlayers = Math.min(
        safeNumber(
            options.maxPlayers || definition.maxPlayers,
            1,
            8
        ),
        definition.maxPlayers,
        8
    );

    return {
        id: cleanText(options.roomId, 60) || makeId("G"),
        gameId: definition.id,
        gameName: definition.name,
        maxPlayers,
        minPlayers: definition.minPlayers,
        hostId: null,
        status: "waiting",
        players: new Map(),
        state: {},
        scores: {},
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
}

function getGameRoom(roomId) {
    return gameRooms.get(cleanText(roomId, 60));
}

function publicGameRoom(game) {
    return {
        id: game.id,
        gameId: game.gameId,
        gameName: game.gameName,
        maxPlayers: game.maxPlayers,
        minPlayers: game.minPlayers,
        hostId: game.hostId,
        status: game.status,
        playerCount: game.players.size,

        players: Array.from(game.players.values()).map(player => ({
            userId: player.userId,
            name: player.name,
            dp: player.dp || "",
            score: safeNumber(game.scores[player.userId]),
            ready: !!player.ready,
            online: true
        })),

        createdAt: game.createdAt,
        updatedAt: game.updatedAt
    };
}

function emitGameUpdate(game) {
    game.updatedAt = Date.now();

    const snapshot = publicGameRoom(game);

    io.to(gameChannel(game.id)).emit("game:roomUpdate", snapshot);
    io.to(gameChannel(game.id)).emit("gameRoomUpdate", snapshot);

    io.to("game:lobby").emit("game:lobbyUpdate", {
        roomId: game.id,
        gameId: game.gameId,
        gameName: game.gameName,
        status: game.status,
        playerCount: game.players.size,
        maxPlayers: game.maxPlayers
    });
}

function leaveGameRoom(socket) {
    const gameRoomId = socket.data.gameRoomId;

    if (!gameRoomId) return;

    const game = getGameRoom(gameRoomId);

    socket.leave(gameChannel(gameRoomId));
    socket.data.gameRoomId = null;

    if (!game) return;

    const user = getSocketUser(socket);

    game.players.delete(socket.id);
    delete game.scores[user.userId];

    if (game.hostId === user.userId) {
        const nextPlayer = game.players.values().next().value;
        game.hostId = nextPlayer ? nextPlayer.userId : null;
    }

    if (game.players.size === 0) {
        gameRooms.delete(gameRoomId);

        io.to("game:lobby").emit("game:lobbyUpdate", {
            roomId: gameRoomId,
            deleted: true
        });

        return;
    }

    if (game.status === "playing") {
        game.status = "waiting";
    }

    io.to(gameChannel(game.id)).emit("game:playerLeft", {
        userId: user.userId,
        socketId: socket.id
    });

    io.to(gameChannel(game.id)).emit("gamePlayerLeft", {
        userId: user.userId,
        socketId: socket.id
    });

    emitGameUpdate(game);
}

// =======================================================
// HTTP ROUTES
// =======================================================

app.get("/", (req, res) => {
    res.json({
        app: "PawanVoice Room + Games Server",
        status: "running",
        socketIO: true,
        voiceSeats: 9,
        maxGamePlayers: 8,
        games: GAME_CATALOG.length,
        endpoints: [
            "/health",
            "/api/status",
            "/api/games",
            "/api/games/rooms",
            "/api/rooms"
        ]
    });
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        app: "PawanVoice",
        socketIO: true,
        timestamp: Date.now(),
        voiceRooms: rooms.size,
        gameRooms: gameRooms.size,
        onlineUsers: onlineUsers.size
    });
});

app.get("/api/status", (req, res) => {
    res.json({
        app: "PawanVoice",
        status: "running",
        voiceRooms: rooms.size,
        gameRooms: gameRooms.size,
        onlineUsers: onlineUsers.size,
        uptime: Math.floor(process.uptime()),
        timestamp: Date.now()
    });
});

app.get("/api/games", (req, res) => {
    res.json({
        success: true,
        games: GAME_CATALOG
    });
});

app.get("/api/games/rooms", (req, res) => {
    res.json({
        success: true,
        rooms: Array.from(gameRooms.values()).map(game => ({
            id: game.id,
            gameId: game.gameId,
            gameName: game.gameName,
            status: game.status,
            playerCount: game.players.size,
            maxPlayers: game.maxPlayers
        }))
    });
});

app.get("/api/rooms", (req, res) => {
    res.json({
        success: true,
        rooms: Array.from(rooms.values()).map(publicVoiceRoom)
    });
});

// =======================================================
// SOCKET.IO
// =======================================================

io.on("connection", socket => {
    console.log("Connected:", socket.id);

    const initialUser = {
        userId: socket.id,
        socketId: socket.id,
        name: "Guest",
        dp: ""
    };

    socketUsers.set(socket.id, initialUser);
    onlineUsers.set(socket.id, initialUser);

    socket.emit("server:ready", {
        success: true,
        socketId: socket.id,
        app: "PawanVoice",
        timestamp: Date.now()
    });

    // ---------------------------------------------------
    // PROFILE
    // ---------------------------------------------------

    function updateProfile(data = {}) {
        const user = getSocketUser(socket);

        if (data.userId !== undefined || data.userid !== undefined) {
            user.userId = cleanText(
                String(data.userId || data.userid || ""),
                100
            ) || user.userId;
        }

        if (data.name !== undefined) {
            user.name = cleanText(data.name, 50) || "Guest";
        }

        if (data.dp !== undefined) {
            user.dp = cleanText(data.dp, 1000);
        }

        user.socketId = socket.id;

        socketUsers.set(socket.id, user);
        onlineUsers.set(socket.id, user);

        // Update profile in any currently joined voice room.
        const roomId = socket.data.voiceRoomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (room) {
            const member = room.users.get(socket.id);

            if (member) {
                Object.assign(member, getPublicUser(user));
            }

            room.seats.forEach(seat => {
                if (seat.socketId === socket.id) {
                    seat.userId = user.userId;
                    seat.name = user.name;
                    seat.dp = user.dp;
                }
            });

            emitVoiceRoomUpdate(room);
        }

        socket.emit("profile:updated", {
            success: true,
            user: getPublicUser(user)
        });
    }

    socket.on("user:register", updateProfile);
    socket.on("profile:update", updateProfile);
    socket.on("registerUser", updateProfile);

    // ---------------------------------------------------
    // JOIN / LEAVE ROOM
    // ---------------------------------------------------

    socket.on("room:join", data => {
        try {
            joinVoiceRoom(socket, data || {});
        } catch (error) {
            console.error("room:join error:", error);
            socket.emit("error:message", {
                message: "Unable to join room."
            });
        }
    });

    socket.on("joinRoom", data => {
        try {
            joinVoiceRoom(socket, data || {});
        } catch (error) {
            console.error("joinRoom error:", error);
            socket.emit("error:message", {
                message: "Unable to join room."
            });
        }
    });

    socket.on("room:leave", () => leaveVoiceRoom(socket));
    socket.on("leaveRoom", () => leaveVoiceRoom(socket));

    // ---------------------------------------------------
    // ROOM NAME / DP
    // ---------------------------------------------------

    socket.on("room:updateDetails", data => {
        const roomId = socket.data.voiceRoomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room) return;

        const user = getSocketUser(socket);

        if (room.ownerId !== user.userId) {
            socket.emit("error:message", {
                message: "Only the room owner can update room details."
            });
            return;
        }

        if (data && data.name !== undefined) {
            room.name = cleanText(data.name, 80) || room.name;
        }

        if (data && data.dp !== undefined) {
            room.dp = cleanText(data.dp, 1000);
        }

        emitVoiceRoomUpdate(room);
    });

    // ---------------------------------------------------
    // SEATS
    // ---------------------------------------------------

    function takeSeat(data = {}) {
        const roomId = socket.data.voiceRoomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room) {
            socket.emit("seat:error", {
                message: "Join a room first."
            });
            return;
        }

        const user = getSocketUser(socket);

        const seatNumber = safeNumber(
            data.seat || data.seatNumber,
            1,
            9
        );

        const seat = room.seats[seatNumber - 1];

        if (!seat) return;

        if (seat.socketId === socket.id) {
            socket.emit("seat:taken", { seat: { ...seat } });
            return;
        }

        if (seat.userId && seat.socketId !== socket.id) {
            socket.emit("seat:error", {
                seat: seatNumber,
                message: "This seat is already occupied."
            });
            return;
        }

        room.seats.forEach(item => {
            if (item.socketId === socket.id) {
                Object.assign(item, {
                    userId: null,
                    socketId: null,
                    name: "",
                    dp: "",
                    micOn: false,
                    muted: false
                });
            }
        });

        Object.assign(seat, {
            userId: user.userId,
            socketId: socket.id,
            name: user.name,
            dp: user.dp,
            micOn: false,
            muted: false
        });

        io.to(roomChannel(roomId)).emit("seat:taken", {
            seat: { ...seat }
        });

        io.to(roomChannel(roomId)).emit("seatTaken", {
            seat: { ...seat }
        });

        emitVoiceRoomUpdate(room);
    }

    socket.on("seat:take", takeSeat);
    socket.on("takeSeat", takeSeat);

    function leaveSeat() {
        const roomId = socket.data.voiceRoomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room) return;

        const seat = room.seats.find(
            item => item.socketId === socket.id
        );

        if (!seat) return;

        const number = seat.seat;

        Object.assign(seat, {
            userId: null,
            socketId: null,
            name: "",
            dp: "",
            micOn: false,
            muted: false
        });

        io.to(roomChannel(roomId)).emit("seat:left", {
            seat: number
        });

        io.to(roomChannel(roomId)).emit("seatLeft", {
            seat: number
        });

        emitVoiceRoomUpdate(room);
    }

    socket.on("seat:leave", leaveSeat);
    socket.on("leaveSeat", leaveSeat);

    // ---------------------------------------------------
    // MIC
    // ---------------------------------------------------

    function toggleMic(data = {}) {
        const roomId = socket.data.voiceRoomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room) return;

        const user = getSocketUser(socket);

        const seat = room.seats.find(
            item => item.socketId === socket.id
        );

        if (!seat) {
            socket.emit("mic:error", {
                message: "Take a seat before turning on the microphone."
            });
            return;
        }

        if (seat.muted && data.enabled === true) {
            socket.emit("mic:error", {
                message: "Your microphone has been muted by the room owner."
            });
            return;
        }

        seat.micOn = data.enabled !== undefined
            ? !!data.enabled
            : !seat.micOn;

        io.to(roomChannel(roomId)).emit("mic:updated", {
            userId: user.userId,
            seat: seat.seat,
            micOn: seat.micOn
        });

        io.to(roomChannel(roomId)).emit("micUpdated", {
            userId: user.userId,
            seat: seat.seat,
            micOn: seat.micOn
        });

        emitVoiceRoomUpdate(room);
    }

    socket.on("mic:toggle", toggleMic);
    socket.on("toggleMic", toggleMic);

    // ---------------------------------------------------
    // MUTE / KICK
    // ---------------------------------------------------

    function findRoomTarget(room, targetId) {
        return room.seats.find(seat =>
            seat.userId === targetId ||
            seat.socketId === targetId
        );
    }

    socket.on("room:muteUser", data => {
        const roomId = socket.data.voiceRoomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room) return;

        const actor = getSocketUser(socket);

        if (room.ownerId !== actor.userId) {
            socket.emit("error:message", {
                message: "Only the room owner can mute users."
            });
            return;
        }

        const targetId = cleanText(
            data?.targetId || data?.userId || data?.socketId,
            100
        );

        const seat = findRoomTarget(room, targetId);

        if (!seat) return;

        seat.muted = data.muted !== undefined
            ? !!data.muted
            : !seat.muted;

        if (seat.muted) seat.micOn = false;

        const targetSocket = seat.socketId;

        if (targetSocket) {
            io.to(targetSocket).emit("room:muted", {
                muted: seat.muted
            });

            io.to(targetSocket).emit("userMuted", {
                muted: seat.muted
            });
        }

        emitVoiceRoomUpdate(room);
    });

    socket.on("room:kickUser", data => {
        const roomId = socket.data.voiceRoomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room) return;

        const actor = getSocketUser(socket);

        if (room.ownerId !== actor.userId) {
            socket.emit("error:message", {
                message: "Only the room owner can kick users."
            });
            return;
        }

        const targetId = cleanText(
            data?.targetId || data?.userId || data?.socketId,
            100
        );

        const seat = findRoomTarget(room, targetId);

        let targetSocket = seat?.socketId;

        if (!targetSocket) {
            const target = Array.from(room.users.values()).find(
                member => member.userId === targetId
            );
            targetSocket = target?.socketId;
        }

        if (!targetSocket || targetSocket === socket.id) return;

        const target = io.sockets.sockets.get(targetSocket);

        if (target) {
            target.emit("room:kicked", {
                roomId,
                message: "You were removed from this room."
            });

            leaveVoiceRoom(target);
        }
    });

    // Compatibility names.
    socket.on("muteUser", data => {
        socket.emit("error:message", {
            message: "Use room:muteUser for this server version."
        });
    });

    socket.on("kickUser", data => {
        socket.emit("error:message", {
            message: "Use room:kickUser for this server version."
        });
    });

    // ---------------------------------------------------
    // ROOM CHAT
    // ---------------------------------------------------

    function sendRoomMessage(data = {}) {
        const roomId = socket.data.voiceRoomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room) {
            socket.emit("chat:error", {
                message: "Join a room before sending messages."
            });
            return;
        }

        const user = getSocketUser(socket);
        const message = cleanText(data.message || data.text, 1000);

        if (!message) return;

        const item = {
            id: makeId("MSG"),
            roomId,
            userId: user.userId,
            socketId: socket.id,
            name: user.name,
            dp: user.dp,
            message,
            text: message,
            type: "text",
            timestamp: Date.now()
        };

        room.chat.push(item);

        if (room.chat.length > 100) room.chat.shift();

        io.to(roomChannel(roomId)).emit("chat:message", item);
        io.to(roomChannel(roomId)).emit("chatMessage", item);
        io.to(roomChannel(roomId)).emit("chat", item);
    }

    socket.on("chat:send", sendRoomMessage);
    socket.on("sendMessage", sendRoomMessage);

    // ---------------------------------------------------
    // GIFTS
    // ---------------------------------------------------

    function sendRoomGift(data = {}) {
        const roomId = socket.data.voiceRoomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room) {
            socket.emit("gift:error", {
                message: "Join a room before sending gifts."
            });
            return;
        }

        const user = getSocketUser(socket);

        const gift = {
            id: makeId("GIFT"),
            roomId,
            senderId: user.userId,
            senderName: user.name,
            senderDp: user.dp,
            giftId: cleanText(data.giftId || data.id, 60),
            giftName: cleanText(data.giftName || data.name, 80),
            giftImage: cleanText(data.giftImage || data.image, 1000),
            receiverId: cleanText(data.receiverId, 100),
            receiverName: cleanText(data.receiverName, 50),
            quantity: safeNumber(data.quantity || 1, 1, 99),
            timestamp: Date.now()
        };

        room.gifts.push(gift);

        if (room.gifts.length > 100) room.gifts.shift();

        io.to(roomChannel(roomId)).emit("gift:received", gift);
        io.to(roomChannel(roomId)).emit("receiveGift", gift);
        io.to(roomChannel(roomId)).emit("gift", gift);
    }

    socket.on("gift:send", sendRoomGift);
    socket.on("sendGift", sendRoomGift);

    // ---------------------------------------------------
    // WEBRTC SIGNALING
    // ---------------------------------------------------

    function sendSignal(event, data = {}, targetKey, valueKey) {
        const targetId = cleanText(
            data.targetId || data.to || data.target || "",
            100
        );

        if (!targetId || !io.sockets.sockets.has(targetId)) return;

        io.to(targetId).emit(event, {
            from: socket.id,
            [valueKey]: data[valueKey] || data.description || data.candidate
        });
    }

    socket.on("webrtc:offer", data => {
        const targetId = cleanText(data?.targetId || data?.to, 100);

        if (!targetId || !io.sockets.sockets.has(targetId)) return;

        io.to(targetId).emit("webrtc:offer", {
            from: socket.id,
            offer: data.offer
        });
    });

    socket.on("webrtc:answer", data => {
        const targetId = cleanText(data?.targetId || data?.to, 100);

        if (!targetId || !io.sockets.sockets.has(targetId)) return;

        io.to(targetId).emit("webrtc:answer", {
            from: socket.id,
            answer: data.answer
        });
    });

    socket.on("webrtc:ice", data => {
        const targetId = cleanText(data?.targetId || data?.to, 100);

        if (!targetId || !io.sockets.sockets.has(targetId)) return;

        io.to(targetId).emit("webrtc:ice", {
            from: socket.id,
            candidate: data.candidate
        });
    });

    socket.on("voice:offer", data => {
        const targetId = cleanText(data?.targetId || data?.to, 100);

        if (!targetId || !io.sockets.sockets.has(targetId)) return;

        io.to(targetId).emit("voice:offer", {
            from: socket.id,
            offer: data.offer
        });
    });

    socket.on("voice:answer", data => {
        const targetId = cleanText(data?.targetId || data?.to, 100);

        if (!targetId || !io.sockets.sockets.has(targetId)) return;

        io.to(targetId).emit("voice:answer", {
            from: socket.id,
            answer: data.answer
        });
    });

    socket.on("voice:ice", data => {
        const targetId = cleanText(data?.targetId || data?.to, 100);

        if (!targetId || !io.sockets.sockets.has(targetId)) return;

        io.to(targetId).emit("voice:ice", {
            from: socket.id,
            candidate: data.candidate
        });
    });

    // ---------------------------------------------------
    // GAME LOBBY
    // ---------------------------------------------------

    function sendGameLobby() {
        socket.join("game:lobby");

        socket.emit("game:lobby", {
            success: true,
            games: GAME_CATALOG,
            rooms: Array.from(gameRooms.values()).map(game => ({
                id: game.id,
                gameId: game.gameId,
                gameName: game.gameName,
                status: game.status,
                playerCount: game.players.size,
                maxPlayers: game.maxPlayers
            }))
        });
    }

    socket.on("game:lobby:join", sendGameLobby);
    socket.on("gameLobbyJoin", sendGameLobby);

    // ---------------------------------------------------
    // CREATE GAME
    // ---------------------------------------------------

    function createGame(data = {}) {
        const user = getSocketUser(socket);
        const gameId = cleanText(data.gameId || data.game, 60);

        if (!getGameDefinition(gameId)) {
            socket.emit("game:error", {
                message: "Game not found."
            });
            return;
        }

        leaveGameRoom(socket);

        let game = createGameRoom(gameId, {
            maxPlayers: data.maxPlayers,
            roomId: data.roomId
        });

        if (!game) return;

        if (gameRooms.has(game.id)) {
            socket.emit("game:error", {
                message: "That game room ID is already in use."
            });
            return;
        }

        game.hostId = user.userId;

        game.players.set(socket.id, {
            userId: user.userId,
            socketId: socket.id,
            name: user.name,
            dp: user.dp,
            ready: false,
            joinedAt: Date.now()
        });

        game.scores[user.userId] = 0;

        gameRooms.set(game.id, game);

        socket.join(gameChannel(game.id));
        socket.data.gameRoomId = game.id;

        const snapshot = publicGameRoom(game);

        socket.emit("game:created", {
            success: true,
            room: snapshot
        });

        socket.emit("gameCreated", {
            success: true,
            room: snapshot
        });

        emitGameUpdate(game);
    }

    socket.on("game:create", createGame);
    socket.on("createGame", createGame);

    // ---------------------------------------------------
    // JOIN GAME
    // ---------------------------------------------------

    function joinGame(data = {}) {
        const user = getSocketUser(socket);

        const roomId = cleanText(
            data.roomId || data.gameRoomId || data.id,
            60
        );

        const game = getGameRoom(roomId);

        if (!game) {
            socket.emit("game:error", {
                message: "Game room not found."
            });
            return;
        }

        if (game.status === "finished") {
            socket.emit("game:error", {
                message: "This game has finished."
            });
            return;
        }

        if (game.players.size >= game.maxPlayers) {
            socket.emit("game:error", {
                message: "This game room is full."
            });
            return;
        }

        if (game.players.has(socket.id)) {
            socket.emit("game:joined", {
                success: true,
                room: publicGameRoom(game)
            });
            return;
        }

        leaveGameRoom(socket);

        const player = {
            userId: user.userId,
            socketId: socket.id,
            name: user.name,
            dp: user.dp,
            ready: false,
            joinedAt: Date.now()
        };

        game.players.set(socket.id, player);
        game.scores[user.userId] = game.scores[user.userId] || 0;

        socket.join(gameChannel(game.id));
        socket.data.gameRoomId = game.id;

        socket.emit("game:joined", {
            success: true,
            room: publicGameRoom(game)
        });

        socket.emit("gameJoined", {
            success: true,
            room: publicGameRoom(game)
        });

        socket.to(gameChannel(game.id)).emit("game:playerJoined", {
            player: {
                userId: player.userId,
                name: player.name,
                dp: player.dp
            }
        });

        emitGameUpdate(game);
    }

    socket.on("game:join", joinGame);
    socket.on("joinGame", joinGame);

    socket.on("game:leave", () => leaveGameRoom(socket));
    socket.on("leaveGame", () => leaveGameRoom(socket));

    // ---------------------------------------------------
    // GAME READY
    // ---------------------------------------------------

    function gameReady(data = {}) {
        const gameId = socket.data.gameRoomId;
        const game = gameId ? getGameRoom(gameId) : null;

        if (!game) return;

        const player = game.players.get(socket.id);

        if (!player) return;

        player.ready = data.ready !== undefined
            ? !!data.ready
            : !player.ready;

        io.to(gameChannel(game.id)).emit("game:playerReady", {
            userId: player.userId,
            ready: player.ready
        });

        emitGameUpdate(game);
    }

    socket.on("game:ready", gameReady);
    socket.on("gameReady", gameReady);

    // ---------------------------------------------------
    // START GAME
    // ---------------------------------------------------

    function startGame() {
        const gameId = socket.data.gameRoomId;
        const game = gameId ? getGameRoom(gameId) : null;

        if (!game) {
            socket.emit("game:error", {
                message: "Join a game room first."
            });
            return;
        }

        const user = getSocketUser(socket);

        if (game.hostId !== user.userId) {
            socket.emit("game:error", {
                message: "Only the host can start the game."
            });
            return;
        }

        if (game.status === "playing") return;

        if (game.players.size < game.minPlayers) {
            socket.emit("game:error", {
                message: "Not enough players."
            });
            return;
        }

        game.status = "playing";
        game.state = {
            startedAt: Date.now(),
            round: 1
        };

        game.players.forEach(player => {
            player.ready = false;
        });

        const payload = {
            success: true,
            room: publicGameRoom(game),
            state: game.state
        };

        io.to(gameChannel(game.id)).emit("game:started", payload);
        io.to(gameChannel(game.id)).emit("gameStarted", payload);

        emitGameUpdate(game);
    }

    socket.on("game:start", startGame);
    socket.on("startGame", startGame);

    // ---------------------------------------------------
    // GAME ACTIONS
    // ---------------------------------------------------

    function gameAction(payload = {}) {
        const gameId = socket.data.gameRoomId;
        const game = gameId ? getGameRoom(gameId) : null;

        if (!game || game.status !== "playing") {
            socket.emit("game:error", {
                message: "The game is not running."
            });
            return;
        }

        const player = game.players.get(socket.id);

        if (!player) return;

        const action = cleanText(payload.action, 60);

        if (!action) return;

        let serialized;

        try {
            serialized = JSON.stringify(
                payload.data === undefined ? null : payload.data
            );
        } catch {
            return;
        }

        if (serialized.length > 10000) {
            socket.emit("game:error", {
                message: "Game action is too large."
            });
            return;
        }

        const event = {
            action,
            data: payload.data === undefined ? null : payload.data,
            userId: player.userId,
            playerName: player.name,
            timestamp: Date.now()
        };

        socket.to(gameChannel(game.id)).emit("game:action", event);
        socket.to(gameChannel(game.id)).emit("gameAction", event);
    }

    socket.on("game:action", gameAction);
    socket.on("gameAction", gameAction);

    // ---------------------------------------------------
    // GAME SCORE
    // ---------------------------------------------------

    function updateGameScore(data = {}) {
        const gameId = socket.data.gameRoomId;
        const game = gameId ? getGameRoom(gameId) : null;

        if (!game || game.status !== "playing") return;

        const player = game.players.get(socket.id);

        if (!player) return;

        const score = safeNumber(data.score, 0, 1000000000);

        game.scores[player.userId] = score;

        io.to(gameChannel(game.id)).emit("game:scoreUpdate", {
            userId: player.userId,
            name: player.name,
            score
        });

        emitGameUpdate(game);
    }

    socket.on("game:score", updateGameScore);
    socket.on("updateGameScore", updateGameScore);

    // ---------------------------------------------------
    // GAME STATE
    // ---------------------------------------------------

    socket.on("game:state", data => {
        const gameId = socket.data.gameRoomId;
        const game = gameId ? getGameRoom(gameId) : null;

        if (!game || game.status !== "playing") return;

        const user = getSocketUser(socket);

        if (game.hostId !== user.userId) {
            socket.emit("game:error", {
                message: "Only the host can update shared state."
            });
            return;
        }

        let serialized;

        try {
            serialized = JSON.stringify(data || {});
        } catch {
            return;
        }

        if (serialized.length > 20000) return;

        game.state = data || {};
        game.updatedAt = Date.now();

        socket.to(gameChannel(game.id)).emit("game:state", {
            state: game.state,
            timestamp: game.updatedAt
        });
    });

    // ---------------------------------------------------
    // FINISH / RESET GAME
    // ---------------------------------------------------

    socket.on("game:finish", data => {
        const gameId = socket.data.gameRoomId;
        const game = gameId ? getGameRoom(gameId) : null;

        if (!game) return;

        const user = getSocketUser(socket);

        if (game.hostId !== user.userId) {
            socket.emit("game:error", {
                message: "Only the host can finish the game."
            });
            return;
        }

        game.status = "finished";
        game.updatedAt = Date.now();

        const results = Array.from(game.players.values())
            .map(player => ({
                userId: player.userId,
                name: player.name,
                score: safeNumber(game.scores[player.userId])
            }))
            .sort((a, b) => b.score - a.score);

        const result = {
            success: true,
            roomId: game.id,
            gameId: game.gameId,
            results,
            winner: results[0] || null,
            finishedAt: Date.now(),
            details: data?.details || null
        };

        io.to(gameChannel(game.id)).emit("game:finished", result);
        io.to(gameChannel(game.id)).emit("gameFinished", result);

        emitGameUpdate(game);
    });

    socket.on("game:reset", () => {
        const gameId = socket.data.gameRoomId;
        const game = gameId ? getGameRoom(gameId) : null;

        if (!game) return;

        const user = getSocketUser(socket);

        if (game.hostId !== user.userId) return;

        game.status = "waiting";
        game.state = {};

        game.players.forEach(player => {
            player.ready = false;
            game.scores[player.userId] = 0;
        });

        io.to(gameChannel(game.id)).emit("game:reset", {
            success: true,
            room: publicGameRoom(game)
        });

        emitGameUpdate(game);
    });

    // ---------------------------------------------------
    // GAME CHAT
    // ---------------------------------------------------

    socket.on("game:chat", data => {
        const gameId = socket.data.gameRoomId;
        const game = gameId ? getGameRoom(gameId) : null;

        if (!game || !game.players.has(socket.id)) return;

        const user = getSocketUser(socket);
        const message = cleanText(data?.message, 500);

        if (!message) return;

        io.to(gameChannel(game.id)).emit("game:chatMessage", {
            userId: user.userId,
            name: user.name,
            message,
            timestamp: Date.now()
        });
    });

    // ---------------------------------------------------
    // PING
    // ---------------------------------------------------

    socket.on("client:ping", () => {
        socket.emit("server:pong", {
            timestamp: Date.now()
        });
    });

    // ---------------------------------------------------
    // DISCONNECT
    // ---------------------------------------------------

    socket.on("disconnect", reason => {
        console.log("Disconnected:", socket.id, reason);

        leaveVoiceRoom(socket);
        leaveGameRoom(socket);

        onlineUsers.delete(socket.id);
        socketUsers.delete(socket.id);
    });
});

// =======================================================
// ERROR HANDLING
// =======================================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Not found",
        path: req.path
    });
});

app.use((error, req, res, next) => {
    console.error("Server error:", error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        error: "Internal server error"
    });
});

// =======================================================
// START
// =======================================================

server.listen(PORT, "0.0.0.0", () => {
    console.log("========================================");
    console.log(" PawanVoice Server Started");
    console.log(" Port:", PORT);
    console.log(" Voice seats: 9");
    console.log(" Max game players: 8");
    console.log(" Games:", GAME_CATALOG.length);
    console.log(" Socket.IO: enabled");
    console.log("========================================");
});

// =======================================================
// SHUTDOWN
// =======================================================

function shutdown(signal) {
    console.log(signal + " received. Closing server...");

    io.emit("server:shutdown", {
        message: "Server is shutting down."
    });

    server.close(() => {
        console.log("Server closed.");
        process.exit(0);
    });

    setTimeout(() => {
        process.exit(1);
    }, 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
