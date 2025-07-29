import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Address Information
    shippingAddress: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      zipCode: { type: String },
      country: { type: String, default: "India" },
    },
    billingAddress: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      zipCode: { type: String },
      country: { type: String, default: "India" },
    },
    isBillingAddressSameAsShipping: {
      type: Boolean,
      default: false,
    },

    // Bank Details
    bankDetails: {
      accountHolderName: { type: String },
      accountNumber: { type: String },
      ifscCode: { type: String },
    },

    // Order & Delivery Status
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed"],
      default: "Pending",
    },
    paymentMethod: {
      type: String,
      enum: ["Razorpay", "Bank Transfer", "COD"],
      default: "Bank Transfer",
    },
    deliveryStatus: {
      type: String,
      enum: [
        "Generating SO No.",
        "Awaiting Address Update",
        "Awaiting Documents Upload",
        "Awaiting Bank Details",
        "Awaiting Payment Verification",
        "In Transit",
        "Delivered",
        "Transaction Complete",
      ],
      default: "Generating SO No.",
    },
    deliveryDate: { type: Date },
    trackingNumber: { type: String },
    remarks: { type: String },

    // Sale Order Details
    saleOrderNumber: { type: String, default: null },
    saleOrderGeneratedAt: { type: Date, default: null },

    // Related Documents
    documents: {
      taxInvoiceUrl: { type: String },
      ewayBillUrl: { type: String },
      cNoteUrl: { type: String },
      deliveryOrderUrl: { type: String },
    },
    transporter: {
      type: String,
    },
    cashDiscount: {
      type: String,
    },
    daysCount: {
      type: String,
    },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);

export default Order;
