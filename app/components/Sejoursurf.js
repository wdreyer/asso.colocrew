import Image from "next/image";
import { FaWater, FaUtensils, FaBed, FaPaintBrush, FaUsers, FaBus } from "react-icons/fa";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";

export default function SejourSurf() {
  return (
    <section className="relative bg-gray-50">
      {/* Section Héro avec Overlay */}
      <div className="relative w-full h-[40vh] sm:h-[35vh] overflow-hidden">
        <Image
          src="/beach-surf.jpg"
          alt="Beach with surfers"
          fill
          style={{ objectFit: "cover" }}
          className="w-full h-full"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-40 text-white px-4 sm:px-8">
          <h1 className="text-3xl md:text-5xl font-bold uppercase tracking-wide text-center">
            Séjour Surf Été 2025
          </h1>
          <p className="sm:text-base mt-2 max-w-2xl text-center">
            Éveillez vos passions, gagnez en autonomie, et vivez une expérience inoubliable à Montalivet, sur les plus belles vagues de la côte.
          </p>
        </div>
      </div>

      {/* Séparateur */}

      {/* Section avec Icônes */}
      <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 text-center">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {/* Élément Icône */}
          <div className="flex flex-col items-center space-y-2">
            <FaWater className="text-gray-600 text-3xl" />
            <h4 className="text-xl font-semibold">Surf</h4>
            <p className="text-base text-gray-600">6 sessions adaptées à tous les niveaux.</p>
          </div>
          <div className="flex flex-col items-center space-y-2">
            <FaUtensils className="text-gray-600 text-3xl" />
            <h4 className="text-xl font-semibold">Nourriture</h4>
            <p className="text-base text-gray-600">Repas équilibrés préparés sur place.</p>
          </div>
          <div className="flex flex-col items-center space-y-2">
            <FaBed className="text-gray-600 text-3xl" />
            <h4 className="text-xl font-semibold">Lieu</h4>
            <p className="text-base text-gray-600">Montalivet en camping tout confort.</p>
          </div>
          <div className="flex flex-col items-center space-y-2">
            <FaPaintBrush className="text-gray-600 text-3xl" />
            <h4 className="text-xl font-semibold">Projet Artistique</h4>
            <p className="text-base text-gray-600">Vlog, peinture, clip vidéo, etc.</p>
          </div>
          <div className="flex flex-col items-center space-y-2">
            <FaUsers className="text-gray-600 text-3xl" />
            <h4 className="text-xl font-semibold">Encadrement</h4>
            <p className="text-base text-gray-600">Équipe diplômée BAFA/BAFD.</p>
          </div>
          <div className="flex flex-col items-center space-y-2">
            <FaBus className="text-gray-600 text-3xl" />
            <h4 className="text-xl font-semibold">Transport</h4>
            <p className="text-base text-gray-600">Aller-retour en train avec accompagnement.</p>
          </div>
        </div>
      </div>

      {/* Séparateur */}
      <hr className=" border-gray-300" />

      {/* Section "Le séjour en bref" */}
      <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 text-center">
        <h2 className="text-3xl font-bold text-gray-800 mb-4">Le séjour en bref</h2>
        <p className="text-base text-gray-600 max-w-4xl mx-auto">
          Un <strong>séjour de 12 jours</strong> unique combinant surf, art et convivialité à{" "}
          <strong>Montalivet</strong>. Rejoignez-nous pour une aventure inoubliable sur les plus
          belles vagues de la côte atlantique, tout en développant votre créativité et en partageant
          des moments forts avec de nouveaux amis.
        </p>
      </div>

      {/* Séparateur */}

      {/* Sections détaillées avec indicateur de progression */}
      <div className="relative max-w-7xl mx-auto py-8 sm:py-12 px-4 sm:px-6">
        {/* Ligne de progression verticale */}
        <div className="absolute inset-0 justify-center hidden lg:flex">
          <div className="w-1 bg-gray-200 h-full"></div>
        </div>

        {/* Sections */}
        {sections.map((section, index) => (
          <Section
            key={index}
            index={index}
            totalSections={sections.length}
            title={section.title}
            text={section.text}
            imageSrc={section.imageSrc}
          />
        ))}
      </div>
    </section>
  );
}

