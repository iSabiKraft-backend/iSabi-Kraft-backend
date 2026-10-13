import { Op } from "sequelize";
import User from "../models/userModel.js";
import { hashPassword, comparePassword } from "../utils/hashPassword.js";
import { generateToken } from "../utils/generateToken.js";

// *Register a new user
export async function registerUser(userData) {
  const { firstName, lastName, email, phone, password, role } = userData;

  // Check if email or phone already exists
  const existingUser = await User.findOne({
    where: { [Op.or]: [{ email }, { phone }] },
  });

  if (existingUser) {
    const error = new Error("An account with this email or phone already exists.");
    error.statusCode = 409;
    throw error;
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create user
  const newUser = await User.create({
    firstName,
    lastName,
    email,
    phone,
    password: hashedPassword,
    role: role || "customer",
  });

  // Generate JWT
  const token = generateToken(newUser);

  const userResponse = newUser.toJSON();
  delete userResponse.password;

  return {
    user: userResponse,
    token,
  };
}

// *Login an existing user
export async function loginUser(loginData) {
  const { email, password } = loginData;

  // Find user by email
  const user = await User.findOne({ where: { email } });

  if (!user || !user.isActive) {
    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    throw error;
  }

  // Compare passwords
  const passwordMatch = await comparePassword(password, user.password);

  if (!passwordMatch) {
    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    throw error;
  }

  user.lastLoginAt = new Date();
  await user.save();

  // Generate JWT
  const token = generateToken(user);

  const userResponse = user.toJSON();
  delete userResponse.password;

  return {
    user: userResponse,
    token,
  };
}
