require('dotenv').config();
const express = require('express');
const { createProxyRouter } = require('./proxy/router');
const { createDashboardRouter } = require('./dashboard/server');
const { createStorage } = require('./storage/redis');

async function main() {
  const storage = await createStorage();
  
  // Proxy server
  const proxy = express();
  proxy.use(express.json({ limit: '10mb' }));
  proxy.use('/v1', createProxyRouter(storage));
  proxy.use('/api/stats', (await import('./dashboard/api.mjs')).createStatsRouter(storage));
  
  const port = process.env.PORT || 4000;
  proxy.listen(port, () => console.log(`🚀 Proxy gateway on :${port}`));

  // Dashboard
  const dash = express();
  dash.use(express.static(__dirname + '/dashboard/public'));
  dash.use('/api/stats', (await import('./dashboard/api.mjs')).createStatsRouter(storage));
  
  const dashPort = process.env.DASHBOARD_PORT || 4001;
  dash.listen(dashPort, () => console.log(`📊 Dashboard on :${dashPort}`));
}

main().catch(console.error);
