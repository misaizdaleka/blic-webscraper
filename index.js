const PORT = 8000;
const axios = require("axios");
const cheerio = require("cheerio");
const express = require("express");
const app = express();
const cors = require("cors");
app.use(cors());
let collection;

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = "mongorue&w=majority";
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1
});
client.connect(err => {
  collection = client.db("blicstrip").collection("strips");
  // perform actions on the collection object
});

const url = "https://www.blic.rs/blicstrip";

app.get("/", function (req, res) {
  res.json("This is my webscraper");
});

app.get("/test", async (req, res) => {
  const res2 = await client
    .db("blicstrip")
    .collection("strips")
    .find()
    .sort({ dateObj: -1 });
  res2.toArray(function (err, result) {
    result.forEach(r => {
      console.log(r.date);
    });
  });
});

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
        client
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

  const fetchStrips = suffix => {
    const articles = [];
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
          dbUpdates.push(
            client
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
                client
                  .db("blicstrip")
                  .collection("strips")
                  .findOne({ adresa: a })
                  .then(res2 => {
                    if (res2 && res2.img) {
                      return Promise.resolve({ img: res.img });
                    } else {
                      return axios(a);
                    }
                  })
              )
            )
          : Promise.resolve([])
      );
  };

  const fetch = (page = 0, responses = []) =>
    fetchStrips(page ? "?strana=" + page : "").then(res =>
      res.length
        ? fetch(page + 1, [...responses, ...res])
        : saveImgsAndGenerateHtml(responses)
    );

  // fetch();
});

app.listen(PORT, () => console.log(`server running on PORT ${PORT}`));
