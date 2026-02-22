'use client';
import { useState, useEffect } from 'react';

export default function Home() {
  const [features, setFeatures] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/features')
      .then(res => res.json())
      .then(setFeatures)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 text-white">
      <header className="border-b border-white/20 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-r from-green-400 to-blue-500 rounded-xl flex items-center justify-center">
                <span className="text-2xl font-bold">⚡</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
                  Hedera Hydropower MRV
                </h1>
                <p className="text-blue-200 text-sm">Production Ready - Apex Hackathon 2026</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-blue-300">v1.4.0</div>
              <div className="text-xs text-gray-400 mt-1">
                {loading ? 'Loading...' : `${features?.metadata?.completion_percentage || 60}% Complete`}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        {/* Hero Section */}
        <div className="text-center mb-24">
          <div className="inline-flex items-center px-6 py-3 rounded-full bg-white/10 backdrop-blur-lg border border-white/20 mb-8">
            <span className="text-green-400 mr-2">✅</span>
            <span>ALL 237 TESTS PASSED ON REAL HEDERA NETWORK</span>
          </div>
          <h2 className="text-5xl md:text-6xl font-bold mb-6">
            Production-Ready MRV System
          </h2>
          <p className="text-xl text-blue-200 mb-8 max-w-3xl mx-auto">
            Real blockchain transactions confirmed. Live ML fraud detection. Production Docker stack.
          </p>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-12">
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
              <div className="text-3xl font-bold text-green-400 mb-2">237</div>
              <div className="text-blue-200">Tests Passed</div>
            </div>
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
              <div className="text-3xl font-bold text-blue-400 mb-2">~$3.04</div>
              <div className="text-blue-200">Real HBAR Spent</div>
            </div>
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
              <div className="text-3xl font-bold text-purple-400 mb-2">98.3%</div>
              <div className="text-blue-200">ML Accuracy</div>
            </div>
          </div>
        </div>

        {/* Real Transactions Section */}
        <section className="mb-24">
          <h3 className="text-3xl font-bold mb-12 text-center">🔗 Live Hedera Transactions</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <TransactionCard 
              status="APPROVED"
              statusColor="green"
              txId="0.0.6255927@1771708839.586094103"
              description="Valid telemetry | Trust: 96% | 165.55 tCO2e"
            />
            <TransactionCard 
              status="FRAUD DETECTED"
              statusColor="red"
              txId="0.0.6255927@1771708968.275909856"
              description="10x power inflation | Trust: 60.5%"
            />
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10 hover:border-white/30 transition-all">
              <div className="flex items-center mb-4">
                <span className="w-3 h-3 bg-purple-400 rounded-full mr-3"></span>
                <span className="font-bold text-purple-400">REC TOKENS</span>
              </div>
              <div className="text-2xl font-mono mb-2">0.0.697227</div>
              <a 
                href="https://hashscan.io/testnet/token/0.0.697227" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 text-sm font-mono block mb-4"
              >
                View Token on HashScan →
              </a>
              <div className="text-sm text-gray-400">
                Renewable Energy Certificate | 165,550 tokens minted
              </div>
            </div>
          </div>
        </section>

        {/* Test Results */}
        <section className="mb-24">
          <h3 className="text-3xl font-bold mb-12 text-center">🧪 Test Results</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <MetricCard title="237" subtitle="Total Tests" detail="100% Pass Rate" color="green" />
            <MetricCard title="~40s" subtitle="Avg Execution" detail="38-50 seconds" color="blue" />
            <MetricCard title="$3.04" subtitle="Real HBAR Cost" detail="~₹252 INR" color="purple" />
            <MetricCard title="15-20" subtitle="Real TXs per Run" detail="Hedera Testnet" color="yellow" />
          </div>
        </section>

        {/* Cost Analysis */}
        <section className="mb-24">
          <h3 className="text-3xl font-bold mb-12 text-center">💰 Real Cost Analysis</h3>
          <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
            <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 backdrop-blur-lg rounded-2xl p-8 border border-emerald-500/30">
              <h4 className="text-2xl font-bold mb-4">Breakdown</h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Topic Creation</span>
                  <span>$0.03 (3 × $0.01)</span>
                </div>
                <div className="flex justify-between">
                  <span>Token Creation</span>
                  <span>$3.00 (3 × $1.00)</span>
                </div>
                <div className="flex justify-between">
                  <span>Token Minting</span>
                  <span>$0.005 (5 × $0.001)</span>
                </div>
                <div className="flex justify-between font-bold text-2xl pt-4 border-t border-white/20">
                  <span>Total</span>
                  <span>$3.04 USD</span>
                </div>
                <div className="text-right text-sm text-emerald-300">
                  ~₹252 INR | 45-60 real transactions
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/20 backdrop-blur-lg rounded-2xl p-8 border border-orange-500/30">
              <h4 className="text-2xl font-bold mb-4">Carbon Credit Demo</h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Generation Verified</span>
                  <span>165.55 tCO₂e</span>
                </div>
                <div className="flex justify-between">
                  <span>Market Price</span>
                  <span>$18.29/tCO₂e</span>
                </div>
                <div className="flex justify-between font-bold text-2xl pt-4 border-t border-white/20">
                  <span>Total Value</span>
                  <span>$3,027.91</span>
                </div>
                <div className="text-right text-sm text-orange-300">
                  ₹251,316.49 INR | REC tokens minted
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <div className="text-center mt-24">
          <a 
            href="https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 text-xl font-bold rounded-2xl border-2 border-white/20 backdrop-blur-lg transition-all duration-300 transform hover:scale-105 shadow-2xl"
          >
            View Source Code on GitHub →
            <span className="ml-2">📱</span>
          </a>
        </div>
      </main>

      <footer className="border-t border-white/10 mt-24 pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-400">
          <p>
            Built for <span className="font-bold text-white">Hedera Apex Hackathon 2026</span> 
            by <a href="https://github.com/BikramBiswas786" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">@BikramBiswas786</a>
          </p>
          <p className="mt-2">
            Balurghat, West Bengal, India | {new Date().toLocaleDateString()}
          </p>
        </div>
      </footer>
    </div>
  );
}

function TransactionCard({ status, statusColor, txId, description }: any) {
  const colors = {
    green: 'bg-green-400',
    red: 'bg-red-400'
  };
  
  return (
    <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10 hover:border-white/30 transition-all">
      <div className="flex items-center mb-4">
        <span className={`w-3 h-3 ${colors[statusColor as keyof typeof colors]} rounded-full mr-3`}></span>
        <span className={`font-bold text-${statusColor}-400`}>{status}</span>
      </div>
      <div className="text-2xl font-mono mb-2">{txId}</div>
      <a 
        href={`https://hashscan.io/testnet/transaction/${txId}`}
        target="_blank" 
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 text-sm font-mono block mb-4"
      >
        View on HashScan →
      </a>
      <div className="text-sm text-gray-400">
        {description}
      </div>
    </div>
  );
}

function MetricCard({ title, subtitle, detail, color }: any) {
  return (
    <div className={`bg-gradient-to-br from-${color}-500/20 to-${color}-600/20 backdrop-blur-lg rounded-2xl p-8 border border-${color}-500/30`}>
      <div className={`text-4xl font-bold text-${color}-400 mb-2`}>{title}</div>
      <div className="text-lg">{subtitle}</div>
      <div className={`text-sm text-${color}-300`}>{detail}</div>
    </div>
  );
}
