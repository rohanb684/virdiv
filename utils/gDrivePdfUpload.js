import { google } from "googleapis";
import fs from "fs";

import dotenv from "dotenv";

dotenv.config();
// Google Drive API Setup with GoogleAuth
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.CLIENT_EMAIL,
    private_key: process.env.PRIVATE_KEY,
  },
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

/**
 * Function to create a folder in Google Drive (if it doesn’t exist)
 */
export const createDriveFolder = async (folderName) => {
  try {
    const ROOT_FOLDER_ID = "1TkbAk5KDrObPJPAIw4baEnwrrCHOccxm";

    const response = await drive.files.list({
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${ROOT_FOLDER_ID}' in parents and trashed=false`,
      fields: "files(id, name)",
    });

    if (response.data.files.length > 0) {
      return response.data.files[0].id; // Folder already exists
    }

    const fileMetadata = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [ROOT_FOLDER_ID], // Place inside the root folder
    };

    const folder = await drive.files.create({
      resource: fileMetadata,
      fields: "id",
    });

    return folder.data.id; // Return new folder ID
  } catch (error) {
    console.error("Error creating folder:", error);
    throw new Error("Failed to create folder in Google Drive");
  }
};

/**
 * Function to upload file to Google Drive
 */
export const uploadFileToDrive = async (filePath, fileName, folderId) => {
  try {
    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };

    const media = {
      mimeType: "application/pdf", // Assuming PDF files
      body: fs.createReadStream(filePath),
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: "id, webViewLink",
    });

    return file.data.webViewLink; // Return file link
  } catch (error) {
    console.error("Error uploading file:", error);
    throw new Error("Failed to upload file to Google Drive");
  }
};

export const deleteDriveFolder = async (folderId) => {
  try {
    await drive.files.delete({ fileId: folderId });
    console.log(`Folder with ID ${folderId} deleted successfully.`);
    return true;
  } catch (error) {
    console.error("Error deleting folder:", error.message);
    return false;
  }
};
