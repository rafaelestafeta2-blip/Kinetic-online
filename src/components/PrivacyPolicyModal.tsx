import React, { useState } from 'react';
import { soundEngine } from '../audio/soundEngine';

interface PrivacyPolicyModalProps {
  visible: boolean;
  isStandalonePage?: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({
  visible,
  isStandalonePage = false,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'PRIVACY' | 'TERMS' | 'DATA_DELETION'>('PRIVACY');

  if (!visible) return null;

  const handleClose = () => {
    soundEngine.playMenuSelect();
    onClose();
  };

  return (
    <div
      onClick={() => {
        if (!isStandalonePage) handleClose();
      }}
      className="fixed inset-0 z-[95] bg-[#04060a]/95 backdrop-blur-xl text-slate-200 flex items-center justify-center p-3 sm:p-6 overflow-y-auto select-none font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[92dvh] bg-[#0a0e17] border border-amber-500/35 rounded-xl shadow-[0_24px_80px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden"
      >
        {/* Top Bar */}
        <header className="px-4 sm:px-6 py-3 border-b border-white/10 bg-[#0d121d] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-4 rounded-xs bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.85)]" />
            <div>
              <h1 className="font-display font-black text-sm sm:text-base tracking-[0.12em] text-white uppercase">
                KINETIC // TACTICAL FPS · CENTRAL JURÍDICA &amp; PRIVACIDADE
              </h1>
              <div className="font-mono text-[9px] text-slate-400 uppercase tracking-wider">
                Conformidade LGPD (Brasil) · GDPR · Google Play Store Data Safety
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-black/50 p-0.5 rounded-lg border border-white/10">
              {(
                [
                  ['PRIVACY', 'Política de Privacidade'],
                  ['TERMS', 'Termos de Uso'],
                  ['DATA_DELETION', 'Exclusão de Dados'],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    soundEngine.playMenuSelect();
                    setActiveTab(tab);
                  }}
                  className={`px-2.5 py-1 rounded-md font-display font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer ${
                    activeTab === tab
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/15 font-mono text-[10px] font-bold text-slate-200 hover:text-white uppercase cursor-pointer"
            >
              {isStandalonePage ? 'IR PARA O JOGO ▶' : 'FECHAR ✕'}
            </button>
          </div>
        </header>

        {/* Scrollable Legal Document Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs sm:text-sm leading-relaxed text-slate-300 select-text">
          {activeTab === 'PRIVACY' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-mono">
                <strong>Última atualização:</strong> Novembro de 2026 · Aplicável ao aplicativo Android (<code>com.kineticlabs.tacticalfps</code>) e versão Web oficial de <strong>KINETIC // Tactical FPS</strong>.
              </div>

              <section className="space-y-1.5">
                <h2 className="font-display font-bold text-amber-400 uppercase tracking-wider text-sm">
                  1. Dados Coletados e Finalidade
                </h2>
                <p>
                  O <strong>KINETIC // Tactical FPS</strong> coleta apenas o mínimo estritamente necessário para autenticação, salvamento de progresso em nuvem e partidas multiplayer competitivas 5v5:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-300">
                  <li>
                    <strong>Identificador de Conta (Firebase Authentication UID):</strong> Utilizado via Login com Google para vincular seu progresso, nome de operador (Callsign único), patente, MMR, clã, faixas de perfil e inventário de armas na nuvem.
                  </li>
                  <li>
                    <strong>Segurança e Privacidade de E-mail (Zero PII Público):</strong> Seu endereço de e-mail <strong>nunca</strong> é gravado nem exibido nos documentos públicos de jogadores ou placares (<code>/players/&#123;userId&#125;</code>). Apenas seu Callsign escolhido, foto/avatar opcional e estatísticas de partida são visíveis para outros jogadores.
                  </li>
                  <li>
                    <strong>Áudio e Microfone (Rádio Tático WebRTC):</strong> Quando você ativa o botão de microfone (PTT ou Voz Aberta) em uma sala de esquadrão ou partida 5v5, o áudio é transmitido em tempo real exclusivamente para os membros da sua equipe e <strong>nunca é gravado ou armazenado</strong> em nossos servidores.
                  </li>
                  <li>
                    <strong>Telemetria Técnica Anônima de Desempenho:</strong> Taxa de quadros (FPS), tempo de carregamento de mapas e latência (ping) são processados sem identificação pessoal para calibrar automaticamente a resolução dinâmica (DRS) e evitar superaquecimento em dispositivos móveis.
                  </li>
                </ul>
              </section>

              <section className="space-y-1.5">
                <h2 className="font-display font-bold text-amber-400 uppercase tracking-wider text-sm">
                  2. Armazenamento Local e Pacotes 3D (Cache Storage)
                </h2>
                <p>
                  Para evitar downloads repetidos de mapas, operadores e armas 3D, o jogo armazena pacotes de recursos (<code>kinetic-resource-packs-v1</code>) e configurações gráficas localmente na memória do seu dispositivo. Você pode gerenciar ou limpar esses pacotes a qualquer momento na <strong>Central de Downloads</strong> dentro do menu principal.
                </p>
              </section>

              <section className="space-y-1.5">
                <h2 className="font-display font-bold text-amber-400 uppercase tracking-wider text-sm">
                  3. Compras no Aplicativo (In-App Purchases)
                </h2>
                <p>
                  Todas as transações de pacotes de Diamantes e Passe VIP são processadas diretamente pelos gateways oficiais certificadores (<strong>Google Play Billing</strong> no Android ou <strong>Stripe</strong> na Web). O KINETIC // Tactical FPS não coleta nem armazena números de cartão de crédito ou dados bancários em seus servidores.
                </p>
              </section>

              <section className="space-y-1.5">
                <h2 className="font-display font-bold text-amber-400 uppercase tracking-wider text-sm">
                  4. Compartilhamento de Dados e Serviços de Terceiros
                </h2>
                <p>
                  Não vendemos, alugamos ou compartilhamos dados de usuários com redes de anúncios. Utilizamos exclusivamente:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Google Firebase (Authentication &amp; Cloud Firestore):</strong> Autenticação segura e banco de dados de progressão criptografado em trânsito (HTTPS/TLS).</li>
                  <li><strong>Cloudflare R2 CDN:</strong> Entrega otimizada de modelos 3D (.glb) e texturas do jogo.</li>
                </ul>
              </section>
            </div>
          )}

          {activeTab === 'TERMS' && (
            <div className="space-y-4">
              <section className="space-y-1.5">
                <h2 className="font-display font-bold text-amber-400 uppercase tracking-wider text-sm">
                  1. Regras de Jogo Limpo e Autoridade de Servidor (Anti-Cheat)
                </h2>
                <p>
                  Todas as partidas online (Casuais e Ranked 5v5) operam sob validação de autoridade do servidor (<code>combatAuthority</code>), que audita cadência de tiro, dano por arma, alcance balístico, velocidade de deslocamento e recibos assinados de recompensas. O uso de clientes modificados, automação, exploração de falhas ou comportamento tóxico no chat/rádio de voz poderá resultar em suspensão da conta ou reset de MMR.
                </p>
              </section>

              <section className="space-y-1.5">
                <h2 className="font-display font-bold text-amber-400 uppercase tracking-wider text-sm">
                  2. Progressão Oficial, Patentes e Clãs
                </h2>
                <p>
                  Recompensas de XP, Cash, MMR Ranked, medalhas e evolução de Clãs são concedidas exclusivamente em partidas online reais disputadas com outros jogadores humanos. Salas privadas de treino ou partidas com bots de IA destinam-se apenas a aquecimento tático e não concedem progressão de carreira.
                </p>
              </section>

              <section className="space-y-1.5">
                <h2 className="font-display font-bold text-amber-400 uppercase tracking-wider text-sm">
                  3. Itens Virtuais e Moedas do Jogo
                </h2>
                <p>
                  Cash ($), Diamantes, skins 3D, faixas de perfil animadas e insígnias são bens digitais licenciados para uso exclusivo dentro do jogo, não possuindo valor monetário fora da plataforma e não sendo conversíveis em moeda corrente.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'DATA_DELETION' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs font-mono">
                Em conformidade com a política de <strong>Segurança de Dados da Google Play Store</strong> e a <strong>LGPD</strong>, você possui controle total sobre seus dados diretamente dentro do aplicativo.
              </div>

              <section className="space-y-1.5">
                <h2 className="font-display font-bold text-amber-400 uppercase tracking-wider text-sm">
                  Como Redefinir ou Excluir Seus Dados de Conta Instantaneamente
                </h2>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>
                    Abra o <strong>KINETIC // Tactical FPS</strong> e faça login com sua Conta Google.
                  </li>
                  <li>
                    Toque no seu <strong>Card de Perfil do Operador</strong> (canto superior esquerdo do Menu Principal).
                  </li>
                  <li>
                    Utilize a opção de <strong>Resetar / Redefinir Conta</strong> ou desconecte sua Conta Google para limpar seu perfil de progressão no Cloud Firestore e no armazenamento local do aparelho.
                  </li>
                </ol>
              </section>

              <section className="space-y-1.5">
                <h2 className="font-display font-bold text-amber-400 uppercase tracking-wider text-sm">
                  Revogação de Permissões no Android / Google
                </h2>
                <p>
                  Você também pode revogar o acesso do aplicativo à sua Conta Google a qualquer momento em <code>myaccount.google.com/permissions</code> ou desativar a permissão de microfone nas Configurações do Android.
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-4 sm:px-6 py-2.5 border-t border-white/10 bg-[#0d121d] flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400 shrink-0">
          <span>URL PÚBLICA PARA GOOGLE PLAY: /privacy</span>
          <span>KINETIC LABS · TACTICAL FPS ENGINE</span>
        </footer>
      </div>
    </div>
  );
};
