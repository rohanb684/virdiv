import mongoose from "mongoose";

const offerListSchema = new mongoose.Schema(
  {
    offerListNumber: { type: String, required: true, unique: true },
    invoices: [{ type: mongoose.Schema.Types.ObjectId, ref: "Invoice" }],
    offerListStatus: {
      type: String,
      default: "Hidden",
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true } // ✅ Adds createdAt and updatedAt fields
);

const OfferList = mongoose.model("OfferList", offerListSchema);

export default OfferList;
