import { RFP, Transaction, AuditEvent, AuditEventType } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// AuditService — Immutable audit trail builder
//
// Reconstructs a full chronological audit trail from RFPs and Transactions,
// suitable for compliance reporting and export.
// ─────────────────────────────────────────────────────────────────────────────

function generateEventId(): string {
  return 'evt_' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

export class AuditService {
  /**
   * Build a chronological audit trail from an array of RFPs and Transactions.
   * Events are sorted ascending by timestamp.
   *
   * @example
   * ```ts
   * const service = new AuditService();
   * const events  = service.buildTrail(rfps, transactions);
   * console.log(events.map(e => `[${e.type}] ${e.description}`));
   * ```
   */
  buildTrail(rfps: RFP[], transactions: Transaction[]): AuditEvent[] {
    const events: AuditEvent[] = [];

    for (const rfp of rfps) {
      // RFP created
      events.push({
        id:          generateEventId(),
        timestamp:   rfp.createdAt,
        type:        'rfp_created',
        description: `RFP "${rfp.title}" created`,
        rfpId:       rfp.id,
        rfpTitle:    rfp.title,
        actor:       'Gov User',
        metadata:    { category: rfp.category, budget: String(rfp.budgetCeiling) },
      });

      // RFP published (status moved past Draft)
      if (rfp.status !== 'Draft') {
        events.push({
          id:          generateEventId(),
          timestamp:   rfp.createdAt,
          type:        'rfp_published',
          description: `RFP "${rfp.title}" published for supplier bids`,
          rfpId:       rfp.id,
          rfpTitle:    rfp.title,
          actor:       'Gov User',
        });
      }

      // Bid submissions
      for (const bid of rfp.bids) {
        events.push({
          id:          generateEventId(),
          timestamp:   bid.submittedAt,
          type:        'bid_submitted',
          description: `${bid.supplierName} submitted a bid of $${bid.amount.toLocaleString()}`,
          rfpId:       rfp.id,
          rfpTitle:    rfp.title,
          actor:       bid.supplierName,
          metadata:    {
            bidId:        bid.id,
            amount:       String(bid.amount),
            deliveryDays: String(bid.deliveryDays),
          },
        });
      }

      // AI evaluation
      if (rfp.evaluationResults && rfp.evaluationResults.length > 0) {
        const winner = rfp.evaluationResults[0];
        events.push({
          id:          generateEventId(),
          timestamp:   rfp.createdAt, // best available proxy for evaluation time
          type:        'evaluation_run',
          description: `AI evaluation completed — ${winner.supplier.name} ranked #1 (${winner.composite}/100)`,
          rfpId:       rfp.id,
          rfpTitle:    rfp.title,
          actor:       'Visa AI Engine',
          metadata:    {
            topScore:     String(winner.composite),
            totalBids:    String(rfp.evaluationResults.length),
          },
        });
      }

      // Override applied
      if (rfp.overrideWinnerId) {
        const overrideSupplier = rfp.evaluationResults?.find(
          (r) => r.supplier.id === rfp.overrideWinnerId,
        );
        events.push({
          id:          generateEventId(),
          timestamp:   rfp.createdAt,
          type:        'override_applied',
          description: `Manual override: ${overrideSupplier?.supplier.name ?? rfp.overrideWinnerId} selected despite lower AI score`,
          rfpId:       rfp.id,
          rfpTitle:    rfp.title,
          actor:       'Gov User',
          metadata:    {
            justification: rfp.overrideJustification ?? 'Not provided',
            overrideScore: String(overrideSupplier?.composite ?? '—'),
          },
        });
      }

      // Supplier awarded
      if (rfp.selectedWinnerId) {
        const awarded = rfp.evaluationResults?.find(
          (r) => r.supplier.id === rfp.selectedWinnerId,
        );
        events.push({
          id:          generateEventId(),
          timestamp:   rfp.createdAt,
          type:        'supplier_awarded',
          description: `${awarded?.supplier.name ?? rfp.selectedWinnerId} awarded RFP "${rfp.title}"`,
          rfpId:       rfp.id,
          rfpTitle:    rfp.title,
          actor:       'Gov User',
        });
      }
    }

    // Payment events from transactions
    for (const tx of transactions) {
      const rfp = rfps.find((r) => r.id === tx.rfpId);
      const rfpTitle = rfp?.title ?? tx.rfpId;

      events.push({
        id:          generateEventId(),
        timestamp:   tx.createdAt,
        type:        'payment_initiated',
        description: `Payment of $${tx.amount.toLocaleString()} initiated via ${tx.method} to ${tx.supplierName}`,
        rfpId:       tx.rfpId,
        rfpTitle,
        actor:       'Gov User',
        metadata:    { orderId: tx.orderId, method: tx.method },
      });

      if (tx.settledAt) {
        events.push({
          id:          generateEventId(),
          timestamp:   tx.settledAt,
          type:        'payment_settled',
          description: `$${tx.amount.toLocaleString()} settled to ${tx.supplierName} via Visa ${tx.method} rails`,
          rfpId:       tx.rfpId,
          rfpTitle,
          actor:       'Visa Network',
          metadata:    {
            txHash:  tx.txHash ?? '—',
            orderId: tx.orderId,
          },
        });
      }
    }

    return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /** Filter events by type. */
  filterByType(events: AuditEvent[], type: AuditEventType): AuditEvent[] {
    return events.filter((e) => e.type === type);
  }

  /** Filter events by RFP ID. */
  filterByRFP(events: AuditEvent[], rfpId: string): AuditEvent[] {
    return events.filter((e) => e.rfpId === rfpId);
  }

  /** Filter events by actor (partial, case-insensitive). */
  filterByActor(events: AuditEvent[], actor: string): AuditEvent[] {
    const q = actor.toLowerCase();
    return events.filter((e) => e.actor.toLowerCase().includes(q));
  }

  /**
   * Export the audit trail to JSON or CSV.
   *
   * @example
   * ```ts
   * const csv = service.export(events, 'csv');
   * fs.writeFileSync('audit-trail.csv', csv);
   * ```
   */
  export(events: AuditEvent[], format: 'json' | 'csv'): string {
    if (format === 'json') {
      return JSON.stringify(events, null, 2);
    }

    const headers = ['id', 'timestamp', 'type', 'description', 'rfpId', 'rfpTitle', 'actor'];
    const rows = events.map((e) =>
      headers.map((h) => {
        const val = (e as unknown as Record<string, unknown>)[h];
        const str = val == null ? '' : String(val);
        return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(','),
    );
    return [headers.join(','), ...rows].join('\n');
  }

  /** Summarise event counts by type — useful for dashboard widgets. */
  summarise(events: AuditEvent[]): Record<AuditEventType, number> {
    const counts = {} as Record<AuditEventType, number>;
    for (const e of events) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    return counts;
  }
}
