import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import "../landing.css";
import { Nav, BarraFixaMobile } from "../components/landing/Nav.js";
import { BarraDeProgresso, Aurora, Reveal } from "../components/landing/Fx.js";
import { Marca } from "../components/Marca.js";

import imgLogin from "../assets/apresentacao/01-login.webp";
import imgEscolherPainel from "../assets/apresentacao/02-escolher-painel.webp";
import imgEscolherLoja from "../assets/apresentacao/03-escolher-loja.webp";
import imgDashboard from "../assets/apresentacao/04-dashboard.webp";
import imgReservas from "../assets/apresentacao/05-reservas-lista.webp";
import imgNovaReserva from "../assets/apresentacao/06-nova-reserva-modal.webp";
import imgSalao from "../assets/apresentacao/07-mesas-salao.webp";
import imgCardapioAdmin from "../assets/apresentacao/08-cardapio-admin.webp";
import imgHorarios from "../assets/apresentacao/09-horarios.webp";
import imgConversaAtendida from "../assets/apresentacao/10b-conversa-atendida.webp";
import imgConversaHumano from "../assets/apresentacao/10c-conversa-humano.webp";
import imgFilaEspera from "../assets/apresentacao/11-fila-espera.webp";
import imgRelatorios from "../assets/apresentacao/12-relatorios.webp";
import imgAgenteIa from "../assets/apresentacao/13-agente-ia.webp";
import imgWhatsapp from "../assets/apresentacao/14-whatsapp.webp";
import imgUnidades from "../assets/apresentacao/15-unidades.webp";
import imgUsuarios from "../assets/apresentacao/16-usuarios.webp";
import imgBloqueios from "../assets/apresentacao/17-bloqueios.webp";
import imgMobileReservas from "../assets/apresentacao/18-mobile-reservas.webp";
import imgCardapioPublico from "../assets/apresentacao/19-cardapio-publico.webp";
import imgWidgetReserva from "../assets/apresentacao/20-widget-reserva.webp";

// Doc "apresentacao" - pagina de vendas generica, no mesmo padrao visual da landing
// (Nav/Fx/landing.css), detalhando cada funcionalidade com print real do sistema
// rodando com dados de demonstracao (empresa/lojas ficticias, sem nome de nenhum
// cliente real) - pensada pra ser mostrada a qualquer prospect, nao so um caso
// especifico.
interface Feature {
  eyebrow: string;
  titulo: ReactNode;
  texto: string;
  img: string;
  alt: string;
  mobile?: boolean;
}

const ACESSO: Feature[] = [
  {
    eyebrow: "Login e hierarquia de acesso",
    titulo: (
      <>
        Entrada única para <span className="lp-italico-destaque">dono, gerente e equipe</span>
      </>
    ),
    texto:
      "Cada pessoa entra com seu próprio login. O dono vê tudo; a equipe vê só o que precisa para o dia a dia — sem acesso a configurações sensíveis.",
    img: imgLogin,
    alt: "Tela de login do Quero Reservar",
  },
  {
    eyebrow: "Painel de gestão ou operação",
    titulo: (
      <>
        Gestão completa ou <span className="lp-italico-destaque">operação do dia</span>
      </>
    ),
    texto:
      "Quem só precisa cuidar das reservas do dia entra direto no painel simplificado, sem se perder em configurações que não usa.",
    img: imgEscolherPainel,
    alt: "Tela de escolha entre Painel Gestão e Painel Operação",
  },
  {
    eyebrow: "Multiunidade",
    titulo: (
      <>
        Mais de uma loja, <span className="lp-italico-destaque">um único login</span>
      </>
    ),
    texto:
      "Quem tem acesso a mais de uma unidade escolhe qual loja quer gerenciar e troca em um clique quando quiser — sem precisar de outro cadastro.",
    img: imgEscolherLoja,
    alt: "Tela de escolha entre as lojas cadastradas",
  },
];

