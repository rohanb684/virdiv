import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectToDB = async () => {
  try {
    if (process.env.NODE_ENV === "production") {
      await mongoose.connect(process.env.DB_URI);
    } else {
      await mongoose.connect(process.env.DB_URI);
      // await mongoose.connect("mongodb://localhost:27017/viridiv");
    }
    console.log("Connected to MongoDb");
  } catch (error) {
    console.log("Error connecting to database" + error.message);
  }
};

export default connectToDB;
