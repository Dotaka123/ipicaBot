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
  res.status(200).json({ message: 'Ping réussi' });
});

/* ----- ESSENTIALS ----- */
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

function keepAppRunning() {
  setInterval(() => {
    https.get(`${process.env.RENDER_EXTERNAL_URL}/ping`, (resp) => {
      if (resp.statusCode === 200) {
        console.log('Ping réussi');
      } else {
        console.error('Échec du ping');
      }
    });
  }, 5 * 60 * 1000); // 5 minutes en millisecondes
}

/* ----- DB Qrs ----- */

async function createUser(user) {
  const { data, error } = await supabase
      .from('users')
      .insert([ user ]);

    if (error) {
      throw new Error('Erreur lors de la création de l\'utilisateur : ', error);
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
      throw new Error('Erreur lors de la mise à jour de l\'utilisateur : ', error);
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
    console.error('Erreur lors de la vérification de l\'utilisateur:', error);
  } else {
    return data
  }
};

/* ----- MAGIC ----- */
const VERIFY_TOKEN = "votre_token_de_verification"; // Ajout du token de vérification

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook vérifié');
      res.status(200).send(challenge); // Retourner le challenge pour vérifier l'authenticité
    } else {
      res.status(403).send('Erreur de vérification du token');
    }
  } else {
    res.status(400).send('Paramètres manquants');
  }
});

app.post("/webhook", (req, res) => {
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
      if (message.message.text.length < 60) {
        if (message.message.text.length == 1) {
          botly.sendText({id: senderId, text: "Utilisez plus d'un caractère pour rechercher 😐"});
        } else {
          botly.send({
            "id": senderId,
            "message": {
            "text": "Où souhaitez-vous effectuer la recherche 🔍 ?",
            "quick_replies":[
              {
                "content_type":"text",
                "title":"Pinterest",
                "image_url":"https://i.ibb.co/YDqqY0P/pinetrest.png",
                "payload": message.message.text,
              },
            ]
          }
          });
        }
      } else {
        botly.sendText({id: senderId, text: "La recherche ne peut pas être effectuée avec des phrases longues 🤷🏻‍♂️ Essayez de rechercher des choses spécifiques"});
      }
    } else if (message.message.attachments[0].payload.sticker_id) {
      //botly.sendText({id: senderId, text: "(Y)"});
    } else if (message.message.attachments[0].type == "image") {
      botly.sendButtons(
        {
          id: senderId,
          text: "Recherche d'images similaires en cours 👁️‍🗨️...",
          buttons: [botly.createWebURLButton("NOTI 💻", "facebook.com/lahatra.gameur")],
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
                      quick_replies: [
                        botly.createQuickReply("Bientôt !", "123"),
                      ]
                    },
                    () => {},
                  );
                }
              };
              sendPhotosWithDelay();
            } else {
              botly.sendText({ id: senderId, text: "Aucun résultat trouvé sur Pinterest 😓\n• Raisons possibles 🤔 : \n- L'image n'existe pas 🚫.\n- L'image est floue 🫧📱.\n- L'image est inappropriée 🔞." });
            }
          } catch (error) {
            console.error("Erreur:", error.response.status);
          }
        },
      );
    } else if (message.message.attachments[0].type == "audio") {
      botly.sendText({id: senderId, text: "Désolé, la page ne peut pas rechercher avec de l'audio 🙅‍♂️" }, function (err, data) {
        console.log("Data :", data);
        console.log("Err :", err);
      });
    } else if (message.message.attachments[0].type == "video") {
      botly.sendText({ id: senderId, text: "Désolé, la page ne peut pas rechercher avec des vidéos 🙅" });
    }
  } else {
    await createUser({uid: senderId})
            .then((data, error) => {
              botly.sendButtons({
                id: senderId,
                text: "Bienvenue pour la première fois 👁️‍🗨️\nOptica est la première page dédiée à la recherche d'images sur Pinterest 📷😍\nVous pouvez :\n- Envoyer une image 🖼️ et nous rechercherons des correspondances 📱\n- Écrire une phrase et la page effectuera une recherche 🔍\nEn remerciement de notre travail 🔨 Si vous aimez la page et l'avez essayée, merci de nous suivre ➕🥰\nCode de partage : sss",
                buttons: [
                  botly.createWebURLButton("Compte du développeur 💻👤", "https://www.facebook.com/lahatra.gameur"),
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
              if (response.data.code == 18) {
                botly.sendButtons({
                  id: senderId,
                  text: "Nous ne pouvons pas rechercher ce type d'image 🤷🏻‍♂️🔞\nVeuillez contacter le développeur si vous pensez qu'il y a une erreur 💻👇🏻",
                  buttons: [
                    botly.createWebURLButton("Compte du développeur 💻👤", "https://www.facebook.com/lahatra.gameur"),
                  ],
                });
              } else if (response.data.code == 0) {
                if (response.data.images && Array.isArray(response.data.images)) {
                  const images = response.data.images;
                  const numImagesToSend = Math.min(images.length, 6);
                
                  if (numImagesToSend === 0) {
                    botly.sendText({ id: senderId, text: "Aucun résultat trouvé" });
                  } else {
                    const shuffledImages = shuffleArray(images);
                
                    const sendImagesWithDelay = async () => {
                      for (let i = 0; i < numImagesToSend; i++) {
                        const url = shuffledImages[i].url;
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                        botly.sendAttachment({
                            id: senderId,
                            type: Botly.CONST.ATTACHMENT_TYPE.IMAGE,
                            payload: { url: url },
                            quick_replies: [
                              botly.createQuickReply("Bientôt !", "123"),
                            ]
                          },
                          () => {});
                      }
                    };
                
                    sendImagesWithDelay();
                  }
                } else {
                  botly.sendText({ id: senderId, text: "Aucun résultat trouvé" });
                }
                
                function shuffleArray(array) {
                  const shuffled = array.slice();
                  for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                  }
                  return shuffled;
                }
              } else {
                botly.sendText({ id: senderId, text: "Aucun résultat trouvé" });
              }
      } catch (error) {
        console.error("Erreur:", error.response.status);
      }
    } else if (message.message.text == "") {
      //
    } else if (postback == "up" || postback == "down") {
    }
  }
};

/* ----- HANDELS ----- */
app.listen(3000, () => {
  console.log(`L'application fonctionne sur le port : 3000`);
  keepAppRunning();
});
