import type { Item } from '../api'

interface ItemListProps {
  items: Item[]
  onDelete: (id: number) => void
}

export default function ItemList({ items, onDelete }: ItemListProps) {
  if (items.length === 0) {
    return <p>Nenhum item cadastrado.</p>
  }

  return (
    <section>
      <h2>{items.length} {items.length === 1 ? 'item' : 'itens'}</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span>
              {item.name}
              <small>{new Date(item.created_at).toLocaleString('pt-BR')}</small>
            </span>
            <button onClick={() => onDelete(item.id)}>Remover</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
