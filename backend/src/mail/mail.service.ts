import { Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const maskEmail = (address: string) => address.replace(/^(.)[^@]*/, '$1•••');

interface ActionEmail {
  to: string;
  name: string;
  subject: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  footer: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly from = process.env.MAIL_FROM ?? 'NaicoTech Store <nao-responda@naicotech.local>';
  // Em dev aponta para o Mailpit (docker compose); em produção, para o SMTP real.
  private readonly transporter = createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  sendEmailVerification(to: string, name: string, link: string) {
    return this.send({
      to,
      name,
      subject: 'Confirme seu e-mail - NaicoTech Store',
      paragraphs: ['Falta só um passo para ativar sua conta na NaicoTech Store.'],
      button: { label: 'Validar minha conta', url: link },
      footer: 'O link vale por 24 horas. Se você não criou esta conta, ignore este e-mail.',
    });
  }

  // Enviado quando alguém tenta cadastrar um e-mail que já tem conta ativa.
  sendAccountExistsNotice(to: string, name: string, frontendUrl: string) {
    return this.send({
      to,
      name,
      subject: 'Tentativa de cadastro com seu e-mail - NaicoTech Store',
      paragraphs: [
        'Alguém tentou criar uma conta na NaicoTech Store com este e-mail, mas você já tem uma conta.',
        'Se foi você, é só entrar. Se esqueceu a senha, use "Esqueci minha senha" na tela de login.',
      ],
      button: { label: 'Entrar na minha conta', url: `${frontendUrl}/login` },
      footer: 'Se não foi você, pode ignorar este e-mail. Sua conta continua segura.',
    });
  }

  sendPasswordReset(to: string, name: string, link: string) {
    return this.send({
      to,
      name,
      subject: 'Redefinição de senha - NaicoTech Store',
      paragraphs: ['Recebemos um pedido para redefinir a senha da sua conta na NaicoTech Store.'],
      button: { label: 'Criar nova senha', url: link },
      footer:
        'O link vale por 1 hora e só pode ser usado uma vez. Se você não pediu, ignore este e-mail: sua senha atual continua valendo.',
    });
  }

  sendPasswordChangedNotice(to: string, name: string, frontendUrl: string) {
    return this.send({
      to,
      name,
      subject: 'Sua senha foi alterada - NaicoTech Store',
      paragraphs: [
        'A senha da sua conta na NaicoTech Store acabou de ser alterada, e todas as sessões abertas foram encerradas.',
        'Se foi você, está tudo certo.',
      ],
      button: { label: 'Não fui eu: redefinir senha', url: `${frontendUrl}/esqueci-senha` },
      footer:
        'Se não foi você, redefina a senha agora pelo botão acima e confira o acesso ao seu e-mail.',
    });
  }

  // Alertas de segurança da conta de admin (2FA ativada, bloqueio, código de recuperação usado...).
  sendSecurityAlert(to: string, name: string, subject: string, paragraphs: string[]) {
    return this.send({
      to,
      name,
      subject: `${subject} - NaicoTech Store`,
      paragraphs,
      footer: 'Este é um aviso automático de segurança. Se reconhece a ação, não precisa fazer nada.',
    });
  }

  sendOrderShipped(
    to: string,
    name: string,
    order: { orderNumber: string; carrier: string; trackingCode: string | null; link: string },
  ) {
    return this.send({
      to,
      name,
      subject: `Pedido #${order.orderNumber} enviado - NaicoTech Store`,
      paragraphs: [
        `Seu pedido #${order.orderNumber} foi postado${order.carrier ? ` via ${order.carrier}` : ''}.`,
        order.trackingCode
          ? `Código de rastreio: ${order.trackingCode}`
          : 'O código de rastreio aparece na página do pedido assim que a transportadora registrar.',
      ],
      button: { label: 'Acompanhar entrega', url: order.link },
      footer: 'O rastreio pode levar algumas horas para mostrar a primeira movimentação.',
    });
  }

  sendOrderDelivered(to: string, name: string, order: { orderNumber: string; link: string }) {
    return this.send({
      to,
      name,
      subject: `Pedido #${order.orderNumber} entregue - NaicoTech Store`,
      paragraphs: [
        `Seu pedido #${order.orderNumber} foi entregue. Esperamos que curta muito!`,
        'Se algo chegou errado ou com avaria, responda pelo site em até 7 dias.',
      ],
      button: { label: 'Ver pedido e avaliar', url: order.link },
      footer: 'Obrigado por comprar na NaicoTech Store.',
    });
  }

  sendAccountDeleted(to: string, name: string) {
    return this.send({
      to,
      name,
      subject: 'Sua conta foi excluída - NaicoTech Store',
      paragraphs: [
        'Sua conta na NaicoTech Store foi excluída, como você pediu. Apagamos seus dados pessoais, endereços e avaliações.',
        'Os pedidos antigos continuam registrados sem nenhum dado que identifique você, porque a loja é obrigada a guardá-los para fins fiscais.',
      ],
      footer: 'Se você não pediu a exclusão, responda este e-mail imediatamente.',
    });
  }

  private async send(email: ActionEmail) {
    const safeName = escapeHtml(email.name);
    const text = [
      `Olá, ${email.name}!`,
      ...email.paragraphs,
      email.button ? `${email.button.label}: ${email.button.url}` : '',
      email.footer,
    ]
      .filter(Boolean)
      .join('\n\n');

    const button = email.button
      ? `<p style="margin:28px 0">
          <a href="${escapeHtml(email.button.url)}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">
            ${escapeHtml(email.button.label)}
          </a>
        </p>`
      : '';
    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto;color:#1b1f27">
        <h2 style="margin-bottom:8px">Olá, ${safeName}!</h2>
        ${email.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
        ${button}
        <p style="color:#667085;font-size:14px">${escapeHtml(email.footer)}</p>
      </div>`;

    await this.transporter.sendMail({ from: this.from, to: email.to, subject: email.subject, text, html });
    // E-mail é dado pessoal: no log, só a primeira letra e o domínio.
    this.logger.log(`E-mail "${email.subject}" enviado para ${maskEmail(email.to)}`);
  }
}
