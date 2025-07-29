import ExcelJS from "exceljs";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";

import {
  sendVerificationRejectionEmail,
  sendVerificationSuccessEmail,
} from "../services/emailService.js";
import { deleteDriveFolder } from "../utils/gDrivePdfUpload.js";

export const pendingUser = async (req, res) => {
  console.log("pendingUser");
  try {
    const users = await User.find({
      userType: { $in: ["buyer", "seller"] }, // Only buyers and sellers
      hasCompletedOnboarding: true,
      isVerified: false, // Only those who completed onboarding
    });
    console.log(users);

    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
export const getVerifiedUser = async (req, res) => {
  console.log("pendingUser");
  try {
    const users = await User.find({
      userType: { $in: ["buyer", "seller"] }, // Only buyers and sellers
      hasCompletedOnboarding: true,
      isVerified: true, // Only those who completed onboarding
    });

    const sortedUsers = users.sort((a, b) => {
      const aHasDocs =
        Array.isArray(a.uploadedDocuments) && a.uploadedDocuments.length > 0;
      const bHasDocs =
        Array.isArray(b.uploadedDocuments) && b.uploadedDocuments.length > 0;
      return aHasDocs - bHasDocs; // false (0) - true (1) => puts falsy (no docs) first
    });

    res.status(200).json(sortedUsers);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const verifyUser = async (req, res) => {
  try {
    const { userId } = req.params;
    console.log("verifyUser");
    console.log(userId);

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Check if onboarding is completed
    if (!user.hasCompletedOnboarding) {
      return res
        .status(400)
        .json({ success: false, message: "User has not completed onboarding" });
    }

    // Verify the user
    user.isVerified = true;
    await user.save();

    await sendVerificationSuccessEmail(user.email, user.name);

    // Fetch all remaining pending users
    const pendingUsers = await User.find({
      userType: { $in: ["buyer", "seller"] },
      hasCompletedOnboarding: true,
      isVerified: false,
    });

    res.status(200).json({
      success: true,
      message: "User verified successfully",
      pendingUsers,
    });
  } catch (error) {
    console.error("Error verifying user:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const rejectUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { rejectionReason } = req.body;

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Ensure rejection reason is provided
    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    // Extract folder ID from stored folder link
    const folderLink = user.folderLink; // Assuming this is the field storing the link
    const folderIdMatch = folderLink?.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    const folderId = folderIdMatch ? folderIdMatch[1] : null;

    // Delete the Google Drive folder if folderId exists
    if (folderId) {
      const folderDeleted = await deleteDriveFolder(folderId);
      if (folderDeleted) {
        console.log(`Folder ${folderId} deleted successfully.`);
      } else {
        console.log(`Failed to delete folder ${folderId}.`);
      }
    }

    // Reject user by updating fields
    user.hasCompletedOnboarding = false;
    user.rejectionReason = rejectionReason;
    user.folderLink = null; // Remove folder reference
    user.uploadedDocuments = []; // Clear uploaded documents list
    await user.save();

    await sendVerificationRejectionEmail(
      user.email,
      user.name,
      rejectionReason
    );

    // Fetch remaining pending users
    const pendingUsers = await User.find({
      userType: { $in: ["buyer", "seller"] },
      hasCompletedOnboarding: true,
      isVerified: false,
    });

    res.status(200).json({
      success: true,
      message: "User rejected successfully, folder and documents deleted.",
      pendingUsers,
    });
  } catch (error) {
    console.error("Error rejecting user:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getAllBuyers = async (req, res) => {
  try {
    const buyers = await User.find({
      userType: "buyer",
      hasCompletedOnboarding: true,
      isVerified: true,
    }).select("-password"); // Exclude password for security

    if (!buyers.length) {
      return res
        .status(404)
        .json({ success: false, message: "No buyers found" });
    }

    res.status(200).json({ success: true, buyers });
  } catch (error) {
    console.error("Error fetching buyers:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getAllsellers = async (req, res) => {
  try {
    const sellers = await User.find({
      userType: "seller",
      hasCompletedOnboarding: true,
      isVerified: true,
    }).select("-password"); // Exclude password for security

    if (!sellers.length) {
      return res
        .status(404)
        .json({ success: false, message: "No seller found" });
    }

    res.status(200).json({ success: true, sellers });
  } catch (error) {
    console.error("Error fetching sellers:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const downloadAllUsersExcel = async (req, res) => {
  try {
    const users = await User.find({})
      .populate("company", "name") // only populate company name if needed
      .lean();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Users");

    // Define headers
    worksheet.columns = [
      { header: "Name", key: "name", width: 20 },
      { header: "Email", key: "email", width: 25 },
      { header: "User Type", key: "userType", width: 15 },
      { header: "Auth Provider", key: "authProvider", width: 15 },
      { header: "Company Name", key: "companyName", width: 25 },
      { header: "Phone", key: "phoneNumber", width: 15 },
      { header: "Verified", key: "isVerified", width: 10 },
      { header: "GST", key: "gst", width: 20 },
      { header: "FSSAI", key: "fssai", width: 20 },
      { header: "Has Onboarded", key: "hasCompletedOnboarding", width: 15 },
      { header: "Created At", key: "createdAt", width: 20 },
    ];

    // Add data rows
    users.forEach((user) => {
      worksheet.addRow({
        name: user.name || "",
        email: user.email,
        userType: user.userType,
        authProvider: user.authProvider,
        companyName: user.company?.name || user.companyName || "",
        phoneNumber: user.phoneNumber || "",
        isVerified: user.isVerified ? "Yes" : "No",
        gst: user.gst || "",
        fssai: user.fssai || "",
        hasCompletedOnboarding: user.hasCompletedOnboarding ? "Yes" : "No",
        createdAt: new Date(user.createdAt).toLocaleString(),
      });
    });

    // Set headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=All_Users.xlsx");

    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (error) {
    console.error("❌ Excel download error:", error);
    res.status(500).json({ message: "Failed to generate Excel" });
  }
};

export const getAdminUsers = async (req, res) => {
  try {
    const admins = await User.find({ userType: "admin" });
    res.status(200).json({ success: true, admins });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const adminSignup = async (req, res) => {
  console.log("Admin signup request");

  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email, password, and secret key are required",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(409)
        .json({ success: false, message: "Email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const adminUser = new User({
      name,
      email,
      password: hashedPassword,
      userType: "admin",
      authProvider: "manual",
      isVerified: true,
      hasCompletedOnboarding: true,
    });

    await adminUser.save();

    res
      .status(201)
      .json({ success: true, message: "Admin registered successfully" });
  } catch (error) {
    console.error("Admin Signup Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteAdminAccount = async (req, res) => {
  const accountId = req.params.accountId;

  try {
    const deletedUser = await User.findByIdAndDelete(accountId);

    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        message: "Admin account not found",
      });
    }

    getAdminUsers(req, res);
  } catch (error) {
    console.error("Error deleting admin account:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const superAdminSignup = async (req, res) => {
  console.log("Super Admin signup request");

  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email, password, and secret key are required",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(409)
        .json({ success: false, message: "Email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const adminUser = new User({
      name,
      email,
      password: hashedPassword,
      userType: "superAdmin",
      authProvider: "manual",
      isVerified: true,
      hasCompletedOnboarding: true,
    });

    await adminUser.save();

    res
      .status(201)
      .json({ success: true, message: "Admin registered successfully" });
  } catch (error) {
    console.error("Admin Signup Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
