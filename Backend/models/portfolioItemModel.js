import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

// Mandatory evidence of past work (PRD §4: "Mandatory photo/video
// portfolios of past work"). Append-only from the controller's point of
// view — see artisanController.addPortfolioItem — so an artisan can't
// silently rewrite evidence a customer is relying on.
const PortfolioItem = sequelize.define(
  "PortfolioItem",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    artisanProfileId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    url: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isUrl: true },
    },

    type: {
      type: DataTypes.ENUM("photo", "video"),
      allowNull: false,
    },

    caption: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
  },
  {
    tableName: "portfolio_items",
    timestamps: true,
  }
);

export default PortfolioItem;
