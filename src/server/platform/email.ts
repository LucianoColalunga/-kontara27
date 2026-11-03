import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "./logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Etiqueta para métricas y pruebas (verification, password_reset, invitation…). */
  tag: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Desarrollo y pruebas: guarda cada correo como JSON en .data/outbox. No envía nada a nadie.
 * El entorno de producción rechaza este proveedor (ver env.ts).
 */
export class OutboxEmailSender implements EmailSender {
  constructor(private readonly directory = path.resolve(".data/outbox")) {}

  async send(message: EmailMessage): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, `${Date.now()}-${message.tag}-${Math.random().toString(36).slice(2, 8)}.json`);
    await writeFile(file, JSON.stringify({ ...message, sentAt: new Date().toISOString() }, null, 2), "utf8");
    logger.info("email.outbox", { tag: message.tag, file: path.basename(file) });
  }
}

/** Envío real por la API HTTPS de Resend (sin SDK: un solo endpoint). */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text, html: message.html, tags: [{ name: "type", value: message.tag }] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // El cuerpo puede incluir el destinatario: se registra solo el estado.
      throw new Error(`Resend respondió ${response.status}`);
    }
  }
}

/** Memoria (pruebas unitarias). */
export class MemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}
