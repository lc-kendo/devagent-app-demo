import { createApp } from './app';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const app = createApp();

app.listen(PORT, () => {
  console.log(`Product Bulk Import server running on http://localhost:${PORT}`);
});
