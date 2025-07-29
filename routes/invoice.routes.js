import express from "express";
import {
  getInvoiceReqUser,
  getInvoicesReqAdmin,
} from "../controller/invoice.controller.js";
import { verifyAdminToken, verifyToken } from "../middleware/verifyToken.js";
const invoiceRouter = express.Router();

invoiceRouter.get(
  "/get-offer-invoices-admin/:offerlistId",
  verifyAdminToken,
  getInvoicesReqAdmin
);
invoiceRouter.get(
  "/get-offer-invoices-user/:offerlistId",
  verifyToken,
  getInvoiceReqUser
);

export default invoiceRouter;
