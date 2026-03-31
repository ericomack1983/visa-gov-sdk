import {
  SettlementParams,
  SettlementResult,
  SettlementState,
  PaymentMethod,
  PaymentMode,
  USDSettlementStep,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// SettlementService — Visa payment settlement state machine
//
// Supports two rails:
//   USD  — authorized → processing → settled          (~6s, 2s/step)
//   Card — authorized → processing → settled          (~6s, 2s/step)
//                       (CNP mode uses Straight-Through Processing labels)
// ─────────────────────────────────────────────────────────────────────────────

export const USD_STEP_DELAY_MS = 2000;

function generateTxHash(): string {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 64; i++) hash += chars[Math.floor(Math.random() * chars.length)];
  return hash;
}

/** Human-readable label for each settlement step. */
export function getStepLabel(step: string, paymentMode?: PaymentMode): string {
  if (paymentMode === 'cnp') {
    switch (step) {
      case 'authorized': return 'Initiating Straight-Through Processing…';
      case 'processing': return 'Executing payment via Visa STP…';
      case 'settled':    return 'Payment Executed — funds transferred instantly';
    }
  }
  switch (step) {
    case 'authorized': return 'Sending card number to supplier…';
    case 'processing': return 'Supplier receiving via secure channel…';
    case 'settled':    return 'Supplier entered card at POS — funds credited';
    case 'submitted':  return 'Submitted to Visa Network';
    case 'confirmed':  return 'Confirmed on Chain';
    case 'idle':       return 'Ready';
    default:           return step;
  }
}

/**
 * SettlementSession
 *
 * Manages a single payment settlement through the Visa rails.
 * Drive it manually with `.advance()` or let `.run()` handle timing automatically.
 *
 * @example
 * ```ts
 * const session = service.initiate({ method: 'USD', orderId: 'ORD-001', amount: 48500 });
 *
 * // Manual step-by-step
 * console.log(session.getState()); // { currentStep: 'authorized', progress: 33 }
 * session.advance();
 * console.log(session.getState()); // { currentStep: 'processing', progress: 66 }
 *
 * // Or run fully automated
 * const result = await session.run();
 * console.log(result.txHash, result.settledAt);
 * ```
 */
export class SettlementSession {
  private state: SettlementState;
  private readonly amount: number;
  private readonly startTime: number;

  constructor(params: SettlementParams) {
    const isUSDLike = params.method === 'USD' || params.method === 'Card';
    this.amount    = params.amount;
    this.startTime = Date.now();
    this.state = {
      method:      params.method,
      orderId:     params.orderId,
      paymentMode: params.paymentMode,
      currentStep: 'authorized',
      progress:    33,
      startedAt:   new Date().toISOString(),
    };
  }

  /** Returns the current settlement state snapshot. */
  getState(): Readonly<SettlementState> {
    return this.state;
  }

  /** Returns a human-readable label for the current step. */
  getStepLabel(): string {
    return getStepLabel(this.state.currentStep, this.state.paymentMode);
  }

  /** Advance to the next settlement step. No-op if already settled. */
  advance(): SettlementState {
    if (this.state.currentStep === 'settled') return this.state;

    const { currentStep } = this.state;
    if (currentStep === 'authorized') {
      this.state = { ...this.state, currentStep: 'processing', progress: 66 };
    } else if (currentStep === 'processing') {
      this.state = { ...this.state, currentStep: 'settled', progress: 100 };
    }
    return this.state;
  }

  /** Reset to idle state. */
  reset(): void {
    this.state = {
      method: this.state.method,
      currentStep: 'idle' as USDSettlementStep,
      progress: 0,
      orderId: '',
    };
  }

  isSettled(): boolean {
    return this.state.currentStep === 'settled';
  }

  isActive(): boolean {
    return this.state.currentStep !== 'idle' && this.state.currentStep !== 'settled';
  }

  /**
   * Run the full settlement automatically, waiting `stepDelayMs` between steps.
   * Resolves with the final SettlementResult when settled.
   */
  async run(stepDelayMs?: number): Promise<SettlementResult> {
    const delay = stepDelayMs ?? USD_STEP_DELAY_MS;

    while (!this.isSettled()) {
      await new Promise((r) => setTimeout(r, delay));
      this.advance();
    }

    return {
      txHash:     this.state.txHash,
      orderId:    this.state.orderId,
      method:     this.state.method,
      amount:     this.amount,
      settledAt:  new Date().toISOString(),
      durationMs: Date.now() - this.startTime,
    };
  }

  /**
   * Async generator — yields state after each step advance.
   * Useful for streaming progress to a UI or event bus.
   *
   * @example
   * ```ts
   * for await (const state of session.stream()) {
   *   console.log(`${state.progress}% — ${state.currentStep}`);
   * }
   * ```
   */
  async *stream(stepDelayMs?: number): AsyncGenerator<SettlementState> {
    const delay = stepDelayMs ?? USD_STEP_DELAY_MS;

    yield this.state; // emit initial state (33%)
    while (!this.isSettled()) {
      await new Promise((r) => setTimeout(r, delay));
      yield this.advance();
    }
  }
}

/**
 * SettlementService
 *
 * Factory for SettlementSession instances.
 *
 * @example
 * ```ts
 * const service = new SettlementService();
 * const session = service.initiate({ method: 'USD', orderId: 'ORD-002', amount: 12000 });
 * const result  = await session.run();
 * console.log('Settled:', result);
 * ```
 */
export class SettlementService {
  /**
   * Initiate a new settlement session.
   * Returns a SettlementSession you can drive manually or run automatically.
   */
  initiate(params: SettlementParams): SettlementSession {
    return new SettlementSession(params);
  }

  /** Get the label for any step/mode combination without creating a session. */
  getStepLabel(step: string, paymentMode?: PaymentMode): string {
    return getStepLabel(step, paymentMode);
  }

  /** Shorthand: run a full settlement and return the result. */
  async settle(params: SettlementParams, stepDelayMs?: number): Promise<SettlementResult> {
    return this.initiate(params).run(stepDelayMs);
  }
}
