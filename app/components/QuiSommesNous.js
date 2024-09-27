"use client";
import { useState, useEffect } from "react";
import { useSpring, animated, useTransition } from "@react-spring/web";
import { FaClock, FaPaintBrush, FaRunning, FaUtensils, FaUsers } from "react-icons/fa"; // Added icons for the new cards
import Image from "next/image";

export default function QuiSommesNous() {
  const images = ["/1.jpg", "/2.jpg", "/3.jpg", "/4.jpg", "/5.jpg"];
  const [currentImage, setCurrentImage] = useState(0);

  // Change the image every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImage((prevImage) => (prevImage + 1) % images.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [images.length]);

  // Continuous camera movement and zoom
  const zoomAndMoveProps = useSpring({
    from: { scale: 1.1, x: 50 },
    to: { scale: 1.3, x: -50 },
    config: { duration: 10000 },
    loop: { reverse: true },
  });

  // Transition between images (opacity only)
  const transitions = useTransition(currentImage, {
    key: currentImage,
    from: { opacity: 0, position: "absolute" },
    enter: { opacity: 1 },
    leave: { opacity: 0 },
    config: { duration: 1500 },
    trail: 200,
  });

  return (
    <div>
      {/* Carousel Background */}
      <div className="relative h-[65vh] overflow-hidden z-0 mb-2 ">
        {transitions((style, index) => (
          <animated.div
            key={index}
            className="absolute inset-0 w-full h-full"
            style={{ ...style, ...zoomAndMoveProps }}
          >
            <Image
              src={images[index]}
              alt={`Slide ${index + 1}`}
              layout="fill"
              objectFit="cover"
              className="transition-transform ease-in-out"
            />
          </animated.div>
        ))}

        {/* Hero section content */}
        <div className="relative z-10 h-full flex items-center justify-center text-center">
          <div className="text-white space-y-8">
            <h1 className="text-6xl font-extrabold uppercase tracking-wide">
              Réinventons les colos
            </h1>
            <h2 className="text-4xl font-semibold uppercase tracking-widest">
              Avec ColoCrew
            </h2>
          </div>
        </div>
      </div>

      {/* Storytelling section */}
      <section  id="qui-sommes-nous"  className="relative z-20 bg-white py-12">
      <span  />
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h2  className="text-4xl font-bold text-purple-800 mb-6">Qui sommes nous ? </h2>
          <p className="text-gray-600 text-lg mb-4">
            À l'origine de ce projet, Marion et William, animateurs.ice et directeurs.ice de séjours depuis plus de 10 ans,
            avons voulu transformer les séjours de vacances pour les jeunes et les animateurs.ices. Forts de nos expériences,
            nous avons créé ColoCrew avec l'idée de remettre l'humain au centre du projet.
          </p>
          <p className="text-gray-600 text-lg">
            Notre mission est simple : offrir des séjours inoubliables tout en garantissant de meilleures conditions
            de travail pour les animateurs.ices, et des expériences plus riches, plus valorisantes et avec plus d'autonomies pour les jeunes.
          </p>
        </div>
      </section>

      {/* Mesures concrètes section */}
      <section id="notre-projet" className="relative z-20 bg-gray-100 py-12">
  <div className="max-w-6xl mx-auto px-6">
    <h2 className="text-4xl font-bold text-center text-purple-800 mb-12">Notre projet</h2>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 justify-center items-stretch">
      {/* Card 1 */}
      <div className="bg-white shadow-lg rounded-lg p-6 flex flex-col justify-between text-center h-full">
        <div>
          <FaClock className="text-purple-600 text-6xl mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-gray-800 mb-4">Amélioration des conditions de travail</h3>
          <p className="text-gray-600">
            Des salaires décents, du temps de préparation, et des conditions de travail respectueuses.
          </p>
        </div>
      </div>

      {/* Card 2 */}
      <div className="bg-white shadow-lg rounded-lg p-6 flex flex-col justify-between text-center h-full">
        <div>
          <FaPaintBrush className="text-purple-600 text-6xl mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-gray-800 mb-4">Expérience artistique</h3>
          <p className="text-gray-600">
            Un projet artistique à réaliser au cours de la semaine : vlog, clip, spectacle, etc, ...
          </p>
        </div>
      </div>

      {/* Card 3 */}
      <div className="bg-white shadow-lg rounded-lg p-6 flex flex-col justify-between text-center h-full">
        <div>
          <FaRunning className="text-purple-600 text-6xl mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-gray-800 mb-4">Activités sportives</h3>
          <p className="text-gray-600">
            Un programme sportif avec une vraie progression à travers 6 à 7 séances de sport dans le séjour.
          </p>
        </div>
      </div>

      {/* Card 4 */}
      <div className="bg-white shadow-lg rounded-lg p-6 flex flex-col justify-between text-center h-full">
        <div>
          <FaUtensils className="text-purple-600 text-6xl mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-gray-800 mb-4">Autonomie</h3>
          <p className="text-gray-600">
            Les jeunes participent activement au choix des repas, des activités, et à l'organisation de la vie quotidienne du séjour.
          </p>
        </div>
      </div>

      {/* Card 5 */}
      <div className="bg-white shadow-lg rounded-lg p-6 flex flex-col justify-between text-center h-full">
        <div>
          <FaUsers className="text-purple-600 text-6xl mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-gray-800 mb-4">Vivre ensemble</h3>
          <p className="text-gray-600">
            Des séjours de 12 jours favorisant la mixité sociale, permettant la création de liens forts et d'un véritable esprit de groupe.
          </p>
        </div>
      </div>
    </div>
  </div>
</section>


    </div>
  );
}
