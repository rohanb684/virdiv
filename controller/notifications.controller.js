import mongoose from "mongoose";
import Notification from "../models/notifications.model.js";

export const getAdminNotifications = async (req, res) => {
  try {
    // Calculate the date one week ago
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Delete admin notifications older than a week
    await Notification.deleteMany({
      role: "admin",
      createdAt: { $lt: oneWeekAgo },
    });

    // Fetch latest admin notifications
    const notifications = await Notification.find({
      role: "admin",
    }).sort({ createdAt: -1 }); // newest first

    res.status(200).json({
      success: true,
      notifications,
    });
  } catch (error) {
    console.error("Error fetching admin notifications:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getBuyerNotifications = async (req, res) => {
  try {
    const buyerId = req.user._id;

    const notifications = await Notification.find({
      role: "buyer",
      recipient: buyerId,
    }).sort({ createdAt: -1 }); // Newest first

    res.status(200).json({
      success: true,
      notifications,
    });
  } catch (error) {
    console.error("Error fetching buyer notifications:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const deleteNotificationForOfferlist = async (link) => {
  try {
    const result = await Notification.deleteMany({ link });
    console.log(
      `${result.deletedCount} notification(s) deleted for link: ${link}`
    );
    return result;
  } catch (error) {
    console.error("Error deleting notifications for link:", link, error);
    throw error;
  }
};

export const createNewNotificationForOfferlistLive = async (
  type,
  link,
  offerListNumber,
  invoices
) => {
  try {
    // Collect unique allowed buyers from invoices
    const buyerIdSet = new Set();

    for (const invoice of invoices) {
      if (Array.isArray(invoice.allowedBuyers)) {
        invoice.allowedBuyers.forEach((buyerId) =>
          buyerIdSet.add(buyerId.toString())
        );
      }
    }

    const uniqueBuyerIds = Array.from(buyerIdSet);

    // Create notifications for each unique buyer
    const buyerNotifications = uniqueBuyerIds.map((buyerId) => ({
      recipient: buyerId,
      role: "buyer",
      type,
      message: `New offer list ${offerListNumber} is now live. Check Now!`,
      link,
    }));

    if (buyerNotifications.length > 0) {
      await Notification.insertMany(buyerNotifications);
    }
  } catch (error) {
    console.log("Error while creating notifications: ", error);
  }
};

export const deleteNotificationForInvoice = async (invoiceNumber) => {
  try {
    const regex = new RegExp(invoiceNumber, "i"); // case-insensitive match
    const result = await Notification.deleteMany({
      message: { $regex: regex },
    });

    console.log(
      `${result.deletedCount} notification(s) deleted for invoice: ${invoiceNumber}`
    );
    return result;
  } catch (error) {
    console.error(
      `Error deleting notifications for invoice: ${invoiceNumber}`,
      error
    );
    throw error;
  }
};

export const markNotificationsAsRead = async (req, res) => {
  try {
    const { notificationIds } = req.body;

    // Validate input
    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "notificationIds must be a non-empty array",
      });
    }

    // Ensure all IDs are valid MongoDB ObjectIDs
    const validIds = notificationIds.filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );

    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid notification IDs provided",
      });
    }

    // Update all matching notifications
    await Notification.updateMany(
      { _id: { $in: validIds } },
      { $set: { isRead: true } }
    );

    res.status(200).json({
      success: true,
      message: "Notifications marked as read",
    });
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
