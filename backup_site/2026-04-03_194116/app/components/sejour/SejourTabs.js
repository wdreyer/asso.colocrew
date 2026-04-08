"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { FaQuoteLeft, FaStar } from "react-icons/fa";
import ReservationCard from "./ReservationCard";
import ImmersiveGallery from "./ImmersiveGallery";

function normalizeText(value) {
  if (!value) return "";
  return value
    .replace(/\/p\s*(.*?)\s*\/p/g, "\n\n$1\n\n")
    .replace(/\r\n/g, "\n")
    .replace(/^[ \t]*[•▪◦]\s*/gm, "- ")
    .replace(/^[ \t]*\*\s*/gm, "- ");
}

function SectionWave({ top = false, color = "#ffffff" }) {
  return (
    <div className={`pointer-events-none -mb-px h-14 md:h-20 ${top ? "rotate-180" : ""}`}>
      <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="h-full w-full">
        <path
          fill={color}
          d="M0,86L72,80C144,74,288,62,432,52C576,42,720,34,864,40C1008,46,1152,66,1296,74C1368,78,1404,80,1440,82L1440,120L0,120Z"
        />
        <path
          fill={color}
          fillOpacity="0.68"
          d="M0,98L80,90C160,82,320,66,480,60C640,54,800,58,960,66C1120,74,1280,86,1360,92L1440,98L1440,120L0,120Z"
        />
      </svg>
    </div>
  );
}

