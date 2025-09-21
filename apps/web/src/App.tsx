import React, { useState } from "react";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a PDF first!");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/ocr-test", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setMessage(data.text || "Upload successful!");
    } catch (err) {
      console.error(err);
      setMessage("Upload failed.");
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, Arial" }}>
      <h1>🚀 Welcome to HyperlinkLaw</h1>
      <p>Upload your legal PDFs, and we’ll hyperlink them automatically.</p>

      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      <button
        style={{
          padding: "10px 20px",
          marginTop: "20px",
          backgroundColor: "#0070f3",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
        }}
        onClick={handleUpload}
      >
        Upload PDF
      </button>

      {message && <p style={{ marginTop: "20px" }}>{message}</p>}
    </div>
  );
}
