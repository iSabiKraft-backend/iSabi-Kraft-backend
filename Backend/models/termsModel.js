import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";


const Terms = sequelize.define(
  "Terms",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    version: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true, // e.g. "v1.0"
    },

    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    publishedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "terms",
    timestamps: true,
  }
);

export default Terms;
