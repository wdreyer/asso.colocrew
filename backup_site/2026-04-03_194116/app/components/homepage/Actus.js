"use client";

import { useState } from "react";
import Link from "next/link";

export default function Actus() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  return (
    <div className="container mx-auto p-6 font-inter">
      {/* Grille à deux colonnes pour les annonces */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Colonne gauche : Annonce du séjour */}
        <Link href="/sejours/my-creative-surf-camp">
          <div className="cursor-pointer p-6 bg-white border border-gray-200 rounded-lg shadow hover:shadow-lg transition-all duration-300">
            <h1 className="text-2xl font-bold mb-4 text-gray-900">
              Nouveau séjour disponible !
            </h1>
            <p className="text-gray-700 mb-6">
              Le séjour <span className="font-semibold">My Creative Surf Camp</span> est désormais ouvert aux réservations sur plusieurs dates. Découvrez dès maintenant cette expérience unique sur les plus belles vagues.
            </p>
            <div className="inline-block bg-gray-800 text-white px-6 py-2 rounded hover:bg-gray-900 transition">
              Découvrir le séjour
            </div>
          </div>
        </Link>

        {/* Colonne droite : Annonce du Pass Colo */}
        <div
          onClick={openModal}
          className="cursor-pointer p-6 bg-white border border-gray-200 rounded-lg shadow hover:shadow-lg transition-all duration-300"
        >
          <h1 className="text-2xl font-bold mb-4 text-gray-900">
            Nouveau : Pass Colo
          </h1>
          <p className="text-gray-700 mb-6">
            Bénéficiez d’une aide pouvant aller jusqu’à 350 € pour votre enfant éligible. Vérifiez rapidement votre éligibilité et profitez d’un tarif avantageux pour partir en colonie.
          </p>
          <div className="inline-block bg-gray-800 text-white px-6 py-2 rounded hover:bg-gray-900 transition">
            En savoir plus
          </div>
        </div>
      </div>

      {/* Modale pour le Pass Colo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white max-w-3xl w-full p-6 rounded-lg shadow-lg relative">
            <button
              onClick={closeModal}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 text-3xl"
            >
              &times;
            </button>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">
              Présentation du Pass Colo
            </h2>
            <div className="text-gray-800 text-sm leading-relaxed space-y-4">
              <p>
                Le Pass Colo est une aide financière destinée à réduire le coût des séjours en colonie. En fonction de votre situation (allocataire CAF, adhérent MSA ou autre), vous pouvez bénéficier d’une réduction pouvant aller jusqu’à 350 €.
              </p>
              <p>
                Pour connaître l’ensemble des modalités, veuillez consulter le guide officiel accessible via le lien suivant&nbsp;:
                <a
                  href="https://www.jeunes.gouv.fr/le-pass-colo-en-3-etapes-2106"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline ml-1"
                >
                  Le Pass Colo en 3 étapes
                </a>.
              </p>
              <p>
                Pour plus d'informations, n'hésitez pas à nous contacter.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Section Instagram Reel & Explication (Disposition Horizontale) */}
     
    </div>
  );
}

 <div className="mt-12 grid grid-cols-1 md:grid-cols-3">
   {/* Colonne 1 : Reel 1 */}
   
   {/* Colonne 2 : Reel 2 */}
   <div className="flex justify-center">
     <iframe
       src="https:www.instagram.com/p/DBg_7W0ojbf/embed"
       width="375"
       height="600"
       frameBorder="0"
       scrolling="no"
       allowTransparency="true"
       className="rounded-lg shadow-lg p-1"
     ></iframe>
   </div>
   {/* Colonne 3 : Texte explicatif */}
   <div className="pl-6 flex flex-col justify-start items-start">
     <h1 className="text-xl font-bold mb-4">
       Comprendre nos séjours en 30 secondes
     </h1>
     <p className="text-gray-700 mb-4">
       Découvrez les 4 axes qui font toute la force de nos séjours :
     </p>
     <ul className="list-disc list-inside space-y-2 text-gray-700">
       <li>
         <strong>Activités stimulantes :</strong> des programmes ludiques, culturels et sportifs qui éveillent la curiosité.
       </li>
       <li>
         <strong>Hébergement de qualité :</strong> des lieux confortables pour se reposer et se ressourcer.
       </li>
       <li>
         <strong>Encadrement professionnel :</strong> une équipe d’animateurs expérimentés pour assurer sécurité et bien-être.
       </li>
       <li>
         <strong>Organisation logistique :</strong> des trajets et des plannings optimisés pour une expérience sans stress.
       </li>
     </ul>
   </div>
 </div>
