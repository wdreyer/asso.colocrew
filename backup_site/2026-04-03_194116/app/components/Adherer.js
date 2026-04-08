import { FaInstagram, FaTiktok, FaLinkedin } from "react-icons/fa";

export default function Adherer() {
  return (
    <section id="nous-rejoindre" className="text-center py-24 bg-gradient-to-r from-pink-50 to-purple-50">
      <h2 className="text-4xl font-bold text-purple-800 mb-6">Nous rejoindre</h2>
      <p className="text-gray-700 text-lg max-w-3xl mx-auto mb-12">
      Soutenez notre association en devenant adhérent et restez informé de toutes les actualités et nouveautés de ColoCrew. Ensemble, construisons des séjours inoubliables !
      </p>
      <a
        href="https://www.helloasso.com/associations/colocrew/adhesions/adhesion-a-colocrew-1"
        className="bg-purple-600 text-white px-6 py-3 rounded-full hover:bg-purple-700 transition"
      >
        Adhérer Maintenant
      </a>

      {/* Social Media Section */}
      <div className="mt-12">
        <h3 className="text-2xl font-bold text-purple-800 mb-6">Suivez-nous sur les réseaux</h3>
        <div className="flex justify-center space-x-8">
          {/* Instagram */}
          <a
            href="https://www.instagram.com/_colocrew/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-700 hover:text-purple-700 transition"
            aria-label="Instagram"
          >
            <FaInstagram className="text-4xl" />
          </a>

          {/* TikTok */}
          <a
            href="https://www.tiktok.com/@colocrew"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-700 hover:text-purple-700 transition"
            aria-label="TikTok"
          >
            <FaTiktok className="text-4xl" />
          </a>

          {/* LinkedIn */}
          <a
            href="https://www.linkedin.com/company/colocrew"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-700 hover:text-purple-700 transition"
            aria-label="LinkedIn"
          >
            <FaLinkedin className="text-4xl" />
          </a>
        </div>
      </div>
    </section>
  );
}
