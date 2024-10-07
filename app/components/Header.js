"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FaBars, FaTimes } from "react-icons/fa";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [showModal, setShowModal] = useState(true); // State for modal

  // Toggle mobile menu
  const toggleMenu = () => setIsOpen(!isOpen);

  // Modal toggle functions
  const closeModal = () => setShowModal(false);

  // Handle click outside the modal to close it
  const handleClickOutside = (e) => {
    if (e.target.id === "modal-background") {
      closeModal();
    }
  };

  return (
    <>
      {/* Modal for adhésion */}
      {showModal && (
        <div
          id="modal-background"
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center"
          onClick={handleClickOutside} // Close modal when clicking outside
        >
          <div className="relative bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
            {/* Close button (cross) */}
            <button
              onClick={closeModal}
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 transition duration-300"
            >
              <FaTimes size={20} />
            </button>
            <h2 className="text-2xl font-bold mb-4 text-gray-600">Adhérez à ColoCrew !</h2>
            <p className="text-gray-700 mb-6">
              Adhérer à ColoCrew pour soutenir nos projets et permettre à des jeunes de vivre des vacances et des séjours inoubliables !
            </p>
            <div className="flex flex-col space-y-2">
              <a
                href="https://www.helloasso.com/associations/colocrew/adhesions/adhesion-a-colocrew-1"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-pink-500 text-white px-6 py-2 rounded-full hover:bg-pink-600 transition duration-300"
              >
                Adhérer maintenant
              </a>
              <button
                onClick={closeModal}
                className="block text-gray-500 hover:text-gray-700 transition duration-300"
              >
                Peut-être plus tard
              </button>
            </div>
          </div>
        </div>
      )}

      <header id="top" className="w-full bg-white shadow-md z-50 pr-8 pl-4 py-2 h-22">
        <nav className="mx-4 w-full flex justify-even items-center">
          {/* Logo and association name */}
          <div className="flex flex-row justify-between items-center space-x-2 flex-1">
            <Link href="/">
              <div className="flex justify-center items-center space-x-4 flex-row">
                <Image src="/LogoColoCrew.png" alt="Logo de ColoCrew" width={60} height={60} />
                <span className="hidden lg:inline text-2xl font-semibold text-gray-700 tracking-tight font-poppins">
                  L'asso
                </span>
              </div>
            </Link>
          </div>

          {/* Association name centered on mobile */}
          <div className="lg:hidden absolute left-1/2 transform -translate-x-1/2 text-2xl font-semibold text-gray-600 tracking-tight font-poppins">
            L'asso
          </div>

          {/* Mobile menu icon */}
          <div className="lg:hidden flex-1 flex justify-end">
            <button onClick={toggleMenu} className="text-3xl text-gray-600">
              {isOpen ? <FaTimes /> : <FaBars />}
            </button>
          </div>

          {/* Desktop Navigation Links */}
          <div className={`hidden lg:flex space-x-4 text-gray-700`}>
            <Link
              href="/sejours"
              className="text-lg font-semibold text-gray-700 uppercase tracking-tight transition duration-300 ease-in-out hover:text-teal-600"
            >
              Les Séjours
            </Link>
            <Link
              href="/anims"
              className="text-lg font-semibold text-gray-700 uppercase tracking-tight transition duration-300 ease-in-out hover:text-teal-600"
            >
              Anims et Directeurs.ice
            </Link>
            <Link
              href="/pedagogie"
              className="text-lg font-semibold text-gray-700 uppercase tracking-tight transition duration-300 ease-in-out hover:text-teal-600"
            >
              Notre Pédagogie
            </Link>
            <Link
              href="/soutenir"
              className="text-lg font-semibold text-gray-700 uppercase tracking-tight transition duration-300 ease-in-out hover:text-teal-600"
            >
              Soutenir ColoCrew
            </Link>
          </div>

          {/* Mobile Menu */}
          <div
            className={`lg:hidden ${
              isOpen ? "block" : "hidden"
            } z-20 absolute top-16 left-0 w-full bg-white shadow-md py-4 space-y-2 text-center`}
          >
            <Link
              href="/sejours"
              onClick={toggleMenu}
              className="block text-lg font-semibold text-gray-700 uppercase tracking-tight transition duration-300 ease-in-out hover:text-teal-600"
            >
              Les Séjours
            </Link>
            <Link
              href="/anims"
              onClick={toggleMenu}
              className="block text-lg font-semibold text-gray-700 uppercase tracking-tight transition duration-300 ease-in-out hover:text-teal-600"
            >
              Anims et Directeurs.ice
            </Link>
            <Link
              href="/pedagogie"
              onClick={toggleMenu}
              className="block text-lg font-semibold text-gray-700 uppercase tracking-tight transition duration-300 ease-in-out hover:text-teal-600"
            >
              Notre Pédagogie
            </Link>
            <Link
              href="/soutenir"
              onClick={toggleMenu}
              className="block text-lg font-semibold text-gray-700 uppercase tracking-tight transition duration-300 ease-in-out hover:text-teal-600"
            >
              Soutenir ColoCrew
            </Link>
          </div>
        </nav>
      </header>
    </>
  );
}
