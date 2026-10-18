
import User from "../models/userModel.js";
import Payment from "../models/payment.js";
import Escrow from "../models/escrow.js";
import Dispute from "../models/dispute.js";
import EscrowTransaction from "../models/escrowTransaction.js";


//This gets the pagination for the admin controller
const getPagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(query.limit, 10) || 20)
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};


//This gets the dashboard for the admin controller
const getDashboard = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalAdmins,
      totalPayments,
      totalEscrows,
      totalDisputes,
      totalEscrowTransactions,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "admin" }),
      Payment.countDocuments(),
      Escrow.countDocuments(),
      Dispute.countDocuments(),
      EscrowTransaction.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalAdmins,
        totalPayments,
        totalEscrows,
        totalDisputes,
        totalEscrowTransactions,
      },
    });
  } catch (error) {
    next(error);
  }
};

//This gets the users for the admin controller
const getUsers = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);

    const [users, total] = await Promise.all([
      User.find()
        .select("-password -passwordHash -resetPasswordToken")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      data: users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

//This gets the user by id for the admin controller
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId)
      .select("-password -passwordHash -resetPasswordToken")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    next(error);
  }
};

//This gets the payments for the admin controller
const getPayments = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);

    const [payments, total] = await Promise.all([
      Payment.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payment.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

//This gets the escrows for the admin controller
const getEscrows = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);

    const [escrows, total] = await Promise.all([
      Escrow.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Escrow.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      data: escrows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

//This gets the escrow transactions for the admin controller
const getEscrowTransactions = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);

    const [transactions, total] = await Promise.all([
      EscrowTransaction.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EscrowTransaction.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      data: transactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

//This gets the disputes for the admin controller
const getDisputes = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);

    const [disputes, total] = await Promise.all([
      Dispute.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Dispute.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      data: disputes,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export {
  getDashboard,
  getUsers,
  getUserById,
  getPayments,
  getEscrows,
  getEscrowTransactions,
  getDisputes,
};
