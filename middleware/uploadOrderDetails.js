import fs from "fs";
import path from "path";
import multer from "multer";

const uploadDir = path.join(process.cwd(), "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const uniqueName = `${timestamp}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const uploadInvoiceDocuments = multer({ storage }).fields([
  { name: "taxInvoice", maxCount: 1 },
  { name: "eWayBill", maxCount: 1 },
  { name: "cNote", maxCount: 1 },
  { name: "deliveryOrder", maxCount: 1 },
]);

export default uploadInvoiceDocuments;
