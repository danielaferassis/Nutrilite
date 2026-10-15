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
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          {item.name}
          <button onClick={() => onDelete(item.id)}>Remover</button>
        </li>
      ))}
    </ul>
  )
}
