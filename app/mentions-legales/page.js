import Link from "next/link";
export default function Page() {
  return (
    <main className="mx-auto max-w-3xl p-6 md:p-8 text-gray-800 leading-relaxed">
      <h1 className="text-2xl font-bold mb-4">Mentions Légales</h1>

      {/* 1. IDENTITÉ DE L’ÉDITEUR */}
      <section className="mt-6">
        <h2 className="text-xl font-semibold mb-3">Éditeur du site</h2>
        <p className="mb-2">
          Le présent site est édité par <strong>l’Association ColoCrew</strong>,
          régie par la loi de 1901.
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>Dénomination : Association ColoCrew</li>
          <li>Adresse : 1 rue Magenta, 93500 Pantin, France</li>
          <li>RNA : W931028397</li>
          <li>ORG : 093ORG0470</li>
          <li>SIRET : 93217143200010</li>
          <li>Téléphone : 01 84 21 02 30</li>
          <li>
            E-mail :{" "}
            <a
              href="mailto:info@colocrew.com"
              className="text-blue-600 hover:underline"
            >
              info@colocrew.com
            </a>
          </li>
        </ul>
      </section>

      {/* 2. RESPONSABLE DE LA PUBLICATION */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">
          Responsable de la publication
        </h2>
        <p>
          Le Responsable de la publication est <strong>Dreyer William</strong>,
          en qualité de représentant de l’Association ColoCrew. Il peut être
          contacté aux coordonnées indiquées ci-dessus.
        </p>
        <a
          href="mailto: w.dreyer@colocrew.com"
          className="text-blue-600 hover:underline"
        >
          w.dreyer@colocrew.com
        </a>
      </section>

      {/* 3. HÉBERGEUR */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">Hébergeur du site</h2>
        <p>Le site est hébergé par :</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>OVH</li>
          <li>2 rue Kellermann, 59100 Roubaix, France</li>
          <li>Téléphone : 1007 (depuis la France)</li>
          <li>
            Site Web :{" "}
            <a
              href="https://www.ovh.com"
              className="text-blue-600 hover:underline"
            >
              www.ovh.com
            </a>
          </li>
        </ul>
      </section>

      {/* 4. OBJET / ACTIVITÉS DE COLOCREW */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">
          Activités de l’Association
        </h2>
        <p>
          L’Association ColoCrew organise et propose des séjours, colonies de
          vacances et activités ludiques ou éducatives à destination des enfants
          et adolescents.
        </p>
      </section>

      {/* 5. PROPRIÉTÉ INTELLECTUELLE */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">Propriété intellectuelle</h2>
        <p>
          Tous les éléments figurant sur le présent site (textes, images, logos,
          vidéos, graphismes, icônes, etc.) sont protégés par les dispositions
          du Code de la propriété intellectuelle. Ils sont la propriété
          exclusive de l’Association ColoCrew, sauf mention contraire. Toute
          reproduction, représentation, modification, publication, transmission
          ou dénaturation du site et/ou de son contenu, totale ou partielle, par
          quelque procédé que ce soit, sans l’autorisation expresse et préalable
          de l’Association ColoCrew est interdite.
        </p>
      </section>

      {/* 6. DONNÉES PERSONNELLES & RGPD */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">
          Données personnelles &amp; RGPD
        </h2>
        <p className="mb-4">
          Conformément au Règlement Général sur la Protection des Données (RGPD)
          et à la loi Informatique et Libertés, l’Association ColoCrew s’engage
          à préserver la confidentialité des informations fournies en ligne par
          l’utilisateur. Toutes les informations personnelles que l’utilisateur
          serait amené à transmettre à l’Association ColoCrew sont soumises aux
          dispositions de la loi n°78-17 « Informatique et Libertés » du 6
          janvier 1978 modifiée et du RGPD (UE 2016/679).
        </p>
        <p className="mb-4">
          À ce titre, l’utilisateur dispose d’un droit d’accès, de
          rectification, de suppression et de portabilité de ses données
          personnelles, ainsi qu’un droit d’opposition au traitement. Pour
          l’exercer, il suffit d’envoyer une demande écrite à l’adresse e-mail :{" "}
          <a
            href="mailto:info@colocrew.com"
            className="text-blue-600 hover:underline"
          >
            info@colocrew.com
          </a>
          .
        </p>
        <p>
          Pour plus de détails, veuillez consulter notre
          <Link
            href="/rgpd.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block  text-black font-semibold py-2 px-4 rounded"
          >
            Politique de Confidentialité (RGPD).
          </Link>
        </p>
      </section>

      {/* 7. RESPONSABILITÉ & LIENS EXTERNES */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">Responsabilité</h2>
        <p className="mb-4">
          L’Association ColoCrew s’efforce d’assurer l’exactitude et la mise à
          jour des informations diffusées sur le site. Toutefois, elle ne peut
          garantir l’exhaustivité ou l’absence de modification par un tiers
          (intrusion, virus). L’Association ColoCrew ne saurait être tenue pour
          responsable de tout dommage, direct ou indirect, pouvant résulter de
          l’accès et de l’utilisation de ce site ou des informations qu’il
          contient.
        </p>
        <p>
          Les liens hypertextes présents sur le site et pointant vers des sites
          externes n’engagent pas la responsabilité de l’Association ColoCrew
          quant au contenu de ces sites tiers. Les utilisateurs sont invités à
          consulter les politiques de confidentialité et les conditions
          générales de chaque site externe visité.
        </p>
      </section>

      {/* 8. MÉDIATION DE LA CONSOMMATION (SI APPLICABLE) */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-3">
          Médiation de la consommation
        </h2>
        <p>
          Conformément aux articles L611-1 et suivants du Code de la
          consommation, le consommateur a la possibilité de recourir
          gratuitement à un médiateur de la consommation en vue de la résolution
          amiable de tout litige l’opposant à l’Association ColoCrew.
          <br />
          {/* 
              - Soit vous insérez les coordonnées du médiateur si vous y avez adhéré
              - Soit vous indiquez la procédure pour trouver un médiateur 
            */}
          <em>
            (Vous pouvez ici préciser le nom du médiateur dont vous dépendez ou
            la plateforme nationale de médiation. Ex: “Le consommateur peut
            soumettre son litige à XXX - www.mediation-conso.fr”)
          </em>
        </p>
      </section>

      {/* 9. CONTACT */}
      <section className="mt-8 border-t pt-4">
        <h2 className="text-lg font-semibold mb-2">Contact</h2>
        <p className="mb-2">
          Pour toute question concernant ces mentions légales, vous pouvez nous
          contacter :
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            Par e-mail :{" "}
            <a
              href="mailto:info@colocrew.com"
              className="text-blue-600 hover:underline"
            >
              info@colocrew.com
            </a>
          </li>
          <li>
            Par téléphone :{" "}
            <a href="tel:0184210230" className="text-blue-600 hover:underline">
              01 84 21 02 30
            </a>
          </li>
        </ul>
      </section>
    </main>
  );
}
