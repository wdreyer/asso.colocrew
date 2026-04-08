"use client";

import React from "react";
import Image from "next/image";
import { FaCalendarAlt, FaChild, FaMapMarkerAlt, FaMoneyBillWave, FaRegStar, FaStar, FaStarHalfAlt } from "react-icons/fa";

function InfoPill({ icon: Icon, text }) {
  if (!text) return null;

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/12 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm md:text-sm">
      <Icon className="text-[#ffd7e8]" />
      {text}
    </span>
  );
}

function formatMonthRange(dates) {
  if (!dates?.length) return "";

  const months = dates.flatMap((item) => {
    if (!item?.startDate || !item?.endDate) return [];
    return [
      new Date(item.startDate).toLocaleDateString("fr-FR", { month: "long" }),
      new Date(item.endDate).toLocaleDateString("fr-FR", { month: "long" }),
    ];
  });

  return [...new Set(months)]
    .map((month) => month.charAt(0).toUpperCase() + month.slice(1))
    .join(" • ");
}

function formatDuration(dates) {
  const first = dates?.[0];
  if (!first?.startDate || !first?.endDate) return "";

  const start = new Date(first.startDate);
  const end = new Date(first.endDate);
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return `${days} jours`;
}

function toRatingLabel(value) {
  if (value === null || value === undefined) return "--";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "--";
  return numeric.toFixed(2);
}

export default function GenericSejour({ sejourData, feedback }) {
  if (!sejourData) {
    return <div className="p-8 text-center">Aucune donnée de séjour disponible.</div>;
  }

  const { basePrice, name, heroImage, heroSubtitle, dates, ageGroups, environment } = sejourData;
  const isOviveHero =
    typeof heroImage === "string" &&
    (heroImage.endsWith("/ovive.png") || heroImage.endsWith("ovive.png"));

  const months = formatMonthRange(dates);
  const duration = formatDuration(dates);
  const ages = ageGroups?.length
    ? `${ageGroups[0]}${ageGroups[1] ? ` - ${ageGroups[1]}` : ""} ans`
    : "";
  const featuredQuote = feedback?.featuredTestimonial;
  const averageRating = toRatingLabel(feedback?.avgGlobal);
  const reviewsCount = feedback?.reviewsCount || 0;
  const ratingOverFive = Number.isNaN(Number(averageRating)) ? null : Number((Number(averageRating) / 2).toFixed(1));
  const starsValue = ratingOverFive || 0;
  const fullStars = Math.floor(starsValue);
  const hasHalfStar = starsValue - fullStars >= 0.5;
  const emptyStars = Math.max(0, 5 - fullStars - (hasHalfStar ? 1 : 0));

  return (
    <section className="relative isolate overflow-hidden bg-[#110b23]">
      <div className="relative h-[62vh] min-h-[430px] w-full md:h-[66vh]">
        <Image
          src={heroImage}
          alt={name}
          fill
          priority
          sizes="100vw"
          quality={92}
          className={isOviveHero ? "object-cover scale-105 blur-[2px]" : "object-cover"}
        />
        {isOviveHero ? (
          <Image
            src={heroImage}
            alt={name}
            fill
            priority
            sizes="100vw"
            quality={100}
            unoptimized
            className="object-contain object-center"
          />
        ) : null}

        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,11,35,0.24)_0%,rgba(17,11,35,0.72)_70%,rgba(17,11,35,0.9)_100%)]" />

        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto w-full max-w-[1240px] px-5 pb-14 md:px-8 md:pb-20">
            <div className="mb-5 flex flex-wrap gap-2">
              <InfoPill icon={FaCalendarAlt} text={months} />
              <InfoPill icon={FaChild} text={ages} />
              <InfoPill icon={FaCalendarAlt} text={duration} />
              <InfoPill icon={FaMoneyBillWave} text={basePrice !== undefined && basePrice !== null ? `${basePrice} €` : ""} />
              {reviewsCount > 0 ? (
                <a
                  href="#avis-section"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/35 bg-white/12 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm transition hover:bg-white/20 md:text-sm"
                >
                  <span className="inline-flex items-center gap-0.5 text-[#ffd7e8]">
                    {[...Array(fullStars)].map((_, idx) => (
                      <FaStar key={`full-star-${idx}`} />
                    ))}
                    {hasHalfStar ? <FaStarHalfAlt /> : null}
                    {[...Array(emptyStars)].map((_, idx) => (
                      <FaRegStar key={`empty-star-${idx}`} />
                    ))}
                  </span>
                  <span>{ratingOverFive?.toFixed(1) || "0.0"}/5</span>
                  <span className="text-[#ffd7e8]">({reviewsCount} avis)</span>
                </a>
              ) : null}
              <InfoPill icon={FaMapMarkerAlt} text={environment} />
            </div>

            <h1 className="font-display text-4xl font-bold leading-[1.02] text-white md:text-7xl">{name}</h1>
            {heroSubtitle ? (
              <p className="mt-4 max-w-3xl text-base font-semibold leading-relaxed text-white/95 md:text-xl">{heroSubtitle}</p>
            ) : null}
            {featuredQuote ? (
              <blockquote className="mt-5 max-w-3xl border-l-2 border-[#ffd7e8] pl-3">
                <p
                  className="text-sm font-semibold leading-relaxed text-white/95 md:text-[15px]"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {featuredQuote.quote}
                </p>
                <cite className="mt-1 block text-xs font-bold not-italic uppercase tracking-[0.1em] text-[#ffd7e8]">
                  {featuredQuote.author}
                </cite>
              </blockquote>
            ) : null}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute -bottom-px left-0 right-0 h-16 md:h-24">
        <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="h-full w-full">
          <path
            fill="#fff8ef"
            d="M0,86L72,80C144,74,288,62,432,52C576,42,720,34,864,40C1008,46,1152,66,1296,74C1368,78,1404,80,1440,82L1440,120L0,120Z"
          />
          <path
            fill="#fff8ef"
            fillOpacity="0.72"
            d="M0,98L80,90C160,82,320,66,480,60C640,54,800,58,960,66C1120,74,1280,86,1360,92L1440,98L1440,120L0,120Z"
          />
        </svg>
      </div>
    </section>
  );
}
