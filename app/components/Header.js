"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { FaBars, FaTimes, FaUser, FaProjectDiagram, FaSuitcase, FaUserPlus } from "react-icons/fa";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  // Toggle du menu mobile
  const toggleMenu = () => setIsOpen(!isOpen);

  useEffect(() => {
    const header = document.querySelector("header");
    const links = document.querySelectorAll('a[href^="#"]');

    links.forEach((link) => {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute("href"));
        const headerHeight = header.offsetHeight;
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;

        window.scrollTo({
          top: targetPosition,
          behavior: "smooth",
        });
      });
    });

    const logo = document.querySelector(".logo-link");
    logo.addEventListener("click", function (e) {
      e.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: "smooth",
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
          <a href="#top" className="logo-link cursor-pointer">
            <Image src="/LogoColoCrew.png" alt="Logo de ColoCrew" width={80} height={80} />
          </a>
          <span className="text-2xl font-semibold text-purple-800 tracking-tight font-poppins">L'asso</span>
        </div>

        {/* Icône de menu burger */}
        <div className="lg:hidden">
          <button onClick={toggleMenu} className="text-3xl text-purple-800">
            {isOpen ? <FaTimes /> : <FaBars />}
          </button>
        </div>

        {/* Liens de navigation - Version bureau */}
        <div className={`hidden lg:flex space-x-8 text-gray-700`}>
          <a href="#qui-sommes-nous" className="relative group text-lg font-medium text-gray-700 flex items-center space-x-2">
            <FaUser />
            <span>Qui sommes-nous</span>
            <span className="block absolute bottom-[-5px] left-0 w-0 h-0.5 bg-purple-600 transition-all duration-500 ease-in-out group-hover:w-full"></span>
          </a>
          <a href="#notre-projet" className="relative group text-lg font-medium text-gray-700 flex items-center space-x-2">
            <FaProjectDiagram />
            <span>Notre projet</span>
            <span className="block absolute bottom-[-5px] left-0 w-0 h-0.5 bg-purple-600 transition-all duration-500 ease-in-out group-hover:w-full"></span>
          </a>
          <a href="#nos-sejours" className="relative group text-lg font-medium text-gray-700 flex items-center space-x-2">
            <FaSuitcase />
            <span>Nos séjours</span>
            <span className="block absolute bottom-[-5px] left-0 w-0 h-0.5 bg-purple-600 transition-all duration-500 ease-in-out group-hover:w-full"></span>
          </a>
          <a href="#nous-rejoindre" className="relative group text-lg font-medium text-gray-700 flex items-center space-x-2">
            <FaUserPlus />
            <span>Nous rejoindre</span>
            <span className="block absolute bottom-[-5px] left-0 w-0 h-0.5 bg-purple-600 transition-all duration-500 ease-in-out group-hover:w-full"></span>
          </a>
        </div>

        {/* Menu mobile */}
        <div className={`lg:hidden ${isOpen ? "block" : "hidden"} absolute top-16 left-0 w-full bg-white shadow-md py-4 space-y-4 text-center`}>
          <a href="#qui-sommes-nous" onClick={toggleMenu} className="block text-lg font-medium text-gray-700 relative group">
            <FaUser className="inline-block mr-2" /> Qui sommes-nous
            <span className="block absolute bottom-[-5px] left-0 w-0 h-0.5 bg-purple-600 transition-all duration-500 ease-in-out group-hover:w-full"></span>
          </a>
          <a href="#notre-projet" onClick={toggleMenu} className="block text-lg font-medium text-gray-700 relative group">
            <FaProjectDiagram className="inline-block mr-2" /> Notre projet
            <span className="block absolute bottom-[-5px] left-0 w-0 h-0.5 bg-purple-600 transition-all duration-500 ease-in-out group-hover:w-full"></span>
          </a>
          <a href="#nos-sejours" onClick={toggleMenu} className="block text-lg font-medium text-gray-700 relative group">
            <FaSuitcase className="inline-block mr-2" /> Nos séjours
            <span className="block absolute bottom-[-5px] left-0 w-0 h-0.5 bg-purple-600 transition-all duration-500 ease-in-out group-hover:w-full"></span>
          </a>
          <a href="#nous-rejoindre" onClick={toggleMenu} className="block text-lg font-medium text-gray-700 relative group">
            <FaUserPlus className="inline-block mr-2" /> Nous rejoindre
            <span className="block absolute bottom-[-5px] left-0 w-0 h-0.5 bg-purple-600 transition-all duration-500 ease-in-out group-hover:w-full"></span>
          </a>
        </div>
      </nav>
    </header>
  );
}
