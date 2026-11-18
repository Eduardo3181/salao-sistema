import { Download } from "lucide-react";

/** Dois botões: baixar em PDF e em Excel. `href` é o endereço de download sem o formato. */
export function BotoesBaixar({ href }: { href: string }) {
  const junta = href.includes("?") ? "&" : "?";
  const classe = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white";
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <a href={`${href}${junta}formato=pdf`} className={classe} download>
        <Download aria-hidden className="h-4 w-4" /> Baixar PDF
      </a>
      <a href={`${href}${junta}formato=xlsx`} className={classe} download>
        <Download aria-hidden className="h-4 w-4" /> Baixar Excel
      </a>
    </div>
  );
}
