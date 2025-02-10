"use client";

import { FaChild, FaUserShield } from "react-icons/fa";

export default function ReservationForm({ formData, handleChange }) {
  return (
    <div className="max-w-4xl mx-auto bg-white p-6 rounded shadow ">
      {/* Bloc : Informations du mineur */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[#B8336A] flex items-center mb-4">
          <FaChild className="mr-2" />
          Informations du mineur
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Prénom */}
          <div className="flex items-center">
            <label className="w-1/3 text-sm font-medium text-gray-700">
              Prénom <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="minorFirstName"
              value={formData.minorFirstName}
              onChange={handleChange}
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
              name="minorLastName"
              value={formData.minorLastName}
              onChange={handleChange}
              className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
              placeholder="Ex: Martin"
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
              name="minorBirthDate"
              value={formData.minorBirthDate}
              onChange={handleChange}
              className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
              required
            />
          </div>
          {/* Adresse */}
          <div className="flex items-center">
            <label className="w-1/3 text-sm font-medium text-gray-700">
              Adresse <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="minorAddress"
              value={formData.minorAddress}
              onChange={handleChange}
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
              name="minorCity"
              value={formData.minorCity}
              onChange={handleChange}
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
              name="minorPostalCode"
              value={formData.minorPostalCode}
              onChange={handleChange}
              className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
              placeholder="Ex: 75001"
              required
            />
          </div>
        </div>
      </div>

      {/* Bloc : Informations du responsable légal */}
      <div>
        <h2 className="text-2xl font-bold text-[#B8336A] flex items-center mb-4">
          <FaUserShield className="mr-2" />
          Informations du responsable légal
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Prénom */}
          <div className="flex items-center">
            <label className="w-1/3 text-sm font-medium text-gray-700">
              Prénom <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="legalFirstName"
              value={formData.legalFirstName}
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
              name="legalLastName"
              value={formData.legalLastName}
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
              name="legalPhone"
              value={formData.legalPhone}
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
              name="legalEmail"
              value={formData.legalEmail}
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
              name="legalRelation"
              value={formData.legalRelation}
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
          {formData.legalRelation === "autre" && (
            <div className="flex items-center">
              <label className="w-1/3 text-sm font-medium text-gray-700">
                Précisez <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="legalRelationOther"
                value={formData.legalRelationOther}
                onChange={handleChange}
                className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                placeholder="Ex: Oncle, tante..."
                required
              />
            </div>
          )}
          {/* Adresse différente ? */}
          <div className="flex items-center mt-4">
            <input
              type="checkbox"
              id="legalAddressDifferent"
              name="legalAddressDifferent"
              checked={formData.legalAddressDifferent}
              onChange={handleChange}
              className="h-4 w-4 mr-2 text-[#B8336A] focus:ring-[#B8336A]"
            />
            <label htmlFor="legalAddressDifferent" className="text-sm text-gray-700">
              Adresse différente de celle du mineur
            </label>
          </div>
          {/* Si adresse différente, afficher les champs */}
          {formData.legalAddressDifferent && (
            <div className="mt-2 space-y-2 md:col-span-2">
              <div className="flex items-center">
                <label className="w-1/3 text-sm font-medium text-gray-700">
                  Adresse <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="legalAddress"
                  value={formData.legalAddress}
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
                  name="legalCity"
                  value={formData.legalCity}
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
                  name="legalPostalCode"
                  value={formData.legalPostalCode}
                  onChange={handleChange}
                  className="w-2/3 border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#B8336A]"
                  placeholder="Ex: 69001"
                  required
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
