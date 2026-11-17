export type ChaveTaxa = { forma: "debito" | "credito_vista" | "credito_parcelado"; parcelas: number; campo: string; rotulo: string };

/** Campos de taxa nas Configurações: débito, crédito à vista e crédito parcelado de 2x a 12x. */
export const CHAVES_TAXA: ChaveTaxa[] = [
  { forma: "debito", parcelas: 1, campo: "debito", rotulo: "Débito" },
  { forma: "credito_vista", parcelas: 1, campo: "credito_vista", rotulo: "Crédito à vista" },
  ...Array.from({ length: 11 }, (_, i) => ({
    forma: "credito_parcelado" as const,
    parcelas: i + 2,
    campo: `parcelado_${i + 2}`,
    rotulo: `Crédito ${i + 2}x`,
  })),
];
