export function normalizePhone(value: string, defaultCountry = "55"): string | null {
  const international = value.trimStart().startsWith("+") || value.replace(/\D/g, "").startsWith("00");
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (international) return digits.length >= 8 && digits.length <= 15 ? digits : null;
  if (digits.length === 10 || digits.length === 11) digits = `${defaultCountry}${digits}`;
  return digits.length >= 12 && digits.length <= 15 ? digits : null;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("INVALID_PHONE");
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message.trim())}`;
}

export function buildOutreachMessage(input: { name: string; title: string; company: string; context?: string | null; kind: "candidate_fit" | "connector_fit" }): string {
  const context = input.context?.trim() ? ` Pelo seu histórico em ${input.context.trim()}, seu nome me veio à cabeça.` : "";
  return input.kind === "candidate_fit"
    ? `Olá, ${input.name}! Estou trabalhando em uma oportunidade de ${input.title} na ${input.company}.${context} Posso compartilhar mais detalhes para entender se faz sentido para você?`
    : `Olá, ${input.name}! Estou buscando indicações para uma vaga de ${input.title} na ${input.company}.${context} Você conhece alguém que poderia ter um bom fit?`;
}
