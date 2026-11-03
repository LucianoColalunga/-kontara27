import "server-only";
import { type Clock, systemClock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db";
import type { EmailSender } from "@/server/platform/email";
import { PostgresRateLimiter, type RateLimiter } from "@/server/platform/rate-limit";
import { recordAudit } from "@/server/platform/audit";
import {
  Argon2PasswordHasher,
  AuthService,
  DrizzleMfaRepository,
  DrizzleSessionRepository,
  DrizzleTokenRepository,
  DrizzleUserRepository,
  MfaService,
  SessionService,
} from "@/server/modules/identity";
import { TenancyService } from "@/server/modules/tenancy";
import { CatalogService, MovementService } from "@/server/modules/ledger";
import type { FileStorage } from "@/server/platform/storage";
import { ImportService } from "@/server/modules/importing";
import { ReportingService } from "@/server/modules/reporting";
import { BudgetService } from "@/server/modules/budgeting";
import { DocumentService } from "@/server/modules/documents";
import { ReminderService } from "@/server/modules/scheduling";
import { PrivacyService } from "@/server/modules/privacy";

export interface ServiceDeps {
  db: Database;
  email: EmailSender;
  storage: FileStorage;
  encryptionKey: Buffer;
  signingKey: Buffer;
  appUrl: string;
  clock?: Clock;
  rateLimiter?: RateLimiter;
  argon2?: { memoryCost: number; timeCost: number; parallelism: number; outputLen: number };
}

/**
 * Raíz de composición: decide qué implementación concreta recibe cada servicio.
 * La app la usa con la configuración real (container.ts) y las pruebas con dobles.
 */
export function buildServices(deps: ServiceDeps) {
  const clock = deps.clock ?? systemClock;
  const rateLimiter = deps.rateLimiter ?? new PostgresRateLimiter(deps.db, () => clock.now());
  const users = new DrizzleUserRepository(deps.db);
  const sessions = new SessionService(new DrizzleSessionRepository(deps.db), users, clock);
  const mfa = new MfaService(new DrizzleMfaRepository(deps.db), deps.encryptionKey, clock);
  const auth = new AuthService({
    users,
    tokens: new DrizzleTokenRepository(deps.db),
    hasher: new Argon2PasswordHasher(deps.argon2),
    sessions,
    mfa,
    email: deps.email,
    rateLimiter,
    clock,
    audit: (entry) => recordAudit(deps.db, entry),
    appUrl: deps.appUrl,
  });
  const tenancy = new TenancyService({ db: deps.db, clock, email: deps.email, rateLimiter, encryptionKey: deps.encryptionKey, appUrl: deps.appUrl });
  const movementsService = new MovementService(deps.db);
  const catalog = new CatalogService(deps.db);
  const documents = new DocumentService({ db: deps.db, storage: deps.storage, signingKey: deps.signingKey, clock });
  const imports = new ImportService({ db: deps.db, storage: deps.storage, movements: movementsService, rateLimiter, files: documents });
  return {
    clock,
    users,
    sessions,
    mfa,
    auth,
    tenancy,
    catalog,
    movements: movementsService,
    imports,
    reporting: new ReportingService(deps.db),
    budgets: new BudgetService(deps.db, clock),
    documents,
    reminders: new ReminderService(deps.db, movementsService, clock),
    privacy: new PrivacyService(deps.db, clock),
  };
}

export type Services = ReturnType<typeof buildServices>;
