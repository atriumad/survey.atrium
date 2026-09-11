"use client";

export default function GlobalErrorBoundary() {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#FAF9F6", color: "#222" }}>
        <main style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 500 }}>Something went wrong</h1>
          <p style={{ marginTop: "1rem", fontSize: "1rem", color: "#555" }}>
            Please try again. If the problem persists, contact us at{" "}
            <a href="mailto:help@atriumad.com" style={{ textDecoration: "underline" }}>help@atriumad.com</a>.
          </p>
        </main>
      </body>
    </html>
  );
}