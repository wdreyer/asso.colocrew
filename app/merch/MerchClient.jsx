"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  FaArrowRight,
  FaCheck,
  FaChevronLeft,
  FaChevronRight,
  FaLock,
  FaMinus,
  FaPlus,
  FaShoppingBag,
  FaTimes,
} from "react-icons/fa";
import { MERCH_PREORDER, MERCH_PRODUCTS } from "@/src/lib/merchConfig";
import styles from "./MerchClient.module.css";

const product = MERCH_PRODUCTS[0];

function formatPrice(amount) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getOption(optionId) {
  return product.priceOptions.find((option) => option.id === optionId) || product.priceOptions[0];
}

export default function MerchClient() {
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedPrice, setSelectedPrice] = useState(product.priceOptions[0].id);
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState([]);
  const [message, setMessage] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);

  const activeImage = product.images[selectedImage];
  const selectedPriceOption = getOption(selectedPrice);
  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * getOption(item.priceOptionId).amount, 0),
    [cart]
  );

  const addToCart = () => {
    if (!selectedSize) {
      setMessage("Choisis une taille avant d'ajouter au panier.");
      return;
    }

    setCart((current) => {
      const existingIndex = current.findIndex(
        (item) => item.size === selectedSize && item.priceOptionId === selectedPrice
      );
      if (existingIndex === -1) {
        return [
          ...current,
          {
            productId: product.id,
            size: selectedSize,
            priceOptionId: selectedPrice,
            quantity,
          },
        ];
      }

      return current.map((item, index) =>
        index === existingIndex
          ? { ...item, quantity: Math.min(10, item.quantity + quantity) }
          : item
      );
    });
    setMessage("Ajoute au panier.");
  };

  const updateCartQuantity = (index, nextQuantity) => {
    setCart((current) =>
      current
        .map((item, itemIndex) =>
          itemIndex === index ? { ...item, quantity: Math.max(0, Math.min(10, nextQuantity)) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const checkout = async () => {
    if (!cart.length) {
      setMessage("Ton panier est vide.");
      return;
    }

    setCheckingOut(true);
    setMessage("");
    try {
      const response = await fetch("/api/merch-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Paiement indisponible.");
      }
      window.location.href = payload.url;
    } catch (error) {
      setMessage(error.message || "Impossible de lancer le paiement.");
      setCheckingOut(false);
    }
  };

  const nextImage = () => {
    setSelectedImage((current) => (current + 1) % product.images.length);
  };

  const previousImage = () => {
    setSelectedImage((current) => (current - 1 + product.images.length) % product.images.length);
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroMedia}>
          <Image
            src="/images/merch/red-shirt-summer-tour.jpeg"
            alt="Tee-shirt rouge ColoCrew Summer Tour 2k26 porte en colo"
            fill
            priority
            sizes="100vw"
            className={styles.heroImage}
          />
          <div className={styles.heroShade} />
        </div>

        <div className={styles.heroContent}>
          <p className={styles.kicker}>ColoCrew Merch</p>
          <h1>Summer Tour 2k26</h1>
          <p>
            Le tee-shirt de la crew. Rouge, blanc, oversize, imprime avec les dates de l'ete.
          </p>
          <a href="#shop" className={styles.primaryLink}>
            Commander <FaArrowRight />
          </a>
        </div>
      </section>

      <section id="shop" className={styles.shop}>
        <div className={styles.gallery}>
          <div className={styles.mainPhoto}>
            <Image
              src={activeImage.src}
              alt={activeImage.alt}
              fill
              sizes="(max-width: 900px) 100vw, 54vw"
              className={styles.productImage}
            />
            <button type="button" className={`${styles.galleryButton} ${styles.left}`} onClick={previousImage}>
              <FaChevronLeft />
            </button>
            <button type="button" className={`${styles.galleryButton} ${styles.right}`} onClick={nextImage}>
              <FaChevronRight />
            </button>
          </div>

          <div className={styles.thumbs}>
            {product.images.map((image, index) => (
              <button
                key={image.src}
                type="button"
                className={`${styles.thumb} ${selectedImage === index ? styles.activeThumb : ""}`}
                onClick={() => setSelectedImage(index)}
                aria-label={`Voir photo ${index + 1}`}
              >
                <Image src={image.src} alt="" fill sizes="90px" className={styles.thumbImage} />
              </button>
            ))}
          </div>
        </div>

        <div className={styles.productPanel}>
          {MERCH_PREORDER.enabled ? (
            <div className={styles.preorder}>{MERCH_PREORDER.shippingLabel}</div>
          ) : null}

          <p className={styles.kicker}>Tee-shirt officiel</p>
          <h2>{product.name}</h2>
          <p className={styles.tagline}>{product.tagline}</p>

          <div className={styles.specs}>
            <span>{product.fit}</span>
            <span>{product.material}</span>
            <span>{product.color}</span>
          </div>

          <div className={styles.controlGroup}>
            <div className={styles.controlHeader}>
              <span>Taille</span>
              <small>S, M, L, XL</small>
            </div>
            <div className={styles.sizeGrid}>
              {product.sizes.map((size) => (
                <button
                  key={size.value}
                  type="button"
                  className={`${styles.sizeButton} ${selectedSize === size.value ? styles.selected : ""}`}
                  onClick={() => setSelectedSize(size.value)}
                  disabled={size.stock <= 0}
                >
                  <strong>{size.value}</strong>
                  <span>{size.stock > 0 ? `${size.stock} dispo` : "Epuise"}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.controlGroup}>
            <div className={styles.controlHeader}>
              <span>Prix</span>
              <small>Le meme tee-shirt, soutien au choix</small>
            </div>
            <div className={styles.priceGrid}>
              {product.priceOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`${styles.priceButton} ${selectedPrice === option.id ? styles.selected : ""}`}
                  onClick={() => setSelectedPrice(option.id)}
                >
                  <span>{option.label}</span>
                  <strong>{formatPrice(option.amount)}</strong>
                  <small>{option.helper}</small>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.quantityRow}>
            <div className={styles.quantityPicker}>
              <button type="button" onClick={() => setQuantity((current) => Math.max(1, current - 1))}>
                <FaMinus />
              </button>
              <span>{quantity}</span>
              <button type="button" onClick={() => setQuantity((current) => Math.min(10, current + 1))}>
                <FaPlus />
              </button>
            </div>
            <button type="button" className={styles.addButton} onClick={addToCart}>
              <FaShoppingBag /> Ajouter - {formatPrice(selectedPriceOption.amount * quantity)}
            </button>
          </div>

          {message ? <p className={styles.message}>{message}</p> : null}

          <div className={styles.reassurance}>
            <span><FaCheck /> Paiement securise Stripe</span>
            <span><FaCheck /> Benefices pour la colo</span>
            <span><FaCheck /> Livraison suivie</span>
          </div>
        </div>
      </section>

      <section className={styles.story}>
        <div>
          <p className={styles.kicker}>Pourquoi le tee-shirt</p>
          <h2>Representer la crew, financer la suite.</h2>
        </div>
        <p>
          Chaque tee-shirt permet de garder un morceau de l'ete, et chaque supplement choisi
          finance directement les activites et projets ColoCrew. Meme design, meme coupe,
          soutien libre au moment de commander.
        </p>
      </section>

      <section className={styles.cartSection}>
        <div className={styles.cartHeader}>
          <div>
            <p className={styles.kicker}>Panier</p>
            <h2>Commande</h2>
          </div>
          <span>{cart.length} article(s)</span>
        </div>

        {cart.length ? (
          <div className={styles.cartItems}>
            {cart.map((item, index) => {
              const option = getOption(item.priceOptionId);
              return (
                <div key={`${item.size}-${item.priceOptionId}`} className={styles.cartItem}>
                  <div>
                    <strong>{product.shortName}</strong>
                    <span>Taille {item.size} - {option.label} {formatPrice(option.amount)}</span>
                  </div>
                  <div className={styles.cartActions}>
                    <button type="button" onClick={() => updateCartQuantity(index, item.quantity - 1)}>
                      <FaMinus />
                    </button>
                    <span>{item.quantity}</span>
                    <button type="button" onClick={() => updateCartQuantity(index, item.quantity + 1)}>
                      <FaPlus />
                    </button>
                    <button type="button" onClick={() => updateCartQuantity(index, 0)} aria-label="Retirer">
                      <FaTimes />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyCart}>Choisis une taille et ajoute ton tee-shirt au panier.</div>
        )}

        <div className={styles.checkoutBar}>
          <div>
            <span>Total</span>
            <strong>{formatPrice(total)}</strong>
          </div>
          <button type="button" onClick={checkout} disabled={!cart.length || checkingOut}>
            <FaLock /> {checkingOut ? "Redirection..." : "Payer"}
          </button>
        </div>
      </section>

      <section className={styles.legalBand}>
        <span>Prix TTC. Livraison et retours precises au paiement.</span>
        <Link href="/mentions-legales">Mentions legales</Link>
        <Link href="/conditions-generales-de-ventes">CGV</Link>
      </section>
    </div>
  );
}
