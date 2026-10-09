"use strict";

/* =========================================
   PawanVoice Online Games — game.js
   Games:
   1. Greedy Baby
   2. Snake
   3. 2048
   4. Fruit Cut
   5. Ludo
   6. UNO
   7. Carrom
   8. Chess

   Online connection: Socket.IO
========================================= */

(function () {
  const PVGames = {
    socket: null,
    currentGame: "",
    currentRoom: "",
    playerName: "Guest",
    playerId: "",
    score: 0,
    connected: false,
    gameState: {},
    listeners: {},

    init(options = {}) {
      this.playerName =
        options.playerName ||
        localStorage.getItem("pv_player_name") ||
        "Guest";

      this.playerId =
        options.playerId ||
        localStorage.getItem("pv_user_id") ||
        this.createId();

      localStorage.setItem("pv_player_name", this.playerName);
      localStorage.setItem("pv_user_id", this.playerId);

      if (typeof window.io === "function") {
        this.connect();
      }

      this.emitLocal("ready", {
        playerName: this.playerName,
        playerId: this.playerId
      });

      return this;
    },

    createId() {
      return "PV" + Math.random().toString(36).slice(2, 12).toUpperCase();
    },

    connect() {
      if (this.socket && this.socket.connected) {
        return this.socket;
      }

      try {
        this.socket = window.io({
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000
        });

        this.socket.on("connect", () => {
          this.connected = true;

          this.emitLocal("connected", {
            socketId: this.socket.id
          });
        });

        this.socket.on("disconnect", () => {
          this.connected = false;
          this.emitLocal("disconnected", {});
        });

        this.socket.on("connect_error", (error) => {
          this.emitLocal("connectionError", {
            message: error.message || "Connection failed"
          });
        });

        this.registerSocketEvents();
      } catch (error) {
        this.emitLocal("connectionError", {
          message: error.message || "Socket connection failed"
        });
      }

      return this.socket;
    },

    registerSocketEvents() {
      if (!this.socket) return;

      const events = [
        "game:created",
        "game:joined",
        "game:state",
        "game:playerJoined",
        "game:playerLeft",
        "game:action",
        "game:chat",
        "game:ended",
        "game:error"
      ];

      events.forEach((eventName) => {
        this.socket.on(eventName, (data) => {
          this.emitLocal(eventName, data || {});
        });
      });
    },

    on(eventName, callback) {
      if (!this.listeners[eventName]) {
        this.listeners[eventName] = [];
      }

      this.listeners[eventName].push(callback);

      return () => {
        this.listeners[eventName] =
          (this.listeners[eventName] || []).filter(
            (fn) => fn !== callback
          );
      };
    },

    emitLocal(eventName, data) {
      (this.listeners[eventName] || []).forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error("PawanVoice game listener error:", error);
        }
      });
    },

    send(eventName, data = {}) {
      if (!this.socket || !this.socket.connected) {
        this.emitLocal("connectionError", {
          message: "Server se connection nahi hai."
        });
        return false;
      }

      this.socket.emit(eventName, data);
      return true;
    },

    createRoom(gameType, roomName = "") {
      this.currentGame = gameType;
      this.currentRoom = this.createId();

      const data = {
        gameType,
        gameId: this.currentRoom,
        roomId: this.currentRoom,
        roomName: roomName || gameType + " Room",
        playerName: this.playerName,
        userId: this.playerId
      };

      this.emitLocal("roomCreating", data);

      // Server ko uske supported event format mein request bhejein.
      this.send("game:create", data);

      return data;
    },

    joinRoom(roomId, gameType = "") {
      if (!roomId) {
        this.emitLocal("game:error", {
          message: "Room ID enter karein."
        });
        return false;
      }

      this.currentRoom = String(roomId);
      this.currentGame = gameType || this.currentGame;

      return this.send("game:join", {
        gameId: this.currentRoom,
        roomId: this.currentRoom,
        gameType: this.currentGame,
        playerName: this.playerName,
        userId: this.playerId
      });
    },

    leaveRoom() {
      if (!this.currentRoom) return;

      this.send("game:leave", {
        gameId: this.currentRoom,
        roomId: this.currentRoom,
        userId: this.playerId
      });

      this.currentRoom = "";
      this.currentGame = "";
      this.gameState = {};
      this.score = 0;

      this.emitLocal("roomLeft", {});
    },

    action(action, payload = {}) {
      if (!this.currentRoom) {
        this.emitLocal("game:error", {
          message: "Pehle game room join karein."
        });
        return false;
      }

      return this.send("game:action", {
        gameId: this.currentRoom,
        roomId: this.currentRoom,
        gameType: this.currentGame,
        userId: this.playerId,
        playerName: this.playerName,
        action,
        payload,
        timestamp: Date.now()
      });
    },

    sendChat(message) {
      const text = String(message || "").trim();

      if (!text) return false;

      return this.send("game:chat", {
        gameId: this.currentRoom,
        roomId: this.currentRoom,
        userId: this.playerId,
        playerName: this.playerName,
        message: text.slice(0, 300),
        timestamp: Date.now()
      });
    },

    setScore(value) {
      this.score = Math.max(0, Number(value) || 0);

      this.emitLocal("scoreChanged", {
        score: this.score
      });

      return this.score;
    },

    addScore(value = 1) {
      return this.setScore(this.score + (Number(value) || 0));
    },

    resetScore() {
      return this.setScore(0);
    },

    saveProgress(key, value) {
      const storageKey =
        "pv_game_" + this.currentGame + "_" + this.playerId + "_" + key;

      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
        return true;
      } catch (error) {
        console.error("Progress save nahi hua:", error);
        return false;
      }
    },

    loadProgress(key, fallback = null) {
      const storageKey =
        "pv_game_" + this.currentGame + "_" + this.playerId + "_" + key;

      try {
        const value = localStorage.getItem(storageKey);
        return value === null ? fallback : JSON.parse(value);
      } catch (error) {
        return fallback;
      }
    },

    endGame(result = {}) {
      this.emitLocal("gameFinished", result);

      this.send("game:action", {
        gameId: this.currentRoom,
        roomId: this.currentRoom,
        userId: this.playerId,
        action: "gameFinished",
        payload: result
      });
    }
  };

  /* =========================================
     Local game utilities
  ========================================= */

  const PVGameUtils = {
    random(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    shuffle(array) {
      const result = array.slice();

      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }

      return result;
    },

    formatTime(seconds) {
      const s = Math.max(0, Math.floor(seconds));
      const minutes = Math.floor(s / 60);
      const remaining = s % 60;

      return (
        String(minutes).padStart(2, "0") +
        ":" +
        String(remaining).padStart(2, "0")
      );
    },

    randomRoomId() {
      return String(PVGameUtils.random(100000, 999999));
    },

    showMessage(message) {
      let box = document.getElementById("pv-game-message");

      if (!box) {
        box = document.createElement("div");
        box.id = "pv-game-message";

        Object.assign(box.style, {
          position: "fixed",
          left: "50%",
          bottom: "90px",
          transform: "translateX(-50%)",
          zIndex: "99999",
          background: "#222",
          color: "#fff",
          padding: "12px 18px",
          borderRadius: "12px",
          fontSize: "14px",
          maxWidth: "85%",
          textAlign: "center",
          boxShadow: "0 4px 18px #0004"
        });

        document.body.appendChild(box);
      }

      box.textContent = message;
      box.style.display = "block";

      clearTimeout(box._hideTimer);

      box._hideTimer = setTimeout(() => {
        box.style.display = "none";
      }, 2500);
    }
  };

  /* =========================================
     Snake game logic
  ========================================= */

  const SnakeGame = {
    size: 16,
    snake: [],
    food: null,
    direction: "right",
    nextDirection: "right",
    score: 0,
    running: false,
    timer: null,

    start() {
      this.stop();

      this.snake = [
        { x: 5, y: 8 },
        { x: 4, y: 8 },
        { x: 3, y: 8 }
      ];

      this.direction = "right";
      this.nextDirection = "right";
      this.score = 0;
      this.running = true;

      this.spawnFood();
      this.loop();

      return this.getState();
    },

    spawnFood() {
      let food;

      do {
        food = {
          x: PVGameUtils.random(0, this.size - 1),
          y: PVGameUtils.random(0, this.size - 1)
        };
      } while (
        this.snake.some(
          (part) => part.x === food.x && part.y === food.y
        )
      );

      this.food = food;
    },

    turn(direction) {
      const opposite = {
        up: "down",
        down: "up",
        left: "right",
        right: "left"
      };

      if (opposite[direction] === this.direction) return;

      this.nextDirection = direction;
    },

    tick() {
      if (!this.running) return;

      this.direction = this.nextDirection;

      const head = { ...this.snake[0] };

      if (this.direction === "up") head.y--;
      if (this.direction === "down") head.y++;
      if (this.direction === "left") head.x--;
      if (this.direction === "right") head.x++;

      const outside =
        head.x < 0 ||
        head.y < 0 ||
        head.x >= this.size ||
        head.y >= this.size;

      const eating =
        this.food &&
        head.x === this.food.x &&
        head.y === this.food.y;

      const body = eating ? this.snake : this.snake.slice(0, -1);

      const hitBody = body.some(
        (part) => part.x === head.x && part.y === head.y
      );

      if (outside || hitBody) {
        this.stop();

        PVGames.emitLocal("snakeGameOver", {
          score: this.score
        });

        return;
      }

      this.snake.unshift(head);

      if (eating) {
        this.score += 10;
        this.spawnFood();
        PVGames.emitLocal("snakeScore", {
          score: this.score
        });
      } else {
        this.snake.pop();
      }

      PVGames.emitLocal("snakeUpdate", this.getState());
    },

    loop() {
      if (!this.running) return;

      this.tick();

      if (this.running) {
        this.timer = setTimeout(() => this.loop(), 140);
      }
    },

    stop() {
      this.running = false;
      clearTimeout(this.timer);
      this.timer = null;
    },

    getState() {
      return {
        size: this.size,
        snake: this.snake.map((part) => ({ ...part })),
        food: this.food ? { ...this.food } : null,
        score: this.score,
        running: this.running
      };
    }
  };

  /* =========================================
     2048 game logic
  ========================================= */

  const Game2048 = {
    board: [],
    score: 0,
    over: false,

    start() {
      this.board = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
      this.score = 0;
      this.over = false;

      this.addTile();
      this.addTile();

      return this.getState();
    },

    addTile() {
      const empty = [];

      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          if (this.board[r][c] === 0) {
            empty.push({ r, c });
          }
        }
      }

      if (!empty.length) return false;

      const cell = empty[PVGameUtils.random(0, empty.length - 1)];

      this.board[cell.r][cell.c] = Math.random() < 0.9 ? 2 : 4;

      return true;
    },

    slide(row) {
      const values = row.filter((value) => value !== 0);
      const result = [];
      let gained = 0;

      for (let i = 0; i < values.length; i++) {
        if (values[i] === values[i + 1]) {
          const merged = values[i] * 2;
          result.push(merged);
          gained += merged;
          i++;
        } else {
          result.push(values[i]);
        }
      }

      while (result.length < 4) result.push(0);

      return { row: result, gained };
    },

    move(direction) {
      if (this.over) return this.getState();

      const old = JSON.stringify(this.board);
      let gained = 0;

      for (let i = 0; i < 4; i++) {
        let line = [];

        for (let j = 0; j < 4; j++) {
          if (direction === "left" || direction === "right") {
            line.push(this.board[i][j]);
          } else {
            line.push(this.board[j][i]);
          }
        }

        if (direction === "right" || direction === "down") {
          line.reverse();
        }

        const result = this.slide(line);
        line = result.row;
        gained += result.gained;

        if (direction === "right" || direction === "down") {
          line.reverse();
        }

        for (let j = 0; j < 4; j++) {
          if (direction === "left" || direction === "right") {
            this.board[i][j] = line[j];
          } else {
            this.board[j][i] = line[j];
          }
        }
      }

      if (old !== JSON.stringify(this.board)) {
        this.score += gained;
        this.addTile();
      }

      this.over = !this.canMove();

      const state = this.getState();

      PVGames.emitLocal("2048Update", state);

      if (this.over) {
        PVGames.emitLocal("2048GameOver", state);
      }

      return state;
    },

    canMove() {
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          if (this.board[r][c] === 0) return true;

          if (
            c < 3 &&
            this.board[r][c] === this.board[r][c + 1]
          ) {
            return true;
          }

          if (
            r < 3 &&
            this.board[r][c] === this.board[r + 1][c]
          ) {
            return true;
          }
        }
      }

      return false;
    },

    getState() {
      return {
        board: this.board.map((row) => row.slice()),
        score: this.score,
        over: this.over
      };
    }
  };

  /* =========================================
     Game catalogue
  ========================================= */

  const catalogue = [
    {
      id: "greedy-baby",
      name: "Greedy Baby",
      type: "casual",
      players: "1–4",
      description: "Fun casual challenge"
    },
    {
      id: "snake",
      name: "Snake",
      type: "arcade",
      players: "1",
      description: "Eat food and grow"
    },
    {
      id: "2048",
      name: "2048",
      type: "puzzle",
      players: "1",
      description: "Join matching numbers"
    },
    {
      id: "fruit-cut",
      name: "Fruit Cut",
      type: "arcade",
      players: "1",
      description: "Slice fruit and score"
    },
    {
      id: "ludo",
      name: "Ludo",
      type: "board",
      players: "2–4",
      description: "Play with friends online"
    },
    {
      id: "uno",
      name: "UNO",
      type: "card",
      players: "2–4",
      description: "Online card room"
    },
    {
      id: "carrom",
      name: "Carrom",
      type: "board",
      players: "2–4",
      description: "Carrom room"
    },
    {
      id: "chess",
      name: "Chess",
      type: "board",
      players: "2",
      description: "Challenge another player"
    }
  ];

  PVGames.catalogue = catalogue;
  PVGames.utils = PVGameUtils;
  PVGames.snake = SnakeGame;
  PVGames.game2048 = Game2048;

  /* =========================================
     Keyboard controls
  ========================================= */

  document.addEventListener("keydown", (event) => {
    const target = event.target;

    if (
      target &&
      (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
    ) {
      return;
    }

    const keyMap = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right"
    };

    const direction = keyMap[event.key];

    if (direction && SnakeGame.running) {
      event.preventDefault();
      SnakeGame.turn(direction);
      return;
    }

    if (direction && !SnakeGame.running) {
      Game2048.move(direction);
    }
  });

  /* =========================================
     Touch swipe controls
  ========================================= */

  let touchStartX = 0;
  let touchStartY = 0;

  document.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.changedTouches[0];

      touchStartX = touch.screenX;
      touchStartY = touch.screenY;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchend",
    (event) => {
      const touch = event.changedTouches[0];

      const dx = touch.screenX - touchStartX;
      const dy = touch.screenY - touchStartY;

      if (Math.max(Math.abs(dx), Math.abs(dy)) < 25) return;

      let direction;

      if (Math.abs(dx) > Math.abs(dy)) {
        direction = dx > 0 ? "right" : "left";
      } else {
        direction = dy > 0 ? "down" : "up";
      }

      if (SnakeGame.running) {
        SnakeGame.turn(direction);
      } else {
        Game2048.move(direction);
      }
    },
    { passive: true }
  );

  /* =========================================
     Public API
  ========================================= */

  window.PVGames = PVGames;

  window.PVGamesReady = true;

  document.dispatchEvent(
    new CustomEvent("pawangames:ready", {
      detail: {
        games: catalogue.map((game) => game.id)
      }
    })
  );

  console.log("PawanVoice game.js loaded successfully.");
})();
