"use client";

import { useState } from "react";
import styles from "@/src/pages/Souvenirs/SouvenirArticle.module.css";

export default function SmartImage({ src, alt, className = "", placeholderClassName = "" }) {
  const [hasError, setHasError] = useState(false);
  const placeholderClasses = `${styles.placeholder} ${placeholderClassName || className}`.trim();

  if (!src || hasError) {
    return <div className={placeholderClasses}>🖼️</div>;
  }

  return (
    <img
      src={src}
      alt={alt || "Image souvenir"}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}
