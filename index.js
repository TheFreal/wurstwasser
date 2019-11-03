const fs = require('fs');
const readline = require('readline');

const bodyParser = require('body-parser');
const express = require('express');
var app = express();
app.set('port', (process.env.PORT || 61884))
app.use(bodyParser.json());

var {google} = require('googleapis');
var OAuth2 = google.auth.OAuth2;
const credentials = JSON.parse(fs.readFileSync("client_secret.json"));
const token = JSON.parse(fs.readFileSync("leo_secret.json"));
const service = google.youtube('v3');

async function getOauthClient() {
    var clientSecret = credentials.installed.client_secret;
    var clientId = credentials.installed.client_id;
    var redirectUrl = credentials.installed.redirect_uris[0];
    var oauth2Client = new OAuth2(clientId, clientSecret, redirectUrl);
    oauth2Client.credentials = token;
    return oauth2Client;
}

async function findBestVideo(artist, title) {
    return new Promise(async (resolve, reject) => {
        service.search.list({
            auth:   await getOauthClient(),
            part:   "snippet",
            type:   "video",
            maxResults: 1,
            q:      artist + " " + title,
            order:  "relevance",
            videoCategoryId:    "10"
        }, (error, response) => {
            if(error){
                reject(error);
            } else if (typeof response.data == undefined){
                reject(Error("Video search returned empty response"))
            } else if (response.data.items.length < 1){
                reject(Error("No search results found for query " + artist + " " + title))
            }
            console.log("Found a suitable video!");
            resolve(response.data.items[0]);
        })
    });
}

async function addVideoToWurstwasser(video){
    service.playlistItems.insert({
        "auth": await getOauthClient(),
        "part": "snippet",
        "resource": {
            "snippet": {
                "playlistId": "PLeshathdNDmEDr_vy2l3mNE2176nt1QFd",
                "resourceId": video.id
            }
        }
    }, (err, res) => {
        if(err){
            throw err;
        }
        console.log("Added " + res.data.snippet.title + " to the playlist!");
        return;
    })
}

async function addNewSong(artist, title){
    let video = await findBestVideo(artist, title);
    await addVideoToWurstwasser(video);
    return;
}

async function addWholeBacklog() {
    let backlog = JSON.parse(fs.readFileSync("fleischsaft_proxy.json"));
    for (let i = 0; i < backlog.length; i++) {
        const element = backlog[i];
        addNewSong(element.artist, element.track);
        await sleep(5000);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}



app.post('/', async function (req, res) {
    if(!req.body.title || !req.body.artist){
        res.status(400).send("THe request was wither missing a track 'title', or 'artist' name");
    }
    try {
	await addNewSong(req.body.artist, req.body.title);
    	res.sendStatus(200);
    } catch (err) {
        res.status(503).send("Some error occured, chanced are you exceeded your daily quota");
    }
  });
  
  app.listen(app.get("port"), function () {
    console.log('Listening on port 61884');
  });
  
