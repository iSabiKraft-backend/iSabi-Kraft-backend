import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectDirectory = resolve(backendDirectory, "..");

// Support the documented root .env and Backend/.env; root values take precedence.
dotenv.config({
  path: [
    resolve(projectDirectory, ".env"),
    resolve(backendDirectory, ".env"),
  ],
});

const required = ['MONGODB_URI', 'JWT_SECRET', 'PAYSTACK_SECRET_KEY'];

export const validateEnv = () => {
  const needed = process.env.NODE_ENV === 'production' ? [...required, 'ID_HASH_PEPPER'] : required;
  const missing = needed.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
};

export default validateEnv;
