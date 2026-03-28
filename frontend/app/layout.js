import "./globals.css";

export const metadata = {
  title: "IoT Stack",
  description: "IoT Platform POC",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: "#1e293b" }}>
        {children}
      </body>
    </html>
  );
}
