/**
 * Traduz o erro do Supabase pra uma frase que diz o que fazer.
 *
 * As mensagens originais vêm em inglês e algumas são enganosas fora de
 * contexto: "Invalid login credentials" aparece tanto pra senha errada
 * quanto pra usuário que nem existe (de propósito, pra não revelar quais
 * e-mails estão cadastrados).
 */
const MAPA: { contem: string; texto: string }[] = [
  {
    contem: "invalid login credentials",
    texto: "E-mail ou senha incorretos.",
  },
  {
    contem: "email not confirmed",
    texto:
      "Esta conta ainda não foi confirmada. Confirme pelo e-mail recebido ou desligue a confirmação no Supabase.",
  },
  {
    contem: "user already registered",
    texto: "Já existe uma conta com esse e-mail. Tente entrar.",
  },
  {
    contem: "already been registered",
    texto: "Já existe uma conta com esse e-mail. Tente entrar.",
  },
  {
    contem: "password should be at least",
    texto: "A senha precisa ter pelo menos 6 caracteres.",
  },
  {
    contem: "signups not allowed",
    texto:
      "O cadastro está desativado no Supabase. Ligue em Authentication > Sign In / Providers > Allow new users to sign up.",
  },
  {
    contem: "unable to validate email address",
    texto: "Esse e-mail não parece válido.",
  },
  {
    contem: "new password should be different",
    texto: "A senha nova precisa ser diferente da atual.",
  },
  {
    contem: "for security purposes",
    texto: "Muitas tentativas seguidas. Espere alguns segundos e tente de novo.",
  },
  {
    contem: "rate limit",
    texto: "Muitas tentativas seguidas. Espere um pouco e tente de novo.",
  },
  {
    contem: "failed to fetch",
    texto: "Sem conexão com o servidor. Verifique a internet.",
  },
];

export function traduzErroAuth(erro: unknown): string {
  const bruto =
    erro instanceof Error
      ? erro.message
      : typeof erro === "string"
        ? erro
        : (erro as { message?: string })?.message ?? "";

  const normalizado = bruto.toLowerCase();
  const achado = MAPA.find((m) => normalizado.includes(m.contem));
  if (achado) return achado.texto;

  // Sem tradução conhecida: devolve o original em vez de esconder o
  // problema atrás de um "erro inesperado" que não ajuda a resolver.
  return bruto || "Não foi possível concluir. Tente de novo.";
}
