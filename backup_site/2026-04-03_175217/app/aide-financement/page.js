"use client";

import { useState } from "react";
import Image from "next/image";

export default function AideFinancementPage() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    message: "",
  });

  // États pour l'accordéon des sections
  const [isPassColoOpen, setIsPassColoOpen] = useState(false);
  const [isAVEOpen, setIsAVEOpen] = useState(false);
  const [isVacancesApprenantesOpen, setIsVacancesApprenantesOpen] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
  
    try {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Ici on mappe bien les champs du formulaire aux clés attendues par l'API
        body: JSON.stringify({
          formType: "contact",
          nom: formData.lastName,       // Assurez-vous que formData.lastName est rempli
          prenom: formData.firstName,     // Idem pour formData.firstName
          email: formData.email,
          telephone: formData.phone,      // Et pour formData.phone
          message: formData.message,
        }),
      });
  
      if (!response.ok) {
        throw new Error("Erreur lors de l'envoi du mail");
      }
  
      const data = await response.json();
      console.log("Formulaire envoyé :", data);
      alert("Votre demande a été envoyée !");
      
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        message: "",
      });
    } catch (error) {
      console.error("Erreur lors de l'envoi:", error);
      alert("Une erreur est survenue lors de l'envoi de votre demande, veuillez réessayer.");
    }
  };
  

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header simple */}
        <div className="container mx-auto px-4 flex flex-col items-center">
          <h1 className="mt-4 text-4xl font-bold text-gray-800">
            Aide & Financement
          </h1>
        </div>

      {/* Contenu principal */}
      <main className="container mx-auto px-4 py-12 space-y-12">
        {/* Accordéon des 3 aides */}
        <div className="space-y-8">
          {/* PASS COLO */}
          <div className="rounded-lg shadow-md bg-white">
            <button
              onClick={() => setIsPassColoOpen(!isPassColoOpen)}
              className="w-full flex items-center justify-between p-4 focus:outline-none"
            >
              <div className="flex items-center space-x-4">
                <Image
                  src="/passcolo.png"
                  alt="Logo Pass Colo"
                  width={40}
                  height={40}
                />
                <h2 className="text-2xl font-bold text-gray-800">
                  Pass Colo
                </h2>
              </div>
              <span className="text-2xl">
                {isPassColoOpen ? "−" : "+"}
              </span>
            </button>
            {isPassColoOpen && (
              <div className="p-4 pt-0 text-lg text-gray-700">
                <p className="mb-4">
                  En fonction de votre situation, allocataire CAF, adhérent MSA ou bien dans une autre situation, voici les 3 étapes à suivre pour vérifier votre éligibilité et bénéficier du Pass colo.
                </p>
                <p className="mb-6">
                  Votre enfant est né(e) en 2014, il/elle souhaite partir en colonie de vacances et votre quotient familial est égal ou inférieur à 1500€.
                </p>
                <p className="mb-6">
                  En fonction de votre situation, voici les 3 étapes à suivre pour pouvoir bénéficier du Pass colo :
                </p>
                <div className="mb-8">
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">
                    Je suis allocataire CAF ou adhérent MSA
                  </h3>
                  <ol className="list-decimal list-inside space-y-2">
                    <li>
                      J'ai reçu une notification indiquant mon éligibilité au Pass colo. A partir du 10 février, je reçois une notification m'indiquant mon éligibilité et le montant du Pass colo sur mon espace privé, soit de ma caisse d'allocations familiales (Caf) <span className="font-semibold">"mon-compte"</span> soit de la Mutualité sociale agricole (MSA) <span className="font-semibold">"mon espace privé"</span> en fonction de mon rattachement.
                    </li>
                    <li>
                      Je contacte l'organisateur de la colo pour connaître les modalités du séjour et le prix. Je consulte le catalogue des colos éligibles au Pass colo.
                    </li>
                    <li>
                      J'inscris mon enfant en colo auprès de l'organisateur. Le montant du Pass colo est automatiquement déduit du coût du séjour par l'organisateur.
                    </li>
                  </ol>
                </div>
                <p className="font-semibold">
                  Et rappelez-vous, le Pass colo est cumulable avec les autres aides !
                </p>
                <p className="mt-2">
                  <a
                    href="https://www.jeunes.gouv.fr/passcolo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#B8336A] font-semibold underline"
                  >
                    En savoir plus sur le Pass colo
                  </a>
                </p>
              </div>
            )}
          </div>

          {/* AVE (section inchangée) */}
          <div className="rounded-lg shadow-md bg-white">
            <button
              onClick={() => setIsAVEOpen(!isAVEOpen)}
              className="w-full flex items-center justify-between p-4 focus:outline-none"
            >
              <div className="flex items-center space-x-4">
                <Image
                  src="/ave.png"
                  alt="Logo AVE"
                  width={40}
                  height={40}
                />
                <h2 className="text-2xl font-bold text-gray-800">AVE</h2>
              </div>
              <span className="text-2xl">{isAVEOpen ? "−" : "+"}</span>
            </button>
            {isAVEOpen && (
              <div className="p-4 pt-0 text-lg text-gray-700">
                <p className="mb-4">
                  Certaines caisses d'allocations familiales (Caf) ou mutualités sociales agricoles (MSA) accordent à leurs allocataires une aide financière pour les vacances. Cette aide, appelée Aide aux vacances pour les enfants ou les familles (AVE et AVF), prend partiellement en charge les frais d'un séjour de vacances pour votre enfant ou pour votre famille. Pour bénéficier de cette aide, vous devez notamment percevoir une prestation familiale de la Caf ou MSA.
                </p>
                <p className="mb-4">
                  Qu'est-ce que l'AVE ? Votre Caf ou MSA peut vous accorder l'AVE pour réduire le montant des frais de séjour de votre enfant. Le séjour doit être choisi parmi les centres de vacances labellisés Vacaf dans toute la France ou à l'étranger. Un outil de recherche permet de faire ce choix : Rechercher des offres de séjours de vacances par département. Il peut s'agir d'un séjour linguistique, sportif, artistique ou culturel. Le séjour de votre enfant est possible uniquement pendant les vacances scolaires. La durée du séjour est en général de 14 nuitées maximum, 1 seule fois dans l'année.
                </p>
                <p className="mb-4">
                  Qui est concerné par l'AVE ? Pour pouvoir bénéficier de l'AVE, vous devez respecter les 3 conditions suivantes : percevoir une prestation familiale versée par la Caf ou la MSA, avoir un ou plusieurs enfants et avoir un quotient familial généralement inférieur ou égal à 700€.
                </p>
                <p className="mb-4">
                  Comment est calculée l'AVE ? Avec l'AVE, votre Caf ou MSA peut prendre en charge 40 % à 70 % du coût du séjour de votre enfant en fonction de votre quotient familial. Par exemple, si le séjour de votre enfant est de 700€ et que l'AVE est de 40 %, il restera 420€ à votre charge.
                </p>
                <p className="mb-4">
                  Comment bénéficier de l'AVE ? Si vous avez droit à cette aide, votre Caf ou MSA vous en informe durant le 1er trimestre de l'année par un courrier postal ou électronique indiquant la nature de vos droits pour votre famille.
                </p>
                <p className="mb-4">
                  Pour réserver votre séjour, choisissez parmi les centres Vacaf et suivez les instructions du centre de vacances pour déduire automatiquement le montant de l'AVE.
                </p>
                <p className="font-semibold">
                  Note : Dossier en attente de validation.
                </p>
                <p className="mt-2">
                  <a
                    href="https://www.service-public.fr/particuliers/vosdroits/F2038"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#B8336A] font-semibold underline"
                  >
                    En savoir plus sur l'AVE
                  </a>
                </p>
              </div>
            )}
          </div>

          {/* VACANCES APPRENANTES (section inchangée) */}
          <div className="rounded-lg shadow-md bg-white">
            <button
              onClick={() => setIsVacancesApprenantesOpen(!isVacancesApprenantesOpen)}
              className="w-full flex items-center justify-between p-4 focus:outline-none"
            >
              <div className="flex items-center space-x-4">
                <Image
                  src="/vacances.jpg"
                  alt="Logo Vacances Apprenantes"
                  width={40}
                  height={40}
                />
                <h2 className="text-2xl font-bold text-gray-800">Vacances Apprenantes</h2>
              </div>
              <span className="text-2xl">
                {isVacancesApprenantesOpen ? "−" : "+"}
              </span>
            </button>
            {isVacancesApprenantesOpen && (
              <div className="p-4 pt-0 text-lg text-gray-700">
                <p className="mb-4">
                  Les vacances apprenantes ont pour objectifs d’assurer la consolidation des apprentissages et de contribuer à l’épanouissement personnel des jeunes à travers des activités culturelles, sportives et de loisirs, encadrées par des professionnels.
                </p>
                <p className="mb-4">
                  L'opération vacances apprenantes repose sur plusieurs dispositifs allant de l'École ouverte à des séjours en colonies de vacances. Les points communs ? Le renforcement des apprentissages, la culture, le sport et le développement durable.
                </p>
                <p className="font-semibold">
                  Note : Dossier en attente de validation.
                </p>
                <p className="mt-2">
                  <a
                    href="https://www.education.gouv.fr/les-vacances-apprenantes-303834"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#B8336A] font-semibold underline"
                  >
                    En savoir plus sur Vacances Apprenantes
                  </a>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Formulaire d'éligibilité discret */}
        <section className="mt-12 bg-white p-6 rounded-lg shadow-md mx-auto">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            Pensez-vous être éligible ?
          </h2>
          <p className="text-gray-700 text-base mb-4">
            Si vous pensez répondre aux critères pour bénéficier d'une aide, remplissez ce formulaire et nous vous contacterons rapidement.
          </p>
          <p className="text-gray-700 text-base mb-4">
            Pour toute demande d'information, contactez le : <span className="font-semibold">01 84 21 02 30</span>
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-gray-700 font-semibold mb-1">
                  Prénom
                </label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                  required
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-gray-700 font-semibold mb-1">
                  Nom
                </label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="email" className="block text-gray-700 font-semibold mb-1">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                  required
                />
              </div>
              <div>
                <label htmlFor="phone" className="block text-gray-700 font-semibold mb-1">
                  Téléphone
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                />
              </div>
            </div>
            <div>
              <label htmlFor="message" className="block text-gray-700 font-semibold mb-1">
                Votre message
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                rows="3"
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                placeholder="Expliquez-nous votre situation..."
              ></textarea>
            </div>
            <div className="flex flex-row justify-end items-end">
            <button
              type="submit"
              className=" font-poppins cursor-pointer bg-[#B8336A] text-l text-white px-4 py-2 rounded-md hover:bg-[#A2225A] transition duration-300 "
            >
              Envoyer ma demande
            </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
