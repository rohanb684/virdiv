import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, select: false },
    googleId: { type: String, unique: true, sparse: true },
    avatar: { type: String },
    userType: {
      type: String,
      enum: ["buyer", "seller", "admin", "superAdmin"],
      required: true,
      default: "buyer",
    },
    authProvider: {
      type: String,
      enum: ["manual", "google"],
      required: true,
    },
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },

    isVerified: { type: Boolean, default: false },
    companyName: { type: String },
    phoneNumber: { type: String },
    hasCompletedOnboarding: { type: Boolean, default: false },
    gst: { type: String },
    fssai: { type: String },
    folderLink: { type: String },
    uploadedDocuments: [{ type: String }],
    rejectionReason: { type: String },

    orders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Invoice" }], // Orders linked to invoices
    offerLists: [{ type: mongoose.Schema.Types.ObjectId, ref: "OfferList" }], // Offer lists linked to the user
    watchlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Invoice" }],
  },
  { timestamps: true } // Enables createdAt & updatedAt automatically
);

const User = mongoose.model("User", userSchema);

export default User;
