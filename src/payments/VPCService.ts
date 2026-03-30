// ─────────────────────────────────────────────────────────────────────────────
// VPCService — Visa B2B Payment Controls
//
// Five sub-services:
//   AccountManagement  — register / get / update / delete accounts
//   Rules              — set / get / delete / block / enable / disable rules
//   Reporting          — notification history + transaction history
//   IPC                — Gen-AI intelligent rule suggestions
//   SupplierValidation — register / update / retrieve supplier CAID validation
// ─────────────────────────────────────────────────────────────────────────────

import type {
  VPCAccount,
  VPCAccountStatus,
  VPCContact,
  VPCRule,
  VPCNotification,
  VPCTransaction,
  VPCCreateAccountParams,
  VPCUpdateAccountParams,
  VPCGetNotificationHistoryParams,
  VPCGetTransactionHistoryParams,
  IPCPromptRequest,
  IPCRuleSetResponse,
  IPCSuggestedRuleSet,
  VPCSupplierRegistration,
  VPCSupplierValidation,
  VPCValidationStatus,
} from '../types/vpc';

// ── Helpers ───────────────────────────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function isoNow(): string {
  return new Date().toISOString();
}

// ── In-memory sandbox store ───────────────────────────────────────────────────

interface SandboxStore {
  accounts:   Map<string, VPCAccount>;
  suppliers:  Map<string, VPCSupplierValidation>;
  notifications: Map<string, VPCNotification[]>;
  transactions:  Map<string, VPCTransaction[]>;
}

