import { loadEnv } from './config/env.js';
import { createApp } from './app.js';

const env = loadEnv();
const app = createApp(env);

app.listen(env.PORT, () => {
  console.log(`PortChimera API listening on port ${env.PORT} (${env.NODE_ENV})`);
});
