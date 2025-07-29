import {
  handleAcceptBidSocket,
  handleAdminBid,
  handleBuyerBid,
} from "../controller/invoice.controller.js";

export const initializeSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("join_room", ({ buyerId, buyerName, lotIds }) => {
      console.log(buyerName + " join_room");

      lotIds.forEach((lotId) => {
        socket.join(`lot_${lotId}`);
      });

      // socket.join(`buyer_${buyerId}`);
      // console.log(`Buyer ${buyerName} joined personal room buyer_${buyerId}`);
    });

    socket.on("join_admin_room", ({ adminId, adminEmail, lotIds }) => {
      console.log("join_admin_room emitted by admin");
      lotIds.forEach((lotId) => {
        socket.join(`admin_lot_${lotId}`);
        // console.log(
        //   `Admin ${adminEmail} with id ${adminId} joined room lot_${lotId}`
        // );
      });
    });

    socket.on("leave_rooms", ({ leave = [], buyerId, buyerName }) => {
      leave.forEach((lotId) => socket.leave(`lot_${lotId}`));
      console.log(`Buyer ${buyerName} left rooms`);
    });

    socket.on("leave_admin_rooms", ({ leave = [], adminId, adminEmail }) => {
      leave.forEach((lotId) => socket.leave(`admin_lot_${lotId}`));
      console.log(`Admin ${adminEmail} left admin rooms: ${leave}`);
    });

    socket.on("buyer_bid", async ({ invoiceIds, price, bidderId }) => {
      console.log(invoiceIds, price, bidderId);

      await handleBuyerBid({ invoiceIds, price, bidderId }, io, socket);
    });

    socket.on("admin_bid", async ({ invoiceIds, price, adminId }) => {
      console.log(invoiceIds, price, adminId);
      await handleAdminBid({ invoiceIds, price, adminId }, io);
    });

    socket.on("accept_bid", async ({ invoiceIds, userId }) => {
      await handleAcceptBidSocket({ invoiceIds, userId }, io, socket);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });
};
