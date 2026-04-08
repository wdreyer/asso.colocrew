import StaticPageShell from "../components/layout/StaticPageShell";

export default function QuiSommesNousPage() {
  return (
    <StaticPageShell
      title="Qui sommes-nous ?"
      subtitle="Un projet éducatif centré sur l'inclusivité, le sport et la créativité."
      heroImage=""
    >
      <div className="mx-auto max-w-4xl space-y-12 text-[#3c3156] leading-relaxed">
        <section className="space-y-4">
          <h2 className="text-2xl font-bold md:text-3xl">Notre approche</h2>
          <p>
            Colocrew est une association d'éducation populaire à but non lucratif. Nous organisons des colonies de
            vacances pour les 11-17 ans où le sport, l'art et l'émancipation sont au cœur de notre démarche.
            Nos séjours durent 12 jours, ce qui permet de créer une vraie dynamique de groupe, de favoriser
            l'épanouissement de chacun et de promouvoir la mixité sociale.
          </p>
          <p>
            Nos équipes sont composées d'animateurs et de formateurs passionnés qui partagent les mêmes convictions :
            bienveillance, inclusion et respect de l'environnement. Nous collaborons avec différents partenaires
            (mairies, ASE, CE...) pour rendre nos séjours accessibles au plus grand nombre.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold md:text-3xl">Nos valeurs</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Inclusivité :</strong> on accueille tout le monde, on lutte contre les discriminations et on
              mise sur la mixité sociale.
            </li>
            <li>
              <strong>Écologie :</strong> on sensibilise aux enjeux environnementaux en privilégiant les activités de
              pleine nature et les partenariats locaux.
            </li>
            <li>
              <strong>Émancipation :</strong> on encourage les jeunes à prendre des initiatives et des
              responsabilités.
            </li>
            <li>
              <strong>Coopération :</strong> on mise sur une vie de groupe où l'entraide et le respect passent avant
              la compétition.
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold md:text-3xl">Nos activités</h2>
          <p>Nos séjours mêlent sport, créativité et moments d'autonomie.</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Sport :</strong> surf, escalade, ski, voile... avec des professionnels pour apprendre à se
              dépasser et faire équipe.
            </li>
            <li>
              <strong>Art :</strong> théâtre, musique, danse, arts plastiques, vidéo... pour libérer sa créativité.
            </li>
            <li>
              <strong>Vie quotidienne :</strong> les jeunes préparent les repas, gèrent un budget et organisent
              certaines activités.
            </li>
            <li>
              <strong>Moments de partage :</strong> veillées, jeux coopératifs, débats... pour renforcer les liens
              dans le groupe.
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold md:text-3xl">Notre engagement</h2>
          <p>
            Après 12 jours chez nous, on veut que chaque jeune reparte avec de nouvelles compétences sociales, plus de
            confiance en soi et l'envie d'agir en tant que citoyen. La durée des séjours permet de créer des liens
            solides, d'approfondir les apprentissages et de développer une vraie cohésion de groupe.
          </p>
          <p>
            On prend aussi soin de nos équipes : salaires corrects, temps de repos et de préparation garantis.
          </p>
        </section>

        <section className="space-y-4 border-t border-[#d8cde8] pt-8">
          <h2 className="text-2xl font-bold md:text-3xl">Projet éducatif</h2>
          <p>
            Envie de connaître tous les détails de notre démarche et de nos objectifs ?
          </p>
          <a
            href="/projet-educatif.pdf"
            download
            className="inline-flex items-center rounded-full bg-[#B8336A] px-6 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:bg-[#982a57]"
          >
            Télécharger le projet éducatif
          </a>
        </section>
      </div>
    </StaticPageShell>
  );
}
