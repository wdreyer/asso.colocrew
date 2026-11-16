"use client";

import { FaArrowDown } from "react-icons/fa";
import { VOLUNTEER_PICK_EVENT } from "./VolunteerForm";
import styles from "./edito.module.css";

/** Pre-checks the mission and scrolls to the participation form. */
export default function MissionButton({ interests, label = "Ça m'intéresse" }) {
  return (
    <button
      type="button"
      className={styles.missionButton}
      onClick={() => window.dispatchEvent(new CustomEvent(VOLUNTEER_PICK_EVENT, { detail: { interests } }))}
    >
      {label} <FaArrowDown />
    </button>
  );
}
