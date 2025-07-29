import express from "express";
import { verifyAdminToken, verifyToken } from "../middleware/verifyToken.js";
import {
  downloadOrderReport,
  generateSaleOrderNumbers,
  getOrdersWithSaleOrderNumber,
  updateDeliveryStatus,
  updateOrderAddresses,
  updateOrderBankDetails,
  uploadOrderDocuments,
} from "../controller/order.controller.js";
import uploadInvoiceDocuments from "../middleware/uploadOrderDetails.js";

const orderRouter = express.Router();

orderRouter.get("/get-orders", verifyToken, getOrdersWithSaleOrderNumber);
orderRouter.get(
  "/get-admin-orders",
  verifyAdminToken,
  getOrdersWithSaleOrderNumber
);
orderRouter.post("/generate-son", verifyAdminToken, generateSaleOrderNumbers);
orderRouter.post("/update-address", verifyToken, updateOrderAddresses);
orderRouter.post(
  "/update-bankdetails",
  verifyAdminToken,
  updateOrderBankDetails
);
orderRouter.post(
  "/update-delivery-status",
  verifyAdminToken,
  updateDeliveryStatus
);

orderRouter.post(
  "/upload-order-documents",
  verifyAdminToken,
  uploadInvoiceDocuments,
  uploadOrderDocuments
);
orderRouter.post("/download-orders", downloadOrderReport);
export default orderRouter;
