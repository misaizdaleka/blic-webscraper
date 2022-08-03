const PORT = 8000;
const axios = require("axios");
const cheerio = require("cheerio");
const express = require("express");
const app = express();
const cors = require("cors");
app.use(cors());

const url = "https://www.blic.rs/blicstrip";

app.get("/", function (req, res) {
  res.json("This is my webscraper");
});

app.get("/results", (req, res) => {
  axios(url)
    .then(response => {
      const html = response.data;
      const $ = cheerio.load(html);
      const articles = [];

      $("a:contains('Crta i piše')", html).each(function () {
        //<-- cannot be a function expression
        if (
          !$(this).attr("href").includes("blic-strip") ||
          $(this).attr("href").includes("strana=komentari") ||
          articles.includes($(this).attr("href"))
        ) {
          return;
        }
        const url = $(this).attr("href");
        articles.push(url);
      });
      const reqs = articles.slice(0, 50).map(a => axios(a));
      //   console.log(reqs);
      //   return axios.get(articles[0]);
      return axios.all(reqs);
    })
    .then(responses => {
      const imgs = [];
      responses.forEach(response => {
        const html = response.data;
        const $ = cheerio.load(html);
        $("div.img-wrapper img", html).each(function () {
          $(this).attr("srcset") && imgs.push("http:" + $(this).attr("srcset"));
        });
      });
      console.log(imgs);
      const htmlImgs = imgs
        .map(img => `<img src="${img}"/><br/><br/><br/>`)
        .join("");
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(htmlImgs);
    })
    .catch(err => console.log(err));
});

app.listen(PORT, () => console.log(`server running on PORT ${PORT}`));
