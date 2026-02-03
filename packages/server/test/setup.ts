import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, "../../../.env");
if (fs.existsSync(envPath)) {
  loadEnv({ path: envPath });
}

if (!process.env.DISPATCH_DB_PATH) {
  process.env.DISPATCH_DB_PATH = path.resolve(
    __dirname,
    "../../db/dispatch.dev.db"
  );
}
