const express = require("express");
const app = express();
const Botly = require("botly");
const axios = require("axios");
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SB_URL, process.env.SB_KEY, { auth: { persistSession: false} });
const botly = new Botly({
  accessToken: process.env.PAGE_ACCESS_TOKEN,
  notificationType: Botly.CONST.REGULAR,
  FB_URL: "https://graph.facebook.com/v2.6/",
});
app.get("/", function (_req, res) {
  res.sendStatus(200);
});

app.get('/ping', (req, res) => {
  res.status(200).json({ message: 'Ping successful' });
});

/* ----- ESSENTIALS ----- */
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

function keepAppRunning() {
  setInterval(() => {
    https.get(`${process.env.RENDER_EXTERNAL_URL}/ping`, (resp) => {
      if (resp.statusCode === 200) {
        console.log('Ping successful');
      } else {
        console.error('Ping failed');
      }
    });
  }, 5 * 60 * 1000); // 5 minutes in milliseconds
}

/* ----- DB Qrs ----- */

async function createUser(user) {
  const { data, error } = await supabase
      .from('users')
      .insert([ user ]);

    if (error) {
      throw new Error('Error creating user : ', error);
    } else {
      return data
    }
};

async function updateUser(id, update) {
  const { data, error } = await supabase
    .from('users')
    .update( update )
    .eq('uid', id);

    if (error) {
      throw new Error('Error updating user : ', error);
    } else {
      return data
    }
};

async function userDb(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('uid', userId);

  if (error) {
    console.error('Error checking user:', error);
  } else {
    return data
  }
};

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
  const user = await userDb(senderId);
  if (user[0]) {
    if (message.message.text) {
      botly.sendText({id: senderId, text: "يجري إعتماد التصحيح الان"});
      /*
      if (message.message.text.length < 60) {
        if (message.message.text.length == 1) {
          botly.sendText({id: senderId, text: "إستعمل أكثر من حرف للبحث 😐"});
        } else {
          botly.send({
            "id": senderId,
            "message": {
            "text": "أين تريد البحث 🔍 ؟",
            "quick_replies":[
              {
                "content_type":"text",
                "title":"Pinterest",
                "image_url":"https://i.ibb.co/YDqqY0P/pinetrest.png",
                "payload": message.message.text,
              },{
                "content_type":"text",
                "title":"",
                "payload":"",
              }
            ]
          }
          });
        }
      } else {
        botly.sendText({id: senderId, text: "لا يمكن البحث بعبارات طويلة 🤷🏻‍♂️ جرب البحث عن أشياء موجودة"});
      }
      */
    } else if (message.message.attachments[0].payload.sticker_id) {
      //botly.sendText({id: senderId, text: "(Y)"});
    } else if (message.message.attachments[0].type == "image") {
      botly.sendButtons(
        {
          id: senderId,
          text: "جاري البحث عن الصور المشابهة 👁️‍🗨️...",
          buttons: [botly.createWebURLButton("NOTI 💻", "facebook.com/0xNoti/")],
        },
        async () => {
          try {
            const response = await axios.get(`https://zeroxipica.onrender.com/search?imageUrl=${encodeURIComponent(message.message.attachments[0].payload.url)}`,
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
              botly.sendText({ id: senderId, text: "لا يوجد أي تطابق على Pinterest 😓\n• أسباب محتملة 🤔 : \n- الصورة غير موجودة 🚫.\n- الصورة غير واضحة 🫧📱.\n- الصورة غير مناسبة 🔞." });
            }
          } catch (error) {
            console.error("Error:", error.response.status);
          }
        },
      );
    } else if (message.message.attachments[0].type == "audio") {
      botly.sendText({ id: senderId, text: "لا يمكن للصفحة البحث بالصوت 🙅‍♂️" });
    } else if (message.message.attachments[0].type == "video") {
      botly.sendText({ id: senderId, text: "لا يمكن للصفحة البحث بالفيديوهات 🙅" });
    }
  } else {
    await createUser({uid: senderId})
            .then((data, error) => {
              botly.sendButtons({
                id: senderId,
                text: "مرحبا لأول مرة 👁️‍🗨️\nآيييكا أول صفحة للبحث عن الصور في بينترست 📷😍\nيمكنك :\n- إرسال أي صورة 🖼️ و سيتم البحث عن تطابق لها 📱\n- كتابة أي جملة و ستبحث لك الصفحة عن الصور 🔍\nتقديرا لمجهودنا 🔨 إذا جربت الصفحة و أعجبتك يرجى ترك متابعة ➕🥰\nكود المشاركة الخاص بك : sss",
                buttons: [
                  botly.createWebURLButton("حساب المطور 💻👤", "facebook.com/0xNoti/"),
                ],
              });
            });
  }
};
/* ----- POSTBACK ----- */

const onPostBack = async (senderId, message, postback) => {
  if (message.postback) {
    if (postback == "") {
      //
    } else if (postback == "") {
      //
    } else if (postback == "") {
      //
    } else if (postback == "") {
      //
    } else if (postback == "") {
      //
    } else if (postback == "") {
      //
    } else if (message.postback.title == "") {
      //
    } else if (message.postback.title == "") {
      //
    } else if (message.postback.title == "") {
      //
    } else if (message.postback.title == "") {
      //
    }
  } else {
    // Quick Reply
    if (message.message.text == "Pinterest") {
      try {
        const response = await axios.get(`https://zeroxipica.onrender.com/text?q=${encodeURIComponent(postback)}`,
              { headers: { "Content-Type": "application/json" }});
              if (response.data.sensitivity != undefined) {
                botly.sendButtons({
                  id: senderId,
                  text: "لا يمكننا البحث عن هذا النوع من الصور 🤷🏻‍♂️🔞\nاذا كنت تعتقد أن هنالك خطأ راسل المطور 💻👇🏻",
                  buttons: [
                    botly.createWebURLButton("حساب المطور 💻👤", "facebook.com/0xNoti/"),
                  ],
                });
              } else {
                if (response.data.data && Array.isArray(response.data.data)) {
                  const photoUrls = response.data.data
                    .filter((x) => x.image_large_url)
                    .map((x) => x.image_large_url);
                  if (photoUrls.length === 0) {
                    botly.sendText({ id: senderId, text: "لا يوجد نتيجة" });
                  } else {
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
                  }
                } else {
                  botly.sendText({ id: senderId, text: "لا يوجد نتيجة" });
                }
              }
      } catch (error) {
        console.error("Error:", error.response.status);
      }
    } else if (message.message.text == "") {
      //
    } else if (postback == "up" || postback == "down") {
    }
  }
};
/* ----- HANDELS ----- */
app.listen(3000, () => {
  console.log(`App is on port : 3000`);
  keepAppRunning();
});