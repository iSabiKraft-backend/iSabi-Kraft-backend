import { Router } from "express";
import Category from "../models/category.js";

const router = Router();
const DEFAULT_CATEGORIES = [
  "Electrical", "Plumbing", "Carpentry", "Painting", "Cleaning",
  "Tiling", "Tailoring", "Mechanical", "Welding",
];

router.get("/", async (_req, res) => {
  if (!(await Category.exists({}))) {
    try {
      await Category.insertMany(DEFAULT_CATEGORIES.map((name) => ({
        name, normalizedName: name.toLowerCase(), status: "active",
      })), { ordered: false });
    } catch (error) {
      if (error.code !== 11000 && !error.writeErrors) throw error;
    }
  }
  const categories = await Category.find({ status: "active" })
    .select("name normalizedName status")
    .sort({ name: 1 })
    .lean();
  res.json({ categories });
});

export default router;
