import blairLogo from "../assets/Blair_Academy_white_transparent.png";

export default function Header() {
  return (
    <header className="flex items-center gap-4 bg-navy px-6 py-4 shadow-md">
      <img src={blairLogo} alt="Blair Academy" className="h-24 w-auto" />
      <div>
        <h1 className="text-xl font-semibold text-white">Logbook</h1>
        <p className="text-sm text-offwhite/80">Ask Buc about Blair's policies</p>
      </div>
    </header>
  );
}
