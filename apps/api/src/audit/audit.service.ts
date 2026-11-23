import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DATABASE } from '../db/db.constants';
import type { Database } from '../db';
import { auditEvents } from '../db/schema';

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async log(input: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    summary: string;
  }) {
    const [row] = await this.db
      .insert(auditEvents)
      .values({
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary,
      })
      .returning();
    return row;
  }

  async listForLandlord(landlordId: string, limit = 40) {
    return this.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.actorId, landlordId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);
  }
}
