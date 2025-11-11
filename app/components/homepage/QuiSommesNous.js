"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase";
import Spinner from "../layout/Spinner";
import {
  FaCalendarAlt,
  FaUserFriends,
  FaClock,
  FaPlay,
  FaPause,
  FaVolumeUp,
  FaVolumeMute,
  FaWater,
  FaCity,
  FaTree,
  FaInstagram,
  FaFacebookF,
} from "react-icons/fa";
import { GiWaveSurfer, GiMountainCave } from "react-icons/gi";
import { SiTiktok } from "react-icons/si";

export default function MyCreativeSurfCampPage() {
  // Références pour les vidéos desktop et mobile
  const videoRefDesktop = useRef(null);
  const videoRefMobile = useRef(null);

  // États pour le contrôle du lecteur vidéo
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  // Intersection Observer pour gérer automatiquement la lecture/pausing
  useEffect(() => {
    const observerOptions = {
      threshold: 0.5, // la vidéo doit être visible à 50% pour se lancer
    };

    const observerCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.play();
          setIsPlaying(true);
        } else {
          entry.target.pause();
          setIsPlaying(false);
        }
      });
    };

    const observer = new IntersectionObserver(
      observerCallback,
      observerOptions
    );

    if (videoRefDesktop.current) {
      observer.observe(videoRefDesktop.current);
    }
    if (videoRefMobile.current) {
      observer.observe(videoRefMobile.current);
    }

    return () => {
      if (videoRefDesktop.current) observer.unobserve(videoRefDesktop.current);
      if (videoRefMobile.current) observer.unobserve(videoRefMobile.current);
    };
  }, []);

  // Retourne la référence de la vidéo active en fonction de la largeur de l'écran
  const getActiveVideo = () => {
    return window.innerWidth < 768
      ? videoRefMobile.current
      : videoRefDesktop.current;
  };

  const togglePlay = () => {
    const video = getActiveVideo();
    if (video) {
      if (video.paused) {
        video.play();
        setIsPlaying(true);
      } else {
        video.pause();
        setIsPlaying(false);
      }
    }
  };

  const toggleMute = () => {
    const video = getActiveVideo();
    if (video) {
      video.muted = !video.muted;
      setIsMuted(video.muted);
    }
  };

  // Récupération du séjour phare depuis Firebase
  const [sejour, setSejour] = useState(null);
  // Gestion de la modale Pass Colo
  const [isModalOpen, setIsModalOpen] = useState(false);
  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  useEffect(() => {
    async function fetchSejour() {
      try {
        const docRef = doc(db, "sejours", "ski-and-music");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSejour(docSnap.data());
        } else {
          console.error("Aucun document trouvé pour my-creative-surf-camp");
        }
      } catch (error) {
        console.error("Erreur lors de la récupération du séjour :", error);
      }
    }
    fetchSejour();
  }, []);

  // Récupération des autres séjours (affichés dans la colonne de droite)
  const [otherSejours, setOtherSejours] = useState([]);

  useEffect(() => {
    async function fetchOtherSejours() {
      try {
        // Chargement des séjours "cantal-decouverte" et "escapade-parisienne"
        const sejourIds = ["my-creative-surf-camp", "escapade-parisienne"];
        const fetchedSejours = [];
        for (const id of sejourIds) {
          const docRef = doc(db, "sejours", id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            // On ajoute l'ID pour servir de clé et, si possible, un slug pour l'URL
            fetchedSejours.push({ id, ...docSnap.data() });
          }
        }
        setOtherSejours(fetchedSejours);
      } catch (error) {
        console.error(
          "Erreur lors de la récupération des autres séjours :",
          error
        );
      }
    }
    fetchOtherSejours();
  }, []);

  if (!sejour) return <Spinner />;

  // Fonctions d'aide pour formater les dates et la durée
  const getPeriod = (dates) => {
    if (!dates || dates.length === 0) return "Dates inconnues";
    const displayMonths = new Set();
    dates.forEach((dateObj) => {
      if (dateObj.startDate) {
        const start = new Date(dateObj.startDate);
        const monthName = start.toLocaleDateString("fr-FR", { month: "long" });
        const formattedMonth =
          monthName.charAt(0).toUpperCase() + monthName.slice(1);
        displayMonths.add(formattedMonth);
      }
    });
    return Array.from(displayMonths).join(" - ");
  };

  const getDuration = (dates, defaultDuration) => {
    if (dates && dates.length > 0 && dates[0].startDate && dates[0].endDate) {
      const start = new Date(dates[0].startDate);
      const end = new Date(dates[0].endDate);
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      return `${days} jours`;
    }
    return defaultDuration || "Durée inconnue";
  };

  // Fonction pour choisir l'icône en fonction de l'environnement du séjour
  const getEnvironmentIcon = (env) => {
    switch (env) {
      case "mer":
        return <FaWater className="text-blue-500" />;
      case "campagne":
        return <FaTree className="text-green-500" />;
      case "montagne":
        return <GiMountainCave className="text-gray-500" />;
      case "ville":
        return <FaCity className="text-purple-500" />;
      default:
        return <GiWaveSurfer className="text-yellow-400" />;
    }
  };

  return (
    <div className="min-h-screen font-inter">
      {/* ==================================== */}
      {/* HERO AVEC VIDÉO */}
      {/* ==================================== */}
      <div className="relative h-[40vh] sm:h-[35vh] overflow-hidden flex items-center justify-center">
        <video
          autoPlay
          loop
          muted
          playsInline
          poster="/load.jpg"
          className="absolute inset-0 w-full h-full object-cover"
          ref={videoRefDesktop}
        >
          <source src="/videoski.mp4" type="video/mp4" />
        </video>
        <div className="relative z-10 text-center text-white space-y-6">
          <h1 className="text-4xl sm:text-6xl font-extrabold">
            Réinventons les colos
          </h1>
          <h2 className="text-2xl sm:text-4xl font-semibold tracking-widest">
            Avec ColoCrew
          </h2>
        </div>
      </div>

      {/* SECTION 1 : Séjour phare & Atouts */}
      <section className="py-4 mx-2 bg-white">
        <div className="mx-auto flex flex-col lg:flex-row gap-8 px-4 items-start">
          {/* Colonne gauche : Carte du séjour phare */}
          <Link
            href="/sejours/ski-and-music"
            className="m-4 font-inter cursor-pointer bg-white rounded shadow-lg overflow-hidden transform transition duration-300 hover:scale-105 hover:shadow-2xl lg:w-3/5"
          >
            <div className="relative">
              <img
                src={sejour.heroImage || "/surf-camp.jpg"}
                alt={sejour.name || "Ski and Music"}
                className="w-full h-64 object-cover"
              />

              {/* Version mobile : rubans centrés et empilés */}
              <div className="absolute top-4 inset-x-0 flex flex-col items-center space-y-2 lg:hidden">
                <div className="bg-[#B8336A] text-white font-bold py-1 px-3 rounded-md">
                  Notre séjour phare !
                </div>
                <div className="bg-[#281C47] text-white font-bold py-1 px-3 rounded-md">
                  {sejour.basePrice} €
                </div>
              </div>

              {/* Version desktop : rubans en position absolue aux extrémités */}
              <div className="hidden lg:block">
                <div className="bg-[#B8336A] absolute top-4 left-4 flex flex-col items-end space-y-2 text-white font-bold py-1 px-3 rounded-md">
                  Notre séjour phare !
                </div>
                <div className="absolute top-4 right-4 flex flex-col items-end space-y-2">
                  <div className="bg-[#281C47] text-white font-bold py-1 px-3 rounded-md">
                    {sejour.basePrice} €
                  </div>
                </div>
              </div>

              <h2 className="font-poppins text-3xl absolute inset-0 flex items-center justify-center font-extrabold text-white text-center px-4">
                {sejour.name || "Ski N Music"}
              </h2>
            </div>
            <div className="p-5">
              {/* Sur petits écrans, les icônes se placent sur deux lignes grâce à flex-wrap */}
              <div className="flex flex-col sm:flex-row md:flex-nowrap gap-4 text-sm font-medium mb-4">
                <div className="flex items-center space-x-2 basis-1/2">
                  <FaCalendarAlt className="text-[#B8336A]" />
                  <span>Février 2026</span>
                </div>
                <div className="flex items-center space-x-2 basis-1/2">
                  <FaUserFriends className="text-[#B8336A]" />
                  <span>{sejour.ageGroup || "13 - 17 ans"}</span>
                </div>
                <div className="flex items-center space-x-2 basis-1/2">
                  <FaClock className="text-[#B8336A]" />
                  <span>{sejour.duration || "7 jours"}</span>
                </div>
                <div className="flex items-center space-x-2 basis-1/2">
                  <GiWaveSurfer className="text-[#B8336A]" />
                  <span>{sejour.extra || "Ski & Musique"}</span>
                </div>
              </div>
            </div>
          </Link>

          {/* Colonne droite : Atouts et lien vers la réservation */}
          <div className="space-y-6 pt-4 lg:w-2/5">
            <h2 className="text-2xl font-black font-poppins text-gray-800">
              ColoCrew, bien + que des colos🔥
            </h2>
            <ul className="space-y-4">
              <li className="flex items-start">
                <span className="flex-shrink-0 text-green-500 text-2xl">
                  👥
                </span>
                <span className="ml-3 text-lg text-gray-700">
                  Des effectifs réduits (50 max)
                </span>
              </li>
              <li className="flex items-start">
                <span className="flex-shrink-0 text-green-500 text-2xl">
                  🏄
                </span>
                <span className="ml-3 text-lg text-gray-700">
                  Une pratique sportive approfondie (entre 3 et 5 séances)
                </span>
              </li>
              <li className="flex items-start">
                <span className="flex-shrink-0 text-green-500 text-2xl">
                  📷
                </span>
                <span className="ml-3 text-lg text-gray-700">
                  Un projet artistique collectif
                </span>
              </li>
              <li className="flex items-start">
                <span className="flex-shrink-0 text-green-500 text-2xl">
                  ✊
                </span>
                <span className="ml-3 text-lg text-gray-700">
                  Une pédagogie autour de l'émancipation
                  <br />
                  <span className="text-sm">
                    🍽️ Choix et élaboration des repas, des activités et des
                    projets !
                  </span>
                </span>
              </li>
            </ul>

            <div className="text-center">
              <Link
                href="/sejours"
                className="text-m font-extrabold font-poppins cursor-pointer md:w-auto text-[#B8336A] hover:text-[#A2225A] transition duration-300"
              >
                Nos séjours sont ouverts à la réservation, faites-vite ! 📅
              </Link>
            </div>
          </div>
        </div>
      </section>
      <div
        className="mx-12 bg-white border-b"
        style={{ borderColor: "rgba(184, 51, 106, 0.5)" }}
      ></div>

      {/* SECTION 2 : Articles et Cartes supplémentaires */}
      <section>
        <div className="mx-auto px-8 flex flex-col lg:flex-row gap-8">
          {/* Colonne de gauche (3/5) : Articles cliquables */}
          <div className="lg:w-4/5">
            {/* Nouvel article ajouté au-dessus de "Nos réseaux sociaux" */}
            <Link href="/demande-reservation" className="block cursor-pointer">
              <article className="hover:bg-pink-50 p-4 rounded transition duration-300">
                <header>
                  <h3 className="text-2xl font-bold font-poppins text-[#B8336A] hover:text-[#A2225A] mb-2">
                    Demande de réservation
                  </h3>
                </header>
                <p className="text-gray-700 mb-2">
                  Faites votre demande de réservation en ligne et nous vous
                  envoyons un devis personnalisé dans les <strong>24h</strong>.
                </p>
              </article>
            </Link>
            <Link href="#" className="block cursor-pointer">
              <article className="hover:bg-pink-50 p-4 rounded transition duration-300">
                <header>
                  <h3 className="text-2xl font-bold font-poppins text-[#B8336A] hover:text-[#A2225A] mb-2">
                    Nos réseaux sociaux
                  </h3>
                </header>
                <p className="text-gray-700 mb-2">
                  Nous sommes également très actifs sur les réseaux,
                  retrouvez-nous sur&nbsp;
                  <a
                    href="https://www.facebook.com/profile.php?id=61571533102707"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#B8336A] hover:text-[#A2225A] font-bold"
                  >
                    Facebook
                  </a>{" "}
                  &nbsp; et &nbsp;
                  <a
                    href="https://www.instagram.com/_colocrew/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#B8336A] hover:text-[#A2225A] font-bold"
                  >
                    Instagram
                  </a>
                  .
                </p>
              </article>
            </Link>
            <Link href="/qui-sommes-nous" className="block cursor-pointer">
              <article className="hover:bg-pink-50 p-4 rounded transition duration-300">
                <header>
                  <h3 className="text-2xl font-bold font-poppins text-[#B8336A] hover:text-[#A2225A] mb-2">
                    ColoCrew ? 🙌
                  </h3>
                </header>
                <p className="text-gray-700 mb-2">
                  Nous sommes une association qui porte les valeurs de
                  l'éducation populaire et qui souhaite offrir à tous les
                  enfants les vacances qu'ils méritent, peu importe d'où ils
                  viennent ou leur situation économique.
                </p>
              </article>
            </Link>

            <Link href="/sejours" className="block cursor-pointer">
              <article className="hover:bg-pink-50 p-4 rounded transition duration-300">
                <header>
                  <h3 className="text-2xl font-bold font-poppins text-[#B8336A] hover:text-[#A2225A] mb-2">
                    Les séjours 🏖️
                  </h3>
                </header>
                <p className="text-gray-700 mb-2">
                  En 2025, nous proposons une offre diversifiée de séjours basée
                  sur une pédagogie commune.
                </p>
              </article>
            </Link>

            <Link href="/aide-financement" className="block cursor-pointer">
              <article className="hover:bg-pink-50 p-4 rounded transition duration-300">
                <header>
                  <h3 className="text-2xl font-bold font-poppins text-[#B8336A] hover:text-[#A2225A] mb-2">
                    Aides et financement 💶
                  </h3>
                </header>
                <p className="text-gray-700 mb-2">
                  Nous souhaitons que nos séjours soient accessibles au plus
                  grand nombre. Nous sommes d'ores et déjà éligibles au Pass
                  Colo, et d'autres financements existent pour soutenir les
                  départs en vacances.
                </p>
              </article>
            </Link>

            <Link href="/anims" className="block cursor-pointer">
              <article className="hover:bg-pink-50 p-4 rounded transition duration-300">
                <header>
                  <h3 className="text-2xl font-bold font-poppins text-[#B8336A] hover:text-[#A2225A] mb-2">
                    Travailler avec nous 👥
                  </h3>
                </header>
                <p className="text-gray-700 mb-2">
                  Nous pensons qu'il est nécessaire de valoriser le travail des
                  équipes dans l'animation. Nous proposons des salaires au
                  dessus de la moyenne ainsi que des conditions de travail
                  améliorées.
                </p>
              </article>
            </Link>

            <div className="relative -ml-8 -pr-8 h-64 overflow-hidden gradient-fade">
              <Image
                src="/end.jpg"
                alt="Fin de section"
                fill
                style={{ objectFit: "cover", opacity: 0.5 }}
              />
            </div>
          </div>
          {/* Colonne de droite (2/5) : Cartes des autres séjours */}
          <div className="lg:w-2/5 space-y-8">
            {/* Titre pour les autres séjours */}
            <h4 className="text-2xl pt-4 font-bold font-poppins text-[#B8336A] hover:text-[#A2225A] mb-2">
              Nos autres séjours :
            </h4>
            {/* Cartes des autres séjours – design inspiré du séjour phare */}
            <div className="space-y-4">
              {otherSejours.map((sejourItem) => {
                const period = sejourItem.dates
                  ? getPeriod(sejourItem.dates)
                  : sejourItem.months || "Dates inconnues";
                const duration = sejourItem.dates
                  ? getDuration(sejourItem.dates, sejourItem.duration)
                  : sejourItem.duration || "Durée inconnue";
                const ageGroup =
                  sejourItem.ageGroup ||
                  (sejourItem.ageGroups
                    ? sejourItem.ageGroups.join(", ")
                    : "Âge inconnu");
                const environment = sejourItem.environment || "inconnu";
                return (
                  <Link
                    key={sejourItem.id}
                    href={`/sejours/${sejourItem.slug || sejourItem.id}`}
                    className="group block"
                  >
                    <div className="bg-white m-6 rounded shadow overflow-hidden relative transform transition duration-300 hover:scale-102">
                      <div className="relative">
                        <img
                          src={sejourItem.heroImage || "/default.jpg"}
                          alt={sejourItem.name}
                          className="w-full h-56 object-cover"
                        />
                        <div className="absolute inset-0 transition"></div>
                        <h2 className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-white px-4 text-center">
                          {sejourItem.name}
                        </h2>
                        <div className="absolute top-4 right-4 bg-[#281C47] text-white font-bold py-1 px-3 rounded-md">
                          {sejourItem.basePrice} €
                        </div>
                      </div>
                      <div className="p-5">
                        <div className="flex flex-row gap-2 text-gray-800 text-sm font-medium">
                          <div className="flex items-center space-x-2">
                            <FaCalendarAlt className="text-[#B8336A]" />
                            <span>{period}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <FaUserFriends className="text-[#B8336A]" />
                            <span>{ageGroup} ans</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <FaClock className="text-[#B8336A]" />
                            <span>{duration}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
            <div className="flex flex-row justify-center items-center">
              <div className="my-4 ">
                <a
                  href="https://juvigo.fr"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Nos séjours de surf sont aussi disponibles chez Juvigo !"
                >
                  <img
                    src="https://juvigo.fr/assets/img/logo.png"
                    alt="Juvigo Logo"
                    className="w-72" /* ~288 px, proche du 300 px souhaité */
                  />
                </a>
                <a
                  href="https://bafa.murathenes.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Découvre notre partenaire Murathènes pour passer ton BAFA"
                  className="flex flex-col items-center group"
                >
                  <Image
                    src="/bafa-murathenes.png"
                    alt="Murathènes BAFA"
                    width={266}
                    height={60}
                    className="object-contain"
                  />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
