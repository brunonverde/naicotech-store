import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { STORE } from '../config/store'

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="legal card">
      <h1>{title}</h1>
      <p className="muted small">Última atualização: {STORE.updatedAt}</p>
      {STORE.demo && (
        <p className="alert alert-info">
          A {STORE.name} é um <strong>projeto de portfólio</strong>: os produtos, preços e pagamentos são de
          demonstração e nenhuma compra é cobrada ou entregue de verdade. Este texto mostra como as regras funcionariam
          numa loja real.
        </p>
      )}
      {children}
    </article>
  )
}

function Contact() {
  return STORE.contactEmail ? (
    <a href={`mailto:${STORE.contactEmail}`}>{STORE.contactEmail}</a>
  ) : (
    <span>o e-mail de contato da loja (não divulgado nesta versão de demonstração)</span>
  )
}

// Identificação de quem vende (Decreto 7.962/2013, art. 2º).
export function SellerInfo() {
  return (
    <ul className="seller-info">
      <li>
        <strong>Razão social / nome:</strong> {STORE.legalName ?? 'Loja demonstrativa (sem vendedor real)'}
      </li>
      <li>
        <strong>CNPJ/CPF:</strong> {STORE.document ?? 'não se aplica (projeto de portfólio)'}
      </li>
      <li>
        <strong>Endereço:</strong> {STORE.address ?? 'não se aplica (projeto de portfólio)'}
      </li>
      <li>
        <strong>Contato:</strong> <Contact />
      </li>
    </ul>
  )
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Política de Privacidade">
      <p>
        Esta política explica quais dados pessoais a {STORE.name} trata, por quê, com quem compartilha e como você exerce
        seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).
      </p>

      <h2>1. Quem é o controlador</h2>
      <SellerInfo />

      <h2>2. Dados que coletamos</h2>
      <ul>
        <li>
          <strong>Conta:</strong> nome, e-mail e senha. A senha é guardada só como hash (bcrypt); ninguém da loja consegue
          lê-la.
        </li>
        <li>
          <strong>Entrega:</strong> nome de quem recebe, CPF (exigido pelas transportadoras), telefone e endereço.
        </li>
        <li>
          <strong>Pedidos e avaliações:</strong> produtos, valores, status, código de rastreio e as avaliações que você
          publicar.
        </li>
        <li>
          <strong>Segurança:</strong> endereço IP das ações feitas no painel administrativo, guardado criptografado.
          O controle de tentativas de login usa o IP só na memória do servidor, por poucos minutos, sem gravar.
        </li>
      </ul>
      <p>
        <strong>Não coletamos dados do cartão.</strong> Eles são digitados num formulário do Mercado Pago e nunca passam
        pelos nossos servidores.
      </p>

      <h2>3. Para que usamos e com qual base legal</h2>
      <ul>
        <li>
          Criar sua conta, processar pedidos, calcular o frete e entregar: <em>execução de contrato</em> (art. 7º, V).
        </li>
        <li>
          Guardar registros de vendas pelo prazo exigido em lei: <em>cumprimento de obrigação legal</em> (art. 7º, II).
        </li>
        <li>
          Prevenir fraudes e ataques (limite de tentativas, auditoria do painel): <em>legítimo interesse</em> (art. 7º, IX).
        </li>
        <li>
          Salvar endereços para próximas compras: <em>seu consentimento</em> (art. 7º, I), dado ao marcar a opção no
          checkout. Você pode apagá-los a qualquer momento.
        </li>
      </ul>
      <p>Não vendemos dados e não usamos seus dados para publicidade.</p>

      <h2>4. Com quem compartilhamos</h2>
      <ul>
        <li>
          <strong>Mercado Pago:</strong> processamento do pagamento (e-mail e valor do pedido).
        </li>
        <li>
          <strong>Melhor Envio e transportadoras</strong> (Correios, Jadlog etc.): CEP para cotar o frete; nome, CPF,
          telefone e endereço para gerar a etiqueta.
        </li>
        <li>
          <strong>Provedor de e-mail:</strong> envio de confirmações e avisos do pedido.
        </li>
      </ul>

      <h2>5. Por quanto tempo guardamos</h2>
      <ul>
        <li>Conta e endereços salvos: até você excluir.</li>
        <li>Endereço de entrega de um pedido: apagado automaticamente 90 dias após a entrega (30 dias se cancelado).</li>
        <li>Pedidos: pelo prazo fiscal (5 anos), sem dados que identifiquem você se a conta for excluída.</li>
        <li>
          IP dos registros de acesso ao painel: 6 meses, como exige o Marco Civil da Internet (art. 15), e depois apagado.
        </li>
      </ul>

      <h2>6. Como protegemos</h2>
      <ul>
        <li>Conexão criptografada (HTTPS) e cookies de sessão inacessíveis ao JavaScript da página.</li>
        <li>Endereços, CPF, telefone e IPs guardados criptografados (AES-256-GCM), cada tipo com uma chave própria.</li>
        <li>Registros do servidor (logs) sem dados pessoais: e-mails e documentos aparecem mascarados.</li>
        <li>O site mostra endereços sempre mascarados; o completo só é usado para gerar a etiqueta.</li>
        <li>Painel administrativo com verificação em duas etapas obrigatória e registro de todas as ações.</li>
      </ul>

      <h2>7. Cookies</h2>
      <ul>
        <li>
          <strong>Essenciais (sempre ativos):</strong> o cookie de sessão (mantém você logado), o do painel administrativo
          e a sua própria escolha sobre cookies. Na página de pagamento, o Mercado Pago usa recursos de antifraude
          necessários para aprovar o cartão com segurança.
        </li>
        <li>
          <strong>Opcional:</strong> lembrar o carrinho neste navegador entre visitas. Só é usado se você permitir.
        </li>
      </ul>
      <p>
        Não usamos cookies de publicidade, de rastreamento ou de análise. Você muda sua escolha a qualquer momento em
        “Preferências de cookies”, no rodapé; ao recusar, o carrinho salvo é apagado na hora.
      </p>

      <h2>8. Seus direitos</h2>
      <p>
        Você pode confirmar e acessar seus dados, corrigi-los, pedir a exclusão, revogar o consentimento e saber com quem
        foram compartilhados (art. 18). Em <Link to="/conta">Minha conta</Link> você mesmo baixa uma cópia completa dos
        seus dados e exclui a conta. Para outros pedidos, fale com <Contact />. Você também pode reclamar à Autoridade
        Nacional de Proteção de Dados (ANPD).
      </p>

      <h2>9. Incidentes de segurança</h2>
      <p>
        Se houver um incidente que possa causar risco ou dano relevante, avisaremos as pessoas afetadas e a ANPD, como
        exige a LGPD (art. 48).
      </p>
    </LegalLayout>
  )
}

