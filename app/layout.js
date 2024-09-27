// app/layout.js
import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head />
      <body>{children}</body>
    </html>
  );
}
