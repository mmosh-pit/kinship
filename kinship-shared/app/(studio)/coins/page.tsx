'use client'

import PageHeader from '@/components/PageHeader'
import { Card, EmptyState } from '@/components/UI'

export default function CoinsPage() {
  // Placeholder - will be connected to API
  const coinTypes: Array<{
    id: string
    name: string
    symbol: string
    description: string
    totalSupply: number
    inCirculation: number
  }> = []

  const transactions: Array<{
    id: string
    type: 'earn' | 'spend' | 'transfer'
    amount: number
    coinType: string
    timestamp: string
    description: string
  }> = []

  return (
    <>
      <PageHeader
        title="Coins"
        subtitle="Manage tokens and credits for your platform"
        action={
          <button className="bg-accent hover:bg-accent-dark text-white font-semibold px-5 py-2.5 rounded-full transition-colors flex items-center gap-2">
            <span className="text-lg">+</span>
            Create Coin Type
          </button>
        }
      />

      {/* Empty State */}
      {coinTypes.length === 0 && (
        <EmptyState
          icon="🪙"
          title="No coins configured"
          description="Create coin types to implement a token economy for your platform. Users can earn, spend, and trade coins based on their interactions."
          action={
            <button className="bg-accent hover:bg-accent-dark text-white font-semibold px-6 py-3 rounded-full transition-colors">
              + Create Coin Type
            </button>
          }
        />
      )}

      {/* Coin Types Grid */}
      {coinTypes.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {coinTypes.map((coin) => (
              <Card key={coin.id} hover className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center">
                    <span className="text-accent text-xl">🪙</span>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">{coin.name}</h3>
                    <span className="text-xs text-muted">{coin.symbol}</span>
                  </div>
                </div>
                <p className="text-sm text-muted line-clamp-2 mb-3">{coin.description}</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Total Supply</span>
                    <span className="text-white font-medium">
                      {coin.totalSupply.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">In Circulation</span>
                    <span className="text-white font-medium">
                      {coin.inCirculation.toLocaleString()}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Recent Transactions */}
          {transactions.length > 0 && (
            <>
              <h2 className="text-xl font-bold text-white mb-4">Recent Transactions</h2>
              <Card className="overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-card-border">
                      <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3">
                        Type
                      </th>
                      <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3">
                        Amount
                      </th>
                      <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3">
                        Description
                      </th>
                      <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-card-border last:border-0">
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded ${
                              tx.type === 'earn'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : tx.type === 'spend'
                                ? 'bg-red-500/15 text-red-400'
                                : 'bg-blue-500/15 text-blue-400'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-medium ${
                              tx.type === 'earn' ? 'text-emerald-400' : 'text-white'
                            }`}
                          >
                            {tx.type === 'earn' ? '+' : '-'}
                            {tx.amount} {tx.coinType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted">{tx.description}</td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {new Date(tx.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </>
      )}
    </>
  )
}
