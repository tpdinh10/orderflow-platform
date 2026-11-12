
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Boxes, ShoppingBag, PackagePlus, RefreshCcw, XCircle } from 'lucide-react'
import './style.css'

type Product = { id: number; name: string; price: string; stock_quantity: number }
type Item = { product_id: number; quantity: number; unit_price: string }
type Order = { id: number; status: string; created_at: string; items: Item[] }
type Tab = 'dashboard' | 'inventory' | 'orders'

const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch('/api' + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers }
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(typeof data.detail === 'string' ? data.detail : `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [cart, setCart] = useState<Record<number, number>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    const [p, o] = await Promise.all([
      api<Product[]>('/products'),
      api<Order[]>('/orders')
    ])
    setProducts(p)
    setOrders(o)
  }

  useEffect(() => { refresh().catch(e => setMessage(e.message)) }, [])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setMessage('')
    try {
      await fn()
      await refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const createProduct = () => run(async () => {
    await api('/products', {
      method: 'POST',
      body: JSON.stringify({ name, price: Number(price), stock_quantity: Number(stock) })
    })
    setName('')
    setPrice('')
    setStock('')
  })

  const placeOrder = () => run(async () => {
    const items = Object.entries(cart)
      .filter(([, quantity]) => quantity > 0)
      .map(([id, quantity]) => ({ product_id: Number(id), quantity }))
    await api('/orders', { method: 'POST', body: JSON.stringify({ items }) })
    setCart({})
  })

  const cancelOrder = (id: number) => run(() =>
    api(`/orders/${id}/cancel`, { method: 'POST' })
  )

  const count = products.length
  const units = products.reduce((sum, p) => sum + p.stock_quantity, 0)
  const active = orders.filter(o => o.status === 'confirmed').length
  const selected = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0)
  const pageTitle = { dashboard: 'Dashboard', inventory: 'Inventory', orders: 'Orders' }[activeTab]
  const pageDescription = {
    dashboard: 'Overview of products, stock, and orders.',
    inventory: 'Add products and create orders from available stock.',
    orders: 'Track confirmed and cancelled orders.'
  }[activeTab]

  const orderTable = (rows: Order[]) => (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Order</th><th>Date</th><th>Items</th>
            <th>Total</th><th>Status</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(o => (
            <tr key={o.id}>
              <td className="strong">#{o.id}</td>
              <td>{new Date(o.created_at).toLocaleString()}</td>
              <td>{o.items.reduce((sum, i) => sum + i.quantity, 0)}</td>
              <td>${o.items.reduce((sum, i) => sum + i.quantity * Number(i.unit_price), 0).toFixed(2)}</td>
              <td><span className={o.status === 'confirmed' ? 'pill' : 'pill low'}>{o.status}</span></td>
              <td>
                {o.status === 'confirmed' ? (
                  <button className="danger" disabled={busy} onClick={() => cancelOrder(o.id)}>
                    <XCircle size={14} /> Cancel
                  </button>
                ) : '—'}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="empty">No orders yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><Boxes size={25} /> OrderFlow</div>
        {(['dashboard', 'inventory', 'orders'] as Tab[]).map(tab => (
          <button
            key={tab}
            type="button"
            className={`nav ${activeTab === tab ? 'active' : ''}`}
            aria-current={activeTab === tab ? 'page' : undefined}
            onClick={() => { setActiveTab(tab); setMessage('') }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        <div className="sidefoot">Inventory &amp; Order Management<br />Portfolio Demo v1.0</div>
      </aside>

      <main>
        <header>
          <div>
            <span className="eyebrow">ORDERFLOW OPERATIONS</span>
            <h1>{pageTitle}</h1>
            <p>{pageDescription}</p>
          </div>
          <button className="secondary" onClick={() => run(refresh)} disabled={busy}>
            <RefreshCcw size={16} /> Refresh
          </button>
        </header>

        {message && <div className="alert" role="alert">{message}</div>}

        {activeTab === 'dashboard' && (
          <>
            <div className="stats">
              <div className="stat"><span>Products</span><strong>{count}</strong><PackagePlus /></div>
              <div className="stat"><span>Units in stock</span><strong>{units}</strong><Boxes /></div>
              <div className="stat"><span>Active orders</span><strong>{active}</strong><ShoppingBag /></div>
            </div>
            <section className="panel">
              <div className="panelhead"><h2>Recent orders</h2><p>Latest order activity</p></div>
              {orderTable([...orders].sort((a, b) => b.id - a.id).slice(0, 5))}
            </section>
          </>
        )}

        {activeTab === 'inventory' && (
          <section className="panel">
            <div className="panelhead"><h2>Product inventory</h2><p>Add products and review available stock</p></div>
            <form className="form" onSubmit={e => { e.preventDefault(); createProduct() }}>
              <input required placeholder="Product name" value={name} onChange={e => setName(e.target.value)} />
              <input required type="number" min="0" step="0.01" placeholder="Price ($)" value={price} onChange={e => setPrice(e.target.value)} />
              <input required type="number" min="0" step="1" placeholder="Initial stock" value={stock} onChange={e => setStock(e.target.value)} />
              <button disabled={busy}>+ Add product</button>
            </form>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr><th>ID</th><th>Product</th><th>Price</th><th>In stock</th><th>Add to order</th></tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id}>
                      <td>#{p.id}</td>
                      <td className="strong">{p.name}</td>
                      <td>${Number(p.price).toFixed(2)}</td>
                      <td><span className={p.stock_quantity > 0 ? 'pill' : 'pill low'}>{p.stock_quantity} available</span></td>
                      <td>
                        <input
                          className="qty"
                          aria-label={`Quantity for ${p.name}`}
                          type="number" min="0" max={p.stock_quantity} step="1"
                          value={cart[p.id] ?? 0}
                          onChange={e => setCart({ ...cart, [p.id]: Math.min(p.stock_quantity, Math.max(0, Math.floor(Number(e.target.value) || 0))) })}
                        />
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr><td colSpan={5} className="empty">No products yet. Add your first product above.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="actions">
              <span>{selected} items selected</span>
              <button disabled={busy || selected === 0} onClick={placeOrder}>Create order</button>
            </div>
          </section>
        )}

        {activeTab === 'orders' && (
          <section className="panel">
            <div className="panelhead"><h2>All orders</h2><p>View status, totals, and cancel confirmed orders</p></div>
            {orderTable([...orders].sort((a, b) => b.id - a.id))}
          </section>
        )}

        <footer>OrderFlow · FastAPI + PostgreSQL + React · Demo with synthetic data</footer>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)
