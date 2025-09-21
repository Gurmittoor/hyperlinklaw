// apps/web/api/ocr-test.js
import formidable from "formidable";
import fs from "fs";
import vision from "@google-cloud/vision";

export const config = {
  api: {
    bodyParser: false, // Important: let formidable handle files
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    // Parse uploaded file
    const form = formidable();
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("Form parse error:", err);
        return res.status(500).json({ ok: false, error: "File upload failed" });
      }

      // Read file path
      const filePath = files.file[0].filepath;

      // Auth with Google Vision
      const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      if (!credsJson) {
        return res
          .status(500)
          .json({ ok: false, error: "GOOGLE_APPLICATION_CREDENTIALS_JSON is missing" });
      }
      const credentials = JSON.parse(credsJson);
      const client = new vision.ImageAnnotatorClient({ credentials });

      // OCR the PDF (first page for now)
      const [result] = await client.documentTextDetection(filePath);
      const text = result?.fullTextAnnotation?.text || "No text found";

      return res.status(200).json({ ok: true, text });
    });
  } catch (err) {
    console.error("OCR error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Unknown error" });
  }
}
