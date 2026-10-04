const PV_FIREBASE_DB =
  "https://pawanvoice-68c5e-default-rtdb.firebaseio.com";

const PV_DEFAULT_DP =
  "https://i.pravatar.cc/200?img=12";

const PV_DEFAULT_FRAME = {
  id: "default",
  name: "Default Frame",
  image: "",
  active: true
};

const PV_DEFAULT_BADGE = {
  id: "default",
  name: "New User",
  image: "",
  active: true
};

const PV_DEFAULT_ENTRY = {
  id: "default",
  name: "Default Entry",
  image: "",
  active: true
};

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeObject(value, fallback) {
  return value && typeof value === "object"
    ? value
    : fallback;
}

function pvGetUserId() {
  return (
    localStorage.getItem("pv_userId") ||
    "pawan"
  );
}

function pvGetLocalUser() {

  let frame = PV_DEFAULT_FRAME;
  let badge = PV_DEFAULT_BADGE;
  let entry = PV_DEFAULT_ENTRY;

  try {
    frame = JSON.parse(
      localStorage.getItem("pv_avatarFrame") ||
      JSON.stringify(PV_DEFAULT_FRAME)
    );
  } catch {}

  try {
    badge = JSON.parse(
      localStorage.getItem("pv_badge") ||
      JSON.stringify(PV_DEFAULT_BADGE)
    );
  } catch {}

  try {
    entry = JSON.parse(
      localStorage.getItem("pv_entryEffect") ||
      JSON.stringify(PV_DEFAULT_ENTRY)
    );
  } catch {}

  return {

    userId:
      pvGetUserId(),

    name:
      localStorage.getItem("pv_name") ||
      "Pawan User",

    dp:
      localStorage.getItem("pv_dp") ||
      PV_DEFAULT_DP,

    level:
      safeNumber(
        localStorage.getItem("pv_level"),
        1
      ),

    exp:
      safeNumber(
        localStorage.getItem("pv_exp"),
        0
      ),

    coins:
      safeNumber(
        localStorage.getItem("pv_coins"),
        0
      ),

    diamonds:
      safeNumber(
        localStorage.getItem("pv_diamonds"),
        0
      ),

    following:
      safeNumber(
        localStorage.getItem("pv_following"),
        0
      ),

    followers:
      safeNumber(
        localStorage.getItem("pv_followers"),
        0
      ),

    vipLevel:
      safeNumber(
        localStorage.getItem("pv_vipLevel"),
        0
      ),

    vipExp:
      safeNumber(
        localStorage.getItem("pv_vipExp"),
        0
      ),

    avatarFrame:
      safeObject(
        frame,
        PV_DEFAULT_FRAME
      ),

    badge:
      safeObject(
        badge,
        PV_DEFAULT_BADGE
      ),

    entryEffect:
      safeObject(
        entry,
        PV_DEFAULT_ENTRY
      )

  };
}

function pvSaveLocalUser(user) {

  if (!user) return;

  localStorage.setItem(
    "pv_userId",
    user.userId || pvGetUserId()
  );

  localStorage.setItem(
    "pv_name",
    user.name || "Pawan User"
  );

  localStorage.setItem(
    "pv_dp",
    user.dp || PV_DEFAULT_DP
  );

  localStorage.setItem(
    "pv_level",
    safeNumber(user.level, 1)
  );

  localStorage.setItem(
    "pv_exp",
    safeNumber(user.exp, 0)
  );

  localStorage.setItem(
    "pv_coins",
    safeNumber(user.coins, 0)
  );

  localStorage.setItem(
    "pv_diamonds",
    safeNumber(user.diamonds, 0)
  );

  localStorage.setItem(
    "pv_following",
    safeNumber(user.following, 0)
  );

  localStorage.setItem(
    "pv_followers",
    safeNumber(user.followers, 0)
  );

  localStorage.setItem(
    "pv_vipLevel",
    safeNumber(user.vipLevel, 0)
  );

  localStorage.setItem(
    "pv_vipExp",
    safeNumber(user.vipExp, 0)
  );

  localStorage.setItem(
    "pv_avatarFrame",
    JSON.stringify(
      user.avatarFrame ||
      PV_DEFAULT_FRAME
    )
  );

  localStorage.setItem(
    "pv_badge",
    JSON.stringify(
      user.badge ||
      PV_DEFAULT_BADGE
    )
  );

  localStorage.setItem(
    "pv_entryEffect",
    JSON.stringify(
      user.entryEffect ||
      PV_DEFAULT_ENTRY
    )
  );
}

