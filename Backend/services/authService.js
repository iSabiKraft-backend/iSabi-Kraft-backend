import User from "../models/userModel.js";
import { hashPassword, comparePassword } from "../utils/hashPassword.js";
import { generateToken } from "../utils/generateToken.js";

// *Register a new user
export async function registerUser(userData) {
  const { firstName, lastName, email, phone, password, role } = userData;

  // Check if email or phone already exists
  const existingUser = await User.findOne({ $or: [{ email }, { phone }] });

  if (existingUser) {
    const error = new Error("An account with this email or phone already exists.");
    error.statusCode = 409;
    throw error;
  }

  const hashedPassword = await hashPassword(password);

  const newUser = await User.create({
    firstName,
    lastName,
    email,
    phone,
    password: hashedPassword,
    role: role || "customer",
  });

  const token = generateToken(newUser);

  // toJSON strips the password
  return { user: newUser.toJSON(), token };
}

// *Login an existing user
export async function loginUser(loginData) {
  const { email, password } = loginData;

  // password is select:false, so ask for it explicitly
  const user = await User.findOne({ email }).select("+password");

  if (!user || !user.isActive) {
    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    throw error;
  }

  const passwordMatch = await comparePassword(password, user.password);

  if (!passwordMatch) {
    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    throw error;
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = generateToken(user);

  return { user: user.toJSON(), token };
}

