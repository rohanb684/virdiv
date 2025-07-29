import express from "express";
import http from "http";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";

import connectToDB from "./db/connectToDb.js";
import offerListRouter from "./routes/offerList.routes.js";
import authRouter from "./routes/auth.routes.js";
import notificationRouter from "./routes/notifications.routes.js";
import orderRouter from "./routes/order.routes.js";
import dataRouter from "./routes/dataDownload.routes.js";
import userRouter from "./routes/user.routes.js";
import invoiceRouter from "./routes/invoice.routes.js";
import { initializeSocket } from "./socket/index.js";

const app = express();
dotenv.config();

const PORT = process.env.PORT || 8000;
app.use(express.json());
app.use(cookieParser());
app.set("trust proxy", 1);

app.use(
  cors({
    origin: [
      "http://localhost:5174",
      "http://localhost:5173",
      "http://localhost:5175",
      "https://cheery-douhua-aa70cb.netlify.app",
      "https://jade-cat-fbc9b6.netlify.app",
      "https://calm-biscochitos-0c52fb.netlify.app",
      "https://viridiv.com",
      "https://joyful-pegasus-532e4d.netlify.app",
      "https://polite-basbousa-95f774.netlify.app",
    ],
    credentials: true,
  })
);

app.use("/api/offer-list", offerListRouter);
app.use("/api/auth", authRouter);
app.use("/api/notification", notificationRouter);
app.use("/api/order", orderRouter);
app.use("/api/data", dataRouter);
app.use("/api/user", userRouter);
app.use("/api/invoice", invoiceRouter);

app.get("/", (req, res) => {
  res.send("server working correctly");
});
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: [
      "http://localhost:5174",
      "http://localhost:5173",
      "http://localhost:5175",
      "https://cheery-douhua-aa70cb.netlify.app",
      "https://jade-cat-fbc9b6.netlify.app",
      "https://calm-biscochitos-0c52fb.netlify.app",
      "https://viridiv.com",
      "https://joyful-pegasus-532e4d.netlify.app",
      "https://polite-basbousa-95f774.netlify.app",
    ],
    credentials: true,
  },
});

// Initialize socket logic
initializeSocket(io);

// Start the server
server.listen(PORT, () => {
  connectToDB();
  console.log(`App and Socket.IO listening at http://localhost:${PORT}`);
});
