const { MongoClient, ServerApiVersion } = require("mongodb");
const dotenv = require("dotenv");
const axios = require("axios");
const cheerio = require("cheerio");
const fetch = require("node-fetch");
const fs = require("fs");

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

const url = "https://www.blic.rs/blicstrip";

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
  return Promise.all(requests).then(files =>
    Promise.all(
      files.map(
        (file, i) =>
          new Promise((resolve, reject) => {
            let stream = file.body.pipe(
              fs.createWriteStream(`stripovi/${filteredResponses[i].date}.jpg`)
            );
            stream.on("error", reject).on("close", resolve);
          })
      )
    )
  );
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
      return dbUpdates.length ? Promise.all(dbUpdates) : Promise.resolve(false);
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

const fetchNewStrips = (page = 0, responses = []) =>
  fetchStrips(page ? "?strana=" + page : "").then(res =>
    res.every(r => !!r.img)
      ? saveImgs([...responses, ...res])
      : fetchNewStrips(page + 1, [...responses, ...res])
  );

fetchNewStrips().then(() => process.exit(1));
