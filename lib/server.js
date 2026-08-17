require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const path = require('path');
const config = require('./config');
const jira = require('./jira');

config.applyTlsSetting();

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (_req, res) => {
    const publicConfig = config.getPublicConfig();
    res.json({
      ok: true,
      jiraConfigured: config.isConfigured(),
      jiraBaseUrl: publicConfig.jiraBaseUrl || null,
      jiraType: publicConfig.jiraType || 'server',
      configDir: config.getConfigDir(),
    });
  });

  app.get('/api/config', (_req, res) => {
    res.json(config.getPublicConfig());
  });

  app.post('/api/config', (req, res) => {
    try {
      const body = req.body || {};
      const existing = config.loadConfig();

      if (body.checkinIntervalMinutes != null) {
        config.savePreferences({ checkinIntervalMinutes: body.checkinIntervalMinutes });
      }

      const apiToken = body.jiraApiToken || existing?.jiraApiToken;
      const savingJira = body.jiraBaseUrl || body.jiraUsername || body.jiraApiToken;

      if (!savingJira) {
        return res.json({ ok: true, config: config.getPublicConfig() });
      }

      if (!body.jiraBaseUrl || !body.jiraUsername || !apiToken) {
        return res.status(400).json({
          ok: false,
          message: 'Jira URL, username, and password/token are required.',
        });
      }

      const saved = config.saveConfig({
        jiraBaseUrl: body.jiraBaseUrl,
        jiraUsername: body.jiraUsername,
        jiraApiToken: apiToken,
        jiraType: body.jiraType,
        tlsRejectUnauthorized: body.tlsRejectUnauthorized,
        checkinIntervalMinutes: body.checkinIntervalMinutes,
      });
      res.json({ ok: true, config: saved });
    } catch (err) {
      res.status(400).json({ ok: false, message: err.message });
    }
  });

  app.post('/api/config/test', async (req, res) => {
    try {
      const body = req.body || {};
      const existing = config.loadConfig();
      const testConfig = {
        jiraBaseUrl: body.jiraBaseUrl || existing?.jiraBaseUrl,
        jiraUsername: body.jiraUsername || existing?.jiraUsername,
        jiraApiToken: body.jiraApiToken || existing?.jiraApiToken,
        jiraType: body.jiraType || existing?.jiraType || 'server',
        tlsRejectUnauthorized:
          body.tlsRejectUnauthorized ?? existing?.tlsRejectUnauthorized ?? true,
      };

      if (!testConfig.jiraBaseUrl || !testConfig.jiraUsername || !testConfig.jiraApiToken) {
        return res.status(400).json({
          ok: false,
          message: 'Jira URL, username, and password/token are required.',
        });
      }

      const result = await jira.testConnection(testConfig);
      res.json(result);
    } catch (err) {
      res.status(400).json({ ok: false, message: err.message });
    }
  });

  app.get('/api/jira/issues', async (_req, res) => {
    if (!config.isConfigured()) {
      return res.status(503).json({
        error: 'Jira not configured',
        message: 'Open Settings and add your Jira credentials.',
      });
    }

    try {
      const result = await jira.fetchIssues();
      if (result.error) {
        return res.status(result.status || 503).json({
          error: result.error,
          message: result.message,
        });
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch Jira issues', message: err.message });
    }
  });

  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  return app;
}

function startServer(port = 0) {
  const app = createApp();
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: address.port, url: `http://127.0.0.1:${address.port}` });
    });
    server.on('error', reject);
  });
}

module.exports = { createApp, startServer, isJiraConfigured: config.isConfigured };

if (require.main === module) {
  const PORT = process.env.PORT || 3456;
  startServer(PORT).then(({ url }) => {
    console.log(`Daily TODO app running at ${url}`);
    if (!config.isConfigured()) {
      console.log('Jira not configured — open the app and complete setup in Settings');
    }
  });
}
