"use client";
import Image from "next/image";
import { FaUsers, FaLightbulb, FaHeart, FaCogs, FaDownload } from "react-icons/fa";

export default function Pedagogie() {
  return (
    <section className="bg-gray-50">
      {/* Section Hero avec Overlay */}
      <div className="relative w-full h-[40vh] sm:h-[35vh] overflow-hidden">
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
            Un projet éducatif basé sur l’inclusivité, le sport et la créativité.
          </p>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-12">
        {/* Présentation succincte */}
        <div>
          <div className="flex items-center mb-4">
            <FaUsers className="text-gray-600 text-2xl mr-3" />
            <h2 className="text-2xl font-bold text-gray-800">
              Notre Démarche Pédagogique
            </h2>
          </div>
          <p className="text-gray-600 text-base leading-relaxed mb-4">
            Colocrew est une association d’éducation populaire à but non lucratif.
            Nous proposons des colonies de vacances pour les jeunes de 11 à 17 ans,
            axées sur le sport, la pratique artistique et l’émancipation. Grâce à
            des séjours plus longs (12 jours), nous favorisons la construction
            d’un véritable collectif, l’épanouissement de chaque participant·e
            et la mixité sociale.
          </p>
          <p className="text-gray-600 text-base leading-relaxed">
            Nos équipes sont composées d’animateur·rice·s et de formateur·rice·s
            expérimenté·e·s, partageant toutes et tous un même engagement
            : promouvoir la bienveillance, l’inclusion et le respect de
            l’environnement. Nous travaillons main dans la main avec différents
            partenaires (mairies, ASE, CE, etc.) afin de rendre nos séjours
            accessibles au plus grand nombre.
          </p>
        </div>

        {/* Nos Valeurs */}
        <div>
          <div className="flex items-center mb-4">
            <FaHeart className="text-gray-600 text-2xl mr-3" />
            <h2 className="text-2xl font-bold text-gray-800">Nos Valeurs</h2>
          </div>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>
              <strong>Inclusivité :</strong> Ouverture à toutes et tous, lutte
              contre toutes formes de discrimination et mise en avant d’une
              réelle mixité sociale.
            </li>
            <li>
              <strong>Respect de l’environnement :</strong> Sensibilisation aux
              enjeux écologiques et ancrage local de nos actions (activités de
              pleine nature, partenariats de proximité, etc.).
            </li>
            <li>
              <strong>Émancipation :</strong> Encouragement à la prise
              d’initiatives et à la responsabilité individuelle et collective
              (choix des menus, gestion du budget, activités d’autogestion…).
            </li>
            <li>
              <strong>Coopération :</strong> Vie de groupe où solidarité,
              respect et aide mutuelle priment sur la compétition.
            </li>
          </ul>
        </div>

        {/* Activités phares */}
        <div>
          <div className="flex items-center mb-4">
            <FaLightbulb className="text-gray-600 text-2xl mr-3" />
            <h2 className="text-2xl font-bold text-gray-800">Activités Phare</h2>
          </div>
          <p className="text-gray-600 text-base leading-relaxed mb-4">
            Notre offre repose sur un équilibre entre sport, créativité et temps
            d’autogestion&nbsp;:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>
              <strong>Pratiques sportives :</strong> Surf, escalade, ski, voile…
              Toujours encadrées par des professionnels, elles favorisent
              l’esprit d’équipe et le dépassement de soi.
            </li>
            <li>
              <strong>Ateliers artistiques :</strong> Théâtre, musique, danse,
              arts plastiques ou production audiovisuelle, pour stimuler
              la créativité et le sens de la collaboration.
            </li>
            <li>
              <strong>Vie en autogestion :</strong> Implication concrète des
              jeunes dans la préparation des repas, la gestion du budget
              et la mise en place des activités quotidiennes.
            </li>
            <li>
              <strong>Moments fédérateurs :</strong> Grandes veillées, jeux
              coopératifs, débats sur des sujets d’actualité, favorisant
              les échanges et la cohésion du groupe.
            </li>
          </ul>
        </div>

        {/* Engagement & Résultats Attendus */}
        <div>
          <div className="flex items-center mb-4">
            <FaCogs className="text-gray-600 text-2xl mr-3" />
            <h2 className="text-2xl font-bold text-gray-800">
              Notre Engagement
            </h2>
          </div>
          <p className="text-gray-600 text-base leading-relaxed mb-4">
            Nous nous engageons à ce que chaque jeune revienne de colo avec de
            nouvelles compétences sociales, une plus grande confiance en soi
            et une conscience élargie de son pouvoir d’action citoyen. Nos
            séjours de 12 jours permettent de tisser des liens plus forts
            entre les participant·e·s, d’approfondir les apprentissages,
            et de favoriser une véritable dynamique de groupe.
          </p>
          <p className="text-gray-600 text-base leading-relaxed">
            Nous veillons aussi à prendre soin de nos équipes : salaires
            décents, temps de repos et préparation garantis, pour que chacune
            et chacun puisse transmettre nos valeurs dans les meilleures
            conditions possibles.
          </p>
        </div>

        {/* Lien vers projet éducatif */}
        <div className="text-center pt-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            En savoir plus
          </h2>
          <p className="text-gray-600 mb-6">
            Pour découvrir l’intégralité de notre démarche et de nos objectifs,
            n’hésitez pas à consulter notre projet éducatif détaillé.
          </p>
          <a
            href="/projet-educatif.pdf"
            download
            className="inline-flex items-center bg-gray-600 text-white px-6 py-3 rounded-md hover:bg-gray-700 transition duration-300"
          >
            <FaDownload className="mr-2" />
            Consulter le projet éducatif
          </a>
        </div>
      </div>
    </section>
  );
}
