const express = require("express");
const app = express();
const Botly = require("botly");
const axios = require("axios");
const botly = new Botly({
  accessToken: process.env.PAGE_ACCESS_TOKEN,
  notificationType: Botly.CONST.REGULAR,
  FB_URL: "https://graph.facebook.com/v2.6/",
});
app.get("/", function (_req, res) {
  res.sendStatus(200);
});
/* ----- ESSENTIALS ----- */
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

/* ----- MAGIC ----- */
app.post("/webhook", (req, res) => {
  // console.log(req.body)
  if (req.body.message) {
    onMessage(req.body.message.sender.id, req.body.message);
  } else if (req.body.postback) {
    onPostBack(
      req.body.postback.message.sender.id,
      req.body.postback.message,
      req.body.postback.postback,
    );
  }
  res.sendStatus(200);
});

/* ----- HANDELS ----- */

const onMessage = async (senderId, message) => {
  if (message.message.text) {
    // message.message.text
  } else if (message.message.attachments[0].payload.sticker_id) {
    //botly.sendText({id: senderId, text: "(Y)"});
  } else if (message.message.attachments[0].type == "image") {
    botly.sendButtons(
      {
        id: senderId,
        text: "جاري البحث",
        buttons: [botly.createWebURLButton("NOTI 💻", "facebook.com/0xNoti/")],
      },
      async () => {
        try {
          const response = await axios.get(`https://zeroxipica.onrender.com/search?imageUrl=${encodeURIComponent(message.message.attachments[0].payload.url,)}`,
            {
              headers: {
                "Content-Type": "application/json",
              },
            },
          );

          if (response.data.data[0]) {
            const photoUrls = response.data.data.map((x) => x.image_large_url);
            
            const sendPhotosWithDelay = async () => {
              for (const url of photoUrls) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                botly.sendAttachment(
                  {
                    id: senderId,
                    type: Botly.CONST.ATTACHMENT_TYPE.IMAGE,
                    payload: { url: url },
                  },
                  () => {},
                );
              }
            };

            sendPhotosWithDelay();
          } else {
            botly.sendText({ id: senderId, text: "400" });
          }
        } catch (error) {
          console.error("Error:", error.response.status);
        }
      },
    );
  } else if (message.message.attachments[0].type == "audio") {
    botly.sendText({ id: senderId, text: "المرجو إستعمال النصوص و الصور فقط" });
  } else if (message.message.attachments[0].type == "video") {
    botly.sendText({ id: senderId, text: "المرجو إستعمال النصوص و الصور فقط" });
  }
};
/* ----- POSTBACK ----- */

const onPostBack = async (senderId, message, postback) => {};
/* ----- HANDELS ----- */
app.listen(3000, () => console.log(`App is on port : 3000`));