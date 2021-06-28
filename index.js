const electron = require('electron');
const { session } = require('electron');
const ioHook = require('iohook');
const Store = require('electron-store');
const SpotifyWebApi = require('spotify-web-api-node');
const config = require('./config.json')

const { app, BrowserWindow } = electron;
const store = new Store();

let win;
let authWindow;
let displaySpotifySong = true;
let pollId = null
let spotifyApi = new SpotifyWebApi({
  clientId: config.spotify.clientId,
  clientSecret: config.spotify.clientSecret,
  redirectUri: config.spotify.callbackUri
});

function pollCurrentTrack(delay) {
  var getCurrentTrack = function() {
    console.log("< Polling Song")

    spotifyApi.getMyCurrentPlayingTrack()
      .then(function(data) {
        if (data.body && data.body.item) {
          console.log('> Now playing: ', data.body.item.name);
          win.webContents.send('currentTrack', data);
          console.log("| Next poll in:", data.body.item.duration_ms - data.body.progress_ms + 1000)
          pollId = setTimeout(getCurrentTrack, data.body.item.duration_ms - data.body.progress_ms + 1000);
        }
      }, function(err) {
        console.log('Something went wrong!', err);
        refreshSpotifyToken(function () {
          getCurrentTrack();
        })
      });
  }

  pollId = setTimeout(getCurrentTrack, delay);
}

function refreshSpotifyToken(callback) {
  console.log("< Refreshing Access Token")

  spotifyApi.refreshAccessToken().then(
    function(data) {
      console.log('> The access token has been refreshed!');

      // Save the access token so that it's used in future calls
      spotifyApi.setAccessToken(data.body['access_token']);
      store.set('access_token', data.body['access_token']);
      if (data.body['refresh_token']) {
        store.set('refresh_token', data.body['refresh_token']);
      }

      // call that callback // code comment // todo: clean up comments
      callback()
    },
    function(err) {
      console.log('> Could not refresh access token', err);
      // TODO: GET ERROR, probably need to get new auth code
      openSpotifyAuthWindow()
    }
  );
}

function getSpotifyAccessAndRefreshTokens(code, callback) {
  spotifyApi.authorizationCodeGrant(code).then(
    function(data) {
      console.log('> The token expires in ' + data.body['expires_in']);

      // Set the access token on the API object to use it in later calls
      spotifyApi.setAccessToken(data.body['access_token']);
      spotifyApi.setRefreshToken(data.body['refresh_token']);
      store.set('access_token', data.body['access_token']);
      store.set('refresh_token', data.body['refresh_token']);

      // Save the amount of seconds until the access token expired
      const tokenExpirationEpoch =
        new Date().getTime() / 1000 + data.body['expires_in'];
      console.log(
        'Retrieved token. It expires in ' +
          Math.floor(tokenExpirationEpoch - new Date().getTime() / 1000) +
          ' seconds!'
        );

      callback()
    },
    function(err) {
      console.log('Something went wrong!', err);

      if (err.body.error === 'invalid_grant') {
        openSpotifyAuthWindow()
      }
    }
  );
}

function eventHandlerDown(event) {
  const songChangeKeys = [57360, 57378, 57369]
  
  if (songChangeKeys.includes(event.keycode) && displaySpotifySong) {
    console.log("< Skipped/Back/Pause/Play Song");
    clearInterval(pollId);
    pollCurrentTrack(1000);
  }

  win.webContents.send('globalkeydown', event)
}

function eventHandlerUp(event) {
  win.webContents.send('globalkeyup', event)
}

function eventHandlerWheel(event) {
  win.webContents.send('globalwheel', event)
}

// TODO: should take callback
function openSpotifyAuthWindow() {
  const authorizeURL = spotifyApi.createAuthorizeURL(['user-read-currently-playing'], 'stream-dreaming', true);
  
  authWindow.loadURL(authorizeURL);
  authWindow.show();

  // Reset the authWindow on close
  authWindow.on(
    'close',
    function() {
      authWindow = null;
    },
    false
  );
}

function handleSpotifyAuthResponseUrl(callBackUrl) {
  const spotifyAuthCode = callBackUrl.searchParams.get('code')
  if (spotifyAuthCode) {
    console.log(`> Spotify auth code: ${spotifyAuthCode}`)

    getSpotifyAccessAndRefreshTokens(spotifyAuthCode, function () {
      pollCurrentTrack(0)
      authWindow.close();
    });
  } else {
    console.log(`> Error: can't get Spotify auth code`)
  }
}

app.on('ready', function () {
  ioHook.start(false);
  ioHook.on('keydown', eventHandlerDown);
  ioHook.on('keyup', eventHandlerUp);
  ioHook.on('mousewheel', eventHandlerWheel);

  win = new BrowserWindow({
    width: 1920,
    height: 64,
    useContentSize: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    frame: false,
    fullscreenable: false,
    resizable: false,
    paintWhenInitiallyHidden: true,
    disableHtmlFullscreenWindowResize: true,
    show: false
  });

  win.setAlwaysOnTop(true, 'screen');
  win.loadURL(`file://${__dirname}/main.html`)
  win.webContents.on('did-finish-load', function() {
    win.show();

    authWindow = new BrowserWindow({
      width: 800, 
      height: 600, 
      show: false, 
      'node-integration': false
    });
  
    if (displaySpotifySong) {
      if (store.get('access_token') && store.get('refresh_token')) {
        spotifyApi.setAccessToken(store.get('access_token'));
        spotifyApi.setRefreshToken(store.get('refresh_token'));
  
        refreshSpotifyToken(function () {
          pollCurrentTrack(0)
        });
      } else {
        openSpotifyAuthWindow();
      }
    }
  
    session.defaultSession.webRequest.onBeforeRequest(
      {
        urls: [config.spotify.callbackUri + '*']
      },
      (details, callback) => {
        const callBackUrl = new URL(details.url);
  
        if (callBackUrl.pathname === '/spotifyAuthCodeCallback') {
          handleSpotifyAuthResponseUrl(callBackUrl)
        }
  
        callback({
          cancel: false
        });
      }
    );
  });
});

app.on('before-quit', () => {
  ioHook.unload();
  ioHook.stop();
});
