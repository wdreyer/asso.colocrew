export default function Page() {
    return (
      <main className="mx-auto max-w-3xl p-6 md:p-8 text-gray-800 leading-relaxed">
        <h1 className="text-2xl font-bold mb-4">
          Politique de Confidentialité – RGPD
        </h1>
  
        <p className="mb-4">
          La présente Politique de Confidentialité décrit la manière dont l’Association&nbsp;
          <strong>ColoCrew</strong> (ci-après « ColoCrew », « nous » ou « notre ») collecte, 
          utilise et protège les données personnelles des utilisateurs lors de leur visite 
          ou de leur utilisation de nos services en ligne, conformément au Règlement Général 
          sur la Protection des Données (RGPD) et à la loi Informatique et Libertés.
        </p>
  
        {/* 1. COLLECTE DE DONNÉES */}
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-3">1. Collecte de données personnelles</h2>
          <p className="mb-4">
            Nous collectons des données personnelles lors de l’inscription, de la 
            demande de renseignements, ou de la participation aux séjours et événements 
            que nous organisons. Les données que nous pouvons collecter incluent&nbsp;:
          </p>
          <ul className="list-disc list-inside space-y-1 mb-4">
            <li>Nom, prénom, date de naissance</li>
            <li>Coordonnées (adresse, e-mail, numéro de téléphone)</li>
            <li>Informations liées à la santé, si nécessaire (ex. allergies, régimes alimentaires) 
              afin de garantir la sécurité et le bien-être des participants</li>
            <li>Informations de facturation et de paiement (ex. relevé d’identité bancaire si mandat SEPA)</li>
          </ul>
          <p>
            Nous veillons à ne collecter que les données strictement nécessaires à la réalisation 
            de nos missions et au respect de nos obligations légales et réglementaires.
          </p>
        </section>
  
        {/* 2. FINALITÉS DU TRAITEMENT */}
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-3">2. Finalités du traitement</h2>
          <p className="mb-4">
            Vos données personnelles sont collectées et traitées afin de&nbsp;:
          </p>
          <ul className="list-disc list-inside space-y-1 mb-4">
            <li>Organiser et gérer les séjours, colonies de vacances et autres activités proposées 
                par l’association</li>
            <li>Gérer les inscriptions, la facturation, les paiements et la comptabilité</li>
            <li>Gérer la relation avec les familles, les participants et les partenaires</li>
            <li>Assurer votre sécurité (informations médicales pertinentes)</li>
            <li>Respecter nos obligations légales, réglementaires et associatives (notamment 
                liées à notre agrément et à notre RNA)</li>
          </ul>
        </section>
  
        {/* 3. BASE LÉGALE */}
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-3">3. Base légale du traitement</h2>
          <p className="mb-4">
            Selon le RGPD, le traitement de vos données personnelles repose sur plusieurs bases 
            légales, dont&nbsp;:
          </p>
          <ul className="list-disc list-inside space-y-1 mb-4">
            <li>
              Votre consentement préalable pour certaines opérations (ex. envoi d’informations 
              marketing, newsletter, etc.).
            </li>
            <li>
              L’exécution d’un contrat ou de mesures précontractuelles (ex. la gestion de 
              vos réservations ou de vos inscriptions).
            </li>
            <li>
              Le respect d’obligations légales ou réglementaires.
            </li>
          </ul>
        </section>
  
        {/* 4. DURÉE DE CONSERVATION */}
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-3">4. Durée de conservation</h2>
          <p>
            Nous conservons vos données personnelles uniquement pendant la durée nécessaire 
            à la réalisation des finalités décrites ci-dessus, ou pour satisfaire à nos obligations 
            légales ou réglementaires. Au-delà de cette durée, vos données seront archivées, 
            anonymisées ou supprimées.
          </p>
        </section>
  
        {/* 5. DESTINATAIRES DES DONNÉES */}
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-3">5. Destinataires des données</h2>
          <p className="mb-4">
            Vos données personnelles sont destinées exclusivement aux services internes de 
            ColoCrew en charge de la gestion et de l’organisation des séjours. Toutefois, 
            elles peuvent être transmises à des tiers dans les cas suivants&nbsp;:
          </p>
          <ul className="list-disc list-inside space-y-1 mb-4">
            <li>
              Aux prestataires et sous-traitants intervenant pour le compte de ColoCrew 
              (ex. hébergement, services de paiement, assurances).
            </li>
            <li>
              Aux autorités administratives ou judiciaires, conformément à la loi.
            </li>
          </ul>
        </section>
  
        {/* 6. SÉCURITÉ DES DONNÉES */}
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-3">6. Sécurité des données</h2>
          <p>
            Nous mettons en œuvre les mesures techniques et organisationnelles appropriées 
            pour protéger vos données personnelles contre toute destruction, perte, altération, 
            divulgation ou accès non autorisé. L’accès à vos données est strictement limité 
            aux personnes habilitées et tenues à une obligation de confidentialité.
          </p>
        </section>
  
        {/* 7. DROITS DES UTILISATEURS */}
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-3">7. Vos droits</h2>
          <p className="mb-4">
            Conformément au RGPD et à la loi Informatique et Libertés, vous disposez des droits 
            suivants sur vos données&nbsp;:
          </p>
          <ul className="list-disc list-inside space-y-1 mb-4">
            <li><strong>Droit d’accès</strong> : obtenir la confirmation que vos données sont 
                ou ne sont pas traitées et en recevoir une copie.</li>
            <li><strong>Droit de rectification</strong> : demander la correction de données 
                inexactes ou incomplètes.</li>
            <li><strong>Droit à l’effacement</strong> : demander la suppression de vos données, 
                sous réserve de nos obligations légales.</li>
            <li><strong>Droit à la limitation</strong> : demander la suspension du traitement 
                de vos données dans certains cas.</li>
            <li><strong>Droit à la portabilité</strong> : recevoir vos données personnelles 
                dans un format structuré et courant.</li>
            <li><strong>Droit d’opposition</strong> : vous opposer à tout moment au traitement 
                de vos données, pour des raisons tenant à votre situation particulière.</li>
            <li><strong>Droit de retirer votre consentement</strong> : lorsque le traitement 
                est fondé sur votre consentement, vous pouvez le retirer à tout moment.</li>
          </ul>
          <p>
            Pour exercer ces droits, vous pouvez nous contacter par e-mail à l’adresse&nbsp;:
            <a 
              href="mailto:info@colocrew.com" 
              className="text-blue-600 hover:underline ml-1"
            >
              info@colocrew.com
            </a>
            .  
          </p>
        </section>
  
        {/* 8. COOKIES */}
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-3">8. Cookies et traceurs</h2>
          <p className="mb-4">
            Nous utilisons éventuellement des cookies ou traceurs pour améliorer votre 
            expérience de navigation, mesurer l’audience du site ou encore proposer des 
            contenus adaptés à vos centres d’intérêt. Vous pouvez configurer votre navigateur 
            pour refuser les cookies ou être alerté lorsque des cookies sont envoyés. 
            Le refus des cookies peut cependant impacter le bon fonctionnement de certaines 
            fonctionnalités du site.
          </p>
        </section>
  
        {/* 9. MISE À JOUR DE LA POLITIQUE */}
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-3">9. Mise à jour de la Politique</h2>
          <p>
            Nous pouvons être amenés à modifier cette Politique de Confidentialité pour 
            refléter les évolutions législatives ou réglementaires, ou encore les 
            modifications de nos pratiques. Nous vous encourageons à la consulter régulièrement.
          </p>
        </section>
  
        {/* 10. CONTACT */}
        <section className="mt-8 border-t pt-4">
          <h2 className="text-xl font-semibold mb-3">10. Contact</h2>
          <p className="mb-4">
            Pour toute question ou demande concernant la protection de vos données, 
            vous pouvez nous contacter à l’adresse : 
            <a 
              href="mailto:info@colocrew.com" 
              className="text-blue-600 hover:underline ml-1"
            >
              info@colocrew.com
            </a> 
            ou par téléphone au&nbsp;:
            <a 
              href="tel:0184210230" 
              className="text-blue-600 hover:underline ml-1"
            >
              01 84 21 02 30
            </a>.
          </p>
        </section>
      </main>
    );
  }
  