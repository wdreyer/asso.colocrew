import Link from "next/link";
import StaticPageFirebase from "../components/layout/StaticPageFirebase";

export default function Page() {
  return (
    <StaticPageFirebase
      path="/conditions-generales-de-ventes"
      fallbackTitle="Conditions générales de vente"
      fallbackSubtitle="Règles de réservation, paiement, annulation et cadre contractuel des séjours ColoCrew."
      fallbackHeroImage=""
      eyebrow="Légal"
    >
      <div className="mx-auto max-w-3xl text-gray-800 leading-relaxed">

      <p>
        Ces conditions générales de vente sont susceptibles d’évoluer. Le client en sera notifié via e-mail et sur le site internet. En cas de modifications, le client devra à nouveau signer les nouvelles Conditions Générales de Vente.
      </p>

      {/* ARTICLE 1 */}
      <section className="mt-6">
        <h2 className="text-xl font-semibold mb-3">Article 1 - Engagement de ColoCrew</h2>
        <ul className="list-disc list-inside mb-4 space-y-1">
          <li>
            ColoCrew s’engage à prendre en charge l’enfant dès sa dépose effectuée par les responsables légaux le premier jour, et ce, jusqu’à son retour le dernier jour du séjour.
          </li>
          <li>
            La restauration est assurée avec la fourniture de <strong>4 repas par jour</strong> durant toute la durée du séjour.
          </li>
          <li>
            L’accès à l’ensemble des activités prévues dans le catalogue est garanti.
          </li>
        </ul>
        <p className="mb-4">
          De plus, ColoCrew met tout en œuvre pour garantir la sécurité et le bien-être des participants en assurant un encadrement par un personnel qualifié et en appliquant des protocoles de sécurité appropriés.
        </p>
        <p>
          Il est recommandé aux responsables légaux de communiquer toute information spécifique (allergies, besoins particuliers, etc.) afin d’assurer une prise en charge adaptée.
        </p>
      </section>

      {/* ARTICLE 2 */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">Article 2 - Paiement par Carte Bancaire (CB)</h2>

        <h3 className="text-lg font-semibold mb-2">1. Réservation et paiement :</h3>
        <ul className="list-disc list-inside mb-4 space-y-1">
          <li>
            Le paiement intégral du montant du séjour doit être effectué au moment de la réservation, exclusivement par carte bancaire.
          </li>
          <li>
            Le règlement est géré par nos partenaires Stripe et Karna. Pour plus d’informations sur la sécurité des paiements, consultez&nbsp;
            <a
              href="https://stripe.com/fr/docs/security"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#A45A86] underline underline-offset-2 transition hover:text-[#8F4F76]"
            >
              la page de sécurité de Stripe
            </a>
            <span> et  </span>
            <a
              href="https://www.klarna.com/fr/politique-de-protection-de-lacheteur-klarna/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#A45A86] underline underline-offset-2 transition hover:text-[#8F4F76]"
            >
              de Klarna
            </a>
          </li>
          <li>
            <span className="font-bold">Le paiement en 3 fois sans frais</span> est également possible : lors de votre paiement par CB, vous devrez choisir <span className="font-bold">KLARNA</span> sur la page de paiement.
          </li>
        </ul>

        <h3 className="text-lg font-semibold mb-2">2. Conditions d’annulation (sans souscription à l’assurance facultative) :</h3>
        <ul className="list-disc list-inside mb-4 space-y-1">
          <li>
            Jusqu’à 90 jours avant le début du séjour : remboursement intégral du montant versé, déduction faite de 80 € de frais de dossier.
          </li>
          <li>
            Entre 45 et 90 jours avant le début du séjour : remboursement de 50 % du montant versé.
          </li>
          <li>
            Moins de 45 jours avant le début du séjour : aucun remboursement.
          </li>
        </ul>

        <h3 className="text-lg font-semibold mb-2">3. Assurance annulation facultative (Maif) :</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>
            Il est possible pour chaque participant de souscrire à l’annulation facultative pour le montant de 58,86€ TTC&nbsp;
            <Link
              href="/AssuranceAnnulationMaif.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-black font-semibold py-2 px-4 rounded"
            >
              Voir document ci-joint
            </Link>
          </li>
          <li>
            Si vous ne souscrivez pas l’assurance annulation facultative, aucun remboursement ne sera effectué en dehors des conditions ci-dessus.
          </li>
          <li>
            Pour toute demande d’annulation ne rentrant pas dans les cas et délais spécifiés, veuillez vous rapprocher de la Maif pour vérifier la prise en charge éventuelle.
          </li>
        </ul>
        <p className="mt-4 italic">
          Important : Sans assurance annulation souscrite auprès de la Maif, aucun remboursement ne pourra être effectué en dehors des délais et pourcentages indiqués.
        </p>
      </section>

      {/* ARTICLE 3 */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">Article 3 - Paiement par Chèque ou Virement</h2>

        <h3 className="text-lg font-semibold mb-2">1. Réservation et paiement :</h3>
        <ul className="list-disc list-inside mb-4 space-y-1">
          <li>
            Le paiement intégral du montant du séjour doit être effectué au moment de la réservation, exclusivement par chèque ou virement.
          </li>
          <li>
            En cas de règlement par chèque ou virement bancaire, vous disposez d’un délai de <strong>15 jours</strong> à compter de l’inscription pour que le paiement soit reçu. À défaut, l’inscription sera annulée.
          </li>
        </ul>

        <h3 className="text-lg font-semibold mb-2">2. Conditions d’annulation (sans souscription à l’assurance facultative) :</h3>
        <ul className="list-disc list-inside mb-4 space-y-1">
          <li>
            Jusqu’à 90 jours avant le début du séjour : remboursement intégral du montant versé, déduction faite de 80 € de frais de dossier.
          </li>
          <li>
            Entre 45 et 90 jours avant le début du séjour : remboursement de 50 % du montant versé.
          </li>
          <li>
            Moins de 45 jours avant le début du séjour : aucun remboursement.
          </li>
        </ul>

        <h3 className="text-lg font-semibold mb-2">3. Assurance annulation facultative (Maif) :</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>
            Il est possible pour chaque participant de souscrire à l’annulation facultative pour le montant de 58,86€ TTC&nbsp;
            <Link
              href="/AssuranceAnnulationMaif.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-black font-semibold py-2 px-4 rounded"
            >
              Voir document ci-joint
            </Link>
          </li>
          <li>
            Si vous ne souscrivez pas l’assurance annulation facultative, aucun remboursement ne sera effectué en dehors des conditions ci-dessus.
          </li>
          <li>
            Pour toute demande d’annulation ne rentrant pas dans les cas et délais spécifiés, veuillez vous rapprocher de la Maif pour vérifier la prise en charge éventuelle.
          </li>
        </ul>
        <p className="mt-4 italic">
          Important : Sans assurance annulation souscrite auprès de la Maif, aucun remboursement ne pourra être effectué en dehors des délais et pourcentages indiqués.
        </p>
      </section>

      {/* ARTICLE 4 */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">Article 4 – Annulation par l’association ColoCrew</h2>
        <ul className="list-disc list-inside mb-4 space-y-1">
          <li>
            ColoCrew se réserve le droit d’annuler un séjour pour les raisons suivantes :
            <ul className="list-disc list-inside ml-6 space-y-1 mt-1">
              <li>Nombre insuffisant de participants.</li>
              <li>Conditions climatiques mettant en danger la sécurité des participants.</li>
              <li>Autres raisons imprévues ou cas de force majeure.</li>
            </ul>
          </li>
          <li>
            En cas d’annulation par ColoCrew, un remboursement total sera effectué dans un délai d’un mois après l’annonce de l’annulation.
          </li>
        </ul>
      </section>

      {/* ARTICLE 5 */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">Article 5 – Responsabilités des participants et des familles</h2>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>
            Les participants doivent respecter le règlement intérieur et les consignes de l’équipe d’encadrement.
          </li>
          <li>
            Toute infraction grave au règlement peut entraîner une exclusion du séjour, sans droit à remboursement.
          </li>
        </ul>
      </section>

      {/* ARTICLE 6 */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">Article 6 – Assurances</h2>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>
            ColoCrew souscrit une assurance responsabilité civile couvrant l’ensemble des séjours et activités.
          </li>
          <li>
            Il est fortement recommandé aux participants de souscrire une assurance annulation et rapatriement.
          </li>
        </ul>
      </section>

      {/* ARTICLE 7 */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">Article 7 – Modification des conditions</h2>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>
            ColoCrew se réserve le droit de modifier les présentes CGV. Les participants seront informés de toute modification par écrit ou via le site internet.
          </li>
        </ul>
      </section>

      {/* ARTICLE 8 */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">Article 8 – Litiges</h2>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>
            En cas de litige, les parties s’efforceront de trouver une solution amiable.
          </li>
          <li>
            À défaut d’accord, le litige sera porté devant les juridictions compétentes du ressort du tribunal de Saint-Denis.
          </li>
        </ul>
      </section>

      {/* ARTICLE 9 */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">Article 9 – Protection des données personnelles</h2>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>
            Les données personnelles collectées lors des inscriptions sont utilisées uniquement pour les besoins organisationnels et administratifs des séjours.
          </li>
          <li>
            Conformément à la loi, les participants disposent d’un droit d’accès, de rectification et de suppression de leurs données.
          </li>
        </ul>
      </section>

      {/* ARTICLE 10 */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">Article 10 – Droit de rétractation</h2>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>
            Conformément à l’article L221-28 du Code de la consommation et à la directive européenne 2011/83/UE, le droit de rétractation ne peut être exercé pour les contrats de prestation de services dont la date ou la période d’exécution est fixée, comme c’est le cas pour les séjours de vacances ou les colonies de vacances.
          </li>
          <li>
            Le client reconnaît expressément que, lors de la validation de sa réservation, il a renoncé à l’exercice de ce droit, en connaissance de cause.
          </li>
          <li>
            Cette information lui est communiquée préalablement à la conclusion du contrat, notamment via les présentes CGV et lors de la procédure de réservation.
          </li>
        </ul>
      </section>
      </div>
    </StaticPageFirebase>
  );
}

