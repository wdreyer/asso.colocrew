"use client";
import { useEffect } from "react";
import Image from "next/image";

export default function Header() {
  // Défilement fluide avec ajustement de la hauteur du header
  useEffect(() => {
    const header = document.querySelector("header"); // Sélection du header pour calculer sa hauteur
    const links = document.querySelectorAll('a[href^="#"]');
    
    // Gestion du défilement pour les liens de navigation
    links.forEach((link) => {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute("href"));
        const headerHeight = header.offsetHeight; // Hauteur du header

        // Calcul du décalage ajusté pour la hauteur du header
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;

        // Défilement fluide vers l'endroit ajusté
        window.scrollTo({
          top: targetPosition,
          behavior: "smooth",
        });
      });
    });

    // Gestion du clic sur le logo pour remonter tout en haut
    const logo = document.querySelector(".logo-link");
    logo.addEventListener("click", function (e) {
      e.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: "smooth", // Défilement fluide vers le haut
      });
    });

    return () => {
      links.forEach((link) => {
        link.removeEventListener("click", function () {});
      });
      logo.removeEventListener("click", function () {});
    };
  }, []);

  return (
    <header id="top" className="fixed w-full bg-white shadow-md z-50 py-4">
      <nav className="flex justify-between items-center max-w-7xl mx-auto">
        {/* Logo et nom de l'asso */}
        <div className="flex items-center space-x-2">
          <a href="#top" className="logo-link cursor-pointer"> {/* Ajout de la classe logo-link pour le gestionnaire d'événements */}
            <Image src="/LogoColoCrew.png" alt="Logo de ColoCrew" width={80} height={80} />
          </a>
          <span className="text-2xl font-semibold text-purple-800 tracking-tight font-poppins">L'asso</span>
        </div>
        <div className="space-x-8 text-gray-700">
          <a href="#qui-sommes-nous" className="relative group text-lg font-medium text-gray-700">
            Qui sommes-nous
            <span className="block absolute bottom-[-5px] left-0 w-0 h-0.5 bg-purple-600 transition-all duration-500 ease-in-out group-hover:w-full"></span>
          </a>
          <a href="#notre-projet" className="relative group text-lg font-medium text-gray-700">
            Notre projet
            <span className="block absolute bottom-[-5px] left-0 w-0 h-0.5 bg-purple-600 transition-all duration-500 ease-in-out group-hover:w-full"></span>
          </a>

          <a href="#nos-sejours" className="relative group text-lg font-medium text-gray-700">
            Nos séjours
            <span className="block absolute bottom-[-5px] left-0 w-0 h-0.5 bg-purple-600 transition-all duration-500 ease-in-out group-hover:w-full"></span>
          </a>
          <a href="#nous-rejoindre" className="relative group text-lg font-medium text-gray-700">
            Nous rejoindre
            <span className="block absolute bottom-[-5px] left-0 w-0 h-0.5 bg-purple-600 transition-all duration-500 ease-in-out group-hover:w-full"></span>
          </a>
        </div>
      </nav>
    </header>
  );
}
