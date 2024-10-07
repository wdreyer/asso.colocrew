"use client";
import { useState, useEffect } from "react";
import { useSpring, animated, useTransition } from "@react-spring/web";
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
      {/* Carousel Background with reduced height */}
      <div className="bg-black relative h-[30vh] sm:h-[45vh] overflow-hidden z-0 mb-2 flex items-center justify-center">
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
        <div className="relative z-10  flex items-center justify-center text-center h-full">
          <div className="text-white space-y-8">
            <h1 className="text-3xl font-extrabold uppercase tracking-wide px-4 sm:px-6 md:px-8 md:text-7xl">
              Réinventons les colos
            </h1>
            <h2 className="text-3xl font-semibold uppercase tracking-widest px-4 sm:px-6 md:px-8">
              Avec ColoCrew
            </h2>
          </div>
        </div>
      </div>

      {/* Texte d'accroche après le carrousel */}
      <section className="bg-white py-1 sm:py-4 text-center">
        <div className="max-w-5xl mx-auto px-1 sm:px-6">
          <h3 className="text-xl sm:text-3xl font-bold text-gray-800 mb-1 sm:mb-4">
            Un espace d'émancipation et de créativité !
          </h3>
          <p className="text-lg text-gray-600">
          À ColoCrew, chaque jeune a la possibilité de se découvrir à travers
            des activités sportives et artistiques. Nous créons des séjours où l'autonomie, l'inclusivité et la mixité sont au cœur de chaque expérience.
          </p>
        </div>
      </section>

    </div>
  );
}
