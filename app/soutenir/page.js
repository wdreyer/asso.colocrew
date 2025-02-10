"use client";
import { useState } from "react";
import Image from "next/image";
import { FaInstagram, FaTiktok, FaLinkedin } from "react-icons/fa";
import ContactModal from "../components/ContactModal";

export default function Adherer() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <section id="nous-soutenir" className="relative bg-gray-50">
      {/* Section Héro avec Overlay */}
      <div className="relative w-full h-[40vh] sm:h-[35vh] overflow-hidden">
        <Image
          src="/follow.jpg"
          alt="Nous soutenir"
          layout="fill"
          objectFit="cover"
          priority
          className="w-full h-full"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center  text-white px-4 sm:px-8">
          <h1 className="text-3xl md:text-5xl font-black  tracking-wide text-center">
            Nous soutenir
          </h1>
          <p className="sm:text-base mt-2 max-w-2xl text-center font-bold">
            Rejoignez-nous dans cette aventure et contribuez à créer des séjours inoubliables pour les jeunes. Votre soutien est essentiel pour faire la différence.
          </p>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6">
        {/* Section Adhérer */}
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-gray-800 mb-6">Adhérer à ColoCrew</h2>
          <p className="text-gray-600 text-base max-w-4xl mx-auto mb-6">
            Devenir adhérent de ColoCrew, c'est soutenir nos actions et participer activement au développement de nos projets. En adhérant, vous serez informé en avant-première de nos actualités et vous pourrez contribuer à l'essor de notre association.
          </p>
          <button
            onClick={() => window.open("https://www.helloasso.com/associations/colocrew/adhesions/adhesion-a-colocrew-1", "_blank")}
            className="w-full md:w-auto bg-gray-700 text-white px-6 py-2 rounded-md hover:bg-gray-800 transition duration-300 text-sm md:text-base"
          >
            Adhérer Maintenant
          </button>
        </div>

        <hr className="my-8 border-gray-300" />

        {/* Section Partager sur les réseaux */}
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-gray-800 mb-6">Partagez sur les Réseaux</h2>
          <p className="text-gray-600 text-base max-w-4xl mx-auto mb-6">
            📣 Votre voix compte ! En partageant sur les réseaux sociaux, vous nous aidez à toucher plus de personnes et à réaliser nos projets. Suivez-nous et partagez nos contenus pour soutenir nos actions.
          </p>
          <div className="flex justify-center space-x-8 mb-6">
            {[
              { href: "https://www.instagram.com/_colocrew/", icon: FaInstagram },
              { href: "https://www.tiktok.com/@colocrew", icon: FaTiktok },
              { href: "https://www.linkedin.com/company/colocrew", icon: FaLinkedin },
            ].map(({ href, icon: Icon }, index) => (
              <a key={index} href={href} target="_blank" rel="noopener noreferrer" className="text-gray-700 hover:text-purple-700 transition">
                <Icon className="text-4xl" />
              </a>
            ))}
          </div>
        </div>

        <hr className="my-8 border-gray-300" />

        {/* Section Nous contacter */}
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-gray-800 mb-6">Rejoignez notre équipe</h2>
          <p className="text-gray-600 text-base max-w-4xl mx-auto mb-6">
            💡 Vous avez des compétences en communication, en recherche de financements, en partenariat, ou simplement l'envie de vous investir dans une association dynamique ? Nous sommes à la recherche de personnes motivées pour rejoindre notre équipe et contribuer à notre succès.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full md:w-auto bg-gray-700 text-white px-6 py-2 rounded-md hover:bg-gray-800 transition duration-300 text-sm md:text-base"
          >
            Contactez-nous
          </button>
        </div>
      </div>

      {/* Modale de contact */}
      {isModalOpen && <ContactModal setIsModalOpen={setIsModalOpen} />}
    </section>
  );
}
