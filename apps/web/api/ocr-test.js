import formidable from "formidable";
import fs from "fs";
import vision from "@google-cloud/vision";

export const config = {
  api: {
    bodyParser: false, // Important! Otherwise formidable won’t work
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    // Parse the uploaded file
    const form = new formidable.IncomingForm();
    form.maxFileSize = 200 * 1024 * 1024; // allow up to 200MB

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("Formidable error:", err);
        return res.status(500).json({ ok: false, error: "File parsing failed" });
      }

      const file = files.file?.[0] || files.file;
      if (!file) {
        return res.status(400).json({ ok: false, error: "No file uploaded" });
      }

      // Load Google Vision credentials
      const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      if (!credsJson) {
        return res.status(500).json({ ok: false, error: "Missing Google Vision credentials" });
      }
      const credentials = JSON.parse(credsJson);

      const client = new vision.ImageAnnotatorClient({ credentials });

      // Read the uploaded file
      const fileBuffer = fs.readFileSync(file.filepath);

      // OCR with Vision
      const [result] = await client.documentTextDetection({ image: { content: fileBuffer } });
      const text = result.fullTextAnnotation?.text || "";

      return res.status(200).json({ ok: true, text });
    });
  } catch (err) {
    console.error("OCR error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Unknown error" });
  }
}
