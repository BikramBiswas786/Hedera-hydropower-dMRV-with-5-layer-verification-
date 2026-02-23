'use strict';

/**
 * Tests for src/hedera/retry.js
 * ─────────────────────────────────────────────────────────────────
 * Verifies the root-cause fix for Issue #1: TRANSACTION_EXPIRED on
 * token mint.
 *
 * Key assertion (test 2): when the first attempt fails with
 * TRANSACTION_EXPIRED, buildFn is called AGAIN on the retry, proving
 * a fresh Transaction object (with a new ID and valid window) is used —
 * not a re-execute of the original expired transaction.
 */

describe('executeWithRetry — Hedera fresh-transaction retry helper', () => {
  let executeWithRetry;

  beforeEach(() => {
    jest.resetModules();
    ({ executeWithRetry } = require('../src/hedera/retry'));
  });

  const mockClient = {};

  /** Helper: create the TRANSACTION_EXPIRED error that testnet throws */
  function expiredError() {
    return new Error('TRANSACTION_EXPIRED: transaction has expired');
  }

  /** Helper: build a mock transaction that succeeds */
  function successTx(mockResponse) {
    return {
      setTransactionValidDuration: jest.fn().mockReturnThis(),
      setRegenerateTransactionId:  jest.fn().mockReturnThis(),
      freezeWith: jest.fn().mockReturnThis(),
      execute:    jest.fn().mockResolvedValue(mockResponse)
    };
  }

  // ─── Test 1 ────────────────────────────────────────────────────
  test('succeeds on first attempt — buildFn called once, no retry', async () => {
    const receipt  = { status: 'SUCCESS' };
    const response = { transactionId: { toString: () => '0.0.1@1.0' }, getReceipt: async () => receipt };
    const buildFn  = jest.fn(() => successTx(response));

    const result = await executeWithRetry(buildFn, mockClient);

    expect(result.attempt).toBe(1);
    expect(result.receipt).toBe(receipt);
    expect(result.response).toBe(response);
    expect(buildFn).toHaveBeenCalledTimes(1);
  });

  // ─── Test 2 — THE KEY FIX TEST ──────────────────────────────────
  test(
    'TRANSACTION_EXPIRED on attempt 1 → buildFn called again → fresh tx succeeds on attempt 2',
    async () => {
      const receipt  = { status: 'SUCCESS' };
      const response = { transactionId: { toString: () => '0.0.2@2.0' }, getReceipt: async () => receipt };

      let callIndex = 0;
      const buildFn = jest.fn(() => {
        callIndex++;
        // First tx: execute throws TRANSACTION_EXPIRED
        // Second tx: execute resolves (fresh ID, valid window)
        const tx = {
          setTransactionValidDuration: jest.fn().mockReturnThis(),
          setRegenerateTransactionId:  jest.fn().mockReturnThis(),
          freezeWith: jest.fn().mockReturnThis(),
          execute: jest.fn().mockImplementation(() =>
            callIndex === 1
              ? Promise.reject(expiredError())
              : Promise.resolve(response)
          )
        };
        return tx;
      });

      const result = await executeWithRetry(
        buildFn, mockClient, { maxAttempts: 3, baseDelayMs: 0 }
      );

      expect(result.attempt).toBe(2);
      // ↑ CRITICAL: buildFn must have been called twice — once for the
      //   expired tx, once for the fresh replacement.
      expect(buildFn).toHaveBeenCalledTimes(2);
    }
  );

  // ─── Test 3 ────────────────────────────────────────────────────
  test('exhausts maxAttempts — throws after 3 TRANSACTION_EXPIRED failures', async () => {
    const buildFn = jest.fn(() => ({
      setTransactionValidDuration: jest.fn().mockReturnThis(),
      setRegenerateTransactionId:  jest.fn().mockReturnThis(),
      freezeWith: jest.fn().mockReturnThis(),
      execute:    jest.fn().mockRejectedValue(expiredError())
    }));

    await expect(
      executeWithRetry(buildFn, mockClient, { maxAttempts: 3, baseDelayMs: 0 })
    ).rejects.toThrow('TRANSACTION_EXPIRED');

    // All 3 attempts were made — each got a fresh tx
    expect(buildFn).toHaveBeenCalledTimes(3);
  });

  // ─── Test 4 ────────────────────────────────────────────────────
  test('non-expired errors (e.g. UNAUTHORIZED) fail fast — no retry', async () => {
    const buildFn = jest.fn(() => ({
      setTransactionValidDuration: jest.fn().mockReturnThis(),
      setRegenerateTransactionId:  jest.fn().mockReturnThis(),
      freezeWith: jest.fn().mockReturnThis(),
      execute:    jest.fn().mockRejectedValue(new Error('UNAUTHORIZED'))
    }));

    await expect(
      executeWithRetry(buildFn, mockClient, { maxAttempts: 3, baseDelayMs: 0 })
    ).rejects.toThrow('UNAUTHORIZED');

    // Must fail after exactly 1 attempt — no retry for non-expired errors
    expect(buildFn).toHaveBeenCalledTimes(1);
  });
});
