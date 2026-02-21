/**
 * Carbon Credit Marketplace
 * 
 * PURPOSE: Price discovery, order matching, marketplace API
 * REVENUE: Enables Stream 2 (Premium) + Stream 7 (Arbitrage)
 */

class CarbonMarketplace {
  constructor(verraIntegration, goldStandardIntegration) {
    this.verra = verraIntegration;
    this.goldStandard = goldStandardIntegration;
    
    this.orders = new Map();
    this.trades = [];
  }

  async getMarketPrices() {
    const [verraPrice, gsPrice] = await Promise.all([
      this.verra.getCurrentPrice().catch(() => null),
      this.goldStandard.getCurrentPrice().catch(() => null)
    ]);

    const prices = [];
    if (verraPrice) prices.push(verraPrice);
    if (gsPrice) prices.push(gsPrice);

    const avgPrice = prices.length > 0
      ? prices.reduce((sum, p) => sum + p.price_per_tco2e, 0) / prices.length
      : 15.50;

    return {
      timestamp: new Date().toISOString(),
      markets: prices,
      average: {
        currency: 'USD',
        price_per_tco2e: parseFloat(avgPrice.toFixed(2)),
        price_inr_per_tco2e: parseFloat((avgPrice * 83).toFixed(2))
      },
      esg_premium: {
        base_multiplier: 1.10,
        range: '10-15%',
        note: 'Blockchain-verified credits command premium pricing'
      }
    };
  }

  calculateESGPremium(credit, buyerProfile = {}) {
    const basePrice = 15.50;
    let premiumMultiplier = 1.0;

    if (buyerProfile.esg_focused) {
      premiumMultiplier = 1.10;
    }

    if (credit.metadata && credit.metadata.trust_score >= 0.95) {
      premiumMultiplier += 0.05;
    }

    if (credit.hedera_transaction_id && !credit.hedera_transaction_id.startsWith('mock')) {
      premiumMultiplier += 0.03;
    }

    const finalPrice = basePrice * premiumMultiplier;

    return {
      base_price_usd: basePrice,
      base_price_inr: basePrice * 83,
      premium_multiplier: parseFloat(premiumMultiplier.toFixed(2)),
      final_price_usd: parseFloat(finalPrice.toFixed(2)),
      final_price_inr: parseFloat((finalPrice * 83).toFixed(2)),
      premium_percentage: parseFloat(((premiumMultiplier - 1) * 100).toFixed(1)),
      factors: {
        esg_buyer: buyerProfile.esg_focused ? '+10%' : '0%',
        high_trust_score: credit.metadata?.trust_score >= 0.95 ? '+5%' : '0%',
        blockchain_verified: credit.hedera_transaction_id && !credit.hedera_transaction_id.startsWith('mock') ? '+3%' : '0%'
      }
    };
  }

  async createSellOrder(tenantId, creditId, quantity_tco2e, asking_price_per_tco2e) {
    const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    const order = {
      id: orderId,
      type: 'sell',
      tenant_id: tenantId,
      credit_id: creditId,
      quantity_tco2e,
      asking_price_per_tco2e,
      total_value_usd: parseFloat((quantity_tco2e * asking_price_per_tco2e).toFixed(2)),
      total_value_inr: parseFloat((quantity_tco2e * asking_price_per_tco2e * 83).toFixed(2)),
      status: 'open',
      created_at: new Date().toISOString()
    };

    this.orders.set(orderId, order);

    return {
      success: true,
      order
    };
  }

  async executeTrade(orderId, buyerTenantId) {
    const order = this.orders.get(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'open') {
      throw new Error('Order not available');
    }

    order.status = 'completed';
    order.buyer_tenant_id = buyerTenantId;
    order.completed_at = new Date().toISOString();

    const trade = {
      trade_id: `TRADE-${Date.now()}`,
      order_id: orderId,
      seller_tenant_id: order.tenant_id,
      buyer_tenant_id: buyerTenantId,
      credit_id: order.credit_id,
      quantity_tco2e: order.quantity_tco2e,
      price_per_tco2e: order.asking_price_per_tco2e,
      total_value_usd: order.total_value_usd,
      total_value_inr: order.total_value_inr,
      timestamp: order.completed_at
    };

    this.trades.push(trade);
    this.orders.set(orderId, order);

    return {
      success: true,
      trade
    };
  }

  getOrderBook() {
    const openOrders = Array.from(this.orders.values())
      .filter(o => o.status === 'open')
      .sort((a, b) => a.asking_price_per_tco2e - b.asking_price_per_tco2e);

    return {
      total_orders: openOrders.length,
      total_quantity_tco2e: openOrders.reduce((sum, o) => sum + o.quantity_tco2e, 0),
      orders: openOrders.map(o => ({
        order_id: o.id,
        quantity_tco2e: o.quantity_tco2e,
        price_per_tco2e: o.asking_price_per_tco2e,
        total_value_usd: o.total_value_usd,
        created_at: o.created_at
      }))
    };
  }
}

module.exports = { CarbonMarketplace };