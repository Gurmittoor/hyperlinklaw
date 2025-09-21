import formidable from "formidable";
import fs from "fs";
import vision from "@google-cloud/vision";

// Disable Next.js/Vercel default body parsing
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Only POST allowed" });
  }

  try {
    // Parse uploaded file
    const form = formidable({ multiples: false });
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("Formidable error:", err);
        return res.status(500).json({ ok: false, error: "File parsing failed" });
      }

      const file = files.file?.[0];
      if (!file) {
        return res.status(400).json({ ok: false, error: "No file uploaded" });
      }

      // Read the file buffer
      const buffer = fs.readFileSync(file.filepath);

      // Init Google Vision
      const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      if (!credsJson) {
        return res.status(500).json({ ok: false, error: "Missing credentials" });
      }
      const credentials = JSON.parse(credsJson);
      const client = new vision.ImageAnnotatorClient({ credentials });

      // Run OCR
      const [result] = await client.textDetection({ image: { content: buffer } });
      const text =
        result?.fullTextAnnotation?.text ||
        result?.textAnnotations?.[0]?.description ||
        "";

      return res.status(200).json({ ok: true, text });
    });
  } catch (err) {
    console.error("OCR error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
