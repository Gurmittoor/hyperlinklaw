// apps/web/api/ocr-test.js
import vision from "@google-cloud/vision";
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false, // we’re using formidable for file uploads
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

        // Read PDF content into buffer
        const pdfBuffer = fs.readFileSync(filePath);

        // Vision API request for PDF OCR
        const [result] = await client.asyncBatchAnnotateFiles({
          requests: [
            {
              inputConfig: {
                mimeType: "application/pdf",
                content: pdfBuffer.toString("base64"),
              },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
              outputConfig: {
                gcsDestination: {
                  uri: "gs://YOUR_BUCKET/ocr-output/", // Or handle inline JSON
                },
                batchSize: 2,
              },
            },
          ],
        });

        return res.status(200).json({ ok: true, result });
      });
    } else {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }
  } catch (err) {
    console.error("OCR error:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
  }
}
