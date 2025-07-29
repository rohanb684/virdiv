import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    role: {
      type: String,
      enum: ["admin", "buyer", "seller"],
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "NEW_USER_REGISTERED",
        "BID_ACCEPTED_BY_BUYER",
        "BID_ACCEPTED_BY_ADMIN",
        "NEW_OFFER",
        "ADMIN_OFFER",
        "ORDER_DOCS_UPDATED",
        "ORDER_UPDATED",
        "WELCOME",
        "OFFERLIST_LIVE",
      ],
    },
    message: {
      type: String,
      required: true,
    },
    link: {
      type: String, // URL or route (e.g., `/admin/invoice/1244`)
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
