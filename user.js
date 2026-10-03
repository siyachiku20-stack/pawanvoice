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

function pvGetUserId() {
  return localStorage.getItem("pv_userId") || "pawan";
}

function pvGetLocalUser() {

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
      Number(
        localStorage.getItem("pv_level") || 1
      ),

    exp:
      Number(
        localStorage.getItem("pv_exp") || 0
      ),

    coins:
      Number(
        localStorage.getItem("pv_coins") || 0
      ),

    following:
      Number(
        localStorage.getItem("pv_following") || 0
      ),

    followers:
      Number(
        localStorage.getItem("pv_followers") || 0
      ),

    vipLevel:
      Number(
        localStorage.getItem("pv_vipLevel") || 0
      ),

    vipExp:
      Number(
        localStorage.getItem("pv_vipExp") || 0
      ),

    avatarFrame:
      JSON.parse(
        localStorage.getItem("pv_avatarFrame") ||
        JSON.stringify(PV_DEFAULT_FRAME)
      ),

    badge:
      JSON.parse(
        localStorage.getItem("pv_badge") ||
        JSON.stringify(PV_DEFAULT_BADGE)
      ),

    entryEffect:
      JSON.parse(
        localStorage.getItem("pv_entryEffect") ||
        JSON.stringify(PV_DEFAULT_ENTRY)
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
    Number(user.level || 1)
  );

  localStorage.setItem(
    "pv_exp",
    Number(user.exp || 0)
  );

  localStorage.setItem(
    "pv_coins",
    Number(user.coins || 0)
  );

  localStorage.setItem(
    "pv_following",
    Number(user.following || 0)
  );

  localStorage.setItem(
    "pv_followers",
    Number(user.followers || 0)
  );

  localStorage.setItem(
    "pv_vipLevel",
    Number(user.vipLevel || 0)
  );

  localStorage.setItem(
    "pv_vipExp",
    Number(user.vipExp || 0)
  );

  localStorage.setItem(
    "pv_avatarFrame",
    JSON.stringify(
      user.avatarFrame || PV_DEFAULT_FRAME
    )
  );

  localStorage.setItem(
    "pv_badge",
    JSON.stringify(
      user.badge || PV_DEFAULT_BADGE
    )
  );

  localStorage.setItem(
    "pv_entryEffect",
    JSON.stringify(
      user.entryEffect || PV_DEFAULT_ENTRY
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
        Number(
          firebaseUser.level ??
          localUser.level
        ),

      exp:
        Number(
          firebaseUser.exp ??
          localUser.exp
        ),

      coins:
        Number(
          firebaseUser.coins ??
          localUser.coins
        ),

      following:
        Number(
          firebaseUser.following ??
          localUser.following
        ),

      followers:
        Number(
          firebaseUser.followers ??
          localUser.followers
        ),

      vipLevel:
        Number(
          firebaseUser.vipLevel ??
          localUser.vipLevel
        ),

      vipExp:
        Number(
          firebaseUser.vipExp ??
          localUser.vipExp
        ),

      avatarFrame:
        firebaseUser.avatarFrame ||
        localUser.avatarFrame ||
        PV_DEFAULT_FRAME,

      badge:
        firebaseUser.badge ||
        localUser.badge ||
        PV_DEFAULT_BADGE,

      entryEffect:
        firebaseUser.entryEffect ||
        localUser.entryEffect ||
        PV_DEFAULT_ENTRY

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

  const existing =
    await pvLoadUser();

  const finalUser = {

    ...existing,

    ...user,

    userId:
      user.userId ||
      existing.userId,

    name:
      user.name ||
      existing.name,

    dp:
      user.dp ||
      existing.dp,

    level:
      Number(
        user.level ??
        existing.level ??
        1
      ),

    exp:
      Number(
        user.exp ??
        existing.exp ??
        0
      ),

    coins:
      Number(
        user.coins ??
        existing.coins ??
        0
      ),

    following:
      Number(
        user.following ??
        existing.following ??
        0
      ),

    followers:
      Number(
        user.followers ??
        existing.followers ??
        0
      ),

    vipLevel:
      Number(
        user.vipLevel ??
        existing.vipLevel ??
        0
      ),

    vipExp:
      Number(
        user.vipExp ??
        existing.vipExp ??
        0
      ),

    avatarFrame:
      user.avatarFrame ||
      existing.avatarFrame ||
      PV_DEFAULT_FRAME,

    badge:
      user.badge ||
      existing.badge ||
      PV_DEFAULT_BADGE,

    entryEffect:
      user.entryEffect ||
      existing.entryEffect ||
      PV_DEFAULT_ENTRY,

    updatedAt:
      Date.now()

  };

  const response =
    await fetch(
      PV_FIREBASE_DB +
      "/users/" +
      encodeURIComponent(
        finalUser.userId
      ) +
      ".json",
      {
        method: "PUT",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(finalUser)
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

  pvSaveLocalUser(
    saved || finalUser
  );

  return saved || finalUser;

}
