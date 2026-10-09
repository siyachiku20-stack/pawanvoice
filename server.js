"use strict";

/*
=========================================================
 PAWANVOICE - COMPLETE VOICE ROOM + ONLINE GAME SERVER
=========================================================

 Features:
 1. Express web server
 2. Socket.IO realtime connection
 3. Voice rooms with 9 seats
 4. Room chat and gifts
 5. Seat management
 6. Mic status
 7. WebRTC signaling
 8. Online game lobby
 9. Multiplayer game rooms (up to 8 players)
10. Single-player game sessions
11. Live game events and scores
12. Room and game disconnect handling
13. Health check and server status

 IMPORTANT:
 Game screens and game rules must be implemented in games.html.
 This server provides realtime multiplayer communication.
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

app.use(express.json({
    limit: "2mb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "2mb"
}));

// Serve HTML, CSS, JavaScript and other public files.
app.use(express.static(__dirname));

// =======================================================
// IN-MEMORY DATA
// =======================================================

// Voice rooms.
const rooms = new Map();

// Game rooms.
const gameRooms = new Map();

// Online users.
const onlineUsers = new Map();

// Connected socket information.
const socketUsers = new Map();

// Game catalogue.
// Add the matching game screens and logic in games.html.
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
// COMMON HELPERS
// =======================================================

function makeId(prefix = "") {
    return prefix + crypto.randomBytes(5).toString("hex");
}

function cleanText(value, maxLength = 100) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim().slice(0, maxLength);
}

function safeNumber(value, min = 0, max = 1000000000) {
    const n = Number(value);

    if (!Number.isFinite(n)) {
        return min;
    }

    return Math.max(min, Math.min(max, Math.floor(n)));
}

function getSocketUser(socket) {
    return socketUsers.get(socket.id) || {
        userId: socket.id,
        name: "Guest",
        dp: "",
        socketId: socket.id
    };
}

function roomChannel(roomId) {
    return "voice:" + roomId;
}

function gameChannel(gameRoomId) {
    return "game:" + gameRoomId;
}

function getPublicUser(user) {
    return {
        userId: user.userId,
        name: user.name,
        dp: user.dp || "",
        socketId: user.socketId
    };
}

// =======================================================
// VOICE ROOM MANAGEMENT
// =======================================================

function createVoiceRoom(roomId) {
    return {
        id: roomId,
        name: "PawanVoice Room",
        dp: "",
        ownerId: null,
        seats: Array.from({ length: 9 }, (_, index) => ({
            seat: index + 1,
            userId: null,
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
        users: Array.from(room.users.values()).map(getPublicUser),
        userCount: room.users.size,
        createdAt: room.createdAt
    };
}

function emitVoiceRoomUpdate(room) {
    io.to(roomChannel(room.id)).emit(
        "room:update",
        publicVoiceRoom(room)
    );

    // Compatibility event for clients using this event name.
    io.to(roomChannel(room.id)).emit(
        "roomUpdate",
        publicVoiceRoom(room)
    );
}

function joinVoiceRoom(socket, data = {}) {
    const user = getSocketUser(socket);

    const roomId = cleanText(
        data.roomId || data.room || data.id,
        60
    ) || "main";

    // Leave the previous voice room first.
    leaveVoiceRoom(socket);

    const room = getVoiceRoom(roomId);

    user.name = cleanText(data.name, 50) || user.name || "Guest";
    user.dp = cleanText(data.dp, 1000) || user.dp || "";

    socketUsers.set(socket.id, user);

    const member = {
        ...getPublicUser(user),
        joinedAt: Date.now()
    };

    room.users.set(socket.id, member);

    if (!room.ownerId) {
        room.ownerId = user.userId;
    }

    socket.join(roomChannel(roomId));

    socket.data.voiceRoomId = roomId;

    socket.emit("room:joined", {
        success: true,
        room: publicVoiceRoom(room),
        userId: user.userId
    });

    socket.emit("roomJoined", {
        success: true,
        room: publicVoiceRoom(room),
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

function leaveVoiceRoom(socket) {
    const roomId = socket.data.voiceRoomId;

    if (!roomId) {
        return;
    }

    const room = rooms.get(roomId);

    socket.leave(roomChannel(roomId));

    socket.data.voiceRoomId = null;

    if (!room) {
        return;
    }

    const user = getSocketUser(socket);

    room.users.delete(socket.id);

    // Release any seat occupied by this socket's user.
    room.seats.forEach(seat => {
        if (
            seat.userId === user.userId ||
            seat.socketId === socket.id
        ) {
            seat.userId = null;
            seat.socketId = null;
            seat.name = "";
            seat.dp = "";
            seat.micOn = false;
            seat.muted = false;
        }
    });

    // Select a new owner if the previous owner left.
    if (room.ownerId === user.userId) {
        const nextMember = room.users.values().next().value;

        room.ownerId = nextMember
            ? nextMember.userId
            : null;
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

// =======================================================
// GAME MANAGEMENT
// =======================================================

function getGameDefinition(gameId) {
    const id = cleanText(gameId, 60);

    return GAME_CATALOG.find(game => game.id === id) || null;
}

function createGameRoom(gameId, options = {}) {
    const definition = getGameDefinition(gameId);

    if (!definition) {
        return null;
    }

    const requestedMax = safeNumber(
        options.maxPlayers || definition.maxPlayers,
        1,
        8
    );

    const maxPlayers = Math.min(
        requestedMax,
        definition.maxPlayers,
        8
    );

    const gameRoomId = cleanText(options.roomId, 60) ||
        makeId("G");

    return {
        id: gameRoomId,
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

function getGameRoom(gameRoomId) {
    return gameRooms.get(cleanText(gameRoomId, 60));
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

    if (!gameRoomId) {
        return;
    }

    const game = getGameRoom(gameRoomId);

    socket.leave(gameChannel(gameRoomId));

    socket.data.gameRoomId = null;

    if (!game) {
        return;
    }

    const user = getSocketUser(socket);

    game.players.delete(socket.id);

    delete game.scores[user.userId];

    if (game.hostId === user.userId) {
        const nextPlayer = game.players.values().next().value;

        game.hostId = nextPlayer
            ? nextPlayer.userId
            : null;
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

    io.to(gameChannel(gameRoomId)).emit("game:playerLeft", {
        userId: user.userId,
        socketId: socket.id
    });

    io.to(gameChannel(gameRoomId)).emit("gamePlayerLeft", {
        userId: user.userId,
        socketId: socket.id
    });

    emitGameUpdate(game);
}

// =======================================================
// BASIC HTTP ROUTES
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
            "/api/games/rooms"
        ]
    });
});

app.get("/health", (req, res) => {
    res.status(200).json({
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

// List available games.
app.get("/api/games", (req, res) => {
    res.json({
        success: true,
        games: GAME_CATALOG
    });
});

// List currently active game rooms.
app.get("/api/games/rooms", (req, res) => {
    const list = Array.from(gameRooms.values()).map(game => ({
        id: game.id,
        gameId: game.gameId,
        gameName: game.gameName,
        status: game.status,
        playerCount: game.players.size,
        maxPlayers: game.maxPlayers
    }));

    res.json({
        success: true,
        rooms: list
    });
});

// List voice rooms.
app.get("/api/rooms", (req, res) => {
    res.json({
        success: true,
        rooms: Array.from(rooms.values()).map(publicVoiceRoom)
    });
});

// =======================================================
// SOCKET.IO CONNECTION
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
    // REGISTER / UPDATE USER PROFILE
    // ---------------------------------------------------

    function updateProfile(data = {}) {
        const user = getSocketUser(socket);

        if (data.userId !== undefined) {
            user.userId = cleanText(data.userId, 100) || user.userId;
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

        socket.emit("profile:updated", {
            success: true,
            user: getPublicUser(user)
        });

        return user;
    }

    socket.on("user:register", updateProfile);
    socket.on("profile:update", updateProfile);
    socket.on("registerUser", updateProfile);

    // ---------------------------------------------------
    // VOICE ROOM EVENTS
    // ---------------------------------------------------

    socket.on("room:join", data => {
        try {
            joinVoiceRoom(socket, data || {});
        } catch (error) {
            console.error("room:join error:", error.message);

            socket.emit("error:message", {
                message: "Unable to join room."
            });
        }
    });

    socket.on("joinRoom", data => {
        try {
            joinVoiceRoom(socket, data || {});
        } catch (error) {
            console.error("joinRoom error:", error.message);
        }
    });

    socket.on("room:leave", () => {
        leaveVoiceRoom(socket);
    });

    socket.on("leaveRoom", () => {
        leaveVoiceRoom(socket);
    });

    // Change room name or picture.
    socket.on("room:updateDetails", data => {
        const roomId = socket.data.voiceRoomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room) {
            return;
        }

        const user = getSocketUser(socket);

        if (
            room.ownerId !== user.userId &&
            !data?.isAdmin
        ) {
            socket.emit("error:message", {
                message: "Only the room owner can update room details."
            });

            return;
        }

        if (data.name !== undefined) {
            room.name = cleanText(data.name, 80) || room.name;
        }

        if (data.dp !== undefined) {
            room.dp = cleanText(data.dp, 1000);
        }

        emitVoiceRoomUpdate(room);
    });

    // ---------------------------------------------------
    // SEAT EVENTS
    // ---------------------------------------------------

    socket.on("seat:take", data => {
        const roomId = socket.data.voiceRoomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room) {
            socket.emit("error:message", {
                message: "Join a room first."
            });

            return;
        }

        const user = getSocketUser(socket);

        const seatNumber = safeNumber(
            data?.seat || data?.seatNumber,
            1,
            9
        );

        const seat = room.seats[seatNumber - 1];

        if (!seat) {
            return;
        }

        // A user can occupy only one seat at a time.
        const existing = room.seats.find(
            item => item.userId === user.userId
        );

        if (existing) {
            existing.userId = null;
            existing.socketId = null;
            existing.name = "";
            existing.dp = "";
            existing.micOn = false;
            existing.muted = false;
        }

        if (seat.userId && seat.userId !== user.userId) {
            socket.emit("seat:error", {
                seat: seatNumber,
                message: "This seat is already occupied."
            });

            return;
        }

        seat.userId = user.userId;
        seat.socketId = socket.id;
        seat.name = user.name;
        seat.dp = user.dp;
        seat.micOn = false;
        seat.muted = false;

        io.to(roomChannel(roomId)).emit("seat:taken", {
            seat: { ...seat }
        });

        io.to(roomChannel(roomId)).emit("seatTaken", {
            seat: { ...seat }
        });

        emitVoiceRoomUpdate(room);
    });

    socket.on("takeSeat", data => {
        socket.emit("seat:legacyRequestReceived", {
            seat: data?.seat || data?.seatNumber || 1
        });

        const roomId = socket.data.voiceRoomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room) {
            return;
        }

        const user = getSocketUser(socket);

        const seatNumber = safeNumber(
            data?.seat || data?.seatNumber,
            1,
            9
        );

        const seat = room.seats[seatNumber - 1];

        if (!seat) {
            return;
        }

        const occupied = room.seats.find(
            item => item.userId === user.userId
        );

        if (occupied) {
            occupied.userId = null;
            occupied.socketId = null;
            occupied.name = "";
            occupied.dp = "";
            occupied.micOn = false;
            occupied.muted = false;
        }

        if (seat.userId && seat.userId !== user.userId) {
            socket.emit("seat:error", {
                seat: seatNumber,
                message: "This seat is already occupied."
            });

            return;
        }

        Object.assign(seat, {
            userId: user.userId,
            socketId: socket.id,
            name: user.name,
            dp: user.dp,
            micOn: false,
            muted: false
        });

        io.to(roomChannel(roomId)).emit("seatTaken", {
            seat: { ...seat }
        });

        emitVoiceRoomUpdate(room);
    });

    socket.on("seat:leave", () => {
        const roomId = socket.data.voiceRoomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room) {
            return;
        }

        const user = getSocketUser(socket);

        const seat = room.seats.find(
            item => item.userId === user.userId
        );

        if (seat) {
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

            emitVoiceRoomUpdate(room);
        }
    });

    socket.on("leaveSeat", () => {
        const roomId = socket.data.voiceRoomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room) {
            return;
        }

        const user = getSocketUser(socket);

        const seat = room.seats.find(
            item => item.userId === user.userId
        );

        if (seat) {
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

            emitVoiceRoomUpdate(room);
        }
    });

    // ---------------------------------------------------
    // MICROPHONE STATUS
    // ---------------------------------------------------

    socket.on("mic:toggle", data => {
        const roomId = socket.data.voiceRoomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room) {
            return;
        }

        const user = getSocketUser(socket);

        const seat = room.seats.find(
            item => item.userId === user.userId
        );

        if (!seat) {
            socket.emit("mic:error", {
                message: "Take a seat before turning on the microphone."
            });

            return;
        }

        if (seat.muted && data?.enabled === true) {
            socket.emit("mic:error", {
                message: "Your microphone has been muted by the room owner."
            });

            return;
        }

        seat.micOn = data?.enabled !== undefined
            ? !!data.enabled
            : !seat.micOn;

        io.to(roomChannel(roomId)).emit("mic:updated", {
            userId: user.userId,
            seat: seat.seat,
            micOn: seat.micOn
        });

        emitVoiceRoomUpdate(room);
    });

    socket.on("toggleMic", data => {
        const roomId = socket.data.voiceRoomId;
        const room = roomId ? rooms.get(roomId) : null;

        if (!room) {
            return;
        }

        const user = getSocketUser(socket);

        const seat = room.seats.find(
            item => item.userId === user.userId
        );

        if (!seat) {
            return;
        }

        if (seat.muted && data?.enabled === true) {
            return;
        }

        seat.micOn = data?.enabled !== undefined
            ? !!data.enabled
            : !seat.micOn;

        io.to(roomChannel(roomId)).emit("mic:updated", {
            userId: user.userId,
            seat: seat.seat,
            micOn: seat.micOn
        });

        emitVoiceRoomUpdate(room);
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

        if (!message) {
            return;
        }

        const item = {
            id: makeId("MSG"),
            roomId,
            userId: user.userId,
            name: user.name,
            dp: user.dp,
            message,
            type: "text",
            timestamp: Date.now()
        };

        room.chat.push(item);

        if (room.chat.length > 100) {
            room.chat.shift();
        }

        io.to(roomChannel(roomId)).emit("chat:message", item);
        io.to(roomChannel(roomId)).emit("chatMessage", item);
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
            return;
        }

        const user = getSocketUser(socket);

        const giftId = cleanText(data.giftId || data.id, 60);
        const giftName = cleanText(data.giftName || data.name, 80);

        const gift = {
            id: makeId("GIFT"),
            roomId,
            senderId: user.userId,
            senderName: user.name,
            senderDp: user.dp,
            giftId,
            giftName,
            giftImage: cleanText(data.giftImage || data.image, 1000),
            receiverId: cleanText(data.receiverId, 100),
            receiverName: cleanText(data.receiverName, 50),
            quantity: safeNumber(data.quantity || 1, 1, 99),
            timestamp: Date.now()
        };

        room.gifts.push(gift);

        if (room.gifts.length > 100) {
            room.gifts.shift();
        }

        io.to(roomChannel(roomId)).emit("gift:received", gift);
        io.to(roomChannel(roomId)).emit("receiveGift", gift);
    }

    socket.on("gift:send", sendRoomGift);
    socket.on("sendGift", sendRoomGift);

    // ---------------------------------------------------
    // WEBRTC VOICE SIGNALING
    // ---------------------------------------------------

    socket.on("webrtc:offer", data => {
        const targetId = cleanText(data?.targetId, 100);

        if (!targetId || !io.sockets.sockets.has(targetId)) {
            return;
        }

        io.to(targetId).emit("webrtc:offer", {
            from: socket.id,
            offer: data.offer
        });
    });

    socket.on("webrtc:answer", data => {
        const targetId = cleanText(data?.targetId, 100);

        if (!targetId || !io.sockets.sockets.has(targetId)) {
            return;
        }

        io.to(targetId).emit("webrtc:answer", {
            from: socket.id,
            answer: data.answer
        });
    });

    socket.on("webrtc:ice", data => {
        const targetId = cleanText(data?.targetId, 100);

        if (!targetId || !io.sockets.sockets.has(targetId)) {
            return;
        }

        io.to(targetId).emit("webrtc:ice", {
            from: socket.id,
            candidate: data.candidate
        });
    });

    // Compatibility with clients using simpler signaling names.
    socket.on("voice:offer", data => {
        const targetId = cleanText(data?.targetId || data?.to, 100);

        if (targetId && io.sockets.sockets.has(targetId)) {
            io.to(targetId).emit("voice:offer", {
                from: socket.id,
                offer: data.offer
            });
        }
    });

    socket.on("voice:answer", data => {
        const targetId = cleanText(data?.targetId || data?.to, 100);

        if (targetId && io.sockets.sockets.has(targetId)) {
            io.to(targetId).emit("voice:answer", {
                from: socket.id,
                answer: data.answer
            });
        }
    });

    socket.on("voice:ice", data => {
        const targetId = cleanText(data?.targetId || data?.to, 100);

        if (targetId && io.sockets.sockets.has(targetId)) {
            io.to(targetId).emit("voice:ice", {
                from: socket.id,
                candidate: data.candidate
            });
        }
    });

    // ---------------------------------------------------
    // ONLINE GAME LOBBY
    // ---------------------------------------------------

    socket.on("game:lobby:join", () => {
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
    });

    socket.on("gameLobbyJoin", () => {
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
    });

    // ---------------------------------------------------
    // CREATE GAME ROOM
    // ---------------------------------------------------

    function handleCreateGame(data = {}) {
        const user = getSocketUser(socket);

        const gameId = cleanText(data.gameId || data.game, 60);
        const definition = getGameDefinition(gameId);

        if (!definition) {
            socket.emit("game:error", {
                message: "Game not found."
            });

            return;
        }

        leaveGameRoom(socket);

        const game = createGameRoom(gameId, {
            maxPlayers: data.maxPlayers,
            roomId: data.roomId
        });

        if (!game) {
            socket.emit("game:error", {
                message: "Unable to create game."
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

    socket.on("game:create", handleCreateGame);
    socket.on("createGame", handleCreateGame);

    // ---------------------------------------------------
    // JOIN GAME ROOM
    // ---------------------------------------------------

    function handleJoinGame(data = {}) {
        const user = getSocketUser(socket);

        const gameRoomId = cleanText(
            data.roomId || data.gameRoomId || data.id,
            60
        );

        const game = getGameRoom(gameRoomId);

        if (!game) {
            socket.emit("game:error", {
                message: "Game room not found."
            });

            return;
        }

        if (game.players.size >= game.maxPlayers) {
            socket.emit("game:error", {
                message: "This game room is full."
            });

            return;
        }

        if (game.status === "finished") {
            socket.emit("game:error", {
                message: "This game has already finished."
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

    socket.on("game:join", handleJoinGame);
    socket.on("joinGame", handleJoinGame);

    // ---------------------------------------------------
    // LEAVE GAME ROOM
    // ---------------------------------------------------

    socket.on("game:leave", () => {
        leaveGameRoom(socket);
    });

    socket.on("leaveGame", () => {
        leaveGameRoom(socket);
    });

    // ---------------------------------------------------
    // PLAYER READY STATUS
    // ---------------------------------------------------

    function handleGameReady(data = {}) {
        const gameRoomId = socket.data.gameRoomId;
        const game = gameRoomId ? getGameRoom(gameRoomId) : null;

        if (!game) {
            return;
        }

        const player = game.players.get(socket.id);

        if (!player) {
            return;
        }

        player.ready = data.ready !== undefined
            ? !!data.ready
            : !player.ready;

        io.to(gameChannel(game.id)).emit("game:playerReady", {
            userId: player.userId,
            ready: player.ready
        });

        emitGameUpdate(game);
    }

    socket.on("game:ready", handleGameReady);
    socket.on("gameReady", handleGameReady);

    // ---------------------------------------------------
    // START GAME
    // ---------------------------------------------------

    function handleStartGame() {
        const gameRoomId = socket.data.gameRoomId;
        const game = gameRoomId ? getGameRoom(gameRoomId) : null;

        if (!game) {
            socket.emit("game:error", {
                message: "Join a game room first."
            });

            return;
        }

        const user = getSocketUser(socket);

        if (game.hostId !== user.userId) {
            socket.emit("game:error", {
                message: "Only the game host can start the game."
            });

            return;
        }

        if (game.status === "playing") {
            return;
        }

        if (game.players.size < game.minPlayers) {
            socket.emit("game:error", {
                message: "Not enough players to start."
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

    socket.on("game:start", handleStartGame);
    socket.on("startGame", handleStartGame);

    // ---------------------------------------------------
    // LIVE GAME ACTIONS
    // ---------------------------------------------------

    /*
      Games can send their moves through game:action.

      Example:
      socket.emit("game:action", {
          action: "move",
          data: { x: 2, y: 3 }
      });

      The server relays the action to the other players.
      Actual game rules must be implemented by the game.
    */

    function handleGameAction(payload = {}) {
        const gameRoomId = socket.data.gameRoomId;
        const game = gameRoomId ? getGameRoom(gameRoomId) : null;

        if (!game || game.status !== "playing") {
            socket.emit("game:error", {
                message: "The game is not currently running."
            });

            return;
        }

        const player = game.players.get(socket.id);

        if (!player) {
            return;
        }

        const action = cleanText(payload.action, 60);

        if (!action) {
            return;
        }

        const data = payload.data;

        // Limit payload size to prevent oversized game events.
        let serialized;

        try {
            serialized = JSON.stringify(data === undefined ? null : data);
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
            data: data === undefined ? null : data,
            userId: player.userId,
            playerName: player.name,
            timestamp: Date.now()
        };

        socket.to(gameChannel(game.id)).emit("game:action", event);

        socket.to(gameChannel(game.id)).emit("gameAction", event);
    }

    socket.on("game:action", handleGameAction);
    socket.on("gameAction", handleGameAction);

    // ---------------------------------------------------
    // UPDATE PLAYER SCORE
    // ---------------------------------------------------

    function handleScoreUpdate(data = {}) {
        const gameRoomId = socket.data.gameRoomId;
        const game = gameRoomId ? getGameRoom(gameRoomId) : null;

        if (!game || game.status !== "playing") {
            return;
        }

        const player = game.players.get(socket.id);

        if (!player) {
            return;
        }

        /*
          Scores are limited to non-negative values.
          For competitive games, validate scoring against the
          actual game rules before accepting scores in production.
        */

        const score = safeNumber(data.score, 0, 1000000000);

        game.scores[player.userId] = score;

        io.to(gameChannel(game.id)).emit("game:scoreUpdate", {
            userId: player.userId,
            name: player.name,
            score
        });

        emitGameUpdate(game);
    }

    socket.on("game:score", handleScoreUpdate);
    socket.on("updateGameScore", handleScoreUpdate);

    // ---------------------------------------------------
    // UPDATE SHARED GAME STATE
    // ---------------------------------------------------

    socket.on("game:state", data => {
        const gameRoomId = socket.data.gameRoomId;
        const game = gameRoomId ? getGameRoom(gameRoomId) : null;

        if (!game || game.status !== "playing") {
            return;
        }

        const user = getSocketUser(socket);

        if (game.hostId !== user.userId) {
            socket.emit("game:error", {
                message: "Only the game host can update shared game state."
            });

            return;
        }

        let serialized;

        try {
            serialized = JSON.stringify(data || {});
        } catch {
            return;
        }

        if (serialized.length > 20000) {
            return;
        }

        game.state = data || {};
        game.updatedAt = Date.now();

        socket.to(gameChannel(game.id)).emit("game:state", {
            state: game.state,
            timestamp: game.updatedAt
        });
    });

    // ---------------------------------------------------
    // FINISH GAME
    // ---------------------------------------------------

    socket.on("game:finish", data => {
        const gameRoomId = socket.data.gameRoomId;
        const game = gameRoomId ? getGameRoom(gameRoomId) : null;

        if (!game) {
            return;
        }

        const user = getSocketUser(socket);

        if (game.hostId !== user.userId) {
            socket.emit("game:error", {
                message: "Only the game host can finish the game."
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

    // ---------------------------------------------------
    // RETURN TO WAITING ROOM
    // ---------------------------------------------------

    socket.on("game:reset", () => {
        const gameRoomId = socket.data.gameRoomId;
        const game = gameRoomId ? getGameRoom(gameRoomId) : null;

        if (!game) {
            return;
        }

        const user = getSocketUser(socket);

        if (game.hostId !== user.userId) {
            return;
        }

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
    // GAME ROOM CHAT
    // ---------------------------------------------------

    socket.on("game:chat", data => {
        const gameRoomId = socket.data.gameRoomId;
        const game = gameRoomId ? getGameRoom(gameRoomId) : null;

        if (!game) {
            return;
        }

        const user = getSocketUser(socket);

        if (!game.players.has(socket.id)) {
            return;
        }

        const message = cleanText(data?.message, 500);

        if (!message) {
            return;
        }

        const chatMessage = {
            userId: user.userId,
            name: user.name,
            message,
            timestamp: Date.now()
        };

        io.to(gameChannel(game.id)).emit(
            "game:chatMessage",
            chatMessage
        );
    });

    // ---------------------------------------------------
    // PING / CONNECTION CHECK
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
// START SERVER
// =======================================================

server.listen(PORT, "0.0.0.0", () => {
    console.log("========================================");
    console.log(" PawanVoice Server Started");
    console.log(" Port:", PORT);
    console.log(" Voice seats: 9");
    console.log(" Maximum game players: 8");
    console.log(" Available games:", GAME_CATALOG.length);
    console.log(" Socket.IO: enabled");
    console.log("========================================");
});

// =======================================================
// GRACEFUL SHUTDOWN
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
