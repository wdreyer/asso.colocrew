"use client";
import { useState, useEffect } from "react";
import { useSpring, animated, useTransition } from "@react-spring/web";
import { FaWater, FaPaintBrush, FaUtensils, FaSurf } from "react-icons/fa"; // Icone de vague
import Image from "next/image";

export default function NosSejours() {
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
            Profitez de 8 séances de surf encadrées par des professionnels 🏄‍♂️, avec une vraie progression pour tous les niveaux !
          </p>
          <p className="text-xl text-gray-600 mb-8">
            En plus des activités sportives 💪, plongez dans la création d'un projet artistique unique 🎨, comme un vlog ou un clip vidéo,
            qui vous permettra de capturer les meilleurs moments de votre séjour. Les soirées seront également animées avec des activités
            en camping ⛺ pour renforcer les liens entre les participants.
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
          <a
            href="/brochure.pdf"
            download
            className="mt-6 inline-block bg-pink-500 text-white px-8 py-4 rounded-full text-lg hover:bg-pink-600 hover:scale-105 transition duration-300"
          >
            Plus d'infos & Télécharger la brochure 📄
          </a>
        </div>

      </div>
    </section>
  );
}
