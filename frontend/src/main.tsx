
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Boxes, ShoppingBag, PackagePlus, RefreshCcw, XCircle } from 'lucide-react'
import './style.css'

type Product = { id: number; name: string; price: string; stock_quantity: number }
type Item = { product_id: number; quantity: number; unit_price: string }
type Order = { id: number; status: string; created_at: string; items: Item[] }
type Tab = 'dashboard' | 'inventory' | 'orders'
type Account = { id: number; email: string; role: 'admin' | 'staff' }

let accessToken: string | null = null
const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch('/api' + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...init?.headers }
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(typeof data.detail === 'string' ? data.detail : `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

function App() {
  const [account, setAccount] = useState<Account | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [cart, setCart] = useState<Record<number, number>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [stockId, setStockId] = useState<number | null>(null)
  const [stockChange, setStockChange] = useState('')

  const refresh = async () => {
    const [p, o] = await Promise.all([
      api<Product[]>('/products'),
      api<Order[]>('/orders')
    ])
    setProducts(p)
    setOrders(o)
  }

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthBusy(true)
    setMessage('')
    try {
      const body = new URLSearchParams({ username: email, password })
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Login failed')
      accessToken = data.access_token
      const user = await api<Account>('/auth/me')
      setAccount(user)
      setPassword('')
      await refresh()
    } catch (err) {
      accessToken = null
      setAccount(null)
      setMessage(err instanceof Error ? err.message : 'Login failed')
    } finally { setAuthBusy(false) }
  }

  const logout = () => {
    accessToken = null
    setAccount(null)
    setProducts([])
    setOrders([])
    setCart({})
    setMessage('')
  }


  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setMessage('')
    try {
      await fn()
      await refresh()
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      if (errorMessage.includes('401') || errorMessage.includes('credentials')) logout()
      setMessage(errorMessage)
    } finally {
      setBusy(false)
    }
  }

  const createProduct = () => run(async () => {
    const duplicate = products.find(p => p.name.trim().toLowerCase() === name.trim().toLowerCase())
    if (duplicate && !window.confirm(`A product named "${duplicate.name}" already exists (ID #${duplicate.id}). Create another product anyway? To restock, use + Stock instead.`)) return
    await api('/products', {
      method: 'POST',
      body: JSON.stringify({ name, price: Number(price), stock_quantity: Number(stock) })
    })
    setName('')
    setPrice('')
    setStock('')
  })

  const startEdit = (p: Product) => {
    setEditingId(p.id)
    setEditName(p.name)
    setEditPrice(String(p.price))
    setStockId(null)
    setMessage('')
  }

  const saveEdit = (id: number) => run(async () => {
    const duplicate = products.find(p => p.id !== id && p.name.trim().toLowerCase() === editName.trim().toLowerCase())
    if (duplicate && !window.confirm(`Another product already uses the name "${duplicate.name}". Save anyway?`)) return
    await api(`/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: editName.trim(), price: Number(editPrice) })
    })
    setEditingId(null)
  })

  const addStock = (id: number) => run(async () => {
    const quantity = Number(stockChange)
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      setMessage('Enter a positive whole number to add stock.')
      return
    }
    await api(`/products/${id}/inventory`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity_change: quantity })
    })
    setStockId(null)
    setStockChange('')
  })

  const deleteProduct = (p: Product) => {
    if (!window.confirm(`Delete "${p.name}" (ID #${p.id})? This cannot be undone. Products referenced by orders may not be deletable.`)) return
    run(async () => {
      await api(`/products/${p.id}`, { method: 'DELETE' })
      setCart(current => { const next = { ...current }; delete next[p.id]; return next })
      if (editingId === p.id) setEditingId(null)
      if (stockId === p.id) setStockId(null)
    })
  }

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
    inventory: 'Manage products, restock inventory, and create orders.',
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
              <td>
                <button
                  type="button"
                  className="order-link"
                  onClick={() => setSelectedOrder(o)}
                >
                  #{o.id}
                </button>
              </td>
              <td>{new Date(o.created_at).toLocaleString()}</td>
              <td>{o.items.reduce((sum, i) => sum + i.quantity, 0)}</td>
              <td>${o.items.reduce((sum, i) => sum + i.quantity * Number(i.unit_price), 0).toFixed(2)}</td>
              <td><span className={o.status === 'confirmed' ? 'pill' : 'pill low'}>{o.status}</span></td>
              <td>
                {o.status === 'confirmed' && account?.role === 'admin' ? (
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

  if (!account) return (
    <div className="login-page">
      <form className="login-card" onSubmit={login}>
        <div className="login-brand"><Boxes size={27} /> OrderFlow</div>
        <h1>Sign in</h1>
        <p>Inventory &amp; Order Management</p>
        {message && <div className="alert" role="alert">{message}</div>}
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        <button disabled={authBusy} type="submit">{authBusy ? 'Signing in…' : 'Sign in'}</button>
        <small>Demo account must be created by an administrator.</small>
      </form>
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
        <div className="sidefoot">Signed in: {account.email}<br />Role: {account.role}<br /><button type="button" className="logout" onClick={logout}>Sign out</button><br />Inventory &amp; Order Management<br />Portfolio Demo v1.0</div>
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
            {account.role === 'admin' && <form className="form" onSubmit={e => { e.preventDefault(); createProduct() }}>
              <input required placeholder="Product name" value={name} onChange={e => setName(e.target.value)} />
              <input required type="number" min="0" step="0.01" placeholder="Price ($)" value={price} onChange={e => setPrice(e.target.value)} />
              <input required type="number" min="0" step="1" placeholder="Initial stock" value={stock} onChange={e => setStock(e.target.value)} />
              <button disabled={busy}>+ Add product</button>
            </form>}
            <div className="tablewrap">
              <table>
                <thead>
                  <tr><th>ID</th><th>Product</th><th>Price</th><th>In stock</th><th>Add to order</th>{account.role === 'admin' && <th>Manage</th>}</tr>
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
                      {account.role === 'admin' && <td>
                        <div className="manage-buttons">
                          <button type="button" className="secondary" disabled={busy} onClick={() => { setStockId(stockId === p.id ? null : p.id); setStockChange(''); setEditingId(null); setMessage('') }}>+ Stock</button>
                          <button type="button" className="secondary" disabled={busy} onClick={() => startEdit(p)}>Edit</button>
                          <button type="button" className="danger" disabled={busy} onClick={() => deleteProduct(p)}>Delete</button>
                        </div>
                      </td>}
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr><td colSpan={account.role === 'admin' ? 6 : 5} className="empty">No products yet. Add your first product above.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {account.role === 'admin' && stockId !== null && <form className="inventory-editor" onSubmit={e => { e.preventDefault(); addStock(stockId) }}>
              <h3>Restock: {products.find(p => p.id === stockId)?.name}</h3>
              <p>Enter the number of units to add to existing stock.</p>
              <div className="editor-controls">
                <input aria-label="Units to add" required type="number" min="1" step="1" placeholder="Units to add" value={stockChange} onChange={e => setStockChange(e.target.value)} />
                <button disabled={busy} type="submit">Save stock</button>
                <button type="button" className="secondary" onClick={() => setStockId(null)}>Cancel</button>
              </div>
            </form>}
            {account.role === 'admin' && editingId !== null && <form className="inventory-editor" onSubmit={e => { e.preventDefault(); saveEdit(editingId) }}>
              <h3>Edit product #{editingId}</h3>
              <div className="editor-controls">
                <input aria-label="Edit product name" required value={editName} onChange={e => setEditName(e.target.value)} />
                <input aria-label="Edit product price" required type="number" min="0" step="0.01" value={editPrice} onChange={e => setEditPrice(e.target.value)} />
                <button disabled={busy} type="submit">Save changes</button>
                <button type="button" className="secondary" onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </form>}
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
        {selectedOrder && (
          <div
            className="modal-overlay"
            onClick={() => setSelectedOrder(null)}
          >
            <div
              className="modal-content"
              role="dialog"
              aria-modal="true"
              aria-label={`Order ${selectedOrder.id} details`}
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2>Order #{selectedOrder.id}</h2>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setSelectedOrder(null)}
                >
                  Close
                </button>
              </div>

              <p>
                Status: {selectedOrder.status}
              </p>

              <p>
                Created: {new Date(selectedOrder.created_at).toLocaleString()}
              </p>

              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>

                  <tbody>
                    {selectedOrder.items.map(item => (
                      <tr key={item.product_id}>
                        <td>
                          {products.find(p => p.id === item.product_id)?.name
                            ?? `Product #${item.product_id}`}
                        </td>
                        <td>{item.quantity}</td>
                        <td>${Number(item.unit_price).toFixed(2)}</td>
                        <td>
                          ${(item.quantity * Number(item.unit_price)).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3>
                Total: $
                {selectedOrder.items
                  .reduce(
                    (sum, item) =>
                      sum + item.quantity * Number(item.unit_price),
                    0
                  )
                  .toFixed(2)}
              </h3>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)
