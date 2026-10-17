import User from "./userModel.js";
import Otp from "./otpModel.js";
import SelfieVerification from "./selfieVerificationModel.js";
import ArtisanProfile from "./artisanProfileModel.js";
import PortfolioItem from "./portfolioItemModel.js";
import Terms from "./termsModel.js";
import Escrow from "./escrow.js";
import EscrowTransaction from "./escrowTransaction.js";
import Payment from "./payment.js";

// Mongoose references are declared on each schema (ref: "...") and resolved
// with populate() / manual lookups, so there is nothing to wire up here.
// Dev 2 adds Job / Quote / Review exports below.

export { User, Otp, SelfieVerification, ArtisanProfile, PortfolioItem, Terms, Escrow, EscrowTransaction, Payment };
