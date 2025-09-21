export default function App() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, Arial" }}>
      <h1>🚀 Welcome to HyperlinkLaw</h1>
      <p>Upload your legal PDFs, and we’ll hyperlink them automatically.</p>

      <button 
        style={{
          padding: "10px 20px",
          marginTop: "20px",
          backgroundColor: "#0070f3",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer"
        }}
        onClick={() => alert("Upload feature coming soon!")}
      >
        Upload PDF
      </button>
    </div>
  );
}
