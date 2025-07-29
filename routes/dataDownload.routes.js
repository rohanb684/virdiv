import express from "express";
import { verifyAdminToken, verifyToken } from "../middleware/verifyToken.js";
import { downloadInvoicesExcel } from "../controller/dataDownload.controller.js";

const dataRouter = express.Router();

dataRouter.post(
  "/download-buyer-wise-invoice",
  verifyAdminToken,
  downloadInvoicesExcel
);

export default dataRouter;
