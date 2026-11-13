"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FaCheck, FaHeart, FaLock, FaMinus, FaPlus, FaTimes, FaTruck } from "react-icons/fa";
import {
  MERCH_MAX_QUANTITY,
  MERCH_MAX_TOTAL_QUANTITY,
  MERCH_PRICE_OPTIONS,
  MERCH_PRODUCTS,
  MERCH_SHIPPING,
} from "@/src/lib/merchConfig";
import styles from "./MerchClient.module.css";

const euros = (amount) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(amount)} €`;
const keyOf = (productId, size) => `${productId}|${size}`;

const RETURN_MESSAGES = {
  ok: {
    tone: "success",
    title: "Merci, ta commande est confirmée !",
    text: `Tu reçois un reçu par email. Tes tee-shirts partent ${MERCH_SHIPPING.delay}.`,
  },
  annulee: {
    tone: "neutral",
    title: "Paiement annulé",
    text: "Rien n'a été débité. Ta sélection est toujours là, tu peux reprendre quand tu veux.",
  },
};

const STORAGE_KEY = "colocrew-merch-selection";

export default function MerchClient() {
  const [galleryProductId, setGalleryProductId] = useState(MERCH_PRODUCTS[0].id);
  const [imageIndex, setImageIndex] = useState(0);
  const [quantities, setQuantities] = useState({}); // { "productId|size": n }
  const [priceOptionId, setPriceOptionId] = useState(MERCH_PRICE_OPTIONS[0].id);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [returnMessage, setReturnMessage] = useState(null);

  const galleryProduct = MERCH_PRODUCTS.find((item) => item.id === galleryProductId) || MERCH_PRODUCTS[0];
  const image = galleryProduct.images[imageIndex] || galleryProduct.images[0];
  const priceOption = MERCH_PRICE_OPTIONS.find((option) => option.id === priceOptionId) || MERCH_PRICE_OPTIONS[0];

  // Retour de Stripe (/merch?commande=ok | annulee) et sélection gardée en cas d'annulation.
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("commande");
    if (RETURN_MESSAGES[status]) setReturnMessage(RETURN_MESSAGES[status]);
    try {
      if (status === "ok") window.sessionStorage.removeItem(STORAGE_KEY);
      const saved = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null");
      if (status !== "ok" && saved?.quantities) {
        setQuantities(saved.quantities);
        if (saved.priceOptionId) setPriceOptionId(saved.priceOptionId);
      }
    } catch {
      // stockage indisponible : on repart d'une sélection vide
    }
  }, []);

  const lines = useMemo(() => MERCH_PRODUCTS.flatMap((product) => product.sizes
    .map((size) => ({ product, size: size.value, quantity: quantities[keyOf(product.id, size.value)] || 0 }))
    .filter((line) => line.quantity > 0)), [quantities]);
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const itemsTotal = totalQuantity * priceOption.amount;
  const total = totalQuantity ? itemsTotal + MERCH_SHIPPING.amount : 0;

  const showProduct = (productId) => {
    if (productId !== galleryProductId) {
      setGalleryProductId(productId);
      setImageIndex(0);
    }
  };

  const changeQuantity = (product, size, delta) => {
    const key = keyOf(product.id, size.value);
    const current = quantities[key] || 0;
    const next = Math.max(0, Math.min(MERCH_MAX_QUANTITY, size.stock, current + delta));
    if (delta > 0 && totalQuantity >= MERCH_MAX_TOTAL_QUANTITY) {
      setError(`${MERCH_MAX_TOTAL_QUANTITY} tee-shirts maximum par commande. Écris-nous pour une commande plus grosse.`);
      return;
    }
    setError("");
    showProduct(product.id);
    setQuantities((previous) => {
      const updated = { ...previous };
      if (next > 0) updated[key] = next;
      else delete updated[key];
      return updated;
    });
  };

  const pay = async () => {
    if (!totalQuantity) {
      setError("Choisis au moins un tee-shirt : une couleur, une taille, puis +.");
      return;
    }
    setPaying(true);
    setError("");
    try {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ quantities, priceOptionId }));
      } catch {
        // pas grave : la sélection ne sera simplement pas restaurée
      }
      const response = await fetch("/api/merch-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceOptionId: priceOption.id,
          items: lines.map((line) => ({ productId: line.product.id, size: line.size, quantity: line.quantity })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(payload.error || "Paiement indisponible.");
      window.location.href = payload.url;
    } catch (err) {
      setError(err.message || "Impossible de lancer le paiement.");
      setPaying(false);
    }
  };

  return (
    <div className={styles.page}>
      {returnMessage ? (
        <div className={`${styles.notice} ${returnMessage.tone === "success" ? styles.noticeSuccess : ""}`} role="status">
          <span className={styles.noticeIcon} aria-hidden="true">{returnMessage.tone === "success" ? <FaCheck /> : <FaTimes />}</span>
          <div>
            <strong>{returnMessage.title}</strong>
            <p>{returnMessage.text}</p>
          </div>
          <button type="button" onClick={() => setReturnMessage(null)} aria-label="Fermer"><FaTimes /></button>
        </div>
      ) : null}

      <header className={styles.header}>
        <p className={styles.eyebrow}>Boutique</p>
        <h1>Les tee-shirts ColoCrew</h1>
        <p>Ceux que l&apos;équipe a portés tout l&apos;été. Prends-en un, ou plusieurs pour toute la famille : chaque tee-shirt aide l&apos;association.</p>
      </header>

      <section className={styles.product}>
        <div className={styles.gallery}>
          <div className={styles.galleryTabs} role="tablist" aria-label="Couleur affichée">
            {MERCH_PRODUCTS.map((product) => (
              <button
                key={product.id}
                type="button"
                role="tab"
                aria-selected={product.id === galleryProduct.id}
                className={`${styles.galleryTab} ${product.id === galleryProduct.id ? styles.galleryTabActive : ""}`}
                onClick={() => showProduct(product.id)}
              >
                <span className={styles.swatch} style={{ background: product.swatch }} />
                {product.shortName}
              </button>
            ))}
          </div>
          <div className={styles.mainImage}>
            <Image key={image.src} src={image.src} alt={image.alt} fill priority sizes="(max-width: 900px) 100vw, 52vw" />
          </div>
          <div className={styles.thumbs}>
            {galleryProduct.images.map((item, index) => (
              <button
                key={item.src}
                type="button"
                className={`${styles.thumb} ${index === imageIndex ? styles.thumbActive : ""}`}
                onClick={() => setImageIndex(index)}
                aria-label={`Photo ${index + 1}`}
              >
                <Image src={item.src} alt="" fill sizes="80px" />
              </button>
            ))}
          </div>
        </div>

        <div className={styles.panel}>
          <h2>Compose ta commande</h2>
          <p className={styles.description}>Coton épais, coupe ample : prends ta taille habituelle. Mélange les couleurs et les tailles comme tu veux.</p>

          <div className={styles.colorBlocks}>
            {MERCH_PRODUCTS.map((product) => {
              const count = product.sizes.reduce((sum, size) => sum + (quantities[keyOf(product.id, size.value)] || 0), 0);
              return (
                <div
                  key={product.id}
                  className={`${styles.colorBlock} ${count ? styles.colorBlockFilled : ""}`}
                  onMouseEnter={() => showProduct(product.id)}
                >
                  <div className={styles.colorHead}>
                    <span className={styles.swatch} style={{ background: product.swatch }} />
                    <strong>{product.name}</strong>
                    {count ? <span className={styles.colorCount}>{count}</span> : null}
                  </div>
                  <p className={styles.colorDescription}>{product.description}</p>
                  <div className={styles.sizeGrid}>
                    {product.sizes.map((size) => {
                      const quantity = quantities[keyOf(product.id, size.value)] || 0;
                      const soldOut = size.stock <= 0;
                      return (
                        <div key={size.value} className={`${styles.sizeCell} ${quantity ? styles.sizeCellActive : ""} ${soldOut ? styles.sizeCellOut : ""}`}>
                          <span className={styles.sizeLabel}>{size.value}</span>
                          {soldOut ? (
                            <span className={styles.soldOut}>Épuisé</span>
                          ) : (
                            <div className={styles.miniStepper}>
                              <button
                                type="button"
                                onClick={() => changeQuantity(product, size, -1)}
                                disabled={!quantity}
                                aria-label={`Un ${product.shortName.toLowerCase()} ${size.value} de moins`}
                              >
                                <FaMinus />
                              </button>
                              <span aria-live="polite">{quantity}</span>
                              <button
                                type="button"
                                onClick={() => changeQuantity(product, size, 1)}
                                disabled={quantity >= Math.min(MERCH_MAX_QUANTITY, size.stock)}
                                aria-label={`Un ${product.shortName.toLowerCase()} ${size.value} de plus`}
                              >
                                <FaPlus />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.group}>
            <span className={styles.label}>Prix par tee-shirt</span>
            <div className={styles.prices}>
              {MERCH_PRICE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`${styles.price} ${option.id === priceOption.id ? styles.priceActive : ""}`}
                  onClick={() => setPriceOptionId(option.id)}
                  aria-pressed={option.id === priceOption.id}
                >
                  <span className={styles.radio} aria-hidden="true" />
                  <span className={styles.priceText}>
                    <strong>{option.label}</strong>
                    {option.helper ? <small>{option.helper}</small> : null}
                  </span>
                  <span className={styles.priceAmount}>{euros(option.amount)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.summary}>
            <span className={styles.label}>Ta commande</span>
            {lines.length ? (
              <ul className={styles.summaryLines}>
                {lines.map((line) => (
                  <li key={keyOf(line.product.id, line.size)}>
                    <span>
                      <span className={styles.summarySwatch} style={{ background: line.product.swatch }} />
                      {line.quantity} × {line.product.shortName} · {line.size}
                    </span>
                    <span>{euros(line.quantity * priceOption.amount)}</span>
                    <button type="button" onClick={() => changeQuantity(line.product, line.product.sizes.find((size) => size.value === line.size), -line.quantity)} aria-label="Retirer">
                      <FaTimes />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.summaryEmpty}>Rien pour l&apos;instant : choisis une taille et appuie sur +.</p>
            )}
            <div className={styles.summaryRow}><span>Frais de port</span><span>{totalQuantity ? euros(MERCH_SHIPPING.amount) : "—"}</span></div>
            <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
              <span>Total{totalQuantity ? ` · ${totalQuantity} tee-shirt${totalQuantity > 1 ? "s" : ""}` : ""}</span>
              <span>{euros(total)}</span>
            </div>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}

          <button type="button" className={styles.pay} onClick={pay} disabled={paying || !totalQuantity}>
            <FaLock /> {paying ? "Redirection vers le paiement…" : totalQuantity ? `Payer ${euros(total)}` : "Choisis tes tee-shirts"}
          </button>
          <p className={styles.secure}>Paiement sécurisé par Stripe. Ton adresse de livraison est demandée à l&apos;étape suivante.</p>
        </div>
      </section>

      <section className={styles.facts}>
        <div>
          <FaTruck aria-hidden="true" />
          <strong>Livré {MERCH_SHIPPING.delay}</strong>
          <span>{euros(MERCH_SHIPPING.amount)} de frais de port par commande, quel que soit le nombre de tee-shirts.</span>
        </div>
        <div>
          <FaHeart aria-hidden="true" />
          <strong>Pour l&apos;association</strong>
          <span>Le bénéfice et le soutien financent les sorties, le matériel et les projets des jeunes.</span>
        </div>
        <div>
          <FaCheck aria-hidden="true" />
          <strong>Une question ?</strong>
          <span>Écris-nous à <a href="mailto:contact@colocrew.com">contact@colocrew.com</a>.</span>
        </div>
      </section>

      <section className={styles.photos} aria-hidden="true">
        {["/images/merch/crew-front-group.jpeg", "/images/merch/white-shirt-sunset.jpeg", "/images/merch/beach-back-print.jpeg"].map((src) => (
          <div key={src}><Image src={src} alt="" fill sizes="(max-width: 700px) 100vw, 33vw" /></div>
        ))}
      </section>

      <p className={styles.legal}>
        Prix TTC. <Link href="/conditions-generales-de-ventes">Conditions générales de vente</Link> · <Link href="/mentions-legales">Mentions légales</Link>
      </p>
    </div>
  );
}
