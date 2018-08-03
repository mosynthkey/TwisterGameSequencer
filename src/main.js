const {
    app,
    Menu,
    BrowserWindow
} = require('electron');

const ipcMain = require('electron').ipcMain;
const path = require('path');
const url = require('url');

let mainWindow, editWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 608 + 80,
        height: 886 + 80 + 40,
        resizable: false,
        title: "Twister Game Sequencer"
    });

    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        slashes: true
    }));

    // 開発ツールを有効化
    //mainWindow.webContents.openDevTools();

    mainWindow.on('closed', () => {
        app.quit();
    });

    Menu.setApplicationMenu(null);

    // prepare sequence editor window
    editWindow = new BrowserWindow({
        width: 800,
        height: 1100,
        title: "Twister Game Sequencer Editor"
    });

    editWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'editor.html'),
        protocol: 'file:',
        slashes: true
    }));

    editWindow.on('closed', () => {
        editWindow = null;
    });
}

app.on('ready', () => {
    createWindow();

    // from TwisterSequencer.js
    ipcMain.on('click', (ev, message) => {
        if (editWindow !== null) editWindow.webContents.send('click', message);
    });

    // from main.js
    ipcMain.on('changeSeq', (ev, message) => {
        if (mainWindow !== null) mainWindow.webContents.send('changeSeq', message);
    });
    ipcMain.on('changePcm', (ev, message) => {
        if (mainWindow !== null) mainWindow.webContents.send('changePcm', message);
    });
    ipcMain.on('changeVol', (ev, message) => {
        if (mainWindow !== null) mainWindow.webContents.send('changeVol', message);
    });
    ipcMain.on('changePattern', (ev, message) => {
        if (mainWindow !== null) mainWindow.webContents.send('changePattern', message);
        if (editWindow !== null) editWindow.reload();
    });
    ipcMain.on('changeSelector', (ev, message) => {
        if (mainWindow !== null) mainWindow.webContents.send('changeSelector', message);
    });
    ipcMain.on('changeMonoPoly', (ev, message) => {
        if (mainWindow !== null) mainWindow.webContents.send('changeMonoPoly', message);
    });

});

app.on('window-all-closed', () => {　
    app.quit();　
});

app.on('activate', () => {
    if (mainWindow === null) createWindow();
});
