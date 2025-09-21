// apps/web/api/ocr-test.js
import vision from "@google-cloud/vision";
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false, // we’re using formidable to parse file uploads
  },
};

export default async function handler(req, res) {
  try {
    const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!credsJson) {
      return res
        .status(500)
        .json({ ok: false, error: "GOOGLE_APPLICATION_CREDENTIALS_JSON is missing" });
    }

    const credentials = JSON.parse(credsJson);
    const client = new vision.ImageAnnotatorClient({ credentials });

    if (req.method === "POST") {
      // Parse uploaded file
      const form = new formidable.IncomingForm();
      form.parse(req, async (err, fields, files) => {
        if (err) {
          console.error("Form parse error:", err);
          return res.status(500).json({ ok: false, error: "File upload failed" });
        }

        const filePath = files.file?.filepath;
        if (!filePath) {
          return res.status(400).json({ ok: false, error: "No file uploaded" });
        }

        // Read PDF file
        const pdfBuffer = fs.readFileSync(filePath);

        // Run OCR on PDF pages inline
        const [result] = await client.documentTextDetection({
          image: { content: pdfBuffer },
        });

        // Extract full text
        const text = result.fullTextAnnotation?.text || "";

        return res.status(200).json({ ok: true, text });
      });
    } else {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }
  } catch (err) {
    console.error("OCR error:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
  }
}