function createStore(): SandboxStore {
  return {
    accounts:      new Map(),
    suppliers:     new Map(),
    notifications: new Map(),
    transactions:  new Map(),
  };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

interface VPCApiConfig {
  baseUrl: string;
  credentials?: { userId: string; password: string };
  fetch?: typeof fetch;
}

async function apiRequest<T>(
  config: VPCApiConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (config.credentials) {
    const token = btoa(`${config.credentials.userId}:${config.credentials.password}`);
    headers['Authorization'] = `Basic ${token}`;
  }
  const _fetch = config.fetch ?? fetch;
  const res = await _fetch(`${config.baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`VPC API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-services
// ─────────────────────────────────────────────────────────────────────────────

class AccountManagementService {
  constructor(
    private readonly store: SandboxStore,
    private readonly apiConfig: VPCApiConfig | null,
  ) {}

  /**
   * Register a virtual card account with VPC (required before setting rules).
   * @example
   * ```ts
   * const account = await vpc.AccountManagement.createAccount({
   *   accountNumber: '4111111111111111',
   *   contacts: [{ name: 'Procurement Officer', email: 'proc@gov.example' }],
   * });
   * ```
   */
  async createAccount(params: VPCCreateAccountParams): Promise<VPCAccount> {
    if (this.apiConfig) {
      return apiRequest<VPCAccount>(this.apiConfig, 'POST', '/vpc/v1/accounts', params);
    }

    const accountId = uuid();
    const now = isoNow();
    const account: VPCAccount = {
      accountId,
      accountNumber: params.accountNumber,
      status: 'active',
      contacts: params.contacts?.map((c) => ({ ...c, contactId: uuid() })) ?? [],
      rules: params.rules ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.store.accounts.set(accountId, account);
    this.store.notifications.set(accountId, []);
    this.store.transactions.set(accountId, []);
    return account;
  }

  /** Retrieve a registered account with its contacts and current rules. */
  async getAccount(accountId: string): Promise<VPCAccount> {
    if (this.apiConfig) {
      return apiRequest<VPCAccount>(this.apiConfig, 'GET', `/vpc/v1/accounts/${accountId}`);
    }
    const account = this.store.accounts.get(accountId);
    if (!account) throw new Error(`VPC account not found: ${accountId}`);
    return account;
  }

  /** Update account contacts. */
  async updateAccount(
    accountId: string,
    params: VPCUpdateAccountParams,
  ): Promise<VPCAccount> {
    if (this.apiConfig) {
      return apiRequest<VPCAccount>(this.apiConfig, 'PUT', `/vpc/v1/accounts/${accountId}`, params);
    }
    const account = await this.getAccount(accountId);
    if (params.contacts !== undefined) {
      account.contacts = params.contacts.map((c) => ({
        ...c,
        contactId: c.contactId ?? uuid(),
      }));
    }
    account.updatedAt = isoNow();
    return account;
  }

  /**
   * Delete an account and all associated rules + notifications.
   * This action cannot be undone.
   */
  async deleteAccount(accountId: string): Promise<void> {
    if (this.apiConfig) {
      await apiRequest<void>(this.apiConfig, 'DELETE', `/vpc/v1/accounts/${accountId}`);
      return;
    }
    if (!this.store.accounts.has(accountId)) {
      throw new Error(`VPC account not found: ${accountId}`);
    }
    this.store.accounts.delete(accountId);
    this.store.notifications.delete(accountId);
    this.store.transactions.delete(accountId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

class RulesManagementService {
  constructor(
    private readonly store: SandboxStore,
    private readonly apiConfig: VPCApiConfig | null,
  ) {}

  /**
   * Full replacement of all rules on an account (near real-time).
   * Any existing rules are discarded and replaced with the provided list.
   *
   * @example
   * ```ts
   * await vpc.Rules.setRules(accountId, [
   *   { ruleCode: 'SPV', spendVelocity: { limitAmount: 5000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 10 } },
   *   { ruleCode: 'HOT' },
   * ]);
   * ```
   */
  async setRules(accountId: string, rules: VPCRule[]): Promise<VPCAccount> {
    if (this.apiConfig) {
      return apiRequest<VPCAccount>(
        this.apiConfig, 'PUT', `/vpc/v1/accounts/${accountId}/rules`, { rules },
      );
    }
    const account = this._getAccount(accountId);
    account.rules = rules;
    account.updatedAt = isoNow();
    return account;
  }

  /** Retrieve all rules and current SPV/SPP spend usage for an account. */
  async getRules(accountId: string): Promise<{ rules: VPCRule[]; status: VPCAccountStatus }> {
    if (this.apiConfig) {
      return apiRequest(this.apiConfig, 'GET', `/vpc/v1/accounts/${accountId}/rules`);
    }
    const account = this._getAccount(accountId);
    return { rules: account.rules, status: account.status };
  }

  /** Remove all rules from an account (card becomes unrestricted). */
  async deleteRules(accountId: string): Promise<void> {
    if (this.apiConfig) {
      await apiRequest<void>(this.apiConfig, 'DELETE', `/vpc/v1/accounts/${accountId}/rules`);
      return;
    }
    const account = this._getAccount(accountId);
    account.rules = [];
    account.updatedAt = isoNow();
  }

  /**
   * Block all transactions on an account (equivalent to setting HOT rule).
   * Also clears all existing rules.
   */
  async blockAccount(accountId: string): Promise<VPCAccount> {
    if (this.apiConfig) {
      return apiRequest<VPCAccount>(
        this.apiConfig, 'POST', `/vpc/v1/accounts/${accountId}/block`,
      );
    }
    const account = this._getAccount(accountId);
    account.rules = [{ ruleCode: 'HOT' }];
    account.status = 'blocked';
    account.updatedAt = isoNow();
    return account;
  }

  /** Temporarily disable all rules (transactions pass without control). */
  async disableRules(accountId: string): Promise<VPCAccount> {
    if (this.apiConfig) {
      return apiRequest<VPCAccount>(
        this.apiConfig, 'POST', `/vpc/v1/accounts/${accountId}/rules/disable`,
      );
    }
    const account = this._getAccount(accountId);
    account.status = 'rules_disabled';
    account.updatedAt = isoNow();
    return account;
  }

  /** Re-enable previously disabled rules. */
  async enableRules(accountId: string): Promise<VPCAccount> {
    if (this.apiConfig) {
      return apiRequest<VPCAccount>(
        this.apiConfig, 'POST', `/vpc/v1/accounts/${accountId}/rules/enable`,
      );
    }
    const account = this._getAccount(accountId);
    account.status = 'active';
    account.updatedAt = isoNow();
    return account;
  }

  private _getAccount(accountId: string): VPCAccount {
    const account = this.store.accounts.get(accountId);
    if (!account) throw new Error(`VPC account not found: ${accountId}`);
    return account;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

class ReportingService {
  constructor(
    private readonly store: SandboxStore,
    private readonly apiConfig: VPCApiConfig | null,
  ) {}

  /**
   * Retrieve email / SMS notification history for an account.
   *
   * @example
   * ```ts
   * const history = await vpc.Reporting.getNotificationHistory(accountId, {
   *   event: 'transaction_declined',
   *   fromDate: '2025-05-01',
   * });
   * ```
   */
  async getNotificationHistory(
    accountId: string,
    params?: VPCGetNotificationHistoryParams,
  ): Promise<VPCNotification[]> {
    if (this.apiConfig) {
      const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
      return apiRequest<VPCNotification[]>(
        this.apiConfig, 'GET', `/vpc/v1/accounts/${accountId}/notifications${qs}`,
      );
    }
    let notifications = this.store.notifications.get(accountId) ?? [];
    if (params?.event) notifications = notifications.filter((n) => n.event === params.event);
    if (params?.fromDate) notifications = notifications.filter((n) => n.sentAt >= params.fromDate!);
    if (params?.toDate)   notifications = notifications.filter((n) => n.sentAt <= params.toDate!);
    if (params?.limit)    notifications = notifications.slice(0, params.limit);
    return notifications;
  }

  /**
   * Retrieve transaction history with VPC decline details.
   *
   * @example
   * ```ts
   * const txns = await vpc.Reporting.getTransactionHistory(accountId, {
   *   outcome: 'declined',
   *   fromDate: '2025-05-01',
   * });
   * ```
   */
  async getTransactionHistory(
    accountId: string,
    params?: VPCGetTransactionHistoryParams,
  ): Promise<VPCTransaction[]> {
    if (this.apiConfig) {
      const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
      return apiRequest<VPCTransaction[]>(
        this.apiConfig, 'GET', `/vpc/v1/accounts/${accountId}/transactions${qs}`,
      );
    }
    let txns = this.store.transactions.get(accountId) ?? [];
    if (params?.outcome)  txns = txns.filter((t) => t.outcome === params.outcome);
    if (params?.fromDate) txns = txns.filter((t) => t.transactedAt >= params.fromDate!);
    if (params?.toDate)   txns = txns.filter((t) => t.transactedAt <= params.toDate!);
    if (params?.limit)    txns = txns.slice(0, params.limit);
    return txns;
  }

  /**
   * Inject a mock transaction into the sandbox store (useful for testing).
   * Not available in live mode.
   */
  injectTransaction(accountId: string, txn: Omit<VPCTransaction, 'transactionId' | 'accountId'>): VPCTransaction {
    if (this.apiConfig) throw new Error('injectTransaction is sandbox-only');
    const record: VPCTransaction = { transactionId: uuid(), accountId, ...txn };
    const list = this.store.transactions.get(accountId) ?? [];
    list.push(record);
    this.store.transactions.set(accountId, list);
    return record;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const IPC_RULE_TEMPLATES: Record<string, IPCSuggestedRuleSet> = {
  travel: {
    ruleSetId: 'ipc-tpl-travel',
    rationale: 'Travel card: airline, hotel, and transport spending allowed; ATM cash blocked; $10,000/month velocity.',
    confidence: 88,
    rules: [
      { ruleCode: 'SPV', spendVelocity: { limitAmount: 10_000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 30 } },
      { ruleCode: 'LOC', location: {} },  // all countries allowed for travel
    ],
  },
  office_supplies: {
    ruleSetId: 'ipc-tpl-office',
    rationale: 'Office supplies card: MCCs for stationery, electronics, furniture; $2,000/month limit; online only.',
    confidence: 91,
    rules: [
      { ruleCode: 'SPV', spendVelocity: { limitAmount: 2_000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 20 } },
      { ruleCode: 'MCC', mcc: { allowedMCCs: ['5111', '5112', '5065', '5045', '5021'] } },
      { ruleCode: 'CHN', channel: { allowOnline: true, allowPOS: true, allowATM: false, allowContactless: true } },
    ],
  },
  medical: {
    ruleSetId: 'ipc-tpl-medical',
    rationale: 'Medical procurement: healthcare MCCs allowed; $50,000/month; POS and online; cross-border allowed.',
    confidence: 94,
    rules: [
      { ruleCode: 'SPV', spendVelocity: { limitAmount: 50_000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 50 } },
      { ruleCode: 'MCC', mcc: { allowedMCCs: ['5047', '5122', '8099', '8049', '8011'] } },
      { ruleCode: 'CHN', channel: { allowOnline: true, allowPOS: true, allowATM: false, allowContactless: false } },
    ],
  },
  it_services: {
    ruleSetId: 'ipc-tpl-it',
    rationale: 'IT services card: software, cloud, and tech vendors; $25,000/month; online transactions only.',
    confidence: 89,
    rules: [
      { ruleCode: 'SPV', spendVelocity: { limitAmount: 25_000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 40 } },
      { ruleCode: 'MCC', mcc: { allowedMCCs: ['7372', '7371', '7379', '5045'] } },
      { ruleCode: 'CHN', channel: { allowOnline: true, allowPOS: false, allowATM: false, allowContactless: false } },
    ],
  },
  default: {
    ruleSetId: 'ipc-tpl-default',
    rationale: 'General-purpose card: $5,000/month spend velocity; ATM blocked; all merchant categories allowed.',
    confidence: 75,
    rules: [
      { ruleCode: 'SPV', spendVelocity: { limitAmount: 5_000, currencyCode: '840', periodType: 'monthly', maxAuthCount: 20 } },
      { ruleCode: 'CHN', channel: { allowOnline: true, allowPOS: true, allowATM: false, allowContactless: true } },
    ],
  },
};

class IntelligentPaymentControlsService {
  private readonly pendingSuggestions = new Map<string, IPCSuggestedRuleSet[]>();

  constructor(
    private readonly store: SandboxStore,
    private readonly apiConfig: VPCApiConfig | null,
  ) {}

  /**
   * Submit a natural-language prompt and receive Gen-AI rule suggestions.
   * Returns a `promptId` and one or more ranked rule sets.
   *
   * @example
   * ```ts
   * const { suggestions } = await vpc.IPC.getSuggestedRules({
   *   prompt: 'Medical equipment procurement, max $50k per month, domestic only',
   *   currencyCode: '840',
   * });
   * const best = suggestions[0];
   * console.log(best.rationale);
   * await vpc.IPC.setSuggestedRules(best.ruleSetId, accountId);
   * ```
   */
  async getSuggestedRules(request: IPCPromptRequest): Promise<IPCRuleSetResponse> {
    if (this.apiConfig) {
      return apiRequest<IPCRuleSetResponse>(
        this.apiConfig, 'POST', '/vpc/v1/ipc/suggest', request,
      );
    }

    // Sandbox: keyword match → template selection
    const lower = request.prompt.toLowerCase();
    let template: IPCSuggestedRuleSet;

    if (lower.includes('travel') || lower.includes('airline') || lower.includes('hotel')) {
      template = IPC_RULE_TEMPLATES.travel;
    } else if (lower.includes('office') || lower.includes('stationery') || lower.includes('supplies')) {
      template = IPC_RULE_TEMPLATES.office_supplies;
    } else if (lower.includes('medical') || lower.includes('health') || lower.includes('pharmaceutical')) {
      template = IPC_RULE_TEMPLATES.medical;
    } else if (lower.includes('it') || lower.includes('software') || lower.includes('cloud') || lower.includes('tech')) {
      template = IPC_RULE_TEMPLATES.it_services;
    } else {
      template = IPC_RULE_TEMPLATES.default;
    }

    const promptId = uuid();
    const suggestions = [template, IPC_RULE_TEMPLATES.default].filter(
      (v, i, arr) => arr.indexOf(v) === i,
    );
    this.pendingSuggestions.set(promptId, suggestions);

    return {
      promptId,
      prompt: request.prompt,
      suggestions,
      generatedAt: isoNow(),
    };
  }

  /**
   * Apply a suggested rule set to an account, with optional overrides.
   * The account must exist before calling this method.
   */
  async setSuggestedRules(
    ruleSetId: string,
    accountId: string,
    overrides?: Partial<Record<string, unknown>>,
  ): Promise<VPCAccount> {
    if (this.apiConfig) {
      return apiRequest<VPCAccount>(
        this.apiConfig, 'POST', `/vpc/v1/ipc/apply`, { ruleSetId, accountId, overrides },
      );
    }

    // Find the rule set across all pending suggestions (or in templates)
    let ruleSet: IPCSuggestedRuleSet | undefined;
    for (const suggestions of this.pendingSuggestions.values()) {
      ruleSet = suggestions.find((s) => s.ruleSetId === ruleSetId);
      if (ruleSet) break;
    }
    if (!ruleSet) {
      ruleSet = Object.values(IPC_RULE_TEMPLATES).find((t) => t.ruleSetId === ruleSetId);
    }
    if (!ruleSet) throw new Error(`IPC rule set not found: ${ruleSetId}`);

    const account = this.store.accounts.get(accountId);
    if (!account) throw new Error(`VPC account not found: ${accountId}`);

    account.rules = ruleSet.rules;
    account.updatedAt = isoNow();
    return account;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

class SupplierValidationService {
  constructor(
    private readonly store: SandboxStore,
    private readonly apiConfig: VPCApiConfig | null,
  ) {}

  /**
   * Register a supplier for VPC validation (Acquirer BIN + CAID).
   *
   * @example
   * ```ts
   * const validation = await vpc.SupplierValidation.registerSupplier({
   *   supplierName: 'MedEquip Co.',
   *   acquirerBin:  '411111',
   *   caid:         'MEDSUPPLY_001',
   *   countryCode:  'US',
   *   mcc:          '5047',
   * });
   * ```
   */
  async registerSupplier(params: VPCSupplierRegistration): Promise<VPCSupplierValidation> {
    if (this.apiConfig) {
      return apiRequest<VPCSupplierValidation>(
        this.apiConfig, 'POST', '/vpc/v1/suppliers', params,
      );
    }

    const supplierId = uuid();
    const now = isoNow();
    const record: VPCSupplierValidation = {
      supplierId,
      acquirerBin:  params.acquirerBin,
      caid:         params.caid,
      supplierName: params.supplierName,
      status:       'pending',
      createdAt:    now,
      updatedAt:    now,
    };
    this.store.suppliers.set(supplierId, record);

    // Sandbox: auto-validate after a tick (simulates async validation)
    setTimeout(() => {
      const rec = this.store.suppliers.get(supplierId);
      if (rec && rec.status === 'pending') {
        rec.status = 'validated';
        rec.validatedAt = isoNow();
        rec.updatedAt = isoNow();
      }
    }, 50);

    return record;
  }

  /** Update a supplier's validation status. */
  async updateSupplier(
    supplierId: string,
    params: { status?: VPCValidationStatus; rejectionReason?: string },
  ): Promise<VPCSupplierValidation> {
    if (this.apiConfig) {
      return apiRequest<VPCSupplierValidation>(
        this.apiConfig, 'PUT', `/vpc/v1/suppliers/${supplierId}`, params,
      );
    }
    const record = this.store.suppliers.get(supplierId);
    if (!record) throw new Error(`VPC supplier not found: ${supplierId}`);
    if (params.status)           record.status = params.status;
    if (params.rejectionReason)  record.rejectionReason = params.rejectionReason;
    record.updatedAt = isoNow();
    return record;
  }

  /** Retrieve a supplier validation record by Acquirer BIN + CAID. */
  async retrieveSupplier(acquirerBin: string, caid: string): Promise<VPCSupplierValidation> {
    if (this.apiConfig) {
      return apiRequest<VPCSupplierValidation>(
        this.apiConfig, 'GET', `/vpc/v1/suppliers?acquirerBin=${acquirerBin}&caid=${caid}`,
      );
    }
    for (const record of this.store.suppliers.values()) {
      if (record.acquirerBin === acquirerBin && record.caid === caid) {
        return record;
      }
    }
    throw new Error(`VPC supplier not found: BIN=${acquirerBin} CAID=${caid}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VPCService — main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VPCService — Visa B2B Payment Controls
 *
 * Access five sub-services as named properties:
 *
 * ```ts
 * const vpc = new VPCService();             // sandbox mode
 * const vpc = new VPCService({ baseUrl, credentials }); // live mode
 *
 * const account = await vpc.AccountManagement.createAccount({ accountNumber: '4111…' });
 * await vpc.Rules.setRules(account.accountId, [{ ruleCode: 'SPV', spendVelocity: { … } }]);
 * const { suggestions } = await vpc.IPC.getSuggestedRules({ prompt: 'Medical procurement max $50k/mo' });
 * await vpc.IPC.setSuggestedRules(suggestions[0].ruleSetId, account.accountId);
 * const txns = await vpc.Reporting.getTransactionHistory(account.accountId, { outcome: 'declined' });
 * ```
 */
export class VPCService {
  /** Account registration and lifecycle management */
  readonly AccountManagement: AccountManagementService;
  /** Rule set management (set / get / delete / block / enable / disable) */
  readonly Rules: RulesManagementService;
  /** Notification and transaction history reporting */
  readonly Reporting: ReportingService;
  /** Gen-AI Intelligent Payment Controls — natural language → rule suggestions */
  readonly IPC: IntelligentPaymentControlsService;
  /** Supplier registration and CAID validation */
  readonly SupplierValidation: SupplierValidationService;

  private readonly store: SandboxStore;

  constructor(apiConfig?: VPCApiConfig) {
    this.store = createStore();
    const config = apiConfig ?? null;
    this.AccountManagement  = new AccountManagementService(this.store, config);
    this.Rules               = new RulesManagementService(this.store, config);
    this.Reporting           = new ReportingService(this.store, config);
    this.IPC                 = new IntelligentPaymentControlsService(this.store, config);
    this.SupplierValidation  = new SupplierValidationService(this.store, config);
  }

  /** Create a sandbox instance (no credentials required). */
  static sandbox(): VPCService {
    return new VPCService();
  }

  /** Create a live instance connected to the Visa VPC API. */
  static live(config: VPCApiConfig): VPCService {
    return new VPCService(config);
  }
}
