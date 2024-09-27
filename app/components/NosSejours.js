import Image from 'next/image';
import { FaWater, FaPaintBrush, FaUtensils } from 'react-icons/fa';

export default function NosSejours() {
  return (
    <section id="nos-sejours" className="py-12 bg-purple-50">
            <h2 className="text-4xl text-center font-bold text-purple-800 mb-12">Nos séjours :</h2>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12">

        {/* Image section for Surf and Camp */}
        <div className="space-y-8">
          <div className="overflow-hidden rounded-lg shadow-lg">
            <Image
              src="/surf.jpg"
              alt="Séjour Surf"
              width={700}
              height={500}
              className="rounded-lg hover:scale-105 transition-transform duration-500 ease-in-out"
            />
          </div>
          <div className="overflow-hidden rounded-lg shadow-lg">
            <Image
              src="/camp.jpg"
              alt="Séjour Camp"
              width={700}
              height={500}
              className="rounded-lg hover:scale-105 transition-transform duration-500 ease-in-out"
            />
          </div>
        </div>

        {/* Information section */}
        <div className="flex flex-col  text-left">
          <h2 className="text-2xl font-bold text-purple-800 text-center mb-6">Séjour Surf Été 2025</h2>
          <p className="text-xl text-gray-600 mb-8">
            Rejoignez-nous cet été pour 12 jours inoubliables de surf sur les magnifiques plages de Vendays-Montalivet.
            Profitez de 8 séances de surf encadrées par des professionnels, avec une vraie progression pour tous les niveaux.
          </p>
          <p className="text-xl text-gray-600 mb-8">
            En plus des activités sportives, plongez dans la création d'un projet artistique unique, comme un vlog ou un clip vidéo,
            qui vous permettra de capturer les meilleurs moments de votre séjour. Les soirées seront également animées avec des activités
            en camping pour renforcer les liens entre les participants.
          </p>
          <p className="text-xl text-gray-600 mb-4">
            Nous vous proposons 12 nuits en camping en pension complète avec les dates suivantes : 
          </p>
          <ul className="pl-6 text-xl font-semibold text-purple-600 mb-8 list-disc list-inside">
            <li>6 juillet au 18 juillet</li>
            <li>20 juillet au 1er août</li>
            <li>3 août au 15 août</li>
            <li>17 août au 29 août</li>
          </ul>


          {/* Call to action */}
          <a
            href="/brochure.pdf"
            download
            className="mt-6 inline-block bg-pink-500 text-white px-8 py-4 rounded-full text-lg hover:bg-pink-600 hover:scale-105 transition duration-300"
          >
            Plus d'infos & Télécharger la brochure
          </a>
        </div>

      </div>
    </section>
  );
}
