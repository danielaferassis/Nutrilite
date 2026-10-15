import { useEffect, useState, type FormEvent } from 'react'
import { api, type Item } from './api'
import { logger } from './logger'
import ItemList from './components/ItemList'

export default function App() {
  const [status, setStatus] = useState('verificando...')
  const [items, setItems] = useState<Item[]>([])
  const [name, setName] = useState('')

  useEffect(() => {
    api.health()
      .then((data) => setStatus(data.status))
      .catch(() => {
        logger.warn('API indisponível')
        setStatus('offline')
      })
    api.listItems()
      .then(setItems)
      .catch((error) => logger.error('Erro ao carregar itens', error))
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    const item = await api.createItem({ name })
    logger.info(`Item ${item.id} criado`)
    setItems([...items, item])
    setName('')
  }

  async function handleDelete(id: number) {
    await api.deleteItem(id)
    logger.info(`Item ${id} removido`)
    setItems(items.filter((item) => item.id !== id))
  }

  return (
    <main>
      <h1>Nutrilite</h1>
      <p>API: <strong>{status}</strong></p>

      <form onSubmit={handleSubmit}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Novo item" />
        <button type="submit">Adicionar</button>
      </form>

      <ItemList items={items} onDelete={handleDelete} />
    </main>
  )
}
