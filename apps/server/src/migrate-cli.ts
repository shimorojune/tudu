// `node dist/migrate.js`: apply pending migrations from ../migrations (copied beside dist in the image).
import { migrateDatabase } from '@tudu/db/migrate';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
migrateDatabase(url).then(
  () => {
    console.log('migrations: up to date');
    process.exit(0);
  },
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
