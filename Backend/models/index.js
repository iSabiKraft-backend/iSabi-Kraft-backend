import User from "./userModel.js";
import ArtisanProfile from "./artisanProfileModel.js";
import PortfolioItem from "./portfolioItemModel.js";
import Terms from "./termsModel.js";

// user - artisanProfile 1:1
// One User account (role: "artisan") has one ArtisanProfile
User.hasOne(ArtisanProfile, {
  foreignKey: "userId",
  onDelete: "CASCADE",
});

ArtisanProfile.belongsTo(User, {
  foreignKey: "userId",
});

// artisanProfile - portfolioItem 1:N
// One ArtisanProfile has many PortfolioItems
ArtisanProfile.hasMany(PortfolioItem, {
  foreignKey: "artisanProfileId",
  onDelete: "CASCADE",
});

PortfolioItem.belongsTo(ArtisanProfile, {
  foreignKey: "artisanProfileId",
});

// this file should be merged into the
// repo's single shared src/models/index.js — everyone can add their own
// model imports and associations below this block rather than creating a
// second index.js. For example:
//
//   ArtisanProfile.hasMany(Job, { foreignKey: "artisanId" });
//   Job.belongsTo(ArtisanProfile, { foreignKey: "artisanId" });
//
//   ArtisanProfile.hasMany(Review, { foreignKey: "artisanId" });
//   Review.belongsTo(ArtisanProfile, { foreignKey: "artisanId" });

export { User, ArtisanProfile, PortfolioItem, Terms };
