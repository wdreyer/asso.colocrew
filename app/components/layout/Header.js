"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  FaBars,
  FaTimes,
  FaEnvelope,
  FaPhone,
  FaComments,
} from "react-icons/fa";

// Composant réutilisable pour les liens de navigation
const NavLink = ({ href, text, onClick, extraClasses = "" }) => (
  <Link
    href={href}
    onClick={onClick}
    className={`cursor-pointer block lg:inline text-lg font-semibold uppercase tracking-tight transition duration-300 ease-in-out hover:text-[#B8336A] ${extraClasses}`}
  >
    {text}
  </Link>
);

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);

  // Liste des liens
  const links = [
    { href: "/sejours", text: "Séjours" },
    { href: "/aide-financement", text: "Aides & Financements" },
    { href: "/anims", text: "Anims" },
    { href: "/qui-sommes-nous", text: "Qui sommes nous ?" },
    { href: "/soutenir", text: "Nous Soutenir" },
    { href: "/reservation", text: "Réservations" },
  ];

  return (
    <>
      {/* Header fixe qui reste en haut lors du scroll */}
      <header
        id="top"
        className="fixed top-0 left-0 right-0 bg-white shadow-md z-50 pr-8 pl-4 py-2 h-18 font-poppins"
      >
        <nav className="mx-4 w-full flex justify-evenly items-center relative">
          <Link
            href="/"
            className="cursor-pointer flex items-center space-x-4 flex-1"
          >
            <Image
              src="/LogoColoCrew.png"
              alt="Logo de ColoCrew"
              width={60}
              height={60}
            />
            <span className="hidden lg:inline text-2xl font-semibold text-[#281C47] tracking-tight">
              L'asso
            </span>
          </Link>

          <div className="lg:hidden absolute left-1/2 transform -translate-x-1/2 text-2xl font-semibold text-[#281C47] tracking-tight cursor-pointer">
            L'asso
          </div>

          <button
            onClick={toggleMenu}
            className="lg:hidden text-3xl text-[#281C47] cursor-pointer"
          >
            {isOpen ? <FaTimes /> : <FaBars />}
          </button>

          <div className="hidden lg:flex space-x-4 text-[#281C47]">
            {links.map(({ href, text, extraClasses }) => (
              <NavLink
                key={href}
                href={href}
                text={text}
                extraClasses={extraClasses}
              />
            ))}
          </div>
        </nav>

        {/* Menu mobile en full width, positionné juste en dessous du header */}
        <div
          className={`lg:hidden ${isOpen ? "block" : "hidden"} fixed left-0 right-0 bg-white shadow-md py-4 space-y-2 text-center z-20`}
          style={{ top: "72px" }} // ajustez cette valeur selon la hauteur réelle du header
        >
          {links.map(({ href, text, extraClasses }) => (
            <NavLink
              key={href}
              href={href}
              text={text}
              extraClasses={extraClasses}
              onClick={toggleMenu}
            />
          ))}
        </div>
      </header>

      {/* Intégration du widget de contact */}
      <ContactWidget />

      {/* Animation zoomInOut */}
      <style jsx>{`
        @keyframes zoomInOut {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.2);
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>
    </>
  );
}

function ContactWidget() {
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    telephone: "",
    message: "",
  });
  const [status, setStatus] = useState(null); // "success" | "error" | null

  const toggleWidget = () => {
    setWidgetOpen(!widgetOpen);
    if (widgetOpen) {
      // À la fermeture, réinitialiser le formulaire
      setShowForm(false);
      setFormData({ email: "", telephone: "", message: "" });
      setStatus(null);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      formType: "contact",
      email: formData.email,
      telephone: formData.telephone,
      message: formData.message,
    };

    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setStatus("success");
        setFormData({ email: "", telephone: "", message: "" });
      } else {
        setStatus("error");
      }
    } catch (error) {
      setStatus("error");
    }
  };

  return (
    <>
      {/* Bouton flottant avec animation zoomInOut */}
      {!widgetOpen && (
        <div className="fixed right-6 bottom-16 md:bottom-16 z-50">
          <button
            onClick={toggleWidget}
            className="bg-[#B8336A] text-white p-4 rounded-full shadow-lg hover:bg-[#A2225A] transition transform cursor-pointer"
            aria-label="Ouvrir le contact"
            style={{ animation: "zoomInOut 2s ease-in-out infinite" }}
          >
            <FaComments size={24} />
          </button>
        </div>
      )}

      {/* Card de contact */}
      {widgetOpen && (
        <div className="fixed right-6 bottom-24 z-50 w-80">
          <div className="bg-white shadow-xl rounded-lg overflow-hidden border border-[#281C47]">
            {/* En-tête */}
            <div className="bg-[#281C47] text-white px-4 py-3 flex justify-between items-center">
              <h3 className="text-lg font-semibold">Contactez-nous</h3>
              <button
                onClick={toggleWidget}
                className="text-white cursor-pointer"
                aria-label="Fermer"
              >
                <FaTimes size={18} />
              </button>
            </div>
            <div className="p-4">
              {!showForm ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-3 cursor-pointer">
                    <FaPhone className="text-[#281C47]" />
                    <a
                      href="tel:0184210230"
                      className="text-gray-700 hover:text-[#B8336A] cursor-pointer"
                    >
                      01 84 21 02 30
                    </a>
                  </div>
                  <div className="flex items-center space-x-3 cursor-pointer">
                    <FaEnvelope className="text-[#281C47]" />
                    <a
                      href="mailto:info@colocrew.com"
                      className="text-gray-700 hover:text-[#B8336A] cursor-pointer"
                    >
                      info@colocrew.com
                    </a>
                  </div>
                  <div className="flex items-center space-x-3 cursor-pointer">
                    <FaComments className="text-[#281C47]" />
                    <button
                      onClick={() => setShowForm(true)}
                      className="text-gray-700 hover:text-[#B8336A] cursor-pointer"
                    >
                      Chat
                    </button>
                  </div>
                  <p className="text-sm text-gray-600">
                    Nous vous recontacterons au plus vite.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      id="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      placeholder="Votre email"
                      className="my-2 block w-full shadow-sm text-gray-700 border placeholder-gray-400 focus:outline-none focus:ring-1 rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="telephone"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      name="telephone"
                      id="telephone"
                      value={formData.telephone}
                      onChange={handleChange}
                      required
                      placeholder="Votre téléphone"
                      className="my-2 block w-full shadow-sm text-gray-700 border placeholder-gray-400 focus:outline-none focus:ring-1 rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="message"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Message
                    </label>
                    <textarea
                      name="message"
                      id="message"
                      value={formData.message}
                      onChange={handleChange}
                      required
                      placeholder="Votre message"
                      rows="3"
                      className="my-2 block w-full shadow text-gray-700 border placeholder-gray-400 focus:outline-none focus:ring-1 rounded focus:ring-[#B8336A] px-3 py-2"
                    ></textarea>
                  </div>
                  {status === "success" && (
                    <p className="text-green-500 text-sm">
                      Message envoyé avec succès !
                    </p>
                  )}
                  {status === "error" && (
                    <p className="text-red-500 text-sm">
                      Erreur lors de l'envoi du message.
                    </p>
                  )}
                  <div className="flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="text-sm text-gray-600 hover:text-[#B8336A] cursor-pointer"
                    >
                      Retour
                    </button>
                    <button
                      type="submit"
                      className="bg-[#281C47] text-white px-4 py-2 rounded hover:bg-[#B8336A] transition cursor-pointer"
                    >
                      Envoyer
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
