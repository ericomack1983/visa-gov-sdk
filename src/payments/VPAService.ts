// ─────────────────────────────────────────────────────────────────────────────
// VPAService — Visa B2B Virtual Account Payment (VPA)
//
// Five sub-services:
//   Buyer          — create / update / get buyer profiles and templates
//   FundingAccount — add PAN, request virtual accounts, manage controls
//   ProxyPool      — create / update / get / delete pre-provisioned pools
//   Supplier       — create / update / get / disable suppliers
//   Payment        — process / get / resend / cancel payments + requisitions
//
// All Visa VPA endpoints use action-based POST URLs — request params are
// always in the JSON body (clientId + messageId required on every call).
//
// Confirmed base paths from Visa Developer Center API Reference:
//   /vpa/v1/buyerManagement/buyer/create
//   /vpa/v1/buyerManagement/buyer/update        (PATCH)
//   /vpa/v1/buyerManagement/buyer/get
//   /vpa/v1/buyerManagement/buyerTemplate/create
//   /vpa/v1/buyerManagement/buyerTemplate/update (PATCH)
//   /vpa/v1/buyerManagement/buyerTemplate/get
//   /vpa/v1/accountManagement/fundingAccount/add
//   /vpa/v1/accountManagement/fundingAccount/get
//   /vpa/v1/accountManagement/GetSecurityCode
//   /vpa/v1/accountManagement/VirtualCardRequisition
//   /vpa/v1/accountManagement/GetAccountStatus
//   /vpa/v1/accountManagement/getPaymentControls
//   /vpa/v1/accountManagement/ManagePaymentControls
//   /vpa/v1/suaPoolMaintenance/proxyPool/create
//   /vpa/v1/suaPoolMaintenance/proxyPool/update  (PATCH)
//   /vpa/v1/suaPoolMaintenance/proxyPool/get
//   /vpa/v1/suaPoolMaintenance/proxyPool/delete
//   /vpa/v1/suaPoolMaintenance/manageProxyPool
//   /vpa/v1/supplierManagement/supplier/create
//   /vpa/v1/supplierManagement/supplier/update   (PATCH)
//   /vpa/v1/supplierManagement/supplier/get
//   /vpa/v1/supplierManagement/supplier/disable
//   /vpa/v1/supplierManagement/ManageSupplierAccount
//   /vpa/v1/paymentService/processPayments
//   /vpa/v1/paymentService/getPaymentDetails
//   /vpa/v1/paymentService/resendPayment
//   /vpa/v1/paymentService/cancelPayment
//   /vpa/v1/paymentService/getPaymentDetailURL
//   /vpa/v1/requisitionService
// ─────────────────────────────────────────────────────────────────────────────

import { resolveFetch } from '../client';
import type {
  VPAApiConfig,
  VPABuyer,
  VPABuyerTemplate,
  VPACreateBuyerParams,
  VPACreateBuyerTemplateParams,
  VPAUpdateBuyerParams,
  VPAUpdateBuyerTemplateParams,
  VPAFundingAccount,
  VPASecurityCode,
  VPAAddFundingAccountParams,
  VPARequestVirtualAccountParams,
  VPAVirtualAccount,
  VPAAccountStatus,
  VPAManagePaymentControlsParams,
  VPAPaymentControls,
  VPACreateProxyPoolParams,
  VPAUpdateProxyPoolParams,
  VPAProxyPool,
  VPAManageProxyPoolParams,
  VPACreateSupplierParams,
  VPAUpdateSupplierParams,
  VPASupplier,
  VPAManageSupplierAccountParams,
  VPAProcessPaymentParams,
  VPAPayment,
  VPAPaymentUrl,
  VPAPaymentRequisitionParams,
  VPARequisitionResponse,
} from '../types/vpa';

export type { VPAApiConfig } from '../types/vpa';

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
  buyers:       Map<string, VPABuyer>;
  templates:    Map<string, VPABuyerTemplate>;
  funding:      Map<string, VPAFundingAccount>;
  virtualAccts: Map<string, VPAVirtualAccount>;
  controls:     Map<string, VPAPaymentControls>;
  pools:        Map<string, VPAProxyPool>;
  suppliers:    Map<string, VPASupplier>;
  payments:     Map<string, VPAPayment>;
  requisitions: Map<string, VPARequisitionResponse>;
}

