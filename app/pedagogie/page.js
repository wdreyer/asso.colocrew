"use client";
import Image from "next/image";
import { FaUsers, FaLightbulb, FaHeart, FaCogs, FaDownload } from "react-icons/fa";
import { useState } from "react";

export default function Pedagogie() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <section className="bg-gray-50">
      {/* Section Héro avec Overlay */}
      <div className="relative w-full h-[50vh] sm:h-[40vh] overflow-hidden">
        <Image
          src="/pedagogie.jpg"
          alt="Notre Pédagogie"
          fill
          style={{ objectFit: "cover" }}
          className="w-full h-full"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-50 text-white px-4 sm:px-8">
          <h1 className="text-3xl md:text-5xl font-bold uppercase tracking-wide text-center">
            Notre Pédagogie
          </h1>
          <p className="sm:text-base mt-2 max-w-2xl text-center">
            Découvrez qui nous sommes, nos valeurs et notre approche éducative unique.
          </p>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6">
        {/* Section Qui sommes-nous */}
        <div className="mb-12">
          <div className="flex items-center mb-6">
            <FaUsers className="text-gray-600 text-3xl mr-4" />
            <h2 className="text-3xl font-bold text-gray-800">Qui sommes-nous</h2>
          </div>
          <p className="text-gray-600 text-base leading-relaxed">
            Nous sommes Marion et William, les fondateurs de ColoCrew. Notre projet est né de l'envie de réinventer le modèle des colonies de vacances. Forts de notre expérience de près de 10 ans en tant qu'animateurs, directeurs de séjours et travailleurs sociaux, nous avons décidé de créer une association qui place l'éducation populaire au cœur de ses actions. ColoCrew est dédiée à l'épanouissement des jeunes à travers des séjours axés sur le sport, les arts et l'émancipation.
          </p>
        </div>

        {/* Séparateur */}
        <hr className="my-8 border-gray-300" />

        {/* Section Pourquoi ColoCrew */}
        <div className="mb-12">
          <div className="flex items-center mb-6">
            <FaLightbulb className="text-gray-600 text-3xl mr-4" />
            <h2 className="text-3xl font-bold text-gray-800">Pourquoi ColoCrew</h2>
          </div>
          <p className="text-gray-600 text-base leading-relaxed">
            ColoCrew est née de la volonté de transformer le secteur des séjours de vacances en répondant aux problématiques actuelles. Nous souhaitons améliorer les conditions de travail des animateurs en leur offrant des salaires décents, du temps de préparation et en respectant leur temps de repos. Pour les jeunes, nous proposons des séjours de 12 jours favorisant l'autonomie, la créativité et une véritable mixité sociale.
          </p>
        </div>

        {/* Séparateur */}
        <hr className="my-8 border-gray-300" />

        {/* Section Nos Valeurs */}
        <div className="mb-12">
          <div className="flex items-center mb-6">
            <FaHeart className="text-gray-600 text-3xl mr-4" />
            <h2 className="text-3xl font-bold text-gray-800">Nos Valeurs</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Valeur 1 */}
            <div>
              <h3 className="text-2xl font-semibold text-gray-800 mb-2">Bienveillance</h3>
              <p className="text-gray-600 text-base leading-relaxed">
                La bienveillance est au cœur de notre approche. Nous encourageons un environnement où chaque jeune se sent libre d'être lui-même, dans le respect des autres.
              </p>
            </div>
            {/* Valeur 2 */}
            <div>
              <h3 className="text-2xl font-semibold text-gray-800 mb-2">Émancipation</h3>
              <p className="text-gray-600 text-base leading-relaxed">
                Nous favorisons l'autonomie et la liberté de penser des jeunes, en leur offrant des outils pour développer leur esprit critique et leur indépendance.
              </p>
            </div>
            {/* Valeur 3 */}
            <div>
              <h3 className="text-2xl font-semibold text-gray-800 mb-2">Éco-responsabilité</h3>
              <p className="text-gray-600 text-base leading-relaxed">
                Sensibiliser les jeunes aux enjeux environnementaux est essentiel. Nous adoptons une démarche éco-citoyenne en respectant le territoire et ses habitants.
              </p>
            </div>
            {/* Valeur 4 */}
            <div>
              <h3 className="text-2xl font-semibold text-gray-800 mb-2">Coopération</h3>
              <p className="text-gray-600 text-base leading-relaxed">
                Nous encourageons la coopération plutôt que la compétition, en favorisant le travail d'équipe et la solidarité entre les participants.
              </p>
            </div>
          </div>
        </div>

        {/* Séparateur */}
        <hr className="my-8 border-gray-300" />

        {/* Section Comment les mettons-nous en place ? */}
        <div className="mb-12">
          <div className="flex items-center mb-6">
            <FaCogs className="text-gray-600 text-3xl mr-4" />
            <h2 className="text-3xl font-bold text-gray-800">Comment les mettons-nous en place ?</h2>
          </div>
          <p className="text-gray-600 text-base leading-relaxed mb-4">
            Nos valeurs se traduisent concrètement sur le terrain par des actions spécifiques :
          </p>
          <ul className="list-disc list-inside text-gray-600">
            <li>
              <strong>Pratiques sportives approfondies :</strong> Nous proposons des séjours avec une dizaine de séances sportives pour permettre une réelle progression.
            </li>
            <li>
              <strong>Projets artistiques concrets :</strong> Les jeunes participent à la création d'un projet artistique (clip, spectacle, podcast) pour développer leur créativité.
            </li>
            <li>
              <strong>Autonomie et prise de décision :</strong> Les participants sont impliqués dans le choix des activités, des repas et de la gestion du budget dédié.
            </li>
            <li>
              <strong>Engagement éco-citoyen :</strong> Sensibilisation aux problématiques environnementales et respect du territoire et de ses habitants.
            </li>
          </ul>
        </div>

        {/* Séparateur */}
        <hr className="my-8 border-gray-300" />

        {/* Section Télécharger le projet éducatif */}
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-gray-800 mb-6">Notre Projet Éducatif</h2>
          <p className="text-gray-600 text-base leading-relaxed mb-6">
            Pour en savoir plus sur notre approche pédagogique détaillée, vous pouvez télécharger notre projet éducatif complet.
          </p>
          <a
            href="/projet-educatif.pdf"
            download
            className="inline-flex items-center bg-gray-600 text-white px-6 py-3 rounded-md hover:bg-gray-700 transition duration-300"
          >
            <FaDownload className="mr-2" />
            Télécharger le projet éducatif
          </a>
        </div>
      </div>
    </section>
  );
}
