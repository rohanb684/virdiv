import Notification from "../models/notifications.model.js";
import fs from "fs";
import ExcelJS from "exceljs";
import Order from "../models/order.model.js";
import {
  createDriveFolder,
  uploadFileToDrive,
} from "../utils/gDrivePdfUpload.js";
import Invoice from "../models/invoice.model.js";

export const getOrdersWithSaleOrderNumber = async (req, res) => {
  try {
    const userId = req.user._id;
    const userType = req.user.userType;

    let query = { saleOrderNumber: { $exists: true, $ne: null } };

    if (userType === "buyer") {
      query.buyer = userId;
    } else if (userType === "seller") {
      query.seller = userId;
    }

    const orders = await Order.find(query)
      .populate({
        path: "invoice",
        select:
          "invoiceNumber mark highestBiddingPrice offerListNumber grade quantity bags ",
        populate: {
          path: "offerListNumber",
          select: "offerListNumber",
        },
      })
      .populate("buyer", "name email companyName")
      .populate("seller", "name email companyName")
      .sort({ createdAt: -1 });

    const filteredOrders = orders.filter((order) => order.invoice);
    // console.log(filteredOrders);

    res.status(200).json({ success: true, orders: filteredOrders });
  } catch (error) {
    console.error("Error fetching orders with saleOrderNumber:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const generateSaleOrderNumbers = async (req, res) => {
  try {
    const { invoiceIds, cashDiscount, daysCount } = req.body;
    console.log("generateSaleOrderNumbers");

    console.log(invoiceIds);

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No invoice IDs provided.",
      });
    }
    if (!cashDiscount || !daysCount) {
      return res.status(400).json({
        success: false,
        message: "No C.D. and days provided",
      });
    }
    // Get current date and compute financial year range
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const currentFYStart = new Date(month < 4 ? year - 1 : year, 3, 1);
    const currentFYEnd = new Date(
      month < 4 ? year : year + 1,
      2,
      31,
      23,
      59,
      59,
      999
    );

    const uniqueSaleOrders = await Order.distinct("saleOrderNumber", {
      saleOrderGeneratedAt: { $gte: currentFYStart, $lte: currentFYEnd },
    });

    const orderCount = uniqueSaleOrders.length;
    const startYearShort = currentFYStart.getFullYear().toString().slice(-2);
    const endYearShort = currentFYEnd.getFullYear().toString().slice(-2);
    const monthFormatted = String(month).padStart(2, "0");
    const serialNo = (orderCount + 1).toString().padStart(3, "0");

    const saleOrderNumber = `SO/${startYearShort}-${endYearShort}/${monthFormatted}/${serialNo}`;

    const updatedOrders = [];

    for (const invoiceId of invoiceIds) {
      const order = await Order.findOne({ invoice: invoiceId });

      if (!order || order.saleOrderNumber) continue;

      order.saleOrderNumber = saleOrderNumber;
      order.cashDiscount = cashDiscount;
      order.daysCount = daysCount;
      order.saleOrderGeneratedAt = new Date();
      order.deliveryStatus = "Awaiting Address Update";
      await order.save();

      await Invoice.findByIdAndUpdate(invoiceId, {
        isSaleOrderGenerated: true,
      });

      updatedOrders.push(order);
    }

    if (updatedOrders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No valid or new orders found for SO generation.",
      });
    }
    getOrdersWithSaleOrderNumber(req, res);
  } catch (error) {
    console.error("Error generating sale order numbers:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const updateOrderAddresses = async (req, res) => {
  console.log("updateOrderAddresses req");

  try {
    const {
      orderIds,
      shippingAddress,
      billingAddress,
      isBillingAddressSameAsShipping,
      transporter,
      useForAllLots,
    } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing order IDs",
      });
    }

    if (!transporter) {
      return res.status(400).json({
        success: false,
        message: "Transporter is missing",
      });
    }

    if (!billingAddress || typeof billingAddress !== "object") {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing billing address",
      });
    }

    const updatedOrders = new Set();

    for (const orderId of orderIds) {
      const baseOrder = await Order.findById(orderId);
      if (!baseOrder) continue;

      const ordersToUpdate = useForAllLots
        ? await Order.find({ saleOrderNumber: baseOrder.saleOrderNumber })
        : [baseOrder];

      for (const order of ordersToUpdate) {
        order.billingAddress = billingAddress;
        order.isBillingAddressSameAsShipping = !!isBillingAddressSameAsShipping;

        if (isBillingAddressSameAsShipping) {
          order.shippingAddress = { ...billingAddress };
        } else {
          order.shippingAddress = shippingAddress;
        }

        order.transporter = transporter;
        order.deliveryStatus = "Awaiting Documents Upload";

        await order.save();
        updatedOrders.add(order._id.toString());
      }
    }

    if (updatedOrders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No valid orders found to update",
      });
    }

    getOrdersWithSaleOrderNumber(req, res);
  } catch (error) {
    console.error("Error updating order addresses:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const uploadOrderDocuments = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const folderId = await createDriveFolder(
      order.saleOrderNumber || order._id.toString()
    );

    const uploadIfExists = async (fieldName) => {
      const file = req.files?.[fieldName]?.[0];
      if (!file) return null;

      const filePath = file.path;
      const fileName = file.originalname;
      const driveUrl = await uploadFileToDrive(filePath, fileName, folderId);
      fs.unlinkSync(filePath);
      return driveUrl;
    };

    const taxInvoiceUrl = await uploadIfExists("taxInvoice");
    const ewayBillUrl = await uploadIfExists("eWayBill");
    const cNoteUrl = await uploadIfExists("cNote");
    const deliveryOrderUrl = await uploadIfExists("deliveryOrder");

    // ✅ Include deliveryOrderUrl in this check
    if (!taxInvoiceUrl && !ewayBillUrl && !cNoteUrl && !deliveryOrderUrl) {
      return res.status(400).json({
        success: false,
        message: "No documents were uploaded",
      });
    }

    // Find all orders with the same saleOrderNumber
    const matchingOrders = await Order.find({
      saleOrderNumber: order.saleOrderNumber,
    });

    for (const o of matchingOrders) {
      if (taxInvoiceUrl) o.documents.taxInvoiceUrl = taxInvoiceUrl;
      if (ewayBillUrl) o.documents.ewayBillUrl = ewayBillUrl;
      if (cNoteUrl) o.documents.cNoteUrl = cNoteUrl;
      if (deliveryOrderUrl) o.documents.deliveryOrderUrl = deliveryOrderUrl; // ✅ Add this line

      // Update delivery status for each order
      o.deliveryStatus = "In Transit";
      await o.save();
    }

    // Send notification to buyer (only once)
    if (order.buyer) {
      const notification = new Notification({
        recipient: order.buyer,
        role: "buyer",
        type: "ORDER_DOCS_UPDATED",
        message: `Documents for Order ${order.saleOrderNumber} have been updated. Check now!`,
        link: `/buyer-dashboard/orders`,
      });

      await notification.save();
    }

    getOrdersWithSaleOrderNumber(req, res);
  } catch (error) {
    console.error("Error uploading order documents:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateOrderBankDetails = async (req, res) => {
  try {
    const { orderIds, bankDetails } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: "Order IDs are required" });
    }

    const { accountHolderName, accountNumber, ifscCode } = bankDetails || {};

    if (!accountHolderName || !accountNumber || !ifscCode) {
      return res.status(400).json({ message: "All bank details are required" });
    }

    let updatedCount = 0;

    for (const orderId of orderIds) {
      const order = await Order.findById(orderId);
      if (!order) continue;

      order.bankDetails = { accountHolderName, accountNumber, ifscCode };

      // Determine delivery status based on whether all required documents are uploaded
      const { taxInvoiceUrl, ewayBillUrl, cNoteUrl } = order.documents || {};
      const hasAllDocs = taxInvoiceUrl && ewayBillUrl && cNoteUrl;

      order.deliveryStatus = hasAllDocs
        ? "Awaiting Payment Verification"
        : "Awaiting Documents Upload";

      await order.save();

      const notification = new Notification({
        recipient: order.buyer,
        role: "buyer",
        type: "ORDER_UPDATED",
        message: `Bank Details for Order ${order.saleOrderNumber} have been updated. Check now!`,
        link: `/buyer-dashboard/orders`,
      });

      await notification.save();
      updatedCount++;
    }

    getOrdersWithSaleOrderNumber(req, res);
  } catch (error) {
    console.error("Error updating bank details:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateDeliveryStatus = async (req, res) => {
  try {
    const { orderId, newStatus } = req.body;

    if (!orderId || !newStatus) {
      return res.status(400).json({
        success: false,
        message: "Order ID and new status are required",
      });
    }

    const validStatuses = [
      "Generating SO No.",
      "Awaiting Address Update",
      "Awaiting Documents Upload",
      "Awaiting Bank Details",
      "Awaiting Payment Verification",
      "In Transit",
      "Delivered",
      "Transaction Complete",
    ];

    if (!validStatuses.includes(newStatus)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid delivery status" });
    }

    const baseOrder = await Order.findById(orderId);
    if (!baseOrder) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const saleOrderNumber = baseOrder.saleOrderNumber;

    const filter = saleOrderNumber ? { saleOrderNumber } : { _id: orderId }; // fallback if no SO number exists

    const update = {
      deliveryStatus: newStatus,
      ...(newStatus === "Transaction Complete" && { deliveryDate: new Date() }),
    };

    await Order.updateMany(filter, update);

    getOrdersWithSaleOrderNumber(req, res);
  } catch (error) {
    console.error("Error updating delivery status:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const downloadOrderReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    const query = {};
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const orders = await Order.find(query)
      .populate({
        path: "invoice",
        populate: {
          path: "offerListNumber",
          model: "OfferList", // Optional if naming is standard
        },
      })
      .populate("buyer", "companyName")
      .populate("seller", "companyName");

    if (!orders.length) {
      return res.status(404).json({ message: "No orders found" });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Order Report");

    worksheet.columns = [
      { header: "Created At", key: "createdAt", width: 20 },
      { header: "Order ID", key: "orderId", width: 25 },
      { header: "Sale Order Number", key: "saleOrderNumber", width: 20 },
      { header: "Invoice Number", key: "invoiceNumber", width: 20 },
      { header: "Offer List Number", key: "offerListNumber", width: 20 },
      {
        header: "Highest Bidding Price",
        key: "highestBiddingPrice",
        width: 20,
      },
      { header: "Buyer Company", key: "buyerCompany", width: 20 },
      { header: "Seller Company", key: "sellerCompany", width: 20 },
      { header: "Shipping Address", key: "shippingAddress", width: 40 },
      { header: "Billing Address", key: "billingAddress", width: 40 },
      { header: "Payment Status", key: "paymentStatus", width: 15 },
      { header: "Payment Method", key: "paymentMethod", width: 15 },
      { header: "Delivery Status", key: "deliveryStatus", width: 25 },
      { header: "Delivery Date", key: "deliveryDate", width: 20 },
      { header: "Tracking Number", key: "trackingNumber", width: 20 },
      { header: "Transporter", key: "transporter", width: 20 },
    ];

    const formatAddress = (addr) =>
      [addr?.street, addr?.city, addr?.state, addr?.zipCode, addr?.country]
        .filter(Boolean)
        .join(", ");

    orders.forEach((order) => {
      worksheet.addRow({
        createdAt: order.createdAt
          ? order.createdAt.toISOString().split("T")[0]
          : "",
        orderId: order._id.toString(),
        saleOrderNumber: order.saleOrderNumber || "",
        invoiceNumber: order.invoice?.invoiceNumber || "",
        offerListNumber:
          order.invoice?.offerListNumber?.offerListNumber.toString() || "",
        highestBiddingPrice: order.invoice?.highestBiddingPrice || "",
        buyerCompany: order.buyer?.companyName || "",
        sellerCompany: order.seller?.companyName || "",
        shippingAddress: formatAddress(order.shippingAddress),
        billingAddress: formatAddress(order.billingAddress),
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        deliveryStatus: order.deliveryStatus,
        deliveryDate: order.deliveryDate
          ? new Date(order.deliveryDate).toLocaleDateString()
          : "",
        trackingNumber: order.trackingNumber || "",
        transporter: order.transporter || "",
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=order-report.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating Excel:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
