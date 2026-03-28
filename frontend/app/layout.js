export const metadata = {
  title: "IoT Stack",
  description: "IoT Platform POC",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: `
          * { box-sizing: border-box; }
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
          nav ::-webkit-scrollbar-thumb { background: #334155; }
          nav ::-webkit-scrollbar-thumb:hover { background: #475569; }
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        `}} />
      </head>
      <body style={{ margin: 0, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: "#1e293b" }}>
        {children}
      </body>
    </html>
  );
}
