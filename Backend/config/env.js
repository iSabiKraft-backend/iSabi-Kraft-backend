import 'dotenv/config';

const required = ['MONGODB_URI', 'JWT_SECRET', 'PAYSTACK_SECRET_KEY'];

export const validateEnv = () => {
  const needed = process.env.NODE_ENV === 'production' ? [...required, 'ID_HASH_PEPPER'] : required;
  const missing = needed.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
};

export default validateEnv;
