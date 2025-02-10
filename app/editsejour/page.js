"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/app/firebase";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { FaSave, FaPlus, FaTrash, FaUpload } from "react-icons/fa";
import Link from "next/link";
import dynamic from "next/dynamic";

const SimpleMDEEditor = dynamic(() => import("react-simplemde-editor"), { ssr: false });

/* ---------------------------------------------------------------------------
   Composant enfant pour l'édition des séjours (tous les hooks y sont utilisés)
--------------------------------------------------------------------------- */
function EditSejourContent() {
  const [sejours, setSejours] = useState({});
  const [selectedSejour, setSelectedSejour] = useState("");
  const [sejourData, setSejourData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [activeSubSectionIndex, setActiveSubSectionIndex] = useState(0);
  const [activeSummarySubSectionIndex, setActiveSummarySubSectionIndex] = useState(0);
  const [newAgeGroup, setNewAgeGroup] = useState("");

  // Options mémorisées pour l'éditeur Markdown
  const simpleMDEOptions = useMemo(
    () => ({
      spellChecker: false,
      lint: false,
      toolbar: [
        "bold",
        "italic",
        "heading",
        "|",
        "quote",
        "unordered-list",
        "ordered-list",
        "|",
        "preview",
        "side-by-side",
        "fullscreen",
      ],
      placeholder: "Écrivez votre texte en Markdown...",
    }),
    []
  );

  // Récupération des séjours depuis Firestore
  useEffect(() => {
    const fetchSejours = async () => {
      const querySnapshot = await getDocs(collection(db, "sejours"));
      const data = {};
      querySnapshot.forEach((docSnap) => {
        data[docSnap.id] = docSnap.data();
      });
      setSejours(data);
    };
    fetchSejours();
  }, []);

  // Fonction pour ajouter un nouveau séjour
  const handleAddSejour = async () => {
    const defaultSejour = {
      name: "Nouveau séjour",
      heroSubtitle: "",
      heroImage: "",
      summarySubsections: [],
      sections: [],
      dates: [],
      stations: [],
      ageGroups: [],
    };

    try {
      const docRef = await addDoc(collection(db, "sejours"), defaultSejour);
      setSejours((prev) => ({ ...prev, [docRef.id]: defaultSejour }));
      setSelectedSejour(docRef.id);
      setSejourData(defaultSejour);
      setActiveTab("general");
      setActiveSectionIndex(0);
      setActiveSubSectionIndex(0);
      setActiveSummarySubSectionIndex(0);
      alert("Nouveau séjour ajouté !");
    } catch (error) {
      console.error("Erreur lors de l'ajout du séjour", error);
      alert("Erreur lors de l'ajout du séjour");
    }
  };

  // Lors de la sélection d'un séjour, charge ses données et réinitialise les onglets
  const handleSelectSejour = (id) => {
    setSelectedSejour(id);
    setSejourData(sejours[id]);
    setActiveTab("general");
    setActiveSectionIndex(0);
    setActiveSubSectionIndex(0);
    setActiveSummarySubSectionIndex(0);
  };

  // Mise à jour d'une propriété simple
  const handleChange = (key, value) => {
    setSejourData((prev) => ({ ...prev, [key]: value }));
  };

  // Upload d'image (hero ou autre)
  const handleImageUpload = async (event, key) => {
    const file = event.target.files[0];
    if (!file) return;
    const storageRef = ref(storage, `sejours/${selectedSejour}/${file.name}`);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);
    setSejourData((prev) => ({ ...prev, [key]: downloadURL }));
  };

  /* ---------------------------
     Gestion des sous‑sections du résumé
  --------------------------- */
  const handleSummarySubSectionChange = (index, field, value) => {
    const summarySubsections = [...(sejourData.summarySubsections || [])];
    summarySubsections[index] = { ...summarySubsections[index], [field]: value };
    setSejourData((prev) => ({ ...prev, summarySubsections }));
  };

  const handleSummaryImageUpload = async (event, index) => {
    const file = event.target.files[0];
    if (!file) return;
    const storageRef = ref(
      storage,
      `sejours/${selectedSejour}/summarySubsections/${index}/${file.name}`
    );
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);
    const summarySubsections = [...(sejourData.summarySubsections || [])];
    summarySubsections[index] = { ...summarySubsections[index], imageSrc: downloadURL };
    setSejourData((prev) => ({ ...prev, summarySubsections }));
    try {
      const docRef = doc(db, "sejours", selectedSejour);
      await updateDoc(docRef, { summarySubsections });
      console.log(`Image de la sous-section résumé ${index} mise à jour`);
    } catch (error) {
      console.error("Erreur lors de la mise à jour de l'image du résumé", error);
    }
  };

  const addSummarySubsection = () => {
    const summarySubsections = [...(sejourData.summarySubsections || [])];
    summarySubsections.push({ title: "", text: "", imageSrc: "" });
    setSejourData((prev) => ({ ...prev, summarySubsections }));
    setActiveSummarySubSectionIndex(summarySubsections.length - 1);
  };

  const removeSummarySubsection = (index) => {
    let summarySubsections = sejourData.summarySubsections || [];
    summarySubsections = summarySubsections.filter((_, i) => i !== index);
    setSejourData((prev) => ({ ...prev, summarySubsections }));
    if (activeSummarySubSectionIndex >= summarySubsections.length) {
      setActiveSummarySubSectionIndex(summarySubsections.length - 1);
    }
  };

  /* ---------------------------
     Gestion des Sections et de leurs sous‑sections
  --------------------------- */
  const addSection = () => {
    const updatedSections = [
      ...(sejourData.sections || []),
      { subSections: [{ title: "", text: "", imageSrc: "" }] },
    ];
    setSejourData((prev) => ({ ...prev, sections: updatedSections }));
    setActiveSectionIndex(updatedSections.length - 1);
    setActiveSubSectionIndex(0);
  };

  const removeSection = (index) => {
    const updatedSections = sejourData.sections.filter((_, i) => i !== index);
    setSejourData((prev) => ({ ...prev, sections: updatedSections }));
    if (activeSectionIndex >= updatedSections.length) {
      setActiveSectionIndex(updatedSections.length - 1);
      setActiveSubSectionIndex(0);
    }
  };

  const addSubSection = () => {
    const updatedSections = [...(sejourData.sections || [])];
    const currentSection = updatedSections[activeSectionIndex];
    if (!currentSection.subSections) {
      currentSection.subSections = [];
    }
    currentSection.subSections.push({ title: "", text: "", imageSrc: "" });
    updatedSections[activeSectionIndex] = currentSection;
    setSejourData((prev) => ({ ...prev, sections: updatedSections }));
    setActiveSubSectionIndex(currentSection.subSections.length - 1);
  };

  const removeSubSection = (sectionIndex, subSectionIndex) => {
    const updatedSections = [...(sejourData.sections || [])];
    const currentSection = updatedSections[sectionIndex];
    if (!currentSection.subSections) return;
    currentSection.subSections = currentSection.subSections.filter((_, i) => i !== subSectionIndex);
    updatedSections[sectionIndex] = currentSection;
    setSejourData((prev) => ({ ...prev, sections: updatedSections }));
    if (activeSubSectionIndex >= currentSection.subSections.length) {
      setActiveSubSectionIndex(currentSection.subSections.length - 1);
    }
  };

  const handleSectionSubSectionChange = (sectionIndex, subSectionIndex, field, value) => {
    const updatedSections = [...(sejourData.sections || [])];
    const subSections = [...(updatedSections[sectionIndex].subSections || [])];
    subSections[subSectionIndex] = { ...subSections[subSectionIndex], [field]: value };
    updatedSections[sectionIndex] = { ...updatedSections[sectionIndex], subSections };
    setSejourData((prev) => ({ ...prev, sections: updatedSections }));
  };

  const handleSectionSubImageUpload = async (sectionIndex, subSectionIndex, event) => {
    const file = event.target.files[0];
    if (!file) return;
    const storageRef = ref(
      storage,
      `sejours/${selectedSejour}/sections/${sectionIndex}/subsections/${subSectionIndex}/${file.name}`
    );
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);
    const updatedSections = [...(sejourData.sections || [])];
    const subSections = [...(updatedSections[sectionIndex].subSections || [])];
    subSections[subSectionIndex] = { ...subSections[subSectionIndex], imageSrc: downloadURL };
    updatedSections[sectionIndex] = { ...updatedSections[sectionIndex], subSections };
    setSejourData((prev) => ({ ...prev, sections: updatedSections }));
    try {
      const docRef = doc(db, "sejours", selectedSejour);
      await updateDoc(docRef, { sections: updatedSections });
      console.log(
        `Image de la sous-section ${subSectionIndex} de la section ${sectionIndex} mise à jour`
      );
    } catch (error) {
      console.error("Erreur lors de la mise à jour de l'image de la sous-section", error);
    }
  };

  /* ---------------------------
     Dates, Stations, Tranches d'âge
  --------------------------- */
  const handleArrayItemChange = (arrayKey, index, field, value) => {
    const updatedArray = [...(sejourData[arrayKey] || [])];
    updatedArray[index] = { ...updatedArray[index], [field]: value };
    setSejourData((prev) => ({ ...prev, [arrayKey]: updatedArray }));
  };

  const handleDateChange = (index, field, date) => {
    const updatedDates = [...(sejourData.dates || [])];
    updatedDates[index] = { ...updatedDates[index], [field]: date.toISOString() };
    setSejourData((prev) => ({ ...prev, dates: updatedDates }));
  };

  const addDate = () => {
    const updatedDates = [
      ...(sejourData.dates || []),
      { startDate: new Date().toISOString(), endDate: new Date().toISOString() },
    ];
    setSejourData((prev) => ({ ...prev, dates: updatedDates }));
  };

  const removeDate = (index) => {
    const updatedDates = sejourData.dates.filter((_, i) => i !== index);
    setSejourData((prev) => ({ ...prev, dates: updatedDates }));
  };

  const handleStationChange = (index, field, value) => {
    handleArrayItemChange("stations", index, field, value);
  };

  const addStation = () => {
    const updatedStations = [
      ...(sejourData.stations || []),
      { name: "", priceExtra: 0 },
    ];
    setSejourData((prev) => ({ ...prev, stations: updatedStations }));
  };

  const removeStation = (index) => {
    const updatedStations = sejourData.stations.filter((_, i) => i !== index);
    setSejourData((prev) => ({ ...prev, stations: updatedStations }));
  };

  const addAgeGroup = (age) => {
    const updatedAges = [...(sejourData.ageGroups || []), age];
    setSejourData((prev) => ({ ...prev, ageGroups: updatedAges }));
  };

  const removeAgeGroup = (age) => {
    const updatedAges = (sejourData.ageGroups || []).filter((a) => a !== age);
    setSejourData((prev) => ({ ...prev, ageGroups: updatedAges }));
  };

  /* ---------------------------
     Sauvegarde globale dans Firestore
  --------------------------- */
  const handleSave = async () => {
    if (!selectedSejour || !sejourData) return;
    setIsSaving(true);
    try {
      const docRef = doc(db, "sejours", selectedSejour);
      await updateDoc(docRef, sejourData);
      alert("Modifications sauvegardées !");
    } catch (error) {
      console.error("Erreur lors de la sauvegarde", error);
      alert("Erreur lors de la sauvegarde");
    }
    setIsSaving(false);
  };

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-center">Édition des Séjours</h1>

      {/* Bouton pour ajouter un nouveau séjour */}
      <div className="mb-4">
        <button
          onClick={handleAddSejour}
          className="bg-green-500 text-white px-4 py-2 rounded-md"
        >
          + Ajouter un séjour
        </button>
      </div>

      <div className="mb-6">
        <label className="block mb-2 font-medium">Choisissez un séjour</label>
        <select
          value={selectedSejour}
          onChange={(e) => handleSelectSejour(e.target.value)}
          className="w-full p-2 border rounded-md"
        >
          <option value="">-- Sélectionnez --</option>
          {Object.entries(sejours).map(([id, data]) => (
            <option key={id} value={id}>
              {data.name}
            </option>
          ))}
        </select>
        {selectedSejour && (
          <div className="mt-2">
            <Link href={`/sejours/${selectedSejour}`}>
              <span className="text-blue-600 underline">Voir le séjour</span>
            </Link>
          </div>
        )}
      </div>

      {sejourData && (
        <div className="bg-white shadow rounded-lg p-6">
          {/* Navigation des onglets */}
          <div className="mb-4 border-b">
            <nav className="flex space-x-4">
              <button
                onClick={() => setActiveTab("general")}
                className={`px-4 py-2 ${
                  activeTab === "general"
                    ? "border-b-2 border-blue-600 font-semibold"
                    : "text-gray-600"
                }`}
              >
                Général
              </button>
              <button
                onClick={() => setActiveTab("summary")}
                className={`px-4 py-2 ${
                  activeTab === "summary"
                    ? "border-b-2 border-blue-600 font-semibold"
                    : "text-gray-600"
                }`}
              >
                Résumé
              </button>
              <button
                onClick={() => setActiveTab("sections")}
                className={`px-4 py-2 ${
                  activeTab === "sections"
                    ? "border-b-2 border-blue-600 font-semibold"
                    : "text-gray-600"
                }`}
              >
                Sections
              </button>
              <button
                onClick={() => setActiveTab("dates")}
                className={`px-4 py-2 ${
                  activeTab === "dates"
                    ? "border-b-2 border-blue-600 font-semibold"
                    : "text-gray-600"
                }`}
              >
                Dates
              </button>
              <button
                onClick={() => setActiveTab("pricing")}
                className={`px-4 py-2 ${
                  activeTab === "pricing"
                    ? "border-b-2 border-blue-600 font-semibold"
                    : "text-gray-600"
                }`}
              >
                Tarification & Transport
              </button>
              <button
                onClick={() => setActiveTab("stations")}
                className={`px-4 py-2 ${
                  activeTab === "stations"
                    ? "border-b-2 border-blue-600 font-semibold"
                    : "text-gray-600"
                }`}
              >
                Stations
              </button>
            </nav>
          </div>

          {/* Contenu des onglets */}
          <div className="mt-4">
            {/* Onglet Général */}
            {activeTab === "general" && (
              <div className="space-y-4">
                <div>
                  <label className="block font-medium">Nom du séjour</label>
                  <input
                    type="text"
                    value={sejourData.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    className="w-full p-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium">Sous-titre</label>
                  <textarea
                    value={sejourData.heroSubtitle}
                    onChange={(e) => handleChange("heroSubtitle", e.target.value)}
                    className="w-full p-2 border rounded-md"
                    rows="3"
                  ></textarea>
                </div>
                <div>
                  <label className="block font-medium">Image principale</label>
                  <label className="cursor-pointer inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
                    <FaUpload className="mr-2" />
                    Télécharger une image
                    <input
                      type="file"
                      onChange={(e) => handleImageUpload(e, "heroImage")}
                      className="hidden"
                    />
                  </label>
                  {sejourData.heroImage && (
                    <img
                      src={sejourData.heroImage}
                      alt="Hero"
                      className="w-40 mt-2 rounded-md"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Onglet Résumé */}
            {activeTab === "summary" && (
              <div>
                <div className="mb-4 border-b">
                  <nav className="flex space-x-4">
                    {(sejourData.summarySubsections || []).map((sub, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveSummarySubSectionIndex(idx)}
                        className={`px-4 py-2 ${
                          activeSummarySubSectionIndex === idx
                            ? "border-b-2 border-blue-600 font-semibold"
                            : "text-gray-600"
                        }`}
                      >
                        {sub.title ? sub.title : `Sous-section ${idx + 1}`}
                      </button>
                    ))}
                    <button
                      onClick={addSummarySubsection}
                      className="px-4 py-2 text-green-500 font-semibold"
                    >
                      + Ajouter
                    </button>
                  </nav>
                </div>
                {sejourData.summarySubsections &&
                  sejourData.summarySubsections[activeSummarySubSectionIndex] && (
                    <div className="space-y-4">
                      <div>
                        <label className="block font-medium">
                          Titre de la sous-section
                        </label>
                        <input
                          type="text"
                          value={
                            sejourData.summarySubsections[activeSummarySubSectionIndex].title || ""
                          }
                          onChange={(e) =>
                            handleSummarySubSectionChange(
                              activeSummarySubSectionIndex,
                              "title",
                              e.target.value
                            )
                          }
                          className="w-full p-2 border rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block font-medium">
                          Texte de la sous-section
                        </label>
                        <SimpleMDEEditor
                          value={
                            sejourData.summarySubsections[activeSummarySubSectionIndex].text || ""
                          }
                          onChange={(value) =>
                            handleSummarySubSectionChange(
                              activeSummarySubSectionIndex,
                              "text",
                              value
                            )
                          }
                          options={simpleMDEOptions}
                        />
                      </div>
                      <div className="mt-2">
                        <label className="block font-medium">
                          Image de la sous-section
                        </label>
                        <label className="cursor-pointer inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
                          <FaUpload className="mr-2" />
                          Télécharger une image
                          <input
                            type="file"
                            onChange={(e) =>
                              handleSummaryImageUpload(e, activeSummarySubSectionIndex)
                            }
                            className="hidden"
                          />
                        </label>
                        {sejourData.summarySubsections[activeSummarySubSectionIndex].imageSrc && (
                          <img
                            src={sejourData.summarySubsections[activeSummarySubSectionIndex].imageSrc}
                            alt="Sous-section"
                            className="w-40 mt-2 rounded-md"
                          />
                        )}
                      </div>
                      <button
                        onClick={() => removeSummarySubsection(activeSummarySubSectionIndex)}
                        className="bg-red-500 text-white px-4 py-2 rounded-md"
                      >
                        <FaTrash className="inline mr-2" /> Supprimer cette sous-section
                      </button>
                    </div>
                  )}
              </div>
            )}

            {/* Onglet Sections */}
            {activeTab === "sections" && (
              <div>
                <div className="mb-4 border-b">
                  <nav className="flex space-x-4">
                    {sejourData.sections &&
                      sejourData.sections.map((section, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setActiveSectionIndex(index);
                            setActiveSubSectionIndex(0);
                          }}
                          className={`px-4 py-2 ${
                            activeSectionIndex === index
                              ? "border-b-2 border-blue-600 font-semibold"
                              : "text-gray-600"
                          }`}
                        >
                          {section.subSections &&
                          section.subSections[0] &&
                          section.subSections[0].title
                            ? section.subSections[0].title
                            : `Section ${index + 1}`}
                        </button>
                      ))}
                    <button
                      onClick={addSection}
                      className="px-4 py-2 text-green-500 font-semibold"
                    >
                      + Ajouter
                    </button>
                  </nav>
                </div>
                {sejourData.sections && sejourData.sections[activeSectionIndex] && (
                  <div>
                    <div className="mb-4 border-b">
                      <nav className="flex space-x-4">
                        {(sejourData.sections[activeSectionIndex].subSections || []).map(
                          (sub, idx) => (
                            <button
                              key={idx}
                              onClick={() => setActiveSubSectionIndex(idx)}
                              className={`px-4 py-2 ${
                                activeSubSectionIndex === idx
                                  ? "border-b-2 border-blue-600 font-semibold"
                                  : "text-gray-600"
                              }`}
                            >
                              {sub.title ? sub.title : `Sous-section ${idx + 1}`}
                            </button>
                          )
                        )}
                        <button
                          onClick={addSubSection}
                          className="px-4 py-2 text-green-500 font-semibold"
                        >
                          + Ajouter
                        </button>
                      </nav>
                    </div>
                    {sejourData.sections[activeSectionIndex].subSections &&
                      sejourData.sections[activeSectionIndex].subSections[activeSubSectionIndex] && (
                        <div className="space-y-4">
                          <div>
                            <label className="block font-medium">
                              Titre de la sous-section
                            </label>
                            <input
                              type="text"
                              value={
                                sejourData.sections[activeSectionIndex].subSections[activeSubSectionIndex]
                                  .title || ""
                              }
                              onChange={(e) =>
                                handleSectionSubSectionChange(
                                  activeSectionIndex,
                                  activeSubSectionIndex,
                                  "title",
                                  e.target.value
                                )
                              }
                              className="w-full p-2 border rounded-md"
                            />
                          </div>
                          <div>
                            <label className="block font-medium">
                              Texte de la sous-section
                            </label>
                            <SimpleMDEEditor
                              value={
                                sejourData.sections[activeSectionIndex].subSections[activeSubSectionIndex].text || ""
                              }
                              onChange={(value) =>
                                handleSectionSubSectionChange(
                                  activeSectionIndex,
                                  activeSubSectionIndex,
                                  "text",
                                  value
                                )
                              }
                              options={simpleMDEOptions}
                            />
                          </div>
                          <div className="mt-2">
                            <label className="block font-medium">
                              Image de la sous-section
                            </label>
                            <label className="cursor-pointer inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
                              <FaUpload className="mr-2" />
                              Télécharger une image
                              <input
                                type="file"
                                onChange={(e) =>
                                  handleSectionSubImageUpload(activeSectionIndex, activeSubSectionIndex, e)
                                }
                                className="hidden"
                              />
                            </label>
                            {sejourData.sections[activeSectionIndex].subSections[activeSubSectionIndex]
                              .imageSrc && (
                              <img
                                src={
                                  sejourData.sections[activeSectionIndex].subSections[activeSubSectionIndex]
                                    .imageSrc
                                }
                                alt="Sous-section"
                                className="w-40 mt-2 rounded-md"
                              />
                            )}
                          </div>
                          <button
                            onClick={() =>
                              removeSubSection(activeSectionIndex, activeSubSectionIndex)
                            }
                            className="bg-red-500 text-white px-4 py-2 rounded-md"
                          >
                            <FaTrash className="inline mr-2" /> Supprimer cette sous-section
                          </button>
                        </div>
                      )}
                    <button
                      onClick={() => removeSection(activeSectionIndex)}
                      className="bg-red-500 text-white px-4 py-2 rounded-md mt-4"
                    >
                      <FaTrash className="inline mr-2" /> Supprimer cette section
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Onglet Dates */}
            {activeTab === "dates" && (
              <div className="space-y-4">
                {sejourData.dates &&
                  sejourData.dates.map((dateObj, index) => (
                    <div key={index} className="p-4 border rounded-md">
                      <div className="flex items-center space-x-4">
                        <div>
                          <label className="block font-medium">Date de début</label>
                          <DatePicker
                            selected={dateObj.startDate ? new Date(dateObj.startDate) : null}
                            onChange={(date) => handleDateChange(index, "startDate", date)}
                            className="p-2 border rounded-md"
                            dateFormat="yyyy-MM-dd"
                          />
                        </div>
                        <div>
                          <label className="block font-medium">Date de fin</label>
                          <DatePicker
                            selected={dateObj.endDate ? new Date(dateObj.endDate) : null}
                            onChange={(date) => handleDateChange(index, "endDate", date)}
                            className="p-2 border rounded-md"
                            dateFormat="yyyy-MM-dd"
                          />
                        </div>
                        <button
                          onClick={() => removeDate(index)}
                          className="text-red-500 ml-4"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                  ))}
                <button
                  onClick={addDate}
                  className="mt-2 bg-green-500 text-white px-4 py-2 rounded-md inline-flex items-center"
                >
                  <FaPlus className="mr-2" /> Ajouter une date
                </button>
              </div>
            )}

            {/* Onglet Tarification & Transport */}
            {activeTab === "pricing" && (
              <div className="space-y-4">
                <div>
                  <label className="block font-medium">Prix de base</label>
                  <input
                    type="number"
                    value={sejourData.basePrice}
                    onChange={(e) =>
                      handleChange("basePrice", parseFloat(e.target.value))
                    }
                    className="w-full p-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium">Mode de transport</label>
                  <select
                    value={sejourData.transportMode}
                    onChange={(e) => handleChange("transportMode", e.target.value)}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="Train">Train</option>
                    <option value="Bus">Bus</option>
                    <option value="Voiture">Voiture</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-2">Tranches d'âge</label>
                  <div className="flex flex-wrap gap-2">
                    {(sejourData.ageGroups || []).map((age, index) => (
                      <div
                        key={index}
                        className="flex items-center bg-gray-200 px-2 py-1 rounded"
                      >
                        <span>{age}</span>
                        <button onClick={() => removeAgeGroup(age)} className="ml-1 text-red-500">
                          <FaTrash />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex">
                    <input
                      type="text"
                      placeholder="Nouvelle tranche d'âge"
                      value={newAgeGroup}
                      onChange={(e) => setNewAgeGroup(e.target.value)}
                      className="p-2 border rounded-l-md flex-1"
                    />
                    <button
                      onClick={() => {
                        if (newAgeGroup.trim() !== "") {
                          addAgeGroup(newAgeGroup.trim());
                          setNewAgeGroup("");
                        }
                      }}
                      className="bg-green-500 text-white px-4 rounded-r-md"
                    >
                      Ajouter
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Onglet Stations */}
            {activeTab === "stations" && (
              <div className="space-y-4">
                {sejourData.stations &&
                  sejourData.stations.map((station, index) => (
                    <div key={index} className="p-4 border rounded-md">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-semibold">Station {index + 1}</h3>
                        <button onClick={() => removeStation(index)} className="text-red-500">
                          <FaTrash />
                        </button>
                      </div>
                      <div className="mb-2">
                        <label className="block font-medium">Nom de la station</label>
                        <input
                          type="text"
                          value={station.name}
                          onChange={(e) =>
                            handleStationChange(index, "name", e.target.value)
                          }
                          className="w-full p-2 border rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block font-medium">Prix supplémentaire</label>
                        <input
                          type="number"
                          value={station.priceExtra}
                          onChange={(e) =>
                            handleStationChange(
                              index,
                              "priceExtra",
                              parseFloat(e.target.value)
                            )
                          }
                          className="w-full p-2 border rounded-md"
                        />
                      </div>
                    </div>
                  ))}
                <button
                  onClick={addStation}
                  className="mt-2 bg-green-500 text-white px-4 py-2 rounded-md inline-flex items-center"
                >
                  <FaPlus className="mr-2" /> Ajouter une station
                </button>
              </div>
            )}
          </div>

          {/* Bouton de sauvegarde global */}
          <div className="mt-6">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition flex items-center justify-center"
            >
              {isSaving ? "Sauvegarde en cours..." : (<><FaSave className="mr-2" /> Sauvegarder</>)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Composant principal qui gère l'authentification
--------------------------------------------------------------------------- */
export default function EditSejour() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputPassword, setInputPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // Vérification dans le localStorage
  useEffect(() => {
    const authData = localStorage.getItem("colocrew_auth");
    if (authData) {
      try {
        const { expiry } = JSON.parse(authData);
        if (expiry && new Date().getTime() < expiry) {
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.error("Erreur lors de la lecture de l'authentification", err);
      }
    }
  }, []);

  // Vérification du mot de passe depuis Firebase
  const handleLogin = async () => {
    try {
      const docRef = doc(db, "ColoCrew", "dMSwY57fd61hF8861MyW");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const storedPassword = docSnap.data().password;
        if (inputPassword === storedPassword) {
          // Authentification réussie : mémorisation pour 7 jours
          const expiry = new Date().getTime() + 7 * 24 * 60 * 60 * 1000;
          localStorage.setItem("colocrew_auth", JSON.stringify({ expiry }));
          setIsAuthenticated(true);
          setAuthError("");
        } else {
          setAuthError("Mot de passe incorrect");
        }
      } else {
        setAuthError("Erreur : document d'authentification introuvable");
      }
    } catch (error) {
      console.error("Erreur lors de la vérification du mot de passe", error);
      setAuthError("Erreur lors de la vérification du mot de passe");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto p-6 bg-gray-50 min-h-screen flex flex-col justify-center">
        <h1 className="text-2xl font-bold mb-4 text-center">Authentification</h1>
        <div className="mb-4">
          <label className="block font-medium mb-2">Mot de passe</label>
          <input
            type="password"
            value={inputPassword}
            onChange={(e) => setInputPassword(e.target.value)}
            className="w-full p-2 border rounded-md"
          />
        </div>
        {authError && <div className="text-red-500 mb-4">{authError}</div>}
        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          Se connecter
        </button>
      </div>
    );
  }

  return <EditSejourContent />;
}
