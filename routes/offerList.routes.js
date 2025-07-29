import express from "express";
import {
  acceptBid,
  acceptBidByBuyer,
  addOfferList,
  addToWatchlist,
  createOrdersAfterBidAcceptance,
  deleteInvoice,
  deleteOfferList,
  downloadOfferList,
  getAllInvoices,
  getAllOfferLists,
  getAllOrdersForAdmin,
  getAllOrdersForUser,
  getMyWatchlist,
  getUpcomingOfferLists,
  getUserSpecificOfferLists,
  removeFromWatchlist,
  updateBuyers,
  updateBuyersForMultipleInvoices,
  updateInvoicePrices,
  updateOfferlistStatus,
  uploadOfferDocuments,
} from "../controller/offerList.controller.js";

import { verifyAdminToken, verifyToken } from "../middleware/verifyToken.js";
import { testMail } from "../services/emailService.js";
import uploadInvoiceDocuments from "../middleware/uploadOrderDetails.js";

const offerListRouter = express.Router();

offerListRouter.post("/add-list", addOfferList);
offerListRouter.put("/update-offerlist-status", updateOfferlistStatus);
offerListRouter.get("/get-lists", verifyToken, getUserSpecificOfferLists);
offerListRouter.get("/get-upcoming-lists", verifyToken, getUpcomingOfferLists);
offerListRouter.get("/get-lists-admin", getAllOfferLists);
offerListRouter.get("/get-invoices-admin", getAllInvoices);

offerListRouter.get("/get-orders-user", verifyToken, getAllOrdersForUser);
offerListRouter.get("/get-orders-admin", getAllOrdersForAdmin);

offerListRouter.post("/add-bid", updateInvoicePrices);

offerListRouter.post(
  "/accept-bid",
  verifyAdminToken,
  createOrdersAfterBidAcceptance
);

offerListRouter.post(
  "/accept-buyer-bid",
  verifyToken,
  createOrdersAfterBidAcceptance
);

offerListRouter.put("/update-buyers", updateBuyers);
offerListRouter.put(
  "/update-buyers-multiple-ids",
  updateBuyersForMultipleInvoices
);

offerListRouter.post("/add-watchlist", verifyToken, addToWatchlist);
offerListRouter.get("/get-watchlist", verifyToken, getMyWatchlist);
offerListRouter.post("/delete-watchlist", verifyToken, removeFromWatchlist);

offerListRouter.delete("/delete-invoice", verifyAdminToken, deleteInvoice);
offerListRouter.delete("/delete-offerlist", verifyAdminToken, deleteOfferList);

offerListRouter.get("/download-offerlist/:offerListId?", downloadOfferList);

// offerListRouter.post(
//   "/upload-invoice-documents",
//   uploadInvoiceDocuments,
//   uploadOfferDocuments
// );

// offerListRouter.post("/send-test", testMail);

export default offerListRouter;