async function pvLoadUser() {

  const localUser =
    pvGetLocalUser();

  try {

    const response =
      await fetch(
        PV_FIREBASE_DB +
        "/users/" +
        encodeURIComponent(
          localUser.userId
        ) +
        ".json"
      );

    if (!response.ok) {
      throw new Error(
        "Firebase HTTP " +
        response.status
      );
    }

    const firebaseUser =
      await response.json();

    if (!firebaseUser) {

      pvSaveLocalUser(
        localUser
      );

      return localUser;
    }

    const user = {

      userId:
        firebaseUser.userId ||
        localUser.userId,

      name:
        firebaseUser.name ||
        localUser.name,

      dp:
        firebaseUser.dp ||
        localUser.dp,

      level:
        safeNumber(
          firebaseUser.level,
          localUser.level
        ),

      exp:
        safeNumber(
          firebaseUser.exp,
          localUser.exp
        ),

      coins:
        safeNumber(
          firebaseUser.coins,
          localUser.coins
        ),

      diamonds:
        safeNumber(
          firebaseUser.diamonds,
          localUser.diamonds
        ),

      following:
        safeNumber(
          firebaseUser.following,
          localUser.following
        ),

      followers:
        safeNumber(
          firebaseUser.followers,
          localUser.followers
        ),

      vipLevel:
        safeNumber(
          firebaseUser.vipLevel,
          localUser.vipLevel
        ),

      vipExp:
        safeNumber(
          firebaseUser.vipExp,
          localUser.vipExp
        ),

      avatarFrame:
        safeObject(
          firebaseUser.avatarFrame,
          localUser.avatarFrame
        ),

      badge:
        safeObject(
          firebaseUser.badge,
          localUser.badge
        ),

      entryEffect:
        safeObject(
          firebaseUser.entryEffect,
          localUser.entryEffect
        )

    };

    pvSaveLocalUser(user);

    return user;

  } catch (error) {

    console.error(
      "PawanVoice user load:",
      error
    );

    return localUser;
  }
}

async function pvSaveUser(user) {

  if (!user || !user.userId) {

    throw new Error(
      "User ID missing"
    );

  }

  const response =
    await fetch(
      PV_FIREBASE_DB +
      "/users/" +
      encodeURIComponent(
        user.userId
      ) +
      ".json",
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({

            userId:
              user.userId,

            name:
              user.name ||
              "Pawan User",

            dp:
              user.dp ||
              PV_DEFAULT_DP,

            level:
              safeNumber(
                user.level,
                1
              ),

            exp:
              safeNumber(
                user.exp,
                0
              ),

            coins:
              safeNumber(
                user.coins,
                0
              ),

            diamonds:
              safeNumber(
                user.diamonds,
                0
              ),

            following:
              safeNumber(
                user.following,
                0
              ),

            followers:
              safeNumber(
                user.followers,
                0
              ),

            vipLevel:
              safeNumber(
                user.vipLevel,
                0
              ),

            vipExp:
              safeNumber(
                user.vipExp,
                0
              ),

            avatarFrame:
              user.avatarFrame ||
              PV_DEFAULT_FRAME,

            badge:
              user.badge ||
              PV_DEFAULT_BADGE,

            entryEffect:
              user.entryEffect ||
              PV_DEFAULT_ENTRY,

            updatedAt:
              Date.now()

          })
      }
    );

  if (!response.ok) {

    throw new Error(
      "Firebase save failed: " +
      response.status
    );

  }

  const saved =
    await response.json();

  const finalUser =
    saved || user;

  pvSaveLocalUser(
    finalUser
  );

  return finalUser;
}
