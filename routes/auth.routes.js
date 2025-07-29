import express from "express";
import {
  adminLogout,
  adminSignin,
  changeAdminPassword,
  googleAuth,
  googleSignIn,
  googleSignUp,
  logout,
  newOnboarding,
  onboarding,
  signin,
  signup,
  updateUserGstOrFssai,
  uploadUserDocumentsFromAdminPanel,
} from "../controller/auth.controller.js";
import { verifyAdminToken, verifyToken } from "../middleware/verifyToken.js";
import upload from "../middleware/multer.js";
import {
  downloadAllUsersExcel,
  getAllBuyers,
  getAllsellers,
  getVerifiedUser,
  pendingUser,
  rejectUser,
  verifyUser,
} from "../controller/user.controller.js";

const authRouter = express.Router();

authRouter.get("/pending-users", pendingUser);
authRouter.get("/get-verified-users", verifyAdminToken, getVerifiedUser);
authRouter.get("/get-all-buyers", getAllBuyers);
authRouter.get("/get-all-sellers", getAllsellers);
authRouter.put("/verify-user/:userId", verifyUser);
authRouter.put("/reject-user/:userId", rejectUser);

authRouter.post("/google-auth", googleAuth);
authRouter.post("/google-login", googleSignIn);
authRouter.post("/logout", logout);
authRouter.post("/manual-login", signin);
authRouter.post("/manual-signup", signup);
authRouter.post("/google-sign-up", googleSignUp);
authRouter.post("/onboard-user", verifyToken, newOnboarding);

authRouter.post(
  "/onboard-user-with-documents",
  verifyToken,
  upload,
  onboarding
);

authRouter.post(
  "/upload-user-documents",
  verifyToken,
  upload,
  uploadUserDocumentsFromAdminPanel
);
authRouter.post(
  "/update-user-gst-fssai",
  verifyAdminToken,
  updateUserGstOrFssai
);

authRouter.get("/verify-token", verifyToken, (req, res) => {
  res.json({ success: true, user: req.user }); // Return user details
});
authRouter.get("/verify-admin-token", verifyAdminToken, (req, res) => {
  res.json({ success: true, user: req.user }); // Return user details
});
authRouter.post("/manual-admin-login", adminSignin);

authRouter.post("/admin-change-password", changeAdminPassword);
authRouter.post("/admin-logout", adminLogout);

authRouter.get(
  "/download-users-excel",
  verifyAdminToken,
  downloadAllUsersExcel
);
export default authRouter;
