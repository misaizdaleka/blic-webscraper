const PORT = 8000;
const axios = require("axios");
const cheerio = require("cheerio");
const express = require("express");
const app = express();
const cors = require("cors");
app.use(cors());
let collection;

const { TwitterApi } = require("twitter-api-v2");
const dotenv = require("dotenv");

dotenv.config();

const fetch = require("node-fetch");
const fs = require("fs");

const { MongoClient, ServerApiVersion } = require("mongodb");
const { json } = require("express");
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

const url = "https://www.blic.rs/blicstrip";

const userClient = new TwitterApi({
  appKey: process.env.CONSUMER_KEY,
  appSecret: process.env.CONSUMER_SECRET,
  accessToken: process.env.ACCESS_TOKEN_KEY,
  accessSecret: process.env.ACCESS_TOKEN_SECRET
});

app.get("/", function (req, res) {
  res.json("This is my webscraper");
});

app.get("/download-all", async (req, res) => {
  const slike = await mongo
    .db("blicstrip")
    .collection("strips")
    .find()
    .toArray();

  let requests,
    urls = [],
    dates = [];

  slike.forEach(r => {
    urls.push(r.img);
    dates.push(r.date);
  });

  requests = urls.map(url => fetch(url));

  // Now we wait for all the requests to resolve and then save them locally
  Promise.all(requests).then(files => {
    files.forEach((file, i) => {
      file.body.pipe(fs.createWriteStream(`stripovi/${dates[i]}.jpg`));
    });

    res.json("gotovo");
  });
});

app.get("/tweet", async (req, res) => {
  const mediaId = await userClient.v1.uploadMedia("./stripovi/31.08.2017.jpg");
  await userClient.v1.tweet("Blic Strip kreće!", { media_ids: [mediaId] });
  res.json("Good");
});

app.get("/testing-grounds", async (req, res) => {
  const latest = await mongo
    .db("blicstrip")
    .collection("strips")
    .find({ posted: { $nin: [true] } })
    .sort({ dateObj: -1 })
    .limit(1);

  return res.json(await latest.toArray()).pop();
});

const fetchLatestStrip = async () => {
  const latest = await mongo
    .db("blicstrip")
    .collection("strips")
    .find({ posted: { $nin: [true] } })
    .sort({ dateObj: -1 })
    .limit(1);

  return res.json(await latest.toArray()).pop();
};

app.get("/results", (req, res) => {
  const saveImgsAndGenerateHtml = responses => {
    const imgs = [];
    responses.forEach(response => {
      if (response.img) {
        imgs.push(response.img);
        return;
      }
      const html = response.data;
      const $ = cheerio.load(html);
      $("div.img-wrapper img", html).each(function () {
        if (!$(this).attr("srcset")) {
          return;
        }
        imgs.push("http:" + $(this).attr("srcset"));
        mongo
          .db("blicstrip")
          .collection("strips")
          .updateOne(
            {
              adresa: response.config.url
            },
            {
              $set: { img: "http:" + $(this).attr("srcset") }
            }
          );
      });
    });
    const htmlImgs = imgs
      .map(img => `<img src="${img}"/><br/><br/><br/>`)
      .join("");
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(htmlImgs);
  };

  const saveImgs = responses => {
    responses.forEach(response => {
      if (response.img) {
        return;
      }
      const html = response.data;
      const $ = cheerio.load(html);
      $("div.img-wrapper img", html).each(function () {
        if (!$(this).attr("srcset")) {
          return;
        }
        mongo
          .db("blicstrip")
          .collection("strips")
          .updateOne(
            {
              adresa: response.config.url
            },
            {
              $set: { img: "http:" + $(this).attr("srcset") }
            }
          );
      });
    });

    const filteredResponses = responses.filter(r => !!r.img);
    requests = filteredResponses.map(r => fetch(r.img));

    // Now we wait for all the requests to resolve and then save them locally
    return Promise.all(requests).then(files => {
      files.forEach((file, i) => {
        file.body.pipe(
          fs.createWriteStream(`stripovi/${filteredResponses[i].date}.jpg`)
        );
      });
    });
  };

  const fetchStrips = suffix => {
    const articles = [];
    const articleDates = {};
    return axios(url + suffix)
      .then(response => {
        const html = response.data;
        const $ = cheerio.load(html);
        let dbUpdates = [];
        $("article.news", html).each(function (e, el) {
          const linkSearch = $(el).find("a:contains('Crta i piše')");

          if (!linkSearch.length) {
            return;
          }

          const date = $(el).find("time").text().trim();

          const [day, month, year] = date.split(".");

          const link = linkSearch.attr("href");

          if (
            (!link.includes("blic-strip") && !link.includes("crta-i-pise")) ||
            link.includes("strana=komentari") ||
            articles.includes(link)
          ) {
            console.error(link);
            return;
          }

          const url = link;
          articles.push(url);
          articleDates[url] = new Date(+year, +month - 1, +day).valueOf();
          dbUpdates.push(
            mongo
              .db("blicstrip")
              .collection("strips")
              .updateOne(
                {
                  adresa: url
                },
                {
                  $setOnInsert: {
                    adresa: url,
                    date,
                    dateObj: new Date(+year, +month - 1, +day),
                    img: ""
                  }
                },
                { upsert: true }
              )
          );
        });
        return dbUpdates.length
          ? Promise.all(dbUpdates)
          : Promise.resolve(false);
      })
      .then(res =>
        articles.length
          ? Promise.all(
              articles.map(a =>
                mongo
                  .db("blicstrip")
                  .collection("strips")
                  .findOne({ adresa: a })
                  .then(strip => {
                    if (strip && strip.img) {
                      return Promise.resolve({
                        img: strip.img,
                        date: strip.date
                      });
                    } else {
                      return axios(a);
                    }
                  })
              )
            )
          : Promise.resolve([])
      );
  };

  const fetchAllStrips = async (page = 0, responses = []) => {
    fetchStrips(page ? "?strana=" + page : "").then(res =>
      res.every(r => !!r.img)
        ? saveImgs([...responses, ...res])
        : fetchAllStrips(page + 1, [...responses, ...res])
    );
  };

  fetchAllStrips(0);
});

app.listen(PORT, () => console.log(`server running on PORT ${PORT}`));
