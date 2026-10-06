import Link from "next/link";

// Matches the Zaroda KSEF footer: a navy ribbon kept at the bottom while the
// page scrolls. Small screens drop the tagline and links to stay on one line.
export function SiteFooter() {
  return (
    <footer className="no-print sticky bottom-0 z-40 bg-[#0a1633] px-2 py-[0.45rem] text-center text-[0.66rem] text-white/80 shadow-[0_-2px_10px_rgba(5,12,35,0.25)] min-[381px]:text-[0.72rem] min-[701px]:px-4 min-[701px]:py-[0.6rem] min-[701px]:text-[0.8rem] [&_a]:text-[#c99a2e]">
      <span className="hidden min-[701px]:inline">Powered by </span>
      <strong className="text-white">ZARODA SOLUTIONS</strong>
      <span className="hidden min-[701px]:inline"> - Innovative. Reliable. Forward.</span> · WhatsApp{" "}
      <a href="https://wa.me/254781230805" target="_blank" rel="noopener noreferrer">
        0781230805
      </a>{" "}
      · Call <a href="tel:+254724282065">0724282065</a>
      <span className="hidden min-[701px]:inline">
        {" "}
        · <Link href="/guide">User guide</Link> · <Link href="/contacts">Contact</Link>
      </span>
    </footer>
  );
}