const OPERACAO: Feature[] = [
  {
    eyebrow: "Dashboard",
    titulo: (
      <>
        O dia da loja <span className="lp-italico-destaque">em um relance</span>
      </>
    ),
    texto: "Total de reservas, total de pessoas e distribuição por status, filtrando por qualquer período.",
    img: imgDashboard,
    alt: "Dashboard do Quero Reservar mostrando reservas por status",
  },
  {
    eyebrow: "Reservas do dia",
    titulo: (
      <>
        Cada reserva, <span className="lp-italico-destaque">em tempo real</span>
      </>
    ),
    texto:
      "Todas as reservas de hoje em um só lugar, com horário, tamanho do grupo e status — prontas para sentar, cancelar ou chamar o cliente no WhatsApp com um clique.",
    img: imgReservas,
    alt: "Lista de reservas do dia com botão de WhatsApp",
  },
  {
    eyebrow: "Cadastro manual",
    titulo: (
      <>
        Reserva por telefone? <span className="lp-italico-destaque">A equipe cadastra em segundos</span>
      </>
    ),
    texto:
      "Nem toda reserva vem do Instagram — quando o cliente liga, a equipe cadastra manualmente pelo mesmo painel, com as mesmas regras de horário e antecedência.",
    img: imgNovaReserva,
    alt: "Modal de criação manual de reserva",
  },
];

const CONFIGURACAO: Feature[] = [
  {
    eyebrow: "Salão e capacidade",
    titulo: (
      <>
        Modo simples: só a <span className="lp-italico-destaque">capacidade total</span> importa
      </>
    ),
    texto:
      "Sem precisar desenhar mesa por mesa: configure a capacidade total do salão e o horário de reserva — quem precisa de mapa de mesa por mesa também tem essa opção.",
    img: imgSalao,
    alt: "Configuração do salão principal com capacidade e horário fixo",
  },
  {
    eyebrow: "Cardápio digital",
    titulo: (
      <>
        Seu cardápio real, <span className="lp-italico-destaque">digitalizado</span>
      </>
    ),
    texto:
      "Categorias, itens, preço e observação — tudo cadastrado uma vez e pronto para o QR code da mesa, sem depender de impressão.",
    img: imgCardapioAdmin,
    alt: "Cardápio digital com categorias e itens",
  },
  {
    eyebrow: "Horários e antecedência",
    titulo: (
      <>
        Seus horários, <span className="lp-italico-destaque">do jeito que a casa funciona</span>
      </>
    ),
    texto:
      "Configure o horário de funcionamento por dia da semana e a antecedência mínima para reservar — o cliente só vê as opções realmente disponíveis.",
    img: imgHorarios,
    alt: "Configuração de horários de funcionamento e antecedência mínima",
  },
];

const RESUMO_ITENS = [
  "Login com hierarquia de acesso (dono, gerente, funcionário)",
  "Dashboard com visão geral de reservas por período",
  "Reservas do dia com busca, status e edição rápida",
  "Botão de WhatsApp direto na reserva e na fila de espera",
  "Cadastro manual de reserva pela equipe (telefone/balcão)",
  "Salão em modo simples com capacidade total, ou mapa de mesas",
  "Cardápio digital com link público em QR code",
  "Horários por dia da semana, com antecedência mínima",
  "Só os horários realmente disponíveis aparecem para o cliente",
  "Agente de IA respondendo no Instagram 24 horas por dia",
  "Agente sempre confirma a unidade certa antes de atender",
  "Conversas com atendimento humano quando o agente escala",
  "Fila de espera para clientes que chegam sem reserva",
  "Relatórios de ocupação e não comparecimento",
  "Multiunidade: várias lojas no mesmo login",
  "Painel 100% responsivo, instalável como app (PWA)",
];

function BlocoFeature({ feature, invertido }: { feature: Feature; invertido?: boolean }) {
  return (
    <div className={`apr-feature${invertido ? " apr-invertido" : ""}`}>
      <Reveal className="apr-feature-texto">
        <span className="lp-eyebrow">{feature.eyebrow}</span>
        <h3 style={{ fontSize: "1.5rem", marginTop: 0 }}>{feature.titulo}</h3>
        <p className="lp-texto-grande" style={{ marginTop: "0.75rem" }}>
          {feature.texto}
        </p>
      </Reveal>
      <Reveal delay={100} className={`apr-feature-tela${feature.mobile ? " apr-mobile" : ""} lp-moldura`}>
        <img src={feature.img} alt={feature.alt} loading="lazy" />
      </Reveal>
    </div>
  );
}

