import { useState } from "react";
import blairLogo from "../assets/Blair_Academy_white_transparent.png";
import AboutModal from "./AboutModal";

export default function Header() {
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  return (
    <header className="flex items-center gap-4 bg-navy px-6 py-2 shadow-md">
      <img src={blairLogo} alt="Blair Academy" className="h-24 w-auto" />
      <div>
        <h1 className="text-xl font-semibold text-white">Logbook</h1>
        <p className="text-sm text-offwhite/80">Ask Buc about Blair's policies</p>
      </div>
      <button
        onClick={() => setIsAboutOpen(true)}
        className="ml-auto flex items-center gap-1.5 rounded border border-white/30 px-3 py-1.5 text-sm text-white/90 hover:border-teal hover:text-teal"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a1 1 0 0 0 0 2h.01a1 1 0 0 0 0-2H9Zm0 2h1a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0v-2a1 1 0 0 1 0-2Z"
            clipRule="evenodd"
          />
        </svg>
        About
      </button>

      {isAboutOpen && <AboutModal onClose={() => setIsAboutOpen(false)} />}
    </header>
  );
}
