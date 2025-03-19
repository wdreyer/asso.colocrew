"use client";
import Image from "next/image";
import { FaUsers, FaLightbulb, FaHeart, FaCogs, FaDownload } from "react-icons/fa";
import { useEffect, useRef } from "react";

export default function Pedagogie() {
  const instagramRef = useRef(null);

  // Cette fonction charge le script Instagram Embed
  useEffect(() => {
    // Charger le script Instagram embed API
    const script = document.createElement('script');
    script.src = 'https://www.instagram.com/embed.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

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
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-4 sm:px-8">
          <h1 className="text-3xl md:text-5xl font-bold tracking-wide text-center">
            Qui sommes-nous ?
          </h1>
          <p className="sm:text-base mt-2 max-w-2xl text-center">
            Un projet éducatif centré sur l'inclusivité, le sport et la créativité.
          </p>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-12">
        {/* Layout container avec Instagram à droite */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Colonne principale */}
          <div className="lg:w-2/3">
            {/* Présentation succincte */}
            <div className="mb-12">
              <div className="flex items-center mb-4">
                <FaUsers className="text-gray-600 text-2xl mr-3" />
                <h2 className="text-2xl font-bold text-gray-800">
                  Notre approche
                </h2>
              </div>
              <p className="text-gray-600 text-base leading-relaxed mb-4">
                Colocrew est une association d'éducation populaire à but non lucratif.
                Nous organisons des colonies de vacances pour les 11-17 ans
                où le sport, l'art et l'émancipation sont au cœur de notre démarche. Nos séjours
                durent 12 jours, ce qui permet de créer une vraie dynamique de groupe,
                de favoriser l'épanouissement de chacun et de promouvoir la mixité sociale.
              </p>
              <p className="text-gray-600 text-base leading-relaxed">
                Nos équipes sont composées d'animateurs et de formateurs passionnés
                qui partagent les mêmes convictions : bienveillance, inclusion et respect
                de l'environnement. Nous collaborons avec différents partenaires (mairies, ASE, CE...)
                pour rendre nos séjours accessibles au plus grand nombre.
              </p>
            </div>

            {/* Nos Valeurs - maintenant également à gauche */}
            <div>
              <div className="flex items-center mb-4">
                <FaHeart className="text-gray-600 text-2xl mr-3" />
                <h2 className="text-2xl font-bold text-gray-800">Nos valeurs</h2>
              </div>
              <ul className="list-disc list-inside space-y-2 text-gray-600">
                <li>
                  <strong>Inclusivité :</strong> On accueille tout le monde, on lutte
                  contre les discriminations et on mise vraiment sur la mixité sociale.
                </li>
                <li>
                  <strong>Écologie :</strong> On sensibilise aux enjeux environnementaux
                  en privilégiant les activités de pleine nature et les partenariats locaux.
                </li>
                <li>
                  <strong>Émancipation :</strong> On encourage les jeunes à prendre des initiatives
                  et des responsabilités (choix des menus, gestion du budget, activités en autonomie).
                </li>
                <li>
                  <strong>Coopération :</strong> On mise sur une vie de groupe où l'entraide
                  et le respect passent avant la compétition.
                </li>
              </ul>
            </div>
          </div>

          {/* Instagram Reel à droite - version épurée */}
          <div className="lg:w-1/3 flex justify-center lg:justify-end sticky top-4 self-start h-fit" ref={instagramRef}>
            <div className="w-full max-w-xs">
              {/* Version ultra épurée du Reel */}
              <iframe
                src={`https://www.instagram.com/p/DBg_7W0ojbf/embed/`}
                width="100%"
                height="450"
                frameBorder="0"
                scrolling="no"
                allowtransparency="true"
                className="rounded-lg shadow-md"
              ></iframe>
            </div>
          </div>
        </div>

        {/* Activités phares */}
        <div>
          <div className="flex items-center mb-4">
            <FaLightbulb className="text-gray-600 text-2xl mr-3" />
            <h2 className="text-2xl font-bold text-gray-800">Nos activités</h2>
          </div>
          <p className="text-gray-600 text-base leading-relaxed mb-4">
            Nos séjours mêlent sport, créativité et moments d'autonomie :
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>
              <strong>Sport :</strong> Surf, escalade, ski, voile... Toujours avec des pros
              pour apprendre à se dépasser et faire équipe.
            </li>
            <li>
              <strong>Art :</strong> Théâtre, musique, danse, arts plastiques, vidéo...
              Pour libérer sa créativité et travailler ensemble.
            </li>
            <li>
              <strong>Vie quotidienne :</strong> Les jeunes préparent les repas,
              gèrent un budget et organisent certaines activités. C'est la vraie vie !
            </li>
            <li>
              <strong>Moments de partage :</strong> Veillées, jeux coopératifs, débats...
              Pour échanger et renforcer les liens dans le groupe.
            </li>
          </ul>
        </div>

        {/* Engagement & Résultats Attendus */}
        <div>
          <div className="flex items-center mb-4">
            <FaCogs className="text-gray-600 text-2xl mr-3" />
            <h2 className="text-2xl font-bold text-gray-800">
              Notre engagement
            </h2>
          </div>
          <p className="text-gray-600 text-base leading-relaxed mb-4">
            Après 12 jours chez nous, on veut que chaque jeune reparte avec de nouvelles
            compétences sociales, plus de confiance en soi et l'envie d'agir en tant que
            citoyen. La durée de nos séjours permet de créer des liens solides,
            d'approfondir les apprentissages et de développer une vraie cohésion de groupe.
          </p>
          <p className="text-gray-600 text-base leading-relaxed">
            On prend aussi soin de nos équipes : salaires corrects, temps de repos
            et de préparation garantis. Parce que des animateurs épanouis,
            c'est la base pour transmettre nos valeurs dans de bonnes conditions.
          </p>
        </div>

        {/* Lien vers projet éducatif */}
        <div className="text-center pt-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            En savoir plus
          </h2>
          <p className="text-gray-600 mb-6">
            Envie de connaître tous les détails de notre démarche et de nos objectifs ?
            Jetez un œil à notre projet éducatif complet.
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