export default function SejourTabs({
  sections,
  sejour,
  feedback,
  selectedDate,
  selectedAgeGroup,
  reservationPrice,
  handleDateChange,
  handleAgeGroupChange,
  handleReservation,
  isRoundTrip,
  onRoundTripChange,
  selectedDepartureCity,
  selectedReturnCity,
  onDepartureCityChange,
  onReturnCityChange,
}) {
  const summarySubsArray = sejour?.summarySubsections || [];
  const feedbackTestimonials = Array.isArray(feedback?.testimonials) ? feedback.testimonials : [];
  const feedbackTopCategories = Array.isArray(feedback?.topCategories) ? feedback.topCategories : [];
  const feedbackReviewsCount = Number(feedback?.reviewsCount) || 0;
  const feedbackAverage = Number(feedback?.avgGlobal);

  const tabs = useMemo(() => {
    const fixedLabels = [
      "Le séjour en bref",
      "Hébergement",
      "Encadrement",
      "Activités",
      "Repas",
      "Infos pratiques",
    ];

    const fallback = [];
    if (summarySubsArray.length > 0) {
      fallback.push(summarySubsArray[0].title || "Résumé");
    } else {
      fallback.push("Résumé");
    }

    if (sections?.length) {
      sections.forEach((section, index) => {
        fallback.push(section?.subSections?.[0]?.title || `Section ${index + 1}`);
      });
    }

    return fallback.map((item, index) => fixedLabels[index] || item);
  }, [sections, summarySubsArray]);

  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    setActiveTab(0);
  }, [sejour?.name]);

  const tabButtonRefs = useRef([]);

  const goToTab = (index) => {
    const safeIndex = Math.max(0, Math.min(index, tabs.length - 1));
    setActiveTab(safeIndex);
  };

  useEffect(() => {
    const current = tabButtonRefs.current[activeTab];
    if (current?.scrollIntoView) {
      current.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [activeTab]);

  const currentSubSections =
    activeTab === 0
      ? summarySubsArray
      : sections?.[activeTab - 1]?.subSections || [];

  const galleryImages = useMemo(() => {
    const seen = new Set();
    const collected = [];

    const pushImage = (value) => {
      const src = String(value || "").trim();
      if (!src) return;
      if (!src.startsWith("/") && !src.startsWith("http")) return;
      if (seen.has(src)) return;
      seen.add(src);
      collected.push(src);
    };

    const explicitGallery = Array.isArray(sejour?.galleryImages) ? sejour.galleryImages : [];
    explicitGallery.forEach(pushImage);
    if (collected.length > 0) return collected;

    pushImage(sejour?.heroImage);
    (sejour?.images || []).forEach(pushImage);
    (sejour?.photos || []).forEach(pushImage);

    summarySubsArray.forEach((sub) => {
      pushImage(sub?.imageSrc);
      pushImage(sub?.image);
      pushImage(sub?.photo);
    });

    (sections || []).forEach((section) => {
      pushImage(section?.imageSrc);
      pushImage(section?.image);
      pushImage(section?.photo);
      pushImage(section?.coverImage);

      (section?.subSections || []).forEach((sub) => {
        pushImage(sub?.imageSrc);
        pushImage(sub?.image);
        pushImage(sub?.photo);
      });
    });

    return collected;
  }, [sejour, sections, summarySubsArray]);

  const localTestimonials = Array.isArray(sejour?.testimonials) ? sejour.testimonials : [];
  const testimonialsForDisplay = useMemo(() => {
    if (feedbackTestimonials.length > 0) {
      return feedbackTestimonials.map((item) => ({
        quote: item.quote,
        author: item.author,
      }));
    }

    return localTestimonials
      .map((item) => ({
        quote: item?.quote,
        author: item?.author,
      }))
      .filter((item) => item.quote);
  }, [feedbackTestimonials, localTestimonials]);

  const hasTestimonials = testimonialsForDisplay.length > 0;
  const hasGallery = galleryImages.length > 0;
  const markdownComponents = {
    p: ({ children }) => <p>{children}</p>,
    ul: ({ children }) => <ul className="list-none space-y-2 pl-0">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal space-y-2 pl-5">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  };
  return (
    <section className="relative overflow-x-clip bg-[#fff8ef] pb-36 md:pb-32 lg:pb-28">
      <div className="pointer-events-none absolute -left-12 top-40 h-56 w-56 rounded-full bg-[#f5d4e4]/55 blur-3xl" />
      <div className="pointer-events-none absolute -right-14 top-[38%] h-64 w-64 rounded-full bg-[#ddd0ff]/50 blur-3xl" />

      <div className="mx-auto w-full max-w-[1480px] px-4 md:px-8">
        <div className="z-20 bg-[#FAF8F2]">
          <div className="relative border-b-[1.5px] border-black/12">
            <div className="no-scrollbar flex items-center gap-1 overflow-x-auto px-1 sm:px-2">
              {tabs.map((label, idx) => (
                <button
                  key={`${label}-${idx}`}
                  ref={(element) => {
                    tabButtonRefs.current[idx] = element;
                  }}
                  type="button"
                  onClick={() => goToTab(idx)}
                  className={`cursor-pointer whitespace-nowrap border-b-[2.5px] px-3 py-3 text-[17px] font-medium transition-colors sm:px-4 md:text-[18px] ${
                    activeTab === idx ? "border-[#C8365A] text-[#C8365A]" : "border-transparent text-[#888780] hover:text-[#2C2C2A]"
                  }`}
                  style={{
                    fontWeight: activeTab === idx ? 500 : 400,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div id="estimation-section" className="relative -top-24" />

        <div className="mt-4 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-14 md:space-y-20">
            <div key={`content-tab-${activeTab}`} className="space-y-14 md:space-y-20">
              {currentSubSections.length === 0 ? (
                <div className="text-[#3b3058]">Contenu non disponible.</div>
              ) : (
                currentSubSections.map((sub, idx) => {
                  const hasImage = Boolean(sub?.imageSrc);
                  const invert = idx % 2 === 1;

                  return (
                    <article key={`sub-${activeTab}-${idx}-${sub?.title || "section"}-${sub?.imageSrc || "no-image"}`}>
                      {hasImage ? (
                        <div className="mx-auto max-w-5xl">
                          {sub.title ? (
                            <h2 className="font-display text-3xl font-bold leading-tight text-[#24173d] md:text-5xl">{sub.title}</h2>
                          ) : null}

                          <div
                            className={`relative mt-5 h-[320px] w-full overflow-hidden rounded-[28px] md:h-[420px] md:w-[48%] ${
                              invert ? "md:float-right md:ml-7" : "md:float-left md:mr-7"
                            } mb-5`}
                          >
                            <Image
                              key={`image-${activeTab}-${idx}-${sub.imageSrc}`}
                              src={sub.imageSrc}
                              alt={sub.title || "Section"}
                              fill
                              className="object-cover transition duration-700 hover:scale-[1.03]"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#1c1237]/45 via-transparent to-transparent" />
                          </div>

                          <ReactMarkdown
                            className="mt-3 space-y-3 text-[16px] leading-relaxed text-[#4f4567] md:mt-6 md:text-[18px]"
                            components={markdownComponents}
                          >
                            {normalizeText(sub.text)}
                          </ReactMarkdown>

                          <div className="clear-both" />
                        </div>
                      ) : (
                        <div className="mx-auto max-w-4xl">
                          {sub.title ? <h2 className="font-display text-3xl font-bold leading-tight text-[#24173d] md:text-5xl">{sub.title}</h2> : null}
                          <ReactMarkdown
                            className="mt-4 space-y-3 text-[16px] leading-relaxed text-[#4f4567] md:text-[18px]"
                            components={markdownComponents}
                          >
                            {normalizeText(sub.text)}
                          </ReactMarkdown>
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>

            {hasTestimonials ? (
              <section id="avis-section" className="relative scroll-mt-24 overflow-hidden rounded-[30px] bg-[#1d1238] px-5 py-7 text-white md:px-8 md:py-10">
                <div className="pointer-events-none absolute -left-12 top-12 h-44 w-44 rounded-full bg-[#B8336A]/35 blur-3xl" />
                <div className="pointer-events-none absolute -right-16 bottom-8 h-52 w-52 rounded-full bg-[#7f5cff]/30 blur-3xl" />

                <div className="relative grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-5">
                    {testimonialsForDisplay[0]?.quote ? (
                      <blockquote className="rounded-3xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm md:p-6">
                        <FaQuoteLeft className="text-[#ffd7e8]" />
                        <p className="mt-3 text-xl font-semibold leading-relaxed text-white md:text-3xl">
                          {testimonialsForDisplay[0].quote}
                        </p>
                        <cite className="mt-3 block text-sm font-bold uppercase tracking-[0.08em] not-italic text-[#ffd7e8]">
                          {testimonialsForDisplay[0].author}
                        </cite>
                      </blockquote>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2">
                      {testimonialsForDisplay.slice(1, 5).map((item, index) => (
                        <blockquote
                          key={`testimonial-grid-${index}`}
                          className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm"
                        >
                          <p className="text-sm font-semibold leading-relaxed text-white/95">{item.quote}</p>
                          {item.author ? (
                            <cite className="mt-2 block text-xs font-bold uppercase tracking-[0.08em] not-italic text-[#ffd7e8]">
                              {item.author}
                            </cite>
                          ) : null}
                        </blockquote>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#ffd7e8]">Avis & retours</p>
                      <div className="mt-3 flex items-end gap-3">
                        <p className="text-5xl font-black leading-none">
                          {Number.isNaN(feedbackAverage) ? "--" : feedbackAverage.toFixed(2)}
                        </p>
                        <div className="pb-1">
                          <div className="flex gap-1 text-[#ffd7e8]">
                            {[...Array(5)].map((_, index) => (
                              <FaStar key={`star-${index}`} />
                            ))}
                          </div>
                          <p className="mt-1 text-xs font-semibold text-white/85">
                            {feedbackReviewsCount} avis vérifiés
                          </p>
                        </div>
                      </div>
                    </div>

                    {feedbackTopCategories.length > 0 ? (
                      <div className="space-y-2 rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
                        {feedbackTopCategories.map((item) => (
                          <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-semibold text-white/90">{item.label}</span>
                            <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold text-[#ffd7e8]">
                              {item.average}/10
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <a
                      href="/retours"
                      className="inline-flex w-full items-center justify-center rounded-full bg-[#B8336A] px-5 py-3 text-xs font-bold uppercase tracking-[0.08em] text-white transition hover:bg-[#982a57]"
                    >
                      Voir les avis
                    </a>
                  </div>
                </div>
              </section>
            ) : null}

          </div>

          <aside className="hidden lg:block lg:sticky lg:top-[128px] lg:self-start">
            <ReservationCard
              sejour={sejour}
              selectedDate={selectedDate}
              selectedAgeGroup={selectedAgeGroup}
              handleDateChange={handleDateChange}
              handleAgeGroupChange={handleAgeGroupChange}
              reservationPrice={reservationPrice}
              handleReservation={handleReservation}
              isRoundTrip={isRoundTrip}
              handleRoundTripChange={onRoundTripChange}
              selectedDepartureCity={selectedDepartureCity}
              selectedReturnCity={selectedReturnCity}
              handleDepartureCityChange={onDepartureCityChange}
              handleReturnCityChange={onReturnCityChange}
            />
          </aside>
        </div>

      </div>

      <SectionWave color="#fff8ef" />

      <div className="bg-[#fff8ef] lg:hidden">
        <div className="mx-auto w-full max-w-[1480px] px-4 pb-8 pt-2 md:px-8 md:pb-12">
          <div className="mx-auto max-w-3xl">
            <ReservationCard
              sejour={sejour}
              selectedDate={selectedDate}
              selectedAgeGroup={selectedAgeGroup}
              handleDateChange={handleDateChange}
              handleAgeGroupChange={handleAgeGroupChange}
              reservationPrice={reservationPrice}
              handleReservation={handleReservation}
              isRoundTrip={isRoundTrip}
              handleRoundTripChange={onRoundTripChange}
              selectedDepartureCity={selectedDepartureCity}
              selectedReturnCity={selectedReturnCity}
              handleDepartureCityChange={onDepartureCityChange}
              handleReturnCityChange={onReturnCityChange}
            />
          </div>
        </div>
      </div>

      {hasGallery && <ImmersiveGallery images={galleryImages} />}
    </section>
  );
}
