import { App } from './app.js';

const app = new App();

(async () => {
  await app.init();
  const port = app.env.config.server.port;
  app.express.listen(port, '0.0.0.0', () => {
    console.info(`Dimmelo API listening on http://localhost:${port}`);
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
