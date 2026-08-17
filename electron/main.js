const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  Notification,
  ipcMain,
  shell,
  screen,
} = require('electron');
const path = require('path');

const { startServer } = require('../lib/server');
const config = require('../lib/config');

function migrateLocalEnvOnce() {
  if (config.isConfigured()) return;

  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const baseUrl = process.env.JIRA_BASE_URL;
  const username = process.env.JIRA_USERNAME || process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (baseUrl && username && apiToken) {
    config.saveConfig({
      jiraBaseUrl: baseUrl,
      jiraUsername: username,
      jiraApiToken: apiToken,
      jiraType: process.env.JIRA_TYPE || 'server',
      tlsRejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '1',
    });
  }
}

const JIRA_SYNC_INTERVAL_MS = 60 * 60 * 1000;

let mainWindow = null;
let deliveryWindow = null;
let tray = null;
let serverInfo = null;
let checkinTimer = null;
let jiraSyncTimer = null;
let isQuitting = false;

function createTrayIcon() {
  const size = 16;
  const canvas = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" rx="3" fill="#6c8cff"/>
      <text x="8" y="12" text-anchor="middle" font-size="10" fill="white">✓</text>
    </svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(canvas).toString('base64')}`;
  return nativeImage.createFromDataURL(dataUrl);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    title: 'Daily TODO',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.loadURL(serverInfo.url);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (process.platform === 'darwin') {
        app.dock.hide();
      }
    }
  });
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Daily TODO');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Daily TODO',
      click: () => showMainWindow(),
    },
    {
      label: 'Check in now',
      click: () => triggerCheckin(),
    },
    {
      label: 'Settings',
      click: () => {
        showMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('open-settings');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => showMainWindow());
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (process.platform === 'darwin') {
    app.dock.show();
  }
}

function createDeliveryWindow() {
  if (deliveryWindow && !deliveryWindow.isDestroyed()) {
    return deliveryWindow;
  }

  const { width, height } = screen.getPrimaryDisplay().bounds;

  deliveryWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    fullscreen: false,
    show: false,
    hasShadow: false,
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'delivery-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  deliveryWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  deliveryWindow.setAlwaysOnTop(true, 'screen-saver');
  deliveryWindow.loadURL(`${serverInfo.url}/delivery.html`);

  deliveryWindow.on('closed', () => {
    deliveryWindow = null;
  });

  return deliveryWindow;
}

function closeDeliveryWindow() {
  if (deliveryWindow && !deliveryWindow.isDestroyed()) {
    deliveryWindow.close();
  }
}

function startDeliveryAnimation() {
  const dw = createDeliveryWindow();

  const begin = () => {
    if (dw.isDestroyed()) return;
    dw.showInactive();
    dw.webContents.send('start-delivery');
  };

  if (dw.webContents.isLoading()) {
    dw.webContents.once('did-finish-load', begin);
  } else {
    begin();
  }
}

function sendCheckinToMain() {
  const sendCheckin = () => {
    mainWindow.webContents.send('checkin-request', { delivery: true });
  };

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', sendCheckin);
  } else {
    setTimeout(sendCheckin, 50);
  }
}

function triggerCheckin() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (Notification.isSupported()) {
    new Notification({
      title: 'Daily TODO — Check-in',
      body: 'A delivery is on its way — your check-in is arriving!',
    }).show();
  }

  if (mainWindow.isVisible()) {
    sendCheckinToMain();
  } else {
    startDeliveryAnimation();
  }
}

ipcMain.on('delivery-envelope-open', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const emerge = () => {
    mainWindow.webContents.send('prepare-emerge');
    mainWindow.showInactive();
    if (process.platform === 'darwin') {
      app.dock.show();
    }
    setTimeout(() => {
      mainWindow.webContents.send('emerge-from-envelope');
    }, 80);
  };

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', emerge);
  } else {
    emerge();
  }
});

ipcMain.on('delivery-finished', () => {
  closeDeliveryWindow();
});

ipcMain.on('delivery-complete', () => {
  closeDeliveryWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
  }
});

function startCheckinTimer() {
  if (checkinTimer) clearInterval(checkinTimer);
  const intervalMs = config.getCheckinIntervalMs();
  checkinTimer = setInterval(triggerCheckin, intervalMs);
}

function triggerJiraSync() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('jira-sync-request');
  }
}

function startJiraSyncTimer() {
  if (jiraSyncTimer) clearInterval(jiraSyncTimer);
  jiraSyncTimer = setInterval(triggerJiraSync, JIRA_SYNC_INTERVAL_MS);
}

async function bootstrap() {
  process.env.CONFIG_DIR = app.getPath('userData');
  migrateLocalEnvOnce();
  serverInfo = await startServer(0);
  createWindow();
  createTray();
  startCheckinTimer();
  startJiraSyncTimer();
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  // Keep running in tray
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('activate', () => {
  showMainWindow();
});

ipcMain.handle('get-app-info', () => ({
  desktop: true,
  checkinIntervalMs: config.getCheckinIntervalMs(),
  jiraSyncIntervalMs: JIRA_SYNC_INTERVAL_MS,
  serverUrl: serverInfo?.url,
}));

ipcMain.handle('apply-checkin-interval', () => {
  startCheckinTimer();
  return { ok: true };
});
