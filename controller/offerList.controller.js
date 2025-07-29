import Invoice from "../models/invoice.model.js";
import OfferList from "../models/offerlist.model.js";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import fs from "fs";
import ExcelJS from "exceljs";

import path from "path";
import {
  createDriveFolder,
  uploadFileToDrive,
} from "../utils/gDrivePdfUpload.js";
import Notification from "../models/notifications.model.js";
import {
  createNewNotificationForOfferlistLive,
  deleteNotificationForInvoice,
  deleteNotificationForOfferlist,
} from "./notifications.controller.js";

export const addOfferList = async (req, res) => {
  console.log(req.body);
  try {
    const { offerListNumber, invoices, sellerId, offerListStatus } = req.body;

    let existingOfferList = await OfferList.findOne({ offerListNumber });

    const duplicateInvoices = [];

    for (const inv of invoices) {
      const existing = await Invoice.findOne({
        invoiceNumber: inv.invoiceNumber,
        grade: inv.grade,
      });

      if (existing) {
        duplicateInvoices.push(`${inv.invoiceNumber} (${inv.grade})`);
      }
    }

    if (duplicateInvoices.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Duplicate invoice(s) found: ${duplicateInvoices.join(", ")}`,
      });
    }

    if (existingOfferList) {
      // Fetch verified buyers once
      const verifiedBuyers = await User.find(
        { userType: "buyer", isVerified: true },
        "_id"
      );

      // Process invoices: Extract only `_id` from `buyers`
      const processedInvoices = invoices.map((invoice) => ({
        ...invoice,
        offerListNumber: existingOfferList._id,
        currentPrice: invoice.price,
        adminBid: invoice.price,
        seller: sellerId,
        allowedBuyers: invoice.buyers.some((buyer) => buyer === "All")
          ? verifiedBuyers.map((buyer) => buyer._id)
          : invoice.buyers.map((buyer) => buyer._id), // Extract `_id` from objects
      }));

      // Insert new invoices
      const createdInvoices = await Invoice.insertMany(processedInvoices);

      // Append new invoices to the existing offer list
      existingOfferList.invoices.push(...createdInvoices.map((inv) => inv._id));
      await existingOfferList.save();

      return res.status(200).json({
        success: true,
        message: "Invoices added to existing offer list successfully",
        offerList: existingOfferList,
      });
    }

    // If no existing offer list, create a new one
    const newOfferList = new OfferList({
      offerListNumber,
      seller: sellerId,
      offerListStatus: offerListStatus,
    });

    // Fetch verified buyers once
    const verifiedBuyers = await User.find(
      { userType: "buyer", isVerified: true },
      "_id"
    );

    // Process invoices: Extract only `_id` from `buyers`
    const processedInvoices = invoices.map((invoice) => ({
      ...invoice,
      offerListNumber: newOfferList._id,
      currentPrice: invoice.price,
      adminBid: invoice.price,
      seller: sellerId,
      allowedBuyers: invoice.buyers.some((buyer) => buyer === "All")
        ? verifiedBuyers.map((buyer) => buyer._id)
        : invoice.buyers.map((buyer) => buyer._id), // Extract `_id` from objects
    }));

    // Create invoices
    const createdInvoices = await Invoice.insertMany(processedInvoices);

    // Associate invoices with the new offer list
    newOfferList.invoices = createdInvoices.map((invoice) => invoice._id);
    await newOfferList.save();

    // Add offer list ID to the seller's user document
    await User.findByIdAndUpdate(sellerId, {
      $push: { offerLists: newOfferList._id },
    });

    if (offerListStatus === "Live") {
      await createNewNotificationForOfferlistLive(
        "OFFERLIST_LIVE",
        newOfferList._id.toString(),
        offerListNumber,
        createdInvoices
      );
    }

    return res.status(201).json({
      success: true,
      message: "Offer List created successfully",
      offerList: newOfferList,
    });
  } catch (error) {
    console.error("Error creating offer list:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getAllOfferLists = async (req, res) => {
  try {
    let offerListsQuery = OfferList.find()
      .populate({
        path: "invoices",
        populate: [
          {
            path: "allowedBuyers",
            select: "companyName", // Fetch only companyName for each allowed buyer
          },
          {
            path: "highestBidder",
            select: "companyName", // Fetch only companyName for the highest bidder
          },
        ],
      })
      .populate("seller", "companyName");

    // 🔹 If req.user doesn't exist, assume it's an admin and return all offer lists
    if (!req.user || req.user.userType === "admin") {
      const offerLists = await offerListsQuery.exec();
      const filteredOfferLists = offerLists
        .map((offerList) => {
          const filteredInvoices = offerList.invoices.filter(
            (invoice) => !invoice.isSaleOrderGenerated
          );

          return {
            ...offerList._doc,
            invoices: filteredInvoices,
          };
        })
        .filter((offerList) => offerList.invoices.length > 0)
        .sort((a, b) => b.createdAt - a.createdAt);

      return res.status(200).json({
        success: true,
        message: "Offer Lists fetched successfully",
        offerLists: filteredOfferLists,
      });
    }

    // 🔹 If the user is a buyer, filter offer lists based on allowedBuyers
    if (req.user.userType === "buyer") {
      const buyerId = req.user._id;

      let offerLists = await offerListsQuery.exec();

      // Filter invoices to keep only those that contain the buyer in allowedBuyers
      offerLists = offerLists
        .map((offerList) => ({
          ...offerList._doc, // Convert Mongoose object to plain object
          invoices: offerList.invoices.filter(
            (invoice) =>
              invoice.allowedBuyers.some((buyer) =>
                buyer._id.equals(buyerId)
              ) && !["Ordered", "Sold Out"].includes(invoice.status)
          ),
        }))
        .filter((offerList) => offerList.invoices.length > 0); // Remove offerLists with no valid invoices

      return res.status(200).json({
        success: true,
        message: "Offer Lists fetched successfully",
        offerLists,
      });
    }

    if (req.user.userType === "seller") {
      const sellerId = req.user._id;

      const offerLists = await OfferList.find({ seller: sellerId })
        .populate({
          path: "invoices",
          populate: [
            {
              path: "soldTo", // populate soldTo if present
              select: "companyName",
            },
          ],
        })
        .populate("seller", "companyName")
        .exec();

      return res.status(200).json({
        success: true,
        message: "Offer Lists fetched successfully",
        offerLists,
      });
    }

    // If user type is unknown (not admin or buyer), return unauthorized
    return res.status(403).json({ message: "Unauthorized access" });
  } catch (error) {
    console.error("Error fetching offer lists:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getAllInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find()
      .populate({
        path: "offerListNumber",
        select: "offerListNumber offerListStatus", // Only needed fields from OfferList
      })
      .populate({
        path: "allowedBuyers",
        select: "companyName", // Only companyName of allowed buyers
      })
      .populate({
        path: "highestBidder",
        select: "companyName", // Only companyName of highest bidder
      })
      .populate({
        path: "seller",
        select: "companyName", // Only companyName of seller
      })
      .exec();

    const updatedInvoices = invoices.filter(
      (val) => val.offerListNumber !== null
    );

    return res.status(200).json({
      success: true,
      message: "Invoices fetched successfully",
      invoices: updatedInvoices,
    });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

export const getUserSpecificOfferLists = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 🔹 If user is a buyer: show only Live offer lists with allowed access
    if (user.userType === "buyer") {
      const buyerId = user._id;

      let offerLists = await OfferList.find({ offerListStatus: "Live" })
        .populate({
          path: "invoices",
          populate: {
            path: "allowedBuyers",
            select: "companyName",
          },
        })
        .populate("seller", "companyName")
        .exec();

      // Filter invoices where buyer is allowed and not Ordered/Sold Out
      offerLists = offerLists
        .map((offerList) => {
          // build & map your invoices as before…
          const mapped = offerList.invoices
            .filter(
              (invoice) =>
                invoice.allowedBuyers.some((buyer) =>
                  buyer._id.equals(buyerId)
                ) &&
                !invoice.isSaleOrderGenerated &&
                (!invoice.soldTo || invoice.soldTo.equals(buyerId))
            )
            .map((invoice) => {
              // your biddingHistory/currentPrice tweak
              const userBids = invoice.biddingHistory
                .filter((bid) => bid.bidder.toString() === buyerId.toString())
                .sort((a, b) => new Date(b.bidTime) - new Date(a.bidTime));
              const latestBid = userBids.length ? [userBids[0]] : [];
              return {
                ...invoice._doc,
                biddingHistory: latestBid,
                currentPrice:
                  latestBid.length > 0
                    ? latestBid[0].bidPrice
                    : invoice.currentPrice,
              };
            });

          // sort 'Ordered' to the back
          const sortedInvoices = mapped.sort((a, b) => {
            if (a.status === "Ordered" && b.status !== "Ordered") return 1;
            if (a.status !== "Ordered" && b.status === "Ordered") return -1;
            return 0;
          });

          return {
            ...offerList._doc,
            invoices: sortedInvoices,
          };
        })
        .filter((offerList) => offerList.invoices.length > 0);

      return res.status(200).json({
        message: "Live Offer Lists fetched for buyer",
        offerLists,
      });
    }

    // 🔹 If user is a seller: show ALL their offer lists regardless of status
    if (user.userType === "seller") {
      const sellerId = user._id;

      const offerLists = await OfferList.find({ seller: sellerId })
        .populate({
          path: "invoices",
          populate: {
            path: "soldTo",
            select: "companyName",
          },
        })
        .populate("seller", "companyName");

      return res.status(200).json({
        message: "All Offer Lists fetched for seller",
        offerLists,
      });
    }

    return res.status(403).json({ message: "Unauthorized access" });
  } catch (error) {
    console.error("Error fetching offer lists:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getUpcomingOfferLists = async (req, res) => {
  console.log("getUpcomingOfferLists");

  try {
    const offerLists = await OfferList.find({ offerListStatus: "Upcoming" })
      .populate({
        path: "invoices",
        populate: {
          path: "allowedBuyers",
          select: "companyName",
        },
      })
      .populate("seller", "companyName");

    return res.status(200).json({
      success: true,
      message: "Upcoming Offer Lists fetched successfully",
      offerLists,
    });
  } catch (error) {
    console.error("Error fetching upcoming offer lists:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

export const updateInvoicePrices = async (req, res) => {
  console.log(req.body);
  console.log("updateInvoicePrices");

  try {
    const { invoiceIds, userType, price, bidderId } = req.body;

    // Validate input
    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({ message: "Invalid invoice IDs" });
    }
    if (!userType || !["buyer", "admin"].includes(userType)) {
      return res.status(400).json({ message: "Invalid user type" });
    }
    if (typeof price !== "number" || price <= 0) {
      return res.status(400).json({ message: "Invalid price" });
    }

    if (userType === "buyer" && !bidderId) {
      return res
        .status(400)
        .json({ message: "Bidder ID is required for buyers" });
    }

    // Check if any invoice has already been marked as "Ordered"
    const soldOutInvoices = await Invoice.find({
      _id: { $in: invoiceIds },
      status: "Ordered",
    });

    if (soldOutInvoices.length > 0) {
      return res.status(400).json({
        success: false,
        message: "One or more invoices have sold out",
      });
    }

    let isOfferListLive = true; // Flag to check if any offer list is not live

    // First, check if any offer list associated with the invoices is not live
    const invoices = await Invoice.find({ _id: { $in: invoiceIds } }).populate(
      "offerListNumber"
    );
    for (const invoice of invoices) {
      const offerList = invoice.offerListNumber;
      if (!offerList || offerList.offerListStatus !== "Live") {
        isOfferListLive = false;
        break;
      }
    }

    if (!isOfferListLive) {
      return res.status(400).json({
        success: false,
        message: "One or more offer lists are not taking bids",
      });
    }

    const updatedInvoices = [];

    for (const invoiceId of invoiceIds) {
      // Find the invoice
      const invoice = await Invoice.findById(invoiceId);
      if (!invoice) {
        continue; // Skip if invoice not found
      }

      if (userType === "buyer") {
        // Buyer: Add bid to bidding history, update highest bid & status
        const bidEntry = {
          bidder: bidderId,
          bidPrice: price,
        };
        invoice.biddingHistory.push(bidEntry);

        if (price > invoice.highestBiddingPrice) {
          invoice.highestBiddingPrice = price;
          invoice.highestBidder = bidderId;
          invoice.highestBidTime = new Date();
        }

        invoice.status = "Your Counter Price";
      } else if (userType === "admin") {
        // Admin: Update only the current price & status (No bidding history)
        invoice.adminBid = price;
        invoice.currentPrice = price;
        invoice.status = "Your Counter Price";
        invoice.adminBidTime = new Date();
      }

      // Save the updated invoice
      await invoice.save();

      if (userType === "buyer") {
        const buyer = await User.findById(bidderId).select("companyName");
        const populatedInvoice = await Invoice.findById(invoice._id).populate(
          "offerListNumber"
        );

        if (buyer && populatedInvoice.offerListNumber) {
          const offerList = populatedInvoice.offerListNumber;

          const newNotification = new Notification({
            role: "admin",
            type: "NEW_OFFER",
            message: `New Offer placed by ${buyer.companyName} on invoice number ${invoice.invoiceNumber} in offerlist ${offerList.offerListNumber}`,
            link: `${offerList._id}`,
          });

          await newNotification.save();
        }
      }

      if (userType === "admin") {
        const populatedInvoice = await Invoice.findById(invoice._id)
          .populate("offerListNumber")
          .populate("allowedBuyers", "_id"); // assuming buyers are stored here

        const offerList = populatedInvoice.offerListNumber;

        if (offerList && populatedInvoice.allowedBuyers?.length > 0) {
          for (const buyer of populatedInvoice.allowedBuyers) {
            const buyerId = buyer._id;

            const notification = new Notification({
              recipient: buyerId,
              role: "buyer",
              type: "ADMIN_OFFER",
              message: `Price of invoice number ${invoice.invoiceNumber} in offerlist ${offerList.offerListNumber} has been updated. Check Now!`,
              link: `${offerList._id}`, // adjust route if needed
            });

            await notification.save();
          }
        }
      }

      updatedInvoices.push(invoice);
    }

    if (updatedInvoices.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No valid invoices updated" });
    }

    if (userType === "buyer") {
      const buyerId = bidderId;

      let offerLists = await OfferList.find({ offerListStatus: "Live" })
        .populate({
          path: "invoices",
          populate: {
            path: "allowedBuyers",
            select: "companyName",
          },
        })
        .populate("seller", "companyName")
        .exec();

      // Filter invoices where buyer is allowed and not Ordered/Sold Out
      offerLists = offerLists
        .map((offerList) => ({
          ...offerList._doc,
          invoices: offerList.invoices.filter(
            (invoice) =>
              invoice.allowedBuyers.some((buyer) =>
                buyer._id.equals(buyerId)
              ) && !["Ordered", "Sold Out"].includes(invoice.status)
          ),
        }))
        .filter((offerList) => offerList.invoices.length > 0);

      return res.status(200).json({
        success: true,
        message: "Live Offer Lists fetched for buyer",
        offerLists,
      });
    } else {
      getAllOfferLists(req, res);
    }
  } catch (error) {
    console.error("Error updating invoice prices:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const acceptBidByBuyer = async (req, res) => {
  try {
    const { invoiceIds } = req.body;
    const buyerId = req.user._id; // assumes token middleware adds req.user

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid invoice IDs" });
    }

    const buyer = await User.findById(buyerId);

    if (!buyer) {
      return res
        .status(404)
        .json({ success: false, message: "Buyer not found" });
    }

    // Fetch all invoices by their IDs
    const invoices = await Invoice.find({ _id: { $in: invoiceIds } }).populate(
      "offerListNumber"
    );

    // Check if any invoice has already been ordered
    const alreadyOrdered = invoices.some((inv) => inv.status === "Ordered");

    if (alreadyOrdered) {
      return res.status(400).json({
        success: false,
        message: "One or more invoices have already been sold.",
      });
    }

    const updatedInvoices = [];

    for (const invoice of invoices) {
      invoice.soldTo = buyerId;
      invoice.status = "Ordered";

      const bidEntry = {
        bidder: buyerId,
        bidPrice: invoice.adminBid,
      };
      invoice.biddingHistory.push(bidEntry);

      // Update bidding details
      invoice.highestBiddingPrice = invoice.adminBid;
      invoice.highestBidder = buyerId;
      invoice.highestBidTime = new Date();
      // Add invoice to buyer's orders
      await User.findByIdAndUpdate(buyerId, {
        $push: { orders: invoice._id },
      });

      // Remove invoice from all users' watchlist
      await User.updateMany(
        { watchlist: invoice._id },
        { $pull: { watchlist: invoice._id } }
      );

      await invoice.save();
      updatedInvoices.push(invoice);

      // Create admin notification

      const newNotification = new Notification({
        role: "admin",
        type: "BID_ACCEPTED_BY_BUYER",
        message: `Offer accepted by ${buyer.companyName}. Check Now!`,
        link: `/order/${invoice._id}`,
      });

      await Notification.deleteMany({
        type: { $in: ["NEW_OFFER", "ADMIN_OFFER"] },
        link: invoice.offerListNumber._id.toString(),
      });

      await newNotification.save();
    }

    if (updatedInvoices.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No invoices were updated." });
    }

    res.status(200).json({
      success: true,
      message: "Bid(s) accepted successfully.",
      updatedInvoices,
    });
  } catch (error) {
    console.error("Error accepting bid by buyer:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const deleteInvoice = async (req, res) => {
  try {
    const { invoiceIds } = req.body;

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No invoice IDs provided" });
    }

    const deletedInvoiceIds = new Set();
    const checkedOfferListIds = new Set();

    // First, check if any related OfferList is "Live"
    for (const invoiceId of invoiceIds) {
      const invoice = await Invoice.findById(invoiceId);
      if (!invoice) continue;

      const offerListId = invoice.offerListNumber?.toString();
      if (!offerListId || checkedOfferListIds.has(offerListId)) continue;

      const offerList = await OfferList.findById(offerListId);
      if (offerList?.status === "Live") {
        return res.status(403).json({
          success: false,
          message: `Cannot delete invoices: OfferList ${offerList._id} is currently Live.`,
        });
      }

      checkedOfferListIds.add(offerListId);
    }

    // Safe to proceed with deletions
    for (const invoiceId of invoiceIds) {
      const invoice = await Invoice.findById(invoiceId);
      if (!invoice || invoice.status === "Ordered") continue;

      await OfferList.findByIdAndUpdate(invoice.offerListNumber, {
        $pull: { invoices: invoiceId },
      });

      await Invoice.findByIdAndDelete(invoiceId);
      // await deleteNotificationForInvoice(invoice.invoiceNumber);

      deletedInvoiceIds.add(invoiceId);
    }

    return res.status(200).json({
      success: true,
      message: "Invoices deleted successfully.",
      deletedInvoiceIds: Array.from(deletedInvoiceIds),
    });
  } catch (error) {
    console.error("Error deleting invoices:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getMyWatchlist = async (req, res) => {
  try {
    const buyerId = req.user._id;

    // Fetch the user and populate watchlist with necessary fields
    const user = await User.findById(buyerId).populate({
      path: "watchlist",
      populate: [
        {
          path: "allowedBuyers",
          select: "companyName",
        },
        {
          path: "highestBidder",
          select: "companyName",
        },
        {
          path: "seller",
          select: "companyName",
        },
        {
          path: "offerListNumber",
          select: "offerListNumber offerListStatus",
        },
      ],
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // 🔍 Process and filter watchlist invoices like normal invoices
    const invoices = user.watchlist
      .filter(
        (invoice) =>
          invoice.allowedBuyers.some((buyer) => buyer._id.equals(buyerId)) &&
          !invoice.isSaleOrderGenerated &&
          (!invoice.soldTo || invoice.soldTo.equals(buyerId))
      )
      .map((invoice) => {
        const userBids = invoice.biddingHistory
          .filter((bid) => bid.bidder.toString() === buyerId.toString())
          .sort((a, b) => new Date(b.bidTime) - new Date(a.bidTime));
        const latestBid = userBids.length ? [userBids[0]] : [];

        return {
          ...invoice._doc,
          biddingHistory: latestBid,
          currentPrice:
            latestBid.length > 0 ? latestBid[0].bidPrice : invoice.currentPrice,
        };
      });

    // 🔃 Optional: sort like offerlist invoices (put "Ordered" at end)
    const sortedInvoices = invoices.sort((a, b) => {
      if (a.status === "Ordered" && b.status !== "Ordered") return 1;
      if (a.status !== "Ordered" && b.status === "Ordered") return -1;
      return 0;
    });

    return res.status(200).json({
      success: true,
      message: "Watchlist retrieved successfully",
      watchlist: sortedInvoices,
    });
  } catch (error) {
    console.error("Error fetching watchlist:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const addToWatchlist = async (req, res) => {
  try {
    const userId = req.user._id; // Get logged-in user's ID
    const { invoiceIds } = req.body; // Array of invoice IDs from request body

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid request. Provide an array of invoice IDs.",
      });
    }

    // Validate invoices exist
    const invoices = await Invoice.find({ _id: { $in: invoiceIds } });

    if (invoices.length !== invoiceIds.length) {
      return res.status(404).json({
        success: false,
        message: "Some invoices not found",
      });
    }

    // Update user's watchlist (avoid duplicates)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { watchlist: { $each: invoiceIds } } }, // $addToSet ensures no duplicates
      { new: true }
    ).populate({
      path: "watchlist",
      populate: [
        {
          path: "offerListNumber",
          select: "offerListNumber", // Get seller's companyName
        },
      ],
    });

    res.status(200).json({
      success: true,
      message: "Invoices added to watchlist",
      watchlist: updatedUser.watchlist,
    });
  } catch (error) {
    console.error("Error adding to watchlist:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const removeFromWatchlist = async (req, res) => {
  try {
    const userId = req.user._id; // Get logged-in user's ID
    const { invoiceIds } = req.body; // Array of invoice IDs to remove

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid request. Provide an array of invoice IDs to remove.",
      });
    }

    // Update user's watchlist by pulling the specified invoices
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $pull: { watchlist: { $in: invoiceIds } } }, // $pull removes the matching invoice IDs
      { new: true }
    ).populate({
      path: "watchlist",
      populate: [
        {
          path: "offerListNumber",
          select: "offerListNumber", // Get seller's companyName
        },
      ],
    });

    res.status(200).json({
      success: true,
      message: "Invoices removed from watchlist",
      watchlist: updatedUser.watchlist,
    });
  } catch (error) {
    console.error("Error removing from watchlist:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getAllOrdersForUser = async (req, res) => {
  try {
    const userId = req.user._id; // Extract logged-in user ID

    // Fetch user and populate the 'orders' field with full invoice details and seller name
    const user = await User.findById(userId).populate({
      path: "orders",
      populate: [
        {
          path: "seller",
          select: "companyName", // Fetch seller's name & companyName
        },
        {
          path: "offerListNumber",
          select: "offerListNumber",
        },
        {
          path: "highestBidder",
          select: "companyName",
        },
      ],
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "Orders retrieved successfully",
      orders: user.orders, // Send full invoice details
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getAllOrdersForAdmin = async (req, res) => {
  try {
    // Fetch all users with their orders, including seller and offer list details
    const users = await User.find()
      .populate({
        path: "orders",
        populate: [
          {
            path: "seller",
            select: "companyName", // Fetch seller's company name
          },
          {
            path: "offerListNumber",
            select: "offerListNumber", // Get Offer List Number
          },
          {
            path: "highestBidder",
            select: "companyName",
          },
        ],
      })
      .select("companyName orders"); // Fetch company name of each user

    if (!users || users.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No orders found" });
    }

    // Transforming data: Extract user companyName & their orders
    const orders = users.flatMap((user) =>
      user.orders.map((order) => ({
        ...order._doc, // Spread invoice details
        buyerCompanyName: user.companyName, // Include buyer's company name
      }))
    );

    res.status(200).json({
      success: true,
      message: "Orders retrieved successfully",
      orders,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const updateOfferlistStatus = async (req, res) => {
  try {
    const { offerlistId, offerListStatus } = req.body;

    // Add input validation (optional but recommended)
    if (!offerlistId || !offerListStatus) {
      return res.status(400).json({
        success: false,
        message: "Missing offerlistId or offerListStatus in request body",
      });
    }

    // Add await to actually execute the query
    const offerlist = await OfferList.findById(offerlistId).populate(
      "invoices"
    );

    if (!offerlist) {
      return res.status(404).json({
        success: false,
        message: "Offerlist doesn't exist",
      });
    }

    // Update the status
    offerlist.offerListStatus = offerListStatus;

    // Save the updated document
    await offerlist.save();

    if (offerListStatus === "Live") {
      await createNewNotificationForOfferlistLive(
        "OFFERLIST_LIVE",
        offerlist._id.toString(),
        offerlist.offerListNumber,
        offerlist.invoices
      );
    }
    if (offerListStatus === "Upcoming" || offerListStatus === "Hidden") {
      await deleteNotificationForOfferlist(offerlist._id.toString());
    }
    // Send success response with updated data
    getAllOfferLists(req, res);
  } catch (error) {
    // Handle errors properly
    console.error("Error updating offerlist status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const updateBuyers = async (req, res) => {
  try {
    const { invoiceId, newBuyers } = req.body;

    if (!invoiceId || !Array.isArray(newBuyers)) {
      return res.status(400).json({ message: "Invalid input data" });
    }

    // Find and update the invoice with new buyers
    const updatedInvoice = await Invoice.findByIdAndUpdate(
      invoiceId,
      { allowedBuyers: newBuyers },
      { new: true } // Returns the updated document
    ).populate("allowedBuyers", "name email"); // Populate buyers' details if needed

    if (!updatedInvoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    await getAllOfferLists(req, res);
  } catch (error) {
    console.error("Error updating buyers:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const updateBuyersForMultipleInvoices = async (req, res) => {
  try {
    const { invoiceIds, newBuyers } = req.body;

    if (!Array.isArray(invoiceIds) || !Array.isArray(newBuyers)) {
      return res.status(400).json({ message: "Invalid input data" });
    }

    const updatePromises = invoiceIds.map(async (id) => {
      const invoice = await Invoice.findById(id);
      if (!invoice) return null;

      const currentBuyers = invoice.allowedBuyers.map((b) => b.toString());
      const buyersToAdd = newBuyers.filter(
        (buyerId) => !currentBuyers.includes(buyerId)
      );

      invoice.allowedBuyers = [...invoice.allowedBuyers, ...buyersToAdd];

      return await invoice.save();
    });

    const updatedInvoices = await Promise.all(updatePromises);

    const notFound = updatedInvoices
      .map((invoice, index) => (!invoice ? invoiceIds[index] : null))
      .filter(Boolean);

    if (notFound.length > 0) {
      return res.status(404).json({
        message: "Some invoices were not found",
        notFoundInvoiceIds: notFound,
      });
    }

    // Populate buyers after all updates
    const populatedInvoices = await Invoice.find({
      _id: { $in: invoiceIds },
    }).populate("allowedBuyers", "name email");

    await getAllOfferLists(req, res);
  } catch (error) {
    console.error("Error updating buyers for multiple invoices:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const uploadOfferDocuments = async (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId)
      return res.status(400).json({ message: "Invoice ID is required" });

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    // Create Drive Folder named by invoiceNumber
    const folderId = await createDriveFolder(invoice.invoiceNumber);

    // Helper to upload one file
    const uploadIfExists = async (fieldName) => {
      const file = req.files?.[fieldName]?.[0];
      if (!file) return null;

      const filePath = file.path;
      const fileName = file.originalname;
      const driveUrl = await uploadFileToDrive(filePath, fileName, folderId);

      // Clean up local file
      fs.unlinkSync(filePath);
      return driveUrl;
    };

    // Upload all three files
    const sellerInvoiceUrl = await uploadIfExists("sellerInvoice");
    const deliveryNoteUrl = await uploadIfExists("deliveryNote");
    const ewayBillUrl = await uploadIfExists("eWayBill");

    // Save links in Invoice model
    invoice.sellerInvoiceUrl = sellerInvoiceUrl || invoice.sellerInvoiceUrl;
    invoice.deliveryNoteUrl = deliveryNoteUrl || invoice.deliveryNoteUrl;
    invoice.ewayBillUrl = ewayBillUrl || invoice.ewayBillUrl;

    await invoice.save();

    if (invoice.soldTo) {
      const notification = new Notification({
        recipient: invoice.soldTo,
        role: "buyer",
        type: "ORDER_DOCS_UPDATED",
        message: `Documents for Invoice ${invoice.invoiceNumber} have been updated. Check Now!`,
        link: `/buyer-dashboard/order/${invoice._id}`,
      });

      await notification.save();
    }

    return res.status(200).json({
      message: "Documents uploaded and saved successfully",
      urls: {
        sellerInvoiceUrl,
        deliveryNoteUrl,
        ewayBillUrl,
      },
    });
  } catch (error) {
    console.error("Error uploading documents:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const deleteOfferList = async (req, res) => {
  try {
    const { offerListId } = req.body;

    if (!offerListId) {
      return res
        .status(400)
        .json({ success: false, message: "OfferList ID is required." });
    }

    const offerList = await OfferList.findById(offerListId);
    if (!offerList) {
      return res
        .status(404)
        .json({ success: false, message: "Offer list not found." });
    }

    // ✅ Check if the offer list is live
    if (offerList.status === "Live") {
      return res.status(400).json({
        success: false,
        message: "Live offer list cannot be deleted.",
      });
    }

    const invoiceIds = offerList.invoices;

    // ✅ Fetch all invoices to check their status
    const invoices = await Invoice.find({ _id: { $in: invoiceIds } });

    const allAreYourPrice = invoices.every(
      (invoice) => invoice.status === "Your Price"
    );

    if (!allAreYourPrice) {
      return res.status(400).json({
        success: false,
        message: "Offer list with bids/orders cannot be deleted.",
      });
    }

    // ✅ Delete all related invoices
    await Invoice.deleteMany({ _id: { $in: invoiceIds } });

    // ✅ Remove invoice references from users' orders
    await User.updateMany(
      { orders: { $in: invoiceIds } },
      { $pull: { orders: { $in: invoiceIds } } }
    );

    // ✅ Remove invoice references from users' watchlists
    await User.updateMany(
      { watchlist: { $in: invoiceIds } },
      { $pull: { watchlist: { $in: invoiceIds } } }
    );

    // ✅ Remove offerList reference from seller
    await User.updateOne(
      { _id: offerList.seller },
      { $pull: { offerLists: offerList._id } }
    );

    // ✅ Delete the offer list
    await OfferList.findByIdAndDelete(offerListId);

    // ✅ Delete related notifications
    // await deleteNotificationForOfferlist(offerListId);

    return res.status(200).json({
      success: true,
      message:
        "Offer list, related invoices, and user references deleted successfully.",
      deletedOfferId: offerListId,
    });
  } catch (error) {
    console.error("Error deleting offer list:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while deleting the offer list.",
      error: error.message,
    });
  }
};

export const acceptBid = async (req, res) => {
  try {
    const { invoiceIds } = req.body;
    const user = req.user;

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({ message: "Invalid invoice IDs" });
    }

    const updatedInvoices = [];

    for (const invoiceId of invoiceIds) {
      const invoice = await Invoice.findById(invoiceId).populate(
        "offerListNumber"
      );

      if (!invoice || !invoice.highestBidder) {
        continue; // Skip if invoice not found or no highest bidder
      }

      // Assign highest bidder to 'offeredTo' field
      invoice.soldTo = invoice.highestBidder;
      invoice.status = "Ordered";

      // Push invoice to the highest bidder's 'orders' array
      await User.findByIdAndUpdate(invoice.highestBidder, {
        $push: { orders: invoice._id },
      });

      // Remove invoice from all users' watchlist
      await User.updateMany(
        { watchlist: invoice._id },
        { $pull: { watchlist: invoice._id } }
      );

      await invoice.save();
      updatedInvoices.push(invoice);

      // await Notification.create({
      //   recipient: invoice.highestBidder,
      //   role: "buyer",
      //   type: "BID_ACCEPTED_BY_ADMIN",
      //   message: "Invoice offer accepted. Check now!",
      //   link: `/buyer-dashboard/order/${invoice._id}`,
      // });

      // await Notification.deleteMany({
      //   type: { $in: ["NEW_OFFER", "ADMIN_OFFER"] },
      //   link: invoice.offerListNumber._id.toString(),
      // });
    }

    if (updatedInvoices.length === 0) {
      return res.status(404).json({ message: "No valid invoices updated" });
    }

    await getAllOfferLists(req, res);
  } catch (error) {
    console.error("Error accepting bid:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const createOrdersAfterBidAcceptance = async (req, res) => {
  console.log("New accept controller ");

  try {
    const { invoiceIds } = req.body;
    const userId = req.user._id;
    const userType = req.user.userType;

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid invoice IDs" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const invoices = await Invoice.find({ _id: { $in: invoiceIds } }).populate(
      "offerListNumber seller"
    );

    const alreadyOrdered = invoices.some((inv) => inv.status === "Ordered");
    if (alreadyOrdered) {
      return res.status(400).json({
        success: false,
        message: "One or more invoices have already been sold.",
      });
    }

    const createdOrders = [];

    for (const invoice of invoices) {
      let buyerId;

      if (userType === "admin") {
        buyerId = invoice.highestBidder;

        invoice.soldTo = invoice.highestBidder;
        invoice.status = "Ordered";
        if (!buyerId) {
          continue;
        }
      } else {
        buyerId = userId;

        invoice.soldTo = buyerId;
        invoice.status = "Ordered";
        invoice.highestBidder = buyerId;
        invoice.highestBiddingPrice = invoice.adminBid;
        invoice.highestBidTime = new Date();
        invoice.biddingHistory.push({
          bidder: buyerId,
          bidPrice: invoice.adminBid,
        });
      }

      await invoice.save();

      // Remove from all watchlists
      await User.updateMany(
        { watchlist: invoice._id },
        { $pull: { watchlist: invoice._id } }
      );

      // Create new order
      const newOrder = new Order({
        invoice: invoice._id,
        buyer: buyerId,
        seller: invoice.seller._id,
        deliveryStatus: "Generating SO No.",
      });
      await newOrder.save();
      createdOrders.push(newOrder);

      // Delete related offer notifications
      await Notification.deleteMany({
        type: { $in: ["NEW_OFFER", "ADMIN_OFFER"] },
        link: invoice.offerListNumber._id.toString(),
      });

      // Notifications
      if (userType === "buyer") {
        // Notify admin
        await Notification.create({
          role: "admin",
          recipient: userId,
          type: "BID_ACCEPTED_BY_BUYER",
          message: `Offer accepted by ${user.companyName}. Check Now!`,
          link: `/orders`,
        });
      } else if (userType === "admin") {
        // Notify buyer
        await Notification.create({
          role: "buyer",
          recipient: buyerId,
          type: "BID_ACCEPTED_BY_ADMIN",
          message: "Invoice offer accepted. Check now!",
          link: `/buyer-dashboard/orders`,
        });
      }
    }

    getAllOfferLists(req, res);

    // return res.status(200).json({
    //   success: true,
    //   message: "Order(s) created successfully.",
    //   orders: createdOrders,
    // });
  } catch (error) {
    console.error("Error creating orders:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

export const downloadOfferList = async (req, res) => {
  try {
    const { offerListId } = req.params;
    console.log(offerListId);

    const query = offerListId ? { _id: offerListId } : {};

    const offerLists = await OfferList.find(query)
      .populate({
        path: "invoices",
        populate: [
          { path: "allowedBuyers", select: "companyName" },
          { path: "highestBidder", select: "companyName" },
          { path: "soldTo", select: "companyName" },
          { path: "seller", select: "companyName" },
        ],
        select:
          "-sellerInvoiceUrl -deliveryNoteUrl -ewayBillUrl -offerListNumber", // exclude these fields
      })
      .populate("seller", "companyName");

    if (!offerLists || offerLists.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No OfferLists found" });
    }

    // Create Excel workbook and sheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Offer Lists");

    worksheet.columns = [
      { header: "Offer List Number", key: "offerListNumber", width: 20 },
      { header: "Seller", key: "seller", width: 20 },
      { header: "Invoice Number", key: "invoiceNumber", width: 20 },
      { header: "Mark", key: "mark", width: 15 },
      { header: "Grade", key: "grade", width: 15 },
      { header: "Quantity", key: "quantity", width: 15 },
      { header: "Bags", key: "bags", width: 10 },
      { header: "Price", key: "price", width: 10 },
      { header: "Current Price", key: "currentPrice", width: 15 },
      { header: "Admin Bid", key: "adminBid", width: 12 },
      {
        header: "Highest Bidding Price",
        key: "highestBiddingPrice",
        width: 20,
      },
      { header: "Highest Bidder", key: "highestBidder", width: 20 },
      { header: "Allowed Buyers", key: "allowedBuyers", width: 40 },
      { header: "Sold To", key: "soldTo", width: 20 },
      { header: "Status", key: "status", width: 20 },
      { header: "Invoice Created At", key: "createdAt", width: 25 },
    ];

    for (const offerList of offerLists) {
      for (const invoice of offerList.invoices) {
        worksheet.addRow({
          offerListNumber: offerList.offerListNumber,
          seller: offerList.seller?.companyName || "",
          invoiceNumber: invoice.invoiceNumber || "",
          mark: invoice.mark || "",
          grade: invoice.grade || "",
          quantity: invoice.quantity || "",
          bags: invoice.bags || "",
          price: invoice.price || "",
          currentPrice: invoice.currentPrice || "",
          adminBid: invoice.adminBid || "",
          highestBiddingPrice: invoice.highestBiddingPrice || "",
          highestBidder: invoice.highestBidder?.companyName || "",
          allowedBuyers: invoice.allowedBuyers
            .map((b) => b.companyName)
            .join(", "),
          soldTo: invoice.soldTo?.companyName || "",
          status: invoice.status || "",
          createdAt: invoice.createdAt?.toLocaleString() || "",
        });
      }
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    const filename = offerListId
      ? `OfferList_${offerLists[0].offerListNumber}.xlsx`
      : "All_OfferLists.xlsx";
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error downloading offer list(s):", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
