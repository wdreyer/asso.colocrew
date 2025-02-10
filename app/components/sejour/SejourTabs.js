"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import ReservationCard from "./ReservationCard";
import ReactMarkdown from "react-markdown"; // Pour rendre le Markdown
// On n'utilise plus remark-breaks afin de conserver le comportement standard
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";

export default function SejourTabs({
  sections,
  sejour,
  selectedDate,
  selectedCity,
  selectedAgeGroup,
  reservationPrice,
  handleDateChange,
  handleCityChange,
  handleAgeGroupChange,
  handleReservation,
}) {
  // Récupération des sous‑sections du résumé
  const summarySubsArray = sejour.summarySubsections || [];

  // Construction dynamique des onglets (Résumé puis Sections)
  const tabs = [];
  if (summarySubsArray.length > 0) {
    tabs.push(summarySubsArray[0].title || "Résumé");
  } else {
    tabs.push("Résumé");
  }
  if (sections && sections.length > 0) {
    sections.forEach((section, index) => {
      let label = `Section ${index + 1}`;
      if (section.subSections && section.subSections.length > 0) {
        label = section.subSections[0].title || label;
      }
      tabs.push(label);
    });
  }

  const [activeTab, setActiveTab] = useState(0);

  // Référencer le conteneur de défilement des onglets
  const scrollContainerRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setShowLeftArrow(container.scrollLeft > 0);
      setShowRightArrow(
        container.scrollLeft + container.clientWidth < container.scrollWidth
      );
    };

    container.addEventListener("scroll", handleScroll);
    // Initialisation
    handleScroll();

    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollLeft = () => {
    scrollContainerRef.current.scrollBy({ left: -100, behavior: "smooth" });
  };

  const scrollRight = () => {
    scrollContainerRef.current.scrollBy({ left: 100, behavior: "smooth" });
  };

  // Fonction pour rendre une sous‑section
  // Pour chaque portion de texte encadrée par "/p" ... "/p",
  // on la remplace par le même contenu entouré de deux retours à la ligne.
  // Ensuite, via ReactMarkdown, on redéfinit le rendu des paragraphes
  // pour ajouter un <br> après chaque paragraphe.
  const renderSubSection = (sub, idx) => {
    const isOdd = idx % 2 === 1;
    const processedText = sub.text
      ? sub.text.replace(/\/p\s*(.*?)\s*\/p/g, "\n\n$1\n\n")
      : "";
    return (
      <div key={idx} className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className={`lg:col-span-2 ${isOdd ? "md:order-2" : "md:order-1"}`}>
          <h2 className="text-2xl font-bold mb-2 text-black">{sub.title}</h2>
          <ReactMarkdown
            className="text-base text-black"
            components={{
              p: ({ node, children, ...props }) => (
                <>
                  <p {...props}>{children}</p>
                  <br />
                </>
              ),
            }}
          >
            {processedText}
          </ReactMarkdown>
        </div>
        {sub.imageSrc && (
          <div className={`relative w-full h-64 lg:col-span-1 ${isOdd ? "md:order-1" : "md:order-2"}`}>
            <Image
              src={sub.imageSrc}
              alt={sub.title}
              fill
              style={{
                objectFit: "cover",
                objectPosition: "center",
              }}
              className="rounded-lg shadow-lg"
            />
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (activeTab === 0) {
      if (summarySubsArray.length === 0) {
        return <div className="p-4 text-black">Contenu non disponible.</div>;
      }
      return (
        <div>
          {summarySubsArray.map((sub, idx) => renderSubSection(sub, idx))}
        </div>
      );
    } else {
      const section = sections && sections[activeTab - 1];
      if (section && section.subSections && section.subSections.length > 0) {
        return (
          <div>
            {section.subSections.map((sub, idx) => renderSubSection(sub, idx))}
          </div>
        );
      }
      return <div className="p-4 text-black">Contenu non disponible.</div>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto my-4">
      {/* Conteneur relatif pour les onglets et les flèches */}
      <div className="relative">
        <div
          ref={scrollContainerRef}
          className="no-scrollbar flex flex-nowrap overflow-x-auto overflow-y-hidden scrollbar-hide pr-4 md:pr-0"
        >
          {tabs.map((label, idx) => (
            <button
              key={idx}
              onClick={() => setActiveTab(idx)}
              className={`whitespace-nowrap text-xl px-4 py-2 -mb-px font-medium cursor-pointer focus:outline-none ${
                activeTab === idx
                  ? "border-b-2 border-[#B8336A] text-black"
                  : "text-black"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {showLeftArrow && (
          <button
            onClick={scrollLeft}
            className="absolute left-0 top-1/2 transform -translate-y-1/2 bg-white p-1 rounded-full shadow"
          >
            <FaChevronLeft className="text-black" />
          </button>
        )}
        {showRightArrow && (
          <button
            onClick={scrollRight}
            className="absolute right-0 top-1/2 transform -translate-y-1/2 bg-white p-1 rounded-full shadow"
          >
            <FaChevronRight className="text-black" />
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">{renderContent()}</div>
        <div className="lg:col-span-1">
          <ReservationCard
            sejour={sejour}
            selectedDate={selectedDate}
            selectedCity={selectedCity}
            selectedAgeGroup={selectedAgeGroup}
            reservationPrice={reservationPrice}
            handleDateChange={handleDateChange}
            handleCityChange={handleCityChange}
            handleAgeGroupChange={handleAgeGroupChange}
            handleReservation={handleReservation}
          />
        </div>
      </div>
    </div>
  );
}
