// apps/web/api/ocr-test.js
import vision from "@google-cloud/vision";

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

    const url = req.query?.url;
    let image;
    if (url) {
      image = { source: { imageUri: url } };
    } else if (req.body?.imageBase64) {
      image = { content: req.body.imageBase64 };
    } else {
      return res.status(400).json({
        ok: false,
        error: 'Provide ?url=https://... or POST {"imageBase64":"<BASE64>"}',
      });
    }

    const [result] = await client.textDetection(image);
    const text =
      result?.fullTextAnnotation?.text ||
      result?.textAnnotations?.[0]?.description ||
      "";

    return res.status(200).json({ ok: true, text });
  } catch (err) {
    console.error("OCR error:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
  }
}
