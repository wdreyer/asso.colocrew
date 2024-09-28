"use client";
import { useState, useEffect } from "react";
import { useSpring, animated, useTransition } from "@react-spring/web";
import { FaWater } from "react-icons/fa"; // Icone de vague
import Image from "next/image";

export default function NosSejours() {
  const images = ["/1.jpg", "/2.jpg", "/3.jpg", "/4.jpg", "/5.jpg"];
  const [currentImage, setCurrentImage] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
    <section id="nos-sejours" className="py-12 bg-purple-50 px-2">
      <h2 className="text-4xl text-center font-bold text-purple-800 mb-12">Nos séjours :</h2>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Carrousel d'images pour Surf et Camp */}
        <div className="relative h-[35vh] sm:h-[65vh] overflow-hidden rounded-lg shadow-lg">
          {transitions((style, index) => (
            <animated.div
              key={index}
              className="absolute inset-0 w-full h-full"
              style={{ ...style, ...zoomAndMoveProps }}
            >
              <Image
                src={images[index]}
                alt={`Séjour image ${index + 1}`}
                layout="fill"
                objectFit="cover"
                className="rounded-lg"
              />
            </animated.div>
          ))}
        </div>

        {/* Section d'information */}
        <div className="flex flex-col text-left">
          <h2 className="text-2xl font-bold text-purple-800 text-center mb-6 flex items-center justify-center">
            <FaWater className="mr-2 text-2xl" /> Séjour Surf Été 2025 🌊🏄‍♂️
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Rejoignez-nous cet été pour 12 jours inoubliables de surf 🌊 sur les magnifiques plages de Vendays-Montalivet.
            Profitez de 6 séances de surf encadrées par des professionnels 🏄‍♂️, avec une vraie progression pour tous les niveaux !
          </p>
          <p className="text-xl text-gray-600 mb-8">
            En plus des activités sportives 💪, plongez dans la création d'un projet artistique unique 🎨, comme un vlog ou un clip vidéo,
            qui vous permettra d'aboutir à la réalisation d'un vrai projet concret.
          </p>
          <p className="text-xl text-gray-600 mb-4">
            Nous vous proposons 12 nuits en camping en pension complète avec les dates suivantes 📅 :
          </p>
          <ul className="pl-6 text-xl font-semibold text-purple-600 mb-8 list-disc list-inside">
            <li>6 juillet au 18 juillet</li>
            <li>20 juillet au 1er août</li>
            <li>3 août au 15 août</li>
            <li>17 août au 29 août</li>
          </ul>

          {/* Call to action */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-6 inline-block bg-pink-500 text-white px-8 py-4 rounded-full text-lg hover:bg-pink-600 hover:scale-105 transition duration-300"
          >
            Intéressé(e) ? Laissez-nous vos coordonnées 📧
          </button>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ">
          <div className="bg-white p-4 rounded-lg max-w-2xl mx-auto shadow-lg relative w-full md:w-1/2">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
            >
              ✖
            </button>
            <h2 className="text-2xl font-bold mb-2">Laissez-nous vos coordonnées :</h2>
            <iframe
              src="https://docs.google.com/forms/d/e/1FAIpQLSfktcYvbCQ0iUIjxeULAaQyoAe4eHMNVHpi6HtfvCLRYjKlDA/viewform?embedded=true"

              width="100%"
              height="600"
              frameBorder="0"
              marginHeight="0"
              marginWidth="0"
              className="rounded"
            >
              Chargement…
            </iframe>
          </div>
        </div>
      )}
    </section>
  );
}
