# Wurstwasser

Syncs spotify playlists configured in the "playlists.json" file to YouTube playlists.
  
Since this uses both "search.list" (100 points) and "playlistItem.insert" (50 points) queries on the YouTube Data API, it can only add a couple of songs a day before hitting the quota limit of 10.000 points and can not be used to convert larger playlists for now.

Rather, this is meant to run a couple of times per day to keep YouTube playlists up to date with new additions to Spotify lists.
