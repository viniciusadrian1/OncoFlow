/**
 * Gera o link da sala de videochamada com o paciente (Jitsi, como no IRIS).
 *
 * [PONTO DE INTEGRAÇÃO FUTURO]: substituir pelo provedor de chamadas definido com o hospital.
 * A assinatura deve continuar a mesma para que nenhuma tela precise mudar.
 */
export function iniciarVideochamada(pacienteId: string): string {
  const idLimpo = (pacienteId || 'paciente').replace(/[^a-zA-Z0-9]/g, '');
  return `https://meet.jit.si/OncoFlow-${idLimpo}-${Date.now()}`;
}
