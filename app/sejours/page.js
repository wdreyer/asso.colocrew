"use client";
import { useState, useEffect } from "react";
import { useSpring, animated, useTransition } from "@react-spring/web";
import {
  FaWater,
  FaUtensils,
  FaBed,
  FaRunning,
  FaUsers,
  FaBus,
  FaPaintBrush,
  FaCalendar,
  FaMoneyBillWave,
  FaCity,
} from "react-icons/fa";
import SejourSurf from "../components/Sejoursurf";
import Image from "next/image";
import ReservationModal from "../components/ReservationModal";

export default function NosSejours() {
  const images = ["/1.jpg", "/2.jpg", "/3.jpg", "/4.jpg", "/5.jpg"];
  const [currentImage, setCurrentImage] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("6 juillet au 18 juillet");
  const [selectedCity, setSelectedCity] = useState("Paris");
  const [reservationPrice, setReservationPrice] = useState(200); // Calcul dynamique du prix

  const basePrice = 960;

  // Calcul du prix basé sur la ville sélectionnée
  useEffect(() => {
    const cityPriceMap = {
      Paris: 150,
      Bordeaux: 100,
      Lyon: 220,
      Toulouse: 100,
      Marseille: 200,
    };
    setReservationPrice(basePrice + cityPriceMap[selectedCity]);
  }, [selectedCity]);

  // Effet de carrousel
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImage((prevImage) => (prevImage + 1) % images.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [images.length]);

  const zoomAndMoveProps = useSpring({
    from: { scale: 1.05, x: 30 },
    to: { scale: 1.15, x: -30 },
    config: { duration: 10000 },
    loop: { reverse: true },
  });

  const transitions = useTransition(currentImage, {
    key: currentImage,
    from: { opacity: 0, position: "absolute" },
    enter: { opacity: 1 },
    leave: { opacity: 0 },
    config: { duration: 1500 },
  });

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
  };

  const handleCityChange = (e) => {
    setSelectedCity(e.target.value);
  };

  return (
    <section id="nos-sejours">
      <div className="fixed inset-x-0 z-10 bottom-0 border bg-gray-100 dark:bg-gray-800 p-1 shadow-lg">
        <div className="flex flex-col md:flex-row md:justify-center md:space-x-10 md:px-8 space-y-4 md:space-y-0 items-center">
          {/* Date, Ville, Prix alignés sur la même ligne sur les grands écrans */}
          <div className="flex md:flex-row justify-between items-center md:space-y-0 md:space-x-10 w-full">
            {/* Sélection de la date */}
            <div className="flex items-center space-x-2">
              <FaCalendar className="text-purple-700 text-sm md:text-lg" />
              <select
                id="date-select"
                value={selectedDate}
                onChange={handleDateChange}
                className="bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md p-1 text-sm w-24 md:w-auto md:text-base"
              >
                <option value="6 juillet au 18 juillet">
                  6 juillet au 18 juillet
                </option>
                <option value="20 juillet au 1er août">
                  20 juillet au 1er août
                </option>
                <option value="3 août au 15 août">3 août au 15 août</option>
                <option value="17 août au 29 août">17 août au 29 août</option>
              </select>
            </div>

            {/* Sélection de la ville */}
            <div className="flex items-center space-x-2">
              <FaCity className="text-blue-600 text-sm md:text-lg" />
              <select
                id="city-select"
                value={selectedCity}
                onChange={handleCityChange}
                className="bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md p-1 text-sm md:w-auto md:text-base"
              >
                <option value="Paris">Paris</option>
                <option value="Bordeaux">Bordeaux</option>
                <option value="Lyon">Lyon</option>
                <option value="Toulouse">Toulouse</option>
                <option value="Marseille">Marseille</option>
              </select>
            </div>

            {/* Affichage du prix */}
            <div className="flex items-center space-x-2">
              <FaMoneyBillWave className="text-green-600 text-sm md:text-lg" />
              <span className="text-base md:text-lg font-semibold text-gray-700 dark:text-gray-200">
                {reservationPrice} €
              </span>
            </div>
          </div>

          {/* Bouton de réservation */}
          <div className="flex justify-center md:justify-start w-full md:w-auto">
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full md:w-auto bg-gray-700 text-white px-6 py-2 rounded-md hover:bg-gray-800 transition duration-300 text-sm md:text-base"
            >
              Réserver
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-full mx-auto">
        {/* Carrousel en pleine largeur */}
        <SejourSurf />
      </div>

      {/* Modal de réservation */}
      {isModalOpen && (
        <ReservationModal
          setIsModalOpen={setIsModalOpen}
          selectedDate={selectedDate}
          selectedCity={selectedCity}
          reservationPrice={reservationPrice}
        />
      )}

      {/* Mentions légales */}
      <footer className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-center pt-4">
        <p className="text-sm">
          Photos non contractuelles. Les conditions d'accueil, d'hébergement et
          autres sont susceptibles d'évoluer.
        </p>
      </footer>
    </section>
  );
}