function createStore(): SandboxStore {
  return {
    buyers:       new Map(),
    templates:    new Map(),
    funding:      new Map(),
    virtualAccts: new Map(),
    controls:     new Map(),
    pools:        new Map(),
    suppliers:    new Map(),
    payments:     new Map(),
    requisitions: new Map(),
  };
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function apiRequest<T>(
  config: VPAApiConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (config.credentials) {
    const token = Buffer.from(
      `${config.credentials.userId}:${config.credentials.password}`,
    ).toString('base64');
    headers['Authorization'] = `Basic ${token}`;
  }

  const _fetch = resolveFetch({
    fetch: config.fetch as ((url: string, init: RequestInit) => Promise<Response>) | undefined,
    cert: config.cert,
    key:  config.key,
    ca:   config.ca,
  });

  const res = await _fetch(`${config.baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`VPA API error [${method} ${path}]: ${res.status} ${res.statusText} — ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-services
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Buyer Management ───────────────────────────────────────────────────────

class BuyerManagementService {
  constructor(
    private readonly store: SandboxStore,
    private readonly api: VPAApiConfig | null,
  ) {}

  /**
   * Create a new buyer profile.
   * Endpoint: POST /vpa/v1/buyerManagement/buyer/create
   *
   * @example
   * ```ts
   * const buyer = await vpa.Buyer.createBuyer({
   *   messageId: crypto.randomUUID(),
   *   clientId: 'CORP_001',
   *   billingCurrency: '840',
   *   paymentNotificationConfig: { emailNotification: true, notificationEmailAddress: 'ap@corp.com' },
   *   authorizationControlConfig: { authorizationControlEnabled: true },
   * });
   * ```
   */
  async createBuyer(params: VPACreateBuyerParams): Promise<VPABuyer> {
    if (this.api) {
      return apiRequest<VPABuyer>(
        this.api, 'POST', '/vpa/v1/buyerManagement/buyer/create', params,
      );
    }
    const buyerId = uuid();
    const buyer: VPABuyer = {
      buyerId,
      clientId: params.clientId,
      billingCurrency: params.billingCurrency,
      status: 'active',
      paymentNotificationConfig: params.paymentNotificationConfig,
      expirationDays: params.expirationDays ?? 30,
      createdAt: isoNow(),
      updatedAt: isoNow(),
    };
    this.store.buyers.set(buyerId, buyer);
    return buyer;
  }

  /**
   * Update an existing buyer's parameters.
   * Endpoint: PATCH /vpa/v1/buyerManagement/buyer/update
   */
  async updateBuyer(params: VPAUpdateBuyerParams & { buyerId: string }): Promise<VPABuyer> {
    if (this.api) {
      return apiRequest<VPABuyer>(
        this.api, 'PATCH', '/vpa/v1/buyerManagement/buyer/update', params,
      );
    }
    const buyer = this._get(params.buyerId);
    Object.assign(buyer, params, { updatedAt: isoNow() });
    return buyer;
  }

  /**
   * Retrieve all parameters of a buyer.
   * Endpoint: POST /vpa/v1/buyerManagement/buyer/get
   */
  async getBuyer(params: { clientId: string; messageId: string; buyerId: string }): Promise<VPABuyer> {
    if (this.api) {
      return apiRequest<VPABuyer>(
        this.api, 'POST', '/vpa/v1/buyerManagement/buyer/get', params,
      );
    }
    return this._get(params.buyerId);
  }

  /**
   * Create a buyer template to streamline buyer onboarding.
   * Endpoint: POST /vpa/v1/buyerManagement/buyerTemplate/create
   * Note: templateId is permanently associated with a buyer once assigned.
   */
  async createBuyerTemplate(params: VPACreateBuyerTemplateParams): Promise<VPABuyerTemplate> {
    if (this.api) {
      return apiRequest<VPABuyerTemplate>(
        this.api, 'POST', '/vpa/v1/buyerManagement/buyerTemplate/create', params,
      );
    }
    const templateId = uuid();
    const tpl: VPABuyerTemplate = {
      templateId,
      clientId: params.clientId,
      templateName: params.templateName,
      billingCurrency: params.billingCurrency,
      createdAt: isoNow(),
      updatedAt: isoNow(),
    };
    this.store.templates.set(templateId, tpl);
    return tpl;
  }

  /**
   * Update a buyer template.
   * Endpoint: PATCH /vpa/v1/buyerManagement/buyerTemplate/update
   */
  async updateBuyerTemplate(
    params: VPAUpdateBuyerTemplateParams & { templateId: string },
  ): Promise<VPABuyerTemplate> {
    if (this.api) {
      return apiRequest<VPABuyerTemplate>(
        this.api, 'PATCH', '/vpa/v1/buyerManagement/buyerTemplate/update', params,
      );
    }
    const tpl = this.store.templates.get(params.templateId);
    if (!tpl) throw new Error(`VPA template not found: ${params.templateId}`);
    Object.assign(tpl, params, { updatedAt: isoNow() });
    return tpl;
  }

  /**
   * Retrieve a buyer template.
   * Endpoint: POST /vpa/v1/buyerManagement/buyerTemplate/get
   */
  async getBuyerTemplate(
    params: { clientId: string; messageId: string; templateId: string },
  ): Promise<VPABuyerTemplate> {
    if (this.api) {
      return apiRequest<VPABuyerTemplate>(
        this.api, 'POST', '/vpa/v1/buyerManagement/buyerTemplate/get', params,
      );
    }
    const tpl = this.store.templates.get(params.templateId);
    if (!tpl) throw new Error(`VPA template not found: ${params.templateId}`);
    return tpl;
  }

  private _get(buyerId: string): VPABuyer {
    const b = this.store.buyers.get(buyerId);
    if (!b) throw new Error(`VPA buyer not found: ${buyerId}`);
    return b;
  }
}

// ── 2. Funding Account & Virtual Account Management ───────────────────────────

class FundingAccountService {
  constructor(
    private readonly store: SandboxStore,
    private readonly api: VPAApiConfig | null,
  ) {}

  /**
   * Add a 16-digit PAN as a primary funding account for a buyer.
   * Endpoint: POST /vpa/v1/accountManagement/fundingAccount/add
   */
  async addFundingAccount(
    params: VPAAddFundingAccountParams & { clientId: string; buyerId: string },
  ): Promise<VPAFundingAccount> {
    if (this.api) {
      return apiRequest<VPAFundingAccount>(
        this.api, 'POST', '/vpa/v1/accountManagement/fundingAccount/create', params,
      );
    }
    const acct: VPAFundingAccount = {
      accountNumber: params.accountNumber,
      creditLimit: 100_000,
      expirationDate: '12/2027',
      activeVirtualAccounts: 0,
      status: 'active',
    };
    this.store.funding.set(`${params.buyerId}:${params.accountNumber}`, acct);
    return acct;
  }

  /**
   * Retrieve credit limit, expiration, and active virtual account count.
   * Endpoint: POST /vpa/v1/accountManagement/fundingAccount/get
   */
  async getFundingAccount(
    params: { clientId: string; messageId: string; buyerId: string; accountNumber: string },
  ): Promise<VPAFundingAccount> {
    if (this.api) {
      return apiRequest<VPAFundingAccount>(
        this.api, 'POST', '/vpa/v1/accountManagement/fundingAccount/get', params,   // 401: requires processor credential
      );
    }
    const acct = this.store.funding.get(`${params.buyerId}:${params.accountNumber}`);
    if (!acct) throw new Error(`VPA funding account not found`);
    return acct;
  }

  /**
   * Retrieve CVV2 from the processor for a virtual account.
   * Endpoint: POST /vpa/v1/accountManagement/GetSecurityCode
   * PCI compliance required when handling unmasked CVV2.
   */
  async getSecurityCode(
    params: { clientId: string; messageId: string; buyerId: string; accountNumber: string; expirationDate?: string },
  ): Promise<VPASecurityCode> {
    if (this.api) {
      return apiRequest<VPASecurityCode>(
        this.api, 'POST', '/vpa/v1/accountManagement/GetSecurityCode', params,
      );
    }
    return {
      accountNumber: params.accountNumber,
      cvv2: String(Math.floor(100 + Math.random() * 900)),
    };
  }

  /**
   * Request one or more Virtual Accounts (VirtualCardRequisition).
   * Endpoint: POST /vpa/v1/accountManagement/VirtualCardRequisition
   *
   * @example
   * ```ts
   * const vans = await vpa.FundingAccount.requestVirtualAccount({
   *   clientId: 'CORP_001',
   *   messageId: crypto.randomUUID(),
   *   buyerId: '9999',
   *   accountNumber: '4111111111111111',
   *   requisitionDetails: {
   *     startDate: '2026-04-01',
   *     endDate: '2026-06-30',
   *     rules: [{ ruleCode: 'SPV', spendLimitAmount: 5000 }],
   *   },
   * });
   * ```
   */
  async requestVirtualAccount(
    params: VPARequestVirtualAccountParams & { clientId: string; buyerId: string; accountNumber: string },
  ): Promise<VPAVirtualAccount[]> {
    if (this.api) {
      return apiRequest<VPAVirtualAccount[]>(
        this.api, 'POST', '/vpa/v1/accountManagement/VirtualCardRequisition', params,
      );
    }
    const count = parseInt(params.numberOfCards ?? '1', 10);
    return Array.from({ length: count }, () => {
      const van = '4' + Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join('');
      const exp = (() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() + 3);
        return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      })();
      const acct: VPAVirtualAccount = { accountNumber: van, expiryDate: exp, status: 'active' };
      this.store.virtualAccts.set(`${params.buyerId}:${params.accountNumber}:${van}`, acct);
      return acct;
    });
  }

  /**
   * Get current status of a virtual or funding account.
   * Endpoint: POST /vpa/v1/accountManagement/GetAccountStatus
   */
  async getAccountStatus(
    params: { clientId: string; messageId: string; buyerId: string; supplierId?: string; accountRequestID?: string },
  ): Promise<VPAAccountStatus> {
    if (this.api) {
      return apiRequest<VPAAccountStatus>(
        this.api, 'POST', '/vpa/v1/accountManagement/GetAccountStatus', params,
      );
    }
    return { accountNumber: params.accountRequestID ?? '', status: 'active' };
  }

  /**
   * View current payment control rules on a virtual account.
   * Endpoint: POST /vpa/v1/accountManagement/getPaymentControls
   */
  async getPaymentControls(
    params: { clientId: string; messageId: string; buyerId: string; accountNumber: string },
  ): Promise<VPAPaymentControls> {
    if (this.api) {
      return apiRequest<VPAPaymentControls>(
        this.api, 'POST', '/vpa/v1/accountManagement/getPaymentControls', params,
      );
    }
    return this.store.controls.get(`${params.buyerId}:${params.accountNumber}`)
      ?? { accountNumber: params.accountNumber, rules: [] };
  }

  /**
   * Add, update, or delete payment control rules on a virtual account.
   * Endpoint: POST /vpa/v1/accountManagement/ManagePaymentControls
   */
  async managePaymentControls(
    params: VPAManagePaymentControlsParams & { clientId: string; buyerId: string; accountNumber: string },
  ): Promise<VPAPaymentControls> {
    if (this.api) {
      return apiRequest<VPAPaymentControls>(
        this.api, 'POST', '/vpa/v1/accountManagement/ManagePaymentControls', params,
      );
    }
    const controls: VPAPaymentControls = { accountNumber: params.accountNumber, rules: params.rules };
    this.store.controls.set(`${params.buyerId}:${params.accountNumber}`, controls);
    return controls;
  }

  /**
   * Get details for a specific requisition.
   * Endpoint: POST /vpa/v1/getRequisitionDetails
   */
  async getRequisitionDetails(
    params: { clientId: string; messageId: string; buyerId: string; accountNumber: string },
  ): Promise<VPARequisitionResponse> {
    if (this.api) {
      return apiRequest<VPARequisitionResponse>(
        this.api, 'POST', '/vpa/v1/getRequisitionDetails', params,
      );
    }
    return this.store.requisitions.get(params.accountNumber)
      ?? { requisitionId: uuid(), accountNumber: params.accountNumber, status: 'active', createdAt: isoNow() };
  }
}

// ── 3. Proxy Pool Management ──────────────────────────────────────────────────

class ProxyPoolService {
  constructor(
    private readonly store: SandboxStore,
    private readonly api: VPAApiConfig | null,
  ) {}

  /**
   * Create a proxy pool — a pre-provisioned pool of virtual accounts.
   * Endpoint: POST /vpa/v1/suaPoolMaintenance/proxyPool/create
   * Initial order populates within ~15 minutes of creation.
   *
   * @example
   * ```ts
   * const pool = await vpa.ProxyPool.createProxyPool({
   *   clientId: 'CORP_001', messageId: crypto.randomUUID(), buyerId: '9999',
   *   proxyPoolName: 'Q2 Procurement Pool',
   *   initialOrderCount: 100, minAvailableAccounts: 20, reOrderCount: 50,
   * });
   * ```
   */
  async createProxyPool(
    params: VPACreateProxyPoolParams & { clientId: string; buyerId: string },
  ): Promise<VPAProxyPool> {
    if (this.api) {
      return apiRequest<VPAProxyPool>(
        this.api, 'POST', '/vpa/v1/suaPoolMaintenance/proxyPool/create', params,
      );
    }
    const proxyPoolId = 'POOL_' + Math.random().toString(36).slice(2, 10).toUpperCase();
    const pool: VPAProxyPool = {
      proxyPoolId,
      buyerId: params.buyerId,
      proxyPoolName: params.proxyPoolName,
      initialOrderCount: params.initialOrderCount ?? 0,
      minAvailableAccounts: params.minAvailableAccounts ?? 0,
      reOrderCount: params.reOrderCount ?? 0,
      availableAccounts: params.initialOrderCount ?? 0,
      status: 'active',
      createdAt: isoNow(),
      updatedAt: isoNow(),
    };
    this.store.pools.set(`${params.buyerId}:${proxyPoolId}`, pool);
    return pool;
  }

  /**
   * Update proxy pool thresholds.
   * Endpoint: PATCH /vpa/v1/suaPoolMaintenance/proxyPool/update
   */
  async updateProxyPool(
    params: VPAUpdateProxyPoolParams & { clientId: string; buyerId: string; proxyPoolId: string },
  ): Promise<VPAProxyPool> {
    if (this.api) {
      return apiRequest<VPAProxyPool>(
        this.api, 'PATCH', '/vpa/v1/suaPoolMaintenance/proxyPool/update', params,
      );
    }
    const pool = this._getPool(params.buyerId, params.proxyPoolId);
    Object.assign(pool, params, { updatedAt: isoNow() });
    return pool;
  }

  /**
   * Retrieve proxy pool details including available account count.
   * Endpoint: POST /vpa/v1/suaPoolMaintenance/proxyPool/get
   */
  async getProxyPool(
    params: { clientId: string; messageId: string; buyerId: string; proxyPoolId: string },
  ): Promise<VPAProxyPool> {
    if (this.api) {
      return apiRequest<VPAProxyPool>(
        this.api, 'POST', '/vpa/v1/suaPoolMaintenance/proxyPool/get', params,
      );
    }
    return this._getPool(params.buyerId, params.proxyPoolId);
  }

  /**
   * Delete a proxy pool. All active payment instructions must be cancelled first.
   * Endpoint: POST /vpa/v1/suaPoolMaintenance/proxyPool/delete
   */
  async deleteProxyPool(
    params: { clientId: string; messageId: string; buyerId: string; proxyPoolId: string },
  ): Promise<void> {
    if (this.api) {
      await apiRequest<void>(
        this.api, 'POST', '/vpa/v1/suaPoolMaintenance/proxyPool/delete', params,
      );
      return;
    }
    const key = `${params.buyerId}:${params.proxyPoolId}`;
    if (!this.store.pools.has(key)) throw new Error(`VPA proxy pool not found: ${params.proxyPoolId}`);
    this.store.pools.delete(key);
  }

  /**
   * Manually populate a proxy pool with legacy processor PANs.
   * Endpoint: POST /vpa/v1/suaPoolMaintenance/manageProxyPool
   */
  async manageProxyPool(
    params: VPAManageProxyPoolParams & { clientId: string; buyerId: string; proxyPoolId: string },
  ): Promise<VPAProxyPool> {
    if (this.api) {
      return apiRequest<VPAProxyPool>(
        this.api, 'POST', '/vpa/v1/suaPoolMaintenance/manageProxyPool', params,
      );
    }
    const pool = this._getPool(params.buyerId, params.proxyPoolId);
    pool.availableAccounts = (pool.availableAccounts ?? 0) + params.accounts.length;
    pool.updatedAt = isoNow();
    return pool;
  }

  private _getPool(buyerId: string, proxyPoolId: string): VPAProxyPool {
    const pool = this.store.pools.get(`${buyerId}:${proxyPoolId}`);
    if (!pool) throw new Error(`VPA proxy pool not found: buyer=${buyerId} pool=${proxyPoolId}`);
    return pool;
  }
}

// ── 4. Supplier Service ───────────────────────────────────────────────────────

class SupplierService {
  constructor(
    private readonly store: SandboxStore,
    private readonly api: VPAApiConfig | null,
  ) {}

  /**
   * Create a supplier in the VPA registry.
   * Endpoint: POST /vpa/v1/supplierManagement/supplier/create
   *
   * @example
   * ```ts
   * const supplier = await vpa.Supplier.createSupplier({
   *   clientId: 'CORP_001', messageId: crypto.randomUUID(),
   *   supplierName: 'Acme Medical Supplies',
   *   emailAddress: 'ap@acmemedical.com',
   *   paymentDeliveryMethod: 'SIP',
   *   accountModel: 'SUA',
   * });
   * ```
   */
  async createSupplier(params: VPACreateSupplierParams): Promise<VPASupplier> {
    if (this.api) {
      return apiRequest<VPASupplier>(
        this.api, 'POST', '/vpa/v1/supplierManagement/supplier/create', params,
      );
    }
    const supplierId = uuid();
    const supplier: VPASupplier = {
      supplierId,
      clientId: params.clientId,
      supplierName: params.supplierName,
      emailAddress: params.emailAddress,
      paymentDeliveryMethod: params.paymentDeliveryMethod,
      accountModel: params.accountModel,
      status: 'active',
      createdAt: isoNow(),
      updatedAt: isoNow(),
    };
    this.store.suppliers.set(supplierId, supplier);
    return supplier;
  }

  /**
   * Update a supplier's details.
   * Endpoint: PATCH /vpa/v1/supplierManagement/supplier/update
   */
  async updateSupplier(
    params: VPAUpdateSupplierParams & { supplierId: string },
  ): Promise<VPASupplier> {
    if (this.api) {
      return apiRequest<VPASupplier>(
        this.api, 'PATCH', '/vpa/v1/supplierManagement/supplier/update', params,
      );
    }
    const supplier = this._get(params.supplierId);
    Object.assign(supplier, params, { updatedAt: isoNow() });
    return supplier;
  }

  /**
   * Retrieve a supplier by ID.
   * Endpoint: POST /vpa/v1/supplierManagement/supplier/get
   */
  async getSupplier(
    params: { clientId: string; messageId: string; supplierId: string },
  ): Promise<VPASupplier> {
    if (this.api) {
      return apiRequest<VPASupplier>(
        this.api, 'POST', '/vpa/v1/supplierManagement/supplier/get', params,
      );
    }
    return this._get(params.supplierId);
  }

  /**
   * Disable (soft-delete) a supplier.
   * Endpoint: POST /vpa/v1/supplierManagement/supplier/disable
   */
  async disableSupplier(
    params: { clientId: string; messageId: string; supplierId: string },
  ): Promise<VPASupplier> {
    if (this.api) {
      return apiRequest<VPASupplier>(
        this.api, 'POST', '/vpa/v1/supplierManagement/supplier/disable', params,
      );
    }
    const supplier = this._get(params.supplierId);
    supplier.status = 'disabled';
    supplier.updatedAt = isoNow();
    return supplier;
  }

  /**
   * Add or remove a virtual account associated with a supplier.
   * Endpoint: POST /vpa/v1/supplierManagement/ManageSupplierAccount
   */
  async manageSupplierAccount(
    params: VPAManageSupplierAccountParams & { clientId: string; supplierId: string },
  ): Promise<VPASupplier> {
    if (this.api) {
      return apiRequest<VPASupplier>(
        this.api, 'POST', '/vpa/v1/supplierManagement/ManageSupplierAccount', params,
      );
    }
    const supplier = this._get(params.supplierId);
    supplier.updatedAt = isoNow();
    return supplier;
  }

  private _get(supplierId: string): VPASupplier {
    const s = this.store.suppliers.get(supplierId);
    if (!s) throw new Error(`VPA supplier not found: ${supplierId}`);
    return s;
  }
}

// ── 5. Payment Service ────────────────────────────────────────────────────────

class PaymentService {
  constructor(
    private readonly store: SandboxStore,
    private readonly api: VPAApiConfig | null,
  ) {}

  /**
   * Process a payment from a buyer to a supplier.
   * Endpoint: POST /vpa/v1/paymentService/processPayments
   *
   * @example
   * ```ts
   * const payment = await vpa.Payment.processPayment({
   *   clientId: 'CORP_001', messageId: crypto.randomUUID(),
   *   buyerId: '9999', supplierId: 'SUPP_001',
   *   paymentAmount: 1500.00, currencyCode: '840',
   *   invoiceNumber: 'INV-2026-001',
   * });
   * ```
   */
  async processPayment(params: VPAProcessPaymentParams): Promise<VPAPayment> {
    if (this.api) {
      return apiRequest<VPAPayment>(
        this.api, 'POST', '/vpa/v1/payment/processPayments', params,
      );
    }
    const paymentId = uuid();
    const payment: VPAPayment = {
      paymentId,
      buyerId: params.buyerId,
      supplierId: params.supplierId,
      paymentAmount: params.paymentAmount,
      currencyCode: params.currencyCode,
      status: 'pending',
      paymentDate: params.paymentDate ?? isoNow().split('T')[0],
      invoiceNumber: params.invoiceNumber,
      memo: params.memo,
      createdAt: isoNow(),
      updatedAt: isoNow(),
    };
    this.store.payments.set(paymentId, payment);
    return payment;
  }

  /**
   * Retrieve full payment details including current status.
   * Endpoint: POST /vpa/v1/paymentService/getPaymentDetails
   */
  async getPaymentDetails(
    params: { clientId: string; messageId: string; paymentId: string },
  ): Promise<VPAPayment> {
    if (this.api) {
      return apiRequest<VPAPayment>(
        this.api, 'POST', '/vpa/v1/payment/getPaymentDetails', params,
      );
    }
    const p = this.store.payments.get(params.paymentId);
    if (!p) throw new Error(`VPA payment not found: ${params.paymentId}`);
    return p;
  }

  /**
   * Resend a payment notification to the supplier.
   * Endpoint: POST /vpa/v1/paymentService/resendPayment
   */
  async resendPayment(
    params: { clientId: string; messageId: string; paymentId: string },
  ): Promise<VPAPayment> {
    if (this.api) {
      return apiRequest<VPAPayment>(
        this.api, 'POST', '/vpa/v1/payment/resendPayment', params,
      );
    }
    const p = this.store.payments.get(params.paymentId);
    if (!p) throw new Error(`VPA payment not found: ${params.paymentId}`);
    p.updatedAt = isoNow();
    return p;
  }

  /**
   * Cancel a payment. Only permitted for payments in 'unmatched' status.
   * Endpoint: POST /vpa/v1/paymentService/cancelPayment
   */
  async cancelPayment(
    params: { clientId: string; messageId: string; paymentId: string },
  ): Promise<VPAPayment> {
    if (this.api) {
      return apiRequest<VPAPayment>(
        this.api, 'POST', '/vpa/v1/payment/cancelPayment', params,
      );
    }
    const p = this.store.payments.get(params.paymentId);
    if (!p) throw new Error(`VPA payment not found: ${params.paymentId}`);
    if (p.status !== 'unmatched' && p.status !== 'pending') {
      throw new Error(`Cannot cancel payment in status: ${p.status}`);
    }
    p.status = 'cancelled';
    p.updatedAt = isoNow();
    return p;
  }

  /**
   * Retrieve a time-limited payment URL for supplier-initiated payment entry.
   * Endpoint: POST /vpa/v1/paymentService/getPaymentDetailURL
   */
  async getPaymentUrl(
    params: { clientId: string; messageId: string; paymentId: string },
  ): Promise<VPAPaymentUrl> {
    if (this.api) {
      return apiRequest<VPAPaymentUrl>(
        this.api, 'POST', '/vpa/v1/payment/getPaymentDetailURL', params,
      );
    }
    const exp = new Date();
    exp.setHours(exp.getHours() + 24);
    return {
      paymentId: params.paymentId,
      url: `https://sandbox.api.visa.com/vpa/v1/payment/${params.paymentId}/entry`,
      expiresAt: exp.toISOString(),
    };
  }

  /**
   * Create a payment requisition — buyer requests virtual accounts for
   * self-processing with automatic rule application.
   * Endpoint: POST /vpa/v1/requisitionService
   *
   * @example
   * ```ts
   * const req = await vpa.Payment.createRequisition({
   *   clientId: 'CORP_001', messageId: crypto.randomUUID(),
   *   buyerId: '9999', action: 'A',
   *   accountNumber: '4111111111111111',
   *   requisitionDetails: { startDate: '2026-04-01', endDate: '2026-04-30', ... },
   * });
   * ```
   */
  async createRequisition(
    params: VPAPaymentRequisitionParams & { clientId: string; buyerId: string; action: 'A' | 'U' | 'D'; accountNumber?: string; proxyPoolID?: string },
  ): Promise<VPARequisitionResponse> {
    if (this.api) {
      return apiRequest<VPARequisitionResponse>(
        this.api, 'POST', '/vpa/v1/requisitionService', params,
      );
    }
    const requisitionId = params.requisitionId ?? uuid();
    const van = '4' + Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join('');
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    const response: VPARequisitionResponse = {
      requisitionId,
      accountNumber: van,
      expiryDate: `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
      status: 'active',
      createdAt: isoNow(),
    };
    this.store.requisitions.set(requisitionId, response);
    return response;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VPAService — main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VPAService — Visa B2B Virtual Account Payment
 *
 * Access five sub-services as named properties:
 *
 * ```ts
 * // Sandbox simulation (no credentials required)
 * const vpa = VPAService.sandbox();
 *
 * // Live — connected to Visa sandbox / certification
 * const vpa = VPAService.live({
 *   baseUrl: 'https://sandbox.api.visa.com',
 *   credentials: { userId: process.env.VISA_USER!, password: process.env.VISA_PWD! },
 *   cert: fs.readFileSync('./certs/cert.pem', 'utf-8'),
 *   key:  fs.readFileSync('./certs/privateKey-....pem', 'utf-8'),
 *   ca:   caBundle,
 * });
 *
 * const buyer    = await vpa.Buyer.createBuyer({ clientId, messageId, ... });
 * const funding  = await vpa.FundingAccount.addFundingAccount({ clientId, buyerId, ... });
 * const pool     = await vpa.ProxyPool.createProxyPool({ clientId, buyerId, ... });
 * const supplier = await vpa.Supplier.createSupplier({ clientId, ... });
 * const payment  = await vpa.Payment.processPayment({ clientId, buyerId, supplierId, ... });
 * ```
 */
export class VPAService {
  /** Buyer profile and template management */
  readonly Buyer: BuyerManagementService;
  /** Funding account, virtual account, and payment controls */
  readonly FundingAccount: FundingAccountService;
  /** Pre-provisioned virtual account pool management */
  readonly ProxyPool: ProxyPoolService;
  /** Supplier registry and account model management */
  readonly Supplier: SupplierService;
  /** Payment instructions and requisitions */
  readonly Payment: PaymentService;

  private readonly store: SandboxStore;

  constructor(apiConfig?: VPAApiConfig) {
    this.store = createStore();
    const api = apiConfig ?? null;
    this.Buyer          = new BuyerManagementService(this.store, api);
    this.FundingAccount = new FundingAccountService(this.store, api);
    this.ProxyPool      = new ProxyPoolService(this.store, api);
    this.Supplier       = new SupplierService(this.store, api);
    this.Payment        = new PaymentService(this.store, api);
  }

  /** Create an in-memory sandbox instance (no credentials required). */
  static sandbox(): VPAService {
    return new VPAService();
  }

  /** Create a live instance connected to the Visa VPA API. */
  static live(config: VPAApiConfig): VPAService {
    return new VPAService(config);
  }
}
