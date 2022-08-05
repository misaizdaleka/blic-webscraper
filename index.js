const PORT = 8000;
const axios = require("axios");
const cheerio = require("cheerio");
const express = require("express");
const app = express();
const cors = require("cors");
app.use(cors());
let collection;

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri =
  "mongodb+srv://itcatering:*******************************@cluster0.ur4pw.mongodb.net/?retryWrites=true&w=majority";
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

app.get("/test", (req, res) => {
  axios(url)
    .then(response => {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(response.data);
    })
    .catch(err => console.log(err));
});

app.get("/results", (req, res) => {
  const articles = [];
  axios(url)
    .then(async response => {
      const html = response.data;
      const $ = cheerio.load(html);
      let count = 0;
      let dbUpdates = [];
      $("a:contains('Crta i piše')", html).each(function () {
        //<-- cannot be a function expression
        count++;
        if (
          (!$(this).attr("href").includes("blic-strip") &&
            !$(this).attr("href").includes("crta-i-pise")) ||
          $(this).attr("href").includes("strana=komentari") ||
          articles.includes($(this).attr("href"))
        ) {
          console.error($(this).attr("href"));
          return;
        }
        const url = $(this).attr("href");
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
                $setOnInsert: { adresa: url, img: "" }
              },
              { upsert: true }
            )
        );
      });
      console.log("Counted: ", count);
      console.log("Counted filtered: ", articles.length);
      return (
        dbUpdates.length ? Promise.all(dbUpdates) : Promise.resolve(true)
      ).then(() =>
        Promise.all(
          articles.slice(0, 50).map(a => {
            return client
              .db("blicstrip")
              .collection("strips")
              .findOne({ adresa: a })
              .then(res => {
                if (res.img) {
                  return Promise.resolve({ img: res.img });
                } else {
                  return axios(a);
                }
              });
          })
        )
      );
    })
    .then(responses => {
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
    })
    .catch(err => console.log(err));
});

app.listen(PORT, () => console.log(`server running on PORT ${PORT}`));