export function TermsPage() {
  return (
    <LegalLayout title="Termos de Uso">
      <h2>1. Sobre a loja</h2>
      <SellerInfo />

      <h2>2. Conta</h2>
      <p>
        Para comprar é preciso criar uma conta com e-mail confirmado. Você é responsável por manter sua senha em segredo.
        Contas usadas para fraude ou ataques podem ser bloqueadas.
      </p>

      <h2>3. Preços, estoque e pedido</h2>
      <p>
        Preços e estoque podem mudar sem aviso, mas o valor confirmado no pedido é o que vale. Pedidos não pagos em 30
        minutos são cancelados automaticamente e os itens voltam ao estoque.
      </p>

      <h2>4. Pagamento</h2>
      <p>
        O pagamento é processado pelo Mercado Pago (cartão de crédito ou débito). A loja não recebe nem guarda os dados
        do cartão.
      </p>

      <h2>5. Entrega</h2>
      <p>
        O frete e o prazo são calculados pelas transportadoras no momento da compra. O prazo começa a contar a partir da
        postagem. O código de rastreio aparece na página do pedido e é enviado por e-mail.
      </p>

      <h2>6. Arrependimento, trocas e garantia</h2>
      <p>
        Você pode desistir da compra em até 7 dias após o recebimento, com reembolso total, inclusive do frete (Código
        de Defesa do Consumidor, art. 49). Produtos com defeito têm garantia legal de 90 dias (art. 26), além da garantia
        do fabricante. Veja como em <Link to="/trocas">Trocas e devoluções</Link>.
      </p>

      <h2>7. Privacidade</h2>
      <p>
        O tratamento dos seus dados segue a <Link to="/privacidade">Política de Privacidade</Link>.
      </p>

      <h2>8. Alterações</h2>
      <p>
        Estes termos podem ser atualizados. A data da última versão fica no topo da página; mudanças relevantes serão
        avisadas por e-mail.
      </p>
    </LegalLayout>
  )
}

export function ReturnsPage() {
  return (
    <LegalLayout title="Trocas e devoluções">
      <h2>Desistência (direito de arrependimento)</h2>
      <ol>
        <li>
          Em até <strong>7 dias corridos</strong> após receber o produto, fale com <Contact /> informando o número do
          pedido.
        </li>
        <li>Enviamos uma etiqueta de devolução sem custo para você.</li>
        <li>
          Assim que o produto chegar, o valor total (produto + frete) é estornado no mesmo cartão usado na compra.
        </li>
      </ol>

      <h2>Produto com defeito</h2>
      <ul>
        <li>
          Garantia legal de <strong>90 dias</strong> a partir do recebimento, além da garantia do fabricante.
        </li>
        <li>Fale com a loja descrevendo o problema; se possível, envie fotos ou vídeo.</li>
        <li>O produto é avaliado e consertado, trocado ou o valor devolvido, conforme o Código de Defesa do Consumidor.</li>
      </ul>

      <h2>Produto avariado na entrega</h2>
      <p>
        Se a embalagem chegar violada ou danificada, recuse o recebimento ou fotografe a caixa antes de abrir e fale com
        a loja em até 7 dias.
      </p>
    </LegalLayout>
  )
}
