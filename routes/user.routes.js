import express from "express";
import {
  adminSignup,
  deleteAdminAccount,
  getAdminUsers,
  superAdminSignup,
} from "../controller/user.controller.js";
import { verifySuperAdminToken } from "../middleware/verifyToken.js";

const userRouter = express.Router();

userRouter.get("/admin-users", verifySuperAdminToken, getAdminUsers);
userRouter.post("/admin-signup", verifySuperAdminToken, adminSignup);
userRouter.post("/super-admin-signup", superAdminSignup);
userRouter.delete(
  "/delete-admin/:accountId",
  verifySuperAdminToken,
  deleteAdminAccount
);

export default userRouter;
