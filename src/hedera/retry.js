'use strict';

/**
 * executeWithRetry — Hedera transaction retry helper
 * ─────────────────────────────────────────────────
 * Fixes Issue #1: TRANSACTION_EXPIRED on token mint.
 *
 * ROOT CAUSE
 * ----------
 * Every Hedera Transaction has a unique ID derived from the operator
 * account + the moment the SDK object is created. The transaction is
 * only valid for `setTransactionValidDuration` seconds from that moment
 * (default 120 s; we set 180 s).
 *
 * If you retry by calling `.execute()` a second time on the *same*
 * Transaction object, you reuse the original ID — which is now expired.
 * The network always returns TRANSACTION_EXPIRED on that retry.
 *
 * FIX
 * ---
 * Accept a *builder function* instead of a pre-built transaction.
 * We call buildTxFn() at the start of **every** attempt, so each retry
 * gets a brand-new transaction object with a fresh ID and valid window.
 *
 * USAGE
 * -----
 * const { receipt, response, attempt } = await executeWithRetry(
 *   () => new TokenMintTransaction()
 *         .setTokenId(tokenId)
 *         .setAmount(amount)
 *         .setMaxTransactionFee(new Hbar(2)),
 *   client,
 *   { maxAttempts: 3, baseDelayMs: 750 }
 * );
 */

let Status;
try {
  ({ Status } = require('@hashgraph/sdk'));
} catch {
  Status = null; // mock / test environment — graceful degradation
}

/**
 * @param {() => import('@hashgraph/sdk').Transaction} buildTxFn
 *   Factory called on EVERY attempt. Must return a NEW un-frozen Transaction.
 * @param {import('@hashgraph/sdk').Client} client
 * @param {{ maxAttempts?: number, baseDelayMs?: number }} [opts]
 * @returns {Promise<{ receipt: object, response: object, attempt: number }>}
 */
async function executeWithRetry(buildTxFn, client, opts = {}) {
  const { maxAttempts = 3, baseDelayMs = 750 } = opts;
  let lastError;

  // Resolve the SDK's TransactionExpired sentinel ONCE.
  // Guard: Status.TransactionExpired may be undefined in mock/test
  // environments. Without the guard,
  //   `undefined === undefined`  →  true
  // which would make EVERY error look like TRANSACTION_EXPIRED and
  // retry it — breaking fast-fail for UNAUTHORIZED, etc.
  const txExpiredStatus = Status?.TransactionExpired;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // ─── Build a FRESH transaction on every attempt ─────────────────
      // A new object → new transaction ID → new valid window.
      // The expired ID from the previous attempt is never reused.
      const tx = buildTxFn();

      // Belt-and-suspenders: extend valid window + ask SDK to regenerate
      // the ID if it detects expiry before submission.
      tx.setTransactionValidDuration(180);   // 3-minute window on testnet
      tx.setRegenerateTransactionId(true);   // SDK-level guard

      const frozen   = tx.freezeWith(client);
      const response = await frozen.execute(client);
      const receipt  = await response.getReceipt(client);

      return { receipt, response, attempt };
    } catch (err) {
      lastError = err;

      // Two-track check:
      //   1. Real SDK:  compare err.status against the SDK sentinel.
      //      Only valid when txExpiredStatus is defined (not in mock env).
      //   2. All envs:  fall back to the string in the error message.
      const isExpired =
        (txExpiredStatus !== undefined && err.status === txExpiredStatus) ||
        String(err.message || err).includes('TRANSACTION_EXPIRED');

      // Only TRANSACTION_EXPIRED is retryable — everything else is
      // deterministic (UNAUTHORIZED, INSUFFICIENT_TX_FEE, etc.) and
      // retrying won't help.
      if (!isExpired || attempt >= maxAttempts) {
        throw err;
      }

      const delay = baseDelayMs * attempt; // 750 ms → 1500 ms → 2250 ms
      console.warn(
        `[HEDERA RETRY] TRANSACTION_EXPIRED (attempt ${attempt}/${maxAttempts})` +
        ` — retrying in ${delay}ms with fresh transaction ID`
      );
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError;
}

module.exports = { executeWithRetry };
