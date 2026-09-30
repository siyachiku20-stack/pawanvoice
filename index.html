class VoiceRoom {
  constructor(roomId, seatCount = 5) {
    this.roomId = roomId;
    this.seats = Array.from({ length: seatCount }, (_, i) => ({
      seatNo: i + 1,
      user: null,
    }));
    this.users = new Map();
  }

  join(userId, nickname) {
    this.users.set(userId, { userId, nickname, coins: 0 });
    console.log(`[VoiceRoom] ${nickname} joined room ${this.roomId}`);
  }

  takeSeat(userId, seatNo) {
    const user = this.users.get(userId);
    const seat = this.seats.find((s) => s.seatNo === seatNo);
    if (!user || !seat || seat.user) return false;

    seat.user = user;
    console.log(`[VoiceRoom] ${user.nickname} took seat ${seatNo}`);
    return true;
  }

  sendGift(fromUserId, toUserId, giftName, amount) {
    const from = this.users.get(fromUserId);
    const to = this.users.get(toUserId);
    if (!from || !to) return;

    to.coins += amount;
    console.log(
      `[VoiceRoom][Gift] ${from.nickname} -> ${to.nickname}, gift=${giftName}, amount=${amount}`
    );
  }

  printState() {
    console.log("\n[VoiceRoom] Current seats:");
    this.seats.forEach((seat) => {
      const name = seat.user ? seat.user.nickname : "Empty";
      console.log(`  seat ${seat.seatNo}: ${name}`);
    });

    console.log("\n[VoiceRoom] User coins:");
    this.users.forEach((user) => {
      console.log(`  ${user.nickname}: ${user.coins}`);
    });
  }
}

function runDemo() {
  const room = new VoiceRoom("room_1001", 5);

  room.join("u1", "Host_Alice");
  room.join("u2", "Mike_Bob");
  room.join("u3", "Luna_Chris");

  room.takeSeat("u1", 1);
  room.takeSeat("u2", 2);
  room.takeSeat("u3", 3);

  room.sendGift("u2", "u1", "Rocket", 200);
  room.sendGift("u3", "u1", "Crown", 500);

  room.printState();
}

runDemo();
