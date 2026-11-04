import "dotenv/config";

const required = ["MONGODB_URI", "SUPABASE_URL", "PAYSTACK_SECRET_KEY"];

const validateEnv = () => {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY is not set: admin verification routes are disabled.");
  }
};

export default validateEnv;