// Données pour les sections
const sections = [
  {
    title: "Le Surf",
    text: "Découvrez la liberté des vagues avec 6 sessions de surf encadrées par des moniteur·ices qualifié·es. Que vous soyez débutant ou expérimenté, nos moniteurs vous accompagneront pour progresser à votre rythme.",
    imageSrc: "/surflesson.jpg",
  },
  {
    title: "Nourriture",
    text: "Savourez des repas équilibrés et variés, avec des options pour tous (végétarien, allergies). Les participants participent à l’élaboration des menus, apprenant ainsi à organiser la vie collective.",
    imageSrc: "/food.jpg",
  },
  {
    title: "Lieu",
    text: "Vous serez logés dans un camping tout confort à Montalivet, à quelques minutes de la plage. Avec des chambres de 4 lits et une atmosphère conviviale, c'est l'endroit idéal pour se détendre après une journée bien remplie. Montalivet, célèbre pour ses plages de sable fin et son ambiance chaleureuse, vous offrira un cadre exceptionnel pour profiter pleinement de votre séjour.",
    imageSrc: "/host.jpg",
  },
  {
    title: "Projet Artistique",
    text: "En parallèle du surf, exprimez votre créativité à travers un projet artistique : vlog, podcasts, clip vidéo... Lors des premiers jours, vous pourrez choisir votre projet. Encadrés par nos animateur·ices, vous repartirez avec un souvenir unique.",
    imageSrc: "/art.jpg",
  },
  {
    title: "Encadrement",
    text: "Une équipe qualifiée et passionnée, formée aux valeurs de bienveillance et d’inclusion, veillera à votre sécurité et à votre épanouissement. Nos animateur·ices sont expérimenté·es et attentif·ves à chaque jeune. Nous avons pour chacun de nos séjours un·e directeur·ice BAFD et 1 animateur·ice pour 8 jeunes, soit plus que les quotas réglementaires.",
    imageSrc: "/staff.jpg",
  },
  {
    title: "Transport",
    text: "Le transport est inclus depuis plusieurs villes (Paris, Bordeaux, Lyon, Toulouse). Nous privilégions le train pour l'écologie et la sécurité. Vous serez accompagnés tout au long du voyage pour assurer une arrivée sereine et sécurisée.",
    imageSrc: "/transport.jpg",
  },
];

// Composant Section
function Section({ index, totalSections, title, text, imageSrc }) {
  const isEven = index % 2 === 0;
  const [ref, inView] = useInView({
    threshold: 0.5,
    triggerOnce: false,
  });
  const isLast = index === totalSections - 1;

  return (
    <div
      ref={ref}
      className="relative grid grid-cols-1 lg:grid-cols-2 gap-8 items-center py-8 sm:py-16"
    >
      {isEven ? (
        <>
          <div className="flex flex-col justify-center">
            <h3 className="text-3xl font-bold text-gray-800 mb-4">{title}</h3>
            <p className="text-base text-gray-600">{text}</p>
          </div>
          <div className="relative w-full h-80">
            <Image
              src={imageSrc}
              alt={title}
              fill
              style={{ objectFit: "cover", objectPosition: "center" }}
              className="rounded-lg shadow-lg"
            />
          </div>
        </>
      ) : (
        <>
          <div className="order-last lg:order-first">
            <div className="relative w-full h-80">
              <Image
                src={imageSrc}
                alt={title}
                fill
                style={{ objectFit: "cover", objectPosition: "center" }}
                className="rounded-lg shadow-lg"
              />
            </div>
          </div>
          <div className="flex flex-col justify-center lg:text-right">
            <h3 className="text-3xl font-bold text-gray-800 mb-4">{title}</h3>
            <p className="text-base text-gray-600">{text}</p>
          </div>
        </>
      )}

      {/* Cercle de progression en haut */}
      <motion.div
        className="absolute left-1/2 transform -translate-x-1/2 top-0 hidden lg:flex"
        initial={{ opacity: 0.3 }}
        animate={{ opacity: inView ? 1 : 0.3 }}
        transition={{ duration: 0.5 }}
      >
        <div className="relative flex items-center justify-center">
          <div className="w-4 h-4 bg-white rounded-full border-2 border-purple-500 z-10"></div>
        </div>
      </motion.div>

      {/* Segment de progression */}
      <motion.div
        className="absolute left-1/2 transform -translate-x-1/2 w-px bg-purple-500 hidden lg:block"
        style={{ top: "1rem", bottom: isLast ? "1rem" : "0" }}
        initial={{ opacity: 0.3 }}
        animate={{ opacity: inView ? 1 : 0.3 }}
        transition={{ duration: 0.5 }}
      />

      {/* Cercle de progression en bas (pour la dernière section) */}
      {isLast && (
        <motion.div
          className="absolute left-1/2 transform -translate-x-1/2 bottom-0 hidden lg:flex"
          initial={{ opacity: 0.3 }}
          animate={{ opacity: inView ? 1 : 0.3 }}
          transition={{ duration: 0.5 }}
        >
          <div className="relative flex items-center justify-center">
            <div className="w-4 h-4 bg-white rounded-full border-2 border-purple-500 z-10"></div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
