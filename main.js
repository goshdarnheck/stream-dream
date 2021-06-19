const electron = require('electron');
const ioHook = require('iohook');

const { app, BrowserWindow } = electron;

app.disableHardwareAcceleration()

let win;

function eventHandlerDown(event) {
  win.webContents.send('globalkeydown', event)
}

function eventHandlerUp(event) {
  win.webContents.send('globalkeyup', event)
}

function eventHandlerWheel(event) {
  win.webContents.send('globalwheel', event)
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
    disableHtmlFullscreenWindowResize: true
  });

  win.loadURL(`file://${__dirname}/main.html`)
  // win.removeMenu()
  // win.webContents.setFrameRate(60)
});

app.on('before-quit', () => {
  ioHook.unload();
  ioHook.stop();
});
