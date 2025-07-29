import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema(
  {
    offerListNumber: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OfferList",
      required: true,
    },
    invoiceNumber: { type: String, required: true },
    mark: { type: String, required: true },
    grade: { type: String, required: true },
    quantity: { type: String, required: true },
    bags: { type: Number, required: true },
    price: { type: Number, required: true },
    currentPrice: { type: Number, required: true },
    adminBid: { type: Number, required: true },
    adminBidTime: { type: Date, default: null },
    highestBiddingPrice: { type: Number, default: 0 },
    highestBidder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    highestBidTime: { type: Date, default: null },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    allowedBuyers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    soldTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["Your Price", "Your Counter Price", "Ordered"],
      default: "Your Price",
    },
    biddingHistory: [
      {
        bidder: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        bidPrice: { type: Number, required: true },
        bidTime: { type: Date, default: Date.now },
      },
    ],

    sellerInvoiceUrl: { type: String, default: null },
    deliveryNoteUrl: { type: String, default: null },
    ewayBillUrl: { type: String, default: null },
    isSaleOrderGenerated: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Invoice = mongoose.model("Invoice", invoiceSchema);

export default Invoice;
