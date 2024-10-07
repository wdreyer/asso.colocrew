import { FaUsers, FaHeart, FaChalkboardTeacher, FaBook } from 'react-icons/fa';
import Link from 'next/link';

export default function Sections() {
    return (
        <section className="relative z-20 py-4 sm:py-12 bg-gray-50">
            <div className="mx-4  md:mx-4 lg:mx-auto max-w-6xl  grid grid-cols-1  md:grid-cols-2 lg:grid-cols-4 gap-8">
              
                {/* Bloc Parents - Background semi-transparent + Texte et icône plus foncés */}
                <Link href="/sejours" passHref>
                    <div className="group bg-white shadow-lg rounded-lg p-6 flex flex-col justify-center items-center h-full cursor-pointer hover:scale-105 hover:rotate-3 hover:bg-purple-100 hover:bg-opacity-90 transition-all duration-300 ease-in-out">
                        <FaUsers className="text-6xl text-purple-600 mb-6 group-hover:text-purple-800 transition-colors duration-300" />
                        <p className="text-lg text-gray-600 text-center group-hover:text-gray-800 transition-colors duration-300">Tu es intéressé par les séjours ?</p>
                    </div>
                </Link>

                {/* Bloc Animateurs - Background semi-transparent + Texte et icône plus foncés */}
                <Link href="/anims" passHref>
                    <div className="group bg-white shadow-lg rounded-lg p-6 flex flex-col justify-center items-center h-full cursor-pointer hover:scale-105 hover:rotate-3 hover:bg-yellow-100 hover:bg-opacity-90 transition-all duration-300 ease-in-out">
                        <FaChalkboardTeacher className="text-6xl text-yellow-600 mb-6 group-hover:text-yellow-800 transition-colors duration-300" />
                        <p className="text-lg text-gray-600 text-center group-hover:text-gray-800 transition-colors duration-300">Tu es Animateur.ice ou Directeur.ice ?</p>
                    </div>
                </Link>

                {/* Bloc Nous et notre pédagogie - Background semi-transparent + Texte et icône plus foncés */}
                <Link href="/pedagogie" passHref>
                    <div className="group bg-white shadow-lg rounded-lg p-6 flex flex-col justify-center items-center h-full cursor-pointer hover:scale-105 hover:rotate-3 hover:bg-green-100 hover:bg-opacity-90 transition-all duration-300 ease-in-out">
                        <FaBook className="text-6xl text-green-600 mb-6 group-hover:text-green-800 transition-colors duration-300" />
                        <p className="text-lg text-gray-600 text-center group-hover:text-gray-800 transition-colors duration-300">Tu veux en savoir plus sur nous et notre pédagogie ?</p>
                    </div>
                </Link>

                {/* Bloc Nous Aider - Background semi-transparent + Texte et icône plus foncés */}
                <Link href="/soutenir" passHref>
                    <div className="group bg-white shadow-lg rounded-lg p-6 flex flex-col justify-center items-center h-full cursor-pointer hover:scale-105 hover:rotate-3 hover:bg-blue-100 hover:bg-opacity-90 transition-all duration-300 ease-in-out">
                        <FaHeart className="text-6xl text-blue-600 mb-6 group-hover:text-blue-800 transition-colors duration-300" />
                        <p className="text-lg text-gray-600 text-center group-hover:text-gray-800 transition-colors duration-300">Tu veux nous aider ?</p>
                    </div>
                </Link>

            </div>
        </section>
    );
}
