"use client";
import { FaDownload } from "react-icons/fa";

export default function DocumentsReunion() {
  const documents = [
    { label: "Cahier centre", href: "/CR-Réunion/Cahier centre.pdf" },
    { label: "Cahier cuisine et HACCP", href: "/CR-Réunion/Cahier cuisine et HACCP.pdf" },
    { label: "Cahier projet artistique", href: "/CR-Réunion/Cahier projet artistique.pdf" },
    { label: "FAQ", href: "/CR-Réunion/FAQ.pdf" },
    { label: "Présentation réunion", href: "/CR-Réunion/Presentation réunion.pdf" },
    { label: "Projet pédagogique séjour", href: "/CR-Réunion/Projet pédagogique séjour.pdf" },
  ];

  return (
    <section className="min-h-screen bg-white flex flex-col items-center py-12 px-4">
      <h1 className="text-4xl font-bold mb-8">Documents de la réunion</h1>
      <ul className="w-full max-w-xl space-y-4">
        {documents.map((doc) => (
          <li key={doc.href}>
            <a
              href={doc.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center bg-gray-100 hover:bg-gray-200 transition rounded-lg p-4"
            >
              <FaDownload className="text-2xl text-gray-600 mr-3" />
              <span className="text-lg text-gray-800">{doc.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
