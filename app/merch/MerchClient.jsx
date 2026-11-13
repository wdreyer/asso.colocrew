"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FaCheck, FaHeart, FaLock, FaMinus, FaPlus, FaTimes, FaTruck } from "react-icons/fa";
import { MERCH_MAX_QUANTITY, MERCH_PRODUCTS, MERCH_SHIPPING } from "@/src/lib/merchConfig";
import styles from "./MerchClient.module.css";

const euros = (amount) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(amount)} €`;

const RETURN_MESSAGES = {
  ok: {
    tone: "success",
    title: "Merci, ta commande est confirmée !",
    text: `Tu reçois un reçu par email. Ton tee-shirt part ${MERCH_SHIPPING.delay}.`,
  },
  annulee: {
    tone: "neutral",
    title: "Paiement annulé",
    text: "Rien n'a été débité. Tu peux reprendre ta commande quand tu veux.",
  },
};

export default function MerchClient() {
  const [productId, setProductId] = useState(MERCH_PRODUCTS[0].id);
  const [imageIndex, setImageIndex] = useState(0);
  const [size, setSize] = useState("");
  const [priceOptionId, setPriceOptionId] = useState(MERCH_PRODUCTS[0].priceOptions[0].id);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [returnMessage, setReturnMessage] = useState(null);

  const product = MERCH_PRODUCTS.find((item) => item.id === productId) || MERCH_PRODUCTS[0];
  const image = product.images[imageIndex] || product.images[0];
  const priceOption = product.priceOptions.find((option) => option.id === priceOptionId) || product.priceOptions[0];
  const itemsTotal = priceOption.amount * quantity;
  const total = itemsTotal + MERCH_SHIPPING.amount;

  // Retour de Stripe : /merch?commande=ok | annulee
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("commande");
    if (RETURN_MESSAGES[status]) setReturnMessage(RETURN_MESSAGES[status]);
  }, []);

  const chooseProduct = (id) => {
    setProductId(id);
    setImageIndex(0);
    setError("");
  };

  const pay = async () => {
    if (!size) {
      setError("Choisis ta taille.");
      return;
    }
    setPaying(true);
    setError("");
    try {
      const response = await fetch("/api/merch-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, size, priceOptionId: priceOption.id, quantity }),
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
        <h1>Le tee-shirt ColoCrew</h1>
        <p>Celui que l&apos;équipe a porté tout l&apos;été. Chaque tee-shirt vendu aide l&apos;association.</p>
      </header>

      <section className={styles.product}>
        <div className={styles.gallery}>
          <div className={styles.mainImage}>
            <Image key={image.src} src={image.src} alt={image.alt} fill priority sizes="(max-width: 900px) 100vw, 52vw" />
          </div>
          <div className={styles.thumbs}>
            {product.images.map((item, index) => (
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
          <h2>{product.name}</h2>
          <p className={styles.description}>{product.description}</p>

          <div className={styles.group}>
            <span className={styles.label}>Couleur</span>
            <div className={styles.colors}>
              {MERCH_PRODUCTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.color} ${item.id === product.id ? styles.colorActive : ""}`}
                  onClick={() => chooseProduct(item.id)}
                  aria-pressed={item.id === product.id}
                >
                  <span className={styles.swatch} style={{ background: item.swatch }} />
                  {item.shortName}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.group}>
            <span className={styles.label}>Taille <small>coupe ample, prends ta taille habituelle</small></span>
            <div className={styles.sizes}>
              {product.sizes.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  disabled={entry.stock <= 0}
                  className={`${styles.size} ${size === entry.value ? styles.sizeActive : ""}`}
                  onClick={() => { setSize(entry.value); setError(""); }}
                  aria-pressed={size === entry.value}
                >
                  {entry.value}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.group}>
            <span className={styles.label}>Prix</span>
            <div className={styles.prices}>
              {product.priceOptions.map((option) => (
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

          <div className={styles.group}>
            <span className={styles.label}>Quantité</span>
            <div className={styles.stepper}>
              <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label="Un de moins"><FaMinus /></button>
              <span>{quantity}</span>
              <button type="button" onClick={() => setQuantity((value) => Math.min(MERCH_MAX_QUANTITY, value + 1))} disabled={quantity >= MERCH_MAX_QUANTITY} aria-label="Un de plus"><FaPlus /></button>
            </div>
          </div>

          <div className={styles.summary}>
            <div><span>{quantity} tee-shirt{quantity > 1 ? "s" : ""}</span><span>{euros(itemsTotal)}</span></div>
            <div><span>Frais de port</span><span>{euros(MERCH_SHIPPING.amount)}</span></div>
            <div className={styles.summaryTotal}><span>Total</span><span>{euros(total)}</span></div>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}

          <button type="button" className={styles.pay} onClick={pay} disabled={paying}>
            <FaLock /> {paying ? "Redirection vers le paiement…" : `Payer ${euros(total)}`}
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
