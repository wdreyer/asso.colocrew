"use client";
import { useEffect } from "react";
import Image from "next/image";

export default function Header() {
  // Défilement fluide à la navigation
  useEffect(() => {
    const links = document.querySelectorAll('a[href^="#"]');

    links.forEach((link) => {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute("href"));
        target.scrollIntoView({ behavior: "smooth" });
      });
    });

    return () => {
      links.forEach((link) => {
        link.removeEventListener("click", function () {});
      });
    };
  }, []);

  return (
    <header className="fixed w-full bg-white shadow-md z-50 py-4 ">
      <nav className="flex justify-between items-center max-w-7xl mx-auto">
        {/* Logo et nom de l'asso */}
        <div className="flex items-center space-x-4">
          <Image src="/LogoColoCrew.png" alt="Logo de ColoCrew" width={60} height={60} />
          <span className="text-2xl font-semibold text-purple-800">L'asso</span>
        </div>

        {/* Navigation Links */}
        <div className="space-x-8 text-gray-700">
          <a
            href="#qui-sommes-nous"
            className="relative group text-lg font-medium text-gray-700"
          >
            Qui sommes-nous
            <span className="block absolute bottom-[-5px] left-0 w-0 h-0.5 bg-purple-600 transition-all duration-500 ease-in-out group-hover:w-full"></span>
          </a>
          <a
            href="#nos-sejours"
            className="relative group text-lg font-medium text-gray-700"
          >
            Nos séjours
            <span className="block absolute bottom-[-5px] left-0 w-0 h-0.5 bg-purple-600 transition-all duration-500 ease-in-out group-hover:w-full"></span>
          </a>
          <a
            href="#nous-rejoindre"
            className="relative group text-lg font-medium text-gray-700"
          >
            Nous rejoindre
            <span className="block absolute bottom-[-5px] left-0 w-0 h-0.5 bg-purple-600 transition-all duration-500 ease-in-out group-hover:w-full"></span>
          </a>
          <a
            href="#nos-reseaux"
            className="relative group text-lg font-medium text-gray-700"
          >
            Nos réseaux
            <span className="block absolute bottom-[-5px] left-0 w-0 h-0.5 bg-purple-600 transition-all duration-500 ease-in-out group-hover:w-full"></span>
          </a>
        </div>
      </nav>
    </header>
  );
}
