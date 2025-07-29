import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import axios from "axios";
import User from "../models/user.model.js";
import { oauth2Client } from "../utils/googleConfig.js";
import dotenv from "dotenv";
import { google } from "googleapis";
import fs from "fs";

import {
  createDriveFolder,
  uploadFileToDrive,
} from "../utils/gDrivePdfUpload.js";
import path from "path";
import Notification from "../models/notifications.model.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

const SCOPE = ["https://www.googleapis.com/auth/drive"];

const auth = new google.auth.JWT(
  process.env.CLIENT_EMAIL,
  null,
  process.env.PRIVATE_KEY,
  SCOPE
);
const drive = google.drive({ version: "v3", auth });

// Manual Signup
export const signup = async (req, res) => {
  console.log("Sign Up request");
  try {
    const { name, email, password, userType = "buyer" } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      authProvider: "manual",
      userType,
    });

    await newUser.save();

    res
      .status(201)
      .json({ success: true, message: "User registered successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
};

export const signin = async (req, res) => {
  console.log("sign In request");
  try {
    const { email, password } = req.body;
    console.log(req.body);

    const user = await User.findOne({ email }).select("+password"); // Include password for manual users

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Email does not exist" });
    }

    if (user.authProvider !== "manual") {
      return res.status(400).json({
        success: false,
        message: `Please sign in using ${user.authProvider}`,
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid credentials" });
    }

    // Generate JWT token (optional, if using authentication tokens)
    const jwtToken = jwt.sign({ _id: user._id, email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("authtoken", jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      user,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
};

export const adminSignin = async (req, res) => {
  console.log("Admin sign in request");
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Email does not exist" });
    }

    if (user.authProvider !== "manual") {
      return res.status(400).json({
        success: false,
        message: `Please sign in using ${user.authProvider}`,
      });
    }

    if (user.userType !== "admin" && user.userType !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to access the admin panel",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid credentials" });
    }

    const jwtToken = jwt.sign({ _id: user._id, email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("adminToken", jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // console.log(user);

    res.status(200).json({
      success: true,
      message: "Admin login successful",
      user,
    });
  } catch (error) {
    console.log("Admin login error:", error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
};

export const googleAuth = async (req, res) => {
  try {
    const { code, userType } = req.body;

    const googleRes = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(googleRes.tokens);
    const userRes = await axios.get(
      `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${googleRes.tokens.access_token}`
    );
    const { email, name, sub, picture } = userRes.data;

    let user = await User.findOne({ email });

    if (user) {
      // If user exists but tries to change from buyer to seller or vice versa, update the userType
      if (user.userType !== userType && user.userType !== "admin") {
        user.userType = userType;
        await user.save();
      }
    }

    if (!user) {
      // Create a new user if not found
      user = new User({
        name,
        email,
        googleId: sub, // Google unique ID
        avatar: picture, // Profile picture
        authProvider: "google",
        userType,
      });

      await user.save();
    }

    // Generate JWT Token for Authentication
    const jwtToken = jwt.sign({ _id: user._id, email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("authtoken", jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      user,
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      success: false,
      message: "Google authentication failed",
      error: error.message,
    });
  }
};

export const googleSignIn = async (req, res) => {
  try {
    const { code } = req.body;

    const googleRes = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(googleRes.tokens);
    const userRes = await axios.get(
      `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${googleRes.tokens.access_token}`
    );
    const { email } = userRes.data;

    let user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Account does not exist",
      });
    }

    // Generate JWT Token for Authentication
    const jwtToken = jwt.sign({ _id: user._id, email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("authtoken", jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      user,
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      success: false,
      message: "Google authentication failed",
      error: error.message,
    });
  }
};

export const googleSignUp = async (req, res) => {
  console.log("Google Sign Up Req");
  try {
    const { code, userType } = req.body;

    const googleRes = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(googleRes.tokens);
    const userRes = await axios.get(
      `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${googleRes.tokens.access_token}`
    );
    const { email, name, sub, picture } = userRes.data;

    let user = await User.findOne({ email });

    if (user) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    user = new User({
      name,
      email,
      googleId: sub,
      avatar: picture,
      authProvider: "google",
      userType,
    });

    await user.save();

    res.status(200).json({
      success: true,
      message: "Signup successful",
      user,
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      success: false,
      message: "Google authentication failed",
      error: error.message,
    });
  }
};

export const logout = (req, res) => {
  res.cookie("authtoken", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
    expires: new Date(0), // Expire the cookie immediately
  });
  res.status(200).json({ message: "Logged out successfully" });
};
export const adminLogout = (req, res) => {
  res.cookie("adminToken", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
    expires: new Date(0), // Expire the cookie immediately
  });
  res.status(200).json({ message: "Logged out successfully" });
};

export const onboarding = async (req, res) => {
  try {
    console.log("Received Request:", req.body);
    console.log("Received Files:", req.files); // Check if files are received

    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No files uploaded" });
    }
    const userId = req.user._id; // Get userId from request body
    const user = await User.findById(userId);
    console.log(req.files);
    console.log("onboarding");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Create a unique folder for the user (by email)
    const folderId = await createDriveFolder(user.email);

    let uploadedDocs = [];

    // Upload each file to Google Drive
    for (const file of req.files) {
      const filePath = path.join(file.destination, file.filename);
      const driveLink = await uploadFileToDrive(
        filePath,
        file.filename,
        folderId
      );
      uploadedDocs.push(driveLink);

      // Remove local file after uploading to Drive
      fs.unlinkSync(filePath);
    }

    // Update user with onboarding info
    user.companyName = req.body.companyName || user.companyName;
    user.phoneNumber = req.body.phoneNumber || user.phoneNumber;
    user.gst = req.body.gst;
    user.fssai = req.body.fssai || user.fssai;
    user.uploadedDocuments = uploadedDocs;
    user.hasCompletedOnboarding = true;
    user.folderLink = `https://drive.google.com/drive/folders/${folderId}?usp=sharing`;

    await user.save();

    await Notification.create({
      role: "admin",
      type: "NEW_USER_REGISTERED",
      message: "New user registered",
      link: "/verifications",
    });

    res
      .status(200)
      .json({ success: true, message: "Onboarding successful", user });
  } catch (error) {
    console.error("Onboarding error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const uploadUserDocumentsFromAdminPanel = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "No user found" });
    }

    const folderId = await createDriveFolder(user.email);
    let uploadedDocs = [];

    for (const file of req.files) {
      const filePath = path.join(file.destination, file.filename);
      const driveLink = await uploadFileToDrive(
        filePath,
        file.filename,
        folderId
      );
      uploadedDocs.push(driveLink);

      // Remove local file after uploading to Drive
      fs.unlinkSync(filePath);
    }

    user.uploadedDocuments = (user.uploadedDocuments || []).concat(
      uploadedDocs
    );
    user.folderLink = `https://drive.google.com/drive/folders/${folderId}?usp=sharing`;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Documents Upload successful",
      updatedUser: user,
    });
  } catch (error) {
    console.error("Error uploading user documents:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Route: POST /api/auth/update-user-gst-fssai
export const updateUserGstOrFssai = async (req, res) => {
  console.log(" update gst or fssai req rec");

  console.log(req.body);

  try {
    const { userId, gst, fssai } = req.body;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    // Build the update object dynamically
    const updateFields = {};
    if (gst) updateFields.gst = gst;
    if (fssai) updateFields.fssai = fssai;

    if (Object.keys(updateFields).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No fields to update" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true } // return the updated document
    );

    if (!updatedUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "User GST/FSSAI updated successfully",
      updatedUser,
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ---- Admin auth functions---//

export const changeAdminPassword = async (req, res) => {
  try {
    const { email, newPassword, secretKey } = req.body;

    // Validate input
    if (!email || !newPassword || !secretKey) {
      return res.status(400).json({
        success: false,
        message: "Email, new password, and secret key are required",
      });
    }

    // Validate secret key
    if (secretKey !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({
        success: false,
        message: "Invalid secret key",
      });
    }

    // Find the admin user
    const user = await User.findOne({ email, userType: "admin" }).select(
      "+password"
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Admin user not found",
      });
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Admin password changed successfully",
    });
  } catch (error) {
    console.error("Change Admin Password Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const newOnboarding = async (req, res) => {
  try {
    console.log(" Received  Onboarding Request:", req.body);
    const { gst, companyName, name, phoneNumber } = req.body;

    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!gst || !companyName || !name || !phoneNumber) {
      return res
        .status(400)
        .json({ success: false, message: "Some fields are missing" });
    }

    // Update user with onboarding info
    user.companyName = req.body.companyName || user.companyName;
    user.phoneNumber = req.body.phoneNumber || user.phoneNumber;
    user.gst = req.body.gst;
    user.fssai = req.body.fssai || ""; // Set to blank if not provided
    user.uploadedDocuments = []; // No uploads here
    user.hasCompletedOnboarding = true;
    user.folderLink = null; // No folder created here

    await user.save();

    await Notification.create({
      role: "admin",
      type: "NEW_USER_REGISTERED",
      message: "New user registered (no uploads)",
      link: "/verifications",
    });

    res.status(200).json({
      success: true,
      message: "Onboarding (no uploads) successful",
      user,
    });
  } catch (error) {
    console.error("New onboarding error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
