const PV_FIREBASE_DB =
  "https://pawanvoice-68c5e-default-rtdb.firebaseio.com";

const PV_DEFAULT_DP =
  "https://i.pravatar.cc/200?img=12";


function pvGetUserId() {

  return (
    localStorage.getItem("pv_userId") ||
    "pawan"
  );

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
        localStorage.getItem(
          "pv_level"
        ) || 1
      ),

    exp:
      Number(
        localStorage.getItem(
          "pv_exp"
        ) || 0
      ),

    coins:
      Number(
        localStorage.getItem(
          "pv_coins"
        ) || 0
      ),

    following:
      Number(
        localStorage.getItem(
          "pv_following"
        ) || 0
      ),

    followers:
      Number(
        localStorage.getItem(
          "pv_followers"
        ) || 0
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
        )

    };


    pvSaveLocalUser(
      user
    );

    return user;

  }
  catch(error) {

    console.error(
      "PawanVoice user load:",
      error
    );

    return localUser;

  }

}


async function pvSaveUser(user) {

  if (
    !user ||
    !user.userId
  ) {

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

        method: "PUT",

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
              Number(
                user.level || 1
              ),

            exp:
              Number(
                user.exp || 0
              ),

            coins:
              Number(
                user.coins || 0
              ),

            following:
              Number(
                user.following || 0
              ),

            followers:
              Number(
                user.followers || 0
              ),

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

  pvSaveLocalUser(
    saved || user
  );

  return saved || user;

        }
