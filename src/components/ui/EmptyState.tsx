import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="rounded-full bg-white/5 p-4 text-gray-400">
        <Icon name={icon} size={28} />
      </div>
      <h2 className="text-lg font-medium text-gray-200">{title}</h2>
      {description && <p className="max-w-sm text-sm text-gray-400">{description}</p>}
      {action}
    </div>
  )
}