function GrupoFeatures({ eyebrow, titulo, itens }: { eyebrow: string; titulo: ReactNode; itens: Feature[] }) {
  return (
    <section className="lp-secao">
      <div className="lp-container" style={{ maxWidth: 1080 }}>
        <Reveal as="span" className="lp-eyebrow apr-grupo-eyebrow">
          {eyebrow}
        </Reveal>
        <Reveal delay={40} as="h2">
          {titulo}
        </Reveal>
        <div style={{ marginTop: "2.5rem", display: "flex", flexDirection: "column", gap: "4rem" }}>
          {itens.map((feature, i) => (
            <BlocoFeature key={feature.eyebrow} feature={feature} invertido={i % 2 === 1} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function ApresentacaoPage() {
  return (
    <div className="lp">
      <BarraDeProgresso />
      <Nav />

      <main>
        {/* Hero ------------------------------------------------------------ */}
        <section id="top" className="lp-secao lp-hero lp-grao lp-secao-fundo-relativo">
          <Aurora intenso />
          <div className="lp-container">
            <Reveal delay={80}>
              <span className="lp-selo lp-selo-vivo">
                <span className="lp-ponto-vivo" aria-hidden="true" />
                <span className="lp-texto-gradiente">Tour completo, com telas reais do sistema</span>
              </span>
            </Reveal>

            <Reveal delay={160} as="h1">
              Todas as funcionalidades, <span style={{ color: "var(--accent)" }}>com telas reais</span>
            </Reveal>

            <Reveal delay={240}>
              <p className="lp-texto-grande" style={{ margin: "0 auto 1.5rem" }}>
                Esta página mostra exatamente como o Quero Reservar funciona na prática — do primeiro login até o
                que o cliente final vê na mesa, com o sistema rodando de verdade, não uma maquete.
              </p>
            </Reveal>

            <Reveal delay={320}>
              <div className="lp-cta-grupo" style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
                <Link to="/assinar" className="lp-btn-pilula">
                  Quero automatizar minhas reservas
                  <span aria-hidden="true">→</span>
                </Link>
                <Link to="/login" className="lp-link-secundario">
                  Já sou cliente
                </Link>
              </div>
            </Reveal>

            <Reveal delay={400}>
              <div className="apr-stats-row" style={{ maxWidth: 760, margin: "2.5rem auto 0" }}>
                <div className="apr-stat">
                  <div className="apr-stat-valor">Multiunidade</div>
                  <div className="apr-stat-label">Quantas lojas você tiver, mesmo painel</div>
                </div>
                <div className="apr-stat">
                  <div className="apr-stat-valor">Modo simples</div>
                  <div className="apr-stat-label">Só a capacidade total, sem mapa de mesas</div>
                </div>
                <div className="apr-stat">
                  <div className="apr-stat-valor">Horário fixo</div>
                  <div className="apr-stat-label">Cliente só vê o horário que você libera</div>
                </div>
                <div className="apr-stat">
                  <div className="apr-stat-valor">Antecedência mínima</div>
                  <div className="apr-stat-label">Configurável por dia da semana</div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <GrupoFeatures
          eyebrow="Acesso ao painel"
          titulo={
            <>
              Entrar no sistema é <span className="lp-italico-destaque">simples pra qualquer pessoa</span> da equipe
            </>
          }
          itens={ACESSO}
        />

        <GrupoFeatures
          eyebrow="Operação diária"
          titulo={
            <>
              O que a equipe usa <span className="lp-italico-destaque">todos os dias</span>
            </>
          }
          itens={OPERACAO}
        />

        <GrupoFeatures
          eyebrow="Configuração"
          titulo={
            <>
              A loja, configurada <span className="lp-italico-destaque">do jeito que ela funciona de verdade</span>
            </>
          }
          itens={CONFIGURACAO}
        />

        {/* Conversas do Instagram ------------------------------------------- */}
        <section className="lp-secao lp-secao-fundo-relativo">
          <Aurora />
          <div className="lp-container" style={{ maxWidth: 1080 }}>
            <Reveal as="span" className="lp-eyebrow">
              Instagram
            </Reveal>
            <Reveal delay={40} as="h2">
              O agente atende <span className="lp-italico-destaque">sozinho</span>, e chama a equipe quando precisa
            </Reveal>
            <Reveal delay={80}>
              <p className="lp-texto-grande" style={{ marginTop: "0.75rem", maxWidth: 720 }}>
                Antes de tudo, o agente sempre confirma com o cliente qual unidade ele quer — obrigatório quando a
                empresa tem mais de uma loja. Depois disso, dúvidas simples e reservas são resolvidas sozinho, no
                tom de voz do restaurante; pedidos especiais são reconhecidos e passados para a equipe responder
                direto pelo mesmo painel.
              </p>
            </Reveal>
            <div className="apr-duas-telas" style={{ marginTop: "2.5rem" }}>
              <Reveal className="apr-feature-tela lp-moldura">
                <img src={imgConversaAtendida} alt="Conversa do Instagram resolvida automaticamente pelo agente de IA" loading="lazy" />
              </Reveal>
              <Reveal delay={120} className="apr-feature-tela lp-moldura">
                <img src={imgConversaHumano} alt="Conversa do Instagram com atendimento assumido pela equipe humana" loading="lazy" />
              </Reveal>
            </div>
          </div>
        </section>

        <GrupoFeatures
          eyebrow="Operação e relatórios"
          titulo={
            <>
              Walk-in e dados <span className="lp-italico-destaque">para decidir, não só registrar</span>
            </>
          }
          itens={[
            {
              eyebrow: "Fila de espera",
              titulo: (
                <>
                  Cliente chegou sem reserva? <span className="lp-italico-destaque">Fila organizada</span>
                </>
              ),
              texto:
                "A equipe registra quem está esperando e chama quando a mesa vaga — com botão de WhatsApp direto pra avisar, sem depender de papel.",
              img: imgFilaEspera,
              alt: "Fila de espera com clientes aguardando e botão de WhatsApp",
            },
            {
              eyebrow: "Relatórios",
              titulo: (
                <>
                  Ocupação e <span className="lp-italico-destaque">não comparecimento</span>
                </>
              ),
              texto: "Acompanhar quantas reservas viram cliente sentado de fato, e identificar padrões por período.",
              img: imgRelatorios,
              alt: "Tela de relatórios de ocupação",
            },
          ]}
        />

        <GrupoFeatures
          eyebrow="Marketing e canais"
          titulo={
            <>
              O agente fala <span className="lp-italico-destaque">como o seu restaurante</span>, não como um robô
            </>
          }
          itens={[
            {
              eyebrow: "Configuração do agente de IA",
              titulo: (
                <>
                  Nome, tom de voz, <span className="lp-italico-destaque">saudação e despedida</span>
                </>
              ),
              texto: "O dono decide a personalidade do atendimento automático — sem depender de programador.",
              img: imgAgenteIa,
              alt: "Configuração do agente de IA: nome, tom de voz e saudação",
            },
            {
              eyebrow: "WhatsApp Business",
              titulo: (
                <>
                  Instagram hoje, <span className="lp-italico-destaque">WhatsApp no próximo passo</span>
                </>
              ),
              texto: "O mesmo agente pode atender pelo WhatsApp Business da loja — canal já pronto no sistema.",
              img: imgWhatsapp,
              alt: "Tela de conexão do WhatsApp Business",
            },
          ]}
        />

        <GrupoFeatures
          eyebrow="Multiunidade e equipe"
          titulo={
            <>
              Várias lojas, <span className="lp-italico-destaque">um único painel de verdade</span>
            </>
          }
          itens={[
            {
              eyebrow: "Lojas da empresa",
              titulo: (
                <>
                  Cada loja com <span className="lp-italico-destaque">seus próprios dados</span>
                </>
              ),
              texto: "Mesma empresa, mesmo login do dono. Cada unidade pode ter cardápio, horário e equipe próprios.",
              img: imgUnidades,
              alt: "Lista de lojas da empresa com endereço e redes sociais",
            },
            {
              eyebrow: "Usuários e permissões",
              titulo: (
                <>
                  Cada funcionário vê <span className="lp-italico-destaque">só a loja dele</span>
                </>
              ),
              texto: "O dono cadastra a equipe com acesso restrito por unidade, sem acesso a configurações.",
              img: imgUsuarios,
              alt: "Lista de usuários da equipe com papel e acesso por unidade",
            },
            {
              eyebrow: "Bloqueios",
              titulo: (
                <>
                  Manutenção ou evento? <span className="lp-italico-destaque">Bloqueia sem cancelar tudo</span>
                </>
              ),
              texto: "O horário some das opções de reserva automaticamente enquanto o bloqueio estiver ativo.",
              img: imgBloqueios,
              alt: "Tela de bloqueios de salão",
            },
          ]}
        />

        {/* Mobile / cliente final -------------------------------------------- */}
        <section className="lp-secao lp-virada lp-secao-fundo-relativo">
          <Aurora />
          <div className="lp-container" style={{ maxWidth: 1080 }}>
            <Reveal as="span" className="lp-eyebrow">
              Mobile e o cliente final
            </Reveal>
            <Reveal delay={40} as="h2">
              No bolso da equipe, <span className="lp-italico-destaque">e na mão do cliente</span>
            </Reveal>
            <div style={{ marginTop: "2.5rem", display: "flex", flexDirection: "column", gap: "4rem" }}>
              <div className="apr-feature">
                <Reveal className="apr-feature-texto">
                  <span className="lp-eyebrow">Painel no celular</span>
                  <h3 style={{ fontSize: "1.5rem", marginTop: 0 }}>
                    O painel <span className="lp-italico-destaque">instalável como app</span>
                  </h3>
                  <p className="lp-texto-grande" style={{ marginTop: "0.75rem" }}>
                    Interface adaptada pra tela de celular, sem perder função — pode ser instalado como aplicativo
                    (PWA), sem loja de app, com notificação em tempo real de novas reservas.
                  </p>
                </Reveal>
                <Reveal delay={100} className="apr-feature-tela apr-mobile lp-moldura">
                  <img src={imgMobileReservas} alt="Painel de reservas em tela de celular" loading="lazy" />
                </Reveal>
              </div>

              <div className="apr-feature apr-invertido">
                <Reveal className="apr-feature-texto">
                  <span className="lp-eyebrow">O que o cliente vê</span>
                  <h3 style={{ fontSize: "1.5rem", marginTop: 0 }}>
                    Cardápio público e <span className="lp-italico-destaque">reserva sem sair do Instagram</span>
                  </h3>
                  <p className="lp-texto-grande" style={{ marginTop: "0.75rem" }}>
                    O cardápio completo, acessível pelo QR code da mesa, e o mesmo link que o agente manda no
                    Instagram funciona como reserva direta — sem instalar nada.
                  </p>
                </Reveal>
                <Reveal delay={100} className="apr-feature-tela lp-moldura">
                  <img src={imgCardapioPublico} alt="Cardápio público de exemplo" loading="lazy" />
                </Reveal>
              </div>

              <div className="apr-feature">
                <Reveal className="apr-feature-texto">
                  <span className="lp-eyebrow">Reserva direta</span>
                  <h3 style={{ fontSize: "1.5rem", marginTop: 0 }}>
                    Um link, <span className="lp-italico-destaque">reserva feita</span>
                  </h3>
                  <p className="lp-texto-grande" style={{ marginTop: "0.75rem" }}>
                    Data, horário e número de pessoas — o mesmo formulário funciona no site, na bio do Instagram ou
                    embutido como widget em qualquer página.
                  </p>
                </Reveal>
                <Reveal delay={100} className="apr-feature-tela apr-mobile lp-moldura">
                  <img src={imgWidgetReserva} alt="Formulário de reserva direta (widget)" loading="lazy" />
                </Reveal>
              </div>
            </div>
          </div>
        </section>

        {/* Resumo ------------------------------------------------------------ */}
        <section className="lp-secao">
          <div className="lp-container" style={{ maxWidth: 900 }}>
            <Reveal as="span" className="lp-eyebrow">
              Resumo
            </Reveal>
            <Reveal delay={40} as="h2">
              Tudo isso já está <span className="lp-italico-destaque">no ar hoje</span>
            </Reveal>
            <ul className="apr-checklist">
              {RESUMO_ITENS.map((item) => (
                <li key={item}>
                  <span className="apr-marca">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA final ----------------------------------------------------------- */}
        <section className="lp-secao lp-secao-fundo-relativo" style={{ textAlign: "center" }}>
          <Aurora intenso />
          <div className="lp-container">
            <Reveal as="h2">
              Bora colocar o seu restaurante pra <span className="lp-italico-destaque">reservar sozinho?</span>
            </Reveal>
            <Reveal delay={80}>
              <div className="lp-cta-grupo" style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginTop: "1.5rem" }}>
                <Link to="/assinar" className="lp-btn-pilula">
                  Quero automatizar minhas reservas
                  <span aria-hidden="true">→</span>
                </Link>
                <Link to="/login" className="lp-link-secundario">
                  Já sou cliente
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="lp-rodape">
        <Marca />
        <Link to="/login" className="texto-secundario">
          Já sou cliente
        </Link>
      </footer>

      <BarraFixaMobile />
    </div>
  );
}
