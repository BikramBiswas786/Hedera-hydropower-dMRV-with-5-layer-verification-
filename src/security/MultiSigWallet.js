'use strict';

/**
 * Multi-Signature Wallet for REC Minting
 * ════════════════════════════════════════════════════════════════
 * Requires 2-of-3 signatures for critical operations
 */

class MultiSigWallet {
  constructor(signers) {
    this.signers = signers; // [owner, auditor, regulator]
    this.threshold = 2;
    this.pendingTransactions = new Map();
  }

  /**
   * Propose REC minting transaction
   */
  proposeMint(amount, attestationId, proposer) {
    const txId = `TX-${Date.now()}`;
    
    this.pendingTransactions.set(txId, {
      type: 'MINT_REC',
      amount,
      attestationId,
      proposer,
      signatures: [proposer],
      createdAt: new Date().toISOString(),
      status: 'pending'
    });

    return { txId, status: 'pending', signaturesNeeded: this.threshold - 1 };
  }

  /**
   * Sign pending transaction
   */
  sign(txId, signer) {
    const tx = this.pendingTransactions.get(txId);
    
    if (!tx) {
      throw new Error('Transaction not found');
    }

    if (!this.signers.includes(signer)) {
      throw new Error('Unauthorized signer');
    }

    if (tx.signatures.includes(signer)) {
      throw new Error('Already signed');
    }

    tx.signatures.push(signer);

    // Check if threshold met
    if (tx.signatures.length >= this.threshold) {
      tx.status = 'approved';
      return { status: 'approved', canExecute: true };
    }

    return { status: 'pending', signaturesNeeded: this.threshold - tx.signatures.length };
  }

  /**
   * Execute approved transaction
   */
  execute(txId) {
    const tx = this.pendingTransactions.get(txId);
    
    if (!tx) throw new Error('Transaction not found');
    if (tx.status !== 'approved') throw new Error('Not enough signatures');

    // Execute actual minting (mock)
    tx.status = 'executed';
    tx.executedAt = new Date().toISOString();

    return {
      success: true,
      txId,
      amount: tx.amount,
      signatures: tx.signatures
    };
  }
}

module.exports = { MultiSigWallet };
