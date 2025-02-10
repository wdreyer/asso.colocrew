import Link from "next/link";

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl p-6 md:p-8 text-gray-800 leading-relaxed">
      <h1 className="text-2xl font-bold mb-4">
        Conditions Générales de Vente – Association ColoCrew
      </h1>

      <p>
        Ces conditions générales de vente sont susceptibles d’évoluer. Le client
        en sera notifié via e-mail et sur le site internet. En cas de
        modifications, le client devra à nouveau signer les nouvelles Conditions
        Générales de Vente.
      </p>

      {/* ARTICLE 1 */}
      <section className="mt-6">
        <h2 className="text-xl font-semibold mb-3">
          Article 1 - Engagement de ColoCrew
        </h2>
        <ul className="list-disc list-inside mb-4 space-y-1">
          <li>
            ColoCrew s’engage à prendre en charge l’enfant dès sa dépose effectuée par
            les responsables légaux le premier jour, et ce, jusqu’à son retour le dernier
            jour du séjour.
          </li>
          <li>
            La restauration est assurée avec la fourniture de <strong>4 repas par jour</strong>
            durant toute la durée du séjour.
          </li>
          <li>
            L’accès à l’ensemble des activités prévues dans le catalogue est garanti.
          </li>
        </ul>
        <p className="mb-4">
          De plus, ColoCrew met tout en œuvre pour garantir la sécurité et le bien-être
          des participants en assurant un encadrement par un personnel qualifié et en appliquant
          des protocoles de sécurité appropriés.
        </p>
        <p>
          Il est recommandé aux responsables légaux de communiquer toute information
          spécifique (allergies, besoins particuliers, etc.) afin d’assurer une prise en charge
          adaptée.
        </p>
      </section>

      {/* ARTICLE 2 */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">
          Article 2 - Paiement en une fois
        </h2>

        <h3 className="text-lg font-semibold mb-2">
          1. Réservation et paiement :
        </h3>
        <ul className="list-disc list-inside mb-4 space-y-1">
          <li>
            Le paiement intégral du montant du séjour doit être effectué au moment de la réservation.
          </li>
          <li>
            En cas de règlement par chèque ou virement bancaire, le paiement doit être reçu dans un délai de 15 jours après l’inscription. À défaut, l’inscription sera annulée et une nouvelle demande devra être réalisée.
          </li>
        </ul>

        <h3 className="text-lg font-semibold mb-2">
          2. Conditions d’annulation (sans souscription à l’assurance facultative) :
        </h3>
        <ul className="list-disc list-inside mb-4 space-y-1">
          <li>
            Jusqu’à 90 jours avant le début du séjour : Remboursement intégral du montant versé, déduction faite de 80 € de frais de dossier.
          </li>
          <li>
            Entre 45 et 90 jours avant le début du séjour : Remboursement de 50 % du montant versé.
          </li>
          <li>
            Moins de 45 jours avant le début du séjour : Aucun remboursement.
          </li>
        </ul>

        <h3 className="text-lg font-semibold mb-2">
          3. Assurance annulation facultative (Maif) :
        </h3>
        <ul className="list-disc list-inside space-y-1">
          <li>
            Il est possible pour chaque participant de souscrire à l’annulation facultative pour le montant de 58,86€ TTC{" "}
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
            Pour toute demande d’annulation qui ne rentre pas dans les cas et délais spécifiés (par exemple annulation pour raison médicale en dehors des délais indiqués), il convient de se rapprocher de la Maif, si l’assurance a été souscrite, afin de vérifier la prise en charge éventuelle.
          </li>
        </ul>
        <p className="mt-4 italic">
          Important : Dans tous les cas, si vous n’avez pas souscrit l’assurance annulation auprès de la Maif, vous ne pourrez bénéficier d’aucun remboursement en dehors des délais et pourcentages de remboursement indiqués ci-dessus.
        </p>
      </section>

      {/* ARTICLE 3 */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">
          Article 3 - Paiement en deux fois
        </h2>

        <h3 className="text-lg font-semibold mb-2">
          1. Modalités de paiement :
        </h3>
        <ul className="list-disc list-inside mb-4 space-y-1">
          <li>
            Acompte de 30 % du montant total : à verser au moment de la réservation.
          </li>
          <li>
            Solde (70 %) : à régler au plus tard 3 mois (90 jours) avant le début du séjour.
          </li>
          <li>
            En cas de non-paiement du solde dans ce délai, l’inscription sera automatiquement annulée et aucun remboursement ne sera effectué.
          </li>
        </ul>

        <h3 className="text-lg font-semibold mb-2">
          2. Conditions d’annulation (sans souscription à l’assurance facultative) :
        </h3>
        <ul className="list-disc list-inside mb-4 space-y-1">
          <li>
            Jusqu’à 90 jours avant le début du séjour : Remboursement intégral des sommes versées, déduction faite de 80 € de frais de dossier.
          </li>
          <li>
            Entre 45 et 90 jours avant le début du séjour : Remboursement de 50 % des sommes versées.
          </li>
          <li>
            Moins de 45 jours avant le début du séjour : Aucun remboursement.
          </li>
          <li>
            Absence de paiement du solde à 90 jours : Annulation de plein droit et aucun remboursement.
          </li>
        </ul>

        <h3 className="text-lg font-semibold mb-2">
          3. Assurance annulation facultative (Maif) :
        </h3>
        <ul className="list-disc list-inside space-y-1">
          <li>
            Il est possible pour chaque participant de souscrire à l’annulation facultative pour le montant de 58,86€ TTC{" "}
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
            Pour toute demande d’annulation qui ne rentre pas dans les cas et délais spécifiés (par exemple annulation pour raison médicale en dehors des délais indiqués), il convient de se rapprocher de la Maif, si l’assurance a été souscrite, afin de vérifier la prise en charge éventuelle.
          </li>
        </ul>

        <p className="mt-4 italic">
          Important : Dans tous les cas, si vous n’avez pas souscrit l’assurance annulation auprès de la Maif, vous ne pourrez bénéficier d’aucun remboursement en dehors des délais et pourcentages de remboursement indiqués ci-dessus.
        </p>
      </section>

      {/* ARTICLE 4 */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">
          Article 4 – Annulation par l’association ColoCrew
        </h2>

        <ul className="list-disc list-inside mb-4 space-y-1">
          <li>
            ColoCrew se réserve le droit d’annuler un séjour pour les raisons suivantes :
            <ul className="list-disc list-inside ml-6 space-y-1 mt-1">
              <li>Nombre insuffisant de participants.</li>
              <li>
                Conditions climatiques mettant en danger la sécurité des participants.
              </li>
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
        <h2 className="text-xl font-semibold mb-3">
          Article 7 – Modification des conditions
        </h2>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>
            ColoCrew se réserve le droit de modifier les présentes CGV. Les participants seront informés de toute modification par écrit ou via le site internet.
          </li>
        </ul>
      </section>

      {/* ARTICLE 8 */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">
          Article 8 – Litiges
        </h2>
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
        <h2 className="text-xl font-semibold mb-3">
          Article 9 – Protection des données personnelles
        </h2>
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
        <h2 className="text-xl font-semibold mb-3">
          Article 10 – Droit de rétractation
        </h2>
        <ul className="list-disc list-inside space-y-1 mb-4">
          <li>
            Conformément à l’article L221-28 du Code de la consommation et à la directive européenne 2011/83/UE, le droit de rétractation ne peut être exercé pour les contrats de prestation de services dont la date ou la période d’exécution est fixée, comme c’est le cas pour les séjours de vacances ou les colonies de vacances.
          </li>
          <li>
            Le client reconnaît expressément que, lors de la validation de sa réservation, il a renoncé à l’exercice de ce droit, en connaissance de cause.
          </li>
          <li>
            Cette information lui est communiquée préalablement à la conclusion du contrat, notamment via les présentes Conditions Générales de Vente et lors de la procédure de réservation.
          </li>
        </ul>
      </section>
    </main>
  );
}
