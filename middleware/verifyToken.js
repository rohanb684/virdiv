import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import dotenv from "dotenv";

dotenv.config();

export const verifyToken = async (req, res, next) => {
  try {
    const token = req.cookies?.authtoken; // Get JWT from cookies
    // console.log("token");
    // console.log(token);
    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: No token provided" });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // console.log(decoded);

    // Find user based on decoded token data
    const user = await User.findById(decoded._id).select("-password"); // Exclude password

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    req.user = user; // Attach user to request
    next(); // Proceed to next middleware
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

export const verifyAdminToken = async (req, res, next) => {
  try {
    const token = req.cookies?.adminToken; // Get JWT from cookies
    // console.log("token");
    // console.log(token);
    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: No token provided" });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // console.log(decoded);

    // Find user based on decoded token data
    const user = await User.findById(decoded._id).select("-password"); // Exclude password

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.userType !== "admin" && user.userType !== "superAdmin") {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: Login as admin" });
    }

    req.user = user; // Attach user to request
    next(); // Proceed to next middleware
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};
export const verifySuperAdminToken = async (req, res, next) => {
  try {
    const token = req.cookies?.adminToken; // Get JWT from cookies

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: No token provided" });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // console.log(decoded);

    // Find user based on decoded token data
    const user = await User.findById(decoded._id).select("-password"); // Exclude password

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.userType !== "superAdmin") {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Login as super admin",
      });
    }

    req.user = user; // Attach user to request
    next(); // Proceed to next middleware
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};
