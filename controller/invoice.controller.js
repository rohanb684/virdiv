import Invoice from "../models/invoice.model.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";

export const getInvoicesReqAdmin = async (req, res) => {
  try {
    const { offerlistId } = req.params;

    const invoices = await Invoice.find({ offerListNumber: offerlistId })
      .populate({
        path: "offerListNumber",
        select: "offerListNumber offerListStatus",
      })
      .populate({
        path: "allowedBuyers",
        select: "companyName",
      })
      .populate({
        path: "highestBidder",
        select: "companyName",
      })
      .populate({
        path: "seller",
        select: "companyName",
      })
      .exec();

    return res.status(200).json({
      success: true,
      invoices: invoices,
    });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getInvoiceReqUser = async (req, res) => {
  try {
    const { offerlistId } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 🔹 Buyer-specific logic
    if (user.userType === "buyer") {
      const buyerId = user._id;

      let invoices = await Invoice.find({ offerListNumber: offerlistId })
        .populate({
          path: "allowedBuyers",
          select: "companyName",
        })
        .populate({
          path: "highestBidder",
          select: "companyName",
        })
        .populate({
          path: "seller",
          select: "companyName",
        })
        .populate({
          path: "offerListNumber",
          select: "offerListNumber offerListStatus",
        })
        .exec();

      // 🔍 Filter invoices where the buyer is allowed
      invoices = invoices
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
              latestBid.length > 0
                ? latestBid[0].bidPrice
                : invoice.currentPrice,
          };
        });

      const sortedInvoices = invoices.sort((a, b) => {
        if (a.status === "Ordered" && b.status !== "Ordered") return 1;
        if (a.status !== "Ordered" && b.status === "Ordered") return -1;
        return 0;
      });

      return res.status(200).json({
        success: true,
        invoices: sortedInvoices,
      });
    }

    // 🔹 Seller-specific logic
    if (user.userType === "seller") {
      const sellerId = user._id;

      const invoices = await Invoice.find({
        offerListNumber: offerlistId,
        seller: sellerId,
      })
        .populate({
          path: "allowedBuyers",
          select: "companyName",
        })
        .populate({
          path: "highestBidder",
          select: "companyName",
        })
        .populate({
          path: "seller",
          select: "companyName",
        })
        .populate({
          path: "offerListNumber",
          select: "offerListNumber offerListStatus",
        })
        .populate({
          path: "soldTo",
          select: "companyName",
        });

      return res.status(200).json({
        success: true,
        invoices,
      });
    }

    return res
      .status(403)
      .json({ success: false, message: "Unauthorized access" });
  } catch (error) {
    console.error("Error fetching user-specific invoices:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const handleBuyerBid = async (
  { invoiceIds, bidderId, price },
  io,
  socket
) => {
  if (!invoiceIds?.length || !bidderId || typeof price !== "number") return;

  const successful = [];
  const failed = [];

  for (const invoiceId of invoiceIds) {
    const invoice = await Invoice.findById(invoiceId).populate(
      "offerListNumber"
    );
    if (!invoice || invoice.status === "Ordered") {
      const populated = await populateInvoice(invoiceId);
      if (populated) failed.push(populated);
      continue;
    }

    const offerList = invoice.offerListNumber;
    if (!offerList || offerList.offerListStatus !== "Live") {
      const populated = await populateInvoice(invoiceId);
      if (populated) failed.push(populated);
      continue;
    }

    // Attempt atomic update for highest bid
    const updatedInvoice = await Invoice.findOneAndUpdate(
      {
        _id: invoiceId,
        status: { $ne: "Ordered" },
        offerListNumber: offerList._id,
        highestBiddingPrice: { $lt: price },
      },
      {
        $push: {
          biddingHistory: {
            bidder: bidderId,
            bidPrice: price,
            bidTime: new Date(),
          },
        },
        $set: {
          highestBiddingPrice: price,
          highestBidder: bidderId,
          highestBidTime: new Date(),
          status: "Your Counter Price",
        },
      },
      { new: true }
    );

    // If not highest, still add to history and treat as failed
    if (!updatedInvoice) {
      await Invoice.findByIdAndUpdate(invoiceId, {
        $push: {
          biddingHistory: {
            bidder: bidderId,
            bidPrice: price,
            bidTime: new Date(),
          },
        },
      });

      const populated = await populateInvoice(invoiceId);
      if (populated) failed.push(populated);
      continue;
    }

    // Successful bid
    const fullPopulatedInvoice = await populateInvoice(invoiceId);
    if (fullPopulatedInvoice) {
      successful.push(fullPopulatedInvoice);

      // Notify admins
      io.to(`admin_lot_${invoiceId}`).emit("new_highest_bid", {
        invoice: fullPopulatedInvoice,
      });
    }

    //  Check for hot lot condition
    const isHot = checkHotInvoiceLotHelper(fullPopulatedInvoice);
    if (isHot) {
      // Broadcast to everyone in the room except the sender
      socket.broadcast.to(`lot_${invoiceId}`).emit("hot_invoice_lot", {
        invoice: fullPopulatedInvoice,
      });
    }
  }

  socket.emit("buyer_bid_ack", {
    success: true,
    successful,
    failed,
    message: `Bids placed. Successful: ${successful.length}, Failed: ${failed.length}`,
  });
};

export const handleAdminBid = async ({ invoiceIds, price, adminId }, io) => {
  try {
    if (!Array.isArray(invoiceIds) || !price || !adminId) return [];

    for (const invoiceId of invoiceIds) {
      const invoice = await Invoice.findById(invoiceId)
        .populate("offerListNumber")
        .populate("allowedBuyers");

      if (!invoice || invoice.status === "Ordered") continue;
      if (
        !invoice.offerListNumber ||
        invoice.offerListNumber.offerListStatus !== "Live"
      )
        continue;

      // Perform atomic update if invoice is not already ordered
      const updatedInvoice = await Invoice.findOneAndUpdate(
        {
          _id: invoiceId,
          status: { $ne: "Ordered" },
        },
        {
          $set: {
            adminBid: price,
            currentPrice: price,
            status: "Your Counter Price",
            adminBidTime: new Date(),
          },
          $push: {
            biddingHistory: {
              bidder: adminId,
              bidPrice: price,
              bidTime: new Date(),
            },
          },
        },
        { new: true }
      );

      if (!updatedInvoice) continue;

      const fullPopulatedInvoice = await Invoice.findById(invoiceId)
        .populate({
          path: "allowedBuyers",
          select: "companyName",
        })
        .populate({
          path: "highestBidder",
          select: "companyName",
        })
        .populate({
          path: "seller",
          select: "companyName",
        })
        .populate({
          path: "offerListNumber",
          select: "offerListNumber offerListStatus",
        });

      io.to(`lot_${invoice._id}`).emit("admin_bid_updated", {
        invoice: fullPopulatedInvoice,
      });
      io.to(`admin_lot_${invoice._id}`).emit("admin_bid_updated", {
        invoice: fullPopulatedInvoice,
      });
    }
  } catch (error) {
    console.error("Error in handleAdminBid:", error);
  }
};

export const handleAcceptBidSocket = async (
  { invoiceIds, userId },
  io,
  socket
) => {
  try {
    if (
      !invoiceIds ||
      !Array.isArray(invoiceIds) ||
      invoiceIds.length === 0 ||
      !userId
    ) {
      return socket.emit("bid_accept_response", {
        success: false,
        message: "Invalid invoice IDs",
      });
    }

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return socket.emit("bid_accept_response", {
        success: false,
        message: "Invalid User Id",
      });
    }

    const userType = user.userType;

    const successful = [];
    const failed = [];

    for (const invoiceId of invoiceIds) {
      const invoice = await Invoice.findById(invoiceId).populate(
        "offerListNumber seller"
      );

      if (!invoice) {
        const populated = await populateInvoice(invoiceId);
        failed.push({ invoice: populated, reason: "Invoice not found" });
        continue;
      }

      let buyerId;

      if (userType === "admin") {
        buyerId = invoice.highestBidder;

        if (!buyerId) {
          const populated = await populateInvoice(invoiceId);
          failed.push({ invoice: populated, reason: "No highest bidder" });
          continue;
        }

        const updatedInvoice = await Invoice.findOneAndUpdate(
          {
            _id: invoiceId,
            status: { $ne: "Ordered" },
            highestBidder: { $ne: null },
          },
          {
            $set: {
              soldTo: buyerId,
              status: "Ordered",
            },
          },
          { new: true }
        );

        if (!updatedInvoice) {
          const populated = await populateInvoice(invoiceId);
          failed.push({
            invoice: populated,
            reason: "Invoice already ordered",
          });
          continue;
        }

        const order = new Order({
          invoice: invoiceId,
          buyer: buyerId,
          seller: invoice.seller._id,
          deliveryStatus: "Generating SO No.",
        });
        await order.save();

        const populated = await populateInvoice(invoiceId);
        successful.push(populated);

        io.to(`lot_${invoiceId}`).emit("order_accepted", {
          invoice: populated,
        });

        io.to(`admin_lot_${invoiceId}`).emit("order_accepted", {
          invoice: populated,
        });
      } else {
        buyerId = userId;

        const updatedInvoice = await Invoice.findOneAndUpdate(
          {
            _id: invoiceId,
            status: { $ne: "Ordered" },
          },
          {
            $set: {
              soldTo: buyerId,
              status: "Ordered",
              highestBidder: buyerId,
              highestBiddingPrice: invoice.adminBid,
              highestBidTime: new Date(),
            },
            $push: {
              biddingHistory: {
                bidder: buyerId,
                bidPrice: invoice.adminBid,
                bidTime: new Date(),
              },
            },
          },
          { new: true }
        );

        if (!updatedInvoice) {
          const populated = await populateInvoice(invoiceId);
          failed.push({
            invoice: populated,
            reason: "Invoice already ordered",
          });
          continue;
        }

        const order = new Order({
          invoice: invoiceId,
          buyer: buyerId,
          seller: invoice.seller._id,
          deliveryStatus: "Generating SO No.",
        });
        await order.save();

        const populated = await populateInvoice(invoiceId);
        successful.push(populated);

        socket.broadcast.to(`lot_${invoiceId}`).emit("order_accepted", {
          invoice: populated,
        });

        io.to(`admin_lot_${invoiceId}`).emit("order_accepted", {
          invoice: populated,
        });
      }

      // Remove from all watchlists
      await User.updateMany(
        { watchlist: invoiceId },
        { $pull: { watchlist: invoiceId } }
      );
    }

    if (successful.length === 0) {
      return socket.emit("bid_accept_response", {
        success: false,
        message: "No invoices accepted",
        successful,
        failed,
      });
    }

    return socket.emit("bid_accept_response", {
      success: true,
      message: `${successful.length} invoice(s) accepted successfully`,
      successful,
      failed,
    });
  } catch (err) {
    console.error("Error in handleAcceptBidSocket:", err);
    socket.emit("bid_accept_response", {
      success: false,
      message: "Internal server error",
    });
  }
};

// --Helper Functions----
const populateInvoice = async (invoiceId) => {
  try {
    const invoice = await Invoice.findById(invoiceId)
      .populate({
        path: "allowedBuyers",
        select: "companyName",
      })
      .populate({
        path: "highestBidder",
        select: "companyName",
      })
      .populate({
        path: "seller",
        select: "companyName",
      })
      .populate({
        path: "offerListNumber",
        select: "offerListNumber offerListStatus",
      });

    return invoice || null;
  } catch (err) {
    console.error("Error populating invoice:", err);
    return null;
  }
};

const checkHotInvoiceLotHelper = (invoice) => {
  const highestBidderId = invoice?.highestBidder?._id?.toString();
  const adminBid = invoice?.adminBid;
  const highestBiddingPrice = invoice?.highestBiddingPrice;

  const hasAdminBid = typeof adminBid === "number";
  const isOrdered = invoice?.status === "Ordered";

  const isHot =
    !isOrdered &&
    highestBidderId &&
    hasAdminBid &&
    ((typeof highestBiddingPrice === "number" &&
      highestBiddingPrice > adminBid) ||
      (typeof highestBiddingPrice === "number" &&
        adminBid - highestBiddingPrice <= 5));

  return isHot;
};
