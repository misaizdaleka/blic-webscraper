const { MongoClient, ServerApiVersion } = require("mongodb");
const dotenv = require("dotenv");
const { TwitterApi } = require("twitter-api-v2");

dotenv.config();
const uri = `mongodb+srv://${process.env.MONGO_ACCESS}@cluster0.ur4pw.mongodb.net/?retryWrites=true&w=majority`;
const mongo = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1
});
mongo.connect(err => {
  collection = mongo.db("blicstrip").collection("strips");
  // perform actions on the collection object
});

const tweetStrip = async date => {
  const mediaId = await userClient.v1.uploadMedia(`./stripovi/${date}.jpg`);
  await userClient.v1.tweet(date, { media_ids: [mediaId] });
};

const userClient = new TwitterApi({
  appKey: process.env.CONSUMER_KEY,
  appSecret: process.env.CONSUMER_SECRET,
  accessToken: process.env.ACCESS_TOKEN_KEY,
  accessSecret: process.env.ACCESS_TOKEN_SECRET
});

const tweetAStrip = async () => {
  const stripovi = await mongo
    .db("blicstrip")
    .collection("strips")
    .find({ posted: { $nin: [true] } })
    .sort({ dateObj: 1 })
    .limit(1);

  stripovi.toArray(async (err, result) => {
    await tweetStrip(result[0].date);

    await mongo
      .db("blicstrip")
      .collection("strips")
      .updateOne(
        {
          adresa: result[0].adresa
        },
        {
          $set: { posted: true }
        }
      );

    process.exit(1);
  });
};

tweetAStrip();
