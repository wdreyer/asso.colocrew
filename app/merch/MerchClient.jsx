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

function formatPrice(amount) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function findProduct(productId) {
  return MERCH_PRODUCTS.find((product) => product.id === productId) || MERCH_PRODUCTS[0];
}

function getOption(product, optionId) {
  return product.priceOptions.find((option) => option.id === optionId) || product.priceOptions[0];
}

export default function MerchClient() {
  const [selectedProductId, setSelectedProductId] = useState(MERCH_PRODUCTS[0].id);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedPrice, setSelectedPrice] = useState(MERCH_PRODUCTS[0].priceOptions[0].id);
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState([]);
  const [message, setMessage] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);

  const product = findProduct(selectedProductId);
  const activeImage = product.images[selectedImage] || product.images[0];
  const selectedPriceOption = getOption(product, selectedPrice);

  const total = useMemo(
    () =>
      cart.reduce((sum, item) => {
        const itemProduct = findProduct(item.productId);
        return sum + item.quantity * getOption(itemProduct, item.priceOptionId).amount;
      }, 0),
    [cart]
  );

  const selectProduct = (nextProductId) => {
    const nextProduct = findProduct(nextProductId);
    setSelectedProductId(nextProductId);
    setSelectedImage(0);
    setSelectedSize("");
    setSelectedPrice(nextProduct.priceOptions[0].id);
    setMessage("");
  };

  const addToCart = () => {
    if (!selectedSize) {
      setMessage("Choisis une taille avant d'ajouter au panier.");
      return;
    }

    setCart((current) => {
      const existingIndex = current.findIndex(
        (item) =>
          item.productId === product.id &&
          item.size === selectedSize &&
          item.priceOptionId === selectedPrice
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

    setMessage("Ajouté au panier.");
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
            src="/images/merch/crew-front-group.jpeg"
            alt="La crew ColoCrew avec les tee-shirts Summer Tour 2k26"
            fill
            priority
            sizes="100vw"
            className={styles.heroImage}
          />
          <div className={styles.heroShade} />
        </div>

        <div className={styles.heroContent}>
          <p className={styles.kicker}>ColoCrew Merch Drop 01</p>
          <h1>Summer Tour 2k26</h1>
          <p>
            Rouge ou blanc. Même coupe oversize, même esprit colo. Précommande ouverte,
            livraison dans environ 1 mois.
          </p>
          <a href="#shop" className={styles.primaryLink}>
            Voir le drop <FaArrowRight />
          </a>
        </div>
      </section>

      <section className={styles.dropIntro}>
        <div>
          <span>DROP 01</span>
          <strong>Précommande limitée</strong>
        </div>
        <p>
          On regroupe les commandes, on lance la production, puis les tee-shirts arrivent
          sous environ 1 mois. Les bénéfices financent directement les activités ColoCrew.
        </p>
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
            <div className={styles.preorder}>
              <strong>{MERCH_PREORDER.shippingLabel}</strong>
              <span>{MERCH_PREORDER.detail}</span>
            </div>
          ) : null}

          <div className={styles.productSwitcher}>
            {MERCH_PRODUCTS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={selectedProductId === item.id ? styles.productSelected : ""}
                onClick={() => selectProduct(item.id)}
              >
                <span style={{ background: item.swatch }} />
                {item.shortName}
              </button>
            ))}
          </div>

          <p className={styles.kicker}>Tee-shirt officiel</p>
          <h2>{product.name}</h2>
          <p className={styles.tagline}>{product.tagline}</p>
          <p className={styles.description}>{product.description}</p>

          <div className={styles.specs}>
            <span>{product.fit}</span>
            <span>{product.material}</span>
            <span>{product.color}</span>
            <span>{product.care}</span>
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
                  <span>{size.stock > 0 ? `${size.stock} dispo` : "Épuisé"}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.controlGroup}>
            <div className={styles.controlHeader}>
              <span>Prix</span>
              <small>Le même tee-shirt, soutien au choix</small>
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
            <span><FaCheck /> Paiement sécurisé Stripe</span>
            <span><FaCheck /> Précommande transparente</span>
            <span><FaCheck /> Bénéfices pour la colo</span>
          </div>
        </div>
      </section>

      <section className={styles.photoStrip}>
        {[
          "/images/merch/white-shirt-sunset.jpeg",
          "/images/merch/beach-back-print.jpeg",
          "/images/merch/red-shirt-front-candid.jpg",
          "/images/merch/red-shirt-crew-candid.jpg",
        ].map((src) => (
          <div key={src}>
            <Image src={src} alt="" fill sizes="(max-width: 900px) 50vw, 25vw" />
          </div>
        ))}
      </section>

      <section className={styles.story}>
        <div>
          <p className={styles.kicker}>Pourquoi le tee-shirt</p>
          <h2>Représenter la crew, financer la suite.</h2>
        </div>
        <p>
          Chaque tee-shirt permet de garder un morceau de l'été. Le supplément choisi
          finance directement les activités et les projets ColoCrew. Même design, même
          coupe, soutien libre au moment de commander.
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
              const itemProduct = findProduct(item.productId);
              const option = getOption(itemProduct, item.priceOptionId);
              return (
                <div key={`${item.productId}-${item.size}-${item.priceOptionId}`} className={styles.cartItem}>
                  <div>
                    <strong>{itemProduct.shortName}</strong>
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
          <div className={styles.emptyCart}>Choisis un modèle, une taille, puis ajoute ton tee-shirt au panier.</div>
        )}

        <div className={styles.checkoutBar}>
          <div>
            <span>Total</span>
            <strong>{formatPrice(total)}</strong>
            <small>Précommande - livraison dans environ 1 mois.</small>
          </div>
          <button type="button" onClick={checkout} disabled={!cart.length || checkingOut}>
            <FaLock /> {checkingOut ? "Redirection..." : "Payer"}
          </button>
        </div>
      </section>

      <section className={styles.legalBand}>
        <span>Prix TTC. Paiement sécurisé. Précommande expédiée dans environ 1 mois.</span>
        <Link href="/mentions-legales">Mentions légales</Link>
        <Link href="/conditions-generales-de-ventes">CGV</Link>
      </section>
    </div>
  );
}
