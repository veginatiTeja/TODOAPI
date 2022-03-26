const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const InitializeDbServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000");
    });
  } catch (e) {
    console.log(` DB Error ${e.message}`);
    process.exit(1);
  }
};

InitializeDbServer();

const validatingPassword = (password) => {
  return password.length > 6;
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);

  if (dbUser === undefined) {
    const createUserDbQuery = `
     INSERT INTO
      user (username, password, name, gender)
     VALUES
      (
       '${username}',
       '${hashedPassword}',
        '${name}',
       '${gender}'
      );`;
    if (validatingPassword(password)) {
      await db.run(createUserDbQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUSerQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(getUSerQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const IsPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (IsPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = await jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const getTweetsOfUserQuery = ` 
    SELECT user.username, tweet.tweet, user.date_time
    FROM 
    user INNER JOIN tweet on user.user_id = tweet.user_id
    ORDER BY tweet DESC
    LIMIT 4;
    `;
  const Tweets = await db.get(getTweetsOfUserQuery);
  response.send({
    username: Tweets.username,
    tweet: Tweets.tweet,
    dateTime: Tweets.date_time,
  });
});

const convertDBObject = (responseObj) => {
  return {
    name: responseObj.name,
  };
};
app.get("/user/following/", authenticateToken, async (request, response) => {
  const getUserFollowQuery = `
    SELECT user.name
    FROM 
    user CROSS JOIN follower 
    `;
  const userFollower = await db.all(getUserFollowQuery);
  response.send(userFollower);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const getUserFollowerQuery = `
    SELECT user.name
    FROM 
    user CROSS JOIN follower
    `;
  const userFollower = await db.all(getUserFollowerQuery);
  response.send(userFollower);
});

const convertArrayReplies = (tweet) => {
  return {
    replies: [
      {
        name: tweet.name,
        reply: tweet.reply,
      },
    ],
  };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetsNames = ` 
    SELECT user.name, reply.reply
    FROM (user NATURAL JOIN tweet) AS T
    NATURAL JOIN reply
    WHERE tweet.tweet_id = ${tweetId};
    `;
    const tweets = await db.get(getTweetsNames);
    response.send(convertArrayReplies(tweets));
  }
);

const convertArray = (tweet) => {
  return {
    likes: [tweet.username],
  };
};
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const getAllTweetsQuery = ` 
    SELECT tweet.tweet AS tweet, COUNT(like.user_id) AS likes,
    COUNT(reply.user_id) AS replies, tweet.date_time AS dateTime
    FROM 
   (tweet INNER JOIN reply ON tweet.tweet_id = replay.tweet_id)
    AS T INNER JOIN like t.tweet_id = like.tweet_id
    WHERE  T.tweet_id = ${tweetId};
    `;
  const tweets = await db.get(getAllTweetsQuery);
  response.send(tweets);
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetsNames = ` 
    SELECT *
    FROM (user NATURAL JOIN tweet) AS T
    NATURAL JOIN like
    WHERE tweet.tweet_id = ${tweetId};
    `;
    const tweets = await db.get(getTweetsNames);
    response.send(convertArray(tweets));
  }
);
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const createTweetQuery = ` 
    INSERT INTO
    tweet 
    (tweet)
    VALUES
    (
        '${tweet}'
    );
    `;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const getAllTweetsQuery = ` 
    SELECT tweet.tweet AS tweet, COUNT(like.user_id) AS likes,
    COUNT(reply.user_id) AS replies, tweet.date_time AS dateTime
    FROM 
   (tweet INNER JOIN reply ON tweet.tweet_id = replay.tweet_id)
    AS T INNER JOIN like t.tweet_id = like.tweet_id
    `;
  const tweets = await db.all(getAllTweetsQuery);
  response.send(tweets);
});

const tweetAuthenticateToken = async (request, response, next) => {
  const tweetIds = request.params.tweetId;

  const tweetQuery = ` 
  SELECT tweet.tweet_id
  FROM 
  user NATURAL JOIN tweet
  WHERE tweet.tweet_id = tweetIds;
  `;
  const tweetList = await db.get(tweetQuery);

  if (tweetList.tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const deleteTweetDb = `
    DELETE FROM 
    tweet 
    WHERE
    tweet_id = ${tweetId};
    `;
    const tweetDelete = await db.run(deleteTweetDb);
    response.send("Tweet Removed");
  }
);
module.exports = app;
