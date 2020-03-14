var CronJob = require('cron').CronJob;
const playlistConfig = require('./playlists.json');

// set up server logic
const bodyParser = require('body-parser');
const express = require('express');
var app = express();
app.set('port', (process.env.PORT || 61884))
app.use(bodyParser.json());

// create the youtube api object with credentials
var {google} = require('googleapis');
var OAuth2 = google.auth.OAuth2;
const credentials = require("./secrets/client_secret.json");
const token = require("./secrets/leo_secret.json");
const service = google.youtube('v3');

// yreate the spotify api object with  credentials
var SpotifyWebApi = require('spotify-web-api-node');
const spotifyAuth = require("./secrets/spotify_secrets.json");
var spotifyApi = new SpotifyWebApi(spotifyAuth);

async function authorizeSpotify(){
    const data = await spotifyApi.clientCredentialsGrant();
    console.log('The access token expires in ' + data.body['expires_in']);
    console.log('The access token is ' + data.body['access_token']);
    spotifyApi.setAccessToken(data.body['access_token']);
}

async function getSpotifyPlaylist(playlistId, offsetParam){
    await authorizeSpotify();
    const fullPlaylist = [];
    let nextPageExists = true;
    let offset = (offsetParam == null ? 0 : offsetParam);
    while(nextPageExists){
        const response = await spotifyApi.getPlaylistTracks(playlistId, {
            fields: 'items(added_at,track(name,artists)),next,tnotal',
            offset: offset,
        });
        fullPlaylist.push(...response.body.items)
        nextPageExists = (response.body.next !== null);
        offset += 100;
        if(nextPageExists){
            console.log("Loading... " + fullPlaylist.length + "/" + response.body.total);
        } else {
            console.log("Finished loading all " + fullPlaylist.length + " songs");
        }
    }
    return fullPlaylist;
}

async function convertSpotifyToYouTube(spotifyPlaylistId, youtubePlaylistId){
    const playlist = await getSpotifyPlaylist(spotifyPlaylistId);
    playlist.forEach(async (item) => {
        const youtubeVideo = await findBestVideo(item.track.artists[0].name, item.track.name);
        console.log("Found video for " + item.track.name + ": " + youtubeVideo);
    });
}

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
            part:   "id",
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

async function getYoutubePlaylistSize(playlistId){
    return new Promise(async (resolve, reject) => {
        service.playlists.list({
            "auth": await getOauthClient(),
            "part": "contentDetails",
            id: playlistId
        }, (error, response) => {
            if(error){
                reject(error);
            } else if (typeof response.data == undefined){
                reject(Error("Playlist doesn't exist"))
            }
            console.log("Already have " + response.data.items[0].contentDetails.itemCount + " items in YT list");
            resolve(response.data.items[0].contentDetails.itemCount);
        });
    });
}

async function updatePlaylist(playlistObj){
    const preloaded = await getYoutubePlaylistSize(playlistObj.youtube);
    const newSongs = await getSpotifyPlaylist(playlistObj.spotify, preloaded);
    for (const item of newSongs) {
        const youtubeVideo = await findBestVideo(item.track.artists[0].name, item.track.name);
        console.log("Found video for " + item.track.name + ": " + youtubeVideo.id.videoId);
        try{
            await addVideoToPlaylist(youtubeVideo.id.videoId, playlistObj.youtube);
        } catch(err) {
            console.error(err);
        }
        
    };
    console.log("Added all new songs!");
}

async function addVideoToPlaylist(videoId, playlistId){
    return new Promise(async (resolve, reject) => {
        service.playlistItems.insert({
            "auth": await getOauthClient(),
            "part": "snippet",
            "resource": {
              "snippet": {
                  "playlistId": playlistId,
                  "resourceId": {
                      "videoId": videoId,
                      "kind": "youtube#video"
                  }
               }
           }
        }, (err, res) => {
            if(err){
               reject(err);
            }
            console.log("Added " + res.data.id + " to the playlist!");
            resolve();
        })
    });
}

async function updateAll() {
    for (const name in playlistConfig) {
        updatePlaylist(playlistConfig[name]);
    }
    return;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

app.get('/', (req, res) => {
    res.send("How about a POST request instead?");
});

const job = new CronJob('0 0 0 * * *', async () => {
    try {
        await updateAll();
     } catch (error) {
         console.error(error);
     }
});
job.start();
  
app.listen(app.get("port"), async function () {
    console.log("Listening on Port " + app.get("port"));
});
