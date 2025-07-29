import ExcelJS from "exceljs";
import Invoice from "../models/invoice.model.js";

export const downloadInvoicesExcel = async (req, res) => {
  console.log("downloadInvoicesExcel");
  console.log(req.body);

  try {
    const { buyerIds, startDate, endDate } = req.body;

    if (!buyerIds || !Array.isArray(buyerIds) || buyerIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No buyer IDs provided" });
    }

    // Build query
    const query = {
      allowedBuyers: { $in: buyerIds },
    };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: start, $lte: end };
    }

    const invoices = await Invoice.find(query)
      .populate("allowedBuyers", "companyName _id")
      .populate("seller", "companyName name")
      .populate("soldTo", "companyName name")
      .populate("offerListNumber", "offerListNumber");

    if (!invoices || invoices.length === 0) {
      console.log("No invoices found, sending file with just column headers.");
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Invoices");

    worksheet.columns = [
      { header: "Buyer Company", key: "buyerCompany", width: 25 },
      { header: "Invoice Number", key: "invoiceNumber", width: 20 },
      { header: "Offer List No", key: "offerListNumber", width: 20 },
      { header: "Mark", key: "mark", width: 15 },
      { header: "Grade", key: "grade", width: 15 },
      { header: "Quantity", key: "quantity", width: 15 },
      { header: "Bags", key: "bags", width: 10 },
      { header: "Price", key: "price", width: 10 },
      { header: "Current Price", key: "currentPrice", width: 15 },
      { header: "Admin Bid", key: "adminBid", width: 12 },
      { header: "Admin Bid Time", key: "adminBidTime", width: 20 },
      {
        header: "Highest Bidding Price",
        key: "highestBiddingPrice",
        width: 20,
      },
      { header: "Highest Bid Time", key: "highestBidTime", width: 20 },
      { header: "Seller", key: "seller", width: 20 },
      { header: "Sold To", key: "soldTo", width: 20 },
      { header: "Status", key: "status", width: 15 },
      { header: "Created At", key: "createdAt", width: 20 },
      { header: "Updated At", key: "updatedAt", width: 20 },
    ];

    const matchedBuyerIds = new Set();

    for (const invoice of invoices) {
      for (const buyer of invoice.allowedBuyers) {
        if (buyerIds.includes(buyer._id.toString())) {
          matchedBuyerIds.add(buyer._id.toString());

          worksheet.addRow({
            buyerCompany: buyer.companyName || "N/A",
            invoiceNumber: invoice.invoiceNumber,
            offerListNumber: invoice.offerListNumber?.offerListNumber || "N/A",
            mark: invoice.mark,
            grade: invoice.grade,
            quantity: invoice.quantity,
            bags: invoice.bags,
            price: invoice.price,
            currentPrice: invoice.currentPrice,
            adminBid: invoice.adminBid,
            adminBidTime: invoice.adminBidTime
              ? new Date(invoice.adminBidTime).toLocaleString()
              : "",
            highestBiddingPrice: invoice.highestBiddingPrice,
            highestBidTime: invoice.highestBidTime
              ? new Date(invoice.highestBidTime).toLocaleString()
              : "",
            seller:
              invoice.seller?.companyName || invoice.seller?.name || "N/A",
            soldTo:
              invoice.soldTo?.companyName || invoice.soldTo?.name || "N/A",
            status: invoice.status,
            createdAt: invoice.createdAt.toLocaleString(),
            updatedAt: invoice.updatedAt.toLocaleString(),
          });
        }
      }
    }

    const unmatchedBuyerIds = buyerIds.filter(
      (id) => !matchedBuyerIds.has(id.toString())
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=invoices.xlsx");

    if (unmatchedBuyerIds.length > 0) {
      console.log("Some buyers not matched:", unmatchedBuyerIds);
      res.setHeader(
        "X-Partial-Warning",
        "Some buyers did not match any invoice"
      );
    }
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Excel download error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to download Excel",
    });
  }
};
