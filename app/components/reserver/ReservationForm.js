"use client";

import { FaChild, FaUserShield } from "react-icons/fa";

export default function ReservationForm({ formData, handleChange }) {
  const validPromo75 = ["INESS25", "JADOUBICYCLETTE75"];
  const showPromo75 = validPromo75.includes(
    (formData.legal.promoCode || "").trim().toUpperCase()
   );

  // Gestion spécifique pour le fichier justificatif avec design amélioré
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    // Met à jour le champ imbriqué "legal.justificatif" (ou "legal.justificatifUrl" après upload)
    handleChange({
      target: { name: "legal.justificatif", value: file, type: "file" },
    });
  };

  // Gestion du changement du nombre d'enfants et mise à jour du tableau minor.children
  const handleNumberOfChildrenChange = (e) => {
    // Mise à jour du champ numberOfChildren (non imbriqué)
    handleChange(e);
    const newNumber = parseInt(e.target.value, 10);
    const currentChildren = formData.minor?.children || [];
    let newChildren;
    if (currentChildren.length < newNumber) {
      newChildren = [...currentChildren];
      for (let i = currentChildren.length; i < newNumber; i++) {
        newChildren.push({
          firstName: "",
          lastName: "",
          birthDate: "",
          birthPlace: "",
          address: "",
          city: "",
          postalCode: "",
        });
      }
    } else {
      newChildren = currentChildren.slice(0, newNumber);
    }
    handleChange({
      target: { name: "minor.children", value: newChildren, type: "custom" },
    });
  };

  // Gestion de la modification d'un champ d'un enfant
  const handleChildChange = (index, field, value) => {
    const newChildren = [...(formData.minor?.children || [])];
    newChildren[index] = { ...newChildren[index], [field]: value };
    handleChange({
      target: { name: "minor.children", value: newChildren, type: "custom" },
    });
  };

  return (
    <div className="max-w-4xl mx-auto bg-white p-6 rounded shadow space-y-8">
      {/* Bloc : Informations des enfants */}
      <div className=" p-4 rounded">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-[#B8336A] flex items-center">
            <FaChild className="mr-2" />
            Informations des enfants
          </h2>
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">
              Nombre d'enfants :
            </label>
            <select
              name="numberOfChildren"
              value={formData.numberOfChildren}
              onChange={handleNumberOfChildrenChange}
              className="border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <div className="flex-col items-end justify-end">
              <div className="text-sm text-green-600">
                -5% dès 2 enfants inscrits{" "}
              </div>
              <div className="text-sm text-green-600">
                -10% dès 3 enfants inscrits
              </div>
            </div>
          </div>
        </div>
        {formData.minor.children &&
          formData.minor.children.map((child, index) => (
            <div key={index} className=" p-4 rounded mb-4">
              <h3 className="text-xl font-bold mb-3">Enfant {index + 1}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Prénom */}
                <div className="flex items-center">
                  <label className="w-1/3 text-sm font-medium text-gray-700">
                    Prénom <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={child.firstName}
                    onChange={(e) =>
                      handleChildChange(index, "firstName", e.target.value)
                    }
                    className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                    placeholder="Ex: Alice"
                    required
                  />
                </div>
                {/* Nom */}
                <div className="flex items-center">
                  <label className="w-1/3 text-sm font-medium text-gray-700">
                    Nom <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={child.lastName}
                    onChange={(e) =>
                      handleChildChange(index, "lastName", e.target.value)
                    }
                    className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                    placeholder="Ex: Dupont"
                    required
                  />
                </div>
                {/* Date de naissance */}
                <div className="flex items-center">
                  <label className="w-1/3 text-sm font-medium text-gray-700">
                    Date de naissance <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={child.birthDate}
                    onChange={(e) =>
                      handleChildChange(index, "birthDate", e.target.value)
                    }
                    className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                    required
                  />
                </div>
                {/* Lieu de naissance */}
                <div className="flex items-center">
                  <label className="w-1/3 text-sm font-medium text-gray-700">
                    Lieu de naissance
                  </label>
                  <input
                    type="text"
                    value={child.birthPlace}
                    onChange={(e) =>
                      handleChildChange(index, "birthPlace", e.target.value)
                    }
                    className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                    placeholder="Ex: Paris"
                  />
                </div>
                {/* Adresse */}
                <div className="flex items-center">
                  <label className="w-1/3 text-sm font-medium text-gray-700">
                    Adresse <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={child.address}
                    onChange={(e) =>
                      handleChildChange(index, "address", e.target.value)
                    }
                    className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                    placeholder="Ex: 10 Rue de l'École"
                    required
                  />
                </div>
                {/* Ville */}
                <div className="flex items-center">
                  <label className="w-1/3 text-sm font-medium text-gray-700">
                    Ville <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={child.city}
                    onChange={(e) =>
                      handleChildChange(index, "city", e.target.value)
                    }
                    className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                    placeholder="Ex: Paris"
                    required
                  />
                </div>
                {/* Code postal */}
                <div className="flex items-center">
                  <label className="w-1/3 text-sm font-medium text-gray-700">
                    Code postal <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={child.postalCode}
                    onChange={(e) =>
                      handleChildChange(index, "postalCode", e.target.value)
                    }
                    className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                    placeholder="Ex: 75001"
                    required
                  />
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* Bloc : Informations du responsable légal */}
      <div className=" p-4 rounded">
        <h2 className="text-2xl font-bold text-[#B8336A] flex items-center mb-4">
          <FaUserShield className="mr-2" />
          Informations du responsable légal
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Prénom */}
          <div className="flex items-center">
            <label className="w-1/3 text-sm font-medium text-gray-700">
              Prénom <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="legal.firstName"
              value={formData.legal.firstName}
              onChange={handleChange}
              className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
              placeholder="Ex: Sophie"
              required
            />
          </div>
          {/* Nom */}
          <div className="flex items-center">
            <label className="w-1/3 text-sm font-medium text-gray-700">
              Nom <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="legal.lastName"
              value={formData.legal.lastName}
              onChange={handleChange}
              className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
              placeholder="Ex: Martin"
              required
            />
          </div>
          {/* Téléphone */}
          <div className="flex items-center">
            <label className="w-1/3 text-sm font-medium text-gray-700">
              Téléphone <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              name="legal.phone"
              value={formData.legal.phone}
              onChange={handleChange}
              className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
              placeholder="Ex: 0601020304"
              required
            />
          </div>
          {/* Email */}
          <div className="flex items-center">
            <label className="w-1/3 text-sm font-medium text-gray-700">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              name="legal.email"
              value={formData.legal.email}
              onChange={handleChange}
              className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
              placeholder="Ex: exemple@domaine.fr"
              required
            />
          </div>
          {/* Relation */}
          <div className="flex items-center">
            <label className="w-1/3 text-sm font-medium text-gray-700">
              Relation <span className="text-red-500">*</span>
            </label>
            <select
              name="legal.relation"
              value={formData.legal.relation}
              onChange={handleChange}
              className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
              required
            >
              <option value="">Sélectionnez</option>
              <option value="père">Père</option>
              <option value="mère">Mère</option>
              <option value="autre">Autre</option>
            </select>
          </div>
          {/* Relation Autre */}
          {formData.legal.relation === "autre" && (
            <div className="flex items-center">
              <label className="w-1/3 text-sm font-medium text-gray-700">
                Précisez <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="legal.relationOther"
                value={formData.legal.relationOther}
                onChange={handleChange}
                className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                placeholder="Ex: Oncle, tante..."
                required
              />
            </div>
          )}
          <div className="flex items-start mb-4">
            <label className="w-1/3 text-sm font-medium text-gray-700 pt-2">
              Code promo / Parrain
            </label>
            <div className="w-2/3 flex flex-col gap-1">
              <input
                type="text"
                name="legal.promoCode"
                value={formData.legal.promoCode}
                onChange={handleChange}
                className="border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                placeholder="Ex: PROMO2025"
              />
              {showPromo75 && (
                <span className="text-sm text-green-600 font-semibold">
                  🎉 Réduction de 75 €
                </span>
              )}
            </div>
          </div>
          {/* Nouveau champ : Numéro CAF ou Sécu */}
          <div className="flex items-center">
            <label className="w-1/3 text-sm font-medium text-gray-700">
              Numéro CAF ou Sécu
            </label>
            <input
              type="text"
              name="legal.cafOrSecu"
              value={formData.legal.cafOrSecu}
              onChange={handleChange}
              className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
              placeholder="(pour le calcul des aides)"
            />
          </div>
          {/* Nouveau champ : Upload justificatif avec design amélioré */}
          <div className="flex items-center">
            <label className="w-1/3 text-sm font-medium text-gray-700">
              Justificatif (PDF)
            </label>
            <label className="w-2/3 border border-dashed border-gray-400 rounded-md p-4 cursor-pointer text-center hover:bg-gray-100">
              {formData.legal.justificatif
                ? formData.legal.justificatif.name
                : "Cliquez pour uploader un PDF"}
              <input
                type="file"
                name="legal.justificatif"
                accept="application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>
          {/* Adresse différente ? */}
          <div className="flex items-center mt-4">
            <input
              type="checkbox"
              name="legal.addressDifferent"
              checked={formData.legal.addressDifferent}
              onChange={handleChange}
              className="h-4 w-4 mr-2 text-[#B8336A] focus:ring-[#B8336A]"
            />
            <label
              htmlFor="legal.addressDifferent"
              className="text-sm text-gray-700"
            >
              Adresse différente de celle du mineur
            </label>
          </div>
          {/* Si adresse différente, afficher les champs */}
          {formData.legal.addressDifferent && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center">
                <label className="w-1/3 text-sm font-medium text-gray-700">
                  Adresse <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="legal.address"
                  value={formData.legal.address}
                  onChange={handleChange}
                  className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                  placeholder="Ex: 20 Rue du Parc"
                  required
                />
              </div>
              <div className="flex items-center">
                <label className="w-1/3 text-sm font-medium text-gray-700">
                  Ville <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="legal.city"
                  value={formData.legal.city}
                  onChange={handleChange}
                  className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                  placeholder="Ex: Lyon"
                  required
                />
              </div>
              <div className="flex items-center">
                <label className="w-1/3 text-sm font-medium text-gray-700">
                  Code postal <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="legal.postalCode"
                  value={formData.legal.postalCode}
                  onChange={handleChange}
                  className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                  placeholder="Ex: 69001"
                  required
                />
              </div>
            </div>
          )}
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-gray-700 mb-2">
              Message et questions :
            </label>
            <textarea
              name="legal.message"
              value={formData.legal.message}
              onChange={handleChange}
              rows={4}
              className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
              placeholder="Écrivez ici vos questions ou remarques..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
