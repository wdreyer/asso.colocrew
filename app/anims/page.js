"use client";
import { useState } from "react";
import Image from "next/image";
import { FaMoneyBillWave, FaRegClock, FaHandsHelping, FaChalkboardTeacher } from "react-icons/fa";
import ApplicationModal from "../components/ApplicationModal"; // Import du modal de candidature

export default function Anims() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <section id="anims" className="relative bg-gray-50 ">
      {/* Section Héro avec Overlay */}
      <div className="relative w-full h-[40vh] sm:h-[35vh] overflow-hidden">
        <Image
          src="/anims.jpg"
          alt="Conditions de travail des animateurs"
          fill
          style={{ objectFit: "cover" }}
          className="w-full h-full"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-40 text-white px-4 sm:px-8">
          <h1 className="text-3xl md:text-5xl font-bold uppercase tracking-wide text-center">
            TRAVAILLER CHEZ ColoCrew
          </h1>
          <p className="sm:text-base mt-2 max-w-2xl text-center">
            Nous croyons fermement que le bien-être des animateurs est la clé du succès de nos séjours. Chez ColoCrew, nous nous battons pour améliorer les conditions de travail et garantir un environnement sain, respectueux et engagé.
          </p>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6">
        {/* Section Conditions de travail */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-gray-800 mb-12 text-center">Nos Conditions de Travail</h2>

          {/* Grille 2 colonnes pour les sections */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-12">
            {/* Rémunération */}
            <div className="flex flex-col items-center text-center transition-transform hover:scale-105">
              <FaMoneyBillWave className="text-6xl text-gray-600 mb-4 transition-transform hover:rotate-12" />
              <h3 className="text-2xl font-semibold text-gray-700">Rémunération</h3>
              <p className="text-gray-600 text-base">
                Chez ColoCrew, nous offrons des salaires attractifs qui respectent le SMIC mensuel, soit un minimum de <strong>56 € brut par jour</strong> pour l'ensemble des animateurs et du personnel.
              </p>
            </div>

            {/* Temps de préparation */}
            <div className="flex flex-col items-center text-center transition-transform hover:scale-105">
              <FaRegClock className="text-6xl text-gray-600 mb-4 transition-transform hover:rotate-12" />
              <h3 className="text-2xl font-semibold text-gray-700">Temps de Préparation</h3>
              <p className="text-gray-600 text-base">
                Nous prévoyons des moments de préparation conséquents pour garantir un encadrement de qualité avant chaque séjour. Avant et entre chaque séjour un temps de prépration de <strong>2 jours</strong> sera organisé en équipe sur le lieu du séjour.
              </p>
            </div>

            {/* Temps de repos */}
            <div className="flex flex-col items-center text-center transition-transform hover:scale-105">
              <FaHandsHelping className="text-6xl text-gray-600 mb-4 transition-transform hover:rotate-12" />
              <h3 className="text-2xl font-semibold text-gray-700">Temps de Repos</h3>
              <p className="text-gray-600 text-base">
                Nos animateurs bénéficient de temps de pause adaptés, en respect des exigences légales et des <strong>besoins individuels.</strong>
              </p>
            </div>

            {/* Formations */}
            <div className="flex flex-col items-center text-center transition-transform hover:scale-105">
              <FaChalkboardTeacher className="text-6xl text-gray-600 mb-4 transition-transform hover:rotate-12" />
              <h3 className="text-2xl font-semibold text-gray-700">Formations</h3>
              <p className="text-gray-600 text-base">
                Nous proposons des formations émancipatrices adaptées à notre <strong>pédagogie et nos valeurs</strong> : inclusivité, lutte contre la maltraitance, féminisme, anti-racisme.
              </p>
            </div>
          </div>
        </div>

        {/* Séparateur */}
        <hr className="my-8 border-gray-300" />

        {/* Section Postuler */}
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-gray-800 mb-6">Rejoignez-nous</h2>
          <p className="text-gray-600 text-base max-w-4xl mx-auto mb-6">
            Vous souhaitez rejoindre une équipe dynamique et engagée ? Postulez dès maintenant pour travailler avec ColoCrew. Nous recherchons des animateurs.ices motivés et passionnés.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full md:w-auto bg-gray-700 text-white px-6 py-2 rounded-md hover:bg-gray-800 transition duration-300 text-sm md:text-base"
          >
            Postuler
          </button>
        </div>
      </div>

      {/* Modale de candidature */}
      {isModalOpen && <ApplicationModal setIsModalOpen={setIsModalOpen} />}
    </section>
  );
}
