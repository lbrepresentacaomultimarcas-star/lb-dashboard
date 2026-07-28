/**
 * Frases, saudação e lembretes do Painel Inteligente do Dashboard.
 * Tudo determinístico por DIA (mesmo dia → mesma frase), então muda sozinho
 * a cada dia sem precisar de banco.
 */

/** Índice do dia no ano (1..366) — base da rotação diária. */
function diaDoAno(d: Date): number {
  const inicio = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - inicio.getTime()) / 86_400_000);
}

export const FRASES_MOTIVACIONAIS: string[] = [
  "Grandes resultados são construídos por pequenas ações diárias.",
  "Quem acompanha mais, vende mais.",
  "Cada ligação feita hoje pode ser a venda que mudará o seu mês.",
  "O sucesso pertence a quem não desiste no primeiro não.",
  "Disciplina supera talento quando o talento não trabalha.",
  "Foco no próximo passo: uma conversa de cada vez.",
  "Vendas se ganham no acompanhamento, não na sorte.",
  "O melhor momento para ligar para o cliente é agora.",
  "Consistência hoje vira resultado amanhã.",
  "Cada 'não' te aproxima do próximo 'sim'.",
  "Quem organiza a carteira, colhe o fechamento.",
  "Atitude positiva abre portas que argumento nenhum abre.",
  "Meta não se olha, se persegue todos os dias.",
  "Clientes lembram de quem lembra deles.",
  "Trabalhe enquanto eles dormem; feche enquanto eles pensam.",
  "Pequenos ajustes diários geram grandes viradas de mês.",
  "O disciplinado chega onde o motivado só sonha.",
  "Faça o básico bem feito — todos os dias.",
];

export const LEMBRETES_PADRAO: string[] = [
  "Faça o acompanhamento dos clientes antigos.",
  "Atualize todas as observações no CRM.",
  "Nenhum cliente deve ficar sem retorno hoje.",
  "Verifique seus clientes agendados.",
  "Revise os clientes perdidos para recuperação.",
];

/** Frase motivacional do dia (rotaciona automaticamente). */
export function fraseDoDia(d: Date = new Date()): string {
  return FRASES_MOTIVACIONAIS[diaDoAno(d) % FRASES_MOTIVACIONAIS.length];
}

/** Lembrete padrão do dia (usado quando o admin não definiu um texto). */
export function lembreteDoDia(d: Date = new Date()): string {
  return LEMBRETES_PADRAO[diaDoAno(d) % LEMBRETES_PADRAO.length];
}

/** Saudação conforme o horário. */
export function saudacaoDoHorario(hora: number = new Date().getHours()): {
  emoji: string;
  texto: string;
} {
  if (hora < 12) return { emoji: "🌅", texto: "Bom dia" };
  if (hora < 18) return { emoji: "☀️", texto: "Boa tarde" };
  return { emoji: "🌙", texto: "Boa noite" };
}
